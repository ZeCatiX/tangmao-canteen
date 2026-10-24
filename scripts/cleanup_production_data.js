#!/usr/bin/env node
'use strict';
// 唐猫庭院 · 上线前生产数据清洗(一次性脚本,配套 backup_db.js 使用——先备份再清洗!)
// 用法:
//   node scripts/cleanup_production_data.js                 # 默认 dry-run,只打印将清理的内容
//   node scripts/cleanup_production_data.js --execute       # 真正执行
//   node scripts/cleanup_production_data.js --execute --purge-guest-orders  # 连游客历史单(已完成/已取消)一起清
// 范围:
//   1) 白名单外用户(测试账号)及其 orders/feedback/recommendation_log
//   2) 可选: 游客(user_id 空/'guest')已完成/已取消订单
// 保护: username='admin' 与 --keep 指定名单永不删除;默认 dry-run;pending 订单永不删。
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const argv = process.argv.slice(2);
const execute = argv.includes('--execute');
const purgeGuestOrders = argv.includes('--purge-guest-orders');
// 白名单:admin + 已知真实用户(郑晨曦 2026-04 建档/zcx,均有过真实登录) + --keep 扩展。
// 双保险:含非 ASCII(中文)的用户名一律视为真实用户保留,不进清理名单。
const keep = new Set(['admin', '郑晨曦', 'zcx']);
for (const a of argv) {
  const m = a.match(/^--keep=(.+)$/);
  if (m) {
    keep.add(m[1]);
  }
}

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: +(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'tangmao',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
});

(async () => {
  // 1) 找出白名单外的用户(即全部测试账号;未上线库中真实用户应先加入 --keep)
  const users = await pool.query('SELECT username FROM users ORDER BY created_at');
  const isRealUser = (u) => keep.has(u) || /[^\x00-\x7F]/.test(u); // 含中文等非 ASCII → 真实用户,保留
  const victims = users.rows.map((r) => r.username).filter((u) => !isRealUser(u));
  const sample = victims.slice(0, 8);
  console.log(`用户总数 ${users.rows.length},白名单 ${keep.size},将清理测试用户 ${victims.length} 个`);
  console.log(`样例: ${sample.join(', ')}${victims.length > sample.length ? ' …' : ''}`);
  if (victims.length === 0) {
    console.log(' nothing to do.');
    await pool.end();
    return;
  }

  // 2) 统计关联数据
  const inList = victims.map((u) => `'${u.replace(/'/g, "''")}'`).join(',');
  const cnt = async (sql) => (await pool.query(sql)).rows[0].c;
  const ordersC = await cnt(`SELECT count(*)::int AS c FROM orders WHERE user_id IN (${inList})`);
  const feedbackC = await cnt(`SELECT count(*)::int AS c FROM feedback WHERE user_id IN (${inList})`);
  const reclogC = await cnt(`SELECT count(*)::int AS c FROM recommendation_log WHERE user_id IN (${inList})`);
  let guestC = 0;
  if (purgeGuestOrders) {
    guestC = await cnt(
      `SELECT count(*)::int AS c FROM orders WHERE (user_id IS NULL OR user_id IN ('','guest')) AND status IN ('completed','cancelled')`
    );
  }
  console.log(
    `关联数据: 订单 ${ordersC} | 反馈 ${feedbackC} | 推荐日志 ${reclogC}${purgeGuestOrders ? ` | 游客历史单 ${guestC}` : ''}`
  );

  if (!execute) {
    console.log('\n[DRY-RUN] 未做任何修改。确认无误后加 --execute 执行;建议先跑 node scripts/backup_db.js。');
    await pool.end();
    return;
  }

  // 3) 执行(单事务;pending 订单永不删——游客清理仅限 completed/cancelled)
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    let total = 0;
    let r = await cli.query(`DELETE FROM orders WHERE user_id IN (${inList}) RETURNING id`);
    total += r.rowCount;
    console.log(`删除测试用户订单 ${r.rowCount}`);
    if (purgeGuestOrders) {
      r = await cli.query(
        `DELETE FROM orders WHERE (user_id IS NULL OR user_id IN ('','guest')) AND status IN ('completed','cancelled') RETURNING id`
      );
      total += r.rowCount;
      console.log(`删除游客历史单 ${r.rowCount}`);
    }
    r = await cli.query(`DELETE FROM feedback WHERE user_id IN (${inList}) RETURNING id`);
    total += r.rowCount;
    console.log(`删除测试反馈 ${r.rowCount}`);
    r = await cli.query(`DELETE FROM recommendation_log WHERE user_id IN (${inList}) RETURNING id`);
    total += r.rowCount;
    console.log(`删除测试推荐日志 ${r.rowCount}`);
    r = await cli.query(`DELETE FROM users WHERE username IN (${inList}) RETURNING username`);
    total += r.rowCount;
    console.log(`删除测试用户 ${r.rowCount}`);
    const remain = await cli.query('SELECT count(*)::int AS c FROM users');
    await cli.query('COMMIT');
    console.log(`\n[EXECUTED] 共清理 ${total} 行,剩余用户 ${remain.rows[0].c}(白名单: ${[...keep].join(', ')})`);
  } catch (e) {
    await cli.query('ROLLBACK');
    console.log('FAIL(已回滚): ' + e.message);
    process.exitCode = 1;
  } finally {
    cli.release();
    await pool.end();
  }
})().catch((e) => {
  console.log('FAIL: ' + e.message);
  process.exit(1);
});
