// 唐猫庭院 - 赠菜追加合同测试：/add 的复合键合并行为（id+giftTo+giftFrom+note）
// 背景：给别桌加菜时，前端会把赠菜以 giftTo 标记追加进本桌订单；
// 合并键必须区分赠菜与普通菜，否则 giftTo 标记丢失、厨房无法分桌出餐。
require('dotenv').config();
const test = require('node:test');
const assert = require('assert/strict');
const BASE = 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';

let adminToken = '';
const tableId = 'GMT' + Date.now().toString().slice(-6);

async function api(path, opt = {}) {
  const r = await fetch(BASE + path, {
    method: opt.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

test.before(async () => {
  const r = await api('/api/admin/login', {
    method: 'POST',
    body: { username: ADMIN_USER, password: process.env.ADMIN_PASS },
  });
  adminToken = r.body.token || '';
  assert.ok(adminToken, '管理员登录失败');
});

test('赠菜追加：giftTo 行独立成行不被同 id 普通行合并', async () => {
  // 1) 建本桌订单（21 号桌，1 碗米饭）
  const dishR = await api('/api/dishes');
  const rice = dishR.body.dishes.find((d) => d.name.includes('五常大米饭')) || dishR.body.dishes[0];
  const o1 = await api('/api/order', {
    method: 'POST',
    body: {
      userId: 'guest',
      tableNumber: '21',
      items: [{ id: rice.id, name: rice.name, price: rice.price, qty: 1 }],
      totalPrice: rice.price,
    },
  });
  assert.equal(o1.body.success, true);
  const orderId = o1.body.orderId;

  // 2) 赠菜追加：同 dish id，但带 giftTo（另一桌的赠菜）
  const add = await api('/api/order/' + orderId + '/add', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + adminToken },
    body: { items: [{ id: rice.id, qty: 1, giftTo: '22' }], tableNumber: '21' },
  });
  assert.equal(add.status, 200, '赠菜追加应成功: ' + JSON.stringify(add.body));

  // 3) 验证：订单应有两行——原普通行 + giftTo 行（未被合并）
  const q = await api('/api/orders?userId=guest', { headers: { Authorization: 'Bearer ' + adminToken } });
  const order = (q.body.orders || []).find((o) => o.id === orderId);
  assert.ok(order, '订单应存在');
  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
  const plain = items.filter((i) => !i.giftTo && !i.giftFrom);
  const gifted = items.filter((i) => i.giftTo === '22');
  assert.ok(plain.length >= 1, '应保留原普通行');
  assert.equal(gifted.length, 1, '赠菜应为独立行(giftTo=22)，实际 items: ' + JSON.stringify(items));
});

test('赠菜追加：取消单不能加菜（状态拦截回归）', async () => {
  const dishR = await api('/api/dishes');
  const dish = dishR.body.dishes[0];
  const o = await api('/api/order', {
    method: 'POST',
    body: {
      userId: 'guest',
      tableNumber: '17',
      items: [{ id: dish.id, name: dish.name, price: dish.price, qty: 1 }],
      totalPrice: dish.price,
    },
  });
  const orderId = o.body.orderId;
  const auth = { Authorization: 'Bearer ' + adminToken };
  const cancel = await api('/api/orders/' + orderId + '/status', {
    method: 'PUT',
    headers: auth,
    body: { status: 'cancelled' },
  });
  assert.equal(cancel.body.success, true);
  const add = await api('/api/order/' + orderId + '/add', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + adminToken },
    body: { items: [{ id: dish.id, qty: 1 }], tableNumber: '17' },
  });
  assert.equal(add.status, 400, '取消单加菜应被拒');
  assert.match(add.body.error || '', /取消/, '错误信息应说明订单已取消');
});

test('席面生成：人均不得超所选预算档 6% 以上（预算硬上限回归）', async () => {
  const exclude = [
    2071, 2130, 2129, 2094, 2075, 2111, 2104, 2079, 2122, 2128, 2101, 2117, 2103, 2107, 2076, 2069, 2137,
  ];
  for (const budget of [49, 60, 80, 89]) {
    const r = await api('/api/recommend/table', {
      method: 'POST',
      body: { partySize: 4, budgetPerPerson: budget, excludeIds: exclude },
    });
    assert.equal(r.body.success, true);
    for (const s of r.body.sets || []) {
      assert.ok(s.perPerson <= budget * 1.06, `${s.style} 人均 ${s.perPerson} 超出预算档 ${budget} 的 6% 容差`);
    }
  }
});
