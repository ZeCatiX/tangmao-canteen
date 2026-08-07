const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

// 替换所有泄露 e.message 的 catch 块，改为通用错误消息
// 保留 logger.error 调用但移除客户端显示的 e.message
let count = 0;
content = content.replace(
  /catch\s*\(e\)\s*\{\s*(?:logger\.error\([^;]+;)?\s*res\.status\(500\)\.json\(\{ success: false, error:\s*e\.message\s*\}\);?\s*\}/g,
  (match) => {
    count++;
    // 保留 logger.error 如果有的话
    if (match.includes('logger.error')) {
      return match.replace(/res\.status\(500\)\.json\(\{ success: false, error: e\.message \}\)/, 
                         'res.status(500).json({ success: false, error: \'服务器内部错误\' })');
    } else {
      return 'catch (e) { logger.error(\'API错误:\', e.message); res.status(500).json({ success: false, error: \'服务器内部错误\' }); }';
    }
  }
);

fs.writeFileSync(serverPath, content, 'utf8');
console.log('已修复 ' + count + ' 处错误信息泄露');