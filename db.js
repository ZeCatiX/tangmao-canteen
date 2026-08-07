// 唐猫庭院 - PostgreSQL 数据库连接模块
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'tangmao',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // 连接后立即设置编码，避免 SQL_ASCII 数据库的中文问题
  keepAlive: true,
});

pool.on('error', (err) => {
  console.error('数据库连接池异常:', err.message);
});

module.exports = pool;