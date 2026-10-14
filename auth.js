// 唐猫庭院 - JWT 认证中间件（含 token 吊销机制）
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// 生成令牌（含 jti 唯一标识，支持吊销）；opts.expiresIn 可覆盖默认时长（管理端用短会话）
function generateToken(user, opts) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role || 'user', jti: crypto.randomBytes(16).toString('hex') },
    JWT_SECRET,
    { expiresIn: (opts && opts.expiresIn) || JWT_EXPIRES_IN }
  );
}

// 查询 jti 是否已吊销（token_blacklist 表中且未过期）
async function isTokenBlacklisted(jti) {
  if (!jti) return false;
  try {
    const result = await pool.query(
      'SELECT 1 FROM token_blacklist WHERE jti = $1 AND expires_at > NOW()',
      [jti]
    );
    return result.rows.length > 0;
  } catch (e) {
    // 查询失败时放行（可用性优先，token_blacklist 表极小、故障概率低）
    console.error('检查 token 黑名单失败:', e.message);
    return false;
  }
}

// 吊销 token：解码取 jti 写入 token_blacklist 表
async function revokeToken(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.jti) return false;
    // exp 为秒级时间戳；无 exp 时按 7 天兜底
    const expiresAt = decoded.exp
      ? new Date(decoded.exp * 1000).toISOString()
      : new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await pool.query(
      'INSERT INTO token_blacklist (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING',
      [decoded.jti, expiresAt]
    );
    return true;
  } catch (e) {
    console.error('吊销 token 失败:', e.message);
    return false;
  }
}

// 验证令牌中间件（硬保护：无令牌则拒绝）
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (req.path === '/api/user/login' || req.path === '/api/user/register' ||
        req.path === '/' || req.path === '/api/dishes' || req.path.startsWith('/api/worker-health') ||
        req.path.startsWith('/api/feature-importance') || req.path.startsWith('/api/model-metrics')) {
      return next();
    }
    return res.status(401).json({ success: false, error: '未登录' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // 同步检查黑名单：已吊销的 token 视同无效
    if (decoded.jti) {
      const blacklisted = await isTokenBlacklisted(decoded.jti);
      if (blacklisted) {
        return res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
      }
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
  }
}

// 软保护中间件：有令牌则解析用户信息，无令牌也放行（游客模式）
async function softAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      // 已吊销的 token 当游客处理（不设置 req.user）
      if (!decoded.jti || !(await isTokenBlacklisted(decoded.jti))) {
        req.user = decoded;
      }
    } catch (err) {
      // token 无效，但继续放行
    }
  }
  next();
}

module.exports = { generateToken, authMiddleware, softAuth, revokeToken, isTokenBlacklisted };
