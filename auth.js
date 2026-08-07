// 唐猫庭院 - JWT 认证中间件
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// 生成令牌
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// 验证令牌中间件（硬保护：无令牌则拒绝）
function authMiddleware(req, res, next) {
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
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
  }
}

// 软保护中间件：有令牌则解析用户信息，无令牌也放行（游客模式）
function softAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // token 无效，但继续放行
    }
  }
  next();
}

module.exports = { generateToken, authMiddleware, softAuth };