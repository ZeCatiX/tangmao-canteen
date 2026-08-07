@echo off
chcp 65001 >nul
title 唐猫庭院 - 一键安装

echo ═══════════════════════════════════════════
echo   唐猫庭院 - 一键安装脚本
echo   自动检测环境、安装依赖、初始化数据库
echo ═══════════════════════════════════════════
echo.

REM 检查 Node.js
echo [1/5] 检测 Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js，请先安装 https://nodejs.org/
    pause
    exit /b 1
)
node -v

REM 检查 Python
echo [2/5] 检测 Python...
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [警告] 未检测到 Python，推荐功能将不可用，但不影响核心功能
) else (
    python --version
)

REM 安装依赖
echo [3/5] 安装 Node.js 依赖...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)
echo 依赖安装完成

REM 检查 .env 配置
echo [4/5] 检查环境配置...
if not exist .env (
    echo 未检测到 .env 文件，正在从 .env.example 创建...
    copy .env.example .env
    echo 请修改 .env 中的数据库密码等配置后重新运行
    notepad .env
    pause
    exit /b 1
)

REM 构建前端
echo [5/5] 构建前端...
call node build.js
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 构建失败
    pause
    exit /b 1
)

echo.
echo ═══════════════════════════════════════════
echo   安装完成！
echo   运行 start.bat 启动服务器
echo   启动后访问 http://localhost:3000
echo ═══════════════════════════════════════════
pause