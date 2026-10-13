'use strict';
// 唐猫庭院 · 用户域路由(注册/登录/偏好/收藏/黑名单/登出/注销)——从 server.js 拆出(2026-10-13 可维护性改造4)
const logger = require('../../logger');

function register(app, deps) {
  const { userStorage, generateToken, authMiddleware } = deps;
  app.post('/api/user/register', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
      if (username.trim().length < 2) return res.status(400).json({ success: false, error: '用户名至少2个字符' });
      if (username.trim().length > 20) return res.status(400).json({ success: false, error: '用户名不能超过20个字符' });
      if (!/^[一-龥A-Za-z0-9_-]{2,20}$/.test(username.trim())) return res.status(400).json({ success: false, error: '用户名只能包含中英文、数字、下划线、短横线' });
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
      // 只接受正整数菜品 ID：这些值会进前端渲染，放开任意字符串 = 存储型 XSS 的入口
      const list = Array.isArray(favorites)
        ? favorites.map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 500)
        : [];
      await userStorage.updateUser(username, { favorites: list });
      res.json({ success: true, message: '收藏已同步' });
    } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
  });

  app.post('/api/user-blacklist', authMiddleware, async (req, res) => {
    try {
      const { blacklist } = req.body;
      const username = req.user.username;
      if (!username) return res.status(400).json({ success: false, error: '缺少用户名' });
      // 同收藏：只接受正整数菜品 ID
      const list = Array.isArray(blacklist)
        ? blacklist.map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 500)
        : [];
      await userStorage.updateUser(username, { blacklist: list });
      res.json({ success: true, message: '黑名单已同步' });
    } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
  });

  // 退出登录（吊销当前 token）
  app.post('/api/user/logout', authMiddleware, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const revoked = await require('../../auth').revokeToken(token);
        if (!revoked) {
          logger.warn('退出登录：token 吊销失败');
        }
      }
      res.json({ success: true, message: '已退出登录' });
    } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
  });

  // 注销账号（需要JWT认证，且只能注销自己的账号；需密码二次确认防误触）
  app.post('/api/user/delete', authMiddleware, async (req, res) => {
    try {
      const username = req.user.username;
      if (!username) return res.status(400).json({ success: false, error: '缺少用户名' });
      const { password } = req.body || {};
      if (!password) return res.status(400).json({ success: false, error: '请输入登录密码确认注销' });
      const valid = await userStorage.validateLogin(username, password);
      if (!valid) return res.status(400).json({ success: false, error: '密码验证失败，账号未注销' });
      // 吊销当前token，防止删除后token仍可用
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try { await require('../../auth').revokeToken(token); } catch (e) { logger.warn('注销账号：token 吊销失败:', e.message); }
      }
      await userStorage.removeUser(username);
      res.json({ success: true, message: '账号已注销' });
    } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
  });
}

module.exports = { register };
