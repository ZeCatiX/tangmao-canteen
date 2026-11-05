// 席面采纳埋点回归（2026-11-05 数据飞轮第一步）
// 覆盖: 席面生成写 show 行(参数+三套内容)并回传 logId/nonce → 采纳上报写 adopt 行(nonce 校验)
// → 错 nonce 拒绝(防伪造刷量)。API 级: 需要被测服务在跑(默认 http://localhost:3000)。
// 自清理: 按 show 行 id 精确删除本测试产生的行。
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const { Pool } = require('pg');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const CAN_RUN = Boolean(process.env.PG_PASSWORD);

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: +(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE || 'tangmao',
});

let showLogId = null;
let nonce = null;
let setKey = null;

async function api(path, options = {}) {
  const r = await fetch(BASE + path, {
    ...options,
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
  });
  let body = {};
  try { body = await r.json(); } catch (e) {}
  return { status: r.status, body };
}

describe('席面采纳埋点(table_set_log)', () => {
  before(async function () {
    if (!CAN_RUN) {
      console.log('  skip: 缺 PG_PASSWORD(直接 node 跑时由调用方注入)');
      this.skip();
      return;
    }
  });

  after(async function () {
    if (showLogId) {
      await pool.query('DELETE FROM table_set_log WHERE id = $1 OR log_id = $1', [showLogId]).catch(() => {});
    }
    await pool.end();
  });

  it('席面生成写入 show 行(参数+三套内容)并回传 logId/nonce', async () => {
    const r = await api('/api/recommend/table', {
      method: 'POST',
      body: JSON.stringify({ partySize: 3, budgetPerPerson: 70, spiciness: '微辣' }),
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(Number.isFinite(r.body.tableLogId), '响应应带 tableLogId');
    assert.ok(r.body.tableNonce && r.body.tableNonce.length >= 16, '响应应带 tableNonce');
    showLogId = r.body.tableLogId;
    nonce = r.body.tableNonce;
    setKey = r.body.sets[0].key;

    const q = await pool.query(
      'SELECT user_type, user_id, event_type, nonce, params, sets FROM table_set_log WHERE id = $1',
      [showLogId]
    );
    assert.equal(q.rows.length, 1, 'show 行应存在');
    const row = q.rows[0];
    assert.equal(row.event_type, 'show');
    assert.equal(row.user_type, 'guest');
    assert.equal(row.nonce, nonce);
    assert.equal(row.params.partySize, 3, '参数应入库');
    assert.ok(Array.isArray(row.sets) && row.sets.length === 3, '三套席面内容应入库');
  });

  it('采纳上报(nonce+logId 回链)写入 adopt 行', async () => {
    const r = await api('/api/recommend/table/adopt', {
      method: 'POST',
      body: JSON.stringify({ logId: showLogId, nonce: nonce, setKey: setKey }),
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    const q = await pool.query(
      "SELECT event_type, set_key, log_id FROM table_set_log WHERE log_id = $1 AND event_type LIKE 'adopt%'",
      [showLogId]
    );
    assert.equal(q.rows.length, 1, 'adopt 行应存在');
    assert.equal(q.rows[0].event_type, 'adopt_set');
    assert.equal(q.rows[0].set_key, setKey);
  });

  it('错 nonce 拒绝上报(防伪造刷量)', async () => {
    const r = await api('/api/recommend/table/adopt', {
      method: 'POST',
      body: JSON.stringify({ logId: showLogId, nonce: 'forged-nonce-000', setKey: setKey }),
    });
    assert.equal(r.status, 400);
    const q = await pool.query(
      'SELECT COUNT(*)::int AS c FROM table_set_log WHERE log_id = $1 AND event_type LIKE $2',
      [showLogId, 'adopt%']
    );
    assert.equal(q.rows[0].c, 1, '伪造上报不应写库(仍只有此前那一条)');
  });
});
