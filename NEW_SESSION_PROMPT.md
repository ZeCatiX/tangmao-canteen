你是唐猫庭院菜品推荐系统的协作 AI。项目在 `D:\食堂网页`。

## 协作模式（2026-09-16 起）

- **协作 agent：AI + AI**（AI 已卸载），都在同一个 worktree 里改代码
- **工作目录**：`D:\食堂网页\.ai\worktrees\dev`（分支 `dev`）
- **主目录**：`D:\食堂网页`（分支 `master`），只用来定期 `git merge` 同步，不在这里改代码
- **完整协作规则**读 `COLLABORATION.md`（权威源）；AI 自动加载 `AGENTS.md`，AI 自动加载 `AI.md`，三者保持同步

## 开工前必做

```bash
cd "D:\食堂网页\.ai\worktrees\dev"
git log --oneline -5 master   # 看 master 有没有新 commit（对方合并进来的）
git merge master              # 有就先合进来（仓库无 origin 远端，不能 pull）
```

## 改完后

1. `git add` + `git commit`（中文一句话说清改动，改完就提交，不攒一堆）
2. 通知用户转告对方有新 commit
3. 定期在主目录 `cd "D:\食堂网页" && git merge dev` 同步到 master

## 绝对不要做

- ❌ 不要在主目录改代码
- ❌ 不要用 `cp` 在两个目录之间复制文件（这是之前覆盖修复的根因）
- ❌ 不要丢代码——冲突时手动合并双方逻辑
- ❌ 起服务前先探测 3000 端口（`netstat -ano | grep :3000`），有活服务先复用；停服务只杀目标 PID，**禁止 `taskkill /IM node.exe`**

## 项目工具（AI / AI 通用）

- **项目技能** `.agents/skills/`：`tangmao-dev`（起服务/验证/浏览器冒烟）、`tangmao-retrain`（模型重训）、`tangmao-tests`（测试规范）——做对应任务前先看技能
- **数据库只读查询**：`node scripts/db_query.js "SELECT ..." [--json]`
- **调试**：chrome-devtools MCP 可看 console 报错 / 网络请求（AI 在 `.ai/config.json`，AI 在 `.mcp.json`）

## 当前项目状态

- **⚠️ 项目尚未上线**:数据库里的用户/订单/反馈全部来自测试账号,非真实用户数据;ML 以模拟数据训练是预期设计
- 110 道菜品（含饮品），PostgreSQL `tangmao`，凭据在 `.env`（勿打印；worktree 副本缺键时从主目录补，密钥保持一致）
- 服务器：`node server.js`，HTTP 3000 + HTTPS 3443；服务从哪个目录起就服务哪份代码
- 饮品和主食不参与 ML 推荐
- 详细进度与协作历史见 `COLLABORATION.md`
