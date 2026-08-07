@echo off
REM 唐猫庭院 - 一键部署脚本 (Windows)
REM 用法: deploy.bat

echo ========================================
echo  唐猫庭院 - 一键部署
echo ========================================

echo [1/4] 拉取最新代码...
git pull
if %ERRORLEVEL% NEQ 0 (
    echo [警告] git pull 失败，跳过此步骤
)

echo [2/4] 安装依赖...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [错误] npm install 失败
    pause
    exit /b 1
)

echo [3/4] 构建前端（合并模块）...
call node build.js
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 构建失败
    pause
    exit /b 1
)

echo [4/4] 重启服务...
echo 正在停止旧服务...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
echo 正在启动新服务...
start /B "" node server.js
timeout /t 3 /nobreak >nul

echo ========================================
echo  部署完成！
echo  服务已启动: http://localhost:3000
echo ========================================
pause