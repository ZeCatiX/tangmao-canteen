// 唐猫庭院 - 订单存活校验端点测试：GET /api/order/:id/status-check（F3 类收尾，2026-10-16）
// 背景：前端会话绑定横幅/结算前用本端点自查订单存活；授权与 /add 同口径（本人/管理员/同桌凭证），
// 无权视同不存在（不泄露订单存在性）。桌号即凭证——游客凭正确桌号可查本桌订单。
require('dotenv').config();
const test = require('node:test');
const assert = require('assert/strict');
const BASE = 'http://localhost:3000';

let adminToken = '';
// F2 校验后桌号必须合法(1-30),固定 24 避让常用测试桌(随机10-89会踩F2雷,2026-10-19修复)
let orderId = '';
const tableId = '24';

async function api(path, opt = {}) {
  const r = await fetch(BASE + path, {
    method: opt.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

test.before(async () => {
  // 管理员登录（口令从 env 读，禁止硬编码）
  const l = await api('/api/admin/login', {
    method: 'POST',
    body: { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS },
  });
  assert.equal(l.status, 200, '管理员登录失败');
  adminToken = l.body.token;
  // 造一条测试订单（真实菜品 2075 凉皮）
  const o = await api('/api/order', { method: 'POST', body: { items: [{ id: 2075, qty: 1 }], tableNumber: tableId } });
  assert.equal(o.status, 200);
  orderId = o.body.orderId;
  assert.ok(orderId, '测试订单创建失败');
});

test.after(async () => {
  // 测试单取消清理（尽力而为，不污染退出码）
  try {
    await api('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ status: 'cancelled' }),
    });
  } catch (e) {
    /* 忽略 */
  }
});

test('同桌凭证可查，返回真实状态 pending', async () => {
  const r = await api('/api/order/' + orderId + '/status-check?tableNumber=' + encodeURIComponent(tableId));
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  assert.equal(r.body.exists, true);
  assert.equal(r.body.status, 'pending');
});

test('错桌凭证视同不存在（不泄露存在性）', async () => {
  const r = await api('/api/order/' + orderId + '/status-check?tableNumber=' + encodeURIComponent('ZZ'));
  assert.equal(r.status, 200);
  assert.equal(r.body.exists, false);
});

test('不存在的订单返回 exists=false', async () => {
  const r = await api('/api/order/99999999/status-check?tableNumber=' + encodeURIComponent(tableId));
  assert.equal(r.status, 200);
  assert.equal(r.body.exists, false);
});

test('非法 id 返回 400', async () => {
  const r = await api('/api/order/abc/status-check?tableNumber=' + encodeURIComponent(tableId));
  assert.equal(r.status, 400);
});

test('订单取消后 status 变 cancelled（横幅自愈依据）', async () => {
  // 注意: api() 助手内部会 JSON.stringify,此处传对象——传预序列化字符串会双重编码 → 400 数据格式错误
  const c = await api('/api/orders/' + orderId + '/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + adminToken },
    body: { status: 'cancelled' },
  });
  assert.equal(c.status, 200, '取消PUT响应: ' + c.status + ' ' + JSON.stringify(c.body).slice(0, 120));
  const r = await api('/api/order/' + orderId + '/status-check?tableNumber=' + encodeURIComponent(tableId));
  assert.equal(r.body.exists, true);
  assert.equal(r.body.status, 'cancelled');
});
