// ESLint 扁平配置(ESLint 9+/10 要求,2026-10-22 从 .eslintrc.json 迁移——CI 首次运行暴露 lint 脚本已坏)
const globals = require('globals');

const sharedRules = {
  // catch(e) 的 e 未使用是刻意吞异常的惯用法,不计(2026-10-22 警告清零配套)
  'no-unused-vars': ['warn', { caughtErrors: 'none', varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
  'no-console': 'off',
  // 空 catch 是刻意的静默降级,允许
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-extra-semi': 'warn',
  'no-redeclare': 'error',
  'no-var': 'warn',
  'prefer-const': 'warn',
  eqeqeq: ['warn', 'smart'],
  curly: 'warn',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
};

module.exports = [
  { ignores: ['node_modules/', 'dist/', '**/*.min.js', '唐猫菜品/', 'script.js'] },
  {
    // 服务端/构建/测试脚本: 模块化文件,no-undef 有真实价值
    files: ['server.js', 'server/**/*.js', 'db.js', 'auth.js', 'build.js', 'scripts/**/*.js', 'tests/**/*.js', '*.js'],
    ignores: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      // tests 里混有 puppeteer/eval 前端的测试(document/window/showToast 等),与 node 全局合并声明
      globals: { ...globals.node, ...globals.browser },
    },
    // no-undef 降 warn: 58 个测试文件里有相当一部分以 node eval 方式引用前端全局,
    // 严格模式必然误报;测试中拼错标识符运行时也会立即失败,不依赖静态拦截
    rules: { ...sharedRules, 'no-undef': 'warn' },
  },
  {
    // 前端浏览器脚本: 多个 <script> 标签共享全局作用域(js/core.js 的函数被 js/init.js 直接调用),
    // 跨文件引用在单文件 lint 下必然 no-undef,降为 warn(2026-10-22)
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        bootstrap: 'writable',
        Chart: 'writable',
      },
    },
    rules: { ...sharedRules, 'no-undef': 'warn' },
  },
];
