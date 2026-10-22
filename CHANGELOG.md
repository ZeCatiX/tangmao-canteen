## [未发布]

### 定位与技术演进
- 项目定位：面向唐猫庭院餐饮店的菜品推荐系统（不再是通用食堂场景）
- 推荐模型：随机森林升级为 HistGradientBoosting 梯度提升（R² 持平，pkl 从 1.9GB 降至 <1MB），Node 端同模型 JSON 兜底

# 变更日志

## [1.2.0] - 2026-08-08

### 新增
- 缓存策略：静态资源添加 Cache-Control 头（HTML 10分钟，JS/CSS/字体/上传 7天）
- CI/CD 流水线：添加 GitHub Actions 工作流（lint → build → 测试 → security audit → 部署）
- 数据归档：自动清理 30 天前下架菜品和 90 天前旧推荐日志（每 24 小时）
- 幂等性保护：订单创建 10 秒内相同内容去重，防重复提交
- API 版本管理：`/api/v1/*` 自动映射到 `/api/*`，向后兼容
- 贡献指南：CONTRIBUTING.md（开发搭建/代码规范/PR 流程）

## [1.1.0] - 2026-08-08

### 新增
- 购物车跨标签页同步：添加 `storage` 事件监听，多标签页购物车数据自动同步
- 管理后台管理员角色校验：`adminAuth` 中间件新增 `role !== 'admin'` 403 拦截，防止普通用户越权

### 修复
- 修复 `migrate_to_pg.js` 全文件中文字符编码乱码问题（UTF-8 被错误解码为 GBK）
- 修复 `adminAuth` 缺少角色校验的安全漏洞：普通用户 token 现被正确拒绝（403）
- 修复错误信息泄露：所有 `catch` 块统一返回通用错误信息，不暴露 `e.message`

### 优化
- 页面加载性能：Chart.js 和 Bootstrap JS 从 `<head>` 移到 `<body>` 底部
- 字体加载：引入 Google Fonts（Noto Serif SC + Noto Sans SC），提升中文字体渲染
- 资源优化：切换 `bootstrap-icons.css` 为 `bootstrap-icons.min.css`（压缩版）
- 首页样式：去除特色卡片冗余渐变背景，简化 CSS

### 无障碍
- 厨房看板登录输入框新增 `aria-label` 属性
- 补充测试：`adminAuth` 角色校验测试套件

### 测试
- 新增 `admin_auth_test.js` 测试套件（3 个测试用例）
- 测试总数达到 280 个，全部通过

## [1.0.0] - 2026-07-25

### 初始版本
- 唐猫庭院推荐系统初始版本
- 基础功能：用户注册/登录、口味偏好设置、智能推荐、盲盒点单
- 管理后台：菜品 CRUD、图片上传、批量操作、数据导出
- 厨房看板：订单轮询、状态流转
- 机器学习：随机森林推荐模型、决策树降级、盲盒随机三级推荐链
- 部署：Docker Compose、PM2 进程管理