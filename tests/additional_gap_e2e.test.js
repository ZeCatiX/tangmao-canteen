// 唐猫庭院 - 补充缺口E2E测试
// 覆盖：点2盲盒按钮/点8用户profile/点110/点111/点117/点41/点51
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:3000';

function readFile(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

// 点2: 盲盒/换一批/选好了/退出按钮
describe('点2 盲盒/换一批/选好了/退出按钮', () => {
  it('推荐页面有"换一批"按钮', () => {
    const js = readFile('js/recommendation.js');
    assert.ok(js.includes('refresh-recommendations'), '缺少换一批按钮');
    assert.ok(js.includes('换一批'), '缺少换一批文字');
  });
  it('推荐页面有"选好了"按钮', () => {
    const js = readFile('js/recommendation.js');
    assert.ok(js.includes('end-recommendation'), '缺少选好了按钮');
    assert.ok(js.includes('选好了'), '缺少选好了文字');
  });
  it('推荐页面有"退出"按钮', () => {
    const js = readFile('js/recommendation.js');
    assert.ok(js.includes('end-logout-btn'), '缺少退出按钮');
    assert.ok(js.includes('退出'), '缺少退出文字');
  });
  it('换一批按钮调用 fetchRecommendations', () => {
    const js = readFile('js/recommendation.js');  // 2026-09-17: 按钮委托绑定已迁至 recommendation.js,且带参数
    assert.ok(js.includes("'refresh-recommendations':()=>fetchRecommendations("), '换一批按钮应绑定推荐刷新');
  });
  it('选好了按钮调用 endRecommendation', () => {
    const js = readFile('js/recommendation.js');
    assert.ok(js.includes("'end-recommendation':()=>endRecommendation("), '选好了按钮应绑定结束推荐');
  });
  it('退出按钮调用 resetRecommendation', () => {
    const js = readFile('js/recommendation.js');
    assert.ok(js.includes("'end-logout-btn':()=>{resetRecommendation();showSection('home-section')}") ||
              js.includes("'end-logout-btn':()=>{resetRecommendation()"), '退出按钮应绑定重置并返回首页');
  });
  it('盲盒推荐显示"盲盒尝鲜"标签', () => {
    const js = readFile('js/core.js');
    assert.ok(js.includes("type:'盲盒尝鲜'"), '盲盒应标记为盲盒尝鲜');
  });
  it('盲盒推荐不在已推荐列表', () => {
    const js = readFile('js/core.js');
    assert.ok(js.includes('recommendedIds.includes(d.id)'), '盲盒排除已推荐菜品');
  });
});

// 点8: 用户profile
describe('点8 用户profile', () => {
  it('profile-section存在', () => {
    const html = readFile('index.html');
    assert.ok(html.includes('profile-section'), '用户profile section应存在');
  });
  it('收藏列表UI存在', () => {
    const html = readFile('index.html');
    assert.ok(html.includes('favorite-list') || html.includes('收藏'), '收藏列表UI应存在');
  });
  it('黑名单列表UI存在', () => {
    const html = readFile('index.html');
    assert.ok(html.includes('blacklist-list') || html.includes('黑名单'), '黑名单列表UI应存在');
  });
  it('删除账户按钮存在', () => {
    const html = readFile('index.html');
    assert.ok(html.includes('delete-account'), '删除账户按钮应存在');
  });
  it('showProfile函数存在', () => {
    const js = readFile('js/core.js');
    assert.ok(js.includes('function showProfile'), 'showProfile函数应存在');
  });
  it('注销功能存在', () => {
    const js = readFile('js/core.js');
    assert.ok(js.includes('function logout') || js.includes('function deleteAccount'), '注销/删除账户功能应存在');
  });
});

// 点110: 浏览器title动态更新
describe('点110 浏览器title动态更新', () => {
  it('showSection 更新 document.title', () => {
    const js = readFile('js/core.js');
    assert.ok(js.includes('document.title'), 'showSection 应更新 document.title');
    assert.ok(js.includes('titleMap'), '应有标题映射表');
  });
});

// 点111: 打印样式
describe('点111 打印样式', () => {
  it('CSS含有@media print打印样式', () => {
    const css = readFile('styles.css');
    assert.ok(css.includes('@media print'), 'CSS 应包含打印样式');
    assert.ok(css.includes('display: none'), '打印时应隐藏导航/按钮');
  });
});

// 点117: fix_error_leak修复检查
describe('点117 fix_error_leak修复检查', () => {
  it('server.js catch块不泄露e.message给客户端', () => {
    const server = readFile('server.js');
    // 查找所有 catch 块中直接返回 e.message 的模式
    const leakPattern = /catch\s*\(e\)[\s\S]*?res\.status\(\d+\)\.json\(\{[\s\S]*?error:\s*e\.message\s*\}/g;
    const matches = server.match(leakPattern);
    assert.ok(!matches || matches.length === 0, '不应有泄露e.message的catch块，发现：' + (matches ? matches.length : 0));
  });
  it('server.js catch块统一使用服务器内部错误', () => {
    const server = readFile('server.js');
    const safePattern = /catch\s*\(e\)[\s\S]*?res\.status\(\d+\)\.json\(\{[\s\S]*?error:\s*'服务器内部错误'\s*\}/g;
    const matches = server.match(safePattern);
    assert.ok(matches && matches.length >= 20, '应有至少20处安全catch块，实际：' + (matches ? matches.length : 0));
  });
});

// 点41: 暗黑模式
describe('点41 暗黑模式', () => {
  it('CSS支持暗黑模式（prefers-color-scheme）', () => {
    const css = readFile('styles.css');
    // 2026-09-17: 深色模式改为 class 架构(index.html 内联脚本检测系统偏好并切换 html.dark-mode)
    assert.ok(css.includes('html.dark-mode'), 'CSS 应包含暗黑模式支持(html.dark-mode)');
    assert.ok(css.includes('background-color: #0f0f0f'), '暗黑模式应有深色背景');
  });
});

// 点51: CSRF防护
describe('点51 CSRF防护', () => {
  it('状态变更请求使用Bearer认证头', () => {
    const js = readFile('js/globals.js');
    assert.ok(js.includes('authHeaders') || js.includes("'Authorization'"), '使用authHeaders获取认证头');
  });
  it('管理后台API使用token认证', () => {
    const server = readFile('server.js');
    assert.ok(server.includes('adminAuth'), '管理后台API使用adminAuth中间件');
  });
});

// 点119: JWT黑名单机制
describe('点119 JWT黑名单机制', () => {
  it('auth.js 包含 revokeToken 函数', () => {
    const auth = readFile('auth.js');
    assert.ok(auth.includes('revokeToken'), 'auth.js 应有 revokeToken 函数');
    assert.ok(auth.includes('isTokenBlacklisted'), 'auth.js 应有 isTokenBlacklisted 函数');
  });
  it('auth.js 生成 token 含 jti', () => {
    const auth = readFile('auth.js');
    assert.ok(auth.includes('jti'), 'auth.js 生成 token 应含 jti');
  });
  it('authMiddleware 同步检查黑名单', () => {
    const auth = readFile('auth.js');
    assert.ok(auth.includes('await isTokenBlacklisted'), 'authMiddleware 应 await 同步检查黑名单');
    assert.ok(auth.includes('blacklisted'), 'authMiddleware 应检查 blacklisted 状态');
  });
  it('server.js 有 /api/user/logout 端点', () => {
    const server = readFile('server.js');
    assert.ok(server.includes('/api/user/logout'), 'server.js 应有 /api/user/logout 端点');
    assert.ok(server.includes('revokeToken'), 'logout 端点应调用 revokeToken');
  });
  it('前端 logout 调用 /api/user/logout', () => {
    const js = readFile('js/core.js');
    assert.ok(js.includes('/api/user/logout'), '前端 logout 应调用 /api/user/logout');
  });
  it('sample_data.sql 包含 token_blacklist 表', () => {
    const sql = readFile('sample_data.sql');
    assert.ok(sql.includes('token_blacklist'), '示例数据应包含 token_blacklist 表');
  });
  it('server.js 启动时幂等创建 token_blacklist 表', () => {
    const server = readFile('server.js');
    assert.ok(server.includes('token_blacklist'), 'server.js 启动时应创建 token_blacklist 表');
    assert.ok(server.includes('CREATE TABLE IF NOT EXISTS'), '应使用幂等创建');
  });
});

// 点106: 测试可重复运行
describe('点106 测试数据清理', () => {
  it('api.test.js有after清理钩子', () => {
    const test = readFile('tests/api.test.js');
    assert.ok(test.includes('after(async') || test.includes('after('), '应有after清理钩子');
  });
  it('测试数据清理删除测试用户', () => {
    const test = readFile('tests/api.test.js');
    assert.ok(test.includes('清理') || test.includes('delete'), '应有数据清理逻辑');
  });
});