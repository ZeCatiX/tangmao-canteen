#!/bin/bash
# 唐猫庭院 - 一键部署脚本 (Linux/Mac)
# 用法: chmod +x deploy.sh && ./deploy.sh

echo "========================================"
echo "  唐猫庭院 - 一键部署"
echo "========================================"

echo "[1/4] 拉取最新代码..."
git pull || echo "[警告] git pull 失败，跳过此步骤"

echo "[2/4] 安装依赖..."
npm install || { echo "[错误] npm install 失败"; exit 1; }

echo "[3/4] 构建前端..."
node build.js || { echo "[错误] 构建失败"; exit 1; }

echo "[4/4] 重启服务..."
echo "正在停止旧服务..."
pkill -f "node server.js" 2>/dev/null || true
sleep 2
echo "正在启动新服务..."
nohup node server.js > /dev/null 2>&1 &
sleep 3

echo "========================================"
echo "  部署完成！"
echo "  服务已启动: http://localhost:3000"
echo "========================================"