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
   **【2026-11-03 CI 首跑补充】**"只改配置源"不够——改名当时漏了 `dishes_seed.sql`（CI 建库种子，首跑即红）和 `table_recommend.js`（热菜池/招牌匹配，真回归：田园时蔬 4 道菜不进热菜池，幸有 tags 兜底）。**改分类名五件套**：js/menu.js CATEGORY_CONFIG + js/globals.js 词条 + dishes_seed.sql 种子 + server.js 启动幂等数据迁移（`4c5cc85` 已加，旧库启动自愈）+ table_recommend.js 池子引用。三类只读文件不改：scripts/update_menu_from_md.js（改名映射）、唐猫庭院_完整菜单.md（店家原始数据）、docs/ 历史文档

## 四、遗留事项（新会话优先处理）

1. ~~**🔴 admin 登录页明文密码提示**~~ **✅ 2026-11-03 接续会话核实不存在**：pickaxe 全历史检索 + 登录 JS 预填检查 + 浏览器实测渲染 DOM 三重证据均无凭据文字；上轮所见疑为浏览器保存密码自动填充下拉或旧缓存。上线前目检一次即可
2. ~~**CI 远端首跑未验证**~~ **✅ 2026-11-03 已验证**：首跑暴露 dishes_seed.sql 分类旧名（见三.4 补充），修复后 run `41645421500` 全绿（1m35s，含四个新套件在默认频控下通过）；deploy job 仅 main 分支触发，推 master 不部署
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

## 七、接续进展（2026-11-03 下午会话）

- **CI 通道打通**：push master → GitHub Actions 为正式验证通道（此前 AGENTS.md/COLLABORATION.md"无 origin"说法过时，已纠正——两文件均 gitignore 不入库，改动直接落盘）。CI 全绿 run：`41645421500`
- **分类改名漂移三处收口**（提交 `4c5cc85`）：dishes_seed.sql 种子对齐 + table_recommend.js 池子对齐（含 210 行策略文案选择器，专项测试当场抓到第一次漏改）+ server.js 启动幂等数据迁移
- **遗留清单状态**：四.1 已核实不存在、四.2 已验证，见上
- **未动的已知事项**：ppt_decks/（主目录三个未跟踪演示文稿目录，非仓库内容，未处理）； kitchen 四.4 维持不改

## 八、菜品数勘误与上线清洗（2026-11-03 傍晚追加）

- **菜品总数 = 110 道**（与店家券码菜单/完整菜单 md 一致）。此前各处写的 116 是 DB 快照行数：其中混有 6 道名为"测试重复菜名"的脏菜（热菜分类）+ 种子快照含 6 道历史重复/拆分条（回坊酸辣汤×5、一口脆虾球(芥末味)——**【11-04 勘误】都是重复/口味拆分条，没有任何菜真的下架**），两头巧合相等
- **cleanup_test_dishes.js 修复**：订单 items 里的注入毒单（id='1 OR 1=1'，guest pending，永不删）曾把引用判定 SQL 的 `::int` 强转打崩，测试菜清不掉——改为 CASE 甄别数字再转。已跑 posttest 删净脏菜，**现库 110 道、测试菜 0 残留**
- **dishes_seed.sql 对齐 110**（剔除上述 6 道重复/下架行），ci.yml/globals.js 注释同步；种子与库、券码菜单三方一致
- **cleanup_production_data.js 补缺口**：`--purge-guest-orders` 现在连游客反馈/推荐日志一起清。dry-run 口径：ASCII 测试用户 197 个（订单 4/反馈 2/推荐日志 24）+ 游客历史单 1596（已完成/已取消）+ 游客反馈 1623 + 游客推荐日志 4982。**未执行**，上线时先 `backup_db.js` 再 `--execute --purge-guest-orders`
- ~~**⚠️ 上线前待决策**：游客 pending 单积压~~ **✅ 2026-11-04 双管齐下已解决**。积压真相：1924 张游客 pending（8/20-21 旧原型 E2E 马拉松一次灌了 ~1600 张，引用的 dish id=1 早已不存在；另 7-8 月零星 ~300 张）；一直清不掉的原因是 cleanup_test_orders 走管理 API 而 `/api/orders?status=` 为保看板性能 **LIMIT 100**，每轮只够得着最新 100 张，8 月死单永远在窗口外。**修复①** cleanup_test_orders 改直连 SQL（绕开 LIMIT，不依赖服务在线），首次运行取消 1932 张一次清光，此后每轮只清本轮自产（验证：第二次跑仅 6 张）；**修复②** cleanup_production_data 加显式 `--purge-guest-pending`（仅游客+仅 pending，默认永不删的安全设计不变），上线时与 `--purge-guest-orders` 一起物理删除。上线清洗全流程：`backup_db.js` → `cleanup_production_data.js --execute --purge-guest-orders --purge-guest-pending`

## 九、规格变体机制修复（2026-11-04 追加）

- **口味/规格的区分机制 = 菜名括号后缀拆条**：`一口脆虾球(原味)`/`(芥末味)` 两条记录，前端详情弹层重聚成一张卡 + 可点选 SKU 规格行（js/menu.js 规格组重聚）；**席面主料归一双口味拦截（table_recommend.ingredientOf）也依赖拆条名**（tests/table_recommend.test.js:612 钉死）。三重依赖，拆条是正式机制不是脏数据
- **发现并修复数据回归**：8/24 快照后有人把 2085 改成裸名"一口脆虾球"并删了 2711"(芥末味)"，华山论剑 2155/2156 的容量后缀(·500ml/·250ml)也被抹掉（前端会出现两个同名"(20年)"不同价）→ 已按快照+菜单 md 权威恢复：2085 恢复"(原味)"+serving/description/name_en 字段，**INSERT 新芥末味变体 id=2320**，华山论剑三条恢复容量名与英文词条；事务脚本跑完即删，浏览器验收两菜 SKU 行均正常（111 行=110 道菜）
- **种子同步**：追加 2320 行（克隆 2085 行改口味字段），头注释改"110 道菜 / 111 行"
- **教训**：改菜品数据前先查三重依赖（前端重聚/席面主料/英文名）——带括号后缀的菜名不是重复，是规格编码
- **CI 竞态（run `41844604455` 红，非变体修复引入）**：test:all 是 `--test-concurrency=2` 并行，points_report 与 stock_tables 用同一策略选"第一道未售罄的菜"（都是五常大米饭），points 的 qty1 下单插进 stock 的 `setStock(3,0)` 与下单校验之间 → "备量3下3份"误判"仅剩2份"。前三轮全绿纯属时序运气，新增变体行改变毫秒级时序暴露潜伏竞态。**修复：points_report 改选最后一道可用菜**（只下单不改库存，用尾菜彻底错开）；本地并发复跑两轮 15/15 绿。教训：**并行测试文件选"动态菜"必须彼此错位（首/尾分治），或固定互斥的 dish id**
- **EN 入口手机端可达性（2026-11-05 双端验证收口）**：手机布局下语言切换按钮收进汉堡菜单（Bootstrap `#navbarNav` 折叠区，展开后为菜单底部 EN 圆钮），展开态会保持——标准响应式设计非 bug。实测手机端全路径：汉堡 → EN → 汉堡面板/hero 全站翻译生效（Home/About Us/Full Menu/Tang Elegance…）。**排障注意**：验证前先看汉堡是否展开过，"按钮不可见"≠按钮不存在；另发现 Clash Verge 内核僵死时所有出境流量恰在 5 秒整被掐（含 api.github.com 直连），重启内核即愈——远程推送失败时先区分"节点断"与"内核僵死"
- **【勘误】看板"完成"确认窗口是 3 秒不是 10 秒**：`completeOrder` 的 arm 定时器 `setTimeout 3000`（kitchen.html），10 秒只是自动刷新周期——自动化/慢手操作"点了没反应"先想到这个窗口
- **admin 过期 token 登录死锁调查（2026-11-05，结论：非产品缺陷）**：IAB 自动化里"过期 token 加载 admin 后正确凭据点击登录无反应"经四层二分（服务端 API 同凭据成功/空 Bearer 也成功/DOM `el.click()` 成功/真 Chrome puppeteer 回归 2/2 绿），定性为 **IAB 自动化输入层偶发不触发 DOM click 事件**（合成点击与真 Chrome 均正常）。防御性修复保留：`showAdmin` 给登录页加 `z-index:3000` 压过 fixed 侧栏（过期弹回后侧栏溢出元素曾命中登录按钮坐标的 hit-test）。回归钉死：`tests/admin_expired_token.test.js`（真 Chrome，种过期 token→登录→断言进面板，已纳入 test:all；CI 无 Chrome 自动 skip）

## 十、重训管线接入收藏/拉黑隐式样本（2026-11-05 晚，提交 `bdfa67a`/`2aa3412`）

- **数据口径**：`retrain_from_feedback.py` 新增 `load_implicit_from_db()`——users 表收藏折 **5 分**、拉黑折 **1 分**，用户特征取档案 preferences（键名与 feedback.user_preferences 同构）；**三条纪律**：①显式评分优先（同 (user,dish) 去重，防矛盾信号互拉）②拉黑优先于收藏 ③档案无偏好跳过
- **顺手修两个既有真 bug**：①重训模型路径指向 ml/ 而 worker 读根目录——**历史每次重训产物从未生效**，且首次无旧模型时 NotFittedError 直接崩（predict 基线已加兜底）②两处 psycopg2 连接硬编码 `tangmao` 库名——CI 的 tangmao_test 连不上。均改环境变量驱动
- **验证**：`tests/retrain_implicit.test.js` 三例（去重/编码 y=0.2/空偏好跳过，psycopg2 取 jsonb `'{}'` 出来是**空 dict 不是字符串**的坑已修）纳入 test:all；实跑完整重训 292 条有效（隐式 285）诚实 R² 0.9404，行为级验证：含隐式模型 vs 纯合成对照对葫芦鸡预测 +0.104（方向=收藏信号）
- **模型当前状态（重要）**：该模型吃的是**测试噪声**（285 条隐式里 284 条来自 fav_*/blk_* 历史测试账号假收藏）→ **已回滚至纯合成干净版**（重跑 `train_restaurant_model.py`，诚实 R² 0.9462，metrics 无 implicit 键）。**原则：未上线阶段模型只吃真数据**。上线清洗（cleanup_production_data 清掉 fav_*/blk_* 测试账号）后，真实顾客的收藏/拉黑/评分走同一管线自然喂模型
- metrics 新键：`explicit_count` / `implicit_count`（model_metrics.json 与 pkl 内均有）
- **席面数据飞轮第一步埋点已上线（2026-11-05 深夜，CI 绿 42031553174）**：新表 `table_set_log`（show/adopt 双事件，params+三套 sets 完整 JSONB 入库，server.js 启动幂等建表）；席面响应带 `tableLogId/tableNonce`，采纳上报端点 `POST /api/recommend/table/adopt`（nonce+logId 回链防伪造，埋点失败静默）；前端整桌加购/逐菜加购挂 `reportTableAdopt` 上报。回归 `tests/table_set_log.test.js` 三例纳入 test:all。**第 2 步统计利用（采纳率/热门组合进日报）与第 3 步席面模型（partySize/budget 进 14 维特征）都从这张表取数——表结构已为两者预留完整数据**

## 十一、系统性边角补齐（2026-11-05 深夜，提交 `待查`）

三组新回归 + 一个真缺口修复，全部纳入 test:all：

- **🟢 修真缺口：席面(/api/recommend/table)服务端拉黑排除**——此前拉黑过滤只在单菜推荐前端（js/recommendation.js:82），**一席成宴三套席面从未排除 users.blacklist**（前后端都没有），顾客拉黑的菜会被排进席面。修复：recommend.js 新增 `getBlacklistedIds(req)`（登录读 users.blacklist，游客空集），union 构建时排除并计数。API 回归 `tests/table_recommend_blacklist.test.js`：登录→拉黑葫芦鸡(2071)→席面断言无该菜
- **🟢 断网缓存渲染回归**：`tests/offline_cache.test.js`（puppeteer）——拦截 /api/dishes abort 后 reload，缓存经 `localStorage['dishDataCache']` 进入渲染管线（dishData>50、菜品名入 DOM）。js/init.js:171 的弱网兜底链路（缓存先渲染→10s race→catch 保持）实测生效
- **🟢 盲盒枯竭契约**：候选全被排除时 `selectBlindBoxDish` 返回 null（调用方 `if (blind)` 已保护），正常数据返回盲盒菜——evaluate 钉死双面契约
- **🟢 席面组合层边角**：`tests/table_recommend_edge.test.js` 四例——招牌池全空（拉黑/售罄后）席面降级不崩、忌口拉满四池枯竭空席面、partySize=1 简餐模式、quotasFor 自动缩池。组合层本就健壮（quotasFor min 缩池），钉死防重构回退
- **测试侧教训**：body.innerText 对 display:none 区不含文本（菜单 section 未激活时"菜单未见"≠未渲染，要查 DOM 行数）；`buildPools` 返回 `{pools, excluded}` 包装；psycopg2 取 jsonb `'{}'` 是空 dict 非字符串

## 十三、2026-11-09 第三轮真实点击全面检查（纯验证轮+两项优化，master `3e69432`）

- **席面拉黑排除缺口修复**（b096f88）：服务端 getBlacklistedIds + 席面排除 + 拉黑标注四处 + 503 文案涵盖拉黑——API/GUI 双验证
- **拉黑 API 增量模式**（3e69432）：mode=add/remove 用 PG array_cat/array_remove 单语句原子更新（消除双设备并发丢名单窗口），缺省 set 向后兼容；登录限流文案加"约 1 分钟后"
- **席面埋点飞轮验证**：bl_tes_1106 GUI 全链（生成席面→逐菜加购→整桌加购）→ table_set_log 三行闭环（show/adopt_set/adopt_dish）
- **排版根因修复**（0680f52）：app-wrap flex→block（main 塌缩 454px→满宽 1045px）+ 预警横幅挪入 dashboard 页内 + 768 断点冲突改 767.98px
- **布局探针**（tests/admin_layout_probe.test.js）：3 视口×12 页水平溢出+超界元素自动检测，纳入 test:all
- **深色模式进度条核查**：金红渐变+中灰辅助色在深色卡上可读 ✓
- **admin 拆分待办（未做，挂起）**：admin.html 2214 行巨石（内联 4 script 块）拆出 js/admin-core.js 的专项曾做一半（11-08 晚提取+GUI 验证通过）但未提交，11-09 排查中 git checkout 回滚丢失。重做步骤与坑全记录在本文件"席面函数分布"排查段——挂起原因：巨石版功能完整且三轮 GUI 全绿，拆分属架构优化非功能修复
- **IAB 输入层丢事件五度呈现**：本环境真实鼠标事件偶发不触发 DOM click（el.click() 合成与真 Chrome 均正常）——关键浏览器级验证一律用 puppeteer 真 Chrome

## 十四、admin 拆分专项落地（2026-11-09 晚，dev `e714e01` / master `7958c0c`）——十三节挂起项清零

- **拆分结构**：admin.html 2214→933 行纯结构；四个内联 script 块按原执行顺序提取为 **js/admin-core.js 1284 行**（按需加载器→主逻辑 showAdminPage/全部 load*/CRUD→桌码QR→营业日报）。提取走 node 脚本按行号切片+边界哨兵，等价性逐行校验（原四块 vs 新文件反向重组）四块全等
- **三条关键决策**：① esc 双份消重**保留 String 强转版**（原块4）——同层级 function 声明后者覆盖，页面运行时实际生效的一直是它，保留块1 的"非字符串透传"版才是行为变化；② admin-core.js 必须是**普通同步 `<script src>`**（body 尾）——内联 onclick（toggleSoldOut/editDish/exportCSV 等九个）依赖顶层 function 全局作用域，禁改 module/IIFE；③ 不进 build.js 合并链（那是 index 顾客端），缓存版本 `?v=20261109a` 手工维护
- **顺手修正**：`</html>` 后游离的 `<style>`（user-table 对比度）与两个 script 块归位 body 内；768px 断点过时断言（11-09 第三轮改 767.98px 未同步测试）修为 767.98px——该条在 master HEAD 即挂，属既有挂账顺手清
- **测试同步 21 处（5 文件）**：comprehensive_e2e 8 处、comprehensive_ui_e2e 11 处、regression_fixes 3 处、deep_audit_e2e 走 **readAdmin() 拼接读法**（admin.html+admin-core.js = 拆分前"HTML+内联JS"审计范围超集，47 处批量替换）；两个例外：div 平衡等纯 HTML 断言单读 admin.html（剥 script 语义），deleteUser 函数体提取单读 admin-core.js（拼接会让 900 字符窗口伸进相邻 exportCSV 误命中"导出失败"）
- **验证链全绿**：node --check 语法 ✓｜runtime 深度检查 9/9（真 Chrome 登录+全 load 函数调用零 JS 错误）｜expired_token+layout_probe 5/5｜GUI 实操五项（日报渲染 1467 字符/桌码 QR 3 张/Chart.js 按需加载 3 canvas/内联 onclick 118 个/零页面错误）｜npm test 117/117｜CI 推送后见 run 记录
- **既有挂账（非本次引入，未动）**：`regression_fixes` 的 logo-intro 十二维雷达断言过时（master HEAD 即挂，与拆分无关）；**scrollToTop 在 admin 页未定义**——back-to-top 按钮 onclick 引用它，但定义在 js/core.js 而 admin.html 从未引入 script.js，点击必 ReferenceError（既有行为，修复方案：admin.html 补引或 admin-core.js 补定义，属功能修复另开专项）
- **教训闭环**：上次（11-08）拆分完成后未提交被 checkout 回滚丢失——本次改完即 commit（e714e01），专项单提交可追溯

## 十五、遗留两项修复 + 席面飞轮第 2 步（2026-11-09 深夜，master `600fd56`）

- **scrollToTop 缺口修复**（5528286）：admin-core.js 末尾补定义（与 core.js 同款平滑滚动），back-to-top 点击不再 ReferenceError；runtime_check 函数清单 + regression_fixes 静态断言双回归钉死；admin-core.js 版本号升 `?v=20261109b`
- **logo-intro 挂账清零**（5528286）：考古确认 `fea604e` 是有意统一标签红字（非回归），测试契约同步为"fill 固定 #b83a2a + font-weight 700"新设计，并删掉 isUser 死变量；`node build.js` 重打包（index 版本自动升）
- **席面埋点飞轮第 2 步落地**（44dc36a）：日报接口 daily-report 新增 `tableSet` 块——**采纳率为会话级口径**（当日发生任一采纳事件的 show 会话数 / 当日 show 数；show 与采纳可能跨日，各按事件发生日归入）、热门组合 TOP3（按 setKey+dishIds 聚合、回链 show 行 sets 取 style/菜名/总价）、热门单菜 TOP5；日报页新增"席面采纳"卡（统计五项+组合清单+单菜热门，空态文案）；无 show 日 rate=null 不显示误导性 0%。回归 `tests/table_set_stats.test.js` 三例（统计正确/错 nonce 不落行/空数据日）纳入 test:all 候选
- **第 3 步席面模型管线预铺完成**（9e0da2d / master `77f09bf`，2026-11-09 深夜）：特征 12→14 维（+席面人数/人均预算）三端对齐——train 的 encode_dish/compute_score 加预算规则（超人均预算 30% 以上线性罚封顶 4/15，budget=0 单菜场景零影响，partySize 纯占位等真实数据定规则）+25% 席面上下文样本流；predict_worker 按 `model.n_features_in_` 双模分流（**线上 12 维 pkl 行为零变化**，回归里有打分一致性铁证断言；下次重训 14 维自动生效）；retrain 同步+_align_features 维度自适应；fallbackScore 同款预算惩罚（train/serve 一致）；cleanup_production_data 加 `--purge-table-set-log`（上线清洗补缺口：席面埋点全清）。回归 `tests/table_model_features.test.js` 四例纳入 test:all。**未执行任何重训，线上模型不动**——真实席面数据积累后重训即启用；席面样本取数实现（load_table_samples）有意不写，避免对着测试埋点写死标签口径（挂点注释在 retrain_from_feedback.py）
- **⚠️ CI fixture 重要知识点（三轮 CI 红复盘）**：ci.yml 的 "Train model (CI fixture)" 步骤**每次 push 都用当前代码真训练一个模型**——14 维化后 CI fixture 自动带预算规则，与本地线上 12 维 pkl 从此分叉。推论：①"行为零变化"断言只在本地 12 维模型上成立，CI 上 14 维 fixture 打分必然随席面参数变化（=管线工作的证据，不是回归）；②worker 双模回归必须按 `n_features_in_` 双分支断言（12 维=打分 bit 级一致铁证 / 14 维=超预算贵菜不升分）；③`*.pkl` 不入库，worker 起进程的测试要探测模型文件缺失时 skip。三轮红根因依次：worker 起不来（CI 无 pkl）→ skip 后仍红（fixture 是 14 维打分变了）→ 双分支断言后全绿（run `42617703884`，同时完整验证 14 维训练管线干净环境端到端可跑）

## 十六、灰度上线 Runbook 固化（2026-11-11，`docs/go-live-runbook.md`）

- 把散落在本文档各节的上线流程固化成独立可执行手册：备份 → 清洗（三开关+2026-11-11 实测基线数字）→ 清洗后验证 → .env 安全五项（**首条=删除本地 ORDER_FREQ_LIMIT=100000 放宽值**）→ 灰度冒烟清单（含 3 秒确认窗/IAB 丢事件等已知行为）→ 灰度后飞轮动作（真实数据→席面取数实现→重训 14 维自动生效）→ 回滚预案 → 维护速查
- 素材来源：本文档八/十/十三/十四/十五节 + scripts 实测；后续上线动作以 runbook 为准，本文档只作历史背景
- 另：worktree 里 build.js 自动升级的 index.html 版本号残留已顺手提交（`80da331`）

## 十七、架构改动后全面验证轮（2026-11-11）

- **全绿结论**：npm test 117/117 + test:all 330/330(含行为级并行套件) + admin 运行时检查/布局探针 12/12 + 自写端到端冒烟 12/12(顾客端渲染/回到顶部/席面生成含 worker 打分/采纳上报/伪造 nonce 拒绝/admin 登录/日报席面卡真实埋点/8 页统一切页含 2 秒稳态检查/下单 POST /api/order/厨房 pending 可见)+ 服务 error 日志干净 + 静态架构核对(onclick 引用闭合 51 函数/幽灵 id 零/script.js 新鲜且含最新特征/admin-core 不泄漏进顾客端打包)
- **唯一实锤瑕疵并已修**：scrollToTop"缺口修复"勘误——拆分原文 L947 本有 `window.scrollToTop=` 箭头函数(11-09 修复时的 grep 行首锚定漏检该形式,误判为未定义并追加了重复的 function 声明;两实现相同故无行为影响)。已删重复定义保留原文箭头版,回归断言改为钉死单一定义(admin-core.js ?v=20261109d)
- **测试侧教训**：自写冒烟脚本三处契约误用浪费三轮——①showAdminPage 契约是**直收完整页面 id**(横幅 link.slice(1) 同款),不是"内部拼前缀";②fetch 拦截器只给 /api/admin/ 注 token,/api/orders 要手动带头;③席面 API 响应 sets 元素是完整 dishes 数组(dishIds 只存在于 table_set_log 存储格式)。另:两段式 evaluate(切页+sleep+查 active)会被窗口期假象坑,断言要用原子 evaluate
