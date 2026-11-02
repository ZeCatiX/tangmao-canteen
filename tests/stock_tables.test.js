// 估清(库存联动)+桌态/并台 回归测试(2026-11-02 对标商龙)
// 打真实服务(localhost:3000)+真实DB, 造数自清理; 桌号限1-30(服务端校验), 用28-30低频桌
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
const TEST_USER = 'stock-regression-test';
let adminToken = '';
let DISH_ID = 0; // 动态取: 本地=回坊酸辣汤(2082), CI=tangmao_test 库第一道可点菜
const createdOrders = [];

async function api(path, options = {}) {
  const r = await fetch(BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function setStock(dailyStock, soldToday) {
  await pool.query(
    'UPDATE dishes SET daily_stock=$1, sold_today=$2, stock_date=CURRENT_DATE, is_sold_out=FALSE WHERE id=$3',
    [dailyStock, soldToday, DISH_ID]
  );
}
async function placeOrder(qty, table) {
  const r = await api('/api/order', {
    method: 'POST',
    body: JSON.stringify({ items: [{ id: DISH_ID, qty }], tableNumber: String(table) }),
  });
  if (r.body.orderId) createdOrders.push(r.body.orderId);
  return r;
}

describe('估清·库存联动', () => {
  before(async () => {
    const login = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS }),
    });
    adminToken = login.body.token || '';
    assert.ok(adminToken, 'admin 登录应成功');
    // 动态选实验菜: 第一道上架未售罄的菜(CI 的 tangmao_test 库 id 与本地不同)
    const menu = await api('/api/dishes');
    const d = (menu.body.dishes || []).find((x) => x.is_active !== false && x.is_sold_out !== true);
    assert.ok(d, '应存在可用的实验菜品');
    DISH_ID = d.id;
    // 清掉本测试可能残留(上次跑挂没清干净)的订单
    await pool.query('DELETE FROM orders WHERE user_id=$1', [TEST_USER]);
    await setStock(10, 0);
  });

  it('下单扣减: 备量10下2份 → sold_today=2 且不售罄', async () => {
    const r = await placeOrder(2, 28);
    assert.equal(r.body.success, true, JSON.stringify(r.body));
    const s = await pool.query('SELECT daily_stock, sold_today, is_sold_out FROM dishes WHERE id=$1', [DISH_ID]);
    assert.equal(parseInt(s.rows[0].sold_today), 2);
    assert.equal(s.rows[0].is_sold_out, false);
  });

  it('卖完自动售罄: 备量3下3份 → is_sold_out=true', async () => {
    await setStock(3, 0);
    const r = await placeOrder(3, 28);
    assert.equal(r.body.success, true, JSON.stringify(r.body));
    const s = await pool.query('SELECT sold_today, is_sold_out FROM dishes WHERE id=$1', [DISH_ID]);
    assert.equal(parseInt(s.rows[0].sold_today), 3);
    assert.equal(s.rows[0].is_sold_out, true);
  });

  it('余量不足拒单报仅剩N份: 备量5已售4, 下2份 → 400「仅剩 1 份」', async () => {
    await setStock(5, 4);
    const r = await placeOrder(2, 27); // 27桌: 避开test1同items同桌的幂等窗口
    assert.equal(r.status, 400);
    assert.match(r.body.error, /仅剩 1 份/);
  });

  it('日切重置: stock_date=昨天 → 下单前自动复位 sold_today 与售罄', async () => {
    await pool.query(
      'UPDATE dishes SET daily_stock=5, sold_today=9, is_sold_out=TRUE, stock_date=CURRENT_DATE - 1 WHERE id=$1',
      [DISH_ID]
    );
    const r = await placeOrder(1, 27); // 同上避开幂等窗口
    assert.equal(r.body.success, true, JSON.stringify(r.body));
    const s = await pool.query('SELECT sold_today, is_sold_out, stock_date FROM dishes WHERE id=$1', [DISH_ID]);
    assert.equal(parseInt(s.rows[0].sold_today), 1); // 日切清零后扣1
    assert.equal(s.rows[0].is_sold_out, false);
    assert.equal(new Date(s.rows[0].stock_date).toDateString(), new Date().toDateString());
  });

  it('admin 设备量: PUT daily_stock=7 生效; null 恢复不限量', async () => {
    const r1 = await api('/api/admin/dish/' + DISH_ID, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ daily_stock: 7 }),
    });
    assert.equal(r1.body.success, true, JSON.stringify(r1.body));
    const s1 = await pool.query('SELECT daily_stock FROM dishes WHERE id=$1', [DISH_ID]);
    assert.equal(parseInt(s1.rows[0].daily_stock), 7);
    const r2 = await api('/api/admin/dish/' + DISH_ID, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ daily_stock: null }),
    });
    assert.equal(r2.body.success, true);
    const s2 = await pool.query('SELECT daily_stock FROM dishes WHERE id=$1', [DISH_ID]);
    assert.equal(s2.rows[0].daily_stock, null);
  });

  it('admin 备量非法值拒: 0/-5/99999/abc → 400', async () => {
    for (const bad of [0, -5, 99999, 'abc']) {
      const r = await api('/api/admin/dish/' + DISH_ID, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ daily_stock: bad }),
      });
      assert.equal(r.status, 400, '备量 ' + bad + ' 应被拒');
    }
  });

  after(async () => {
    if (createdOrders.length) {
      await pool.query('DELETE FROM orders WHERE id = ANY($1::int[])', [createdOrders]);
    }
    await pool.query('UPDATE dishes SET daily_stock=NULL, sold_today=0, is_sold_out=FALSE WHERE id=$1', [DISH_ID]);
  });
});

describe('桌态总览+并台', () => {
  const T_FROM = 8; // 1-9号桌不在任何测试桌池(uniqTable循环10-30), 并发安全
  const T_TO = 9;
  let orderIdFrom = 0;

  before(async () => {
    const login = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS }),
    });
    adminToken = login.body.token || '';
    await pool.query('DELETE FROM orders WHERE user_id=$1', [TEST_USER]);
  });

  it('桌态接口: 30桌网格, 下单后对应桌 occupied=true 带订单列表', async () => {
    const r1 = await placeOrder(1, T_FROM);
    assert.equal(r1.body.success, true, JSON.stringify(r1.body));
    orderIdFrom = r1.body.orderId;
    const ts = await api('/api/admin/tables/status', { headers: { Authorization: 'Bearer ' + adminToken } });
    assert.equal(ts.body.success, true);
    assert.equal(ts.body.tables.length, 30);
    const tFrom = ts.body.tables.find((t) => t.table === T_FROM);
    assert.equal(tFrom.occupied, true);
    assert.equal(tFrom.orderCount, 1); // 29号为低频测试桌
    assert.ok(Array.isArray(tFrom.orders) && tFrom.orders.length >= 1);
  });

  it('并台: 源桌全部未完结单挪桌, 桌态同步', async () => {
    const r = await api('/api/admin/tables/merge', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ fromTable: T_FROM, toTable: T_TO }),
    });
    assert.equal(r.body.success, true, JSON.stringify(r.body));
    assert.equal(r.body.mergedOrders, 1);
    const inDb = await pool.query('SELECT table_number FROM orders WHERE id=$1', [orderIdFrom]);
    assert.equal(String(inDb.rows[0].table_number), String(T_TO));
    const ts = await api('/api/admin/tables/status', { headers: { Authorization: 'Bearer ' + adminToken } });
    const tFrom = ts.body.tables.find((t) => t.table === T_FROM);
    assert.equal(tFrom.occupied, false);
  });

  it('并台校验: 同桌拒/非法桌号拒/空源桌拒', async () => {
    const same = await api('/api/admin/tables/merge', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ fromTable: T_TO, toTable: T_TO }),
    });
    assert.equal(same.status, 400);
    const bad = await api('/api/admin/tables/merge', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ fromTable: 99, toTable: 5 }),
    });
    assert.equal(bad.status, 400);
    const empty = await api('/api/admin/tables/merge', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ fromTable: T_FROM, toTable: T_TO }),
    });
    assert.equal(empty.status, 400); // 已被上一步并空
  });

  it('并台需 admin token: 无token 401/403', async () => {
    const r = await api('/api/admin/tables/merge', {
      method: 'POST',
      body: JSON.stringify({ fromTable: T_TO, toTable: T_FROM }),
    });
    assert.ok([401, 403].includes(r.status), '无token应被拦, 实际 ' + r.status);
  });

  after(async () => {
    await pool.query('DELETE FROM orders WHERE user_id=$1', [TEST_USER]);
  });
});
