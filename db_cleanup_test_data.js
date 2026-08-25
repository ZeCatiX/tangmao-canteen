// 数据库测试数据清理脚本（支持 --dry-run 干跑）
// 用法: node db_cleanup_test_data.js [--dry-run] [--execute]
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'tangmao',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  connectionTimeoutMillis: 5000,
});

// 判定测试用户名（明确测试特征）
function isTestName(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  const patterns = [
    /e2e/i, /auth_test/i, /cart_test/i, /fb_auth_test/i, /orderview/i,
    /browser_api/i, /br_test/i, /final_\d/i, /login_test/i, /token_test/i,
    /pref_test/i, /feedback_test/i, /order_test/i, /scan_\d/i, /autologin_\d/i,
    /dupuser_\d/i, /checkout_\d/i, /refresh_\d/i, /lastbtn_\d/i, /navuser_\d/i,
    /prefsave_\d/i, /logout_test/i, /continue_\d/i, /history_\d/i,
    /toggle_test/i, /backbtn_\d/i, /ublist_\d/i, /vprof_\d/i, /cart_\d/i,
    /fav_\d/i, /blk_\d/i, /profil_user/i, /fav_user/i, /live_test/i,
    /pg_test/i, /pref_e2e/i, /e2e_user/i, /e2etest/i, /kitchen_test/i,
    /dpuser_\d/i, /profile_\d/i, /fav2_\d/i, /coverage_/i, /order_list_\d/i,
    /order_loop_\d/i, /order_struct_\d/i, /orderapi_\d/i, /rich_life_/i,
    /^journey_/i, /^diag_/i, /^test$/i, /test_\d/i, /_test\d/i, /u17846/i, /t17846/i,
    // 通用测试模式：xxx_test / xxx_test_数字 / multi_xxx / free_xxx / csrf_xxx / status_xxx / filter_xxx
    /_test$/i, /_test_/i, /^multi_/i, /^free_/i, /^csrf_/i, /^status_/i, /^filter_/i, /^e2e_multi/i,
    /^rate_/i, /^rateapi_/i, /^delacct_/i, /^profile_/i, /^fix_/i, /^hide_/i, /^flow_/i, /^pref\d?_/i, /^blk\d?_/i, /^star_/i, /^click_/i, /^pwd_/i, /^blind_/i,
  ];
  return patterns.some(re => re.test(n));
}

// 保留的明确真实用户（请勿删除！有注释说明来源）
// - 郑晨曦: 最早创建的真实用户（2026-04-26）
// - zcx: 真实用户（2026-07-20）
// - admin: 管理员账号（由 ADMIN_USER 环境变量创建，2026-08-16）
// - ab: 管理员测试账号（2026-08-16）
// - user_@#$%: 边界测试账号（特殊字符，2026-08-16）
// - <script> / '; DROP TABLE users;--: XSS/SQL注入测试残留（安全测试，保留以警示）
// - 测试😀\"'用户: 特殊字符测试账号（保留以警示）
const KEEP_USERS = new Set(['郑晨曦', 'zcx', 'admin', 'ab', 'user_@#$%', '<script>', "'; DROP TABLE users;--", "测试😀\"'用户"]);

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const execute = process.argv.includes('--execute');
  if (!dryRun && !execute) {
    console.log('用法: node db_cleanup_test_data.js --dry-run  (预览)');
    console.log('       node db_cleanup_test_data.js --execute (执行)');
    await pool.end();
    return;
  }

  // 找出测试用户
  const users = await pool.query(`SELECT id, username FROM users ORDER BY id`);
  const testUsers = users.rows.filter(r => isTestName(r.username) && !KEEP_USERS.has(r.username));
  const testNames = testUsers.map(r => r.username);
  const testIds = testUsers.map(r => r.id);

  console.log(`[${dryRun ? '干跑' : '执行'}] 测试用户: ${testNames.length} / ${users.rows.length}`);

  // 统计关联数据
  const tables = ['orders', 'feedback', 'user_preferences', 'preference_log', 'recommendation_log'];
  const counts = {};
  for (const t of tables) {
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t} WHERE user_id = ANY($1)`, [testNames]);
    counts[t] = r.rows[0].n;
  }
  console.log('  关联数据统计:');
  for (const [t, n] of Object.entries(counts)) console.log(`    ${t}: ${n}`);

  // 菜品测试数据（名称含"测试"或"e2e"）
  const dishes = await pool.query(`SELECT id, name FROM dishes WHERE name ILIKE '%测试%' OR name ILIKE '%e2e%' OR name ILIKE '%test%'`);
  console.log(`  测试菜品: ${dishes.rows.length} 条`);
  dishes.rows.forEach(r => console.log(`    id=${r.id} name="${r.name}"`));

  // 孤儿测试数据：关联表中 user_id 匹配测试模式，但 users 表中已无该用户（用户已删，数据残留）
  const orphanStats = {};
  for (const t of tables) {
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t} WHERE user_id = ANY($1)`, [testNames]);
    // 统计所有匹配测试模式的 user_id（无论是否在 users 表）
    const all = await pool.query(`SELECT DISTINCT user_id FROM ${t}`);
    const orphanIds = all.rows.map(x => x.user_id).filter(x => x && isTestName(x) && !testNames.includes(x));
    if (orphanIds.length > 0) {
      const oc = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t} WHERE user_id = ANY($1)`, [orphanIds]);
      orphanStats[t] = { count: oc.rows[0].n, ids: orphanIds.slice(0, 8) };
    }
  }
  if (Object.keys(orphanStats).length) {
    console.log('  孤儿测试数据(用户已删但订单/反馈残留):');
    for (const [t, s] of Object.entries(orphanStats)) console.log(`    ${t}: ${s.count} 条 (如 ${s.ids.join(', ')}...)`);
  }

  // E2E 测试订单识别：仅清理 user_id 匹配测试模式 且 completed 状态的订单
  // （防止误删 guest/zcx 等真实用户的订单 — 2026-08-19 曾发生过误删事故）
  const e2eOrders = await pool.query(`SELECT id FROM orders WHERE status='completed' AND (user_id = ANY($1))`, [testNames]);
  if (e2eOrders.rows.length > 0) {
    console.log(`  E2E测试订单(completed + 测试用户): ${e2eOrders.rows.length} 条`);
  }

  if (dryRun) {
    console.log('\n[干跑模式] 未做任何修改。使用 --execute 执行清理。');
    await pool.end();
    return;
  }

  // 执行清理（事务）
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 0. 先清理孤儿测试数据（用户已删但残留的订单/反馈等）
    for (const t of tables) {
      const all = await client.query(`SELECT DISTINCT user_id FROM ${t}`);
      const orphanIds = all.rows.map(x => x.user_id).filter(x => x && isTestName(x) && !testNames.includes(x));
      if (orphanIds.length > 0) {
        const oc = await client.query(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [orphanIds]);
        console.log(`  已删除孤儿 ${t}: ${oc.rowCount} 条`);
      }
    }
    // 0.5 清理 E2E 测试订单（近72h completed，测试产生）
    if (e2eOrders.rows.length > 0) {
      const e2eIds = e2eOrders.rows.map(x => x.id);
      const delE2E = await client.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [e2eIds]);
      console.log(`  已删除 E2E测试订单: ${delE2E.rowCount} 条`);
    }
    // 1. 删除测试用户关联数据（按 username 关联的各表）
    for (const t of ['orders', 'feedback', 'user_preferences', 'preference_log', 'recommendation_log']) {
      if (counts[t] > 0) {
        await client.query(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [testNames]);
        console.log(`  已删除 ${t}: ${counts[t]} 条`);
      }
    }
    // 2. 删除测试用户
    const delUsers = await client.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [testIds]);
    console.log(`  已删除测试用户: ${delUsers.rowCount} 条`);
    // 3. 删除测试菜品及其关联
    for (const d of dishes.rows) {
      await client.query(`DELETE FROM feedback WHERE dish_id = $1`, [d.id]);
      await client.query(`DELETE FROM dishes WHERE id = $1`, [d.id]);
      console.log(`  已删除测试菜品: id=${d.id} "${d.name}"`);
    }
    await client.query('COMMIT');
    console.log('\n清理完成！');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('清理失败，已回滚:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });