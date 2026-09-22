// 唐猫庭院 - PM2 进程管理配置
module.exports = {
  apps: [{
    name: 'tangmao',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    env: {
      // 注意：本机/开发机保持 development（宽松限流供测试）。
      // 真实部署时改 'production'，且必须先按 .env.production.example
      // 配好 ★ 密钥与生产限流值——server.js 会校验，不合规直接拒绝启动。
      NODE_ENV: 'development',
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