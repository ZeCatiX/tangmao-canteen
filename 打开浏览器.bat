@echo off
echo 正在打开食堂网页...
start http://localhost:3000/
timeout /t 2 >nul
start http://localhost:3000/admin
timeout /t 2 >nul
start http://localhost:3000/kitchen
echo 已打开首页、管理后台、厨房看板
pause