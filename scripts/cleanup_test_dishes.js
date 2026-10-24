// posttest 清理钩子(配套 cleanup_test_orders.js): 测试套件自建的测试菜
// (E2E 注册/CRUD 用例会创建"测试重复菜名""测试单位菜"等)残留进菜单,
// 污染热门排行与顾客端菜单。
// 删除走管理 API(服务端会同步刷新菜单缓存);只物理删除【零订单引用】的
// 测试菜,有订单引用的一律跳过。项目未上线,不存在误伤。
// 尽力而为: 任何失败只告警并退出 0,不污染测试管道的退出码。
require('dotenv').config();
const { Pool } = require('pg');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const TEST_PATTERNS = ['测试%', '诊断%', 'E2E%', 'e2e%'];

async function main() {
  // ① pg 只读: 找候选与订单引用(引用判定 SQL 精确,API 无此能力)
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE || 'tangmao',
  });
  let token = '';
  try {
    const login = await fetch(BASE + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS }),
    }).then((r) => r.json());
    if (!login.token) {
      throw new Error(login.error || '管理员登录失败');
    }
    token = login.token;
  } catch (e) {
    console.log('cleanup_test_dishes: 管理员登录失败(' + e.message + '),跳过清理');
    await pool.end();
    return;
  }
  try {
    const like = TEST_PATTERNS.map((_, i) => `name LIKE $${i + 1}`).join(' OR ');
    const cand = await pool.query(
      `SELECT id, name, EXISTS (SELECT 1 FROM orders o, jsonb_array_elements(o.items) e WHERE (e->>'id')::int = d.id) AS has_order FROM dishes d WHERE ${like} ORDER BY id`,
      TEST_PATTERNS
    );
    if (!cand.rows.length) {
      console.log('cleanup_test_dishes: 无测试菜残留');
      return;
    }
    let removed = 0,
      skipped = 0;
    for (const d of cand.rows) {
      if (d.has_order) {
        skipped++;
        continue;
      }
      // 走管理 API 删除: 服务端同步 loadDishData 刷新菜单缓存
      const r = await fetch(BASE + '/api/admin/dish/' + d.id + '/permanent', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token },
      });
      if (r.ok) {
        removed++;
      } else {
        skipped++;
      }
    }
    console.log(
      `cleanup_test_dishes: 删除 ${removed} 道,跳过 ${skipped} 道(有订单引用/失败),候选 ${cand.rows.length} 道`
    );
  } catch (e) {
    console.log('cleanup_test_dishes: 清理失败(' + e.message + '),不污染测试管道');
  } finally {
    await pool.end();
  }
}
main();
