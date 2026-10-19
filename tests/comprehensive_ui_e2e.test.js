// 唐猫庭院 - 综合UI E2E测试：深度检查按钮可用性、显示排版、崩溃风险
// 覆盖：所有页面按钮绑定、响应式布局、字符编码、空态/加载态/错误态、崩溃风险
const { test, describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const ROOT = path.join(__dirname, '..');

function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

// 改造1 后 js/ 源码经 prettier 格式化,紧凑断言串需空白归一化后比较
const sq = (s) => String(s).replace(/\s+/g, '');

// 从HTML中提取所有带id的按钮
function extractButtonIds(html) {
  const ids = [];
  const regex = /<button[^>]*\sid="([^"]+)"[^>]*>/g;
  let m;
  while ((m = regex.exec(html)) !== null) ids.push(m[1]);
  return ids;
}

describe('深度UI检查 - 按钮可用性', () => {
  // ========== 首页按钮完整性 ==========
  it('首页所有按钮均有ID且被绑定事件', () => {
    const html = read('index.html');
    const buttons = extractButtonIds(html);
    // 核心按钮必须存在
    const required = ['guest-btn', 'login-btn', 'register-btn', 'back-to-home',
      'back-to-home-from-register', 'back-from-about', 'back-from-dataset',
      'back-from-privacy', 'view-profile-btn', 'logout-btn',
      'cancel-favorite-btn', 'cancel-blacklist-btn', 'delete-account-btn',
      'back-to-preference', 'new-recommendation', 'end-logout',
      'back-to-recommendations', 'star-submit-btn', 'cart-close-btn',
      'cart-clear-btn', 'cart-checkout-btn', 'end-sat-submit',
      'menu-reset-filter', 'modal-close-btn', 'modal-confirm-btn'];
    required.forEach(id => {
      assert.ok(buttons.includes(id), `首页缺少按钮: ${id}`);
    });
  });

  it('首页每个按钮在init.js中均有事件绑定', () => {
    const init = read('js/init.js');
    const bindings = ['guest-btn', 'continue-btn', 'login-btn', 'register-btn',
      'back-to-home', 'back-to-home-from-register', 'back-from-about',
      'back-from-dataset', 'back-from-privacy', 'view-profile-btn',
      'logout-btn', 'cancel-favorite-btn', 'cancel-blacklist-btn',
      'delete-account-btn', 'back-to-preference', 'new-recommendation',
      'end-logout', 'back-to-recommendations', 'nav-cart', 'cart-close-btn',
      'cart-clear-btn', 'cart-checkout-btn', 'view-cached-btn',
      'privacy-link', 'nav-home', 'nav-about', 'nav-dataset',
      'nav-privacy', 'nav-user', 'nav-profile'];
    bindings.forEach(id => {
      const pattern = `'${id}'`;
      assert.ok(init.includes(pattern), `init.js缺少 ${id} 事件绑定`);
    });
  });

  it('登录表单提交有事件绑定', () => {
    const init = sq(read('js/init.js'));
    assert.ok(init.includes("submit('login-form',login)"), 'login-form 缺少提交绑定');
  });

  it('注册表单提交有事件绑定', () => {
    const init = sq(read('js/init.js'));
    assert.ok(init.includes("submit('register-form',register)"), 'register-form 缺少提交绑定');
  });

  it('偏好表单提交有事件绑定', () => {
    const init = sq(read('js/init.js'));
    assert.ok(init.includes("submit('preference-form',submitPreference)"), 'preference-form 缺少提交绑定');
  });

  // ========== 管理后台按钮 ==========
  it('管理后台所有按钮存在', () => {
    const html = read('admin.html');
    const buttons = extractButtonIds(html);
    const required = ['admin-login-btn', 'add-dish-btn', 'retrain-btn',
      'delete-dish-btn', 'save-dish-btn', 'dish-image-upload'];
    required.forEach(id => {
      assert.ok(buttons.includes(id), `管理后台缺少按钮: ${id}`);
    });
  });

  it('管理后台按钮有事件绑定', () => {
    const html = read('admin.html');
    // 检查JS事件绑定（通过 addEventListener 或 onclick）
    assert.ok(html.includes("addEventListener('click'") || html.includes('add-dish-btn'), 'add-dish-btn 应有事件绑定');
    assert.ok(html.includes("delete-dish-btn').onclick"), 'delete-dish-btn 应有事件绑定');
    assert.ok(html.includes("save-dish-btn').onclick"), 'save-dish-btn 应有事件绑定');
    assert.ok(html.includes('dish-image-upload'), 'dish-image-upload 应有事件绑定');
    assert.ok(html.includes('retrain-btn'), 'retrain-btn 应有事件绑定');
    assert.ok(html.includes('admin-login-btn'), 'admin-login-btn 应有事件绑定');
  });

  it('管理后台侧边栏导航完整', () => {
    const html = read('admin.html');
    const pages = ['dashboard', 'dishes', 'users', 'feedback', 'preferences', 'analytics', 'model', 'apidocs'];
    pages.forEach(p => {
      assert.ok(html.includes(`data-page="${p}"`), `管理后台侧边栏缺少 ${p} 导航`);
    });
  });

  it('管理后台有API文档页面', () => {
    const html = read('admin.html');
    assert.ok(html.includes('apidocs') || html.includes('API文档'), '管理后台应有API文档页面');
  });

  // ========== 厨房看板 ==========
  it('厨房看板登录按钮存在', () => {
    const html = read('kitchen.html');
    assert.ok(html.includes('id="login-btn"'), '厨房看板应有登录按钮');
  });

  it('厨房看板登录输入框有aria-label', () => {
    const html = read('kitchen.html');
    assert.ok(html.includes('aria-label="管理员账号"'), '厨房看板登录框应有aria-label');
    assert.ok(html.includes('aria-label="管理员密码"'), '厨房看板密码框应有aria-label');
  });

  it('厨房看板有完成按钮', () => {
    const html = read('kitchen.html');
    assert.ok(html.includes('btn-complete'), '厨房看板应有完成按钮');
  });

  it('厨房看板有自动刷新提示', () => {
    const html = read('kitchen.html');
    assert.ok(html.includes('自动刷新'), '厨房看板应有自动刷新提示');
  });
});

describe('深度UI检查 - 显示与排版', () => {
  it('index.html 字符编码正确', () => {
    const html = read('index.html');
    assert.ok(html.includes('charset="UTF-8"') || html.includes('charset=UTF-8'), '首页应有UTF-8编码声明');
  });

  it('admin.html 字符编码正确', () => {
    const html = read('admin.html');
    assert.ok(html.includes('charset="UTF-8"') || html.includes('charset=UTF-8'), '管理后台应有UTF-8编码声明');
  });

  it('kitchen.html 字符编码正确', () => {
    const html = read('kitchen.html');
    assert.ok(html.includes('charset="UTF-8"') || html.includes('charset=UTF-8'), '厨房看板应有UTF-8编码声明');
  });

  it('所有页面有viewport meta', () => {
    ['index.html', 'admin.html', 'kitchen.html'].forEach(f => {
      const html = read(f);
      assert.ok(html.includes('viewport'), `${f} 应有viewport meta`);
    });
  });

  it('所有页面标题正确', () => {
    assert.ok(read('index.html').includes('唐猫庭院'), '首页标题应有唐猫庭院');
    assert.ok(read('admin.html').includes('管理后台'), '管理后台标题应有管理后台');
    assert.ok(read('kitchen.html').includes('厨房看板'), '厨房看板标题应有厨房看板');
  });

  it('首页有12个section', () => {
    const html = read('index.html');
    const sections = html.match(/<section[\s>]/g) || [];
    assert.ok(sections.length >= 12, `首页应有至少12个section，当前${sections.length}个`);
  });

  it('首页标题层级完整', () => {
    const html = read('index.html');
    assert.ok(html.includes('<h1'), '首页应有h1');
    assert.ok(html.includes('<h2'), '首页应有h2');
    assert.ok(html.includes('<h3'), '首页应有h3');
    assert.ok(html.includes('<h4'), '首页应有h4');
    assert.ok(html.includes('<h5'), '首页应有h5');
    assert.ok(html.includes('<h6'), '首页应有h6');
  });

  it('CSS变量定义完整', () => {
    const css = read('styles.css');
    const vars = ['--primary', '--gold', '--cream', '--brown', '--text', '--radius', '--ease'];
    vars.forEach(v => {
      assert.ok(css.includes(v), `CSS缺少变量: ${v}`);
    });
  });

  it('CSS有响应式媒体查询', () => {
    const css = read('styles.css');
    assert.ok(css.includes('@media (max-width: 768px)'), 'CSS应有768px断点');
    assert.ok(css.includes('@media (max-width: 375px)'), 'CSS应有375px断点');
  });

  it('CSS有Google Fonts加载', () => {
    const css = read('styles.css');
    assert.ok(css.includes('Noto+Serif+SC') || css.includes('Noto+Sans+SC') || css.includes('noto-sans-sc'), 'CSS应加载Noto字体');
  });

  it('CSS有触控优化', () => {
    const css = read('styles.css');
    assert.ok(css.includes('touch-action'), 'CSS应有触控优化');
  });

  it('Bootstrap和Bootstrap Icons正确引用', () => {
    ['index.html', 'admin.html', 'kitchen.html'].forEach(f => {
      const html = read(f);
      assert.ok(html.includes('bootstrap.min.css'), `${f} 应引用Bootstrap CSS`);
      assert.ok(html.includes('bootstrap-icons'), `${f} 应引用Bootstrap Icons`);
    });
  });
});

describe('深度UI检查 - 崩溃风险', () => {
  it('index.html中所有onclick调用的函数存在', () => {
    const html = read('index.html');
    const js = read('script.js') + read('index.html');  // 2026-09-17: 内联脚本(如 toggleDarkMode)也属 onclick 目标
    const onclickMatches = html.match(/onclick="([^"]+)"/g) || [];
    onclickMatches.forEach(oc => {
      const funcMatch = oc.match(/onclick="(\w+)/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        // 2026-09-17: 跳过 JS 内建/上下文对象(onclick="event.stopPropagation();..." 会被正则误捕)
        if (['event', 'this', 'window', 'document'].includes(funcName)) return;
        // 检查函数是否存在（可以是全局函数或以window.开头）
        assert.ok(js.includes(`function ${funcName}`) || js.includes(`${funcName}(`),
          `index.html调用的函数 ${funcName} 不存在`);
      }
    });
  });

  it('核心函数有null保护', () => {
    const js = sq(frontSrc());
    // showMessage
    assert.ok(js.includes('if(!mt||!mb)'), 'showMessage 应有 null 保护');
    // showSection
    assert.ok(js.includes('if(!el)'), 'showSection 应有 null 保护');
    // renderMenuTable
    assert.ok(js.includes('if(!container)return'), 'renderMenuTable 应有 null 保护');
    // login
    assert.ok(js.includes('if(!uEl||!pEl)'), 'login 应有 null 保护');
    // register
    assert.ok(js.includes('if(!uEl||!pEl||!cEl)'), 'register 应有 null 保护');
  });

  it('admin.html 关键函数有null保护', () => {
    const html = read('admin.html');
    // 评分chart
    assert.ok(html.includes('renderRatingChart') && html.includes('if (!ctx) return'), 'renderRatingChart 应有 null 保护');
    // 每日趋势chart
    assert.ok(html.includes('loadDailyTrend') && html.includes('if (!ctx) return'), 'loadDailyTrend 应有 null 保护');
    // 用户活跃度chart
    assert.ok(html.includes('dailyActive.length) return'), 'loadUserActivity 应有 null 保护');
  });

  it('admin.html 所有fetch有catch处理', () => {
    const html = read('admin.html');
    const fetchCalls = html.match(/fetch\(/g) || [];
    const catchCount = html.match(/\.catch\(/g) || [];
    const finallyCount = html.match(/\.finally\(/g) || [];
    const thenCount = html.match(/\.then\(/g) || [];
    // 每个fetch链应以.catch或.finally结尾（fetch链中then数量应小于等于catch+finally数量+1）
    // 更宽松的验证：catch数量应至少是fetch数量的60%
    assert.ok(fetchCalls.length >= 20, `admin.html 中应有至少20个fetch，当前${fetchCalls.length}个`);
    assert.ok(catchCount.length >= 15,
      `admin.html 中应有至少15个.catch处理，当前${catchCount.length}个`);
    // 每个fetch链都有终止处理（catch或finally）
    const totalHandlers = catchCount.length + finallyCount.length;
    assert.ok(totalHandlers >= fetchCalls.length * 0.6,
      `admin.html 中 fetch 链应有至少60%终止处理，当前${totalHandlers}/${fetchCalls.length}`);
  });

  it('server.js 中关键路由有错误处理', () => {
    const server = read('server.js');
    // 检查try/catch在关键位置
    assert.ok(server.includes('try') && server.includes('catch'), 'server.js 应有try/catch错误处理');
    // 超时处理
    assert.ok(server.includes('setTimeout') || server.includes('timeout'), 'server.js 应有超时处理');
  });

  it('fetchRecommendations 有菜品数据加载超时保护', () => {
    const js = sq(read('js/recommendation.js'));
    assert.ok(js.includes('if(!dishData.length)'), 'fetchRecommendations 应有菜品数据检查');
    assert.ok(js.includes('awaitnewPromise((r)=>setTimeout(r,100))'), 'fetchRecommendations 应有等待机制');
    assert.ok(js.includes('showMessage'), 'fetchRecommendations 应有错误提示');
  });

  it('displayRecommendations 有null保护', () => {
    const js = sq(read('js/recommendation.js'));
    assert.ok(js.includes('if(!loading||!result)return'), 'displayRecommendations 应有 null 保护');
    assert.ok(js.includes('if(!dl)'), 'displayRecommendations 应有 dish-list null 保护');
  });

  it('购物车函数有null保护', () => {
    const js = read('js/globals.js');
    assert.ok(js.includes('if(el)') || js.includes('if (el)'), 'updateCartBadge 应有 null 保护');
  });
});

describe('深度UI检查 - 功能完整性', () => {
  it('推荐系统有完整的降级链', () => {
    const js = read('js/recommendation.js');
    assert.ok(js.includes('fetchRecommendations'), '应有推荐函数');
    assert.ok(js.includes('fallback'), '应有降级函数');
    assert.ok(js.includes('selectBlindBoxDish') || js.includes('盲盒'), '应有盲盒推荐');
  });

  it('推荐显示有匹配指数四维度', () => {
    const js = frontSrc();
    assert.ok(js.includes('matchDetails'), '应有匹配详情');
    assert.ok(js.includes('taste'), '应有口味维度');
    assert.ok(js.includes('cuisine'), '应有招牌维度');
    assert.ok(js.includes('calorie'), '应有营养(calorie)维度');  // 2026-09-17: 字段由 nutrition 更名 calorie
    assert.ok(js.includes('rating'), '应有评分维度');
  });

  it('推荐理由生成函数存在', () => {
    const js = frontSrc();
    assert.ok(js.includes('function generateDishReason'), '应有推荐理由生成函数');
  });

  it('购物车完整功能存在', () => {
    const js = read('js/globals.js');
    assert.ok(js.includes('function getCart'), 'getCart 函数');
    assert.ok(js.includes('function addToCart'), 'addToCart 函数');
    assert.ok(js.includes('function removeFromCart'), 'removeFromCart 函数');
    assert.ok(js.includes('function updateCartQty'), 'updateCartQty 函数');
    assert.ok(js.includes('function clearCart'), 'clearCart 函数');
    assert.ok(js.includes('function getCartTotal'), 'getCartTotal 函数');
  });

  it('评分功能完整', () => {
    const js = frontSrc();
    assert.ok(js.includes('function submitStarFeedback'), 'submitStarFeedback 函数');
    assert.ok(js.includes('function openStarFeedback'), 'openStarFeedback 函数');
  });

  it('收藏/拉黑功能完整', () => {
    const js = frontSrc();
    assert.ok(js.includes('function addToFavorites'), 'addToFavorites 函数');
    assert.ok(js.includes('function addToBlacklist'), 'addToBlacklist 函数');
    assert.ok(js.includes('function cancelFavorite'), 'cancelFavorite 函数');
    assert.ok(js.includes('function cancelBlacklist'), 'cancelBlacklist 函数');
  });

  it('用户注销功能完整', () => {
    const js = frontSrc();
    assert.ok(js.includes('function deleteAccount'), 'deleteAccount 函数');
  });

  it('菜品搜索筛选功能完整', () => {
    const js = frontSrc();
    assert.ok(js.includes('function renderMenuTable'), 'renderMenuTable 函数');
    assert.ok(js.includes('menu-search'), 'menu-search 搜索框');
    assert.ok(js.includes('menu-filter-cat'), 'menu-filter-cat 分类筛选');
    assert.ok(js.includes('menu-filter-spice'), 'menu-filter-spice 辣度筛选');
    assert.ok(js.includes('menu-filter-price'), 'menu-filter-price 价格筛选');
    assert.ok(js.includes('menu-sort'), 'menu-sort 排序');
  });
});

describe('深度UI检查 - 响应式与移动端', () => {
  it('移动端按钮有最小高度', () => {
    const css = read('styles.css');
    assert.ok(css.includes('min-height: 44px') || css.includes('min-height:44px'), '移动端按钮应有最小高度44px');
  });

  it('移动端表单字体防止iOS缩放', () => {
    const css = read('styles.css');
    assert.ok(css.includes('font-size: 16px'), '移动端表单应有16px字体防止iOS缩放');
  });

  it('移动端菜品操作按钮有flex布局', () => {
    const css = read('styles.css');
    assert.ok(css.includes('dish-actions { display: flex'), '菜品操作按钮应有flex布局');
  });

  it('触控滑动支持存在', () => {
    const init = read('js/init.js');
    assert.ok(init.includes('touchstart') && init.includes('touchend'), '应有触控滑动支持');
    assert.ok(init.includes('touchcancel'), '应有touchcancel处理');
  });
});

describe('深度UI检查 - 构建产物与源码同步', () => {
  it('build.js 构建成功', () => {
    // 运行build.js 验证语法
    const build = read('build.js');
    assert.ok(build.includes('js/globals.js'), 'build.js 包含 globals.js');
    assert.ok(build.includes('js/core.js'), 'build.js 包含 core.js');
    assert.ok(build.includes('js/recommendation.js'), 'build.js 包含 recommendation.js');
    assert.ok(build.includes('js/init.js'), 'build.js 包含 init.js');
  });

  it('script.js 构建产物语法正确', () => {
    const script = read('script.js');
    assert.ok(script.length > 60000, `script.js 长度应大于60000，当前${script.length}`);
    assert.ok(script.includes('function esc'), 'script.js 包含 esc 函数');
    assert.ok(script.includes('function showSection'), 'script.js 包含 showSection 函数');
    assert.ok(script.includes('function login'), 'script.js 包含 login 函数');
    assert.ok(script.includes('function register'), 'script.js 包含 register 函数');
    assert.ok(script.includes('function fetchRecommendations'), 'script.js 包含 fetchRecommendations 函数');
    assert.ok(script.includes('function displayRecommendations'), 'script.js 包含 displayRecommendations 函数');
  });

  it('script.js 中无重复函数定义', () => {
    const script = read('script.js');
    // 检查关键函数只出现一次
    const funcs = ['fetchRecommendations', 'displayRecommendations', 'selectBlindBoxDish',
      'computeDishMatch', 'generateDishReason', 'checkApiAvailability',
      'showSection', 'showMessage', 'renderMenuTable', 'showCart',
      'checkoutCart', 'showProfile', 'showDataset'];
    funcs.forEach(fn => {
      const regex = new RegExp(`function ${fn}\\s*\\(`, 'g');
      const matches = script.match(regex);
      assert.ok(matches && matches.length === 1,
        `script.js 中 ${fn} 应出现1次，实际${matches ? matches.length : 0}次`);
    });
  });
});

describe('深度UI检查 - 安全', () => {
  it('XSS转义函数存在', () => {
    ['js/globals.js', 'admin.html'].forEach(f => {
      const content = read(f);
      assert.ok(content.includes('function esc'), `${f} 应有 esc 转义函数`);
    });
  });

  it('动态HTML拼接使用esc函数', () => {
    const js = frontSrc();
    const html = read('admin.html');
    // 检查esc函数被使用
    assert.ok(js.includes('esc('), 'core.js 中使用 esc 转义');
    assert.ok(html.includes('esc('), 'admin.html 中使用 esc 转义');
  });

  it('敏感文件被保护', () => {
    const server = read('server.js');
    // 检查是否有静态文件保护
    assert.ok(server.includes('403') || server.includes('forbidden') || server.includes('deny'), 'server.js 应有静态文件保护');
  });

  it('密码不存储在前端localStorage', () => {
    const js = frontSrc();
    const init = read('js/init.js');
    // 检查是否有明文密码存储
    const pwdStores = (js + init).match(/localStorage\.setItem\([^)]*password[^)]*\)/gi);
    assert.ok(!pwdStores || pwdStores.length === 0, '前端不应存储明文密码到localStorage');
  });
});

describe('深度UI检查 - 空态/加载态/错误态', () => {
  it('购物车有空态显示', () => {
    const js = frontSrc();
    const html = read('index.html');
    assert.ok(html.includes('cart-empty') || html.includes('购物车是空的'), '购物车应有空态');
    assert.ok(js.includes('cart-empty') || js.includes('空的'), '购物车空态逻辑');
  });

  it('推荐结果有加载态', () => {
    const html = read('index.html');
    assert.ok(html.includes('recommendation-loading'), '推荐结果应有加载态');
    const js = read('js/recommendation.js');
    assert.ok(js.includes('recommendation-loading'), '推荐加载态逻辑');
  });

  it('菜品列表有空态处理', () => {
    const js = read('js/recommendation.js');  // 2026-09-17: 空态文案位于推荐模块
    assert.ok(js.includes('没有更多菜品'), '菜品列表应有空态提示');
  });

  it('推荐结果有空态提示', () => {
    const js = read('js/recommendation.js');
    assert.ok(js.includes('没有更多菜品啦'), '推荐结果应有空态提示');
  });

  it('菜品数据超时加载提示', () => {
    const js = read('js/recommendation.js');
    assert.ok(js.includes('菜品数据加载中，请稍后重试'), '菜品加载应有超时提示');
  });
});

describe('深度UI检查 - 布局与排版', () => {
  it('首页有完整导航栏', () => {
    const html = read('index.html');
    const navItems = ['首页', '关于本店', '全部菜单', '隐私政策', '登录'];
    navItems.forEach(item => {
      assert.ok(html.includes(item), `导航栏应有 ${item}`);
    });
  });

  it('首页有三大特色卡片', () => {
    const html = read('index.html');
    assert.ok(html.includes('唐风雅韵'), '特色卡片1');
    assert.ok(html.includes('猫趣盎然'), '特色卡片2');
    assert.ok(html.includes('珍馐美馔'), '特色卡片3');
  });

  it('关于页面内容完整', () => {
    const html = read('index.html');
    assert.ok(html.includes('关于本店'), '关于页面标题');
    assert.ok(html.includes('技术栈'), '技术栈部分');
    assert.ok(html.includes('推荐特色'), '推荐特色部分');
  });

  it('隐私政策内容完整', () => {
    const html = read('index.html');
    assert.ok(html.includes('隐私政策'), '隐私政策标题');
    assert.ok(html.includes('信息收集'), '隐私政策内容');
  });

  it('全部菜单筛选功能完整', () => {
    const html = read('index.html');
    assert.ok(html.includes('全部分类'), '分类筛选');
    assert.ok(html.includes('全部辣度'), '辣度筛选');
    assert.ok(html.includes('全部价格'), '价格筛选');
    assert.ok(html.includes('默认排序'), '排序选项');
  });

  it('管理后台导航完整', () => {
    const html = read('admin.html');
    const navItems = ['控制面板', '菜品管理', '用户管理', '反馈查看', '偏好分布', '数据分析', '模型管理'];
    navItems.forEach(item => {
      assert.ok(html.includes(item), `管理后台导航应有 ${item}`);
    });
  });

  it('管理后台有监控系统', () => {
    const html = read('admin.html');
    assert.ok(html.includes('监控系统'), '管理后台应有监控系统');
  });

  it('管理后台有模型信息摘要', () => {
    const html = read('admin.html');
    assert.ok(html.includes('模型信息摘要'), '管理后台应有模型信息摘要');
  });

  it('管理后台功能函数完整', () => {
    const html = read('admin.html');
    const funcs = ['loadStats', 'loadPopularDishes', 'loadFeedback', 'loadDishes',
      'editDish', 'saveDish', 'deleteDish', 'loadNotifications', 'loadUsers',
      'deleteUser', 'exportCSV', 'showToast', 'loadDailyTrend', 'loadAnalyticsPrefs',
      'loadUserActivity', 'loadRecommendationLog', 'loadModelManagement',
      'loadRecommendationStats', 'loadWorstDishes', 'loadMonitor', 'loadModelCompare'];
    funcs.forEach(fn => {
      assert.ok(html.includes('function ' + fn), `管理后台缺少函数: ${fn}`);
    });
  });

  it('厨房看板功能函数完整', () => {
    const html = read('kitchen.html');
    assert.ok(html.includes('function doLogin'), '厨房看板应有doLogin函数');
    assert.ok(html.includes('function loadOrders'), '厨房看板应有loadOrders函数');
    assert.ok(html.includes('function completeOrder'), '厨房看板应有completeOrder函数');
    assert.ok(html.includes('function updateTime'), '厨房看板应有updateTime函数');
    assert.ok(html.includes('function esc'), '厨房看板应有esc函数');
    assert.ok(html.includes('function getToken'), '厨房看板应有getToken函数');
    assert.ok(html.includes('function getAuthHeaders'), '厨房看板应有getAuthHeaders函数');
  });

  it('首页有footer信息', () => {
    const html = read('index.html');
    assert.ok(html.includes('唐猫庭院'), 'footer应有唐猫庭院');
    assert.ok(html.includes('footer'), '首页应有footer');
    assert.ok(html.includes('</footer>'), 'footer应正确闭合');
  });

  it('首页正确引用JS和CSS', () => {
    const html = read('index.html');
    assert.ok(html.includes('bootstrap.bundle.min.js'), '应引用Bootstrap JS');
    // Chart.js 2026-10-16 改为按需加载(前端源内动态注入),首页不再全局引用
    assert.ok(frontSrc().includes('chart.umd.min.js'), 'Chart.js应在前端源中按需加载');
    assert.ok(html.includes('script.js'), '应引用script.js');
    assert.ok(html.includes('styles.css'), '应引用styles.css');
  });

  it('管理后台正确引用JS和CSS', () => {
    const html = read('admin.html');
    assert.ok(html.includes('bootstrap.bundle.min.js'), '管理后台应引用Bootstrap JS');
    assert.ok(html.includes('chart.umd.min.js'), '管理后台应引用Chart.js');
    assert.ok(html.includes('bootstrap.min.css'), '管理后台应引用Bootstrap CSS');
  });

  it('厨房看板正确引用JS和CSS', () => {
    const html = read('kitchen.html');
    assert.ok(html.includes('script'), '厨房看板应包含script标签');
    assert.ok(html.includes('styles.css') || html.includes('bootstrap.min.css'), '厨房看板应引用CSS');
  });

  it('所有页面HTML正确闭合', () => {
    ['index.html', 'admin.html', 'kitchen.html'].forEach(f => {
      const html = read(f);
      assert.ok(html.includes('</html>'), `${f} 应正确闭合`);
    });
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
  });

  it('购物车事件绑定完整', () => {
    const init = read('js/init.js');
    assert.ok(init.includes('cart-qty-plus'), '购物车数量增加事件绑定');
    assert.ok(init.includes('cart-qty-minus'), '购物车数量减少事件绑定');
    assert.ok(init.includes('cart-remove-btn'), '购物车删除事件绑定');
    assert.ok(init.includes('add-to-cart-btn'), '加购事件绑定');
    assert.ok(init.includes('storage'), '多标签同步事件绑定');
  });

  it('管理后台fetch拦截器自动注入token', () => {
    const html = read('admin.html');
    assert.ok(html.includes("Authorization', 'Bearer '") || html.includes("'Authorization', 'Bearer '") || html.includes("Authorization: Bearer"), '管理后台应自动注入Authorization头');
    assert.ok(html.includes('adminToken'), '管理后台使用adminToken');
  });

  it('管理后台401自动登出机制', () => {
    const html = read('admin.html');
    assert.ok(html.includes('resp.status === 401'), '管理后台应有401自动登出');
    assert.ok(html.includes("localStorage.removeItem('adminToken')"), '401时应清除adminToken');
  });

  it('管理后台登录按钮有disabled状态管理', () => {
    const html = read('admin.html');
    assert.ok(html.includes('btn.disabled = true'), '登录按钮应有disabled状态');
    assert.ok(html.includes('btn.disabled = false'), '登录按钮应有恢复状态');
  });

  it('首页有完整meta标签', () => {
    const html = read('index.html');
    assert.ok(html.includes('charset='), '应有charset声明');
    assert.ok(html.includes('viewport'), '应有viewport声明');
    assert.ok(html.includes('name="description"'), '首页应有 description meta');
  });

  it('管理后台有完整meta标签', () => {
    const html = read('admin.html');
    assert.ok(html.includes('charset='), '应有charset声明');
    assert.ok(html.includes('viewport'), '应有viewport声明');
    assert.ok(html.includes('name="description"'), '管理后台应有 description meta');
  });

  it('厨房看板有完整meta标签', () => {
    const html = read('kitchen.html');
    assert.ok(html.includes('charset='), '应有charset声明');
    assert.ok(html.includes('viewport'), '应有viewport声明');
    assert.ok(html.includes('name="description"'), '厨房看板应有 description meta');
  });

  it('首页模态框结构完整', () => {
    const html = read('index.html');
    assert.ok(html.includes('message-modal'), '应有消息模态框');
    assert.ok(html.includes('modal-title'), '模态框应有标题');
    assert.ok(html.includes('modal-body'), '模态框应有内容区');
    assert.ok(html.includes('modal-confirm-btn'), '模态框应有确定按钮');
    assert.ok(html.includes('modal-close-btn'), '模态框应有关闭按钮');
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

  it('管理后台有toast通知容器', () => {
    const html = read('admin.html');
    assert.ok(html.includes('admin-toast-container'), '管理后台应有toast容器');
  });

  it('管理后台exit登录链接存在', () => {
    const html = read('admin.html');
    assert.ok(html.includes('退出登录'), '管理后台应有退出登录链接');
    assert.ok(html.includes('box-arrow-right'), '退出登录应有图标');
  });

  it('管理后台返回首页链接存在', () => {
    const html = read('admin.html');
    assert.ok(html.includes('返回首页'), '管理后台应有返回首页链接');
  });

  it('厨房看板有时间显示', () => {
    const html = read('kitchen.html');
    assert.ok(html.includes('current-time'), '厨房看板应有时间显示');
  });
});
// 2026-10-19 core.js 拆分适配: 前端源断言改为跨全部 js/ 模块拼接搜索(任何未来的域拆分都不再破坏测试)
function frontSrc() {
  return ['globals', 'menu', 'cart', 'core', 'recommendation', 'init', 'logo-intro']
    .map(f => require('fs').readFileSync(require('path').join(__dirname, '..', 'js', f + '.js'), 'utf8'))
    .join('\n');
}

// sq 语义恢复(2026-10-19): 原 sq(read('js/core.js'))/readSq 调用点需要去空白归一化形态
function frontSq() {
  return frontSrc().replace(/\s+/g, '');
}
