// 席面采纳统计进日报回归(2026-11-09 数据飞轮第2步: 采纳率/热门组合/热门单菜)
// 覆盖: 造 show×2 + adopt_set(回链 show)+ adopt_dish → GET /api/admin/daily-report
//   断言 tableSet.shows/adoptedSessions/采纳率(会话级)/topCombos(回链 sets 按 key+dishIds 聚合)/topDishes
//   → 空数据日 rate=null、topCombos=[]。自清理: 按 show 行 id 精确删除本测试产生的行(含回链采纳行)。
// API 级: 需要被测服务在跑(默认 http://localhost:3000)。
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const { Pool } = require('pg');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const CAN_RUN = Boolean(process.env.PG_PASSWORD);
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: +(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE || 'tangmao',
});

let token = null;
const madeShowIds = [];

async function api(path, options = {}) {
  const r = await fetch(BASE + path, {
    ...options,
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
  });
  let body = {};
  try { body = await r.json(); } catch (e) {}
  return { status: r.status, body };
}

// 造一条 show(两套席面: A=葫芦鸡组合, B=醋泡花生米组合), 返回 show 行 id
async function makeShow(tag) {
  const nonce = 'tsstat_' + tag + '_' + Date.now() + Math.random().toString(36).slice(2, 6);
  const sets = [
    { key: 'A', style: '家常团聚', dishIds: [2071, 2101], totalPrice: 128 },
    { key: 'B', style: '宴请硬菜', dishIds: [2071], totalPrice: 88 },
  ];
  const r = await pool.query(
    `INSERT INTO table_set_log (user_type, user_id, event_type, nonce, params, sets)
     VALUES ('guest', 'ts_stat_' || $1, 'show', $2, $3::jsonb, $4::jsonb) RETURNING id`,
    [tag, nonce, JSON.stringify({ partySize: 4, budgetPerPerson: 80, source: 'test' }), JSON.stringify(sets)]
  );
  madeShowIds.push(r.rows[0].id);
  return { id: r.rows[0].id, nonce, setB: sets[1] };
}

describe('席面采纳统计进日报(tableSet)', () => {
  let show1, show2;

  before(async function () {
    if (!CAN_RUN) {
      console.log('  skip: 缺 PG_PASSWORD(直接 node 跑时由调用方注入)');
      this.skip();
      return;
    }
    const login = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: ADMIN_PASS }),
    });
    token = login.body.token || '';
    assert.ok(token, 'admin 登录应成功');
    show1 = await makeShow('a');
    show2 = await makeShow('b');
    // show1: 整桌采纳 A 组合 + 逐菜加购 2101; show2: 不采纳(用于采纳率 1/2=50%)
    await api('/api/recommend/table/adopt', {
      method: 'POST',
      body: JSON.stringify({ logId: show1.id, nonce: show1.nonce, setKey: 'A' }),
    });
    await api('/api/recommend/table/adopt', {
      method: 'POST',
      body: JSON.stringify({ logId: show1.id, nonce: show1.nonce, setKey: 'A', dishId: 2101 }),
    });
  });

  after(async function () {
    for (const id of madeShowIds) {
      await pool.query('DELETE FROM table_set_log WHERE id = $1 OR log_id = $1', [id]).catch(() => {});
    }
    await pool.end();
  });

  it('当日 show/采纳/采纳率/组合/热门单菜统计正确', async () => {
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const r = await api('/api/admin/daily-report?date=' + today, {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(r.status, 200);
    const ts = r.body.tableSet;
    assert.ok(ts, '响应应含 tableSet 块');
    // 历史可能有其他 show 数据,用 >= 断言本测试的两条;采纳率口径为会话级
    assert.ok(ts.shows >= 2, '当日 show 数应 >= 2, 实际 ' + ts.shows);
    assert.ok(ts.adoptSet >= 1, '整桌采纳应 >= 1');
    assert.ok(ts.adoptDish >= 1, '单菜加购应 >= 1');
    assert.ok(ts.adoptedSessions >= 1, '有采纳会话应 >= 1');
    assert.ok(/%\)?$/.test(String(ts.rate)) || ts.rate === null, '采纳率应为百分比字符串或 null');
    const combo = (ts.topCombos || []).find((c) => c.style === '家常团聚');
    assert.ok(combo, 'TOP 组合应含本测试的家常团聚组合');
    assert.deepEqual(combo.dishNames, ['葫芦鸡', '醋泡花生米'], '组合应回链 show 行 sets 的菜名');
    const hotDish = (ts.topDishes || []).find((x) => x.name === '醋泡花生米');
    assert.ok(hotDish && hotDish.cnt >= 1, '热门单菜应含醋泡花生米');
  });

  it('错 nonce 采纳不落行(不影响统计)', async () => {
    await api('/api/recommend/table/adopt', {
      method: 'POST',
      body: JSON.stringify({ logId: show2.id, nonce: 'wrong_' + show2.nonce, setKey: 'B' }),
    });
    const r = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM table_set_log WHERE log_id = $1 AND event_type = 'adopt_set'`,
      [show2.id]
    );
    assert.equal(r.rows[0].cnt, 0, '错 nonce 应被拒, show2 无采纳行');
  });

  it('空数据日 rate=null 且组合为空数组', async () => {
    const emptyDate = '2020-01-01';
    const r = await api('/api/admin/daily-report?date=' + emptyDate, {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(r.status, 200);
    const ts = r.body.tableSet;
    assert.ok(ts, '空数据日也应返回 tableSet 块');
    assert.equal(ts.shows, 0, '空数据日 show 数应为 0');
    assert.equal(ts.rate, null, '无 show 时采纳率应为 null(不显示误导性 0%)');
    assert.deepEqual(ts.topCombos, [], '空数据日组合应为空数组');
    assert.deepEqual(ts.topDishes, [], '空数据日热门单菜应为空数组');
  });
});
