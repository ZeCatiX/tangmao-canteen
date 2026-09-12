@echo off
schtasks /create /tn "TangMaoBackup" /tr "node.exe D:\食堂网页\backup_db.js" /sc daily /st 02:00 /f
echo 备份任务创建完成！
