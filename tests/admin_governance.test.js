// 回归: 管理员治理端点 —— 重置用户密码 / 订单管理列表 / 下单频度防刷
// 背景: 2026-10-06 第一二档治理。系统无邮箱/手机字段, 顾客忘记密码只能店主重置;
//       下单加按桌号频度防刷(60s/5单, 店内顾客共享出口IP不能按IP限)。
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

let adminToken = '';
let createdUserId = null;
const createdOrderIds = [];

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
  // 清理: 删除临时用户、取消测试订单
  if (createdUserId) {
    await api('/api/admin/users/' + createdUserId + '/toggle', { method: 'POST' });
  }
  const H = { Authorization: 'Bearer ' + adminToken };
  for (const id of createdOrderIds) {
    await fetch(BASE + '/api/orders/' + id + '/status', {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ status: 'cancelled' }),
    }).catch(() => {});
  }
});

test('管理员可重置用户密码: 新密码可登录、旧密码失效', async () => {
  // 建临时用户
  const uname = 'rstest_' + (Date.now() % 100000);
  const oldPass = 'OldPass123';
  const reg = await api('/api/user/register', {
    method: 'POST',
    body: JSON.stringify({ username: uname, password: oldPass }),
  });
  assert.equal(reg.body.success, true, '临时用户注册应成功');
  // 拿用户 id
  const users = await api('/api/admin/users', { headers: { Authorization: 'Bearer ' + adminToken } });
  const u = users.body.users.find((x) => x.username === uname);
  assert.ok(u, '用户列表应包含临时用户');
  createdUserId = u.id;
  // 弱密码应被拒
  const weak = await api('/api/admin/users/' + createdUserId + '/reset-password', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify({ newPassword: 'weak' }),
  });
  assert.equal(weak.status, 400, '弱密码应 400');
  // 重置成功
  const reset = await api('/api/admin/users/' + createdUserId + '/reset-password', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify({ newPassword: 'NewPass456' }),
  });
  assert.equal(reset.body.success, true, '重置应成功: ' + JSON.stringify(reset.body).slice(0, 100));
  // 新密码可登录
  const newLogin = await api('/api/user/login', {
    method: 'POST',
    body: JSON.stringify({ username: uname, password: 'NewPass456' }),
  });
  assert.equal(newLogin.body.success, true, '新密码应可登录');
  // 旧密码失效
  const oldLogin = await api('/api/user/login', {
    method: 'POST',
    body: JSON.stringify({ username: uname, password: oldPass }),
  });
  assert.notEqual(oldLogin.body.success, true, '旧密码应失效');
});

test('未带管理员令牌不可重置密码', async () => {
  const r = await fetch(BASE + '/api/admin/users/1/reset-password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: 'HackPass123' }),
  });
  assert.ok([401, 403].includes(r.status), '应 401/403');
});

test('管理员订单列表: 状态筛选生效且字段齐全', async () => {
  const r = await api('/api/admin/orders?status=cancelled&limit=20', {
    headers: { Authorization: 'Bearer ' + adminToken },
  });
  assert.equal(r.body.success, true, '请求应成功');
  assert.ok(Array.isArray(r.body.orders), 'orders 应为数组');
  assert.ok(
    r.body.orders.every((o) => o.status === 'cancelled'),
    '筛选 cancelled 后不应混入其他状态'
  );
  if (r.body.orders.length) {
    const o = r.body.orders[0];
    assert.ok(
      'id' in o && 'table_number' in o && 'total_price' in o && 'items' in o && 'created_at' in o,
      '字段应齐全'
    );
  }
});

test('管理员订单列表: 桌号模糊搜索生效', async () => {
  const r = await api('/api/admin/orders?table=66&limit=50', {
    headers: { Authorization: 'Bearer ' + adminToken },
  });
  assert.equal(r.body.success, true);
  assert.ok(
    r.body.orders.every((o) => String(o.table_number || '').includes('66')),
    '桌号筛选应全部含 66'
  );
});

test('下单频度防刷: 同桌 60 秒内第 6 单应 429', { skip: (parseInt(process.env.ORDER_FREQ_LIMIT || '5') > 100) ? '当前环境已放宽下单频控(ORDER_FREQ_LIMIT>100),频控回归由 CI(默认阈值5)执行' : false }, async () => {
  // 用独占桌号 '20' 避免影响其他测试; 用不同 qty 产生不同 items 绕过 10 秒幂等去重
  const H = { 'Content-Type': 'application/json' };
  const statuses = [];
  for (let i = 1; i <= 6; i++) {
    const r = await fetch(BASE + '/api/order', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        items: [{ id: 2069, name: '五常大米饭', price: 3, qty: i }],
        totalPrice: 3 * i,
        tableNumber: '20',
      }),
    });
    statuses.push(r.status);
  }
  const created = await api('/api/admin/orders?table=20&limit=50', {
    headers: { Authorization: 'Bearer ' + adminToken },
  });
  createdOrderIds.push(...created.body.orders.map((o) => o.id));
  const tooMany = statuses.filter((s) => s === 429).length;
  assert.ok(tooMany >= 1, '至少一单应被 429 拒绝, 实际状态: ' + statuses.join(','));
  assert.ok(statuses.filter((s) => s === 200).length >= 5, '前 5 单应正常受理');
});
