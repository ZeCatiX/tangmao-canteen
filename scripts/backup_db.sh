#!/usr/bin/env bash
# 唐猫庭院 · PostgreSQL 每日备份脚本
# 用法: bash scripts/backup_db.sh            （手动/ cron 调用）
# 产出: backups/tangmao_YYYYMMDD_HHMM.sql.gz
# 保留: 最近 30 份，超出的最旧备份自动删除
# 恢复: gunzip -c <备份文件> | psql -h <host> -U <user> -d <目标库>
#       （恢复演练记录见 docs/商用化路线图与开发计划.md 阶段0）
set -euo pipefail
cd "$(dirname "$0")/.."

# 凭据从 .env 加载（PG_HOST/PG_PORT/PG_DATABASE/PG_USER/PG_PASSWORD）
if [ -f .env ]; then set -a; . ./.env; set +a; fi
unset PGOPTIONS   # .env 中的 PGOPTIONS 会污染 pg_dump(项目已知坑)
: "${PG_DATABASE:?缺少 PG_DATABASE}"
: "${PG_USER:?缺少 PG_USER}"
: "${PG_PASSWORD:?缺少 PG_PASSWORD}"
: "${PG_HOST:=localhost}"
: "${PG_PORT:=5432}"

mkdir -p backups
STAMP=$(date +%Y%m%d_%H%M)
OUT="backups/tangmao_${STAMP}.sql.gz"

echo "[backup] 开始备份 ${PG_DATABASE}@${PG_HOST}:${PG_PORT} -> ${OUT}"
PG_DUMP="${PG_DUMP:-/c/Program Files/PostgreSQL/17/bin/pg_dump.exe}"
PGPASSWORD="$PG_PASSWORD" "$PG_DUMP" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" --no-owner | gzip > "$OUT"

SIZE=$(wc -c < "$OUT")
if [ "$SIZE" -lt 1000 ]; then
  echo "[backup] ❌ 备份文件异常过小(${SIZE}B)，请检查 pg_dump 输出"
  exit 1
fi
echo "[backup] ✓ 备份完成 ${OUT} (${SIZE}B)"

# 保留最近 30 份
ls -1t backups/tangmao_*.sql.gz 2>/dev/null | tail -n +31 | while read -r old; do
  echo "[backup] 清理过期备份: $old"
  rm -f "$old"
done
