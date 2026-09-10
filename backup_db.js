// 唐猫庭院 - 数据库备份脚本
// 用法: node backup_db.js
require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const BACKUP_DIR = path.join(__dirname, process.env.BACKUP_DIR || './backups');
const DB_NAME = process.env.PG_DATABASE || 'tangmao';
const DB_USER = process.env.PG_USER || 'postgres';
const DB_HOST = process.env.PG_HOST || 'localhost';
const DB_PORT = process.env.PG_PORT || '5432';
const MAX_BACKUPS = 3; // 只保留 3 份：当前 + 上一版 + 上上一版（多留几份是为了防止"昨天的数据就是错的"）

// 自动检测 pg_dump 路径（支持多个版本）
function findPgDump() {
  const commonPaths = [
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\13\\bin\\pg_dump.exe',
    'C:\\Program Files (x86)\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files (x86)\\PostgreSQL\\16\\bin\\pg_dump.exe',
    'C:\\Program Files (x86)\\PostgreSQL\\15\\bin\\pg_dump.exe',
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return `"${p}"`;
  }
  // 如果都没找到，尝试用环境变量 PATH 中的 pg_dump
  return 'pg_dump';
}

function backup() {
  // 确保备份目录存在
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  const filename = `tangmao_${timestamp}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);

  try {
    const pgDump = findPgDump();
    const cmd = `${pgDump} -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -f "${filepath}"`;
    execSync(cmd, { env: { ...process.env, PGPASSWORD: process.env.PG_PASSWORD || '' }, timeout: 120000 });
    logger.info(`数据库备份成功: ${filename}`);

    // 清理旧备份
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('tangmao_') && f.endsWith('.sql'))
      .sort()
      .reverse();
    if (files.length > MAX_BACKUPS) {
      files.slice(MAX_BACKUPS).forEach(f => {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
        logger.info(`删除旧备份: ${f}`);
      });
    }
    return true;
  } catch (e) {
    logger.error('数据库备份失败:', e.message);
    return false;
  }
}

if (require.main === module) {
  backup();
}

module.exports = backup;