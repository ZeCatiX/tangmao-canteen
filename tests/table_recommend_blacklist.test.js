// 一席成宴 拉黑排除 API 回归（2026-11-05）
// 背景: 席面(/api/recommend/table)此前从未排除 users.blacklist——顾客拉黑的菜会被排进
// 三套席面(单菜推荐前端有过滤,席面服务端没有)。修复后本测试钉死:
// 登录用户拉黑招牌菜(葫芦鸡2071) → 席面三套组合的所有菜品不得再出现该菜。
// 需要被测服务在跑(默认 http://localhost:3000, 可用 TEST_BASE_URL 覆盖)。
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const { Pool } = require('pg');

const db = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: +(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE || 'tangmao',
});

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const USER = 'bl_tes_1105';
const PASS = 'BlkTest1105A';
const BLOCK_DISH = 2071; // 葫芦鸡(招牌, CI 种子与本地库均有)

let token = '';

async function api(path, options = {}) {
  const r = await fetch(BASE + path, {
    ...options,
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
  });
  let body = {};
  try { body = await r.json(); } catch (e) {}
  return { status: r.status, body };
}

describe('一席成宴 拉黑排除', () => {
  before(async function () {
    // 服务可达探测
    try {
      const h = await fetch(BASE + '/', { signal: AbortSignal.timeout(3000) });
      if (!h.ok) throw new Error('HTTP ' + h.status);
    } catch (e) {
      console.log('  skip: 服务不可达(' + e.message + ')');
      this.skip();
      return;
    }
    // 注册+登录(已存在则直接登录)
    await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    const login = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    assert.equal(login.body.success, true, '登录失败: ' + JSON.stringify(login.body));
    token = login.body.token;
    // 拉黑葫芦鸡
    const blk = await api('/api/user-blacklist', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ username: USER, blacklist: [BLOCK_DISH] }),
    });
    assert.equal(blk.body.success, true, '设置拉黑失败: ' + JSON.stringify(blk.body));
  });

  after(async function () {
    // 清理拉黑(测试用户留存, 上线清洗会统一处理)
    if (token) {
      await api('/api/user-blacklist', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: JSON.stringify({ username: USER, blacklist: [] }),
      }).catch(() => {});
    }
    await db.end().catch(() => {});
  });

  it('mode=add 增量追加: 原子合并不覆盖既有名单(2026-11-05 优化)', async () => {
    // 既有拉黑=[2071](before设置), 追加2069 → 应为[2069,2071]而非覆盖
    const r = await api('/api/user-blacklist', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ username: USER, blacklist: [2069], mode: 'add' }),
    });
    assert.equal(r.body.success, true, '追加失败: ' + JSON.stringify(r.body));
    const q = await db.query('SELECT blacklist FROM users WHERE username = $1', [USER]);
    const cur = (q.rows[0] || {}).blacklist || [];
    assert.ok(cur.includes(2071), '既有拉黑保留');
    assert.ok(cur.includes(2069), '新增拉黑并入');
  });

  it('mode=remove 增量移除: 精确摘除单菜', async () => {
    const r = await api('/api/user-blacklist', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ username: USER, blacklist: [2069], mode: 'remove' }),
    });
    assert.equal(r.body.success, true);
    const q = await db.query('SELECT blacklist FROM users WHERE username = $1', [USER]);
    const cur = (q.rows[0] || {}).blacklist || [];
    assert.ok(!cur.includes(2069), '2069应被移除');
    assert.ok(cur.includes(2071), '葫芦鸡仍在');
  });

  it('拉黑葫芦鸡后, 一席成宴三套席面不得出现该菜', async () => {
    const r = await api('/api/recommend/table', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ partySize: 4, budgetPerPerson: 80 }),
    });
    assert.equal(r.status, 200, '席面请求应成功: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 120));
    assert.equal(r.body.success, true, '席面应成功: ' + JSON.stringify(r.body).slice(0, 120));
    assert.ok(r.body.excludedBlack >= 1, '响应应带拉黑排除数标注: ' + JSON.stringify(r.body.excludedBlack));
    const sets = r.body.sets || r.body.data && r.body.data.sets || [];
    assert.ok(sets.length > 0, '应返回席面组合');
    const all = sets.flatMap((s) => s.dishes || []);
    assert.ok(all.length > 0, '席面应有菜品');
    const hit = all.filter((d) => d.id === BLOCK_DISH);
    assert.equal(hit.length, 0, '拉黑菜(葫芦鸡2071)不得出现在席面: ' + JSON.stringify(hit));
  });
});
