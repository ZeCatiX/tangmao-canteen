// 唐猫庭院 - PM2 进程管理配置
module.exports = {
  apps: [{
    name: 'tangmao',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    // 自动重启
    watch: false,
    max_memory_restart: '500M',
    restart_delay: 3000,
    max_restarts: 10,
    // 日志
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    // 优雅关闭
    kill_timeout: 5000,
    listen_timeout: 8000,
  }],
};