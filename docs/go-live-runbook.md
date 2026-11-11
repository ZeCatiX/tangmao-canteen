# 唐猫庭院 · 灰度上线 Runbook

> 上线操作手册(2026-11-11 固化)。背景与历史决策见 `session-handoff-2026-11-03.md`;
> 竞争叙事:竞争在入口层(AI 点餐体验),合作在结算层(订单走商龙收银)。
> 原则:**项目未上线,库里全是测试数据**;模型只吃真数据(重训前不混测试样本)。

## 0. 前置检查

- [ ] master 与 dev 已同步、`npm test` 全绿、CI 最新 run 绿
- [ ] 服务可起:`pm2 restart tangmao`(从 `.ai/worktrees/dev` 起,入口 `server.js`,HTTP :3000)
- [ ] 菜品 110 道(与店家券码菜单一致):`node scripts/db_query.js "SELECT COUNT(*) FROM dishes WHERE is_active=TRUE"`

## 1. 备份(清洗前必做)

```bash
node scripts/backup_db.js
```

- 自动 `pg_dump` 到 `backups/`(约 700KB)+ 同步 uploads + 保留 30 天
- **回滚就靠这份 dump,务必确认文件存在再进行第 2 步**

## 2. 数据清洗(先 dry-run 后 execute)

```bash
# ① 全量 dry-run(只打印,不改数据)
node scripts/cleanup_production_data.js --purge-guest-orders --purge-guest-pending --purge-table-set-log

# ② 确认无误后执行
node scripts/cleanup_production_data.js --execute --purge-guest-orders --purge-guest-pending --purge-table-set-log
```

三个开关的口径(2026-11-11 实测基线,数字随测试增长属正常):

| 开关 | 清什么 | 2026-11-11 基线 |
|---|---|---|
| (默认) | 白名单外测试用户及其订单/反馈/推荐日志 | 用户 5476 / 单 255 / 反馈 382 / 推荐日志 469 |
| `--purge-guest-orders` | 游客已完成/已取消历史单 + 游客反馈/推荐日志 | 8/20-21 E2E 马拉松存量 |
| `--purge-guest-pending` | 游客 pending 死单(引用已删菜品,永不可完成) | ~1900 张 |
| `--purge-table-set-log` | 席面埋点全清(全是测试埋点,真实埋点从灰度开始积累) | 12 条 |

- 白名单保护:`admin`/`郑晨曦`/`zcx` + 一切含中文的用户名永不删除;扩展用 `--keep=名字`
- 历史坑:pending 清不掉是因为管理 API `LIMIT 100`,已改直连 SQL 绕开

## 3. 清洗后验证

```bash
node scripts/db_query.js "SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM orders) o, (SELECT COUNT(*) FROM feedback) f, (SELECT COUNT(*) FROM recommendation_log) r, (SELECT COUNT(*) FROM table_set_log) t, (SELECT COUNT(*) FROM dishes WHERE is_active=TRUE) d"
```

- 预期:users=3(白名单)/dishes=110,其余归 0
- **模型不动**:线上 pkl 是纯合成干净版(12 维),清洗不影响它;fav_*/blk_* 测试账号的假收藏随之消失,正好满足"模型只吃真数据"

## 4. 部署检查清单(.env 安全五项)

- [ ] **删除 `ORDER_FREQ_LIMIT=100000`**(本地防测试互卡的放宽值!上线缺省=5,留着=下单频控形同虚设)
- [ ] `JWT_SECRET` 换强随机值(测试期值不上生产)
- [ ] `ADMIN_PASS` 确认为强密码(登录限流已有:`LOGIN_RATE_LIMIT_MAX`/`ADMIN_LOGIN_RATE_LIMIT_MAX`)
- [ ] `TABLE_SECRET`(桌码签名密钥)确认为强值
- [ ] 可选 HTTPS:`SSL_KEY`/`SSL_CERT` 配置后自动启用(`SSL_PORT` 默认 3443)

## 5. 灰度冒烟清单(上线后第一轮真机走查)

- [ ] 顾客链路:扫码/进店 → 浏览菜单 → AI 推荐(忌口/口味) → 加购 → 结算 → 厨房看板出现新单 → 完成
- [ ] 席面链路:一席成宴生成(人数/预算/忌口) → 逐菜/整桌加购 → 日报"席面采纳"卡出现真实 show/采纳记录
- [ ] 后台:登录 → 仪表盘/菜品管理(售罄/备量)/桌态/日报(翻台率口径)
- [ ] 双端:手机端汉堡菜单 → EN 全站翻译;深色模式
- [ ] 已知行为(不是 bug):厨房"完成"二次确认窗口 **3 秒**(10 秒只是自动刷新周期);IAB 自动化环境真实鼠标事件偶发丢 click,关键验证一律 puppeteer 真 Chrome

## 6. 灰度后动作(数据飞轮)

1. 真实订单/反馈/收藏/拉黑自然积累(收藏=5 分/拉黑=1 分隐式样本)
2. 日报"席面采纳"卡观察采纳率与热门组合(会话级口径)
3. 真实席面样本足够后:按 `ml/retrain_from_feedback.py` 里预留的取数挂点实现 `load_table_samples_from_db`,重训 → 14 维模型(席面预算规则)自动生效,本地 12 维模型的"行为零变化"承诺随之结束
4. 重训用 tangmao-retrain skill(注意 PG_PASSWORD 环境变量注入的坑)

## 7. 回滚预案

```bash
# 数据回滚:用第 1 步的 dump 恢复
pg_restore -h localhost -U postgres -d tangmao --clean --if-exists backups/tangmao_YYYYMMDD.dump

# 代码回滚:worktree checkout 到上一个验证过的 commit 后 pm2 restart tangmao
# (教训:回滚前先确认没有未提交的有用改动——11-09 admin 拆分曾因未提交被 checkout 抹掉)
```

## 8. 上线后维护速查(常见坑)

- **改 js/ 必跑 `node build.js`(版本号自动升级)+ `pm2 restart tangmao`**
- **新增表列三处同步**:sample_data.sql(CREATE+迁移段)+ server.js 启动迁移 + 真实 DB DDL
- **改分类名五件套**:js/menu.js CATEGORY_CONFIG + js/globals.js 词条 + dishes_seed.sql + server.js 启动数据迁移 + table_recommend.js 池子
- 带括号后缀的菜名(如"一口脆虾球(原味)")是规格编码不是脏数据——改前查三重依赖(前端重聚/席面主料/英文名)
- push master 触发 CI(seed+test+test:all+audit,不部署);CI 的 "Train model (CI fixture)" 每次用当前代码真训练——ML 代码变更后 CI 模型与线上模型可能分叉
