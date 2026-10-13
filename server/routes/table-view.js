'use strict';
// 唐猫庭院 · 本桌账单(免登录,凭签名桌码)——从 server.js 拆出(2026-10-13 可维护性改造4)
const TABLE_SECRET = process.env.TABLE_SECRET || process.env.JWT_SECRET || 'tangmao-table-secret';
function tableSig(n) { return require('crypto').createHmac('sha256', TABLE_SECRET).update(String(n)).digest('hex').slice(0, 16); }
// 常量时间比较:避免字符串 !== 逐字符短路产生的计时侧信道(与 admin 登录同一套路)
function tableSigEq(expect, got) {
  const a = Buffer.from(String(expect)), b = Buffer.from(String(got));
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

function register(app, deps) {
  const { db, logger } = deps;
  app.get('/api/table-view', async (req, res) => {
    try {
      const t = String(req.query.t || '');
      const idx = t.lastIndexOf('.');
      const rawNum = idx > 0 ? t.slice(0, idx) : '';
      const sig = idx > 0 ? t.slice(idx + 1) : '';
      const num = /^\d{1,2}$/.test(rawNum) ? String(parseInt(rawNum, 10)).padStart(2, '0') : '';
      // 兼容旧版一位桌号链接:签名按原样或补零后匹配均可
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
}

module.exports = { register, tableSig };
