# 唐猫庭院 - 校园食堂菜品推荐系统

唐猫庭院，千年陕菜传承者——一个基于机器学习的校园食堂菜品推荐系统。融合传统陕菜精髓与现代推荐算法，根据用户口味偏好提供个性化菜品推荐。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | HTML5 · CSS3 · Bootstrap 5 · Chart.js · Bootstrap-Icons |
| 后端 | Node.js · Express |
| 数据库 | PostgreSQL 15 |
| 机器学习 | Python · scikit-learn · Random Forest |
| 认证 | JWT · bcrypt |
| 部署 | Docker Compose · PM2 |

## 快速开始

### 1. 环境要求

- Node.js ≥ 18
- PostgreSQL ≥ 14（或使用 Docker）
- Python ≥ 3.8（含 scikit-learn、pandas、numpy、psycopg2）

### 2. 安装依赖

```bash
npm install
pip install scikit-learn pandas numpy psycopg2-binary
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，设置数据库密码、JWT_SECRET、ADMIN_PASS
```

### 4. 初始化数据库

```bash
# 创建数据库并导入表结构与示例数据
psql -U postgres -d tangmao -f sample_data.sql
```

### 5. 启动服务器

```bash
npm start
# 访问 http://localhost:3000
# 管理后台 http://localhost:3000/admin
# 厨房看板 http://localhost:3000/kitchen
```

### 6. 构建前端（可选）

```bash
npm run build   # 将 js/ 目录合并为 script.js
```

## 测试

```bash
npm test                 # 运行 API 测试
npm run test:all        # 运行全部测试
npm run lint            # ESLint 检查
npm run security        # npm audit 依赖安全检查
```

## 主要功能

- **用户系统**：注册、登录、JWT 认证、账号注销
- **口味偏好**：辣度/咸淡/甜酸/预算/宗教/过敏源个性化设置
- **智能推荐**：随机森林模型 + 决策树降级 + 盲盒随机三级推荐链
- **盲盒点单**：换一批、选好了、退出动态交互
- **评分反馈**：菜品星级评分 + 整体满意度评价
- **购物车**：加购、删除、清空、结算
- **管理后台**：菜品 CRUD、图片上传、批量操作、数据导出、数据分析
- **厨房看板**：订单轮询、状态流转、完成订单
- **模型管理**：反馈收集 → 重训练 → 版本对比 → 新模型生效

## 项目结构

```
├── server.js            # Express 服务器主入口
├── auth.js              # JWT 认证中间件
├── db.js                # PostgreSQL 连接池
├── user_storage.js      # 用户存储（bcrypt + PostgreSQL）
├── logger.js            # Winston 日志模块
├── build.js             # 前端构建脚本
├── index.html           # 前台首页
├── admin.html           # 管理后台
├── kitchen.html         # 厨房看板
├── js/                  # 前端源码（构建合并为 script.js）
├── ml/                  # Python ML 管线(预测worker/重训/全量训练/指标脚本)


├── docker-compose.yml   # Docker 编排
├── ecosystem.config.js  # PM2 进程管理
└── tests/               # 测试套件
```

## 安全特性

- 密码 bcrypt 哈希（salt rounds=10）
- JWT 签名/验证/角色分离
- SQL 注入防护（全部参数化查询）
- XSS 转义（esc 函数）
- 请求速率限制（登录/注册/API 多级）
- 文件上传 MIME+扩展名双重校验
- 敏感文件 403 拦截
- Helmet 安全头 + CORS 域名限制

## License

MIT