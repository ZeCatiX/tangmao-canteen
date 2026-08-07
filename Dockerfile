FROM node:20-alpine

WORKDIR /app

# 安装 Python 和依赖（用于 ML 模型）
RUN apk add --no-cache python3 py3-pip py3-numpy py3-scikit-learn py3-pandas py3-psycopg2
RUN ln -sf python3 /usr/bin/python

# 安装 Node.js 依赖
COPY package.json package-lock.json ./
RUN npm install --production

# 复制应用代码
COPY . .

# 创建日志目录和备份目录，设置权限给 appuser
RUN mkdir -p logs model_backups && addgroup -S appgroup && adduser -S appuser -G appgroup && chown -R appuser:appgroup logs model_backups

# 切换为非 root 用户
USER appuser

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/worker-health || exit 1

# 启动命令
CMD ["node", "server.js"]