// 回归: 游客下单后登录续点加菜——同桌 tableNumber 凭证应放通(修复"订单不存在或无权操作")
// 背景: 旧逻辑归属校验只认 user_id,游客建的桌单在登录后被判无权,加菜/续点被拒
const { describe, it } = require('node:test');
const assert = require('node:assert');
const BASE = 'http://localhost:3000';

async function api(path, opts = {}) {
  const { headers = {}, body } = opts;
  const r = await fetch(BASE + path, Object.assign({}, opts, {
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body
  }));
  const j = await r.json().catch(() => ({ __parseError: true }));
  j.__status = r.status;
  return j;
}

describe('加菜归属：游客单登录后续点（同桌凭证）', () => {
  const uname = 'reg' + Date.now();
  const password = 'Test1234';
  let orderId = 0;
  let token = '';

  it('游客建桌单(07号桌)', async () => {
    const d = await api('/api/order', { method: 'POST', body: JSON.stringify({
      items: [{ id: 2069, name: '五常大米饭', price: 3, qty: 1, type: '购物车' }],
      totalPrice: 3, tableNumber: '07'
    }) });
    assert.ok(d.success, '建单应成功: ' + JSON.stringify(d));
    orderId = d.orderId;
  });

  it('注册并登录新用户', async () => {
    const reg = await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: uname, password }) });
    assert.ok(reg.success !== false, '注册应成功: ' + JSON.stringify(reg));
    const login = await api('/api/user/login', { method: 'POST', body: JSON.stringify({ username: uname, password }) });
    token = login.token || (login.user && login.user.token) || '';
    assert.ok(token, '登录应返回 token: ' + JSON.stringify(login).slice(0, 120));
  });

  it('登录后同桌(07)加菜应成功——修复点', async () => {
    assert.ok(orderId > 0, 'orderId 无效: ' + orderId);
    const d = await api('/api/order/' + orderId + '/add', { method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ items: [{ id: 2070, name: '唐猫酸汤锅子鱼', price: 78, qty: 1, type: '购物车' }], tableNumber: '07' }) });
    assert.ok(d.success, '同桌加菜应成功: ' + JSON.stringify(d));
    assert.equal(parseFloat(d.totalPrice), 81, '总价应为 3+78=81');
  });

  it('异桌(99)加菜仍应拒绝', async () => {
    const d = await api('/api/order/' + orderId + '/add', { method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ items: [{ id: 2069, name: '五常大米饭', price: 3, qty: 1, type: '购物车' }], tableNumber: '99' }) });
    assert.equal(d.success, false, '异桌凭证应被拒');
  });
});
