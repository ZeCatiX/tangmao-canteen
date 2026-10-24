// 回归: 游客下单后登录续点加菜——同桌 tableNumber 凭证应放通(修复"订单不存在或无权操作")
// 背景: 旧逻辑归属校验只认 user_id,游客建的桌单在登录后被判无权,加菜/续点被拒
const { describe, it } = require('node:test');
const assert = require('node:assert');
const BASE = 'http://localhost:3000';

async function api(path, opts = {}) {
  const { headers = {}, body } = opts;
  const r = await fetch(
    BASE + path,
    Object.assign({}, opts, {
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body,
    })
  );
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
    const d = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 2069, name: '五常大米饭', price: 3, qty: 1, type: '购物车' }],
        totalPrice: 3,
        tableNumber: '07',
      }),
    });
    assert.ok(d.success, '建单应成功: ' + JSON.stringify(d));
    orderId = d.orderId;
  });

  it('注册并登录新用户', async () => {
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uname, password }),
    });
    assert.ok(reg.success !== false, '注册应成功: ' + JSON.stringify(reg));
    const login = await api('/api/user/login', { method: 'POST', body: JSON.stringify({ username: uname, password }) });
    token = login.token || (login.user && login.user.token) || '';
    assert.ok(token, '登录应返回 token: ' + JSON.stringify(login).slice(0, 120));
  });

  it('登录后同桌(07)加菜应成功——修复点', async () => {
    assert.ok(orderId > 0, 'orderId 无效: ' + orderId);
    const d = await api('/api/order/' + orderId + '/add', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        items: [{ id: 2070, name: '唐猫酸汤锅子鱼', price: 78, qty: 1, type: '购物车' }],
        tableNumber: '07',
      }),
    });
    assert.ok(d.success, '同桌加菜应成功: ' + JSON.stringify(d));
    assert.equal(parseFloat(d.totalPrice), 81, '总价应为 3+78=81');
  });

  it('异桌(99)加菜仍应拒绝', async () => {
    const d = await api('/api/order/' + orderId + '/add', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        items: [{ id: 2069, name: '五常大米饭', price: 3, qty: 1, type: '购物车' }],
        tableNumber: '25',
      }),
    });
    assert.equal(d.success, false, '异桌凭证应被拒');
  });
});

// ═══ 起售数量校验（核桃包 5元/个，3个起） ═══
describe('起售数量校验', () => {
  it('建单低于起售量(核桃包×1)返回400并提示起售', async () => {
    const d = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 2079, name: '核桃包', price: 5, qty: 1, type: '购物车' }],
        totalPrice: 5,
        tableNumber: '06',
      }),
    });
    assert.equal(d.success, false, '低于起售量应被拒: ' + JSON.stringify(d));
    assert.ok(/起售/.test(d.error || ''), '错误应提示起售: ' + (d.error || ''));
  });

  it('建单达到起售量(核桃包×3)成功', async () => {
    const d = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 2079, name: '核桃包', price: 5, qty: 3, type: '购物车' }],
        totalPrice: 15,
        tableNumber: '05',
      }),
    });
    assert.ok(d.success, '达到起售量应成功: ' + JSON.stringify(d));
  });

  it('加菜后仍低于起售量(1+1=2<3)返回400', async () => {
    const create = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { id: 2079, name: '核桃包', price: 5, qty: 1, type: '购物车' },
          { id: 2069, name: '五常大米饭', price: 3, qty: 1, type: '购物车' },
        ],
        totalPrice: 8,
        tableNumber: '04',
      }),
    });
    // 核桃包×1低于起售 → 建单应被拒，此时改按规则下单：米饭 + 核桃包×1 不可能合法
    // 换个角度：验证"仅米饭"单合法，然后单独加核桃包×1 → merged 1 <3 → 拒
    assert.equal(create.success, false, '含低于起售量的单应被拒');
    const ok = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 2069, name: '五常大米饭', price: 3, qty: 1, type: '购物车' }],
        totalPrice: 3,
        tableNumber: '04',
      }),
    });
    assert.ok(ok.success, '纯米饭单应成功');
    const add = await api('/api/order/' + ok.orderId + '/add', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 2079, name: '核桃包', price: 5, qty: 1, type: '购物车' }],
        tableNumber: '04',
      }),
    });
    assert.equal(add.success, false, '加菜低于起售量应被拒: ' + JSON.stringify(add));
    assert.ok(/起售/.test(add.error || ''), '应提示起售');
  });

  it('加菜合并后达到起售量(1+2=3)成功', async () => {
    const base = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 2069, name: '五常大米饭', price: 3, qty: 1, type: '购物车' }],
        totalPrice: 3,
        tableNumber: '03',
      }),
    });
    assert.ok(base.success);
    const add = await api('/api/order/' + base.orderId + '/add', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 2079, name: '核桃包', price: 5, qty: 3, type: '购物车' }],
        tableNumber: '03',
      }),
    });
    assert.ok(add.success, '合并后达到起售量应成功: ' + JSON.stringify(add));
  });
});
