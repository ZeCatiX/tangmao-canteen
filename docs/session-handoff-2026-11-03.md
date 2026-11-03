# 会话交接文档（2026-11-03）

> 本轮会话主线：全量检测修复 → 对标天财商龙功能开发 → 压测加固。新会话接续请先读本文件与 `docs/benchmark-tcsl.md`、`COLLABORATION.md`。

## 一、当前仓库状态

- **master 同步至** `7c580d4`（dev 全部 merge 完毕，工作树干净）
- **测试基线**：API 全量 117/117 绿（`npm test`）｜协同压测 14 例（`tests/chaos_collab.test.js`）｜催菜+常客回归 10 例（`tests/rush_visit.test.js`）｜估清桌态 10 例（`tests/stock_tables.test.js`）｜intro 浏览器级 4 例（`tests/intro_e2e.test.js`，真实 Chrome，不在 CI）
- **本地 .env 特殊项**：`ORDER_FREQ_LIMIT=100000`（放宽频控防测试互卡，CI 无此变量走默认 5）；.env 为 dotenvx 加密形态

## 二、本轮落库的关键提交

| 提交 | 内容 |
|---|---|
| `e001f49` 之前 | 历史基线 |
| `6863a6e` | **下单500修复**：dishes 表缺 is_sold_out/name_en/description_en 列（建库未跑补列迁移，DDL 补齐）+ 分类改名对齐（招牌/田园时蔬全链：menu.js 配置源/英文词条/admin 下拉/md 映射/测试断言） |
| `2d279ee` | 对标清单文档 docs/benchmark-tcsl.md（六域对照+P0/P1/P2 分级） |
| `ba9efca` | **估清库存联动**（daily_stock/sold_today/stock_date 三列+条件更新防超卖+懒式日切+仅剩N徽章+加购限购+admin备量管理）+ **桌态总览/并台**（30桌网格实时聚合+批量挪单） |
| `1884fd5` | **积分体系**（订单完成1元=1分/point_logs.order_id唯一防重/完成页与登录响应展示）+ **日报口径**（翻台率/桌均/环比昨日） |
| `c46ec84` | **幂等闸竞态修复**（压测抓到：并发同内容提交产生重复单——事务内 pg_advisory_xact_lock 串行化同key+锁内二次检查）+ chaos_collab 压测 14 例 |
| `0e10d2a` | **启动动画卡死修复**（rAF极慢时onDone不来+点击跳过被canvas吞 → click捕获阶段+pointerdown+8秒硬兜底三层防御） |
| `590c216` | intro 生命周期浏览器回归 4 例（puppeteer） |
| `a3ab22f` | **功能体验第二批**：催菜链路（10分钟门槛/30分钟冷却/看板红框🔥置顶）+ 常客记忆（visit-summary/欢迎条/再来一单）+ 客群标签（三档/口味分布/常客TOP）+ rush_visit 回归 10 例 |
| `ce6ceea`~`f4a2695` | admin 视觉四连修：顶栏active态（深浅双模式）/退出登录对比度/深色表单白底浅字反向/侧栏滚动/上传按钮溢出 |
| `9fc2a9f` | 对标清单 P1 全部标记落地 |

## 三、修复过的真缺陷（供新会话了解脆弱点）

1. **下单幂等竞态**：检查-插入非原子，并发同内容提交产生重复单 → advisory lock 原子化（chaos A1 钉死回归）
2. **启动遮罩卡死**：动画 onDone 走 rAF 累加，慢环境迟迟不来 + 点击跳过被 canvas 吞 → 8 秒硬兜底 + pointerdown 捕获（intro_e2e 钉死）
3. **DB 与代码 schema 漂移**：dishes 三列缺失导致下单/admin CRUD 500 → 启动幂等迁移机制已有，新增列务必同步 sample_data.sql 迁移段 + server.js 启动迁移 + 真实 DB 三处
4. **分类改名漂移**：DB 改名代码没跟 → CATEGORY_CONFIG（js/menu.js）是唯一配置源，改名只改这里 + globals.js 词条

## 四、遗留事项（新会话优先处理）

1. **🔴 admin 登录页明文密码提示**（admin.html 登录框下方印着账号密码文字）——测试便利提示，**上线前必删**，本轮测试发现后用户未下指令修
2. **CI 远端首跑未验证**：本地 npm test 117 + test:all 304 + 新增 3 个测试文件全绿，但推送后 CI（含 tangmao_test 库 seed）未实测
3. **puppeteer 浏览器 e2e 不在 CI 入口**（CI 无 Chrome，本地真跑）——既有决策，intro_e2e/filter_e2e 等靠本地纪律
4. 厨房看板"完成"二次确认会被 10 秒自动刷新重置（确认窗口 <10 秒内点两次才有效）——既有行为，未改

## 五、功能对标现状（对标文档 docs/benchmark-tcsl.md）

- **P0 核心链 ✅**：扫码点餐全链 + AI 推荐（独有）+ 厨房看板
- **P1 全清 ✅**：估清库存联动、桌态并台、催菜、常客记忆、客群标签、日报口径
- **P2 明确不做**：收银/支付/储值/供应链/硬件/连锁总部（不越界=接盘友好）
- **叙事**：竞争在入口层（AI 点餐体验），合作在结算层（订单走商龙收银）
- **下一步最高价值**：让唐猫庭院真实灰度使用（哪怕只做 AI 推荐入口），积累口味-订单-反馈数据

## 六、新会话开工注意事项

1. 改 js/ 后必须 `node build.js`（版本号自动升级）+ `pm2 restart tangmao`
2. 新增表列三处同步：sample_data.sql（CREATE+迁移段）+ server.js 启动迁移 + 真实 DB DDL
3. 测试桌号用 **1-9 号**（其他测试占 10-30 池）；本地频控被 ORDER_FREQ_LIMIT 放宽，频控断言需环境感知（见 chaos C1 写法）
4. 异步兜底铁律已入 COLLABORATION.md + AGENTS.md（并发路径原子化 / UI 关闭挂 setTimeout 硬兜底 / 浏览器修复配 puppeteer 回归）
5. tests/chaos_collab、rush_visit、stock_tables 的造数均自清理；实验菜惯用 2082（回坊酸辣汤）
