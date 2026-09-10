// 唐猫庭院 - 生产环境服务器 v2
require('dotenv').config();
const express = require('express');
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

// 带 BOM 剥离的 JSON 文件读取
function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

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
    }
    fs.renameSync(req.file.path, newPath);
    const imageUrl = '/uploads/' + newName;
    await pool.query('UPDATE dishes SET image_url = $1 WHERE id = $2', [imageUrl, dishId]);
    res.json({ success: true, imageUrl });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 静态文件服务（只允许前端需要的文件类型，阻止敏感文件泄露）
const ALLOWED_STATIC_EXTS = ['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
const BLOCKED_STATIC_PATHS = ['.env', 'server.js', 'db.js', 'auth.js', 'user_storage.js', 'logger.js', 'build.js', 'package.json', 'package-lock.json', 'ecosystem.config.js', 'Dockerfile', 'docker-compose.yml', 'deploy.bat', 'deploy.sh', 'install.bat', 'start.bat', 'setup_backup.bat', 'backup_db.js', 'migrate_to_pg.js', 'sample_data.sql', 'ngrok.exe', 'fix_', 'model_metrics.json', 'metrics_history.json', 'runtime_settings.json', 'recommendation_model.pkl', 'feature_importance.json', 'dishes_current.json', 'dishes_verify.json', 'registry.json', 'get_feature_importance.py', 'get_metrics.py', 'retrain_from_feedback.py', 'train_ml_model.py', 'train_restaurant_model.py', 'predict_worker.py', 'convert_report.py', 'create_optimized_report.py', 'rgzn.py', 'logs/', 'backups/', 'model_backups/', 'tests/', '.retired/', '.ai/', '__pycache__/', '.git/', 'ssl/', 'dist/', 'screenshots/', '.playwright-mcp/', '.github/', '唐猫菜品/', '*.pem', '*.key'];
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
let dishData = [];

async function loadDishData() {
  try {
    let pool;
    try {
      pool = require('./db');
    } catch(e) {
      logger.error('db模块加载失败:', e?.message || String(e));
      dishData = []; return;
    }
    if (!pool || !pool.connect) {
      logger.error('db模块无效');
      dishData = []; return;
    }
    // 用同一个连接执行 SET + SELECT，确保编码设置生效
    const client = await pool.connect();
    try {
      await client.query("SET client_encoding = 'UTF8'");
      const result = await client.query('SELECT d.*, COALESCE(oc.order_count, 0) as order_count FROM dishes d LEFT JOIN (SELECT dish_id, COUNT(*) as order_count FROM (SELECT jsonb_array_elements(items)->>\'id\' as dish_id FROM orders) o WHERE o.dish_id IS NOT NULL GROUP BY dish_id) oc ON d.id::text = oc.dish_id ORDER BY d.id');
    dishData = result.rows.map(d => ({
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
      description: d.description || '',
      price_unit: d.price_unit || '',
      image_url: d.image_url || '',
      order_count: parseInt(d.order_count) || 0,
      type: '偏好推荐',
      reason: '综合多项偏好匹配',
      matchIndex: 0,
      matchRate: 0.5,
    }));
    logger.info(`成功加载${dishData.length}条菜品数据`);
    } finally { client.release(); }
  } catch (e) {
    logger.error('加载菜品数据失败: ' + (e?.code || '') + ' ' + (e?.message || JSON.stringify(e) || '未知错误'));
    dishData = [];
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
app.get('/api/dishes', (req, res) => res.json({ success: true, dishes: dishData }));

// ─── 本桌账单（免登录，凭签名桌码）───
// 桌码 = <桌号>.<HMAC前16位>：没有签名密钥无法伪造，避免"随便输桌号就能看别人账单"
const TABLE_SECRET = process.env.TABLE_SECRET || process.env.JWT_SECRET || 'tangmao-table-secret';
function tableSig(n) { return require('crypto').createHmac('sha256', TABLE_SECRET).update(String(n)).digest('hex').slice(0, 16); }
// 常量时间比较：避免字符串 !== 逐字符短路产生的计时侧信道（与 admin 登录同一套路）
function tableSigEq(expect, got) {
  const a = Buffer.from(String(expect)), b = Buffer.from(String(got));
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}
app.get('/api/table-view', async (req, res) => {
  try {
    const t = String(req.query.t || '');
    const idx = t.lastIndexOf('.');
    const rawNum = idx > 0 ? t.slice(0, idx) : '';
    const sig = idx > 0 ? t.slice(idx + 1) : '';
    const num = /^\d{1,2}$/.test(rawNum) ? String(parseInt(rawNum, 10)).padStart(2, '0') : '';
    // 兼容旧版一位桌号链接：签名按原样或补零后匹配均可
    if (!num || !sig || !(tableSigEq(tableSig(num), sig) || tableSigEq(tableSig(rawNum), sig))) {
      return res.status(403).json({ success: false, error: '无效的桌码' });
    }
    const pool = db;
    const r = await pool.query(
      "SELECT id, items, total_price, dish_count, status, created_at FROM orders WHERE table_number = $1 AND status <> 'cancelled' ORDER BY id DESC LIMIT 20",
      [num]
    );
    res.json({ success: true, tableNumber: num, orders: r.rows });
  } catch (e) { logger.error('桌码查询失败:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

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

// ═══════════════════════════════════════════════
// 管理后台 API
// ═══════════════════════════════════════════════
app.get('/api/admin/stats', async (req, res) => {
  try {
    const pool = db;
    // 今日推荐次数（最近24小时）
const [today, guest, user, totalRec, totalFb, avgRating, totalUsers, totalDishes] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM recommendation_log WHERE created_at > NOW() - INTERVAL '24 hours'"),
      pool.query("SELECT COUNT(*) FROM recommendation_log WHERE user_type='guest' AND created_at > NOW() - INTERVAL '24 hours'"),
      pool.query("SELECT COUNT(*) FROM recommendation_log WHERE user_type='user' AND created_at > NOW() - INTERVAL '24 hours'"),
      pool.query('SELECT COUNT(*) FROM recommendation_log'),
      pool.query('SELECT COUNT(*) FROM feedback'),
      pool.query("SELECT ROUND(AVG(rating),2) as avg FROM feedback"),
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query("SELECT COUNT(*) FROM dishes WHERE is_active = TRUE")
    ]);
    res.json({
      success: true,
      stats: {
        todayRecommendations: parseInt(today.rows[0].count),
        todayGuest: parseInt(guest.rows[0].count),
        todayUser: parseInt(user.rows[0].count),
        totalRecommendations: parseInt(totalRec.rows[0].count),
        totalFeedback: parseInt(totalFb.rows[0].count),
        avgRating: parseFloat(avgRating.rows[0]?.avg || 0),
        totalUsers: parseInt(totalUsers.rows[0].count),
        totalDishes: parseInt(totalDishes.rows[0].count),
      }
    });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 菜品热度排行
app.get('/api/admin/popular-dishes', async (req, res) => {
  try {
    const pool = db;
    const result = await pool.query(
      "SELECT d.id, d.name, d.category, d.price, d.rating, COUNT(f.id) as feedback_count, ROUND(AVG(f.rating),2) as avg_rating FROM dishes d LEFT JOIN feedback f ON d.id = f.dish_id WHERE d.is_active = TRUE GROUP BY d.id ORDER BY feedback_count DESC, avg_rating DESC NULLS LAST LIMIT 62"
    );
    res.json({ success: true, dishes: result.rows });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 反馈汇总
app.get('/api/admin/feedback-summary', async (req, res) => {
  try {
    const pool = db;
    const result = await pool.query(
      "SELECT f.id, f.dish_id, d.name as dish_name, f.rating, f.created_at FROM feedback f LEFT JOIN dishes d ON f.dish_id = d.id ORDER BY f.created_at DESC LIMIT 50"
    );
    const dist = await pool.query("SELECT rating, COUNT(*) FROM feedback GROUP BY rating ORDER BY rating");
    res.json({ success: true, feedbacks: result.rows, distribution: dist.rows });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 菜品管理 API
app.post('/api/admin/dish', async (req, res) => {
  try {
    const { name, category, spiciness, saltiness, sweetness, price, rating, tags, allergies, isHalal, isVegetarian, description } = req.body;
    if (!name || name.trim().length < 2) return res.status(400).json({ success: false, error: '菜名至少2个字符' });
    if (name.trim().length > 100) return res.status(400).json({ success: false, error: '菜名不能超过100个字符' });
    if (description && description.length > 500) return res.status(400).json({ success: false, error: '描述不能超过500个字符' });
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ success: false, error: '价格不能为负数' });
    const ratingNum = parseFloat(rating);
    if (isNaN(ratingNum) || ratingNum < 0 || ratingNum > 5) return res.status(400).json({ success: false, error: '评分必须在0-5之间' });
    const pool = db;
    const result = await pool.query(
      `INSERT INTO dishes (name, category, spiciness, saltiness, sweetness, price, rating, tags, allergies, is_halal, is_vegetarian, is_active, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12) RETURNING id`,
      [name, category||null, spiciness||'不辣', saltiness||'适中', sweetness||'无味', priceNum, ratingNum, Array.isArray(tags) ? `{${tags.join(',')}}` : (tags ? `{${String(tags).split(',').map(t => t.trim()).filter(Boolean).join(',')}}` : '{}'), allergies ? JSON.stringify(allergies) : '{}', isHalal||false, isVegetarian||false, description||null]
    );
    res.json({ success: true, message: '添加成功', id: result.rows[0].id });
    try { await loadDishData(); } catch(e) { logger.error('刷新菜品缓存失败:', e.message); }
  } catch (e) { logger.error('添加菜品失败:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

app.put('/api/admin/dish/:id', async (req, res) => {
  try {
    const dishId = parseInt(req.params.id);
    if (isNaN(dishId) || dishId <= 0) return res.status(400).json({ success: false, error: '无效的菜品ID' });
    const { name, category, spiciness, saltiness, sweetness, price, rating, tags, is_active, allergies, isHalal, isVegetarian, description } = req.body;
    if (name !== undefined && name.trim().length < 2) return res.status(400).json({ success: false, error: '菜名至少2个字符' });
    if (price !== undefined) { const p = parseFloat(price); if (isNaN(p) || p < 0) return res.status(400).json({ success: false, error: '价格不能为负数' }); }
    if (rating !== undefined) { const r = parseFloat(rating); if (isNaN(r) || r < 0 || r > 5) return res.status(400).json({ success: false, error: '评分必须在0-5之间' }); }
    const pool = db;
    const sets = []; const vals = []; let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name); }
    if (category !== undefined) { sets.push(`category = $${idx++}`); vals.push(category); }
    if (spiciness !== undefined) { sets.push(`spiciness = $${idx++}`); vals.push(spiciness); }
    if (saltiness !== undefined) { sets.push(`saltiness = $${idx++}`); vals.push(saltiness); }
    if (sweetness !== undefined) { sets.push(`sweetness = $${idx++}`); vals.push(sweetness); }
    if (price !== undefined) { sets.push(`price = $${idx++}`); vals.push(parseFloat(price)); }
    if (rating !== undefined) { sets.push(`rating = $${idx++}`); vals.push(parseFloat(rating)); }
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(is_active); }
    if (tags !== undefined) { const cleanTags = tags.split(',').map(t => t.trim()).filter(Boolean).join(','); sets.push(`tags = $${idx++}::text[]`); vals.push(`{${cleanTags}}`); }
    if (allergies !== undefined) { sets.push(`allergies = $${idx++}::jsonb`); vals.push(JSON.stringify(allergies)); }
    if (isHalal !== undefined) { sets.push(`is_halal = $${idx++}`); vals.push(isHalal); }
    if (isVegetarian !== undefined) { sets.push(`is_vegetarian = $${idx++}`); vals.push(isVegetarian); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
    if (!sets.length) return res.status(400).json({ success: false, error: '没有要更新的字段' });
    vals.push(dishId);
    await pool.query(`UPDATE dishes SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    res.json({ success: true, message: '更新成功' });
    try { await loadDishData(); } catch(e) { logger.error('刷新菜品缓存失败:', e.message); }
  } catch (e) { logger.error('更新菜品失败:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

app.delete('/api/admin/dish/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) return res.status(400).json({ success: false, error: '无效的菜品ID' });
    const pool = db;
    await pool.query('UPDATE dishes SET is_active = NOT is_active WHERE id = $1', [id]);
    res.json({ success: true, message: '状态已切换' });
    try { await loadDishData(); } catch(e) { logger.error('刷新菜品缓存失败:', e.message); }
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

app.delete('/api/admin/dish/:id/permanent', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) return res.status(400).json({ success: false, error: '无效的菜品ID' });
    const pool = db;
    await pool.query('DELETE FROM dishes WHERE id = $1', [id]);
    res.json({ success: true, message: '已永久删除' });
    try { await loadDishData(); } catch(e) { logger.error('刷新菜品缓存失败:', e.message); }
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 用户注册
app.post('/api/user/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
    if (username.trim().length < 2) return res.status(400).json({ success: false, error: '用户名至少2个字符' });
    if (username.trim().length > 50) return res.status(400).json({ success: false, error: '用户名不能超过20个字符' });
    if (password.length < 8) return res.status(400).json({ success: false, error: '密码至少8个字符' });
    if (password.length > 128) return res.status(400).json({ success: false, error: '密码不能超过20个字符' });
    if (!/[A-Z]/.test(password)) return res.status(400).json({ success: false, error: '密码必须包含大写字母' });
    if (!/[a-z]/.test(password)) return res.status(400).json({ success: false, error: '密码必须包含小写字母' });
    if (!/[0-9]/.test(password)) return res.status(400).json({ success: false, error: '密码必须包含数字' });
    const existing = await userStorage.findUserByUsername(username);
    if (existing) return res.status(400).json({ success: false, error: '用户名已存在' });
    const newUser = await userStorage.createUser(username, password);
    if (newUser) {
      logger.info(`新用户注册：${username}`);
      const token = generateToken({ username: newUser.username, id: newUser.id });
      res.json({ success: true, message: '注册成功', token, user: { username: newUser.username } });
    } else {
      res.status(500).json({ success: false, error: '注册失败' });
    }
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 用户登录
app.post('/api/user/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
    const user = await userStorage.validateLogin(username, password);
    if (!user) return res.status(401).json({ success: false, error: '用户名或密码错误' });
    const token = generateToken(user);
    logger.info(`用户登录：${username}`);
    res.json({ success: true, message: '登录成功', token, user: { username: user.username, preferences: user.preferences || {}, favorites: user.favorites || [], blacklist: user.blacklist || [] } });
  } catch (e) { logger.error('登录失败:', e.message); res.status(500).json({ success: false, error: '服务器错误' }); }
});

// 用户偏好保存（软身份验证，有token则校验所有权，无token也放行）
app.post('/api/user-preferences', authMiddleware, async (req, res) => {
  try {
    const { preferences } = req.body;
    const username = req.user.username;
    if (!username) return res.status(400).json({ success: false, error: '缺少用户名' });
    const updated = await userStorage.updateUser(username, { preferences: preferences || {} });
    if (updated) {
      res.json({ success: true, message: '偏好已保存' });
    } else {
      res.status(404).json({ success: false, error: '用户不存在' });
    }
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 用户收藏同步（强制认证，使用 token 中的用户名，防止越权篡改他人数据）
app.post('/api/user-favorites', authMiddleware, async (req, res) => {
  try {
    const { favorites } = req.body;
    const username = req.user.username;
    if (!username) return res.status(400).json({ success: false, error: '缺少用户名' });
    const updated = await userStorage.updateUser(username, { favorites: favorites || [] });
    res.json({ success: true, message: '收藏已同步' });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

app.post('/api/user-blacklist', authMiddleware, async (req, res) => {
  try {
    const { blacklist } = req.body;
    const username = req.user.username;
    if (!username) return res.status(400).json({ success: false, error: '缺少用户名' });
    const updated = await userStorage.updateUser(username, { blacklist: blacklist || [] });
    res.json({ success: true, message: '黑名单已同步' });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 退出登录（吊销当前 token）
app.post('/api/user/logout', authMiddleware, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const revoked = await require('./auth').revokeToken(token);
      if (!revoked) {
        logger.warn('退出登录：token 吊销失败');
      }
    }
    res.json({ success: true, message: '已退出登录' });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 注销账号（需要JWT认证，且只能注销自己的账号）
app.post('/api/user/delete', authMiddleware, async (req, res) => {
  try {
    const username = req.user.username;
    if (!username) return res.status(400).json({ success: false, error: '缺少用户名' });
    // 吊销当前token，防止删除后token仍可用
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try { await require('./auth').revokeToken(token); } catch (e) { logger.warn('注销账号：token 吊销失败:', e.message); }
    }
    await userStorage.removeUser(username);
    res.json({ success: true, message: '账号已注销' });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 偏好记录
app.post('/api/preference-log', softAuth, async (req, res) => {
  try {
    const { spiciness, saltiness, sweetness, price, calorie, religion, allergies, userId, recommendationMode } = req.body;
    const pool = db;
    await pool.query(
      "INSERT INTO preference_log (spiciness, saltiness, sweetness, price, calorie, religion, allergies, user_id, recommendation_mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [spiciness||null, saltiness||null, sweetness||null, price||null, calorie||null, religion||null, allergies||[], userId||'guest', recommendationMode||'auto']
    );
    res.json({ success: true });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 推荐次数记录
app.post('/api/recommendation-log', softAuth, async (req, res) => {
  try {
    const { userType, userId } = req.body;
    const pool = db;
    await pool.query('INSERT INTO recommendation_log (user_type, user_id) VALUES ($1,$2)', [userType||'guest', userId||'guest']);
    res.json({ success: true });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 偏好统计 API
app.get('/api/admin/preference-stats', async (req, res) => {
  try {
    const pool = db;
    const fields = ['spiciness','saltiness','sweetness','price','calorie','religion'];
    const result = {};
    for (const field of fields) {
      const allowedFields = ['spiciness','saltiness','sweetness','price','calorie','religion'];
      if (!allowedFields.includes(field)) { continue; }
      const q = await pool.query(`SELECT ${field}, COUNT(*) FROM preference_log WHERE ${field} IS NOT NULL GROUP BY ${field} ORDER BY COUNT(*) DESC`);
      result[field] = q.rows.reduce((acc, r) => { acc[r[field] || '无'] = parseInt(r.count); return acc; }, {});
    }
    res.json({ success: true, stats: result });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// ═══════════════════════════════════════════════
// 管理后台增强 API
// ═══════════════════════════════════════════════

// 每日推荐趋势
app.get('/api/admin/daily-recommendations', async (req, res) => {
  try {
    const pool = db;
    const q = await pool.query(`
      SELECT DATE(created_at) as day, COUNT(*) as total,
             COUNT(*) FILTER (WHERE user_type='guest') as guest_count,
             COUNT(*) FILTER (WHERE user_type='user') as user_count
      FROM recommendation_log
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY day ORDER BY day
    `);
    res.json({ success: true, data: q.rows });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 用户活跃度
app.get('/api/admin/user-activity', async (req, res) => {
  try {
    const pool = db;
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    const dailyActive = await pool.query(`
      SELECT DATE(created_at) as day, COUNT(DISTINCT user_id) as active_users
      FROM recommendation_log
      WHERE user_id IS NOT NULL AND user_id != 'guest' AND created_at > NOW() - INTERVAL '14 days'
      GROUP BY day ORDER BY day
    `);
    const feedbackUsers = await pool.query('SELECT COUNT(DISTINCT user_id) FROM feedback WHERE user_id IS NOT NULL');
    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(totalUsers.rows[0].count),
        feedbackUsers: parseInt(feedbackUsers.rows[0].count),
        dailyActive: dailyActive.rows
      }
    });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 推荐日志详情
app.get('/api/admin/recommendation-details', async (req, res) => {
  try {
    const pool = db;
    const q = await pool.query(`
      SELECT rl.id, rl.user_type, rl.user_id, rl.created_at,
             f.id as feedback_id, f.rating, f.dish_id as feedback_dish_id
      FROM recommendation_log rl
      LEFT JOIN feedback f ON rl.user_id = f.user_id
        AND f.created_at BETWEEN rl.created_at AND rl.created_at + INTERVAL '5 minutes'
      ORDER BY rl.created_at DESC LIMIT 100
    `);
    res.json({ success: true, data: q.rows });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 模型训练历史
app.get('/api/admin/model-history', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const backupDir = path.join(__dirname, 'model_backups');
    const history = [];
    // 当前模型
    try {
      const data = readJSON(path.join(__dirname, 'model_metrics.json'));
      history.push({
        version: modelInfo.version || '1.0',
        trainedAt: modelInfo.trainedAt || null,
        r2: data.r2 || 0,
        feedbackCount: data.real_feedback_count || 0,
        isCurrent: true,
        file: 'recommendation_model.pkl'
      });
    } catch(e) { logger.warn('读取当前模型指标失败: ' + (e?.message || String(e))); }
    // 备份模型
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.pkl')).sort().reverse();
      files.forEach((f, i) => {
        const stat = fs.statSync(path.join(backupDir, f));
        // 尝试读取备份对应的指标
        let backupMetrics = { r2: 0, feedbackCount: 0 };
        history.push({
          version: '1.' + (history.length),
          trainedAt: stat.mtime.toISOString(),
          r2: backupMetrics.r2,
          feedbackCount: backupMetrics.feedbackCount,
          isCurrent: false,
          file: f,
          sizeKB: (stat.size / 1024).toFixed(1)
        });
      });
    }
    res.json({ success: true, history });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 运行时开关读写（目前只有 autoRetrain：是否按用户反馈自动重训）
app.get('/api/admin/settings', (req, res) => res.json({ success: true, settings: { ...runtimeSettings } }));
app.post('/api/admin/settings', (req, res) => {
  try {
    const { autoRetrain } = req.body || {};
    if (typeof autoRetrain === 'boolean') runtimeSettings.autoRetrain = autoRetrain;
    saveRuntimeSettings();
    logger.info(`自动重训开关 → ${runtimeSettings.autoRetrain ? '开启' : '关闭'}`);
    res.json({ success: true, settings: { ...runtimeSettings } });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 一键触发重训练（异步执行，不阻塞服务器）
app.post('/api/admin/retrain', async (req, res) => {
  try {
    // 反馈重训开关关闭时一律不重训（手动按钮走的也是 retrain_from_feedback.py，
    // 同样吃 feedback 数据 —— 未上线时那些都是测试用例，会把模型带偏）
    if (!runtimeSettings.autoRetrain) {
      return res.status(409).json({ success: false, message: '用户反馈重训已关闭（未上线时反馈都是测试数据）。如需重训，请先打开上方开关。' });
    }
    // 检查是否正在训练
    if (global._isRetraining || _isRetrainingCheck) {
      return res.status(409).json({ success: false, message: '模型正在训练中，请稍后' });
    }
    global._isRetraining = true;
    _isRetrainingCheck = true;
    logger.info('管理员手动触发重训练...');
    backupOldModel();
    // 异步执行训练，不阻塞事件循环
    const { spawn } = require('child_process');
    const proc = spawn('python', [path.join(__dirname, 'retrain_from_feedback.py')], {
      cwd: __dirname,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      stdio: ['ignore', 'ignore', 'pipe']
    });
    // 安全超时：30 秒后清除标志，仅当进程挂起时释放锁（防进程挂起导致标志永久锁定）
    const retrainTimeout = setTimeout(() => { if (proc.exitCode === null) { global._isRetraining = false; _isRetrainingCheck = false; } }, 30000);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', (e) => { clearTimeout(retrainTimeout); logger.error('手动重训练进程错误: ' + e.message); global._isRetraining = false; _isRetrainingCheck = false; });
    proc.on('close', async (code) => {
      clearTimeout(retrainTimeout);
      global._isRetraining = false;
      _isRetrainingCheck = false;
      if (code === 0) {
        try {
          const pool = db;
          await pool.query("UPDATE feedback SET processed = TRUE WHERE processed = FALSE OR processed IS NULL");
        } catch(e) { logger.warn('标记反馈已处理失败: ' + (e?.message || String(e))); }
        modelInfo.version = (parseFloat(modelInfo.version) + 0.1).toFixed(1);
        modelInfo.trainedAt = new Date().toISOString();
        loadModelInfo();
        logger.info(`手动重训练完成，模型版本: ${modelInfo.version}`);
        try { await syncDishRatings(); } catch(e) { logger.warn('同步菜品评分失败: ' + (e?.message || '')); }
        try { await loadDishData(); } catch(e) { logger.error('刷新菜品缓存失败:', e.message); }
      } else {
        logger.warn('手动重训练失败: ' + (stderr?.substring(0, 200) || ''));
      }
      // 更新模型监控
      try { trackMetrics(); } catch(e) {}
    });
    // 立即返回，训练在后台进行
    res.json({ success: true, message: '重训练已开始，将在后台进行', training: true });
  } catch (e) {
    global._isRetraining = false;
    _isRetrainingCheck = false;
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

// 推荐效果不佳的菜品分析
app.get('/api/admin/worst-dishes', async (req, res) => {
  try {
    const pool = db;
    const q = await pool.query(`
      SELECT d.id, d.name, d.category, d.price, d.rating as dish_rating,
             COUNT(f.id) as feedback_count,
             ROUND(AVG(f.rating), 2) as avg_feedback_rating,
             MIN(f.rating) as min_rating
      FROM dishes d
      JOIN feedback f ON d.id = f.dish_id
      WHERE d.is_active = TRUE
      GROUP BY d.id, d.name
      HAVING COUNT(f.id) >= 1
      ORDER BY avg_feedback_rating ASC, feedback_count DESC
      LIMIT 20
    `);
    res.json({ success: true, dishes: q.rows });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 模型版本对比
app.get('/api/admin/model-compare', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const backupDir = path.join(__dirname, 'model_backups');
    const versions = [];

    // 当前模型
    try {
      const data = readJSON(path.join(__dirname, 'model_metrics.json'));
      versions.push({
        label: '当前模型',
        version: modelInfo.version || '1.0',
        trainedAt: modelInfo.trainedAt || null,
        r2: data.r2 || 0,
        mse: data.mse || 0,
        rmse: data.rmse || 0,
        mae: data.mae || 0,
        feedbackCount: data.real_feedback_count || 0,
        isCurrent: true
      });
    } catch(e) { logger.warn('读取模型对比指标失败: ' + (e?.message || String(e))); }

    // 备份模型
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.pkl')).sort().reverse().slice(0, 5);
      files.forEach((f, i) => {
        const stat = fs.statSync(path.join(backupDir, f));
        versions.push({
          label: '备份 ' + (i + 1),
          version: '1.' + (i + 1),
          trainedAt: stat.mtime.toISOString(),
          r2: 0,
          mse: 0,
          rmse: 0,
          mae: 0,
          feedbackCount: 0,
          isCurrent: false,
          file: f,
          sizeKB: (stat.size / 1024).toFixed(1)
        });
      });
    }

    // 当前模型特征重要性（使用缓存，避免每次启动 Python 进程）
    let currentImportance = [];
    if (featureImportanceCache && featureImportanceCache.importance) {
      currentImportance = featureImportanceCache.importance;
    }

    res.json({ success: true, versions, currentImportance });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 推荐点击率统计
app.get('/api/admin/recommendation-stats', async (req, res) => {
  try {
    const pool = db;
    // 总推荐次数
    const totalRec = await pool.query('SELECT COUNT(*) FROM recommendation_log');
    const total = parseInt(totalRec.rows[0].count);
    // 有反馈的推荐（推荐后5分钟内有反馈）
    const withFeedback = await pool.query(`
      SELECT COUNT(DISTINCT rl.id) as cnt
      FROM recommendation_log rl
      JOIN feedback f ON rl.user_id = f.user_id
        AND f.created_at BETWEEN rl.created_at AND rl.created_at + INTERVAL '5 minutes'
    `);
    const feedbackCount = parseInt(withFeedback.rows[0].cnt);
    // 整体满意度分布
    const satDist = await pool.query(`
      SELECT rating, COUNT(*) FROM feedback
      WHERE dish_id = 0 OR dish_id IS NULL
      GROUP BY rating ORDER BY rating
    `);
    // 平均反馈评分
    const avgRating = await pool.query("SELECT ROUND(AVG(rating),2) as avg FROM feedback WHERE dish_id > 0");

    res.json({
      success: true,
      stats: {
        totalRecommendations: total,
        feedbackRate: total > 0 ? (feedbackCount / total * 100).toFixed(1) : 0,
        feedbackCount,
        avgRating: parseFloat(avgRating.rows[0]?.avg || 0),
        satisfactionDistribution: satDist.rows
      }
    });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 订单 API（软身份验证）
app.post('/api/order', softAuth, async (req, res) => {
  try {
    const { userId, items, totalPrice, tableNumber } = req.body;
    if (!items || !items.length) return res.status(400).json({ success: false, error: '订单不能为空' });
    if (items.some(i => { const p = parseFloat(i.price); return isNaN(p) || p < 0; })) return res.status(400).json({ success: false, error: '商品价格无效' });
    if (totalPrice !== undefined && totalPrice !== null && totalPrice !== '') { const tp = parseFloat(totalPrice); if (!isNaN(tp) && tp < 0) return res.status(400).json({ success: false, error: '订单总价不能为负数' }); }
    const effectiveUserId = req.user?.username || 'guest';
    const pool = db;
    // 幂等性检查：同一用户 10 秒内相同内容的订单视为重复
    const itemsStr = JSON.stringify(items);
    const tenSecAgo = new Date(Date.now() - 10000).toISOString();
    const existing = await pool.query(
      "SELECT id FROM orders WHERE user_id = $1 AND items::text = $2 AND created_at > $3 LIMIT 1",
      [effectiveUserId, itemsStr, tenSecAgo]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: true, message: '订单已存在（防重复提交）', orderId: existing.rows[0].id });
    }
    // 检查 orders 表是否有 table_number 列
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='table_number'");
    let result;
    if (colCheck.rows.length > 0) {
      result = await pool.query(
        "INSERT INTO orders (user_id, items, total_price, dish_count, table_number) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [effectiveUserId, JSON.stringify(items), totalPrice || 0, items.length, tableNumber || null]
      );
    } else {
      result = await pool.query(
        "INSERT INTO orders (user_id, items, total_price, dish_count) VALUES ($1,$2,$3,$4) RETURNING id",
        [effectiveUserId, JSON.stringify(items), totalPrice || 0, items.length]
      );
    }
    res.json({ success: true, message: '订单已创建', orderId: result.rows[0].id });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 加菜：往现有订单追加菜品（同订单累计，一张小票）
app.post('/api/order/:id/add', softAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { items } = req.body;
    if (!orderId || !items || !items.length) return res.status(400).json({ success: false, error: '参数无效' });
    if (items.some(i => { const p = parseFloat(i.price); return isNaN(p) || p < 0; })) return res.status(400).json({ success: false, error: '商品价格无效' });
    const pool = db;
    const existing = await pool.query('SELECT items, total_price, status FROM orders WHERE id=$1', [orderId]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: '订单不存在' });
    const row = existing.rows[0];
    if (row.status === 'completed' || row.status === 'cancelled') return res.status(400).json({ success: false, error: '订单已' + (row.status === 'completed' ? '完成' : '取消') + '，不能加菜' });
    const oldItems = Array.isArray(row.items) ? row.items : JSON.parse(row.items || '[]');
    // 同菜合并：id 与赠菜标记都相同才合并（普通菜与赠菜价格不同，不能混为一行）
    const keyOf = it => (it.id) + '|' + (it.giftTo || '') + '|' + (it.giftFrom || '');
    const mergedItems = oldItems.map(x => ({ ...x }));
    for (const it of items) {
      const k = keyOf(it);
      const ex = mergedItems.find(m => keyOf(m) === k);
      if (ex) ex.qty = (parseInt(ex.qty || ex.quantity, 10) || 1) + (parseInt(it.qty || it.quantity, 10) || 1);
      else mergedItems.push({ ...it });
    }
    const oldTotal = parseFloat(row.total_price) || 0;
    const addTotal = items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (i.qty || 1), 0);
    const newTotal = oldTotal + addTotal;
    await pool.query('UPDATE orders SET items=$1, total_price=$2, dish_count=$3 WHERE id=$4',
      [JSON.stringify(mergedItems), newTotal, mergedItems.length, orderId]);
    res.json({ success: true, message: '加菜成功', orderId, addedCount: items.length, totalPrice: newTotal, dishCount: mergedItems.length });
  } catch (e) { logger.error('加菜API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 挪桌：修改进行中订单的桌号（订单跟客人走）
app.patch('/api/order/:id/table', softAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { tableNumber } = req.body;
    if (!orderId || !tableNumber) return res.status(400).json({ success: false, error: '参数无效' });
    const pool = db;
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='table_number'");
    if (colCheck.rows.length === 0) return res.json({ success: false, error: '订单表不支持桌号' });
    const r = await pool.query("UPDATE orders SET table_number=$1 WHERE id=$2 AND status NOT IN ('completed','cancelled') RETURNING id", [String(tableNumber), orderId]);
    if (r.rows.length === 0) return res.status(400).json({ success: false, error: '订单不存在或已完成' });
    res.json({ success: true, orderId, tableNumber });
  } catch (e) { logger.error('改桌号API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const userId = req.user?.username;
    if (!userId) return res.status(401).json({ success: false, error: '请先登录' });
    const pool = db;
    let query = 'SELECT * FROM orders';
    let params = [];
    const conditions = [];
    // 管理员可查看所有订单（厨房看板）；普通用户只能查看自己的订单
    const isAdmin = req.user?.role === 'admin';
    const queryUserId = req.query.userId || '';
    if (isAdmin) {
      if (queryUserId) { conditions.push('user_id = $' + (params.length + 1)); params.push(queryUserId); }
    } else {
      conditions.push('user_id = $' + (params.length + 1)); params.push(userId);
    }
    if (status) {
      const statuses = status.split(',');
      conditions.push('status = ANY($' + (params.length + 1) + '::text[])');
      params.push(statuses);
    }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC';
    // 厨房看板等按状态筛选的场景：限制返回最新 100 条，避免海量订单一次性渲染导致页面卡顿
    // （普通用户查看自己订单不受影响）
    if (status) query += ' LIMIT 100';
    const result = await pool.query(query, params);
    res.json({ success: true, orders: result.rows });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 更新订单状态
app.put('/api/orders/:id/status', authMiddleware, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId) || orderId <= 0) return res.status(400).json({ success: false, error: '无效的订单ID' });
    const { status } = req.body;
    // 厨房操作允许管理员或订单所有者
    const validStatuses = ['pending', 'confirmed', 'preparing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: '无效的状态' });
    const pool = db;
    let result;
    // 管理员可以更新任意订单，普通用户只能更新自己的订单
    if (req.user.role === 'admin') {
      result = await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
    } else {
      result = await pool.query('UPDATE orders SET status = $1 WHERE id = $2 AND user_id = $3', [status, orderId, req.user.username]);
    }
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: '订单不存在或无权限' });
    res.json({ success: true, message: '订单状态已更新' });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 反馈 API（软身份验证）
app.post('/api/feedback', softAuth, async (req, res) => {
  try {
    const { dishId, score, userPreferences, userId } = req.body;
    if (score === undefined) return res.status(400).json({ success: false, error: '缺少必要参数' });
    const scoreNum = parseFloat(score);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 5) return res.status(400).json({ success: false, error: '评分必须在 0-5 之间' });
    const dishIdNum = dishId !== undefined && dishId !== null ? parseInt(dishId) : null;
    if (dishIdNum === null || isNaN(dishIdNum) || dishIdNum < 0) return res.status(400).json({ success: false, error: '无效的菜品 ID' });
    // dishId 为 0 表示整体满意度，允许
    // 优先使用 token 验证的用户 ID
    const effectiveUserId = req.user?.username || 'guest';
    const pool = db;
    await pool.query(
      "INSERT INTO feedback (dish_id, user_id, rating, user_preferences) VALUES ($1,$2,$3,$4)",
      [dishIdNum, effectiveUserId, scoreNum, userPreferences ? JSON.stringify(userPreferences) : '{}']
    );
    res.json({ success: true, message: '反馈成功' });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

app.get('/api/feedback', authMiddleware, async (req, res) => {
  try {
    const pool = db;
    const userId = req.user?.username;
    if (!userId) return res.status(401).json({ success: false, error: '请先登录' });
    const result = await pool.query('SELECT * FROM feedback WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.json({ success: true, feedbacks: result.rows });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

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
        explanation: '模型基于以下11个维度预测您对菜品的喜好程度：菜品辣度、咸淡、甜酸、热量，价格、评分、是否招牌，以及您的个人口味偏好（辣度/咸淡/甜酸/价格区间）。',
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
          explanation: '模型基于以下11个维度预测您对菜品的喜好程度：菜品辣度、咸淡、甜酸、热量，价格、评分、是否招牌，以及您的个人口味偏好（辣度/咸淡/甜酸/价格区间）。',
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
      explanation: '模型基于以下11个维度预测您对菜品的喜好程度：菜品辣度、咸淡、甜酸、热量，价格、评分、是否招牌，以及您的个人口味偏好（辣度/咸淡/甜酸/价格区间）。',
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
let workerStartTime = 0;
let pendingRequests = new Map();
let pendingRequestIdCounter = 0;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;

function startPythonWorker() {
  if (pythonWorker) { try { pythonWorker.kill(); } catch(e) {} pythonWorker = null; }
  const { spawn } = require('child_process');
  pythonWorker = spawn('python', ['-u', path.join(__dirname, 'predict_worker.py')], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
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
          if (result.ready) { workerReady = true; restartAttempts = 0; logger.info('Python Worker已就绪'); }
          else if (pendingRequests.size > 0) {
            // 使用 Map 的迭代器获取第一个待处理请求，保证 FIFO 顺序
            const firstEntry = pendingRequests.entries().next();
            if (!firstEntry.done) {
              const [reqId, { req, res, timeoutId }] = firstEntry.value;
              pendingRequests.delete(reqId);
              if (timeoutId) clearTimeout(timeoutId);
              if (!res.headersSent) res.json(result);
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
      const { req, res, timeoutId } = pr;
      if (timeoutId) clearTimeout(timeoutId);
      if (res && !res.headersSent) res.status(503).json({ success: false, error: '服务不可用，请重试' });
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
  // 兼容不同参数格式：如果 dishes 是整数数组，从 dishData 查找完整对象
  let processedDishes = dishes;
  if (typeof dishes[0] === 'number') {
    processedDishes = dishes.map(id => dishData.find(d => d.id === id)).filter(Boolean);
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
  const requestId = ++pendingRequestIdCounter;
  const requestTimeout = setTimeout(() => {
    pendingRequests.delete(requestId);
    sendResponse(504, { success: false, error: '请求超时，请重试' });
  }, 50000);
  req.on('aborted', () => {
    clearTimeout(requestTimeout);
    pendingRequests.delete(requestId);
  });
  const addPendingRequest = () => { 
    if (pendingRequests.size >= 100) {
      clearTimeout(requestTimeout);
      sendResponse(503, { success: false, error: '服务器繁忙，请稍后重试' });
      return;
    }
    pendingRequests.set(requestId, { req, res, timeoutId: requestTimeout }); pythonWorker.stdin.write(inputData + '\n'); 
  };
  if (!pythonWorker) {
    startPythonWorker();
    setTimeout(() => {
      if (workerReady && pythonWorker && pythonWorker.stdin.writable) addPendingRequest();
      else { clearTimeout(requestTimeout); sendResponse(503, { success: false, error: 'Worker未就绪，请重试' }); }
    }, 3000);
  } else if (!workerReady) {
    let checkCount = 0;
    const checkReady = setInterval(() => {
      checkCount++;
      if (workerReady && pythonWorker && pythonWorker.stdin.writable) { clearInterval(checkReady); addPendingRequest(); }
      else if (checkCount >= 10 || !pythonWorker) { clearInterval(checkReady); clearTimeout(requestTimeout); sendResponse(503, { success: false, error: 'Worker未就绪，请重试' }); }
    }, 500);
  } else if (pythonWorker.stdin.writable) { addPendingRequest(); }
  else { clearTimeout(requestTimeout); sendResponse(500, { success: false, error: 'Worker不可用' }); }
});

// ═══════════════════════════════════════════════
// 运行时开关（持久化到 runtime_settings.json）
// ───────────────────────────────────────────────
// 目前只有「按用户反馈自动重训」一项。未上线时 feedback 里全是测试用例，
// 拿它们自动重训会把模型带偏 —— 所以默认关闭：反馈照常收集进库，
// 但不自动拿去重训。上线积累到真实反馈后再来后台打开。
const RUNTIME_SETTINGS_PATH = path.join(__dirname, 'runtime_settings.json');
const runtimeSettings = { autoRetrain: false };
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
      const proc = spawn('python', [path.join(__dirname, 'retrain_from_feedback.py')], {
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
app.get('/api/admin/model-info', (req, res) => {
  loadModelInfo();
  res.json({ success: true, model: modelInfo });
});

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
app.get('/api/admin/monitor', (req, res) => {
  try {
    const historyPath = path.join(__dirname, 'metrics_history.json');
    let metricsHistory = [];
    if (fs.existsSync(historyPath)) {
      metricsHistory = readJSON(historyPath);
    }
    // 计算 R² 变化趋势
    let r2Trend = 'stable';
    if (metricsHistory.length >= 3) {
      const recent = metricsHistory.slice(-3);
      const avg = recent.reduce((s, e) => s + e.r2, 0) / recent.length;
      const first = metricsHistory[metricsHistory.length - 3].r2;
      if (avg < first - 0.05) r2Trend = 'declining';
      else if (avg > first + 0.05) r2Trend = 'improving';
    }
    // 错误日志状态
    const today = new Date().toISOString().slice(0,10);
    const errorLogPath = path.join(__dirname, 'logs', 'error-'+today+'.log');
    let errorLogSize = 0, errorLogUpdated = null;
    if (fs.existsSync(errorLogPath)) {
      const stats = fs.statSync(errorLogPath);
      errorLogSize = stats.size;
      errorLogUpdated = stats.mtime.toISOString();
    }
    const combinedLogPath = path.join(__dirname, 'logs', 'combined-'+today+'.log');
    let combinedLogSize = 0;
    if (fs.existsSync(combinedLogPath)) {
      combinedLogSize = fs.statSync(combinedLogPath).size;
    }
    // 错误率统计
    const hourlyErrors = errorStats.hourly.filter(e => Date.now() - e.time < 3600000);
    const errorRate = hourlyErrors.length; // 过去 1 小时的错误数
    const recentErrors = hourlyErrors.slice(-10).map(e => ({
      path: e.path,
      status: e.status,
      time: new Date(e.time).toISOString()
    }));

    res.json({
      success: true,
      monitor: {
        r2Trend,
        metricsHistory: metricsHistory.slice(-10),
        errorLog: {
          sizeKB: Math.round(errorLogSize / 1024),
          lastUpdated: errorLogUpdated
        },
        combinedLogSizeKB: Math.round(combinedLogSize / 1024),
        errorRate: {
          lastHour: errorRate,
          total: errorStats.total,
          recent: recentErrors
        },
        uptime: process.uptime(),
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        pendingRequests: pendingRequests.size,
        workerReady,
        modelVersion: modelInfo.version,
        modelR2: modelInfo.r2,
        feedbackCount: modelInfo.feedbackCount
      }
    });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

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

app.get('/api/admin/export/popular-dishes', async (req, res) => {
  try {
    const pool = db;
    const result = await pool.query(
      "SELECT d.id, d.name, d.category, d.price, d.rating, COUNT(f.id) as feedback_count, ROUND(AVG(f.rating),2) as avg_rating FROM dishes d LEFT JOIN feedback f ON d.id = f.dish_id WHERE d.is_active = TRUE GROUP BY d.id ORDER BY feedback_count DESC"
    );
    const csv = toCSV(['ID', '菜名', '分类', '价格', '评分', '反馈数', '平均评分'],
      result.rows.map(r => [r.id, r.name, r.category, r.price, r.rating, r.feedback_count, r.avg_rating]));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=popular_dishes.csv');
    res.send(csv);
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

app.get('/api/admin/export/feedback', async (req, res) => {
  try {
    const pool = db;
    const result = await pool.query(
      "SELECT f.id, f.dish_id, d.name, f.rating, f.created_at FROM feedback f LEFT JOIN dishes d ON f.dish_id = d.id ORDER BY f.created_at DESC"
    );
    const csv = toCSV(['ID', '菜品ID', '菜名', '评分', '时间'],
      result.rows.map(r => [r.id, r.dish_id, r.name, r.rating, r.created_at]));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=feedback.csv');
    res.send(csv);
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

app.get('/api/admin/export/orders', async (req, res) => {
  try {
    const pool = db;
    const result = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
    const csv = toCSV(['ID', '用户', '总价', '菜品数', '状态', '桌号', '时间'],
      result.rows.map(r => [r.id, r.user_id, r.total_price, r.dish_count, r.status, r.table_number, r.created_at]));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
    res.send(csv);
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 3.2 批量操作
app.post('/api/admin/dish/batch-status', async (req, res) => {
  try {
    const { ids, isActive } = req.body;
    if (!ids || !Array.isArray(ids) || !ids.length) return res.status(400).json({ success: false, error: '请选择菜品' });
    if (!ids.every(id => Number.isInteger(id) || /^\d+$/.test(String(id)))) return res.status(400).json({ success: false, error: '菜品ID必须为整数' });
    const pool = db;
    await pool.query('UPDATE dishes SET is_active = $1 WHERE id = ANY($2::int[])', [isActive, ids]);
    res.json({ success: true, message: '已更新 ' + ids.length + ' 道菜品' });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

app.post('/api/admin/dish/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || !ids.length) return res.status(400).json({ success: false, error: '请选择菜品' });
    if (!ids.every(id => Number.isInteger(id) || /^\d+$/.test(String(id)))) return res.status(400).json({ success: false, error: '菜品ID必须为整数' });
    const pool = db;
    await pool.query("UPDATE dishes SET is_active = FALSE WHERE id = ANY($1::int[])", [ids]);
    res.json({ success: true, message: '已下架 ' + ids.length + ' 道菜品' });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 3.3 用户管理
app.get('/api/admin/users', async (req, res) => {
  try {
    const pool = db;
    const result = await pool.query("SELECT id, username, created_at, last_login FROM users ORDER BY last_login DESC NULLS LAST");
    res.json({ success: true, users: result.rows });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

app.get('/api/admin/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId) || userId <= 0) return res.status(400).json({ success: false, error: '无效的用户ID' });
    const pool = db;
    const result = await pool.query("SELECT id, username, preferences, favorites, blacklist, created_at, last_login FROM users WHERE id = $1", [userId]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: '用户不存在' });
    res.json({ success: true, user: result.rows[0] });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

app.post('/api/admin/users/:id/toggle', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId) || userId <= 0) return res.status(400).json({ success: false, error: '无效的用户ID' });
    const pool = db;
    const user = await pool.query("SELECT id, username FROM users WHERE id = $1", [userId]);
    if (!user.rows.length) return res.status(404).json({ success: false, error: '用户不存在' });
    const username = user.rows[0].username;
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    // 清理用户相关的反馈和推荐日志（按用户名清理）
    await pool.query("DELETE FROM feedback WHERE user_id = $1", [String(username)]);
    await pool.query("DELETE FROM recommendation_log WHERE user_id = $1", [String(username)]);
    res.json({ success: true, message: '用户已删除，相关数据已清理' });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 3.4 通知（低评分菜品告警）
app.get('/api/admin/notifications', async (req, res) => {
  try {
    const pool = db;
    const worst = await pool.query(
      "SELECT d.id, d.name, COUNT(f.id) as count, ROUND(AVG(f.rating),2) as avg FROM dishes d JOIN feedback f ON d.id = f.dish_id WHERE d.is_active = TRUE GROUP BY d.id HAVING AVG(f.rating) < 3.5 ORDER BY avg ASC LIMIT 5"
    );
    const newOrders = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'pending'");
    const notifications = [];
    worst.rows.forEach(r => { notifications.push({ type: 'warning', message: r.name + ' 评分偏低（' + r.avg + '分，' + r.count + '条反馈）', link: '#page-feedback' }); });
    if (parseInt(newOrders.rows[0].count) > 0) notifications.push({ type: 'info', message: parseInt(newOrders.rows[0].count) + ' 个新订单待处理', link: '/kitchen' });
    res.json({ success: true, notifications });
  } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// 404 兜底（对 /api/ 路径返回 JSON，其他路径返回友好页面）
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ success: false, error: '请求的接口不存在' });
  } else {
    res.status(404).send(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>404 - 页面未找到 · 唐猫庭院</title><link rel="stylesheet" href="node_modules/bootstrap/dist/css/bootstrap.min.css"><link rel="stylesheet" href="styles.css"></head><body><div class="container text-center" style="padding:100px 20px"><h1 style="font-size:6rem;color:#c0392b;font-weight:700;">404</h1><h2 class="mb-4" style="color:#8b7a6a;">🏮 页面未找到</h2><p class="text-muted mb-4">您访问的页面不存在，可能已被移除或地址有误。</p><a href="/" class="btn btn-primary px-4 py-2" style="background:#c0392b;border-color:#c0392b;border-radius:50px;"><i class="bi bi-house-door"></i> 返回首页</a></div></body></html>`);
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