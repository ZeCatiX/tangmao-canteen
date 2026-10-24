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
if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET === 'tangmao_cat_court_jwt_secret_2026' ||
  process.env.JWT_SECRET === 'tangmao_jwt_secret_2026_prod_replace_me' ||
  process.env.JWT_SECRET === 'tm_jwt_8a3f9c2e7b1d4f6a0c8e2b4d6f0a1c3e5b7d9f0a2c4e6b8d0a2c4e6f8a0b2c4d6' ||
  process.env.JWT_SECRET.length < 16
) {
  console.error('❌ 安全错误: JWT_SECRET 使用默认值，请在 .env 中设置强随机密钥！');
  process.exit(1);
}
if (
  !process.env.ADMIN_PASS ||
  process.env.ADMIN_PASS === 'admin123' ||
  process.env.ADMIN_PASS === 'TangMaoAdmin2026!' ||
  process.env.ADMIN_PASS === 'TangMaoAdmin2026_ChangeMe!' ||
  process.env.ADMIN_PASS === 'TangMao@2026_Prod' ||
  process.env.ADMIN_PASS === 'tm_admin_9f8a7b6c5d4e3f2a1b0c' ||
  process.env.ADMIN_PASS.length < 8
) {
  console.error('❌ 安全错误: 管理后台使用默认密码或密码强度不足，请在 .env 中设置长度 ≥ 8 位的强密码！');
  process.exit(1);
}
// 桌码签名密钥：缺失会退化成源码里公开的常量，任何人都能伪造桌码查看别桌账单
if (
  !process.env.TABLE_SECRET ||
  process.env.TABLE_SECRET === 'tangmao-table-secret' ||
  process.env.TABLE_SECRET.length < 16
) {
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
    console.error(
      `❌ 安全错误: 生产环境限流阈值过宽（RATE_LIMIT_MAX=${rlMax}, LOGIN_RATE_LIMIT_MAX=${loginMax}, ADMIN_LOGIN_RATE_LIMIT_MAX=${adminLoginMax}, REGISTER_RATE_LIMIT_MAX=${registerMax}）—— 测试用的宽松值不能带到线上，请参考 .env.production.example`
    );
    process.exit(1);
  }
  if (!process.env.CORS_ORIGIN || /localhost|127\.0\.0\.1/.test(process.env.CORS_ORIGIN)) {
    console.warn('⚠️  生产环境 CORS_ORIGIN 仍指向 localhost —— 前端与后端同源部署可忽略；跨域部署请改成真实域名');
  }
  if (!process.env.SSL_KEY || !process.env.SSL_CERT || /^\.?\/?ssl[\\/]/.test(process.env.SSL_KEY)) {
    console.warn(
      '⚠️  生产环境未配置正式 HTTPS 证书（未设置，或仍指向开发用的 ./ssl/ 自签名证书）—— 若前面有 Nginx/CDN 反向代理终止 TLS 可忽略，否则浏览器会拦截、且密码与 token 明文传输'
    );
  }
}

// ═══════════════════════════════════════════════
// 安全中间件
// ═══════════════════════════════════════════════

// CORS（允许跨域，方便外网访问）
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    maxAge: 86400,
  })
);

// 安全 HTTP 头（helmet）
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // 移除 unsafe-eval(全库零 eval 调用,2026-10-16 审计)
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

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
const LOGIN_RATE_LIMIT_MAX =
  Number.isFinite(LOGIN_RATE_LIMIT_RAW) && LOGIN_RATE_LIMIT_RAW >= 1 ? LOGIN_RATE_LIMIT_RAW : 30;
const loginLimiter = rateLimit({
  windowMs: 60000, // 1分钟
  max: LOGIN_RATE_LIMIT_MAX,
  message: { success: false, error: '登录过于频繁，请稍后再试' },
});
app.use('/api/user/login', loginLimiter);

// 注册接口限流（测试环境可通过环境变量放宽）
const REGISTER_RATE_LIMIT_RAW = parseInt(process.env.REGISTER_RATE_LIMIT_MAX || '2000');
const REGISTER_RATE_LIMIT_MAX =
  Number.isFinite(REGISTER_RATE_LIMIT_RAW) && REGISTER_RATE_LIMIT_RAW >= 1 ? REGISTER_RATE_LIMIT_RAW : 2000;
const registerLimiter = rateLimit({
  windowMs: 3600000, // 1小时
  max: REGISTER_RATE_LIMIT_MAX,
  message: { success: false, error: '注册过于频繁，请1小时后再试' },
});
app.use('/api/user/register', registerLimiter);

// 管理员登录限流（严格限制，防暴力破解，测试环境可通过环境变量放宽）
const ADMIN_LOGIN_RATE_LIMIT_RAW = parseInt(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX || '30');
const ADMIN_LOGIN_RATE_LIMIT_MAX =
  Number.isFinite(ADMIN_LOGIN_RATE_LIMIT_RAW) && ADMIN_LOGIN_RATE_LIMIT_RAW >= 1 ? ADMIN_LOGIN_RATE_LIMIT_RAW : 30;
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
    if (!res.headersSent) {
      return res.status(499).json({ success: false, error: '请求中断' });
    }
    return;
  }
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: err.message || '文件上传错误' });
  }
  logger.error(`服务器错误: ${err.message}`, { stack: err.stack });
  if (!res.headersSent) {
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
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
  },
});

app.post('/api/admin/dish/upload-image', adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请选择图片' });
    }
    const dishId = parseInt(req.body.dishId);
    if (!dishId || isNaN(dishId) || dishId <= 0) {
      return res.status(400).json({ success: false, error: '无效的菜品 ID' });
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    // 二次验证扩展名
    if (!ALLOWED_IMAGE_EXTS.includes(ext)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        /* 忽略清理错误 */
      }
      return res.status(400).json({ success: false, error: '不支持的图片格式' });
    }
    const newName = `dish_${dishId}_${Date.now()}${ext}`;
    const newPath = path.join(__dirname, 'uploads', newName);
    // 清理旧图片文件
    const pool = db;
    const oldDish = await pool.query('SELECT image_url FROM dishes WHERE id = $1', [dishId]);
    if (oldDish.rows.length > 0 && oldDish.rows[0].image_url && oldDish.rows[0].image_url.startsWith('/uploads/')) {
      const oldImagePath = path.join(__dirname, oldDish.rows[0].image_url.replace(/^\//, ''));
      try {
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      } catch (e) {
        /* 忽略旧文件清理错误 */
      }
      const oldThumb = path.join(
        __dirname,
        'uploads',
        'thumbs',
        oldDish.rows[0].image_url.replace(/^\/uploads\//, '').replace(/\.[^.]+$/, '') + '.webp'
      );
      try {
        if (fs.existsSync(oldThumb)) {
          fs.unlinkSync(oldThumb);
        }
      } catch (e) {}
    }
    fs.renameSync(req.file.path, newPath);
    const imageUrl = '/uploads/' + newName;
    // 同步生成缩略图（B6）：菜单卡片用 thumbs/*.webp，失败不阻断上传
    try {
      const thumbDir = path.join(__dirname, 'uploads', 'thumbs');
      fs.mkdirSync(thumbDir, { recursive: true });
      const sharp = require('sharp');
      await sharp(newPath)
        .rotate()
        .resize({ width: 420, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(path.join(thumbDir, newName.replace(/\.[^.]+$/, '') + '.webp'));
    } catch (e) {
      logger.error('缩略图生成失败:', e.message);
    }
    await pool.query('UPDATE dishes SET image_url = $1 WHERE id = $2', [imageUrl, dishId]);
    res.json({ success: true, imageUrl });
  } catch (e) {
    logger.error('API错误:', e.message);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

// 静态文件服务（只允许前端需要的文件类型，阻止敏感文件泄露）
const ALLOWED_STATIC_EXTS = [
  '.html',
  '.css',
  '.js',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
];
const BLOCKED_STATIC_PATHS = [
  '.env',
  'server.js',
  'db.js',
  'auth.js',
  'user_storage.js',
  'logger.js',
  'build.js',
  'package.json',
  'package-lock.json',
  'ecosystem.config.js',
  'Dockerfile',
  'docker-compose.yml',
  'deploy.bat',
  'deploy.sh',
  'install.bat',
  'start.bat',
  'setup_backup.bat',
  'backup_db.js',
  'migrate_to_pg.js',
  'sample_data.sql',
  'ngrok.exe',
  'fix_',
  'model_metrics.json',
  'metrics_history.json',
  'runtime_settings.json',
  'recommendation_effect.json',
  'recommendation_model.pkl',
  'feature_importance.json',
  'registry.json',
  'ml/',
  'train_ml_model.py',
  'rgzn.py',
  'logs/',
  'backups/',
  'model_backups/',
  'tests/',
  '.ai/',
  '__pycache__/',
  '.git/',
  'ssl/',
  'dist/',
  'screenshots/',
  '.playwright-mcp/',
  '.github/',
  '唐猫菜品/',
  '*.pem',
  '*.key',
];
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    return next();
  }
  const ext = path.extname(req.path).toLowerCase();
  const basename = path.basename(req.path).toLowerCase();
  // 规范化路径，防止路径遍历绕过
  const normalizedPath = path.normalize(req.path).replace(/\\/g, '/');
  // 阻止敏感文件（精确匹配文件，或匹配目录前缀，或startsWith用于fix_前缀，或glob模式）
  if (
    BLOCKED_STATIC_PATHS.some((p) => {
      if (p.endsWith('/')) {
        return normalizedPath.startsWith('/' + p) || normalizedPath === '/' + p.slice(0, -1);
      }
      if (p.endsWith('_')) {
        return basename.startsWith(p);
      }
      if (p.startsWith('*.')) {
        return basename.endsWith(p.slice(1));
      }
      return basename === p;
    })
  ) {
    return res.status(403).json({ success: false, error: '禁止访问' });
  }
  // 只允许特定扩展名（仅对看起来像文件的路径检查）
  const hasExtension = basename.includes('.');
  if (hasExtension && !ALLOWED_STATIC_EXTS.includes(ext)) {
    return res.status(403).json({ success: false, error: '禁止访问' });
  }
  next();
});
app.use(
  express.static(__dirname, {
    setHeaders: (res, p) => {
      // HTML 不缓存（防止 Edge 等浏览器缓存旧版，导致版本号更新不生效）
      if (p.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
      // 带 ?v=20xxxxx 版本参数的资源走 immutable 一年长缓存：版本号一变 URL 即变，零旧版风险，
      // 免掉每次访问的 304 重验证；纪律——改了 js/css/插画必须同步改版本号，否则用户最长一年拿旧文件
      const ver = res.req.originalUrl && /[?&]v=20\d{5}\w*/.test(res.req.originalUrl);
      // CSS/JS：带版本号 → immutable；不带 → no-cache + etag 重验证兜底（双重保险）
      if (p.endsWith('.css') || p.endsWith('.js')) {
        res.setHeader(
          'Cache-Control',
          ver ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate, max-age=0'
        );
      }
      // 图片：带版本号 → immutable；不带 → 缓存7天
      if (p.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/)) {
        res.setHeader('Cache-Control', ver ? 'public, max-age=31536000, immutable' : 'public, max-age=604800');
      }
    },
  })
);
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
    } catch (e) {
      logger.error('db模块加载失败:', e?.message || String(e));
      state.dishData = [];
      return;
    }
    if (!pool || !pool.connect) {
      logger.error('db模块无效');
      state.dishData = [];
      return;
    }
    // 用同一个连接执行 SET + SELECT，确保编码设置生效
    const client = await pool.connect();
    try {
      await client.query("SET client_encoding = 'UTF8'");
      const result = await client.query(
        "SELECT d.*, COALESCE(oc.order_count, 0) as order_count FROM dishes d LEFT JOIN (SELECT dish_id, COUNT(*) as order_count FROM (SELECT jsonb_array_elements(items)->>'id' as dish_id FROM orders) o WHERE o.dish_id IS NOT NULL GROUP BY dish_id) oc ON d.id::text = oc.dish_id ORDER BY d.id"
      );
      state.dishData = result.rows.map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        tags: d.tags || [],
        spiciness: d.spiciness || '不辣',
        saltiness: d.saltiness || '适中',
        sweetness: d.sweetness || '无味',
        price:
          d.price !== null && d.price !== undefined && d.price !== '' ? parseFloat(d.price) : d.price === 0 ? 0 : null,
        rating: d.rating !== null && d.rating !== undefined && d.rating !== '' ? d.rating.toString() : '3.5',
        calorie: d.calorie || '未知',
        protein: d.protein ? d.protein.toString() : d.calorie ? String(Math.round(parseFloat(d.calorie) * 0.1)) : '0',
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
    } finally {
      client.release();
    }
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
    if (r.rowCount > 0) {
      logger.info(`已按用户反馈同步 ${r.rowCount} 道菜的评分`);
    }
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
      cwd: __dirname,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    proc.on('error', (e) => logger.warn('生成推荐效果报告失败: ' + e.message));
    proc.on('close', (code) => {
      if (code !== 0) {
        logger.warn('生成推荐效果报告失败，退出码: ' + code);
      }
    });
  } catch (e) {
    logger.warn('生成推荐效果报告失败: ' + (e?.message || ''));
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
  } catch (e) {
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
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'assets', 'brand', 'favicon-64.png')));
app.get('/api/dishes', (req, res) => res.json({ success: true, dishes: state.dishData }));
app.get('/api/dishes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const dish = state.dishData.find((d) => d.id === id);
  if (!dish) {
    return res.status(404).json({ success: false, error: '菜品不存在' });
  }
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
    } catch (e) {
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
      } catch (e2) {
        matched = false;
      }
    }
    if (matched) {
      // 管理端短会话（默认12小时，可用 ADMIN_TOKEN_EXPIRES_IN 覆盖）：共享电脑的残留 token 不能长期有效
      const token = generateToken(
        { id: 0, username: ADMIN_USER, role: 'admin' },
        { expiresIn: process.env.ADMIN_TOKEN_EXPIRES_IN || '12h' }
      );
      return res.json({ success: true, message: '管理员登录成功', token });
    }
  }
  res.status(401).json({ success: false, error: '管理员账号或密码错误' });
});

// 管理后台认证中间件（排除登录接口）
async function adminAuth(req, res, next) {
  // 登录接口不需要认证
  if (req.path === '/login') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '请先登录管理后台' });
  }
  try {
    // maxAge 与签发端 12h 对齐：历史上无 exp 的管理 token（iat 超龄）也一并拒绝
    const decoded = require('jsonwebtoken').verify(authHeader.split(' ')[1], process.env.JWT_SECRET, {
      maxAge: process.env.ADMIN_TOKEN_EXPIRES_IN || '12h',
    });
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

// 共享运行时开关:admin 域(settings POST/retrain 守卫)与本文件 checkAndRetrain 定时器读写同一份。
// 拆分时曾丢此声明——rs 块的 Object.assign 被 try/catch 吞掉,30 分钟后的 checkAndRetrain 触发未处理 rejection 崩进程
const runtimeSettings = { autoRetrain: false };

// 桌码管理（A2）：批量生成签名桌码链接（协议/域名取自请求头，支持反代与隧道）
// /api/admin/* 业务域拆分至 server/routes/admin.js(登录/上传图/认证中间件仍在本文件)(2026-10-13 改造4)
require('./server/routes/admin').register(app, {
  adminAuth,
  db,
  logger,
  state,
  readJSON,
  tableSig,
  loadDishData,
  refreshRecommendationEffect,
  userStorage,
  generateToken,
  loadModelInfo,
  toCSV,
  runtimeSettings,
  saveRuntimeSettings,
  getModelInfo: () => modelInfo,
  // 重训锁标志在模块 let 上,经 getter/setter 注入(admin 域不能直接引用本文件作用域)
  getRetrainingCheck: () => _isRetrainingCheck,
  setRetrainingCheck: (v) => {
    _isRetrainingCheck = v;
  },
  backupOldModel: () => backupOldModel(),
  syncDishRatings: () => syncDishRatings(),
  trackMetrics: () => trackMetrics(),
  // worker/特征重要性状态已迁至 ml-worker/recommend 模块,getter 延迟取值(与 modelInfo 同一防 TDZ 手法)
  getWorkerReady: () => mlworker.getHealth().ready,
  getPendingRequestsSize: () => mlworker.getHealth().pendingRequests,
  getErrorStats: () => errorStats,
  getFeatureImportanceCache: () => recommendDomain.getFeatureImportanceCache(),
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
// 偏好/推荐埋点(preference-log/recommendation-log)拆分至 server/routes/recommend.js(2026-10-13 改造4)

// 偏好统计 API

// ═══════════════════════════════════════════════
// 管理后台增强 API
// ═══════════════════════════════════════════════

// 每日推荐趋势

// 用户活跃度

// 推荐日志详情

// 模型训练历史

// 运行时开关读写/推荐效果报告/重训练/不佳菜品/模型对比/点击率统计 → server/routes/admin.js(2026-10-13 改造4)

// 推荐与 ML 域拆分至 server/routes/recommend.js + server/ml-worker.js(2026-10-13 改造4)
// mlworker 挂 /api/worker-health + /api/predict-rf;recommend 挂埋点/指标/特征重要性/一桌菜,经注入的 mlworker 分发打分
const mlworker = require('./server/ml-worker');
const recommendDomain = require('./server/routes/recommend');
mlworker.register(app, { logger, state });
recommendDomain.register(app, { db, logger, softAuth, state, readJSON, mlworker });

// 点餐与反馈域拆分至 server/routes/orders.js(2026-10-13 改造4)
require('./server/routes/orders').register(app, { db, logger, softAuth, authMiddleware });
// ═══════════════════════════════════════════════
// 运行时开关（持久化到 runtime_settings.json）
// ───────────────────────────────────────────────
// 目前只有「按用户反馈自动重训」一项。未上线时 feedback 里全是测试用例，
// 拿它们自动重训会把模型带偏 —— 所以默认关闭：反馈照常收集进库，
// 但不自动拿去重训。上线积累到真实反馈后再来后台打开。
const RUNTIME_SETTINGS_PATH = path.join(__dirname, 'runtime_settings.json');
try {
  Object.assign(runtimeSettings, readJSON(RUNTIME_SETTINGS_PATH));
} catch (e) {
  /* 首次运行无文件，用默认值 */
}
function saveRuntimeSettings() {
  try {
    fs.writeFileSync(RUNTIME_SETTINGS_PATH, JSON.stringify(runtimeSettings, null, 2));
  } catch (e) {
    logger.warn('保存运行时设置失败: ' + (e?.message || ''));
  }
}

// ═══════════════════════════════════════════════
// 模型版本管理 & 自动重训练
// ═══════════════════════════════════════════════
const modelInfo = { version: '1.0', trainedAt: null, feedbackCount: 0, r2: 0 };
const MODEL_PATH = path.join(__dirname, 'recommendation_model.pkl');
const MODEL_BACKUP_DIR = path.join(__dirname, 'model_backups');

// 加载模型版本信息
function loadModelInfo() {
  try {
    const data = readJSON(path.join(__dirname, 'model_metrics.json'));
    modelInfo.r2 = data.r2 || 0;
    modelInfo.feedbackCount = data.real_feedback_count || 0;
  } catch (e) {
    logger.warn('加载模型指标失败: ' + (e?.message || String(e)));
  }
  // 检查模型文件修改时间作为训练时间
  try {
    const stat = fs.statSync(MODEL_PATH);
    modelInfo.trainedAt = stat.mtime.toISOString();
  } catch (e) {
    logger.warn('获取模型文件时间失败: ' + (e?.message || String(e)));
  }
}

// 备份旧模型
function backupOldModel() {
  try {
    if (!fs.existsSync(MODEL_BACKUP_DIR)) {
      fs.mkdirSync(MODEL_BACKUP_DIR);
    }
    const now = new Date();
    const backupName = `recommendation_model_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.pkl`;
    const backupPath = path.join(MODEL_BACKUP_DIR, backupName);
    if (fs.existsSync(MODEL_PATH) && !fs.existsSync(backupPath)) {
      fs.copyFileSync(MODEL_PATH, backupPath);
      logger.info(`模型已备份: ${backupName}`);
    }
    // 只保留最近 5 个备份
    const backups = fs
      .readdirSync(MODEL_BACKUP_DIR)
      .filter((f) => f.startsWith('recommendation_model_'))
      .sort()
      .reverse();
    backups.slice(5).forEach((f) => {
      fs.unlinkSync(path.join(MODEL_BACKUP_DIR, f));
    });
  } catch (e) {
    logger.warn('模型备份失败: ' + (e.message || ''));
  }
}

// 检查反馈数量并决定是否重训练
let _isRetrainingCheck = false;
async function checkAndRetrain() {
  // 开关关闭时直接跳过（未上线，feedback 里全是测试用例，不拿它们自动重训）
  if (!runtimeSettings.autoRetrain) {
    return;
  }
  if (_isRetrainingCheck || global._isRetraining) {
    return;
  }
  _isRetrainingCheck = true;
  global._isRetraining = true;
  try {
    const pool = db;
    const result = await pool.query('SELECT COUNT(*) FROM feedback WHERE processed = FALSE OR processed IS NULL');
    const newCount = parseInt(result.rows[0].count);
    if (newCount >= 50 && newCount >= modelInfo.feedbackCount + 10) {
      // 有足够的新反馈，触发重训练（异步执行，不阻塞）
      logger.info(`检测到 ${newCount} 条新反馈，开始自动重训练...`);
      backupOldModel();
      const { spawn } = require('child_process');
      const proc = spawn('python', [path.join(__dirname, 'ml', 'retrain_from_feedback.py')], {
        cwd: __dirname,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      const retrainTimeout = setTimeout(() => {
        if (proc.exitCode === null) {
          global._isRetraining = false;
          _isRetrainingCheck = false;
        }
      }, 30000);
      proc.stderr?.on('data', (d) => {
        logger.warn('自动重训练stderr: ' + d.toString().slice(0, 500));
      });
      proc.on('error', (e) => {
        clearTimeout(retrainTimeout);
        logger.error('自动重训练进程错误: ' + e.message);
        _isRetrainingCheck = false;
        global._isRetraining = false;
      });
      proc.on('close', async (code) => {
        clearTimeout(retrainTimeout);
        try {
          if (code === 0) {
            const pool = db;
            await pool.query('UPDATE feedback SET processed = TRUE WHERE processed = FALSE OR processed IS NULL');
            modelInfo.feedbackCount = newCount;
            modelInfo.version = (parseFloat(modelInfo.version) + 0.1).toFixed(1);
            modelInfo.trainedAt = new Date().toISOString();
            loadModelInfo();
            logger.info(`自动重训练完成，模型版本: ${modelInfo.version}`);
            try {
              await syncDishRatings();
            } catch (e) {
              logger.warn('同步菜品评分失败: ' + (e?.message || ''));
            }
            try {
              await loadDishData();
            } catch (e) {
              logger.error('刷新菜品缓存失败:', e.message);
            }
            refreshRecommendationEffect();
          } else {
            logger.warn('自动重训练失败，退出码: ' + code);
          }
        } catch (e) {
          logger.warn('自动重训练处理失败: ' + (e?.message || ''));
        } finally {
          _isRetrainingCheck = false;
          global._isRetraining = false;
        }
      });
    } else {
      _isRetrainingCheck = false;
      global._isRetraining = false;
    }
  } catch (e) {
    _isRetrainingCheck = false;
    global._isRetraining = false;
  }
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
    if (!fs.existsSync(metricsPath)) {
      return;
    }
    const metrics = readJSON(metricsPath);
    const entry = {
      timestamp: new Date().toISOString(),
      r2: metrics.r2 || 0,
      mse: metrics.mse || 0,
      rmse: metrics.rmse || 0,
      mae: metrics.mae || 0,
      feedbackCount: metrics.real_feedback_count || 0,
    };
    let history = [];
    if (fs.existsSync(historyPath)) {
      history = readJSON(historyPath);
    }
    history.push(entry);
    // 只保留最近 60 条记录
    if (history.length > 60) {
      history = history.slice(-60);
    }
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
  } catch (e) {
    /* 忽略记录错误 */
  }
}

// 错误日志监控 + 错误率统计
const errorStats = { hourly: [], total: 0, lastReset: Date.now() };

function checkErrorLog() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const errorLogPath = path.join(__dirname, 'logs', 'error-' + today + '.log');
    if (!fs.existsSync(errorLogPath)) {
      return;
    }
    const stats = fs.statSync(errorLogPath);
    if (Date.now() - stats.mtimeMs < 3600000 && stats.size > 0) {
      logger.warn('错误日志在 1 小时内有更新，请检查日志文件');
    }
  } catch (e) {
    logger.warn('错误日志监控异常: ' + (e?.message || String(e)));
  }
}

// 记录 API 错误
function recordApiError(path, status) {
  errorStats.total++;
  errorStats.hourly.push({
    time: Date.now(),
    path: path,
    status: status,
  });
  // 只保留最近 1 小时的数据
  const oneHour = 3600000;
  errorStats.hourly = errorStats.hourly.filter((e) => Date.now() - e.time < oneHour);
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
  const escape = (v) => {
    const s = String(v || '');
    // 防止 CSV 注入：以 = + - @ 开头的值添加 \t 前缀
    const safe = /^[=+\-@]/.test(s) ? '\t' + s : s;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  return headers.join(',') + '\n' + rows.map((r) => r.map(escape).join(',')).join('\n');
}

// 3.2 批量操作

// 3.3 用户管理

// 管理员重置用户密码——顾客忘记密码时店主线下核实身份后操作（系统无邮箱/手机，无法自助找回）

// 管理员订单列表（只读）：按状态/桌号筛选，最新在前

// 3.4 通知（低评分菜品告警）

// 404 兜底（对 /api/ 路径返回 JSON，其他路径返回友好页面）
app.use((req, res) => {
  res.set('Cache-Control', 'no-store'); // 404 页不缓存: 避免浏览器缓存旧版页面/图片加载失败
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ success: false, error: '请求的接口不存在' });
  } else {
    res
      .status(404)
      .send(
        `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>页面走丢了 · 唐猫庭院</title><style>body{margin:0;background:#faf6f0;color:#2c1810;font-family:'Noto Serif SC','STSong','SimSun',serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}.box{text-align:center;max-width:480px;}.box img{width:min(360px,86vw);display:block;margin:0 auto 18px;border-radius:16px;box-shadow:0 10px 30px rgba(60,30,10,.14);}h1{font-size:1.6rem;letter-spacing:6px;margin:0 0 10px;font-weight:900;}p{color:#756558;font-size:.95rem;line-height:1.9;margin:0 0 22px;}a.btn{display:inline-block;text-decoration:none;color:#fff;background:linear-gradient(135deg,#b83a2a,#d0453a);padding:10px 34px;border-radius:22px;font-size:.95rem;letter-spacing:3px;box-shadow:0 4px 14px rgba(184,58,42,.35);}.code{margin-top:14px;font-size:.75rem;color:#a08b6a;letter-spacing:2px;}</style></head><body><div class="box"><img src="/assets/illustrations/cat-404.webp?v=20260922" alt="唐猫不小心打翻了托盘"><h1>页面走丢了</h1><p>小唐猫不小心打翻了托盘，找不到这个页面。<br>回首页看看今天的推荐吧。</p><a class="btn" href="/">回唐猫庭院</a><div class="code">404 · NOT FOUND</div></div></body></html>`
      );
  }
});

// 500 友好错误页面（仅在非 API 请求时返回 HTML）
app.use((err, req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next(err);
  }
  res
    .status(500)
    .send(
      `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>500 - 服务器错误 · 唐猫庭院</title><link rel="stylesheet" href="node_modules/bootstrap/dist/css/bootstrap.min.css"><link rel="stylesheet" href="styles.css"></head><body><div class="container text-center" style="padding:100px 20px"><h1 style="font-size:6rem;color:#c0392b;font-weight:700;">500</h1><h2 class="mb-4" style="color:#8b7a6a;">😿 服务器出了点小问题</h2><p class="text-muted mb-4">请稍后再试，或联系管理员。</p><a href="/" class="btn btn-primary px-4 py-2" style="background:#c0392b;border-color:#c0392b;border-radius:50px;"><i class="bi bi-house-door"></i> 返回首页</a></div></body></html>`
    );
});

// 数据归档/清理任务（每 24 小时执行）
async function cleanupOldData() {
  try {
    const pool = db;
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000 * 30).toISOString(); // 30 天前
    // 永久删除下架超过 30 天的菜品
    const cleared = await pool.query('DELETE FROM dishes WHERE is_active = FALSE AND updated_at < $1', [dayAgo]);
    // 清理 90 天前的旧推荐日志
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const oldLogs = await pool.query('DELETE FROM recommendation_log WHERE created_at < $1', [ninetyDaysAgo]);
    // 清理已过期的 token_blacklist 记录
    const expiredTokens = await pool.query('DELETE FROM token_blacklist WHERE expires_at < NOW()');
    if (cleared.rowCount > 0 || oldLogs.rowCount > 0 || expiredTokens.rowCount > 0) {
      logger.info(
        `数据清理完成：删除 ${cleared.rowCount} 条下架超30天菜品，${oldLogs.rowCount} 条90天前推荐日志，${expiredTokens.rowCount} 条过期token`
      );
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
  mlworker.startPythonWorker();
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
  .catch((e) => logger.error('recommendation_log.mode 迁移失败: ' + e.message));

// 幂等迁移：orders 补 completed_at 列（厨房看板"当日已完成"按完成时间归档，
// 原来回退用 created_at 近似——跨天完成的单会被归错档）。GET /api/orders 走 SELECT * 自动带出。
db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`)
  .then(() => logger.info('orders.completed_at 列就绪'))
  .catch((e) => logger.error('orders.completed_at 迁移失败: ' + e.message));

// 幂等迁移：preference_log.price 放宽到 VARCHAR(20)——价格档全称「标准型（12-20元）」11 字符
// 曾超 VARCHAR(10)，选标准型/品质型的用户一存偏好就 500
db.query(`ALTER TABLE preference_log ALTER COLUMN price TYPE VARCHAR(20)`)
  .then(() => logger.info('preference_log.price 列宽就绪'))
  .catch((e) => logger.error('preference_log.price 迁移失败: ' + e.message));

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
process.on('unhandledRejection', (reason) => {
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
  if (isShuttingDown) {
    return;
  }
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

  // 2. 关闭 Python Worker 进程(子系统已拆至 server/ml-worker.js,清空待处理请求+杀进程)
  mlworker.shutdown();

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
