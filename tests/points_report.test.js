// 积分体系+日报口径 回归测试(2026-11-02 对标商龙会员/报表域)
// 打真实服务+真实DB, 造数自清理。积分规则: 订单完成时登录用户按 1元=1分 入账, order_id 唯一防重
require('dotenv').config();
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const { Pool } = require('pg');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: +(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'tangmao',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
});
const TEST_USER = 'pt-regression-' + (Date.now() % 1000000);
let adminToken = '';
let userToken = '';
let dishId = 0;
let orderId = 0;

async function api(path, options = {}) {
  const r = await fetch(BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

describe('积分体系', () => {
  before(async () => {
    const adminLogin = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS }),
    });
    adminToken = adminLogin.body.token || '';
    assert.ok(adminToken, 'admin 登录应成功');
    // 注册+登录测试用户
    await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: TEST_USER, password: 'PtsTest123456' }),
    });
    const login = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: TEST_USER, password: 'PtsTest123456' }),
    });
    userToken = login.body.token || '';
    assert.ok(userToken, '测试用户登录应成功: ' + JSON.stringify(login.body));
    assert.equal(login.body.user.points, 0, '新用户积分应为 0');
    // 动态选菜
    const menu = await api('/api/dishes');
    // 取最后一道可用菜: 避开与 stock_tables(并行跑, --test-concurrency=2)同选"第一道"——
    // 两者同菜会互踩估清计数(CI run 41844604455 实证: points 的 qty1 插进 stock 的 setStock(3,0)
    // 与下单校验之间, "备量3下3份"误判"仅剩2份"); 本测试只下单不改库存, 用尾菜彻底错开
    const avail = (menu.body.dishes || []).filter((x) => x.is_active !== false && x.is_sold_out !== true);
    const d = avail[avail.length - 1];
    assert.ok(d, '应存在可用菜品');
    dishId = d.id;
  });

  it('下单+完成 → 积分按 1元=1分 入账', async () => {
    const ord = await api('/api/order', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + userToken },
      body: JSON.stringify({ items: [{ id: dishId, qty: 1 }], tableNumber: '25' }),
    });
    assert.equal(ord.body.success, true, JSON.stringify(ord.body));
    orderId = ord.body.orderId;
    // 查单价算期望积分
    const menu = await api('/api/dishes/' + dishId);
    const price = parseFloat(menu.body.dish.price) || 0;
    const done = await api('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ status: 'completed' }),
    });
    assert.equal(done.body.success, true, JSON.stringify(done.body));
    const pts = await api('/api/user/points', { headers: { Authorization: 'Bearer ' + userToken } });
    assert.equal(pts.body.success, true);
    assert.equal(pts.body.points, Math.round(price), '积分应=订单金额取整');
    assert.ok(Array.isArray(pts.body.logs) && pts.body.logs.length === 1, '应有 1 条流水');
    assert.equal(pts.body.logs[0].orderId, orderId);
  });

  it('重复完成不重复入账(order_id 唯一)', async () => {
    await api('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ status: 'completed' }),
    });
    const pts = await api('/api/user/points', { headers: { Authorization: 'Bearer ' + userToken } });
    const logs = pts.body.logs.filter((l) => l.orderId === orderId);
    assert.equal(logs.length, 1, '同单只应有一条流水');
  });

  it('游客单完成不入账(无账户)', async () => {
    // 记录当前总流水
    const before = await api('/api/user/points', { headers: { Authorization: 'Bearer ' + userToken } });
    const guestOrd = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({ items: [{ id: dishId, qty: 1 }], tableNumber: '24' }),
    });
    assert.equal(guestOrd.body.success, true);
    await api('/api/orders/' + guestOrd.body.orderId + '/status', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ status: 'completed' }),
    });
    const after = await api('/api/user/points', { headers: { Authorization: 'Bearer ' + userToken } });
    assert.equal(after.body.points, before.body.points, '游客单完成不应影响测试用户积分');
  });

  it('积分接口需登录: 无token 401', async () => {
    const r = await api('/api/user/points');
    assert.ok([401, 403].includes(r.status), '无token应被拦, 实际 ' + r.status);
  });

  after(async () => {
    await pool.query('DELETE FROM point_logs WHERE user_id=$1', [TEST_USER]);
    await pool.query('DELETE FROM users WHERE username=$1', [TEST_USER]);
    const ids = [orderId];
    if (ids.filter(Boolean).length) {
      await pool.query('DELETE FROM orders WHERE id = ANY($1::int[])', [ids]);
    }
  });
});

describe('日报口径(翻台率/环比/桌均)', () => {
  before(async () => {
    const adminLogin = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS }),
    });
    adminToken = adminLogin.body.token || '';
  });

  it('日报返回新字段且类型正确', async () => {
    const r = await api('/api/admin/daily-report', { headers: { Authorization: 'Bearer ' + adminToken } });
    assert.equal(r.body.success, true, JSON.stringify(r.body).slice(0, 120));
    const s = r.body.stats;
    assert.equal(typeof s.usedTables, 'number', 'usedTables 应为数字');
    assert.match(s.turnoverRate, /^\d+%$/, 'turnoverRate 应为百分数字符串');
    assert.equal(typeof s.avgPerTable, 'number');
    assert.equal(typeof s.prevOrders, 'number');
    assert.equal(typeof s.prevRevenue, 'number');
    // 无昨日数据时环比为 null(不显示↑↓)
    if (s.prevRevenue === 0) {
      assert.equal(s.revenueChange, null);
    }
  });
});
