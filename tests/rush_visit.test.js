// 催菜链路+常客记忆+客群标签 回归(2026-11-02 对标商龙KDS/会员域 第二批)
// 催菜门槛: 进行中 且 下单≥10分钟 且 距上次催≥30分钟; 归属校验同status-check口径
require('dotenv').config();
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const { Pool } = require('pg');

const BASE = 'http://localhost:3000';
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: +(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'tangmao',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
});
const TEST_USER = 'rush-visit-' + (Date.now() % 1000000);
let adminToken = '';
let userToken = '';
let dishId = 0;
const madeOrders = [];

async function api(path, options = {}) {
  const r = await fetch(BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// 文件级公共准备(--test-name-pattern单跑时各describe自足, userToken/adminToken不依赖其他describe的before)
before(async () => {
  const adminLogin = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS }),
  });
  adminToken = adminLogin.body.token || '';
  assert.ok(adminToken, 'admin登录');
  await pool.query('DELETE FROM orders WHERE user_id=$1', [TEST_USER]);
  await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: TEST_USER, password: 'RushTest123456' }) });
  const login = await api('/api/user/login', { method: 'POST', body: JSON.stringify({ username: TEST_USER, password: 'RushTest123456' }) });
  userToken = login.body.token || '';
  assert.ok(userToken, '测试用户登录');
  const menu = await api('/api/dishes');
  const d = (menu.body.dishes || []).find((x) => x.is_active !== false && x.is_sold_out !== true);
  dishId = d.id;
  global.__dishName = d.name; // 下单时带name(与真实前端一致, visit-summary/kitchen渲染依赖)
});

describe('催菜链路', () => {

  it('下单不满10分钟催菜 → 400带剩余分钟', async () => {
    const ord = await api('/api/order', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + userToken },
      body: JSON.stringify({ items: [{ id: dishId, qty: 1 }], tableNumber: '13' }),
    });
    assert.equal(ord.body.success, true, JSON.stringify(ord.body));
    madeOrders.push(ord.body.orderId);
    const rush = await api('/api/order/' + ord.body.orderId + '/rush', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + userToken },
      body: JSON.stringify({ tableNumber: '13' }),
    });
    assert.equal(rush.status, 400);
    assert.match(rush.body.error, /10 分钟/);
    assert.ok(rush.body.waitMinutes >= 1, '应带剩余分钟');
  });

  it('时间条件绕过(直接回填created_at 15分钟前) → 催菜成功', async () => {
    const [o] = madeOrders.slice(-1);
    await pool.query("UPDATE orders SET created_at = NOW() - INTERVAL '15 minutes' WHERE id=$1", [o]);
    const rush = await api('/api/order/' + o + '/rush', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + userToken },
      body: JSON.stringify({ tableNumber: '13' }),
    });
    assert.equal(rush.status, 200, JSON.stringify(rush.body));
    assert.ok(rush.body.rushRequestedAt, '应回填催菜时间');
    const inDb = await pool.query('SELECT rush_requested_at FROM orders WHERE id=$1', [o]);
    assert.ok(inDb.rows[0].rush_requested_at, 'DB应记录催菜时间');
  });

  it('30分钟冷却: 刚催过再催 → 400带冷却提示', async () => {
    const [o] = madeOrders.slice(-1);
    const rush = await api('/api/order/' + o + '/rush', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + userToken },
      body: JSON.stringify({ tableNumber: '13' }),
    });
    assert.equal(rush.status, 400);
    assert.match(rush.body.error, /催过|加急/);
  });

  it('归属校验: 桌号不匹配的催菜 → 404', async () => {
    const [o] = madeOrders.slice(-1);
    const rush = await api('/api/order/' + o + '/rush', {
      method: 'POST',
      body: JSON.stringify({ tableNumber: '99' }),
    });
    // 桌号99不匹配且游客无归属 → 404(不泄露存在性)
    assert.equal(rush.status, 404, '实际' + rush.status);
  });

  it('admin可代催(无桌号凭证)', async () => {
    const [o] = madeOrders.slice(-1);
    // 先把上次催时间推远, 解除冷却
    await pool.query("UPDATE orders SET rush_requested_at = NOW() - INTERVAL '40 minutes' WHERE id=$1", [o]);
    const rush = await api('/api/order/' + o + '/rush', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({}),
    });
    assert.equal(rush.status, 200, JSON.stringify(rush.body));
  });

  it('已完成单催菜 → 400无需催', async () => {
    const [o] = madeOrders.slice(-1);
    const done = await api('/api/orders/' + o + '/status', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ status: 'completed' }),
    });
    assert.equal(done.body.success, true);
    const rush = await api('/api/order/' + o + '/rush', {
      method: 'POST',
      body: JSON.stringify({ tableNumber: '13' }),
    });
    assert.equal(rush.status, 400);
    assert.match(rush.body.error, /已完成|无需/);
  });
});

describe('常客记忆 visit-summary', () => {
  it('登录用户返回visitCount与lastOrderItems(自足: 先下一单再查)', async () => {
    // 自足下单(单跑--test-name-pattern时催菜组不执行, 不能依赖它的单)
    const ord = await api('/api/order', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + userToken },
      body: JSON.stringify({ items: [{ id: dishId, name: global.__dishName, qty: 1 }], tableNumber: '13' }),
    });
    assert.equal(ord.body.success, true, JSON.stringify(ord.body));
    madeOrders.push(ord.body.orderId);
    const r = await api('/api/user/visit-summary', { headers: { Authorization: 'Bearer ' + userToken } });
    assert.equal(r.body.success, true, JSON.stringify(r.body).slice(0, 120));
    assert.ok(r.body.visitCount >= 1, '应至少1次光临');
    assert.ok(Array.isArray(r.body.lastOrderItems) && r.body.lastOrderItems.length >= 1, '最近一单应有菜品');
    assert.ok(r.body.lastOrderItems[0].name, '菜品应带名称');
  });

  it('积分接口需登录: 无token 401', async () => {
    const r = await api('/api/user/visit-summary');
    assert.ok([401, 403].includes(r.status));
  });
});

describe('客群标签 user-segments', () => {
  it('admin返回三档客群与口味分布', async () => {
    const r = await api('/api/admin/user-segments', { headers: { Authorization: 'Bearer ' + adminToken } });
    assert.equal(r.body.success, true, JSON.stringify(r.body).slice(0, 120));
    assert.ok(typeof r.body.segments.regular === 'number', '常客数应数字');
    assert.ok(typeof r.body.segments.returning === 'number');
    assert.ok(typeof r.body.segments.newcomer === 'number');
    assert.ok(Array.isArray(r.body.tasteTop), '口味分布应数组');
  });

  it('客群接口需admin: 无token 401/403', async () => {
    const r = await api('/api/admin/user-segments');
    assert.ok([401, 403].includes(r.status));
  });
});

after(async () => {
  await pool.query('DELETE FROM point_logs WHERE user_id=$1', [TEST_USER]).catch(() => {});
  await pool.query('DELETE FROM users WHERE username=$1', [TEST_USER]).catch(() => {});
  if (madeOrders.length) {
    await pool.query('DELETE FROM orders WHERE id = ANY($1::int[])', [madeOrders]);
  }
  await pool.query("DELETE FROM orders WHERE table_number='13' AND created_at > NOW() - INTERVAL '15 minutes'").catch(() => {});
});
