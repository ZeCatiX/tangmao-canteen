// 回归: 订单幂等去重时区错位 + 游客加菜归属洞
// 背景: 2026-10-07 真机验证A2备注链路时发现。
//  bug1: created_at 是无时区 naive 列(存本地时间), 幂等比较却拿 UTC ISO 字符串,
//        PG 转 naive 时忽略时区 → 比较"10秒前"实际是"8小时前(UTC)"; 且去重不含桌号,
//        不同桌相同购物车会被并进旧桌订单(桌01的饭挂到桌08的票)。
//  bug2: /api/order/:id/add 归属校验 isOwner 对游客单恒真(全库游客单 user_id='guest'),
//        任何游客可给任何游客订单加菜。
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

var adminToken = '';
var createdOrderIds = [];
// 五常大米饭 id=2069(不参与推荐, 价格最低, 测试常客)
const RICE = [{ id: 2069, qty: 1, name: '五常大米饭', note: '', type: '购物车', price: 3, matchRate: 0.5 }];

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

before(async () => {
  const login = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: process.env.ADMIN_USER, password: process.env.ADMIN_PASS }),
  });
  adminToken = login.body.token;
  assert.ok(adminToken, '管理员登录应成功');
});

after(async () => {
  // 清理: 取消本文件产生的全部订单
  const H = { Authorization: 'Bearer ' + adminToken };
  for (const id of createdOrderIds) {
    await fetch(BASE + '/api/orders/' + id + '/status', {
      method: 'PUT', headers: H, body: JSON.stringify({ status: 'cancelled' }),
    }).catch(() => {});
  }
});

test('幂等窗口限时: 超10秒后同内容不同桌不得并单(时区错位回归)', async () => {
  const a = await api('/api/order', {
    method: 'POST',
    body: JSON.stringify({ userId: 'guest', items: RICE, totalPrice: 3, tableNumber: '91' }),
  });
  assert.equal(a.body.success, true);
  createdOrderIds.push(a.body.orderId);
  // 越过10秒窗口——旧代码此处因时区错位依然命中并单
  await new Promise(r => setTimeout(r, 11000));
  const b = await api('/api/order', {
    method: 'POST',
    body: JSON.stringify({ userId: 'guest', items: RICE, totalPrice: 3, tableNumber: '92' }),
  });
  assert.equal(b.body.success, true);
  createdOrderIds.push(b.body.orderId);
  assert.notEqual(b.body.orderId, a.body.orderId, '超过10秒窗口必须新建订单, 不得并进旧桌订单');
  assert.match(b.body.message, /已创建/);
});

test('幂等窗口内同桌重复提交仍防重(保留原有防双击能力)', async () => {
  const a = await api('/api/order', {
    method: 'POST',
    body: JSON.stringify({ userId: 'guest', items: RICE, totalPrice: 3, tableNumber: '93' }),
  });
  assert.equal(a.body.success, true);
  createdOrderIds.push(a.body.orderId);
  const b = await api('/api/order', {
    method: 'POST',
    body: JSON.stringify({ userId: 'guest', items: RICE, totalPrice: 3, tableNumber: '93' }),
  });
  assert.equal(b.body.success, true);
  assert.equal(b.body.orderId, a.body.orderId, '10秒内同桌同内容应视为重复提交返回原单');
  assert.match(b.body.message, /已存在/);
});

test('游客不能给别桌游客单加菜(归属洞回归)', async () => {
  const a = await api('/api/order', {
    method: 'POST',
    body: JSON.stringify({ userId: 'guest', items: RICE, totalPrice: 3, tableNumber: '94' }),
  });
  assert.equal(a.body.success, true);
  createdOrderIds.push(a.body.orderId);
  // 桌号对不上 → 既非本人(游客无身份)也非同桌 → 必须拒绝
  const cross = await api('/api/order/' + a.body.orderId + '/add', {
    method: 'POST',
    body: JSON.stringify({ userId: 'guest', items: RICE, tableNumber: '95' }),
  });
  assert.equal(cross.status, 404, '跨桌游客加菜必须被拒');
});

test('同桌游客续单仍可用(桌号即凭证不误伤)', async () => {
  const a = await api('/api/order', {
    method: 'POST',
    body: JSON.stringify({ userId: 'guest', items: RICE, totalPrice: 3, tableNumber: '96' }),
  });
  assert.equal(a.body.success, true);
  createdOrderIds.push(a.body.orderId);
  const same = await api('/api/order/' + a.body.orderId + '/add', {
    method: 'POST',
    body: JSON.stringify({ userId: 'guest', items: RICE, tableNumber: '96' }),
  });
  assert.equal(same.status, 200);
  assert.equal(same.body.success, true, '同桌游客凭桌号续单必须放行');
});
