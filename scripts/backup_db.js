#!/usr/bin/env node
// 唐猫庭院 · 数据库每日备份（路线图 T0.4）
// 用法: node scripts/backup_db.js
// - pg_dump 自定义格式全量备份 tangmao -> BACKUP_DIR\tangmao_YYYYMMDD.dump
// - uploads/ 同步复制到 BACKUP_DIR\uploads（增量覆盖，不删除）
// - 保留 30 天：清理 BACKUP_DIR 下超期 dump
// - 追加日志 backups/backup_log.txt；凭据全部来自 .env，不落明文日志
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PG_DUMP = process.env.PG_DUMP || 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe';
const backupDir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const retainDays = 30;
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const dumpFile = path.join(backupDir, `tangmao_${stamp}.dump`);
const logFile = path.join(backupDir, 'backup_log.txt');

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  fs.appendFileSync(logFile, line + '\n');
  console.log(line);
}
function fail(msg) {
  log('FAIL: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(PG_DUMP)) {
  fail(`pg_dump 不存在: ${PG_DUMP}`);
}
fs.mkdirSync(backupDir, { recursive: true });

// 1) pg_dump 全量备份（自定义格式，配合 pg_restore）
const env = Object.assign({}, process.env, { PGPASSWORD: process.env.PG_PASSWORD || '' });
const r = spawnSync(
  PG_DUMP,
  [
    '-h',
    process.env.PG_HOST || 'localhost',
    '-p',
    process.env.PG_PORT || '5432',
    '-U',
    process.env.PG_USER || 'postgres',
    '-d',
    process.env.PG_DATABASE || 'tangmao',
    '-F',
    'c',
    '-f',
    dumpFile,
  ],
  { env, stdio: ['ignore', 'ignore', 'pipe'] }
);
if (r.status !== 0) {
  fail('pg_dump 失败: ' + (r.stderr || '').toString().slice(0, 300));
}
const size = fs.statSync(dumpFile).size;
if (size < 1024) {
  fail(`dump 可疑过小: ${size}B`);
}
log(`OK pg_dump -> ${dumpFile} (${Math.round(size / 1024)}KB)`);

// 2) uploads/ 每日同步（复制不删除）
const upSrc = path.join(__dirname, '..', 'uploads');
const upDst = path.join(backupDir, 'uploads');
if (fs.existsSync(upSrc)) {
  fs.mkdirSync(upDst, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(upSrc)) {
    const s = path.join(upSrc, f),
      d = path.join(upDst, f);
    if (!fs.statSync(s).isFile()) {
      continue;
    }
    if (!fs.existsSync(d) || fs.statSync(d).size !== fs.statSync(s).size) {
      fs.copyFileSync(s, d);
      n++;
    }
  }
  log(`OK uploads 同步完成（新增/更新 ${n} 个文件）`);
}

// 3) 保留 30 天：清理超期 dump
const cutoff = Date.now() - retainDays * 86400000;
let removed = 0;
for (const f of fs.readdirSync(backupDir)) {
  const p = path.join(backupDir, f);
  if (/^tangmao_\d{8}\.dump$/.test(f) && fs.statSync(p).mtimeMs < cutoff) {
    fs.unlinkSync(p);
    removed++;
  }
}
log(`OK 清理超期备份 ${removed} 个（保留 ${retainDays} 天）`);
