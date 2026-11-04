// posttest 清理钩子: 测试套件会在厨房看板留下 pending/preparing 测试单,
// 污染看板渲染与自动化点击竞态。本脚本把数据库中所有未完成订单批量取消。
// 项目未上线,数据库订单全部来自测试,不存在误伤真实订单的可能(上线前需移除本钩子)。
// 2026-11-04 改直连 SQL(原走管理 API): /api/orders?status= 为保看板性能 LIMIT 100,
// 每次 posttest 只够得着最新 100 张,8 月遗留的 ~1900 张死单永远在窗口外积压
// (实证: 每次跑都"取消 102 张"纹丝不动)。SQL 一次清光,且不再依赖服务在线。
// 尽力而为: 任何失败只告警并退出 0,不污染测试管道的退出码。
require('dotenv').config();
const { Pool } = require('pg');

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing'];

async function main() {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: +(process.env.PG_PORT || 5432),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE || 'tangmao',
  });
  try {
    const ph = ACTIVE_STATUSES.map((_, i) => `$${i + 1}`).join(',');
    const r = await pool.query(
      `UPDATE orders SET status='cancelled' WHERE status IN (${ph}) RETURNING id`,
      ACTIVE_STATUSES
    );
    console.log(
      'cleanup_test_orders: 取消 ' + r.rowCount + ' 张测试单' + (r.rowCount === 0 ? '(看板本来干净)' : '')
    );
  } catch (e) {
    console.log('cleanup_test_orders: 清理失败(' + e.message + '),不污染测试管道');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.log('cleanup_test_orders: 异常 ' + e.message + ',跳过');
});
