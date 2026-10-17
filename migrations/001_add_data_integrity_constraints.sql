-- 唐猫庭院 · 数据完整性约束迁移 (2026-10-16)
-- 背景: 全库零 CHECK 约束——服务端代码校验是唯一防线,DB 约束是最后防线
-- 执行方式: 幂等(IF NOT EXISTS),可在生产安全重复执行

-- ── orders ──
-- 状态只允许 5 个合法值
ALTER TABLE orders ADD CONSTRAINT IF NOT EXISTS chk_orders_status
  CHECK (status IN ('pending','confirmed','preparing','completed','cancelled'));

-- 总价不能为负
ALTER TABLE orders ADD CONSTRAINT IF NOT EXISTS chk_orders_total_price
  CHECK (total_price IS NULL OR total_price >= 0);

-- 桌号 NULL 或 1-30 数字或打包(NOT VALID 不校验历史行)
ALTER TABLE orders ADD CONSTRAINT IF NOT EXISTS chk_orders_table_number
  CHECK (table_number IS NULL OR table_number = '打包' OR (table_number ~ '^[0-9]{1,2}$' AND CAST(table_number AS INTEGER) BETWEEN 1 AND 30)) NOT VALID;

-- ── dishes ──
-- 价格不能为负
ALTER TABLE dishes ADD CONSTRAINT IF NOT EXISTS chk_dishes_price
  CHECK (price IS NULL OR price >= 0);

-- 名称不能为空
ALTER TABLE dishes ADD CONSTRAINT IF NOT EXISTS chk_dishes_name
  CHECK (name IS NOT NULL AND name != '');
