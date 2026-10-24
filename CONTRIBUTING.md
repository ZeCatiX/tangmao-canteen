# 贡献指南

感谢您对唐猫庭院餐饮店推荐系统的关注！

## 开发环境搭建

```bash
# 1. 克隆仓库
git clone <repo-url>
cd tangmao-canteen

# 2. 安装依赖
npm install
pip install scikit-learn pandas numpy psycopg2-binary

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 设置数据库密码等

# 4. 初始化数据库
psql -U postgres -d tangmao -f sample_data.sql

# 5. 启动开发服务器（自动重启）
npm run dev
```

## 代码规范

- **JavaScript**：遵循 ESLint 配置（`npm run lint`）
- **CSS**：使用项目统一的 CSS 变量（`--primary`、`--gold` 等）
- **Python**：遵循 PEP 8
- **命名**：驼峰命名（camelCase），常量使用全大写

## 提交规范

遵循 Conventional Commits 格式：

```text
feat: 新功能
fix: 修复 bug
docs: 文档变更
style: 代码格式
refactor: 重构
test: 测试
chore: 构建/工具
```

## 测试

```bash
npm test              # 运行 API 测试
npm run test:all      # 运行全部测试
npm run test:watch    # 观察模式
npm run lint          # ESLint 检查
```

## PR 流程

1. Fork 项目并创建功能分支
2. 提交变更（遵循提交规范）
3. 确保测试通过：`npm run test:all`
4. 确保 lint 通过：`npm run lint`
5. 创建 Pull Request 描述变更内容

## 项目结构

```text
├── server.js          # Express 主入口
├── auth.js            # JWT 认证
├── db.js              # PostgreSQL 连接池
├── js/                # 前端源码（构建合并为 script.js）
├── styles.css         # 前端样式
├── *.py               # ML 训练/预测脚本
├── tests/             # 测试套件
└── docker-compose.yml # Docker 编排
```
