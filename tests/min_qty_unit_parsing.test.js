// 回归: 起售量解析支持任意量词(2盒起/3杯起…), 且 serving 与 description 双字段口径前后端一致
// 背景: 旧正则只认 "N个起", 后台开放起售备注后用户可写 "2盒起"——下单低于起售必须仍被服务端拒单
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

let adminToken = '';
const createdIds = [];
const orderIds = [];

const auth = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken });

async function createDish(name, serving, description) {
  const r = await fetch(BASE + '/api/admin/dish', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name, category: '特色凉菜', price: 7, rating: 3.5, serving, description }),
  });
  const d = await r.json();
  assert.equal(d.success, true, '建菜应成功: ' + JSON.stringify(d).slice(0, 120));
  createdIds.push(d.id);
  return d.id;
}

async function placeOrder(dish, qty) {
  const r = await fetch(BASE + '/api/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: dish.id, name: dish.name, price: Number(dish.price), qty, type: '购物车' }],
      totalPrice: Number(dish.price) * qty,
      tableNumber: '18',
    }),
  });
  const d = await r.json();
  if (d.success && d.orderId) {
    orderIds.push(d.orderId);
  }
  return d;
}

async function findDish(name) {
  const r = await fetch(BASE + '/api/dishes');
  const d = await r.json();
  const list = Array.isArray(d) ? d : d.dishes || d.data || [];
  return list.find((x) => x.name === name) || null;
}

// 建菜后服务端异步刷 dishData 缓存, 下单前轮询等缓存可见(与 /api/dishes 同源)
async function waitDish(name, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const dish = await findDish(name);
    if (dish) {
      return dish;
    }
    if (Date.now() > deadline) {
      return null;
    }
    await new Promise((res) => setTimeout(res, 200));
  }
}

async function cleanup() {
  for (const oid of orderIds) {
    await fetch(BASE + '/api/orders/' + oid + '/status', {
      method: 'PUT',
      headers: auth(),
      body: JSON.stringify({ status: 'cancelled' }),
    }).catch(() => {});
  }
  for (const id of createdIds) {
    await fetch(BASE + '/api/admin/dish/' + id + '/permanent', { method: 'DELETE', headers: auth() }).catch(() => {});
  }
}

before(async () => {
  const r = await fetch(BASE + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS }),
  });
  const d = await r.json();
  adminToken = d.token || '';
  assert.ok(adminToken, 'admin 登录应成功');
});
after(cleanup);

test('serving="2盒起": 下单1件被400拒单, 2件放行——量词不再限于"个"', async () => {
  const id = await createDish('测试盒起菜', '2盒起', '');
  const dish = await waitDish('测试盒起菜');
  assert.ok(dish, '测试菜应可见');
  const low = await placeOrder({ ...dish, id }, 1);
  assert.equal(low.success, false, '低于2盒起应拒单');
  const ok = await placeOrder({ ...dish, id }, 2);
  assert.equal(ok.success, true, '达到起售量应放行: ' + JSON.stringify(ok).slice(0, 120));
});

test('serving 缺失但 description="3瓶起": 服务端同样按起售拒单——双字段口径与前端一致', async () => {
  const id = await createDish('测试描述起售菜', '', '3瓶起');
  const dish = await waitDish('测试描述起售菜');
  assert.ok(dish, '测试菜应可见');
  const low = await placeOrder({ ...dish, id }, 2);
  assert.equal(low.success, false, 'description 起售 3, 下 2 件应拒单');
});
