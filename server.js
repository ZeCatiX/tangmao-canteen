// 唐猫庭院 - 生产环境服务器 v2
require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const userStorage = require('./user_storage');
const { generateToken, authMiddleware, softAuth, isTokenBlacklisted } = require('./auth');
const multer = require('multer');
const logger = require('./logger');
const db = require('./db');
const state = require('./server/state');

// 带 BOM 剥离的 JSON 文件读取
function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

// 信任一层反向代理(cloudflared 隧道/HTTPS 反代):req.ip 取 X-Forwarded-For 真实客户端,
// 否则 express-rate-limit 按 X-Forwarded-For 判 IP 失真(ERR_ERL_UNEXPECTED_X_FORWARDED_FOR,2026-10-11 隧道实测)。
// 生产部署仅经隧道/反代访问,不存在直连伪造面;本地开发无 XFF 头不受影响。
app.set('trust proxy', 1);

// ⚠️ 安全警告：检查 JWT_SECRET 是否使用默认值
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'tangmao_cat_court_jwt_secret_2026' || process.env.JWT_SECRET === 'tangmao_jwt_secret_2026_prod_replace_me' || process.env.JWT_SECRET === 'tm_jwt_8a3f9c2e7b1d4f6a0c8e2b4d6f0a1c3e5b7d9f0a2c4e6b8d0a2c4e6f8a0b2c4d6' || process.env.JWT_SECRET.length < 16) {
  console.error('❌ 安全错误: JWT_SECRET 使用默认值，请在 .env 中设置强随机密钥！');
  process.exit(1);
}
if (!process.env.ADMIN_PASS || process.env.ADMIN_PASS === 'admin123' || process.env.ADMIN_PASS === 'TangMaoAdmin2026!' || process.env.ADMIN_PASS === 'TangMaoAdmin2026_ChangeMe!' || process.env.ADMIN_PASS === 'TangMao@2026_Prod' || process.env.ADMIN_PASS === 'tm_admin_9f8a7b6c5d4e3f2a1b0c' || process.env.ADMIN_PASS.length < 8) {
  console.error('❌ 安全错误: 管理后台使用默认密码或密码强度不足，请在 .env 中设置长度 ≥ 8 位的强密码！');
  process.exit(1);
}
// 桌码签名密钥：缺失会退化成源码里公开的常量，任何人都能伪造桌码查看别桌账单
if (!process.env.TABLE_SECRET || process.env.TABLE_SECRET === 'tangmao-table-secret' || process.env.TABLE_SECRET.length < 16) {
  console.error('❌ 安全错误: TABLE_SECRET 未设置或强度不足（<16位），桌码可被伪造，请在 .env 中设置强随机密钥！');
  process.exit(1);
}

// ═══════════════════════════════════════════════
// 生产环境配置守卫
// 开发用的 .env 为方便测试把限流放得很宽（.env 里有注释说明），
// 部署时若整份带上去 = 暴力破解随便打。以 NODE_ENV=production 为开关校验，
// 配置不合格直接拒绝启动（fail-closed）。生产模板见 .env.production.example
// ═══════════════════════════════════════════════
if (process.env.NODE_ENV === 'production') {
  const rlMax = parseInt(process.env.RATE_LIMIT_MAX || '1000');
  const loginMax = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '30');
  const adminLoginMax = parseInt(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX || '30');
  const registerMax = parseInt(process.env.REGISTER_RATE_LIMIT_MAX || '5');
  if (rlMax > 5000 || loginMax > 60 || adminLoginMax > 60 || registerMax > 60) {
    console.error(`❌ 安全错误: 生产环境限流阈值过宽（RATE_LIMIT_MAX=${rlMax}, LOGIN_RATE_LIMIT_MAX=${loginMax}, ADMIN_LOGIN_RATE_LIMIT_MAX=${adminLoginMax}, REGISTER_RATE_LIMIT_MAX=${registerMax}）—— 测试用的宽松值不能带到线上，请参考 .env.production.example`);
    process.exit(1);
  }
  if (!process.env.CORS_ORIGIN || /localhost|127\.0\.0\.1/.test(process.env.CORS_ORIGIN)) {
    console.warn('⚠️  生产环境 CORS_ORIGIN 仍指向 localhost —— 前端与后端同源部署可忽略；跨域部署请改成真实域名');
  }
  if (!process.env.SSL_KEY || !process.env.SSL_CERT || /^\.?\/?ssl[\\/]/.test(process.env.SSL_KEY)) {
    console.warn('⚠️  生产环境未配置正式 HTTPS 证书（未设置，或仍指向开发用的 ./ssl/ 自签名证书）—— 若前面有 Nginx/CDN 反向代理终止 TLS 可忽略，否则浏览器会拦截、且密码与 token 明文传输');
  }
}

// ═══════════════════════════════════════════════
// 安全中间件
// ═══════════════════════════════════════════════

// CORS（允许跨域，方便外网访问）
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  maxAge: 86400
}));

// 安全 HTTP 头（helmet）
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// 请求限流

// API 版本管理：/api/v1/* → /api/*（向后兼容）
// 必须在限流中间件之前注册，否则 /api/v2/user/login 等请求会绕过登录限流
app.use((req, res, next) => {
  if (req.originalUrl.match(/^\/api\/v\d+\//)) {
    req.url = req.originalUrl.replace(/^\/api\/v\d+/, '/api');
  }
  next();
});

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '1000'),
  message: { success: false, error: '请求过于频繁，请稍后再试' },
  standardHeaders: 'draft-6',
  legacyHeaders: false,
});
app.use('/api/', limiter);

// 健康检查接口限流放宽（轻量请求，前端会频繁检查）
const healthLimiter = rateLimit({
  windowMs: 60000,
  max: parseInt(process.env.HEALTH_RATE_LIMIT_MAX || '600'),
  message: { success: false, error: '请求过于频繁，请稍后再试' },
});
app.use('/api/worker-health', healthLimiter);

// 登录接口限流（防暴力破解，生产默认 30 次/分钟，测试可设环境变量 LOGIN_RATE_LIMIT_MAX）
const LOGIN_RATE_LIMIT_RAW = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '30');
const LOGIN_RATE_LIMIT_MAX = (Number.isFinite(LOGIN_RATE_LIMIT_RAW) && LOGIN_RATE_LIMIT_RAW >= 1) ? LOGIN_RATE_LIMIT_RAW : 30;
const loginLimiter = rateLimit({
  windowMs: 60000, // 1分钟
  max: LOGIN_RATE_LIMIT_MAX,
  message: { success: false, error: '登录过于频繁，请稍后再试' },
});
app.use('/api/user/login', loginLimiter);

// 注册接口限流（测试环境可通过环境变量放宽）
const REGISTER_RATE_LIMIT_RAW = parseInt(process.env.REGISTER_RATE_LIMIT_MAX || '2000');
const REGISTER_RATE_LIMIT_MAX = (Number.isFinite(REGISTER_RATE_LIMIT_RAW) && REGISTER_RATE_LIMIT_RAW >= 1) ? REGISTER_RATE_LIMIT_RAW : 2000;
const registerLimiter = rateLimit({
  windowMs: 3600000, // 1小时
  max: REGISTER_RATE_LIMIT_MAX,
  message: { success: false, error: '注册过于频繁，请1小时后再试' },
});
app.use('/api/user/register', registerLimiter);

// 管理员登录限流（严格限制，防暴力破解，测试环境可通过环境变量放宽）
const ADMIN_LOGIN_RATE_LIMIT_RAW = parseInt(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX || '30');
const ADMIN_LOGIN_RATE_LIMIT_MAX = (Number.isFinite(ADMIN_LOGIN_RATE_LIMIT_RAW) && ADMIN_LOGIN_RATE_LIMIT_RAW >= 1) ? ADMIN_LOGIN_RATE_LIMIT_RAW : 30;
const adminLoginLimiter = rateLimit({
  windowMs: 60000, // 1分钟
  max: ADMIN_LOGIN_RATE_LIMIT_MAX,
  message: { success: false, error: '登录过于频繁，请稍后再试' },
});
app.use('/api/admin/login', adminLoginLimiter);

// 请求体解析
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 响应 gzip 压缩：HTML/JS/CSS/JSON 传输体积约降 70%，对隧道/公网访问提速显著
app.use(compression());

// 请求日志
// 错误处理
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: '请求数据格式错误' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: '请求体过大，最大支持 1MB' });
  }
  if (err.code === 'ECONNRESET' || err.type === 'aborted') {
    if (!res.headersSent) return res.status(499).json({ success: false, error: '请求中断' });
    return;
  }
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: err.message || '文件上传错误' });
  }
  logger.error(`服务器错误: ${err.message}`, { stack: err.stack });
  if (!res.headersSent) res.status(500).json({ success: false, error: '服务器内部错误' });
  next(err);
});

// 数据库连接池


// ═══════════════════════════════════════════════
// 菜品图片上传
// ═══════════════════════════════════════════════
const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    // 同时验证 MIME 类型和扩展名
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(file.mimetype) && ALLOWED_IMAGE_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 JPG/PNG/GIF/WebP 格式'));
    }
  }
});

app.post('/api/admin/dish/upload-image', adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: '请选择图片' });
    const dishId = parseInt(req.body.dishId);
    if (!dishId || isNaN(dishId) || dishId <= 0) return res.status(400).json({ success: false, error: '无效的菜品 ID' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    // 二次验证扩展名
    if (!ALLOWED_IMAGE_EXTS.includes(ext)) {
      try { fs.unlinkSync(req.file.path); } catch(e) { /* 忽略清理错误 */ }
      return res.status(400).json({ success: false, error: '不支持的图片格式' });
    }
    const newName = `dish_${dishId}_${Date.now()}${ext}`;
    const newPath = path.join(__dirname, 'uploads', newName);
    // 清理旧图片文件
    const pool = db;
    const oldDish = await pool.query('SELECT image_url FROM dishes WHERE id = $1', [dishId]);
    if (oldDish.rows.length > 0 && oldDish.rows[0].image_url && oldDish.rows[0].image_url.startsWith('/uploads/')) {
      const oldImagePath = path.join(__dirname, oldDish.rows[0].image_url.replace(/^\//, ''));
      try { if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath); } catch(e) { /* 忽略旧文件清理错误 */ }
      const oldThumb = path.join(__dirname, 'uploads', 'thumbs', oldDish.rows[0].image_url.replace(/^\/uploads\//, '').replace(/\.[^.]+$/, '') + '.webp');
      try { if (fs.existsSync(oldThumb)) fs.unlinkSync(oldThumb); } catch(e) {}
    }
    fs.renameSync(req.file.path, newPath);
    const imageUrl = '/uploads/' + newName;
    // 同步生成缩略图（B6）：菜单卡片用 thumbs/*.webp，失败不阻断上传
    try {
      const thumbDir = path.join(__dirname, 'uploads', 'thumbs');
      fs.mkdirSync(thumbDir, { recursive: true });
      const sharp = require('sharp');
      await sharp(newPath).rotate().resize({ width: 420, withoutEnlargement: true }).webp({ quality: 78 })
        .toFile(path.join(thumbDir, newName.replace(/\.[^.]+$/, '') + '.webp'));
    } catch(e) { logger.error('缩略图生成失败:', e.message); }
    await pool.query('UPDATE dishes SET image_url = $1 WHERE id = $2', [imageUrl, dishId]);
    res.json({ success: true, imageUrl });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 静态文件服务（只允许前端需要的文件类型，阻止敏感文件泄露）
const ALLOWED_STATIC_EXTS = ['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
const BLOCKED_STATIC_PATHS = ['.env', 'server.js', 'db.js', 'auth.js', 'user_storage.js', 'logger.js', 'build.js', 'package.json', 'package-lock.json', 'ecosystem.config.js', 'Dockerfile', 'docker-compose.yml', 'deploy.bat', 'deploy.sh', 'install.bat', 'start.bat', 'setup_backup.bat', 'backup_db.js', 'migrate_to_pg.js', 'sample_data.sql', 'ngrok.exe', 'fix_', 'model_metrics.json', 'metrics_history.json', 'runtime_settings.json', 'recommendation_effect.json', 'recommendation_model.pkl', 'feature_importance.json', 'dishes_current.json', 'dishes_verify.json', 'registry.json', 'ml/', 'train_ml_model.py', 'rgzn.py', 'logs/', 'backups/', 'model_backups/', 'tests/', '.retired/', '.ai/', '__pycache__/', '.git/', 'ssl/', 'dist/', 'screenshots/', '.playwright-mcp/', '.github/', '唐猫菜品/', '*.pem', '*.key'];
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const ext = path.extname(req.path).toLowerCase();
  const basename = path.basename(req.path).toLowerCase();
  // 规范化路径，防止路径遍历绕过
  const normalizedPath = path.normalize(req.path).replace(/\\/g, '/');
  // 阻止敏感文件（精确匹配文件，或匹配目录前缀，或startsWith用于fix_前缀，或glob模式）
  if (BLOCKED_STATIC_PATHS.some(p => {
    if (p.endsWith('/')) return normalizedPath.startsWith('/' + p) || normalizedPath === '/' + p.slice(0, -1);
    if (p.endsWith('_')) return basename.startsWith(p);
    if (p.startsWith('*.')) return basename.endsWith(p.slice(1));
    return basename === p;
  })) {
    return res.status(403).json({ success: false, error: '禁止访问' });
  }
  // 只允许特定扩展名（仅对看起来像文件的路径检查）
  const hasExtension = basename.includes('.');
  if (hasExtension && !ALLOWED_STATIC_EXTS.includes(ext)) {
    return res.status(403).json({ success: false, error: '禁止访问' });
  }
  next();
});
app.use(express.static(__dirname, { setHeaders: (res, p) => {
  // HTML 不缓存（防止 Edge 等浏览器缓存旧版，导致版本号更新不生效）
  if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  // CSS/JS 不缓存（版本号 v= 防缓存，但 setHeader 双重保险）
  if (p.endsWith('.css') || p.endsWith('.js')) res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
  // 图片缓存7天
  if (p.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/)) res.setHeader('Cache-Control', 'public, max-age=604800');
} }));
// node_modules 中的前端库文件（在拦截中间件之后注册，敏感文件已被阻止）
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules'), { maxAge: '7d' }));

// 上传的图片文件目录
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));

// ═══════════════════════════════════════════════
// 菜品数据加载（从 PostgreSQL）
// ═══════════════════════════════════════════════

async function loadDishData() {
  try {
    let pool;
    try {
      pool = require('./db');
    } catch(e) {
      logger.error('db模块加载失败:', e?.message || String(e));
      state.dishData = []; return;
    }
    if (!pool || !pool.connect) {
      logger.error('db模块无效');
      state.dishData = []; return;
    }
    // 用同一个连接执行 SET + SELECT，确保编码设置生效
    const client = await pool.connect();
    try {
      await client.query("SET client_encoding = 'UTF8'");
      const result = await client.query('SELECT d.*, COALESCE(oc.order_count, 0) as order_count FROM dishes d LEFT JOIN (SELECT dish_id, COUNT(*) as order_count FROM (SELECT jsonb_array_elements(items)->>\'id\' as dish_id FROM orders) o WHERE o.dish_id IS NOT NULL GROUP BY dish_id) oc ON d.id::text = oc.dish_id ORDER BY d.id');
    state.dishData = result.rows.map(d => ({
      id: d.id,
      name: d.name,
      category: d.category,
      tags: d.tags || [],
      spiciness: d.spiciness || '不辣',
      saltiness: d.saltiness || '适中',
      sweetness: d.sweetness || '无味',
      price: d.price !== null && d.price !== undefined && d.price !== '' ? parseFloat(d.price) : (d.price === 0 ? 0 : null),
      rating: d.rating !== null && d.rating !== undefined && d.rating !== '' ? d.rating.toString() : '3.5',
      calorie: d.calorie || '未知',
      protein: d.protein ? d.protein.toString() : (d.calorie ? String(Math.round(parseFloat(d.calorie) * 0.1)) : '0'),
      cuisine: '食堂菜',
      religion: d.religion || '无特殊要求',
      isHalal: d.is_halal || false,
      isVegetarian: d.is_vegetarian || false,
      allergies: d.allergies || {},
      is_active: d.is_active,
      is_sold_out: d.is_sold_out === true,
      name_en: d.name_en || null,
      description_en: d.description_en || null,
      description: d.description || '',
      price_unit: d.price_unit || '',
      serving: d.serving || '',
      image_url: d.image_url || '',
      order_count: parseInt(d.order_count) || 0,
      type: '偏好推荐',
      reason: '综合多项偏好匹配',
      matchIndex: 0,
      matchRate: 0.5,
    }));
    logger.info(`成功加载${state.dishData.length}条菜品数据`);
    } finally { client.release(); }
  } catch (e) {
    logger.error('加载菜品数据失败: ' + (e?.code || '') + ' ' + (e?.message || JSON.stringify(e) || '未知错误'));
    state.dishData = [];
  }
}
// 把用户反馈评分汇总回 dishes.rating
// 背景：菜品评分这一列从来没被自动写过（其他地方都是实时 JOIN AVG 算），
// 导致「评分」特征恒为兜底值。这里在每次重训后顺带汇总一次 —— 上线后有真实反馈自动"活"过来。
// 只统计针对具体菜品的反馈（dish_id>0，排除 dish_id=0 的整体满意度），
// 且至少 MIN_RATINGS 条才回写（避免个别评分/测试数据定义一道菜）。
async function syncDishRatings() {
  const MIN_RATINGS = 3;
  try {
    const r = await db.query(
      `UPDATE dishes d SET rating = sub.avg
         FROM (SELECT dish_id, ROUND(AVG(rating)::numeric, 1) AS avg, COUNT(*) AS n
                 FROM feedback WHERE dish_id > 0 GROUP BY dish_id) sub
        WHERE d.id = sub.dish_id AND sub.n >= $1 AND d.rating IS DISTINCT FROM sub.avg`,
      [MIN_RATINGS]
    );
    if (r.rowCount > 0) logger.info(`已按用户反馈同步 ${r.rowCount} 道菜的评分`);
    return r.rowCount;
  } catch (e) {
    logger.warn('同步菜品评分失败: ' + (e?.message || String(e)));
    return 0;
  }
}

// 重新生成「推荐效果报告」（重训后调用，保证报告对应当前模型）
function refreshRecommendationEffect() {
  try {
    const { spawn } = require('child_process');
    const proc = spawn('python', ['ml/recommendation_effect_report.py'], {
      cwd: __dirname, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true
    });
    proc.on('error', e => logger.warn('生成推荐效果报告失败: ' + e.message));
    proc.on('close', code => { if (code !== 0) logger.warn('生成推荐效果报告失败，退出码: ' + code); });
  } catch (e) { logger.warn('生成推荐效果报告失败: ' + (e?.message || '')); }
}

// 服务器启动后异步加载菜品数据
loadDishData();

// 确保 token_blacklist 表存在（JWT 吊销需要），幂等执行
async function ensureTokenBlacklistTable() {
  try {
    const pool = db;
    await pool.query(
      `CREATE TABLE IF NOT EXISTS token_blacklist (
        jti VARCHAR(64) PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL
      )`
    );
    await pool.query('CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at)');
    logger.info('token_blacklist 表已就绪');
  } catch(e) {
    logger.warn('token_blacklist 表创建失败（可能 DB 未就绪）: ' + (e?.message || String(e)));
  }
}
ensureTokenBlacklistTable();

// ═══════════════════════════════════════════════
// 静态页面
// ═══════════════════════════════════════════════
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/kitchen', (req, res) => res.sendFile(path.join(__dirname, 'kitchen.html')));
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/api/dishes', (req, res) => res.json({ success: true, dishes: state.dishData }));
app.get('/api/dishes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const dish = state.dishData.find(d => d.id == id);
  if (!dish) return res.status(404).json({ success: false, error: '菜品不存在' });
  res.json({ success: true, dish });
});

// ─── 本桌账单(免登录,凭签名桌码)─── 拆分至 server/routes/table-view.js(2026-10-13 改造4)
const { register: registerTableView, tableSig } = require('./server/routes/table-view');
registerTableView(app, { db, logger });
// ═══════════════════════════════════════════════
// 管理后台认证
// ═══════════════════════════════════════════════
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER) {
    // 优先使用 bcrypt 比对（恒定时间），bcrypt对非哈希返回false而非抛异常
    const bcrypt = require('bcrypt');
    const crypto = require('crypto');
    let matched = false;
    try {
      matched = bcrypt.compareSync(password, ADMIN_PASS);
    } catch(e) {
      // ADMIN_PASS 不是 bcrypt 哈希格式
    }
    // bcrypt 返回 false 时，尝试 timingSafeEqual（处理明文密码场景）
    if (!matched) {
      try {
        const a = Buffer.from(password, 'utf8');
        const b = Buffer.from(ADMIN_PASS, 'utf8');
        if (a.length === b.length) {
          matched = crypto.timingSafeEqual(a, b);
        }
      } catch(e2) { matched = false; }
    }
    if (matched) {
      const token = generateToken({ id: 0, username: ADMIN_USER, role: 'admin' });
      return res.json({ success: true, message: '管理员登录成功', token });
    }
  }
  res.status(401).json({ success: false, error: '管理员账号或密码错误' });
});

// 管理后台认证中间件（排除登录接口）
async function adminAuth(req, res, next) {
  // 登录接口不需要认证
  if (req.path === '/login') return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '请先登录管理后台' });
  }
  try {
    const decoded = require('jsonwebtoken').verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, error: '无管理权限' });
    }
    // 已吊销的 token 视同无效
    if (decoded.jti) {
      const blacklisted = await isTokenBlacklisted(decoded.jti);
      if (blacklisted) {
        return res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
      }
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
  }
}

// 所有 /api/admin/* 路由需要认证
app.use('/api/admin', adminAuth);

// 桌码管理（A2）：批量生成签名桌码链接（协议/域名取自请求头，支持反代与隧道）
// /api/admin/* 业务域拆分至 server/routes/admin.js(登录/上传图/认证中间件仍在本文件)(2026-10-13 改造4)
require('./server/routes/admin').register(app, {
  adminAuth, db, logger, state, readJSON, tableSig, loadDishData, refreshRecommendationEffect, userStorage, generateToken,
  loadModelInfo,
  getModelInfo: () => modelInfo,
  getWorkerReady: () => workerReady,
  getPendingRequestsSize: () => pendingRequests.size,
  getErrorStats: () => errorStats,
  toCSV,
  getFeatureImportanceCache: () => featureImportanceCache,
});

// 营业日报（A3）：按日聚合单量/金额/动销/退单/时段分布

// ═══════════════════════════════════════════════
// 管理后台 API
// ═══════════════════════════════════════════════

// 菜品热度排行

// 反馈汇总

// 菜品管理 API

// 用户域(注册/登录/偏好/收藏/黑名单/登出/注销)拆分至 server/routes/users.js(2026-10-13 改造4)
require('./server/routes/users').register(app, { userStorage, generateToken, authMiddleware, logger });
// 偏好记录
app.post('/api/preference-log', softAuth, async (req, res) => {
  try {
    const { spiciness, saltiness, sweetness, price, calorie, religion, allergies, recommendationMode } = req.body;
    // userId 取自 JWT，拒绝客户端伪造（与 /api/feedback、/api/order 一致）
    const effectiveUserId = req.user?.username || 'guest';
    const pool = db;
    await pool.query(
      "INSERT INTO preference_log (spiciness, saltiness, sweetness, price, calorie, religion, allergies, user_id, recommendation_mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [spiciness||null, saltiness||null, sweetness||null, price||null, calorie||null, religion||null, allergies||[], effectiveUserId, recommendationMode||'auto']
    );
    res.json({ success: true });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 推荐次数记录
app.post('/api/recommendation-log', softAuth, async (req, res) => {
  try {
    // userType / userId 取自 JWT，拒绝客户端伪造
    const effectiveUserId = req.user?.username || 'guest';
    const effectiveUserType = req.user ? 'user' : 'guest';
    // mode 区分推荐形态（单菜推荐/一桌菜组合/一桌菜换菜），截断防脏数据
    let mode = '单菜推荐';
    if (req.body && typeof req.body.mode === 'string' && req.body.mode.trim()) {
      mode = req.body.mode.trim().slice(0, 30);
    }
    const pool = db;
    await pool.query('INSERT INTO recommendation_log (user_type, user_id, mode) VALUES ($1,$2,$3)', [effectiveUserType, effectiveUserId, mode]);
    res.json({ success: true });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 偏好统计 API

// ═══════════════════════════════════════════════
// 管理后台增强 API
// ═══════════════════════════════════════════════

// 每日推荐趋势

// 用户活跃度

// 推荐日志详情

// 模型训练历史

// 运行时开关读写（目前只有 autoRetrain：是否按用户反馈自动重训）

// 推荐效果报告：ML vs 规则（回答「ML 有没有打过规则」）
// GET 读缓存文件；POST 触发重新生成（跑 Python，几秒钟）
const RECOMMENDATION_EFFECT_PATH = path.join(__dirname, 'recommendation_effect.json');

// 一键触发重训练（异步执行，不阻塞服务器）

// 推荐效果不佳的菜品分析

// 模型版本对比

// 推荐点击率统计

// 点餐与反馈域拆分至 server/routes/orders.js(2026-10-13 改造4)
require('./server/routes/orders').register(app, { db, logger, softAuth, authMiddleware });
// 模型指标
app.get('/api/model-metrics', (req, res) => {
  try {
    const metricsPath = path.join(__dirname, 'model_metrics.json');
    if (fs.existsSync(metricsPath)) {
      const metrics = readJSON(metricsPath);
      return res.json({ success: true, metrics });
    }
    // 缓存文件不存在时返回空指标，不阻塞事件循环、不返回误导性假数据
    res.json({ success: false, metrics: null, error: '模型指标暂未生成，请触发重训练后重试' });
  } catch (e) { res.json({ success: false, metrics: null, error: '模型指标读取失败' }); }
});

// 特征重要性（启动时预加载，长时间缓存）
let featureImportanceCache = null;
let featureImportanceCacheTime = 0;
const FEATURE_IMPORTANCE_CACHE_DURATION = 86400000; // 24小时（模型很少变化）

// 启动时异步预加载特征重要性
function preloadFeatureImportance() {
  try {
    const staticPath = path.join(__dirname, 'feature_importance.json');
    if (!fs.existsSync(staticPath)) {
      logger.warn('特征重要性静态文件不存在，跳过预加载');
      return;
    }
    const data = readJSON(staticPath);
    if (data.success && data.importance) {
      featureImportanceCache = {
        success: true,
        importance: data.importance,
        explanation: '模型基于以下12个维度预测您对菜品的喜好程度：菜品辣度、咸淡、甜酸、热量，价格、评分、是否招牌，以及您的个人口味偏好（辣度/咸淡/甜酸/价格区间/热量）。',
        key_factors: [
          '1. 用户口味偏好（咸淡/辣度/甜酸）是影响推荐的首要因素',
          '2. 辣度特征（菜品辣度 + 您的口味偏好）影响显著',
          '3. 您的甜酸和咸淡偏好也有重要影响',
          '4. 评分和招牌属性作为辅助参考'
        ]
      };
      featureImportanceCacheTime = Date.now();
      logger.info('特征重要性预加载成功');
    }
  } catch(e) { logger.warn('特征重要性预加载失败: ' + (e?.message || '')); }
}

// 服务器启动后异步预加载
setTimeout(preloadFeatureImportance, 5000);

app.get('/api/feature-importance', (req, res) => {
  try {
    const now = Date.now();
    if (featureImportanceCache && (now - featureImportanceCacheTime < FEATURE_IMPORTANCE_CACHE_DURATION)) {
      return res.json(featureImportanceCache);
    }
    // 从静态 JSON 文件读取（避免每次启动 Python 进程，耗时 8-10 秒）
    const staticPath = path.join(__dirname, 'feature_importance.json');
    if (fs.existsSync(staticPath)) {
      const data = readJSON(staticPath);
      if (data.success && data.importance) {
        const response = {
          success: true,
          importance: data.importance,
          explanation: '模型基于以下12个维度预测您对菜品的喜好程度：菜品辣度、咸淡、甜酸、热量，价格、评分、是否招牌，以及您的个人口味偏好（辣度/咸淡/甜酸/价格区间/热量）。',
          key_factors: [
            '1. 用户口味偏好（咸淡/辣度/甜酸）是影响推荐的首要因素',
            '2. 辣度特征（菜品辣度 + 您的口味偏好）影响显著',
            '3. 您的甜酸和咸淡偏好也有重要影响',
            '4. 评分和招牌属性作为辅助参考'
          ]
        };
        featureImportanceCache = response;
        featureImportanceCacheTime = now;
        return res.json(response);
      }
    }
    throw new Error('特征重要性数据文件不存在');
  } catch (e) {
    logger.error('获取特征重要性失败: ' + (e?.message || ''));
    if (featureImportanceCache) {
      return res.json(featureImportanceCache);
    }
    // 最后的备用方案：硬编码的默认值
    const fallback = {
      success: true,
      importance: [
        { feature: '招牌', importance: 0.2108 },
        { feature: '用户辣度', importance: 0.1616 },
        { feature: '用户甜酸', importance: 0.13 },
        { feature: '辣度', importance: 0.1279 },
        { feature: '甜酸', importance: 0.114 },
        { feature: '用户咸淡', importance: 0.0878 },
        { feature: '咸淡', importance: 0.0843 },
        { feature: '价格', importance: 0.0728 },
        { feature: '评分', importance: 0.0106 }
      ],
      explanation: '模型基于以下12个维度预测您对菜品的喜好程度：菜品辣度、咸淡、甜酸、热量，价格、评分、是否招牌，以及您的个人口味偏好（辣度/咸淡/甜酸/价格区间/热量）。',
      key_factors: [
        '1. 是否招牌菜对推荐影响最大',
        '2. 您的个人口味偏好（辣度、甜酸、咸淡）非常重要',
        '3. 菜品本身的口味特征（辣度、甜酸、咸淡）也有影响',
        '4. 价格和评分作为辅助参考因素'
      ]
    };
    res.json(fallback);
  }
});

// ═══════════════════════════════════════════════
// Python Worker
// ═══════════════════════════════════════════════
let pythonWorker = null;
let workerReady = false;
let workerSpawnAt = Date.now();
const ORD_MAPPINGS_CACHE = {
  '辣度': { '无': 0, '不辣': 1, '微辣': 2, '中辣': 3, '重辣': 4 },
  '咸淡': { '无': 0, '清淡': 1, '适中': 2, '偏咸': 3 },
  '甜酸': { '无': 0, '无味': 1, '偏甜': 2, '偏酸': 3, '甜酸': 4 },
  '热量': { '无': 0, '低': 1, '中': 2, '高': 3 },
  '价格区间': { '经济型（<12元）': 0, '标准型（12-20元）': 1, '品质型（20元以上）': 2, '经济': 1, '适中': 2, '品质': 3, '无': 0, '不限': 0 }
};

// ═══ Node 端 HistGB 兜底打分器: Python worker 不可用(重启窗口/崩溃)时的同模型降级 ═══
// 模型 JSON 由 ml/export_histgb_to_js.py 从生产 pkl 导出, 与 Python predict 偏差<1e-4分(实用精度)
// 与 predict_worker.py 的区分: worker 走 Python 原生推理(主路径); 此处为 Node 纯 JS 推理(兜底路径)
let histgbFallback = null;
try {
  histgbFallback = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'ml', 'histgb_model.json'), 'utf8'));
  logger.info('Node 端 HistGB 兜底模型已加载: ' + histgbFallback.n + ' 棵树');
} catch (e) { logger.warn('HistGB 兜底模型加载失败(仅影响降级路径质量): ' + e.message); }
function histgbNodeScoreDish(d, up) {
  const M = ORD_MAPPINGS_CACHE;
  const f = [
    M['辣度'].get(d.spiciness, 1),
    M['咸淡'].get(d.saltiness, 1),
    M['甜酸'].get(d.sweetness, 1),
    M['热量'].get(d.calorie, 2),
    (parseFloat(d.price) || 0) / 100,
    (d.tags && d.tags.includes('招牌')) ? 1 : 0,
    (parseFloat(d.rating) || 3.5) / 5,
    M['辣度'].get(up['辣度'], 1),
    M['咸淡'].get(up['咸淡'], 1),
    M['甜酸'].get(up['甜酸'], 1),
    M['价格区间'].get(up['价格区间'], 1),
    M['热量'].get(up['calorie'], 1),
  ];
  return Math.max(0, Math.min(5, histgbNodePredict(f)));
}
function histgbNodePredict(features) {
  let sum = histgbFallback.baseline;
  for (const tree of histgbFallback.trees) {
    let ni = 0;
    for (;;) {
      const n = tree[ni];
      if (n.leaf) { sum += n.v; break; }
      ni = features[n.f] <= n.t ? n.l : n.r;
    }
  }
  return sum;
}
let workerStartTime = 0;
let pendingRequests = new Map();
let pendingRequestIdCounter = 0;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;

function startPythonWorker() {
  if (pythonWorker) { try { pythonWorker.kill(); } catch(e) {} pythonWorker = null; }
  const { spawn } = require('child_process');
  workerSpawnAt = Date.now();
  logger.info('ML Worker 启动中(加载模型约需1-2秒, 期间推荐自动降级本地规则)');
  pythonWorker = spawn('python', ['-u', path.join(__dirname, 'ml', 'predict_worker.py')], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    windowsHide: true
  });
  workerReady = false;
  workerStartTime = Date.now();
  let buffer = '';
  pythonWorker.stdout.on('data', (data) => {
    buffer += data.toString('utf8');
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.substring(0, newlineIndex);
      buffer = buffer.substring(newlineIndex + 1);
      if (line.trim()) {
        try {
          const result = JSON.parse(line);
          if (result.ready) { if (!workerReady) logger.info(`ML 模型加载完成(${Date.now() - (workerSpawnAt || Date.now())}ms), 推荐服务就绪`); workerReady = true; restartAttempts = 0; }
          else if (pendingRequests.size > 0) {
            // 使用 Map 的迭代器获取第一个待处理请求，保证 FIFO 顺序
            const firstEntry = pendingRequests.entries().next();
            if (!firstEntry.done) {
              const [reqId, entry] = firstEntry.value;
              pendingRequests.delete(reqId);
              if (entry.timeoutId) clearTimeout(entry.timeoutId);
              // 两种消费者：HTTP 请求（res 直写）与内部 Promise（/api/recommend/table 打分）
              if (entry.onResult) entry.onResult(result);
              else if (!entry.res.headersSent) entry.res.json(result);
            }
          }
        } catch(e) { logger.info('Python日志: ' + line); }
      }
    }
  });
  pythonWorker.stderr.on('data', (data) => {
    const msg = data.toString('utf8');
    if (msg.includes('[错误]')) logger.error('Python worker错误: ' + msg);
    else if (msg.includes('[信息]') || msg.includes('Worker')) logger.info('Python worker日志: ' + msg.trim());
  });
  pythonWorker.on('close', (code) => {
    logger.info('Python worker关闭，退出码: ' + code);
    pythonWorker = null; workerReady = false;
    for (const [reqId, pr] of pendingRequests.entries()) {
      if (!pr) continue;
      if (pr.timeoutId) clearTimeout(pr.timeoutId);
      if (pr.onError) pr.onError(503, '服务不可用，请重试');
      else if (pr.res && !pr.res.headersSent) pr.res.status(503).json({ success: false, error: '服务不可用，请重试' });
    }
    if (restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++;
      logger.info('将在2秒后重启Worker（第' + restartAttempts + '次尝试）...');
      setTimeout(startPythonWorker, 2000);
    }
  });
  pythonWorker.on('error', (err) => { logger.error('启动Python worker失败: ' + err.message); pythonWorker = null; workerReady = false; });
  logger.info('[信息] Python Worker启动中...');
}

// 统一的 worker 请求分发：/api/predict-rf 与 /api/recommend/table 共用同一条 FIFO 队列，
// worker 单行进单行出，谁先入队谁先拿到响应。
// handlers: { onResult(result), onError(status, message) }，二者只会被调用一次。
function dispatchToWorker(inputData, handlers) {
  let settled = false;
  const settleResult = (r) => { if (!settled) { settled = true; handlers.onResult(r); } };
  const settleError = (status, msg) => {
    if (settled) return;
    settled = true;
    // 兜底: Python worker 不可用时, Node 端用导出的 HistGB 同模型打分
    // 保证 ML 推荐可用性——降级的是推理引擎(Python→Node), 不是模型质量
    try {
      if (histgbFallback && inputData) {
        const input = JSON.parse(inputData);
        const up = input.userPrefs || {};
        const predictions = (input.dishes || []).map(d => ({
          id: d.id, name: d.name,
          score: Math.max(0, Math.min(5, histgbNodeScoreDish(d, up))),
        }));
        logger.warn(`ML降级: Python worker不可用(${msg}), Node端HistGB兜底打分 ${predictions.length} 道`);
        handlers.onResult({ success: true, predictions, degraded: 'node-histgb' });
        return;
      }
    } catch (e) { logger.error('Node HistGB 兜底失败: ' + e.message); }
    handlers.onError(status, msg);
  };
  const requestId = ++pendingRequestIdCounter;
  const timeoutId = setTimeout(() => {
    pendingRequests.delete(requestId);
    logger.warn('ML打分请求超时(50s), 可能模型过载');
    settleError(504, '请求超时，请重试');
  }, 50000);
  const addPendingRequest = () => {
    if (pendingRequests.size >= 100) { clearTimeout(timeoutId); settleError(503, '服务器繁忙，请稍后重试'); return; }
    pendingRequests.set(requestId, { timeoutId, onResult: settleResult, onError: settleError });
    pythonWorker.stdin.write(inputData + '\n');
  };
  if (!pythonWorker) {
    startPythonWorker();
    setTimeout(() => {
      if (workerReady && pythonWorker && pythonWorker.stdin.writable) addPendingRequest();
      else { clearTimeout(timeoutId); settleError(503, 'Worker未就绪，请重试'); }
    }, 3000);
  } else if (!workerReady) {
    let checkCount = 0;
    const checkReady = setInterval(() => {
      checkCount++;
      if (workerReady && pythonWorker && pythonWorker.stdin.writable) { clearInterval(checkReady); addPendingRequest(); }
      else if (checkCount >= 10 || !pythonWorker) { clearInterval(checkReady); clearTimeout(timeoutId); settleError(503, 'Worker未就绪，请重试'); }
    }, 500);
  } else if (pythonWorker.stdin.writable) { addPendingRequest(); }
  else { clearTimeout(timeoutId); settleError(500, 'Worker不可用'); }
  return { abort: () => { clearTimeout(timeoutId); pendingRequests.delete(requestId); } };
}

app.get('/api/worker-health', (req, res) => {
  const status = {
    success: true,
    alive: pythonWorker !== null,
    ready: workerReady,
    uptime: pythonWorker ? Date.now() - workerStartTime : 0,
    pendingRequests: pendingRequests.size,
    restartAttempts: restartAttempts,
    timestamp: new Date().toISOString()
  };
  // 每隔 10 分钟记录一次健康检查日志
  const now = Date.now();
  if (!global._lastHealthLog || now - global._lastHealthLog > 600000) {
    global._lastHealthLog = now;
    logger.info(`健康检查: alive=${status.alive} ready=${status.ready} pending=${status.pendingRequests} restarts=${status.restartAttempts}`);
  }
  res.json(status);
});

app.post('/api/predict-rf', (req, res) => {
  const { userPrefs, dishes } = req.body;
  if (!userPrefs || !dishes) return res.status(400).json({ success: false, error: '缺少必要参数 userPrefs 和 dishes' });
  if (!Array.isArray(dishes)) return res.status(400).json({ success: false, error: 'dishes 必须为数组' });
  if (dishes.length === 0) return res.status(400).json({ success: false, error: 'dishes 不能为空' });
  // 兼容不同参数格式：如果 dishes 是整数数组，从 state.dishData 查找完整对象
  let processedDishes = dishes;
  if (typeof dishes[0] === 'number') {
    processedDishes = dishes.map(id => state.dishData.find(d => d.id === id)).filter(Boolean);
    // 数字 id 全部未命中(展开为空)时立即 400:空载荷曾让 worker 挂满 50s 硬超时,占住 FIFO 队列拖垮并发
    if (processedDishes.length === 0) return res.status(400).json({ success: false, error: 'dishes 中的菜品 ID 均不存在' });
  }
  // 兼容 userPrefs 字段名：将英文名映射为中文名
  let processedPrefs = userPrefs;
  const fieldMap = { spiciness: '辣度', saltiness: '咸淡', sweetness: '甜酸', price: '价格区间', religion: '饮食_宗教', calorie: '热量' };
  const hasEnglish = Object.keys(fieldMap).some(k => userPrefs[k] !== undefined);
  const hasChinese = Object.values(fieldMap).some(v => userPrefs[v] !== undefined);
  if (hasEnglish && !hasChinese) {
    processedPrefs = { ...userPrefs };
    for (const [en, cn] of Object.entries(fieldMap)) {
      if (userPrefs[en] !== undefined) {
        processedPrefs[cn] = userPrefs[en];
        delete processedPrefs[en];
      }
    }
  }
  const inputData = JSON.stringify({ userPrefs: processedPrefs, dishes: processedDishes });
  let responseSent = false;
  const sendResponse = (status, data) => { if (!responseSent && !res.headersSent) { responseSent = true; res.status(status).json(data); } };
  const dispatch = dispatchToWorker(inputData, {
    onResult: (result) => sendResponse(200, result),
    onError: (status, msg) => {
      // 兜底: Python worker 不可用(重启窗口/崩溃)时, Node 端用导出的 HistGB 同模型打分
      // 保证 ML 推荐可用性——降级的是推理引擎, 不是模型质量
      try {
        if (!histgbFallback) throw new Error('Node 兜底模型未加载');
        const predictions = processedDishes.map(d => {
          const f = [
            ORD_MAPPINGS_CACHE['辣度'].get(d.spiciness, 1),
            ORD_MAPPINGS_CACHE['咸淡'].get(d.saltiness, 1),
            ORD_MAPPINGS_CACHE['甜酸'].get(d.sweetness, 1),
            ORD_MAPPINGS_CACHE['热量'].get(d.calorie, 2),
            (parseFloat(d.price) || 0) / 100,
            (d.tags && d.tags.includes('招牌')) ? 1 : 0,
            (parseFloat(d.rating) || 3.5) / 5,
            ORD_MAPPINGS_CACHE['辣度'].get(userPrefs['辣度'], 1),
            ORD_MAPPINGS_CACHE['咸淡'].get(userPrefs['咸淡'], 1),
            ORD_MAPPINGS_CACHE['甜酸'].get(userPrefs['甜酸'], 1),
            ORD_MAPPINGS_CACHE['价格区间'].get(userPrefs['价格区间'], 1),
            ORD_MAPPINGS_CACHE['热量'].get(userPrefs['calorie'], 1),
          ];
          return { id: d.id, name: d.name, score: Math.max(0, Math.min(5, histgbNodePredict(f))) };
        });
        logger.warn(`predict-rf 降级: Python worker 不可用(${msg}), 已用 Node 端 HistGB 兜底打分`);
        sendResponse(200, { success: true, predictions, degraded: 'node-histgb' });
      } catch (e) {
        logger.error('predict-rf Node 兜底也失败: ' + e.message);
        sendResponse(status, { success: false, error: msg });
      }
    },
  });
  req.on('aborted', () => dispatch.abort());
});

// ═══════════════════════════════════════════════
// 一桌菜组合推荐（路线图 8.4 · MVP）：规则引擎组合 + worker 批量打分
// ═══════════════════════════════════════════════
const tableRecommend = require('./table_recommend');

// 组合推荐要过一遍 worker 批量打分，比普通查询贵，单独限流（env 可覆盖）。
// 默认 100 次/15 分钟：店内 WiFi 下顾客共享出口 IP，整店共享额度，不宜过低。
const TABLE_RATE_LIMIT_RAW = parseInt(process.env.TABLE_RATE_LIMIT_MAX || '100');
const TABLE_RATE_LIMIT_MAX = (Number.isFinite(TABLE_RATE_LIMIT_RAW) && TABLE_RATE_LIMIT_RAW >= 1) ? TABLE_RATE_LIMIT_RAW : 30;
const tableLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: TABLE_RATE_LIMIT_MAX,
  message: { success: false, error: '一桌菜生成过于频繁，请稍后再试' },
});

const TABLE_SPICY_LEVELS = ['无', '不辣', '微辣', '中辣', '重辣'];
const TABLE_POOL_KEYS = ['cold', 'hot', 'signature', 'staple'];

function parseTableParams(body) {
  const partySize = parseInt(body.partySize, 10);
  if (!Number.isFinite(partySize) || partySize < 1 || partySize > 20) {
    return { error: 'partySize 必须为 1-20 的整数' };
  }
  let budget = 80;
  if (body.budgetPerPerson !== undefined && body.budgetPerPerson !== null && body.budgetPerPerson !== '') {
    budget = Number(body.budgetPerPerson);
    if (!Number.isFinite(budget) || budget < 10 || budget > 1000) {
      return { error: 'budgetPerPerson 必须为 10-1000 的数字' };
    }
  }
  const spiciness = TABLE_SPICY_LEVELS.includes(body.spiciness) ? body.spiciness : '无';
  const religion = ['无特殊要求', '素食', '清真'].includes(body.religion) ? body.religion : '无特殊要求';
  const V = tableRecommend.PREF_VOCABS;
  const saltiness = V.saltiness.includes(body.saltiness) ? body.saltiness : '无';
  const sweetness = V.sweetness.includes(body.sweetness) ? body.sweetness : '无';
  const calorie = V.calorie.includes(body.calorie) ? body.calorie : '无';
  // 已点菜排除入参：excludeIds 是客户端补充（本会话各轮+购物车），tableNumber 由服务端查本桌进行中订单
  const excludeIds = (Array.isArray(body.excludeIds) ? body.excludeIds : [])
    .map(n => parseInt(n, 10)).filter(Number.isFinite).slice(0, 500);
  let tableNumber = null;
  if (body.tableNumber !== undefined && body.tableNumber !== null && body.tableNumber !== '') {
    const t = String(body.tableNumber);
    if (!/^\d{1,2}$/.test(t) && t !== '打包') return { error: 'tableNumber 格式不正确' };
    tableNumber = t;
  }
  let avoidRecentDays = 0;
  if (body.avoidRecentDays !== undefined && body.avoidRecentDays !== null && body.avoidRecentDays !== '') {
    avoidRecentDays = parseInt(body.avoidRecentDays, 10);
    if (!Number.isFinite(avoidRecentDays) || avoidRecentDays < 1 || avoidRecentDays > 30) {
      return { error: 'avoidRecentDays 必须为 1-30 的整数' };
    }
  }
  return { partySize, budgetPerPerson: budget, spiciness, saltiness, sweetness, calorie, religion, allergyKeys: tableRecommend.normalizeAllergies(body.allergies), excludeIds, tableNumber, avoidRecentDays };
}

// 登录用户口味档案（路线图 8.4 二期：忌口/口味从档案带出；档案只作默认值，请求显式选择优先）
async function getProfilePrefs(req) {
  if (!req.user || !req.user.id) return { allergyKeys: [], profile: null };
  try {
    const r = await db.query('SELECT preferences FROM users WHERE id = $1', [req.user.id]);
    const prefs = r.rows[0] && r.rows[0].preferences;
    const profile = (prefs && typeof prefs === 'object' && !Array.isArray(prefs)) ? prefs : null;
    return { allergyKeys: tableRecommend.normalizeAllergies(profile && profile.allergies), profile };
  } catch (e) {
    logger.error('读取用户口味档案失败: ' + e.message);
    return { allergyKeys: [], profile: null };
  }
}

// 已点菜排除：本桌进行中订单必避（消灭加菜轮重复推荐）；登录用户可选避开近 N 天吃过的（会所版防重复）
async function collectOrderedDishIds({ tableNumber, avoidRecentDays, req }) {
  const ids = new Set();
  if (tableNumber) {
    try {
      const r = await db.query(
        `SELECT (e->>'id')::int AS dish_id FROM orders o, jsonb_array_elements(o.items) e
         WHERE o.table_number = $1 AND o.status IN ('pending','confirmed')`,
        [tableNumber]
      );
      r.rows.forEach(row => { if (Number.isFinite(row.dish_id)) ids.add(row.dish_id); });
    } catch (e) { logger.error('查询本桌已点菜品失败: ' + e.message); }
  }
  if (avoidRecentDays > 0 && req.user && req.user.username) {
    try {
      const r = await db.query(
        `SELECT (e->>'id')::int AS dish_id FROM orders o, jsonb_array_elements(o.items) e
         WHERE o.user_id = $1 AND o.status <> 'cancelled' AND o.created_at > NOW() - make_interval(days => $2::int)`,
        [req.user.username, avoidRecentDays]
      );
      r.rows.forEach(row => { if (Number.isFinite(row.dish_id)) ids.add(row.dish_id); });
    } catch (e) { logger.error('查询近期吃过菜品失败: ' + e.message); }
  }
  return ids;
}

// 埋点：一次推荐动作=一行（mode 列由启动迁移保证；写入失败仅记日志，不影响主流程）
function logRecommendationMode(req, mode) {
  const userId = (req.user && req.user.username) || 'guest';
  const userType = req.user ? 'user' : 'guest';
  db.query('INSERT INTO recommendation_log (user_type, user_id, mode) VALUES ($1, $2, $3)', [userType, userId, mode])
    .catch(e => logger.error('推荐埋点写入失败: ' + e.message));
}

// 批量打分：worker 可用走 ML，不可用降级本地规则分（接口不 5xx）
async function scoreTableCandidates(userPrefs, dishes) {
  try {
    const preds = await new Promise((resolve, reject) => {
      dispatchToWorker(JSON.stringify({ userPrefs, dishes }), {
        onResult: (result) => {
          if (result && result.success && Array.isArray(result.predictions)) resolve(result.predictions);
          else reject(new Error((result && result.error) || 'worker 返回异常'));
        },
        onError: (status, msg) => { const err = new Error(msg); err.status = status; reject(err); },
      });
    });
    const byId = new Map(preds.map(p => [p.id, Number(p.score) || 0]));
    dishes.forEach(d => { d._score = byId.has(d.id) ? byId.get(d.id) : tableRecommend.fallbackScore(d, userPrefs); });
    return 'worker';
  } catch (e) {
    logger.info('一桌菜 worker 打分不可用，本地规则分兜底: ' + e.message);
    dishes.forEach(d => { d._score = tableRecommend.fallbackScore(d, userPrefs); });
    return 'fallback';
  }
}

function dishToResult(d, pool) {
  return {
    id: d.id, name: d.name, category: d.category, spiciness: d.spiciness,
    price: Math.round((Number(d.price) || 0) * 100) / 100,
    price_unit: d.price_unit || '', serving: d.serving || '',
    image_url: d.image_url || '', qty: 1, pool,
    matchPct: Math.min(100, Math.max(0, Math.round((d._score || 0) / 5 * 100))),
  };
}

app.post('/api/recommend/table', tableLimiter, softAuth, async (req, res) => {
  const params = parseTableParams(req.body || {});
  if (params.error) return res.status(400).json({ success: false, error: params.error });
  try {
    const { allergyKeys: profileAllergyKeys, profile } = await getProfilePrefs(req);
    const allAllergyKeys = new Set(params.allergyKeys);
    profileAllergyKeys.forEach(k => allAllergyKeys.add(k));
    const { pools, excluded } = tableRecommend.buildPools(state.dishData || [], [...allAllergyKeys]);
    // 宗教饮食硬排除（2026-10-08）：清真→猪肉系剔除；素食→荤菜+海鲜剔除。
    // 宗教饮食是硬约束非打分偏好——曾只进 ML 打分特征，清真实测被推猪肉菜
    const religionEff = (params.religion && params.religion !== '无特殊要求') ? params.religion
      : ((profile && profile.religion && profile.religion !== '无特殊要求') ? profile.religion : '');
    let religionExcluded = 0;
    let effPools = pools;
    if (religionEff) {
      effPools = tableRecommend.filterByReligion(pools, religionEff);
      religionExcluded = TABLE_POOL_KEYS.reduce((s, k) => s + ((pools[k].length || 0) - (effPools[k].length || 0)), 0);
    }
    // 已点菜排除：仅登录用户提供（游客无身份，不做已点排除——换桌/新客不继承他人记录）
    // 登录用户：客户端 excludeIds + 本桌进行中订单 +（可选）近 N 天吃过
    const isLoggedIn = req.user && req.user.username && req.user.username !== 'guest';
    const orderedIds = new Set(isLoggedIn ? params.excludeIds : []);
    if (isLoggedIn) {
      (await collectOrderedDishIds({ tableNumber: params.tableNumber, avoidRecentDays: params.avoidRecentDays, req }))
        .forEach(id => orderedIds.add(id));
    }
    // 跨池按 id 去重后浅克隆打分（不污染共享缓存 state.dishData）
    const union = [];
    const seen = new Set();
    for (const key of TABLE_POOL_KEYS) {
      for (const d of effPools[key]) if (!seen.has(d.id)) { seen.add(d.id); union.push({ ...d }); }
    }
    let excludedOrdered = 0;
    const candidates = union.filter(d => {
      if (orderedIds.has(d.id)) { excludedOrdered++; return false; }
      return true;
    });
    if (!candidates.length) {
      const msg = excludedOrdered > 0 ? '候选菜品都被忌口或已点排除，请调整条件后重试' : '当前没有可推荐的菜品，请稍后再试';
      return res.status(503).json({ success: false, error: msg });
    }
    const source = await scoreTableCandidates(tableRecommend.buildTableUserPrefs(params, profile), candidates);
    const byId = new Map(candidates.map(d => [d.id, d]));
    for (const key of TABLE_POOL_KEYS) effPools[key] = effPools[key].filter(d => byId.has(d.id)).map(d => byId.get(d.id));
    // 米饭按人数自动配：预算先预留米饭钱，保证含饭人均仍在所选档位内
    const riceDish = (state.dishData || []).find(d => d && d.is_active !== false && d.category === '主食'
      && typeof d.name === 'string' && d.name.includes('米饭'));
    const riceReserve = riceDish ? (Number(riceDish.price) || 0) * params.partySize : 0;
    const sets = tableRecommend.buildTableSets({
      pools: effPools, partySize: params.partySize, budgetPerPerson: params.budgetPerPerson, reservedExtras: riceReserve,
    }).map(s => ({
      key: s.key, style: s.style,
      dishes: s.dishes.map(x => ({ ...dishToResult(x.dish, x.pool), reason: x.reason })),
      totalPrice: s.totalPrice, perPerson: s.perPerson, overBudget: s.overBudget,
    }));
    const finalSets = tableRecommend.withAutoRice(sets, riceDish, params.partySize);
    logRecommendationMode(req, '一桌菜组合');
    logger.info(`一桌菜推荐: ${params.partySize}人/人均${params.budgetPerPerson}元 来源=${source} 忌口排除=${excluded} 已点排除=${excludedOrdered}`);
    res.json({ success: true, sets: finalSets, excludedAllergy: excluded, excludedOrdered, usedProfile: !!profile });
  } catch (e) {
    logger.error('一桌菜推荐API错误: ' + e.message);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

// 单道更换：同池重新打分，排除桌上已有的菜，返回最高分的替代
app.post('/api/recommend/table/swap', tableLimiter, softAuth, async (req, res) => {
  const params = parseTableParams(req.body || {});
  if (params.error) return res.status(400).json({ success: false, error: params.error });
  const poolKey = req.body.pool;
  if (!TABLE_POOL_KEYS.includes(poolKey)) {
    return res.status(400).json({ success: false, error: 'pool 必须为 cold/hot/signature/staple' });
  }
  try {
    const { allergyKeys: profileAllergyKeys, profile } = await getProfilePrefs(req);
    const allAllergyKeys = new Set(params.allergyKeys);
    profileAllergyKeys.forEach(k => allAllergyKeys.add(k));
    const { pools } = tableRecommend.buildPools(state.dishData || [], [...allAllergyKeys]);
    // 已点排除仅登录用户(与主接口同规——游客无身份,不继承他人记录); 换菜本体 outId 任何身份都必须排除,防"换出同款"
    const isLoggedIn = req.user && req.user.username && req.user.username !== 'guest';
    const orderedIds = new Set(isLoggedIn ? params.excludeIds : []);
    const outId = parseInt(req.body.outId, 10);
    if (Number.isFinite(outId)) orderedIds.add(outId);
    if (isLoggedIn) {
      (await collectOrderedDishIds({ tableNumber: params.tableNumber, avoidRecentDays: params.avoidRecentDays, req }))
        .forEach(id => orderedIds.add(id));
    }
    const candidates = pools[poolKey].filter(d => !orderedIds.has(d.id)).map(d => ({ ...d }));
    if (!candidates.length) return res.status(404).json({ success: false, error: '这个位置已经没有可换的菜了' });
    await scoreTableCandidates(tableRecommend.buildTableUserPrefs(params, profile), candidates);
    candidates.sort((a, b) => (b._score || 0) - (a._score || 0));
    // 预算感知: 同价位段优先——优先换入"换完人均仍在本档位内"的候选;档内无候选才回退全局最高分(前端以"略超预算"角标提示)
    let top = candidates[0];
    const planTotal = Number(req.body.planTotal);
    const outPrice = Number(req.body.outPrice);
    if (Number.isFinite(planTotal) && Number.isFinite(outPrice) && planTotal >= 0) {
      const budgetCap = params.budgetPerPerson * params.partySize;
      const maxSwapIn = outPrice + (budgetCap - planTotal);
      const inBudget = candidates.filter(c => (Number(c.price) || 0) <= maxSwapIn + 0.001);
      if (inBudget.length) top = inBudget[0];
    }
    const styleKey = ['home', 'banquet', 'checkin'].includes(req.body.style) ? req.body.style : 'home';
    const variant = tableRecommend.VARIANTS.find(v => v.key === styleKey);
    logRecommendationMode(req, '一桌菜换菜');
    logger.info(`一桌菜换菜: 池=${poolKey} 排除${orderedIds.size}道`);
    res.json({ success: true, dish: { ...dishToResult(top, poolKey), reason: tableRecommend.reasonFor(top, poolKey, variant, params.partySize) } });
  } catch (e) {
    logger.error('一桌菜换菜API错误: ' + e.message);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

// ═══════════════════════════════════════════════
// 运行时开关（持久化到 runtime_settings.json）
// ───────────────────────────────────────────────
// 目前只有「按用户反馈自动重训」一项。未上线时 feedback 里全是测试用例，
// 拿它们自动重训会把模型带偏 —— 所以默认关闭：反馈照常收集进库，
// 但不自动拿去重训。上线积累到真实反馈后再来后台打开。
const RUNTIME_SETTINGS_PATH = path.join(__dirname, 'runtime_settings.json');
try { Object.assign(runtimeSettings, readJSON(RUNTIME_SETTINGS_PATH)); } catch (e) { /* 首次运行无文件，用默认值 */ }
function saveRuntimeSettings() {
  try { fs.writeFileSync(RUNTIME_SETTINGS_PATH, JSON.stringify(runtimeSettings, null, 2)); }
  catch (e) { logger.warn('保存运行时设置失败: ' + (e?.message || '')); }
}

// ═══════════════════════════════════════════════
// 模型版本管理 & 自动重训练
// ═══════════════════════════════════════════════
let modelInfo = { version: '1.0', trainedAt: null, feedbackCount: 0, r2: 0 };
const MODEL_PATH = path.join(__dirname, 'recommendation_model.pkl');
const MODEL_BACKUP_DIR = path.join(__dirname, 'model_backups');

// 加载模型版本信息
function loadModelInfo() {
  try {
    const data = readJSON(path.join(__dirname, 'model_metrics.json'));
    modelInfo.r2 = data.r2 || 0;
    modelInfo.feedbackCount = data.real_feedback_count || 0;
  } catch(e) { logger.warn('加载模型指标失败: ' + (e?.message || String(e))); }
  // 检查模型文件修改时间作为训练时间
  try {
    const stat = fs.statSync(MODEL_PATH);
    modelInfo.trainedAt = stat.mtime.toISOString();
  } catch(e) { logger.warn('获取模型文件时间失败: ' + (e?.message || String(e))); }
}

// 备份旧模型
function backupOldModel() {
  try {
    if (!fs.existsSync(MODEL_BACKUP_DIR)) fs.mkdirSync(MODEL_BACKUP_DIR);
    const now = new Date();
    const backupName = `recommendation_model_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.pkl`;
    const backupPath = path.join(MODEL_BACKUP_DIR, backupName);
    if (fs.existsSync(MODEL_PATH) && !fs.existsSync(backupPath)) {
      fs.copyFileSync(MODEL_PATH, backupPath);
      logger.info(`模型已备份: ${backupName}`);
    }
    // 只保留最近 5 个备份
    const backups = fs.readdirSync(MODEL_BACKUP_DIR)
      .filter(f => f.startsWith('recommendation_model_'))
      .sort().reverse();
    backups.slice(5).forEach(f => {
      fs.unlinkSync(path.join(MODEL_BACKUP_DIR, f));
    });
  } catch(e) { logger.warn('模型备份失败: ' + (e.message || '')); }
}

// 检查反馈数量并决定是否重训练
let _isRetrainingCheck = false;
async function checkAndRetrain() {
  // 开关关闭时直接跳过（未上线，feedback 里全是测试用例，不拿它们自动重训）
  if (!runtimeSettings.autoRetrain) return;
  if (_isRetrainingCheck || global._isRetraining) return;
  _isRetrainingCheck = true;
  global._isRetraining = true;
  try {
    const pool = db;
    const result = await pool.query(
      "SELECT COUNT(*) FROM feedback WHERE processed = FALSE OR processed IS NULL"
    );
    const newCount = parseInt(result.rows[0].count);
    if (newCount >= 50 && newCount >= modelInfo.feedbackCount + 10) {
      // 有足够的新反馈，触发重训练（异步执行，不阻塞）
      logger.info(`检测到 ${newCount} 条新反馈，开始自动重训练...`);
      backupOldModel();
      const { spawn } = require('child_process');
      const proc = spawn('python', [path.join(__dirname, 'ml', 'retrain_from_feedback.py')], {
        cwd: __dirname, env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['ignore', 'ignore', 'pipe']
      });
      const retrainTimeout = setTimeout(() => { if (proc.exitCode === null) { global._isRetraining = false; _isRetrainingCheck = false; } }, 30000);
      proc.stderr?.on('data', (d) => { logger.warn('自动重训练stderr: ' + d.toString().slice(0, 500)); });
      proc.on('error', (e) => { clearTimeout(retrainTimeout); logger.error('自动重训练进程错误: ' + e.message); _isRetrainingCheck = false; global._isRetraining = false; });
      proc.on('close', async (code) => {
        clearTimeout(retrainTimeout);
        try {
          if (code === 0) {
            const pool = db;
            await pool.query("UPDATE feedback SET processed = TRUE WHERE processed = FALSE OR processed IS NULL");
            modelInfo.feedbackCount = newCount;
            modelInfo.version = (parseFloat(modelInfo.version) + 0.1).toFixed(1);
            modelInfo.trainedAt = new Date().toISOString();
            loadModelInfo();
            logger.info(`自动重训练完成，模型版本: ${modelInfo.version}`);
            try { await syncDishRatings(); } catch(e) { logger.warn('同步菜品评分失败: ' + (e?.message || '')); }
            try { await loadDishData(); } catch(e) { logger.error('刷新菜品缓存失败:', e.message); }
            refreshRecommendationEffect();
          } else {
            logger.warn('自动重训练失败，退出码: ' + code);
          }
        } catch(e) { logger.warn('自动重训练处理失败: ' + (e?.message || '')); }
        finally { _isRetrainingCheck = false; global._isRetraining = false; }
      });
    } else {
      _isRetrainingCheck = false;
      global._isRetraining = false;
    }
  } catch(e) { _isRetrainingCheck = false; global._isRetraining = false; }
}

// 模型版本信息 API

// ═══════════════════════════════════════════════
// 监控和告警系统
// ═══════════════════════════════════════════════

// R² 趋势记录（追加到 metrics_history.json）
function trackMetrics() {
  try {
    const metricsPath = path.join(__dirname, 'model_metrics.json');
    const historyPath = path.join(__dirname, 'metrics_history.json');
    if (!fs.existsSync(metricsPath)) return;
    const metrics = readJSON(metricsPath);
    const entry = {
      timestamp: new Date().toISOString(),
      r2: metrics.r2 || 0,
      mse: metrics.mse || 0,
      rmse: metrics.rmse || 0,
      mae: metrics.mae || 0,
      feedbackCount: metrics.real_feedback_count || 0
    };
    let history = [];
    if (fs.existsSync(historyPath)) {
      history = readJSON(historyPath);
    }
    history.push(entry);
    // 只保留最近 60 条记录
    if (history.length > 60) history = history.slice(-60);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
  } catch(e) { /* 忽略记录错误 */ }
}

// 错误日志监控 + 错误率统计
let errorStats = { hourly: [], total: 0, lastReset: Date.now() };

function checkErrorLog() {
  try {
    const today = new Date().toISOString().slice(0,10);
    const errorLogPath = path.join(__dirname, 'logs', 'error-'+today+'.log');
    if (!fs.existsSync(errorLogPath)) return;
    const stats = fs.statSync(errorLogPath);
    if (Date.now() - stats.mtimeMs < 3600000 && stats.size > 0) {
      logger.warn('错误日志在 1 小时内有更新，请检查日志文件');
    }
  } catch(e) { logger.warn('错误日志监控异常: ' + (e?.message || String(e))); }
}

// 记录 API 错误
function recordApiError(path, status) {
  errorStats.total++;
  errorStats.hourly.push({
    time: Date.now(),
    path: path,
    status: status
  });
  // 只保留最近 1 小时的数据
  const oneHour = 3600000;
  errorStats.hourly = errorStats.hourly.filter(e => Date.now() - e.time < oneHour);
}

// 在请求日志中记录错误
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (res.statusCode >= 400) {
      recordApiError(req.path, res.statusCode);
    }
    if (req.path.startsWith('/api/')) {
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// 综合监控 API

// ═══════════════════════════════════════════════
// 第三阶段：管理后台增强 — 数据导出 / 批量操作 / 用户管理
// ═══════════════════════════════════════════════

// 3.1 数据导出 CSV
function toCSV(headers, rows) {
  const escape = v => {
    const s = String(v || '');
    // 防止 CSV 注入：以 = + - @ 开头的值添加 \t 前缀
    const safe = /^[=+\-@]/.test(s) ? '\t' + s : s;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  return headers.join(',') + '\n' + rows.map(r => r.map(escape).join(',')).join('\n');
}


// 3.2 批量操作

// 3.3 用户管理

// 管理员重置用户密码——顾客忘记密码时店主线下核实身份后操作（系统无邮箱/手机，无法自助找回）

// 管理员订单列表（只读）：按状态/桌号筛选，最新在前

// 3.4 通知（低评分菜品告警）

// 404 兜底（对 /api/ 路径返回 JSON，其他路径返回友好页面）
app.use((req, res) => {
  res.set('Cache-Control', 'no-store');   // 404 页不缓存: 避免浏览器缓存旧版页面/图片加载失败
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ success: false, error: '请求的接口不存在' });
  } else {
    res.status(404).send(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>页面走丢了 · 唐猫庭院</title><style>body{margin:0;background:#faf6f0;color:#2c1810;font-family:'Noto Serif SC','STSong','SimSun',serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}.box{text-align:center;max-width:480px;}.box img{width:min(360px,86vw);display:block;margin:0 auto 18px;border-radius:16px;box-shadow:0 10px 30px rgba(60,30,10,.14);}h1{font-size:1.6rem;letter-spacing:6px;margin:0 0 10px;font-weight:900;}p{color:#756558;font-size:.95rem;line-height:1.9;margin:0 0 22px;}a.btn{display:inline-block;text-decoration:none;color:#fff;background:linear-gradient(135deg,#b83a2a,#d0453a);padding:10px 34px;border-radius:22px;font-size:.95rem;letter-spacing:3px;box-shadow:0 4px 14px rgba(184,58,42,.35);}.code{margin-top:14px;font-size:.75rem;color:#a08b6a;letter-spacing:2px;}</style></head><body><div class="box"><img src="/assets/illustrations/cat-404.webp?v=20260922" alt="唐猫不小心打翻了托盘"><h1>页面走丢了</h1><p>小唐猫不小心打翻了托盘，找不到这个页面。<br>回首页看看今天的推荐吧。</p><a class="btn" href="/">回唐猫庭院</a><div class="code">404 · NOT FOUND</div></div></body></html>`);
  }
});

// 500 友好错误页面（仅在非 API 请求时返回 HTML）
app.use((err, req, res, next) => {
  if (req.path.startsWith('/api/')) return next(err);
  res.status(500).send(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>500 - 服务器错误 · 唐猫庭院</title><link rel="stylesheet" href="node_modules/bootstrap/dist/css/bootstrap.min.css"><link rel="stylesheet" href="styles.css"></head><body><div class="container text-center" style="padding:100px 20px"><h1 style="font-size:6rem;color:#c0392b;font-weight:700;">500</h1><h2 class="mb-4" style="color:#8b7a6a;">😿 服务器出了点小问题</h2><p class="text-muted mb-4">请稍后再试，或联系管理员。</p><a href="/" class="btn btn-primary px-4 py-2" style="background:#c0392b;border-color:#c0392b;border-radius:50px;"><i class="bi bi-house-door"></i> 返回首页</a></div></body></html>`);
});

// 数据归档/清理任务（每 24 小时执行）
async function cleanupOldData() {
  try {
    const pool = db;
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000 * 30).toISOString(); // 30 天前
    // 永久删除下架超过 30 天的菜品
    const cleared = await pool.query(
      "DELETE FROM dishes WHERE is_active = FALSE AND updated_at < $1",
      [dayAgo]
    );
    // 清理 90 天前的旧推荐日志
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const oldLogs = await pool.query(
      "DELETE FROM recommendation_log WHERE created_at < $1",
      [ninetyDaysAgo]
    );
    // 清理已过期的 token_blacklist 记录
    const expiredTokens = await pool.query(
      "DELETE FROM token_blacklist WHERE expires_at < NOW()"
    );
    if (cleared.rowCount > 0 || oldLogs.rowCount > 0 || expiredTokens.rowCount > 0) {
      logger.info(`数据清理完成：删除 ${cleared.rowCount} 条下架超30天菜品，${oldLogs.rowCount} 条90天前推荐日志，${expiredTokens.rowCount} 条过期token`);
    }
  } catch (e) {
    logger.warn('数据清理任务异常: ' + (e?.message || String(e)));
  }
}

// 启动服务器
// 启动服务器（支持 HTTP 和可选的 HTTPS）
const http = require('http');
const https = require('https');

const httpServer = http.createServer(app);

httpServer.listen(PORT, () => {
  logger.info(`服务器运行在 http://localhost:${PORT}`);
  startPythonWorker();
  loadModelInfo();
  setTimeout(trackMetrics, 10000);
  setInterval(checkAndRetrain, 1800000);
  setInterval(trackMetrics, 3600000);
  setInterval(checkErrorLog, 600000);
  setInterval(cleanupOldData, 86400000); // 每 24 小时清理旧数据
});

// 幂等迁移：recommendation_log 补 mode 列（一桌菜埋点用）。失败仅记日志不阻塞启动，
// 埋点写入自身有 catch 兜底，列缺失的那几秒只是丢埋点不丢功能。
db.query(`ALTER TABLE recommendation_log ADD COLUMN IF NOT EXISTS mode VARCHAR(50) DEFAULT '单菜推荐'`)
  .then(() => logger.info('recommendation_log.mode 列就绪'))
  .catch(e => logger.error('recommendation_log.mode 迁移失败: ' + e.message));

// 幂等迁移：orders 补 completed_at 列（厨房看板"当日已完成"按完成时间归档，
// 原来回退用 created_at 近似——跨天完成的单会被归错档）。GET /api/orders 走 SELECT * 自动带出。
db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`)
  .then(() => logger.info('orders.completed_at 列就绪'))
  .catch(e => logger.error('orders.completed_at 迁移失败: ' + e.message));

// 可选 HTTPS（配置 SSL 证书路径后自动启用）
const SSL_KEY = process.env.SSL_KEY || '';
const SSL_CERT = process.env.SSL_CERT || '';
const SSL_PORT = Math.max(1, Math.min(65535, parseInt(process.env.SSL_PORT || '3443'))) || 3443;

if (SSL_KEY && SSL_CERT && fs.existsSync(SSL_KEY) && fs.existsSync(SSL_CERT)) {
  try {
    const sslOptions = {
      key: fs.readFileSync(SSL_KEY),
      cert: fs.readFileSync(SSL_CERT),
    };
    https.createServer(sslOptions, app).listen(SSL_PORT, () => {
      logger.info(`HTTPS 服务器运行在 https://localhost:${SSL_PORT}`);
    });
  } catch (e) {
    logger.warn('HTTPS 启动失败（证书配置可能有误）: ' + e.message);
  }
}

// 导出 app 供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { app };
}

// ═══════════════════════════════════════════════
// 全局未捕获异常处理（防止进程崩溃）
// ═══════════════════════════════════════════════
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未捕获的 Promise 拒绝:', reason instanceof Error ? reason.message : String(reason));
});

process.on('uncaughtException', (err) => {
  logger.error('未捕获的异常:', err.message, { stack: err.stack });
  // 记录错误后不退出进程。服务器可能处于不稳定状态，但继续运行比崩溃更好
  // 后续请求仍可能失败，但不会导致全部服务中断
});

// ═══════════════════════════════════════════════
// 优雅关闭：SIGTERM / SIGINT 时释放资源
// ═══════════════════════════════════════════════
let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`收到 ${signal} 信号，开始优雅关闭...`);

  // 1. 停止接受新连接
  if (typeof httpServer !== 'undefined' && httpServer) {
    httpServer.close(() => logger.info('HTTP 服务器已关闭'));
    // 强制超时：10 秒后不管是否完成，强制退出
    setTimeout(() => {
      logger.warn('优雅关闭超时，强制退出');
      process.exit(1);
    }, 10000).unref();
  }

  // 2. 关闭 Python Worker 进程
  try {
    if (typeof pythonWorker !== 'undefined' && pythonWorker && pythonWorker.exitCode === null) {
      // 清理所有待处理请求
      if (typeof pendingRequests !== 'undefined' && pendingRequests) {
        for (const [, req] of pendingRequests) {
          if (req.res) req.res.status(503).json({ success: false, error: '服务器正在关闭，请稍后重试' });
        }
        pendingRequests.clear();
      }
      pythonWorker.kill();
      logger.info('Python Worker 已关闭');
    }
  } catch (e) {
    logger.warn('关闭 Python Worker 失败: ' + (e?.message || String(e)));
  }

  // 3. 关闭数据库连接池
  try {
    const pool = db;
    if (pool && typeof pool.end === 'function') {
      await pool.end();
      logger.info('数据库连接池已关闭');
    }
  } catch (e) {
    logger.warn('关闭数据库连接池失败: ' + (e?.message || String(e)));
  }

  logger.info('优雅关闭完成，进程退出');
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));