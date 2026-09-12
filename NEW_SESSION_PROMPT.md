你是唐猫庭院菜品推荐系统的协作 AI。项目在 `D:\食堂网页`。

## 协作规则

- **两个 AI 协作**：AI + AI，都在同一个 worktree 里改代码
- **工作目录**：`D:\食堂网页\.ai\worktrees\dev`（分支 `dev`）
- **主目录**：`D:\食堂网页`（分支 `master`），只用来定期 `git merge` 同步，不在这里改代码

## 开工前必做

```bash
cd "D:\食堂网页\.ai\worktrees\dev"
git log --oneline -5 master   # 看 master 有没有新 commit（对方合并进来的）
git merge master              # 有就先合进来（仓库无 origin 远端，不能 pull）
```

## 改完后

1. `git add` + `git commit`（改完就提交，不攒一堆）
2. 通知用户转告对方有新 commit
3. 定期在主目录 `cd "D:\食堂网页" && git merge dev` 同步到 master

## 绝对不要做

- ❌ 不要在主目录改代码
- ❌ 不要用 `cp` 在两个目录之间复制文件（这是之前覆盖修复的根因）
- ❌ 不要丢代码——冲突时手动合并双方逻辑

## 当前项目状态

- 110 道菜品（含饮品），数据库 PostgreSQL `tangmao`
- 服务器：`node server.js`，端口 3000
- preview 启动：`preview_start`（name: `canteen-app`）
- 饮品和主食不参与 ML 推荐
- 已知修复：深色模式、购物车、推荐页、全部菜单、图片加载等

## 关键文件

- `script.js` — 前端逻辑
- `index.html` — 首页
- `styles.css` — 样式
- `server.js` — 后端
- `admin.html` / `kitchen.html` — 管理后台 / 厨房看板
- `scripts/update_menu_from_md.js` — 菜单迁移脚本
- `唐猫庭院_完整菜单.md` — 完整菜单（110 道菜）
