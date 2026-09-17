// 唐猫庭院 - 深度全面审计 E2E 测试 v4.0
// 覆盖：按钮可用性、函数完整性、API端点、崩溃风险、边界情况、空态/加载态/错误态
const { test, describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const ROOT = path.join(__dirname, '..');

function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

function extractButtonIds(html) {
  const ids = [];
  const regex = /<button[^>]*\sid="([^"]+)"[^>]*>/g;
  let m;
  while ((m = regex.exec(html)) !== null) ids.push(m[1]);
  return ids;
}

function extractElementIds(html) {
  const ids = [];
  const regex = /id="([^"]+)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) ids.push(m[1]);
  return ids;
}

// ================================================================
// 1. 全面按钮可用性审计
// ================================================================
describe('1. 全面按钮可用性审计', () => {
  it('首页所有按钮ID存在且在init.js中绑定', () => {
    const html = read('index.html');
    const buttons = extractButtonIds(html);
    const init = read('js/init.js');
    const required = ['guest-btn', 'login-btn', 'register-btn',
      'back-to-home', 'back-to-home-from-register', 'back-from-about',
      'back-from-dataset', 'back-from-privacy', 'view-profile-btn',
      'logout-btn', 'cancel-favorite-btn', 'cancel-blacklist-btn',
      'delete-account-btn', 'back-to-preference', 'new-recommendation',
      'end-logout', 'back-to-recommendations', 'star-submit-btn',
      'cart-close-btn', 'cart-clear-btn', 'cart-checkout-btn',
      'end-sat-submit', 'menu-reset-filter', 'modal-close-btn', 'modal-confirm-btn'];
    required.forEach(id => {
      assert.ok(buttons.includes(id), `首页缺少按钮: ${id}`);
      const bindingPattern = `'${id}'`;
      assert.ok(init.includes(bindingPattern) || init.includes(id),
        `init.js中缺少 ${id} 的事件绑定`);
    });
  });

  it('首页所有section容器存在', () => {
    const html = read('index.html');
    const ids = extractElementIds(html);
    const sections = ['home-section', 'login-section', 'register-section',
      'preference-section', 'profile-section', 'recommendation-section',
      'feedback-section', 'cart-section', 'end-section', 'about-section',
      'dataset-section', 'privacy-section'];
    sections.forEach(id => {
      assert.ok(ids.includes(id), `缺少section: ${id}`);
    });
  });

  it('首页所有导航链接在init.js中有绑定', () => {
    const init = read('js/init.js');
    const navs = ['nav-home', 'nav-about', 'nav-dataset', 'nav-privacy',
      'nav-user', 'nav-profile', 'nav-cart'];
    navs.forEach(id => {
      assert.ok(init.includes(`'${id}'`), `init.js中缺少导航 ${id} 绑定`);
    });
  });

  it('首页表单提交有事件绑定', () => {
    const init = read('js/init.js');
    assert.ok(init.includes("submit('login-form',login)"), 'login-form 缺少提交绑定');
    assert.ok(init.includes("submit('register-form',register)"), 'register-form 缺少提交绑定');
    assert.ok(init.includes("submit('preference-form',submitPreference)"), 'preference-form 缺少提交绑定');
  });

  it('首页星级评分有事件绑定', () => {
    const init = read('js/init.js');
    assert.ok(init.includes('star-rating'), '星级评分容器存在');
    assert.ok(init.includes('star-submit-btn'), '评分提交按钮存在');
    assert.ok(init.includes('submitStarFeedback'), '评分提交函数绑定存在');
  });

  it('首页完成满意度评分有事件绑定', () => {
    const init = read('js/init.js');
    assert.ok(init.includes('end-satisfaction'), '满意度评分容器存在');
    assert.ok(init.includes('end-sat-submit'), '满意度提交按钮存在');
  });

  it('首页购物车事件委托绑定完整', () => {
    const init = read('js/init.js');
    assert.ok(init.includes('cart-qty-plus'), '购物车数量增加');
    assert.ok(init.includes('cart-qty-minus'), '购物车数量减少');
    assert.ok(init.includes('cart-remove-btn'), '购物车删除');
    assert.ok(init.includes('add-to-cart-btn'), '加购按钮');
    assert.ok(init.includes('cart-qty-input'), '购物车数量输入变更');
  });

  it('首页触控滑动支持完整', () => {
    const init = read('js/init.js');
    assert.ok(init.includes('touchstart'), '触控开始');
    assert.ok(init.includes('touchmove'), '触控移动');
    assert.ok(init.includes('touchend'), '触控结束');
    assert.ok(init.includes('touchcancel'), '触控取消');
  });

  it('首页浏览器前进后退导航支持', () => {
    const init = read('js/init.js');
    assert.ok(init.includes('popstate'), 'popstate事件监听');
  });

  it('首页缓存推荐结果查看功能', () => {
    const init = read('js/init.js');
    assert.ok(init.includes('view-cached-btn'), '查看缓存推荐按钮');
    assert.ok(init.includes('cachedRecommendations'), '缓存推荐结果读取');
  });

  it('首页多标签同步购物车', () => {
    const init = read('js/init.js');
    assert.ok(init.includes("e.key==='cart'"), '购物车变化监听');
  });

  it('厨房看板所有功能函数存在', () => {
    const html = read('kitchen.html');
    const ids = extractElementIds(html);
    assert.ok(ids.includes('login-btn'), '登录按钮');
    assert.ok(ids.includes('login-user'), '用户名输入框');
    assert.ok(ids.includes('login-pass'), '密码输入框');
    assert.ok(ids.includes('login-error'), '错误提示');
    assert.ok(ids.includes('login-overlay'), '登录覆盖层');
    assert.ok(ids.includes('order-list'), '订单列表');
    assert.ok(ids.includes('current-time'), '当前时间');
    assert.ok(html.includes('function doLogin'), 'doLogin函数');
    assert.ok(html.includes('function loadOrders'), 'loadOrders函数');
    assert.ok(html.includes('function completeOrder'), 'completeOrder函数');
    assert.ok(html.includes('function updateTime'), 'updateTime函数');
    assert.ok(html.includes('function esc'), 'esc函数');
    assert.ok(html.includes('function getToken'), 'getToken函数');
    assert.ok(html.includes('function getAuthHeaders'), 'getAuthHeaders函数');
  });

  it('厨房看板登录输入框有aria-label', () => {
    const html = read('kitchen.html');
    assert.ok(html.includes('aria-label="管理员账号"'), '管理员账号应有aria-label');
    assert.ok(html.includes('aria-label="管理员密码"'), '管理员密码应有aria-label');
  });

  it('厨房看板有自动刷新和完成按钮', () => {
    const html = read('kitchen.html');
    assert.ok(html.includes('btn-complete'), '完成按钮');
    assert.ok(html.includes('自动刷新'), '自动刷新提示');
    assert.ok(html.includes('10000'), '10秒刷新间隔');
  });

  it('管理后台所有按钮存在', () => {
    const html = read('admin.html');
    const buttons = extractButtonIds(html);
    const required = ['admin-login-btn', 'add-dish-btn', 'retrain-btn', 'save-dish-btn', 'dish-image-upload'];
    required.forEach(id => {
      assert.ok(buttons.includes(id), `管理后台缺少按钮: ${id}`);
    });
    // 验证输入框元素存在
    const elementIds = extractElementIds(html);
    assert.ok(elementIds.includes('admin-login-user'), '管理后台缺少用户名输入框');
    assert.ok(elementIds.includes('admin-login-pass'), '管理后台缺少密码输入框');
  });

  it('管理后台所有页面面板存在', () => {
    const html = read('admin.html');
    const pages = ['page-dashboard', 'page-dishes', 'page-feedback',
      'page-preferences', 'page-analytics', 'page-model', 'page-apidocs', 'page-users'];
    pages.forEach(p => {
      assert.ok(html.includes(`id="${p}"`), `管理后台缺少页面: ${p}`);
    });
  });

  it('管理后台所有侧边栏导航存在', () => {
    const html = read('admin.html');
    const pages = ['dashboard', 'dishes', 'users', 'feedback', 'preferences', 'analytics', 'model', 'apidocs'];
    pages.forEach(p => {
      assert.ok(html.includes(`data-page="${p}"`), `管理后台侧边栏缺少 ${p} 导航`);
    });
  });

  it('管理后台所有功能函数存在', () => {
    const html = read('admin.html');
    const funcs = ['loadStats', 'loadPopularDishes', 'loadFeedback', 'loadDishes',
      'editDish', 'saveDish', 'deleteDish', 'loadNotifications', 'loadUsers',
      'deleteUser', 'exportCSV', 'showToast', 'loadDailyTrend', 'loadAnalyticsPrefs',
      'loadUserActivity', 'loadRecommendationLog', 'loadModelManagement',
      'loadRecommendationStats', 'loadWorstDishes', 'loadMonitor', 'loadModelCompare',
      'loadPreferenceStats', 'loadModelInfo', 'showAdmin',
      'renderRatingChart'];
    funcs.forEach(fn => {
      assert.ok(html.includes('function ' + fn), `管理后台缺少函数: ${fn}`);
    });
  });

  it('管理后台登录后调用所有数据加载函数', () => {
    const html = read('admin.html');
    const idx1 = html.indexOf('loadStats(); loadPopularDishes');
    const idx2 = html.indexOf('loadStats(); loadPopularDishes', idx1 + 1);
    // 找到第二次出现（登录成功后的调用）
    const block = html.substring(idx2, idx2 + 200);
    assert.ok(block.includes('loadStats'), '登录后调用loadStats');
    assert.ok(block.includes('loadPopularDishes'), '登录后调用loadPopularDishes');
    assert.ok(block.includes('loadFeedback'), '登录后调用loadFeedback');
    assert.ok(block.includes('loadDishes'), '登录后调用loadDishes');
    assert.ok(block.includes('loadPreferenceStats'), '登录后调用loadPreferenceStats');
    assert.ok(block.includes('loadModelInfo'), '登录后调用loadModelInfo');
    assert.ok(block.includes('loadMonitor'), '登录后调用loadMonitor');
    assert.ok(block.includes('loadNotifications'), '登录后调用loadNotifications');
  });

  it('管理后台该函数有正确的事件绑定', () => {
    const html = read('admin.html');
    assert.ok(html.includes('addEventListener'), '应有事件绑定');
    assert.ok(html.includes('retrain-btn'), '重训练按钮');
    assert.ok(html.includes('retrain'), '重训练函数');
  });

  it('管理后台重新训练按钮状态显示正确', () => {
    const html = read('admin.html');
    // 修复前：点击按钮立即显示"训练完成"（错误）
    // 修复后：先显示"训练中..."，成功后显示"训练完成"
    const retrainBlock = html.substring(
      html.indexOf("document.getElementById('retrain-btn')"),
      html.indexOf("document.getElementById('retrain-btn')") + 1200
    );
    assert.ok(retrainBlock.includes("'训练中...'"), '重训练按钮应先显示"训练中..."');
    // 2026-09-17: 后端改异步立即返回,成功后显示响应 message 或'重训练已开始,将在后台进行'
    assert.ok(retrainBlock.includes('重训练已开始') || retrainBlock.includes('d.message'), '重训练成功后显示开始提示');
    assert.ok(retrainBlock.includes('训练失败，请重试') || retrainBlock.includes('训练失败，网络错误'), '重训练失败后显示失败提示');
    assert.ok(retrainBlock.includes('btn.disabled = true') || retrainBlock.includes('btn.disabled = false'), '重训练过程会切换按钮禁用态');
  });

  it('管理后台添加菜品按钮正确重置所有表单字段', () => {
    const html = read('admin.html');
    const addBtnBlock = html.substring(
      html.indexOf("document.getElementById('add-dish-btn')"),
      html.indexOf("document.getElementById('add-dish-btn')") + 3000
    );
    assert.ok(addBtnBlock.includes("dish-name').value = ''"), '重置菜名');
    assert.ok(addBtnBlock.includes("dish-saltiness').value = '适中'"), '重置咸淡');
    assert.ok(addBtnBlock.includes("dish-sweetness').value = '无味'"), '重置甜酸');
    assert.ok(addBtnBlock.includes("dish-description').value = ''"), '重置描述');
    assert.ok(addBtnBlock.includes("dish-active').checked = true"), '重置上架状态');
    assert.ok(addBtnBlock.includes("dish-halal').checked = false"), '重置清真');
    assert.ok(addBtnBlock.includes("dish-vegetarian').checked = false"), '重置素食');
    assert.ok(addBtnBlock.includes("dish-allergy-seafood').checked = false"), '重置海鲜过敏');
    assert.ok(addBtnBlock.includes("preview) { preview.style.display = 'none'"), '重置图片预览');
  });

  it('管理后台添加菜品按钮使用null保护访问DOM', () => {
    const html = read('admin.html');
    const addBtnBlock = html.substring(
      html.indexOf("document.getElementById('add-dish-btn')"),
      html.indexOf("document.getElementById('add-dish-btn')") + 1600
    );
    assert.ok(addBtnBlock.includes('const preview = document.getElementById'), '图片预览使用const变量');
    assert.ok(addBtnBlock.includes('if (preview)'), '图片预览有null保护');
    assert.ok(addBtnBlock.includes('const fileInput = document.getElementById'), '文件输入使用const变量');
    assert.ok(addBtnBlock.includes('if (fileInput)'), '文件输入有null保护');
  });

  it('管理后台所有数据加载函数有catch处理', () => {
    const html = read('admin.html');
    const loadFuncs = ['loadStats', 'loadPopularDishes', 'loadFeedback',
      'loadDishes', 'loadPreferenceStats', 'loadModelInfo', 'loadMonitor',
      'loadNotifications', 'loadUsers', 'loadDailyTrend', 'loadAnalyticsPrefs',
      'loadUserActivity', 'loadRecommendationLog', 'loadModelManagement',
      'loadRecommendationStats', 'loadWorstDishes', 'loadModelCompare'];
    loadFuncs.forEach(fn => {
      const funcStart = html.indexOf('function ' + fn);
      const funcEnd = html.indexOf('function ', funcStart + 1);
      const funcBody = funcEnd > 0 ? html.substring(funcStart, funcEnd) : html.substring(funcStart);
      // 每个函数应该有catch处理
      const hasCatch = funcBody.includes('.catch(');
      assert.ok(hasCatch, fn + ' 缺少 .catch() 处理');
    });
  });
});

// ================================================================
// 2. 崩溃风险与边界情况审计
// ================================================================
describe('2. 崩溃风险与边界情况审计', () => {
  it('index.html中所有onclick调用的函数在script.js中存在', () => {
    const html = read('index.html');
    // 2026-09-17: toggleDarkMode 等定义于 index.html 内联脚本,一并在源中检查
    const js = read('script.js') + read('index.html');
    const onclickMatches = html.match(/onclick="([^"]+)"/g) || [];
    onclickMatches.forEach(oc => {
      const funcMatch = oc.match(/onclick="(\w+)/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        // 2026-09-17: 跳过 JS 内建/上下文对象(onclick="event.stopPropagation();..." 会被正则误捕)
        if (['event', 'this', 'window', 'document'].includes(funcName)) return;
        assert.ok(js.includes('function ' + funcName) || js.includes(funcName + '('),
          'index.html调用的函数 ' + funcName + ' 不存在');
      }
    });
  });

  it('核心函数有null保护', () => {
    const core = read('js/core.js');
    assert.ok(core.includes('if(!mt||!mb)'), 'showMessage 应有 null 保护');
    assert.ok(core.includes('if(!el)'), 'showSection 应有 null 保护');
    assert.ok(core.includes('if(!container)return'), 'renderMenuTable 应有 null 保护');
    assert.ok(core.includes('if(!uEl||!pEl)'), 'login 应有 null 保护');
    assert.ok(core.includes('if(!uEl||!pEl||!cEl)'), 'register 应有 null 保护');
  });

  it('admin.html 关键函数有null保护', () => {
    const html = read('admin.html');
    assert.ok(html.includes('if (!ctx) return'), 'renderRatingChart 应有 null 保护');
    assert.ok(html.includes('dailyActive.length) return'), 'loadUserActivity 应有 null 保护');
  });

  it('admin.html fetch链有catch处理', () => {
    const html = read('admin.html');
    const fetchCalls = (html.match(/\.fetch\(/g) || []).length;
    const catchCount = (html.match(/\.catch\(/g) || []).length;
    const finallyCount = (html.match(/\.finally\(/g) || []).length;
    const totalHandlers = catchCount + finallyCount;
    assert.ok(totalHandlers >= fetchCalls * 0.5,
      'fetch链应有至少50%终止处理，当前' + totalHandlers + '/' + fetchCalls);
  });

  it('admin.html 登录按钮有disabled状态管理', () => {
    const html = read('admin.html');
    assert.ok(html.includes('btn.disabled = true'), '登录按钮应有disabled状态');
    assert.ok(html.includes('btn.disabled = false'), '登录按钮应有恢复状态');
  });

  it('admin.html 401自动登出机制', () => {
    const html = read('admin.html');
    assert.ok(html.includes('resp.status === 401'), '管理后台应有401自动登出');
    assert.ok(html.includes("localStorage.removeItem('adminToken')"), '401时应清除adminToken');
    assert.ok(html.includes('showAdmin(false)'), '401时应隐藏管理界面');
  });

  it('admin.html fetch拦截器自动注入token', () => {
    const html = read('admin.html');
    assert.ok(html.includes("Authorization'] = 'Bearer '"), '管理后台自动注入Authorization头');
    assert.ok(html.includes('adminToken'), '管理后台使用adminToken');
  });

  it('admin.html toast通知容器和动画存在', () => {
    const html = read('admin.html');
    assert.ok(html.includes('admin-toast-container'), '应有toast容器');
    assert.ok(html.includes('@keyframes fadeIn'), '应有淡入动画');
  });

  it('admin.html 模态框焦点管理完整', () => {
    const html = read('admin.html');
    assert.ok(html.includes('show.bs.modal'), '模态框打开事件');
    assert.ok(html.includes('hide.bs.modal'), '模态框关闭事件');
    assert.ok(html.includes('_lastTrigger'), '焦点归还机制');
  });

  it('server.js 有全局错误处理', () => {
    const server = read('server.js');
    assert.ok(server.includes("process.on('unhandledRejection'"), '未捕获Promise拒绝处理');
    assert.ok(server.includes("process.on('uncaughtException'"), '未捕获异常处理');
    assert.ok(server.includes('SIGTERM'), 'SIGTERM处理');
    assert.ok(server.includes('SIGINT'), 'SIGINT处理');
    assert.ok(server.includes('gracefulShutdown'), '优雅关闭函数');
  });

  it('server.js 有请求体大小限制和JSON解析错误处理', () => {
    const server = read('server.js');
    assert.ok(server.includes("limit: '1mb'"), '请求体大小限制1MB');
    assert.ok(server.includes('entity.parse.failed'), 'JSON解析错误处理');
    assert.ok(server.includes('entity.too.large'), '请求体过大处理');
  });

  it('server.js 404/500友好页面', () => {
    const server = read('server.js');
    assert.ok(server.includes('res.status(404)'), '404处理');
    assert.ok(server.includes('res.status(500)'), '500处理');
    assert.ok(server.includes('404 - 页面未找到'), '404友好页面');
    assert.ok(server.includes('服务器出了点小问题'), '500友好页面');
  });

  it('server.js 有静态文件保护', () => {
    const server = read('server.js');
    assert.ok(server.includes('BLOCKED_STATIC_PATHS'), '敏感文件路径黑名单');
    assert.ok(server.includes('ALLOWED_STATIC_EXTS'), '允许的文件扩展名白名单');
    assert.ok(server.includes('403'), '禁止访问返回403');
  });

  it('server.js 限流配置完整', () => {
    const server = read('server.js');
    assert.ok(server.includes('RATE_LIMIT_WINDOW_MS'), '通用限流');
    assert.ok(server.includes('LOGIN_RATE_LIMIT_MAX'), '登录限流');
    assert.ok(server.includes('registerLimiter'), '注册限流');
    assert.ok(server.includes('adminLoginLimiter'), '管理员登录限流');
    assert.ok(server.includes('healthLimiter'), '健康检查限流');
  });
});

// ================================================================
// 3. 显示排版与字符编码审计
// ================================================================
describe('3. 显示排版与字符编码审计', () => {
  it('所有页面UTF-8编码声明正确', () => {
    ['index.html', 'admin.html', 'kitchen.html'].forEach(f => {
      assert.ok(read(f).includes('charset="UTF-8"'), f + ' 应有UTF-8编码声明');
    });
  });

  it('所有页面viewport meta存在', () => {
    ['index.html', 'admin.html', 'kitchen.html'].forEach(f => {
      assert.ok(read(f).includes('name="viewport"'), f + ' 应有viewport meta');
    });
  });

  it('所有页面description meta存在', () => {
    ['index.html', 'admin.html', 'kitchen.html'].forEach(f => {
      assert.ok(read(f).includes('name="description"'), f + ' 应有description meta');
    });
  });

  it('所有页面标题完整', () => {
    assert.ok(read('index.html').includes('唐猫庭院'), '首页标题应有唐猫庭院');
    assert.ok(read('admin.html').includes('管理后台'), '管理后台标题应有管理后台');
    assert.ok(read('kitchen.html').includes('厨房看板'), '厨房看板标题应有厨房看板');
  });

  it('首页标题层级完整', () => {
    const html = read('index.html');
    ['<h1', '<h2', '<h3', '<h4', '<h5', '<h6'].forEach(t => {
      assert.ok(html.includes(t), '首页缺少 ' + t);
    });
  });

  it('首页有footer且内容完整', () => {
    const html = read('index.html');
    assert.ok(html.includes('<footer'), '首页应有footer');
    assert.ok(html.includes('</footer>'), 'footer应正确闭合');
    assert.ok(html.includes('大雁塔南广场'), 'footer应有地址(大唐不夜城店)');
  });

  it('首页导航栏完整', () => {
    const html = read('index.html');
    ['首页', '关于本店', '全部菜单', '隐私政策', '登录', '购物车'].forEach(item => {
      assert.ok(html.includes(item), '导航栏应有 ' + item);
    });
  });

  it('首页三大特色卡片存在', () => {
    const html = read('index.html');
    assert.ok(html.includes('唐风雅韵'), '特色卡片1');
    assert.ok(html.includes('猫趣盎然'), '特色卡片2');
    assert.ok(html.includes('珍馐美馔'), '特色卡片3');
  });

  it('首页全部菜单筛选功能完整', () => {
    const html = read('index.html');
    assert.ok(html.includes('全部分类'), '分类筛选');
    assert.ok(html.includes('全部辣度'), '辣度筛选');
    assert.ok(html.includes('全部价格'), '价格筛选');
    assert.ok(html.includes('默认排序'), '排序选项');
  });

  it('首页模态框结构完整', () => {
    const html = read('index.html');
    assert.ok(html.includes('message-modal'), '应有消息模态框');
    assert.ok(html.includes('modal-title'), '模态框应有标题');
    assert.ok(html.includes('modal-body'), '模态框应有内容区');
    assert.ok(html.includes('modal-confirm-btn'), '模态框应有确定按钮');
    assert.ok(html.includes('modal-close-btn'), '模态框应有关闭按钮');
  });

  it('管理后台导航完整', () => {
    const html = read('admin.html');
    ['控制面板', '菜品管理', '用户管理', '反馈查看', '偏好分布', '数据分析', '模型管理'].forEach(item => {
      assert.ok(html.includes(item), '管理后台导航应有 ' + item);
    });
  });

  it('管理后台菜品编辑模态框完整', () => {
    const html = read('admin.html');
    assert.ok(html.includes('dishModal'), '应有菜品编辑模态框');
    assert.ok(html.includes('dish-name'), '模态框应有菜名输入');
    assert.ok(html.includes('dish-category'), '模态框应有分类选择');
    assert.ok(html.includes('dish-price'), '模态框应有价格输入');
    assert.ok(html.includes('dish-rating'), '模态框应有评分输入');
    assert.ok(html.includes('dish-tags'), '模态框应有标签输入');
  });

  it('所有页面HTML正确闭合', () => {
    ['index.html', 'admin.html', 'kitchen.html'].forEach(f => {
      assert.ok(read(f).includes('</html>'), f + ' 应正确闭合');
    });
  });

  it('CSS变量定义完整', () => {
    const css = read('styles.css');
    ['--primary', '--gold', '--cream', '--brown', '--text', '--radius', '--ease', '--green', '--gold-light'].forEach(v => {
      assert.ok(css.includes(v), 'CSS缺少变量: ' + v);
    });
  });

  it('CSS有响应式媒体查询', () => {
    const css = read('styles.css');
    assert.ok(css.includes('@media (max-width: 768px)'), 'CSS应有768px断点');
    assert.ok(css.includes('@media (max-width: 375px)'), 'CSS应有375px断点');
  });

  it('CSS有Google Fonts和触控优化', () => {
    const css = read('styles.css');
    assert.ok(css.includes('Noto+Serif+SC') || css.includes('Noto+Sans+SC') || css.includes('noto-sans-sc'), 'CSS应加载Noto字体');
    assert.ok(css.includes('touch-action'), 'CSS应有触控优化');
  });

  it('Bootstrap和Icons正确引用', () => {
    ['index.html', 'admin.html', 'kitchen.html'].forEach(f => {
      const html = read(f);
      assert.ok(html.includes('bootstrap.min.css'), f + ' 应引用Bootstrap CSS');
      assert.ok(html.includes('bootstrap-icons'), f + ' 应引用Bootstrap Icons');
    });
  });

  it('首页正确引用JS和CSS', () => {
    const html = read('index.html');
    assert.ok(html.includes('bootstrap.bundle.min.js'), '应引用Bootstrap JS');
    assert.ok(html.includes('chart.umd.min.js'), '应引用Chart.js');
    assert.ok(html.includes('script.js'), '应引用script.js');
    assert.ok(html.includes('styles.css'), '应引用styles.css');
  });
});

// ================================================================
// 4. 功能完整性审计
// ================================================================
describe('4. 功能完整性审计', () => {
  it('推荐系统有完整的降级链', () => {
    const js = read('js/recommendation.js');
    assert.ok(js.includes('fetchRecommendations'), '应有推荐函数');
    assert.ok(js.includes('fallback'), '应有降级函数');
    assert.ok(js.includes('selectBlindBoxDish') || js.includes('盲盒'), '应有盲盒推荐');
    assert.ok(js.includes('predictWithDecisionTree'), '应有决策树预测');
  });

  it('推荐显示有匹配指数四维度', () => {
    const js = read('js/core.js');
    assert.ok(js.includes('taste'), '应有口味维度');
    assert.ok(js.includes('cuisine'), '应有招牌维度');
    assert.ok(js.includes('calorie'), '应有营养维度');  // 2026-09-17: 字段已更名 calorie
    assert.ok(js.includes('rating'), '应有评分维度');
  });

  it('购物车完整功能存在', () => {
    const js = read('js/globals.js');
    assert.ok(js.includes('function getCart'), 'getCart 函数');
    assert.ok(js.includes('function addToCart'), 'addToCart 函数');
    assert.ok(js.includes('function removeFromCart'), 'removeFromCart 函数');
    assert.ok(js.includes('function updateCartQty'), 'updateCartQty 函数');
    assert.ok(js.includes('function clearCart'), 'clearCart 函数');
    assert.ok(js.includes('function getCartTotal'), 'getCartTotal 函数');
    assert.ok(js.includes('function getCartCount'), 'getCartCount 函数');
    assert.ok(js.includes('function updateCartBadge'), 'updateCartBadge 函数');
  });

  it('评分功能完整', () => {
    const js = read('js/core.js');
    assert.ok(js.includes('function submitStarFeedback'), 'submitStarFeedback 函数');
    assert.ok(js.includes('function openStarFeedback'), 'openStarFeedback 函数');
  });

  it('收藏/拉黑功能完整', () => {
    const js = read('js/core.js');
    assert.ok(js.includes('function addToFavorites'), 'addToFavorites 函数');
    assert.ok(js.includes('function addToBlacklist'), 'addToBlacklist 函数');
    assert.ok(js.includes('function cancelFavorite'), 'cancelFavorite 函数');
    assert.ok(js.includes('function cancelBlacklist'), 'cancelBlacklist 函数');
  });

  it('用户注销功能完整', () => {
    const js = read('js/core.js');
    assert.ok(js.includes('function deleteAccount'), 'deleteAccount 函数');
  });

  it('菜品搜索筛选功能完整', () => {
    const js = read('js/core.js');
    assert.ok(js.includes('function renderMenuTable'), 'renderMenuTable 函数');
    assert.ok(js.includes('menu-search'), 'menu-search 搜索框');
    assert.ok(js.includes('menu-filter-cat'), 'menu-filter-cat 分类筛选');
    assert.ok(js.includes('menu-filter-spice'), 'menu-filter-spice 辣度筛选');
    assert.ok(js.includes('menu-filter-price'), 'menu-filter-price 价格筛选');
    assert.ok(js.includes('menu-sort'), 'menu-sort 排序');
  });

  it('核心全局变量正确定义', () => {
    const js = read('js/globals.js');
    assert.ok(js.includes('currentUser'), '应有currentUser变量');
    assert.ok(js.includes('currentRecommendations'), '应有currentRecommendations变量');
    assert.ok(js.includes('dishData'), '应有dishData变量');
    assert.ok(js.includes('_initialized'), '应有_initialized变量');
    assert.ok(js.includes('function esc'), '应有esc函数');
    assert.ok(js.includes('function safeFetch'), '应有safeFetch函数');
    assert.ok(js.includes('function authHeaders'), '应有authHeaders函数');
    assert.ok(js.includes('function formatPrice'), '应有formatPrice函数');
  });

  it('XSS转义函数在关键位置存在', () => {
    ['js/globals.js', 'admin.html', 'kitchen.html'].forEach(f => {
      assert.ok(read(f).includes('function esc'), f + ' 应有 esc 转义函数');
    });
  });

  it('动态HTML拼接使用esc函数', () => {
    assert.ok(read('js/core.js').includes('esc('), 'core.js 中使用 esc 转义');
    assert.ok(read('admin.html').includes('esc('), 'admin.html 中使用 esc 转义');
  });

  it('密码不存储在前端localStorage', () => {
    const combined = read('js/core.js') + read('js/init.js');
    const pwdStores = combined.match(/localStorage\.setItem\([^)]*password[^)]*\)/gi);
    assert.ok(!pwdStores || pwdStores.length === 0, '前端不应存储明文密码到localStorage');
  });

  it('购物车有空态显示', () => {
    assert.ok(read('index.html').includes('cart-empty') || read('index.html').includes('购物车是空的'), '购物车应有空态');
    assert.ok(read('js/core.js').includes('cart-empty') || read('js/core.js').includes('空的'), '购物车空态逻辑');
  });

  it('推荐结果有加载态和空态提示', () => {
    assert.ok(read('index.html').includes('recommendation-loading'), '推荐结果应有加载态');
    assert.ok(read('js/recommendation.js').includes('recommendation-loading'), '推荐加载态逻辑');
    assert.ok(read('js/recommendation.js').includes('没有更多菜品啦'), '推荐结果应有空态提示');
    assert.ok(read('js/recommendation.js').includes('菜品数据加载中，请稍后重试'), '菜品加载应有超时提示');
  });
});

// ================================================================
// 5. 构建产物与源码同步审计
// ================================================================
describe('5. 构建产物与源码同步审计', () => {
  it('build.js 构建配置正确', () => {
    const build = read('build.js');
    assert.ok(build.includes('js/globals.js'), 'build.js 包含 globals.js');
    assert.ok(build.includes('js/core.js'), 'build.js 包含 core.js');
    assert.ok(build.includes('js/recommendation.js'), 'build.js 包含 recommendation.js');
    assert.ok(build.includes('js/init.js'), 'build.js 包含 init.js');
  });

  it('script.js 构建产物语法正确且完整', () => {
    const script = read('script.js');
    assert.ok(script.length > 60000, 'script.js 长度应大于60000，当前' + script.length);
    const funcs = ['function esc', 'function showSection', 'function login',
      'function register', 'function fetchRecommendations', 'function displayRecommendations',
      'function addToCart', 'function showCart', 'function showProfile'];
    funcs.forEach(fn => {
      assert.ok(script.includes(fn), 'script.js 缺少 ' + fn);
    });
  });

  it('script.js 中无重复函数定义', () => {
    const script = read('script.js');
    const funcs = ['fetchRecommendations', 'displayRecommendations', 'selectBlindBoxDish',
      'computeDishMatch', 'generateDishReason', 'checkApiAvailability',
      'showSection', 'showMessage', 'renderMenuTable', 'showCart',
      'checkoutCart', 'showProfile', 'showDataset'];
    funcs.forEach(fn => {
      const regex = new RegExp('function ' + fn + '\\s*\\(', 'g');
      const matches = script.match(regex);
      assert.ok(matches && matches.length === 1,
        'script.js 中 ' + fn + ' 应出现1次，实际' + (matches ? matches.length : 0) + '次');
    });
  });
});

// ================================================================
// 6. 工具函数完整性审计
// ================================================================
describe('6. 工具函数完整性审计', () => {
  it('safeFetch 函数存在且有错误处理', () => {
    const js = read('js/globals.js');
    assert.ok(js.includes('function safeFetch'), 'safeFetch 函数存在');
    assert.ok(js.includes('.catch('), 'safeFetch 有catch处理');
    assert.ok(js.includes('503'), 'safeFetch 返回503状态码');
  });

  it('formatPrice 函数正确处理边界值', () => {
    const js = read('js/globals.js');
    assert.ok(js.includes('function formatPrice'), 'formatPrice 函数存在');
    assert.ok(js.includes('null'), 'formatPrice 处理null');
    assert.ok(js.includes('undefined'), 'formatPrice 处理undefined');
    assert.ok(js.includes("'未知'"), 'formatPrice 返回"未知"');
  });

  it('generateDishReason 函数存在且包含所有推荐维度', () => {
    const js = read('js/core.js');
    assert.ok(js.includes('function generateDishReason'), 'generateDishReason 函数存在');
    assert.ok(js.includes('推荐理由'), '推荐理由包含中文说明');
    assert.ok(js.includes('招牌'), '推荐理由包含招牌信息');
    assert.ok(js.includes('经济实惠') || js.includes('价格适中') || js.includes('品质之选'), '推荐理由包含价格信息');
  });

  it('computeDishMatch 函数返回完整匹配详情', () => {
    const js = read('js/core.js');
    assert.ok(js.includes('function computeDishMatch'), 'computeDishMatch 函数存在');
    assert.ok(js.includes('matchDetails'), 'computeDishMatch 返回matchDetails');
    assert.ok(js.includes('totalMatch'), 'computeDishMatch 返回totalMatch');
    assert.ok(js.includes('matchRate'), 'computeDishMatch 返回matchRate');
  });

  it('selectBlindBoxDish 函数存在且有权重计算', () => {
    const js = read('js/core.js');
    assert.ok(js.includes('function selectBlindBoxDish'), 'selectBlindBoxDish 函数存在');
    assert.ok(js.includes('权重') || js.includes('score'), '盲盒推荐有权重计算');
    assert.ok(js.includes('盲盒推荐'), '盲盒推荐有中文说明');
  });

  it('authHeaders 函数存在且正确', () => {
    const js = read('js/globals.js');
    assert.ok(js.includes('function authHeaders'), 'authHeaders 函数存在');
    assert.ok(js.includes('Authorization'), 'authHeaders 返回Authorization头');
    assert.ok(js.includes('userToken'), 'authHeaders 使用userToken');
  });

  it('resetRecommendation 函数重置所有状态', () => {
    const js = read('js/core.js');
    assert.ok(js.includes('function resetRecommendation'), 'resetRecommendation 函数存在');
    assert.ok(js.includes('currentRecommendations'), '重置推荐列表');
    assert.ok(js.includes('recommendedIds'), '重置推荐ID列表');
    assert.ok(js.includes('userProfile'), '重置用户偏好');
  });

  it('updateUserNavbar 函数正确处理三种用户状态', () => {
    const js = read('js/core.js');
    assert.ok(js.includes('function updateUserNavbar'), 'updateUserNavbar 函数存在');
    assert.ok(js.includes("currentUser==='guest'"), '处理游客状态');
    assert.ok(js.includes('nav-profile-item'), '处理登录用户状态');
    assert.ok(js.includes('d-none'), '使用d-none控制显示');
  });
});

// ================================================================
// 7. 后端API验证审计
// ================================================================
describe('7. 后端API验证审计', () => {
  it('batch-status 端点接受数字和字符串ID', () => {
    const server = read('server.js');
    const batchStatusBlock = server.substring(
      server.indexOf('batch-status'),
      server.indexOf('batch-status') + 500
    );
    assert.ok(batchStatusBlock.includes("Number.isInteger(id) || /^\\d+$/.test(String(id))"),
      'batch-status 应接受数字和字符串ID');
  });

  it('batch-delete 端点接受数字和字符串ID', () => {
    const server = read('server.js');
    const batchDeleteBlock = server.substring(
      server.indexOf('batch-delete'),
      server.indexOf('batch-delete') + 500
    );
    assert.ok(batchDeleteBlock.includes("Number.isInteger(id) || /^\\d+$/.test(String(id))"),
      'batch-delete 应接受数字和字符串ID');
  });

  it('所有管理后台路由有adminAuth保护', () => {
    const server = read('server.js');
    const adminRoutes = server.match(/app\.(get|post|put|delete)\('\/api\/admin\//g) || [];
    // 排除登录路由（不需要认证）
    const protectedRoutes = adminRoutes.filter(r => !r.includes('/login'));
    assert.ok(protectedRoutes.length >= 20, '应有至少20个受保护的管理后台路由');
  });

  it('用户注册有密码复杂度验证', () => {
    const server = read('server.js');
    assert.ok(server.includes('password.length < 8'), '密码最小长度8位');
    assert.ok(server.includes('password.length > 128'), '密码最大长度128位');
    assert.ok(server.includes('/[A-Z]/'), '密码必须包含大写字母');
    assert.ok(server.includes('/[a-z]/'), '密码必须包含小写字母');
    assert.ok(server.includes('/[0-9]/'), '密码必须包含数字');
  });

  it('deleteUser 函数错误消息正确', () => {
    const html = read('admin.html');
    // 2026-09-17: 签名已变为 deleteUser(id, btn),窗口放宽至 900
    const deleteUserFunc = html.substring(
      html.indexOf('function deleteUser(id, btn)'),
      html.indexOf('function deleteUser(id, btn)') + 900
    );
    assert.ok(deleteUserFunc.includes('删除失败'), 'deleteUser 应显示删除失败');  // 已迁移 showToast
    assert.ok(!deleteUserFunc.includes("'导出失败'"), 'deleteUser 不应显示"导出失败"');
  });

  it('loadDishes 函数正确处理价格为null的情况', () => {
    const html = read('admin.html');
    const loadDishesBlock = html.substring(
      html.indexOf('function loadDishes()'),
      html.indexOf('function loadDishes()') + 800
    );
    assert.ok(loadDishesBlock.includes("x.price!=null?esc(x.price):'-'"),
      'loadDishes 价格应使用 null 保护');
  });

  it('管理后台所有页面面板存在', () => {
    const html = read('admin.html');
    const pageIds = ['page-dashboard', 'page-dishes', 'page-feedback',
      'page-preferences', 'page-analytics', 'page-model', 'page-apidocs', 'page-users'];
    pageIds.forEach(id => {
      assert.ok(html.includes('id="' + id + '"'), '缺少页面面板: ' + id);
    });
  });

  it('管理后台导航链接数量正确', () => {
    const html = read('admin.html');
    const sidebarLinks = html.match(/data-page="[^"]+"/g) || [];
    assert.ok(sidebarLinks.length >= 9, '应有至少9个导航链接');
  });

  it('管理后台菜品编辑模态框字段完整', () => {
    const html = read('admin.html');
    assert.ok(html.includes('dish-name'), '菜名输入框');
    assert.ok(html.includes('dish-category'), '分类选择');
    assert.ok(html.includes('dish-price'), '价格输入');
    assert.ok(html.includes('dish-rating'), '评分输入');
    assert.ok(html.includes('dish-tags'), '标签输入');
    assert.ok(html.includes('dish-description'), '描述输入');
    assert.ok(html.includes('dish-spiciness'), '辣度选择');
    assert.ok(html.includes('dish-saltiness'), '咸淡选择');
    assert.ok(html.includes('dish-sweetness'), '甜酸选择');
    assert.ok(html.includes('dish-active'), '上架复选框');
    assert.ok(html.includes('dish-halal'), '清真复选框');
    assert.ok(html.includes('dish-vegetarian'), '素食复选框');
    assert.ok(html.includes('dish-allergy-seafood'), '海鲜过敏');
    assert.ok(html.includes('dish-allergy-peanut'), '花生过敏');
    assert.ok(html.includes('dish-allergy-egg'), '鸡蛋过敏');
    assert.ok(html.includes('dish-allergy-gluten'), '麸质过敏');
    assert.ok(html.includes('dish-allergy-soy'), '大豆过敏');
  });
});

// ================================================================
// 8. 页面元素完整性审计
// ================================================================
describe('8. 页面元素完整性审计', () => {
  it('管理后台监控面板元素完整', () => {
    const html = read('admin.html');
    const monitorIds = ['monitor-r2-trend', 'monitor-uptime', 'monitor-memory',
      'monitor-error-log', 'monitor-combined-log', 'monitor-pending', 'monitor-r2-history'];
    monitorIds.forEach(id => {
      assert.ok(html.includes('id="' + id + '"'), '监控面板缺少元素: ' + id);
    });
  });

  it('管理后台分析页面图表元素完整', () => {
    const html = read('admin.html');
    assert.ok(html.includes('daily-trend-chart'), '每日趋势图表');
    assert.ok(html.includes('pref-pie-chart'), '偏好饼图');
    assert.ok(html.includes('user-activity-chart'), '用户活跃度图表');
    assert.ok(html.includes('analytics-total-users'), '总用户数');
    assert.ok(html.includes('analytics-feedback-users'), '有反馈用户数');
  });

  it('管理后台推荐统计元素完整', () => {
    const html = read('admin.html');
    assert.ok(html.includes('stat-total-rec'), '总推荐数');
    assert.ok(html.includes('stat-fb-rec'), '有反馈数');
    assert.ok(html.includes('stat-conversion'), '转化率');
    assert.ok(html.includes('stat-avg-rating'), '平均评分');
  });

  it('管理后台偏好分布元素完整', () => {
    const html = read('admin.html');
    const prefIds = ['pref-spiciness', 'pref-saltiness', 'pref-sweetness',
      'pref-price', 'pref-calorie', 'pref-religion'];
    prefIds.forEach(id => {
      assert.ok(html.includes('id="' + id + '"'), '偏好分布缺少元素: ' + id);
    });
  });

  it('首页满意度评分元素完整', () => {
    const html = read('index.html');
    assert.ok(html.includes('end-satisfaction'), '满意度评分容器');
    assert.ok(html.includes('end-sat-submit'), '满意度提交按钮');
    assert.ok(html.includes('end-sat-hint'), '满意度提示');
    assert.ok(html.includes('sat-star'), '满意度星星');
  });

  it('首页模型评估元素完整', () => {
    const html = read('index.html');
    assert.ok(html.includes('model-metrics'), '模型评估容器');
    assert.ok(html.includes('end-model-r2'), '模型R2值');
    assert.ok(html.includes('feature-importance-chart'), '特征重要性图表');
  });
});

// ================================================================
// 9. 后端逻辑健壮性审计
// ================================================================
describe('9. 后端逻辑健壮性审计', () => {
  it('Python Worker有重启次数限制', () => {
    const server = read('server.js');
    assert.ok(server.includes('MAX_RESTART_ATTEMPTS'), '应有最大重启次数限制');
    assert.ok(server.includes('restartAttempts < MAX_RESTART_ATTEMPTS'), '应检查重启次数');
  });

  it('订单创建有幂等性检查', () => {
    const server = read('server.js');
    const orderIdx = server.indexOf('同一用户');
    assert.ok(orderIdx > 0, '应有幂等性检查注释');
    const orderBlock = server.substring(orderIdx, orderIdx + 300);
    assert.ok(orderBlock.includes('user_id = $1 AND items = $2::jsonb'), '应有SQL级幂等性检查');  // 2026-09-17: items 已改 jsonb
  });

  it('添加菜品有完整字段验证', () => {
    const server = read('server.js');
    assert.ok(server.includes("name.trim().length < 2"), '菜名至少2个字符');
    assert.ok(server.includes("name.trim().length > 100"), '菜名最多100个字符');
    assert.ok(server.includes("priceNum < 0"), '价格非负验证');
    assert.ok(server.includes("ratingNum > 5"), '评分上限5');
  });

  it('更新菜品有字段验证', () => {
    const server = read('server.js');
    assert.ok(server.includes("name.trim().length < 2"), '更新菜名至少2个字符');
    assert.ok(server.includes("p < 0"), '更新价格非负验证');
    assert.ok(server.includes("r > 5"), '更新评分上限5');
  });

  it('用户列表按最后登录排序', () => {
    const server = read('server.js');
    const usersRoute = server.substring(
      server.indexOf("app.get('/api/admin/users'"),
      server.indexOf("app.get('/api/admin/users'") + 300
    );
    assert.ok(usersRoute.includes('ORDER BY last_login DESC'), '用户列表按最后登录排序');
  });

  it('监控系统返回完整数据', () => {
    const server = read('server.js');
    assert.ok(server.includes('r2Trend'), '监控包含R2趋势');
    assert.ok(server.includes('errorLog'), '监控包含错误日志');
    assert.ok(server.includes('uptime'), '监控包含运行时间');
    assert.ok(server.includes('memoryUsage'), '监控包含内存使用');
    assert.ok(server.includes('pendingRequests'), '监控包含待处理请求');
    assert.ok(server.includes('metricsHistory'), '监控包含指标历史');
  });

  it('模型备份有版本控制和数量限制', () => {
    const server = read('server.js');
    assert.ok(server.includes('function backupOldModel'), '应有模型备份函数');
    assert.ok(server.includes('只保留最近'), '应有备份数量限制');
  });

  it('重训练有超时保护防止锁死', () => {
    const server = read('server.js');
    assert.ok(server.includes('_isRetraining = false'), '重训练有锁释放机制');
    assert.ok(server.includes('30000'), '重训练超时30秒');
  });

  it('仪表板响应式布局正确', () => {
    const html = read('admin.html');
    assert.ok(html.includes('content-row'), '应有flex布局容器');
    assert.ok(html.includes('col-main'), '应有主列');
    assert.ok(html.includes('col-side'), '应有侧边栏');
    assert.ok(html.includes('flex-direction: column'), '移动端应有列布局');
  });

  it('saveDish 函数正确清理tags中的空格', () => {
    const html = read('admin.html');
    assert.ok(html.includes("split(',').map(t => t.trim()).filter(Boolean).join(',')"),
      'tags应清理空格');
  });

  it('服务端正确清理tags中的空格', () => {
    const server = read('server.js');
    assert.ok(server.includes("t.trim()"), '服务端应清理tags空格');
  });

  it('API文档页面包含所有核心API', () => {
    const html = read('admin.html');
    assert.ok(html.includes('/api/dishes'), 'API文档包含菜品列表');
    assert.ok(html.includes('/api/user/register'), 'API文档包含用户注册');
    assert.ok(html.includes('/api/predict-rf'), 'API文档包含推荐预测');
    assert.ok(html.includes('/api/admin/login'), 'API文档包含管理员登录');
    assert.ok(html.includes('/api/admin/stats'), 'API文档包含统计');
    assert.ok(html.includes('/api/admin/monitor'), 'API文档包含监控');
  });

  it('模型信息返回完整字段', () => {
    const server = read('server.js');
    assert.ok(server.includes("version: '1.0'"), '模型信息包含版本');
    assert.ok(server.includes("trainedAt"), '模型信息包含训练时间');
    assert.ok(server.includes("feedbackCount"), '模型信息包含反馈数');
    assert.ok(server.includes("r2"), '模型信息包含R2值');
  });

  it('用户注册有用户名唯一性检查', () => {
    const server = read('server.js');
    assert.ok(server.includes('username.trim().length < 2'), '用户名至少2个字符');
    assert.ok(server.includes('username.trim().length > 20'), '用户名最多20个字符');  // 2026-09-17: 上限已收紧
    assert.ok(server.includes('用户名已存在'), '有用户名唯一性检查');
  });

  it('菜品分类选项前后端一致', async () => {
    const indexHtml = read('index.html');
    const adminHtml = read('admin.html');
    // 从API获取菜品数据（替代dishes_current.json）
    const dishesResp = await fetch('http://localhost:3000/api/dishes');
    const dishesData = await dishesResp.json();
    const dishesJson = JSON.stringify(dishesData);
    // 从index.html提取分类选项
    const indexCatMatch = indexHtml.match(/<option value="">全部分类<\/option>(.*?)<\/select>/s);
    // 从admin.html提取分类选项
    const adminCatMatch = adminHtml.match(/<select class="form-select" id="dish-category">(.*?)<\/select>/s);
    // 从API数据提取实际分类
    const actualCats = [...new Set(dishesJson.match(/"category":"([^"]+)"/g).map(m => m.replace(/"category":"|"/g, '')))];
    // 验证admin.html分类选项与实际数据一致
    const adminCats = adminCatMatch ? adminCatMatch[1].match(/<option[^>]*>([^<]+)<\/option>/g).map(m => m.replace(/<option[^>]*>|<\/option>/g, '')) : [];
    actualCats.forEach(cat => {
      assert.ok(adminCats.includes(cat), '管理后台缺少分类: ' + cat);
    });
  });

  it('订单支持多状态过滤', () => {
    const server = read('server.js');
    assert.ok(server.includes("status = ANY($"), '订单支持多状态过滤');
  });

  it('注册表单有隐私政策同意复选框', () => {
    const html = read('index.html');
    assert.ok(html.includes('agree-privacy'), '隐私政策同意复选框存在');
    assert.ok(html.includes('privacy-link'), '隐私政策链接存在');
  });

  it('过敏源复选框互斥逻辑完整', () => {
    const init = read('js/init.js');
    assert.ok(init.includes('allergy-none'), '有无过敏选项');
    assert.ok(init.includes('cb.checked=false'), '选择无时清除其他');
    assert.ok(init.includes('cb.disabled=this.checked'), '选择无时禁用其他');
  });

  it('dashboard模型信息元素完整', () => {
    const html = read('admin.html');
    assert.ok(html.includes('model-version'), '模型版本');
    assert.ok(html.includes('model-trained-at'), '模型训练时间');
    assert.ok(html.includes('model-r2'), '模型R2');
    assert.ok(html.includes('model-feedback-count'), '模型反馈数');
  });

  it('完成页所有数据元素存在', () => {
    const html = read('index.html');
    assert.ok(html.includes('end-dish-count'), '推荐菜品数');
    assert.ok(html.includes('end-avg-match'), '平均匹配度');
    assert.ok(html.includes('end-top-match'), '最高匹配度');
    assert.ok(html.includes('end-model-r2'), '模型R2值');
    assert.ok(html.includes('end-satisfaction'), '满意度评分');
    assert.ok(html.includes('feature-importance-chart'), '特征重要性图');
  });

  it('删除菜品有确认对话框', () => {
    const html = read('admin.html');
    // 2026-09-17: 删除流程已迁移 confirmAction 双击确认封装(不再用原生 confirm)
    const deleteBlock = html.substring(
      html.indexOf('function deleteDish(id'),
      html.indexOf('function deleteDish(id') + 600
    );
    assert.ok(deleteBlock.includes('confirmAction'), '删除菜品有确认对话框(confirmAction)');
  });

  it('删除菜品后刷新数据', () => {
    const html = read('admin.html');
    const deleteBlock = html.substring(
      html.indexOf('function deleteDish(id'),
      html.indexOf('function deleteDish(id') + 1200
    );
    assert.ok(deleteBlock.includes('loadDish'), '删除后刷新菜品列表');
  });

  it('永久删除菜品后刷新缓存', () => {
    const server = read('server.js');
    const permDeleteBlock = server.substring(
      server.indexOf("app.delete('/api/admin/dish/:id/permanent'"),
      server.indexOf("app.delete('/api/admin/dish/:id/permanent'") + 400
    );
    assert.ok(permDeleteBlock.includes('loadDishData()'), '永久删除后刷新菜品缓存');
  });

  it('订单支持桌号参数', () => {
    const server = read('server.js');
    assert.ok(server.includes('tableNumber'), '订单支持桌号参数');
  });

  it('管理员登录有速率限制', () => {
    const server = read('server.js');
    assert.ok(server.includes('adminLoginLimiter'), '管理员登录有速率限制');
  });

  it('注册有密码确认验证', () => {
    const html = read('index.html');
    const js = read('js/core.js');
    assert.ok(html.includes('register-confirm'), '确认密码输入框存在');
    assert.ok(js.includes("p!==c"), '密码确认验证逻辑存在');
  });

  it('菜品名称有前后端长度验证', () => {
    const server = read('server.js');
    const html = read('admin.html');
    assert.ok(server.includes("name.trim().length < 2"), '服务端有菜名最小长度验证');
    assert.ok(server.includes("name.trim().length > 100"), '服务端有菜名最大长度验证');
    assert.ok(html.includes("if (!name)"), '前端有菜名非空验证');
  });

  it('推荐预测有worker状态检查', () => {
    const server = read('server.js');
    assert.ok(server.includes('workerReady'), '预测路由检查worker状态');
    assert.ok(server.includes('pendingRequests.size >= 100'), '预测路由有请求队列限制');
    assert.ok(server.includes('Worker未就绪'), 'worker未就绪时有提示');
  });

  it('登录表单有必填验证', () => {
    const html = read('index.html');
    const js = read('js/core.js');
    assert.ok(html.includes('login-username'), '用户名输入框存在');
    assert.ok(html.includes('login-password'), '密码输入框存在');
    assert.ok(js.includes("if(!u||!p)"), '登录函数有非空验证');
  });

  it('整体满意度dishId为0', () => {
    const server = read('server.js');
    assert.ok(server.includes('dishId 为 0 表示整体满意度'), '支持整体满意度');
  });

  it('菜品编辑时过敏源复选框正确初始化', () => {
    const html = read('admin.html');
    assert.ok(html.includes('a.seafood || false'), '海鲜过敏默认false');
    assert.ok(html.includes('a.peanut || false'), '花生过敏默认false');
    assert.ok(html.includes('a.egg || false'), '鸡蛋过敏默认false');
    assert.ok(html.includes('dish.isHalal || false'), '清真默认false');
    assert.ok(html.includes('dish.isVegetarian || false'), '素食默认false');
  });

  it('登录和注册函数trim用户名', () => {
    const js = read('js/core.js');
    assert.ok(js.includes("u=uEl.value.trim()"), '登录函数trim用户名');
    assert.ok(js.includes("u=uEl.value.trim()"), '注册函数trim用户名');
  });

  it('管理后台菜品列表图片有onerror处理', () => {
    const html = read('admin.html');
    const loadDishesBlock = html.substring(
      html.indexOf('function loadDishes()'),
      html.indexOf('function loadDishes()') + 800
    );
    assert.ok(loadDishesBlock.includes("onerror=\"this.style.display='none'\"") ||
      loadDishesBlock.includes("onerror='this.style.display=\"none\"'"),
      '菜品列表图片应有onerror处理');
  });

  it('模型管理页面元素完整', () => {
    const html = read('admin.html');
    assert.ok(html.includes('model-mgr-version'), '模型版本');
    assert.ok(html.includes('model-mgr-time'), '训练时间');
    assert.ok(html.includes('model-mgr-r2'), 'R2值');
    assert.ok(html.includes('model-mgr-fb'), '反馈数');
    assert.ok(html.includes('model-history-table'), '历史模型表格');
  });

  it('模型历史API返回完整', () => {
    const server = read('server.js');
    assert.ok(server.includes('modelInfo.version'), '历史包含版本');
    assert.ok(server.includes('trainedAt'), '历史包含训练时间');
    assert.ok(server.includes('isCurrent'), '历史包含当前标记');
  });

  it('所有环境变量访问有默认值保护', () => {
    const server = read('server.js');
    assert.ok(server.includes("PORT || '3000'"), 'PORT有默认值');
    assert.ok(server.includes("CORS_ORIGIN || 'http://localhost:3000'"), 'CORS_ORIGIN有默认值');
    assert.ok(server.includes("RATE_LIMIT_WINDOW_MS || '900000'"), 'RATE_LIMIT_WINDOW_MS有默认值');
    assert.ok(server.includes("RATE_LIMIT_MAX || '1000'"), 'RATE_LIMIT_MAX有默认值');
    assert.ok(server.includes("ADMIN_USER || 'admin'"), 'ADMIN_USER有默认值');
  });

  it('API文档包含所有管理后台端点', () => {
    const html = read('admin.html');
    assert.ok(html.includes('/api/admin/login'), '包含登录');
    assert.ok(html.includes('/api/admin/stats'), '包含统计');
    assert.ok(html.includes('/api/admin/dish'), '包含菜品管理');
    assert.ok(html.includes('/api/admin/users'), '包含用户管理');
    assert.ok(html.includes('/api/admin/notifications'), '包含通知');
    assert.ok(html.includes('/api/admin/export'), '包含数据导出');
  });

  it('数据库连接使用UTF-8编码', () => {
    const db = read('db.js');
    const userStorage = read('user_storage.js');
    const server = read('server.js');
    assert.ok(server.includes("SET client_encoding = 'UTF8'"), '服务端设置UTF-8编码');
    assert.ok(userStorage.includes("SET client_encoding = 'UTF8'"), '用户存储设置UTF-8编码');
  });

  it('菜品描述有长度限制', () => {
    const server = read('server.js');
    assert.ok(server.includes("description.length > 500"), '描述最多500字符');
  });

  it('index.html div标签平衡', () => {
    const html = read('index.html');
    // 提取script块外的HTML
    const htmlOnly = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    const opens = (htmlOnly.match(/<div[\s>]/g) || []).length;
    const closes = (htmlOnly.match(/<\/div>/g) || []).length;
    assert.equal(opens, closes, 'div标签应平衡，opens=' + opens + ' closes=' + closes);
  });

  it('admin.html div标签平衡', () => {
    const html = read('admin.html');
    const htmlOnly = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    const opens = (htmlOnly.match(/<div[\s>]/g) || []).length;
    const closes = (htmlOnly.match(/<\/div>/g) || []).length;
    assert.equal(opens, closes, 'div标签应平衡，opens=' + opens + ' closes=' + closes);
  });

  it('kitchen.html div标签平衡', () => {
    const html = read('kitchen.html');
    const htmlOnly = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    const opens = (htmlOnly.match(/<div[\s>]/g) || []).length;
    const closes = (htmlOnly.match(/<\/div>/g) || []).length;
    assert.equal(opens, closes, 'div标签应平衡，opens=' + opens + ' closes=' + closes);
  });

  it('环境变量配置示例完整', () => {
    const env = read('.env.example');
    const server = read('server.js');
    // 服务端使用的所有环境变量应在 .env.example 中有记录
    const required = ['PORT', 'JWT_SECRET', 'ADMIN_USER', 'ADMIN_PASS',
      'CORS_ORIGIN', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX',
      'LOGIN_RATE_LIMIT_MAX', 'ADMIN_LOGIN_RATE_LIMIT_MAX', 'LOG_LEVEL'];
    required.forEach(v => {
      assert.ok(env.includes(v), '.env.example 缺少环境变量: ' + v);
    });
  });

  it('请求队列和指标历史有内存上限', () => {
    const server = read('server.js');
    assert.ok(server.includes('pendingRequests.size >= 100'), '请求队列上限100');
    assert.ok(server.includes('history.length > 60'), '指标历史保留60条');
    assert.ok(server.includes('errorStats.hourly.filter'), '错误统计按时间过滤');
  });

  it('Chart.js实例创建前销毁旧实例', () => {
    const html = read('admin.html');
    assert.ok(html.includes('window.ratingChart.destroy()'), '评分图销毁');
    assert.ok(html.includes('window.dailyChart.destroy()'), '趋势图销毁');
    assert.ok(html.includes('window.prefChart.destroy()'), '偏好饼图销毁');
    assert.ok(html.includes('window.activityChart.destroy()'), '活跃度图销毁');
  });

  it('隐私政策包含五个章节', () => {
    const html = read('index.html');
    assert.ok(html.includes('一、信息收集'), '信息收集章节');
    assert.ok(html.includes('二、信息使用'), '信息使用章节');
    assert.ok(html.includes('三、信息安全'), '信息安全章节');
    assert.ok(html.includes('四、数据管理'), '数据管理章节');
    assert.ok(html.includes('五、更新与联系'), '更新与联系章节');
  });

  it('所有评分端点有0-5范围验证', () => {
    const server = read('server.js');
    assert.ok(server.includes("scoreNum < 0 || scoreNum > 5"), '反馈评分范围验证');
    assert.ok(server.includes("ratingNum < 0 || ratingNum > 5"), '菜品评分范围验证');
  });

  it('CSV导出服务端不加BOM（客户端统一处理）', () => {
    const server = read('server.js');
    // 检查三个export路由都不在服务端添加BOM
    // 服务端原来有 '﻿' + csv 的BOM拼接，现在已移除由客户端统一添加
    const bomCount = (server.match(/res\.send\('﻿'\s*\+\s*csv\)/g) || []).length;
    assert.equal(bomCount, 0, '服务端不应添加BOM，当前发现 ' + bomCount + ' 处');
  });

  it('数据库索引覆盖主要查询', () => {
    const sql = read('sample_data.sql');
    assert.ok(sql.includes('idx_orders_user_id'), '订单用户ID索引');
    assert.ok(sql.includes('idx_orders_status'), '订单状态索引');
    assert.ok(sql.includes('idx_dishes_category'), '菜品分类索引');
    assert.ok(sql.includes('idx_dishes_is_active'), '菜品上架状态索引');
  });

  it('登录注册按钮有防重复提交', () => {
    const js = read('js/core.js');
    assert.ok(js.includes('bEl.disabled=true'), '登录时禁用按钮');
    assert.ok(js.includes('bEl.disabled=false'), '登录后恢复按钮');
  });

  it('管理后台按钮有防重复提交机制', () => {
    const html = read('admin.html');
    assert.ok(html.includes('btn.disabled = true'), '操作时禁用按钮');
    assert.ok(html.includes('btn.disabled = false'), '操作后恢复按钮');
  });

  it('错误响应不泄露敏感信息', () => {
    const server = read('server.js');
    // 确认所有catch块使用统一错误消息（不泄露堆栈）
    const internalError = server.match(/服务器内部错误/g) || [];
    assert.ok(internalError.length >= 20, '应有至少20处统一错误消息');
    // 检查响应中不直接包含堆栈（日志记录除外）
    const responseStacks = server.match(/res\.(json|send|status)[^;]*err\.stack/g) || [];
    assert.equal(responseStacks.length, 0, '不应在响应中发送堆栈信息');
  });

  it('CORS配置限制方法和来源', () => {
    const server = read('server.js');
    const corsConfig = server.substring(
      server.indexOf("app.use(cors"),
      server.indexOf("app.use(cors") + 300
    );
    assert.ok(corsConfig.includes("origin:"), 'CORS限制来源');
    assert.ok(corsConfig.includes("methods:"), 'CORS限制方法');
    assert.ok(corsConfig.includes("'GET'"), '允许GET方法');
    assert.ok(corsConfig.includes("'POST'"), '允许POST方法');
  });

  it('所有安全中间件已启用', () => {
    const server = read('server.js');
    assert.ok(server.includes('helmet('), 'helmet安全头已启用');
    assert.ok(server.includes('cors('), 'CORS已启用');
    assert.ok(server.includes('limiter'), '限流已启用');
    assert.ok(server.includes('loginLimiter'), '登录限流已启用');
    assert.ok(server.includes('registerLimiter'), '注册限流已启用');
    assert.ok(server.includes('adminLoginLimiter'), '管理员登录限流已启用');
  });

  it('菜品图片使用懒加载', () => {
    const script = read('script.js');
    assert.ok(script.includes('loading="lazy"'), '菜品图片使用懒加载');
  });

  it('静态文件有缓存策略', () => {
    const server = read('server.js');
    assert.ok(server.includes("maxAge: '7d'"), '静态文件缓存7天');
    assert.ok(server.includes('Cache-Control'), '设置缓存控制头');
  });

  it('特征重要性有缓存', () => {
    const server = read('server.js');
    assert.ok(server.includes('FEATURE_IMPORTANCE_CACHE_DURATION'), '特征重要性有缓存时长');
    assert.ok(server.includes('86400000'), '缓存时长24小时');
  });

  it('页面导航有浏览器历史管理', () => {
    const script = read('script.js');
    assert.ok(script.includes('history.pushState'), '页面切换使用pushState');
    assert.ok(script.includes('popstate'), '监听popstate事件');
  });

  it('HTTP方法使用合理', () => {
    const server = read('server.js');
    // 写操作使用POST/PUT/DELETE
    assert.ok(server.includes("app.post('/api/order'"), '下单使用POST');
    assert.ok(server.includes("app.put('/api/orders/:id/status'"), '更新订单状态使用PUT');
    assert.ok(server.includes("app.delete('/api/admin/dish/:id/permanent'"), '永久删除使用DELETE');
    // 读操作使用GET
    assert.ok(server.includes("app.get('/api/dishes'"), '菜品列表使用GET');
    assert.ok(server.includes("app.get('/api/admin/stats'"), '统计使用GET');
  });

  it('导航栏正确处理三种用户状态', () => {
    const js = read('js/core.js');
    assert.ok(js.includes("currentUser&&currentUser!=='guest'"), '已登录用户状态');
    assert.ok(js.includes("currentUser==='guest'"), '游客状态');
    assert.ok(js.includes('nav-profile-item'), '我的导航项');
    assert.ok(js.includes('nav-user'), '登录导航项');
  });

  it('核心全局函数均可被调用', () => {
    const script = read('script.js');
    // 核心函数应被HTML或事件绑定引用（去除局部函数误报）
    const coreFuncs = ['esc', 'formatPrice', 'authHeaders', 'getCart', 'addToCart',
      'showSection', 'showMessage', 'showDataset', 'renderMenuTable',
      'login', 'register', 'showProfile', 'showCart', 'checkoutCart',
      'fetchRecommendations', 'displayRecommendations', 'resetRecommendation',
      'updateUserNavbar', 'logout', 'addToFavorites', 'addToBlacklist'];
    coreFuncs.forEach(fn => {
      assert.ok(script.includes('function ' + fn), '函数存在: ' + fn);
    });
  });

  it('前端事件绑定函数完整', () => {
    const init = read('js/init.js');
    const core = read('js/core.js') + read('js/recommendation.js');  // 2026-09-17: fetchRecommendations 等已迁至 recommendation.js
    // 通过click/submit绑定的函数应存在于core.js
    const boundFuncs = ['showProfile', 'cancelFavorite', 'cancelBlacklist',
      'deleteAccount', 'logout', 'login', 'register', 'submitPreference',
      'submitStarFeedback', 'checkoutCart', 'showCart', 'fetchRecommendations',
      'endRecommendation'];
    boundFuncs.forEach(fn => {
      assert.ok(core.includes('function ' + fn), 'core.js缺少绑定函数: ' + fn);
    });
  });

  it('项目文档完整', () => {
    const readme = read('README.md');
    const changelog = read('CHANGELOG.md');
    assert.ok(readme.includes('快速开始'), 'README有快速开始');
    assert.ok(readme.includes('npm start'), 'README有启动命令');
    assert.ok(readme.includes('测试'), 'README有测试章节');
    assert.ok(readme.includes('安全特性'), 'README有安全特性');
    assert.ok(changelog.includes('## ['), 'CHANGELOG有版本记录');
  });

  it('管理后台移动端顶部栏响应式', () => {
    const html = read('admin.html');
    assert.ok(html.includes('.mobile-topbar'), '移动端顶部栏存在');
    assert.ok(html.includes('@media (max-width: 768px)'), '768px断点存在');
    assert.ok(html.includes('.mobile-topbar { display: block'), '移动端显示顶部栏');
  });

  it('CSS变量定义完整且被使用', () => {
    const css = read('styles.css');
    const defined = ['--primary', '--gold', '--cream', '--brown', '--text',
      '--radius', '--ease', '--green', '--gold-light', '--primary-dark'];
    defined.forEach(v => {
      assert.ok(css.includes(v + ':'), 'CSS变量未定义: ' + v);
      assert.ok(css.includes('var(' + v), 'CSS变量未使用: ' + v);
    });
  });

  it('推荐模式有3种选项', () => {
    const html = read('index.html');
    assert.ok(html.includes('value="auto"'), '自动选择模式');
    assert.ok(html.includes('value="api"'), 'API推荐模式');
    assert.ok(html.includes('value="local"'), '本地推荐模式');
  });

  it('菜品图片有默认SVG兜底', () => {
    const script = read('script.js');
    assert.ok(script.includes('defaultImg'), '默认图片变量存在');
    assert.ok(script.includes('onerror="this.src'), '图片加载失败有兜底');
  });

  it('predict-rf限制菜品数量', () => {
    const server = read('server.js');
    assert.ok(server.includes('dishes.length === 0'), '拒绝空数组');
    const js = read('js/recommendation.js');
    assert.ok(js.includes('slice(0,100)'), '限制最多100个菜品');
  });

  it('菜品名称输入有maxlength限制', () => {
    const html = read('admin.html');
    assert.ok(html.includes('maxlength="100"'), '菜品名称最多100字符');
    assert.ok(html.includes('maxlength="500"'), '菜品描述最多500字符');
  });

  it('注册表单输入有maxlength限制', () => {
    const html = read('index.html');
    // 2026-09-17: 用户名与密码上限均已收紧为 20
    assert.ok(html.includes('maxlength="20"'), '用户名/密码最多20字符');
  });

  it('CSS有打印样式', () => {
    const css = read('styles.css');
    assert.ok(css.includes('@media print'), '打印样式存在');
    assert.ok(css.includes('background: white'), '打印背景白色');
  });

  it('添加菜品字段有默认值保护', () => {
    const server = read('server.js');
    const addDishBlock = server.substring(
      server.indexOf("app.post('/api/admin/dish', async"),
      server.indexOf("app.post('/api/admin/dish', async") + 200
    );
    assert.ok(server.includes("name.trim().length < 2"), '菜名验证');
    assert.ok(server.includes("priceNum < 0"), '价格验证');
    assert.ok(server.includes("ratingNum > 5"), '评分验证');
    assert.ok(server.includes("spiciness||'不辣'"), '辣度默认值');
    assert.ok(server.includes("saltiness||'适中'"), '咸淡默认值');
    assert.ok(server.includes("sweetness||'无味'"), '甜酸默认值');
  });

  it('订单商品价格有验证', () => {
    const server = read('server.js');
    // 2026-09-17: 价格校验已改为服务端重算(recomputeOrderItems 按 DB 单价,不信任客户端)
    assert.ok(server.includes('async function recomputeOrderItems'), '订单价格有服务端重算验证');
    assert.ok(server.includes('priceMap[did] === undefined'), '无效菜品被拒绝');
  });

  it('Python Worker变量完整', () => {
    const server = read('server.js');
    assert.ok(server.includes('pythonWorker'), 'Worker变量存在');
    assert.ok(server.includes('workerReady'), '就绪状态变量存在');
    assert.ok(server.includes('pendingRequests'), '请求队列变量存在');
    assert.ok(server.includes('MAX_RESTART_ATTEMPTS'), '最大重启次数限制');
  });

  it('重训练有并发控制', () => {
    const server = read('server.js');
    assert.ok(server.includes('_isRetraining'), '重训练锁变量');
    assert.ok(server.includes('_isRetraining = false'), '重训练锁释放');
  });

  it('全局异常处理完整', () => {
    const server = read('server.js');
    assert.ok(server.includes("process.on('unhandledRejection'"), '未捕获Promise拒绝处理');
    assert.ok(server.includes("process.on('uncaughtException'"), '未捕获异常处理');
    assert.ok(server.includes('SIGTERM'), 'SIGTERM处理');
    assert.ok(server.includes('SIGINT'), 'SIGINT处理');
    assert.ok(server.includes('gracefulShutdown'), '优雅关闭函数');
  });

  it('安全配置失败时阻止启动', () => {
    const server = read('server.js');
    assert.ok(server.includes("JWT_SECRET 使用默认值"), 'JWT_SECRET检查');
    assert.ok(server.includes("管理后台使用默认密码"), 'ADMIN_PASS检查');
    assert.ok(server.includes('process.exit(1)'), '验证失败退出进程');
  });

  it('predict-rf有请求队列上限', () => {
    const server = read('server.js');
    assert.ok(server.includes('pendingRequests.size >= 100'), '请求队列上限100');
    assert.ok(server.includes('Worker未就绪'), 'worker未就绪提示');
  });

  it('推荐日志和偏好日志有默认值保护', () => {
    const server = read('server.js');
    // 2026-09-17: userType/userId 已改为取自 JWT 拒绝客户端伪造(比默认值兜底更强)
    assert.ok(server.includes("req.user?.username || 'guest'"), '推荐日志userId默认值');
    assert.ok(server.includes("req.user ? 'user' : 'guest'"), '推荐日志userType取自登录态');
    assert.ok(server.includes("allergies ? JSON.stringify(allergies) : '{}'"), '偏好日志allergies默认值');
    assert.ok(server.includes("recommendationMode||'auto'") || server.includes("recommendationMode || 'auto'"), '偏好日志mode默认值');
  });

  it('.gitignore覆盖临时文件', () => {
    const gitignore = read('.gitignore');
    assert.ok(gitignore.includes('screenshots/'), 'screenshots目录被忽略');
    assert.ok(gitignore.includes('审查报告_*.md'), '审查报告被忽略');
    assert.ok(gitignore.includes('tmp_*.js'), '临时JS文件被忽略');
    assert.ok(gitignore.includes('node_modules/'), 'node_modules被忽略');
  });

  it('test:all脚本引用的测试文件全部存在', () => {
    const fs = require('fs');
    const pkg = read('package.json');
    const match = pkg.match(/"test:all":\s*"([^"]+)"/);
    assert.ok(match, 'test:all脚本存在');
    const files = match[1].match(/tests\/[\w.-]+/g) || [];
    assert.ok(files.length >= 5, '应有至少5个测试文件引用(2026-09-17: 收敛为核心5入口)');
    files.forEach(f => {
      assert.ok(fs.existsSync(f), '测试文件不存在: ' + f);
    });
  });

  it('服务端错误使用console.error（logger加载前）', () => {
    const db = read('db.js');
    const auth = read('auth.js');
    const storage = read('user_storage.js');
    // db.js在logger之前加载，使用console.error是合理的
    assert.ok(db.includes("console.error('数据库连接池异常:'"), 'db.js使用console.error');
    assert.ok(auth.includes("console.error('检查 token 黑名单失败:'"), 'auth.js使用console.error');  // 2026-09-17: 消息已细化
    assert.ok(storage.includes("console.error('读取用户数据失败:'"), 'user_storage.js使用console.error');
  });
});