// 唐猫庭院 - 数据库只读查询助手
// 用法: node scripts/db_query.js "SELECT * FROM dishes LIMIT 5" [--json]
// 凭据自动从 .env 加载;仅允许单条只读语句(防误改数据)
require('dotenv').config();
const { Pool } = require('pg');

const sql = (process.argv[2] || '').trim();
const asJson = process.argv.includes('--json');

if (!sql) {
  console.error('用法: node scripts/db_query.js "SELECT ..." [--json]');
  process.exit(1);
}

// 只读守卫:允许 SELECT / WITH / EXPLAIN / TABLE;拒绝分号后还有内容的多语句(防 "SELECT 1; DELETE ...")
if (!/^(select|with|explain|table)\b/i.test(sql) || /;.+\S/.test(sql)) {
  console.error('❌ 只读守卫:仅允许单条 SELECT / WITH / EXPLAIN / TABLE 语句');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: +(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'tangmao',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
});

pool
  .query(sql)
  .then((r) => {
    if (r.rowCount > 200) {
      console.log(`⚠️ 返回 ${r.rowCount} 行,建议加 LIMIT`);
    }
    if (asJson) {
      console.log(JSON.stringify(r.rows, null, 2));
    } else {
      console.log(`行数: ${r.rowCount}`);
      console.table(r.rows);
    }
  })
  .catch((e) => {
    console.error('❌ 查询失败:', e.message);
    process.exit(1);
  })
  .finally(() => pool.end());
