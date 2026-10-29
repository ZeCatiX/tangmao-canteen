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
  'js/menu.js', // 菜单渲染域(2026-10-19 自 core.js 拆出)
  'js/cart.js', // 购物车与结算域(2026-10-19 自 core.js 拆出)
  'js/core.js',
  'js/recommendation.js',
  'js/logo-intro.js',
  'js/init.js',
];

const parts = files.map((f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch (e) {
    console.error(`✗ 读取文件失败: ${f} - ${e.message}`);
    process.exit(1);
  }
});
const combined = parts.join('\n');

esbuild
  .transform(combined, {
    minify: true,
    target: ['es2018'],
    legalComments: 'none',
    logLevel: 'warning',
  })
  .then((r) => {
    fs.writeFileSync('script.js', r.code);
    console.log(
      `✓ script.js 已生成 (${r.code.length} bytes, 源 ${combined.length} bytes, 压缩率 ${((r.code.length / combined.length) * 100).toFixed(0)}%)`
    );
    // 验证语法
    try {
      require('child_process').execSync('node --check script.js', { stdio: 'pipe' });
      console.log('✓ 语法验证通过');
    } catch (e) {
      console.error('✗ 语法错误:', e.stderr.toString());
      process.exit(1);
    }
    // 自动升级 index.html 的 script.js 版本号(2026-10-28: 版本号纪律自动化——
    // 两次因忘升级导致用户浏览器拿旧缓存,其中一次造成演示事故)
    let html = fs.readFileSync('index.html', 'utf8');
    const stamp =
      new Date().toISOString().slice(0, 10).replace(/-/g, '') +
      Math.floor(Date.now() / 1000).toString(36).slice(-2);
    const updated = html.replace(/script\.js\?v=[0-9a-z]+/, 'script.js?v=' + stamp);
    if (updated !== html) {
      fs.writeFileSync('index.html', updated);
      console.log('✓ index.html 版本号已自动升级: ' + stamp);
    } else {
      console.warn('⚠ 未找到 script.js 版本号引用,请检查 index.html');
    }
    if (r.warnings.length) {
      console.warn('⚠ esbuild 警告:');
      r.warnings.forEach((w) => console.warn(' ', w.text));
    }
  })
  .catch((e) => {
    console.error('✗ esbuild 压缩失败:', e.message);
    process.exit(1);
  });
