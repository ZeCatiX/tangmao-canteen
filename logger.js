// 唐猫庭院 - 日志模块（按天轮转，保留30天）
const winston = require('winston');
const path = require('path');
require('winston-daily-rotate-file');

const logDir = path.join(__dirname, 'logs');

// winston 把 logger.x('msg', a, b) 里第二个参数起的内容放进 info[Symbol.for('splat')]。
// 必须手动渲染出来 —— 否则 logger.error('API错误:', e.message) 这种写法会把 e.message
// 整个丢掉（历史上错误日志因此只留下一句空的"未捕获的异常:"，出事故时等于没日志）。
const SPLAT = Symbol.for('splat');
function fmtExtra(info) {
  const splat = info[SPLAT] || [];
  if (!splat.length) return '';
  const parts = splat.map(v => {
    if (v instanceof Error) return v.stack || v.message;
    if (v !== null && typeof v === 'object') {
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    }
    return String(v);
  });
  return ' ' + parts.join(' ');
}
const fmtFile = info =>
  `${info.timestamp} [${String(info.level).toUpperCase()}] ${info.message}${fmtExtra(info)}${info.stack ? '\n' + info.stack : ''}`;
const fmtConsole = info =>
  `${info.timestamp} ${info.level} ${info.message}${fmtExtra(info)}${info.stack ? '\n' + info.stack : ''}`;

// 按天轮转的 transport
const dailyRotate = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '30d',
  maxSize: '10m',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(fmtFile)
  ),
});

// 错误日志单独按天轮转
const errorRotate = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '30d',
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(fmtFile)
  ),
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(fmtFile)
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(fmtConsole)
      ),
    }),
    errorRotate,
    dailyRotate,
  ],
});

// 日志轮转事件监听
dailyRotate.on('rotate', (oldFilename, newFilename) => {
  logger.info(`日志轮转: ${oldFilename} → ${newFilename}`);
});

module.exports = logger;
