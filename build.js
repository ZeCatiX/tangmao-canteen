// 唐猫庭院 - 构建脚本
// 合并 js/ 模块 → esbuild 压缩 → script.js
// 说明:四个文件共享顶层全局(内联 onclick 依赖),所以只压缩不打包;
// esbuild 不重命名顶层标识符,全局函数名原样保留。
// 历史上这里有手写的"重复函数声明去重"(括号匹配解析),已删除——
// 拼接后同名顶层函数按 JS 语义后者覆盖前者,与去重目的一致,交给语言本身。
const fs = require('fs');
const esbuild = require('esbuild');

const files = [
  'js/globals.js',
  'js/core.js',
  'js/recommendation.js',
  'js/init.js',
];

const parts = files.map(f => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch (e) {
    console.error(`✗ 读取文件失败: ${f} - ${e.message}`);
    process.exit(1);
  }
});
const combined = parts.join('\n');

esbuild.transform(combined, {
  minify: true,
  target: ['es2018'],
  legalComments: 'none',
  logLevel: 'warning',
}).then(r => {
  fs.writeFileSync('script.js', r.code);
  console.log(`✓ script.js 已生成 (${r.code.length} bytes, 源 ${combined.length} bytes, 压缩率 ${(r.code.length / combined.length * 100).toFixed(0)}%)`);
  // 验证语法
  try {
    require('child_process').execSync('node --check script.js', { stdio: 'pipe' });
    console.log('✓ 语法验证通过');
  } catch (e) {
    console.error('✗ 语法错误:', e.stderr.toString());
    process.exit(1);
  }
  if (r.warnings.length) {
    console.warn('⚠ esbuild 警告:');
    r.warnings.forEach(w => console.warn(' ', w.text));
  }
}).catch(e => {
  console.error('✗ esbuild 压缩失败:', e.message);
  process.exit(1);
});
