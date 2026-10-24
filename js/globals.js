// ═══════════════ 全局变量与工具函数 ═══════════════
// 唐猫庭院 - 菜品推荐系统 v2.0
var currentUser = null,
  userProfile = null,
  currentRecommendations = [],
  recommendedIds = [];
var currentRecommendationMode = '本地计算';
var featureImportanceChart = null;
var decisionTreeModel = null,
  decisionTreeLoaded = false,
  decisionTreeLoading = false;
var apiAvailabilityCache = null,
  apiCacheTimestamp = 0;
var dishData = []; // 菜品数据，从API加载
// 客户端菜品准入：下架的与名称含「测试」的脏数据一律不进 dishData（防测试菜露出到菜单/推荐/盲盒）
function filterVisibleDishes(list) {
  return (list || []).filter((x) => x.is_active !== false && !(x.name || '').includes('测试'));
}
var starRatingDish = null,
  starRatingValue = 0,
  ratingReturnTo = 'recommendation-section'; // 全局评分状态
var _initialized = false;
// 页面初始查询串（showSection 的 pushState 会抹掉它，桌码解析需要提前捕获）
var __initialSearch = (typeof location !== 'undefined' && location.search) || '';
const API_CACHE_DURATION = 30000;

// ═══════════════ 本地存储键注册表（唯一登记处，2026-10-13） ═══════════════
// 新增键必须先在此注册（名称/用途/存储区/写入方）；历史模块仍用字面量，增量迁移为 STORE_KEYS.* 引用。
// 会话键（页面关闭即失效）标注 [SS]，其余为 localStorage 持久键。
const STORE_KEYS = {
  // —— 会话与身份 ——
  userToken: 'userToken', // 登录用户 JWT；登录/登出与带鉴权请求写入
  currentUser: 'currentUser', // 当前登录用户名
  users: 'users', // 客户端用户资料缓存（favorites/blacklist/preferences），与服务端双写
  // —— 点餐 ——
  cart: 'cart', // 购物车 [{id,name,price,qty,note?}]；加购/结算流程写入
  orderedDishes: 'orderedDishes', // 本桌已点菜品 id（重复点单提示用）
  lastOrderRounds: 'lastOrderRounds', // 最近订单轮次快照
  dishDataCache: 'dishDataCache', // 菜品全量缓存（二次进店加速，注意会滞后于 DB）
  // —— 偏好与界面 ——
  savedPrefs: 'savedPrefs', // 口味偏好已保存标记
  tasteFilled: 'tasteFilled', // 口味补全向导完成标记
  prefCompletenessDismissed: 'prefCompletenessDismissed', // 偏好补全横幅关闭标记
  darkMode: 'darkMode', // 'true'/'false'；缺省跟随系统
  menuLang: 'menuLang', // 'zh'/'en'
  datasetScrollY: 'datasetScrollY', // 离开菜单区时的滚动位置 [SS]
  // —— 品牌动效 ——
  logoIntroShown: 'logoIntroShown', // 开幕动画本会话已播标记 [SS]
};

// HTML 转义，防止 XSS
function esc(str) {
  if (typeof str !== 'string') {
    return str;
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// 价格格式化：数字 → "88元"，null/undefined → "未知"；英文模式 ¥88 / bowl
var UNIT_EN = {
  '/碗': '/bowl',
  '/份': '/portion',
  '/只': '/whole',
  '/瓶': '/bottle',
  '/听': '/can',
  '/杯': '/cup',
  '/个': '/pc',
  '/盒': '/box',
  '/壶': '/pot',
  '/盖碗': '/gaiwan',
  '/6只': '/6 pcs',
  '/6块': '/6 pcs',
  '/3碗': '/3 bowls',
  '/4个': '/4 pcs',
  '/支': '/stick',
  '/颗': '/pc',
  '/块': '/pc',
  '/笼': '/steamer',
  '/条': '/whole',
};
function formatPrice(d) {
  const p = d && typeof d === 'object' ? d.price : d;
  if (p === null || p === undefined || p === '') {
    return menuLang === 'en' ? 'Unknown' : '未知';
  }
  const unit = (d && d.price_unit) || '';
  // EN 货币符前置(¥6/pc,国际惯例);zh 沿用 6元
  return menuLang === 'en'
    ? '¥' + parseFloat(p).toFixed(0) + (unit ? UNIT_EN[unit] || unit : '')
    : parseFloat(p).toFixed(0) + '元' + (unit || '');
}
// 获取用户认证头
function authHeaders() {
  const t = localStorage.getItem(STORE_KEYS.userToken);
  return t ? { Authorization: 'Bearer ' + t } : {};
}
const DEFAULT_DISH_IMG =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23fdf6f0%22/%3E%3Ctext x=%2250%22 y=%2260%22 text-anchor=%22middle%22 font-size=%2236%22%3E🍜%3C/text%3E%3C/svg%3E';
function dishImg(url, size, alt) {
  size = size || 50;
  const u = url || '';
  const st = 'width:' + size + 'px;height:' + size + 'px;border-radius:6px;object-fit:cover;';
  const st2 =
    'width:' +
    size +
    'px;height:' +
    size +
    'px;display:inline-flex;align-items:center;justify-content:center;font-size:' +
    Math.round(size * 0.6) +
    'px;';
  if (u.startsWith('/uploads/') || u.startsWith('data:')) {
    return '<img src="' + esc(u) + '" style="' + st + '" alt="' + esc(alt || '') + '" loading="lazy">';
  }
  if (u) {
    return '<span style="' + st2 + '">' + esc(u) + '</span>';
  }
  return '<img src="' + DEFAULT_DISH_IMG + '" style="' + st + '" alt="' + esc(alt || '') + '" loading="lazy">';
}

// 订单/桌号状态存 sessionStorage（一次浏览会话内有效：跳走/刷新保留，关标签重开=新用餐自动干净）
function ssGet(k) {
  return sessionStorage.getItem(k);
}
function ssSet(k, v) {
  try {
    sessionStorage.setItem(k, v);
  } catch (e) {}
}
function ssRemove(k) {
  sessionStorage.removeItem(k);
}
function ssRemovePrefix(prefix) {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch (e) {}
}
// 安全 fetch 包装器：自动处理 401 登录过期和网络错误
function safeFetch(url, opts) {
  opts = opts || {};
  // 离线检测(2026-10-16): 断网时立即返回模拟响应,不发无效请求
  if (typeof navigator.onLine !== 'undefined' && !navigator.onLine) {
    return Promise.resolve(
      new Response(JSON.stringify({ success: false, error: L('网络未连接，请检查网络', 'No network connection') }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }
  // 超时(2026-10-16): GET 15s / 写操作 20s——防请求无限挂住(配合 AbortController)
  const timeoutMs = (opts.method || 'GET').toUpperCase() === 'GET' ? 15000 : 20000;
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, timeoutMs);
  opts.signal = controller.signal;

  const fetcher = opts.method ? fetch(url, opts) : typeof url === 'string' ? fetch(url, opts) : url;
  return fetcher
    .then((r) => {
      clearTimeout(timer);
      if (r.status === 401 && localStorage.getItem(STORE_KEYS.userToken)) {
        localStorage.removeItem(STORE_KEYS.userToken);
        localStorage.removeItem(STORE_KEYS.currentUser);
        showMessage('登录已过期', '请重新登录');
      }
      return r;
    })
    .catch((e) => {
      clearTimeout(timer);
      const msg =
        e.name === 'AbortError' ? L('请求超时', 'Request timeout') : L('网络请求失败', 'Network request failed');
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    });
}
// ═══════════════ 购物车功能 ═══════════════
function getCart() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEYS.cart) || '[]');
  } catch (e) {
    return [];
  }
}
function saveCart(c) {
  try {
    localStorage.setItem(STORE_KEYS.cart, JSON.stringify(c));
  } catch (e) {}
  if (typeof updateCartBadge === 'function') {
    updateCartBadge();
  }
}
function minQtyOf(dish) {
  if (!dish) {
    return 1;
  }
  // 起售备注可能在 serving 或 description 字段（历史数据不一致）；量词不限于"个"——后台自建菜可能写 2盒起/3杯起
  const src = (dish.serving || '') + ' ' + (dish.description || '');
  const m = src.match(/(\d+)\s*[个盒杯碗瓶只块份包袋听支罐]?起/);
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}
function addToCart(dish, qty) {
  const cart = getCart();
  const i = cart.findIndex((x) => x.id === dish.id);
  const min = minQtyOf(dish);
  const q = typeof qty === 'number' && qty > 0 ? qty : 1;
  // 一席成宴选饮品模式：饮品自动挂到当前席面（先记录，再入车，保证浮窗/横幅读到最新）
  const inDrinksMode =
    typeof tableDrinksMode !== 'undefined' &&
    tableDrinksMode !== null &&
    window.tableSets &&
    window.tableSets[tableDrinksMode] &&
    dish.category === '飲品与酒水';
  if (inDrinksMode) {
    const s = window.tableSets[tableDrinksMode];
    s.chosenDrinkIds = s.chosenDrinkIds || [];
    if (!s.chosenDrinkIds.includes(dish.id)) {
      s.chosenDrinkIds.push(dish.id);
    }
  }
  if (i >= 0) {
    cart[i].qty = (cart[i].qty || 1) + q;
    saveCart(cart);
    updateCartBadge();
  } else {
    // 起售数量：首次加入按最小起售量（如核桃包3个起、迷你肉夹馍2个起）
    const add = Math.max(q, min);
    cart.push({ id: dish.id, name: dish.name, price: dish.price, qty: add, image: dish.image_url || '' });
    saveCart(cart);
    updateCartBadge();
    if (add > q) {
      showMessage('已加入购物车', '「' + dish.name + '」' + min + '个起售，已加 ' + add + ' 个', null, 2500);
    } else {
      showMessage('已加入购物车', '「' + dish.name + '」已加入购物车', null, 2500);
    }
  }
  if (inDrinksMode) {
    const s = window.tableSets[tableDrinksMode];
    if (typeof recalcTableSetTotals === 'function') {
      recalcTableSetTotals(s);
    }
    if (typeof renderDrinksModeBanner === 'function') {
      renderDrinksModeBanner();
    }
  }
}
function addRiceToCart() {
  const rice = dishData.find((d) => d.name === '五常大米饭');
  if (rice) {
    addToCart(rice, 1);
    const btn = document.getElementById('add-rice-btn');
    if (btn) {
      const ci = getCart().find((c) => c.id === rice.id);
      const qty = ci ? ci.qty || 1 : 1;
      btn.innerHTML = '<i class="bi bi-check-circle me-1"></i>已加 ' + qty;
    }
  } else {
    showMessage('提示', '米饭数据未加载');
  }
}
function removeFromCart(id) {
  const cart = getCart().filter((x) => x.id !== id);
  saveCart(cart);
  updateCartBadge();
}
function updateCartQty(id, qty) {
  const cart = getCart();
  const i = cart.findIndex((x) => x.id === id);
  if (i < 0) {
    return;
  }
  if (qty <= 0) {
    cart.splice(i, 1);
    saveCart(cart);
    updateCartBadge();
    return;
  }
  // 起售数量保护：减到低于最小起售量时拦截（整件移除走 ✕ 删除按钮）
  const dish = dishData.find((d) => d.id === id);
  const min = minQtyOf(dish);
  if (qty < min) {
    showMessage('起售数量', '「' + (cart[i].name || '该菜品') + '」' + min + '个起售，数量不能低于 ' + min + ' 个');
    return;
  }
  cart[i].qty = qty;
  saveCart(cart);
  updateCartBadge();
}
function getCartCount() {
  return getCart().reduce((s, x) => s + (x.qty || 1), 0);
}
function getCartTotal() {
  return getCart().reduce((s, x) => s + parseFloat(x.price || 0) * (x.qty || 1), 0);
}
function clearCart() {
  saveCart([]);
  updateCartBadge();
}
function updateCartBadge() {
  const el = document.getElementById('cart-badge');
  if (el) {
    const c = getCartCount();
    el.textContent = c;
    el.style.display = c > 0 ? 'inline' : 'none';
  }
  updateFloatBar();
}
function updateFloatBar() {
  const bar = document.getElementById('float-cart-bar');
  if (!bar) {
    return;
  }
  const c = getCartCount();
  const onEnd = document.getElementById('end-section')?.classList.contains('active');
  const onCart = document.getElementById('cart-section')?.classList.contains('active');
  const onMenu = document.getElementById('dataset-section')?.classList.contains('active');
  if (c > 0 && !onEnd && !onCart) {
    bar.style.display = 'flex';
    document.getElementById('float-cart-count').textContent = c;
    document.getElementById('float-cart-total').textContent = getCartTotal();
    const unitEl = document.getElementById('float-cart-unit');
    if (unitEl) {
      unitEl.textContent = menuLang === 'en' ? 'items' : '件';
    }
    const fpre = document.getElementById('float-cart-pre');
    if (fpre) {
      fpre.textContent = menuLang === 'en' ? 'Total ' : '合计 ';
    }
    const fsuf = document.getElementById('float-cart-suf');
    if (fsuf) {
      fsuf.textContent = menuLang === 'en' ? '' : ' 元';
    }
    // 一席成宴选饮品模式：仅在菜单页可见时（选饮品现场）显示提示与返回席面按钮
    const drinksBack = document.getElementById('float-drinks-back');
    const dsEl = document.getElementById('dataset-section');
    const onMenu = dsEl ? getComputedStyle(dsEl).display !== 'none' : false;
    let hint = document.getElementById('float-drinks-hint');
    if (drinksBack) {
      const active =
        onMenu &&
        typeof tableDrinksMode !== 'undefined' &&
        tableDrinksMode !== null &&
        window.tableSets &&
        window.tableSets[tableDrinksMode];
      drinksBack.style.display = active ? 'inline-block' : 'none';
      if (active) {
        const s = window.tableSets[tableDrinksMode];
        const chosen = (s.chosenDrinkIds || [])
          .map(function (id) {
            return getCart().find(function (x) {
              return x.id === id;
            });
          })
          .filter(Boolean);
        if (!hint) {
          hint = document.createElement('div');
          hint.id = 'float-drinks-hint';
          hint.style.cssText =
            'font-size:0.85rem;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          bar.insertBefore(hint, bar.firstChild.nextSibling);
        }
        hint.style.display = active ? 'block' : 'none';
        hint.textContent = '🍹 正在为「' + s.style + '」选饮品 · 已选 ' + chosen.length + ' 件';
      } else if (hint) {
        hint.style.display = 'none';
      }
    }
  } else {
    bar.style.display = 'none';
  }
}

// ═══ 中英双语（C11）：菜名/分类/描述按语言显示，切换记忆在 localStorage ═══
var menuLang = localStorage.getItem(STORE_KEYS.menuLang) || 'zh';
var CAT_EN = {
  主食: 'Staples',
  招牌与游西安必打卡: 'Must-Try Signatures',
  热销菜品: 'Best Sellers',
  传承陕菜: 'Heritage Shaanxi',
  江湖海鲜: 'Jianghu Seafood',
  '田园时蔬·汤羹': 'Greens & Soups',
  特色凉菜: 'Signature Cold Dishes',
  陕西小吃: 'Shaanxi Snacks',
  飲品与酒水: 'Drinks & Wines',
  凉菜凉拌: 'Cold Dishes',
  汤粥糖水: 'Soups & Desserts',
  主食小吃: 'Staples & Snacks',
  甜品饮品: 'Desserts & Drinks',
  海鲜水产: 'Seafood',
  清爽素食: 'Light Vegetarian',
};
function dishNameOf(d) {
  if (menuLang === 'en' && d) {
    if (d.name_en) {
      return d.name_en;
    }
    const m = String(d.name || '').match(/^(.+)\(([^()]+)\)$/);
    if (m && d.name_en) {
      return d.name_en;
    }
  }
  return (d && d.name) || '';
}
function catNameOf(c) {
  return menuLang === 'en' && CAT_EN[c] ? CAT_EN[c] : c;
}
// ═══ UI 骨架 i18n（2026-10-07 用户反馈：切英文后首页/导航毫无变化，观感"没有用"）═══
// 覆盖导航/首页主按钮/桌号卡/菜单页头/弹窗标题；菜品数据面（菜名/描述/分类）原有逻辑不变
var UI_STR = {
  nav_home: ['首页', 'Home'],
  nav_about: ['关于本店', 'About Us'],
  nav_menu: ['全部菜单', 'Full Menu'],
  nav_privacy: ['隐私政策', 'Privacy'],
  nav_mine: ['我的', 'My Account'],
  nav_cart: ['我的购物车', 'My Cart'],
  home_start: ['开始点餐', 'Start Ordering'],
  home_ai: ['不知道吃什么？猫掌柜 AI 帮你选', 'Not sure? Ask the AI Butler'],
  home_table: ['人多点啥？一席成宴', 'Group? AI Table Feast'],
  home_continue: ['继续上次推荐', 'Continue Last Recommendations'],
  home_last: ['查看上次推荐', 'View Last Recommendations'],
  home_bill: ['本桌账单', 'Table Bill'],
  login: ['登录', 'Sign In'],
  register: ['注册', 'Register'],
  table_none: ['未选择桌号', 'No table yet'],
  table_pick: ['选择桌号', 'Pick a Table'],
  table_change: ['更换', 'Change'],
  menu_title: ['全部菜单', 'Full Menu'],
  back: ['返回', 'Back'],
  table_pick_title: ['请选择桌号', 'Pick a Table'],
};
var TAB_EN = {
  主食: 'Staples',
  招牌: 'Signature',
  热销: 'Hot',
  陕菜: 'Shaanxi',
  海鲜: 'Seafood',
  蔬羹: 'Greens',
  凉菜: 'Cold',
  小吃: 'Snacks',
  饮品: 'Drinks',
};
var SPICE_EN = { 不辣: 'Mild', 微辣: 'Mildly spicy', 中辣: 'Medium spicy', 重辣: 'Extra spicy' };
var SALT_EN = { 清淡: 'Light', 适中: 'Just right', 偏咸: 'Salty' };
var SWEET_EN = {
  无味: 'Neither',
  甜味: 'Sweet',
  酸味: 'Sour',
  酸甜: 'Sweet & sour',
  偏甜: 'Sweet-ish',
  偏酸: 'Sour-ish',
};
var CAL_EN = { 高: 'Hearty', 中: 'Medium', 低: 'Light', 适中: 'Medium', 未知: 'Unknown' };
// 规格数据级枚举（116 道菜固定值，DB serving/flavor 为中文）：英文模式渲染时转写，数据不动
var SPEC_EN = {
  '6颗': '6 pcs',
  '6个': '6 pcs',
  '6块': '6 pcs',
  '6支': '6 sticks',
  '6只': '6 pcs',
  '2个起': '2 min.',
  '3个起': '3 min.',
  '4个/笼': '4 per steamer',
  '150克': '150g',
  冰镇: 'Chilled',
  '常温/冰镇': 'Room temp / chilled',
  约250克净鱼: 'About 250g fish, cleaned',
  '鱿鱼、鱼肚、丸子': 'Squid, fish maw & meatballs',
  '菠萝味/橙味': 'Pineapple / orange',
  '脐橙汁/桃汁': 'Orange / peach juice',
  '310ml/听': '310ml can',
  '330ml/听': '330ml can',
  原味: 'Original',
  芥末味: 'Wasabi',
  壶: 'Pot',
  盖碗: 'Gaiwan',
};
function specLang(s) {
  if (menuLang !== 'en' || !s) {
    return s;
  }
  if (SPEC_EN[s]) {
    return SPEC_EN[s];
  }
  return s.replace(/^(\d+)年·(\d+m[lL])$/, '$1-yr · $2').replace(/^(\d+)年$/, '$1-yr');
}
var SUB_EN = {
  特调饮品: 'Signature Drinks',
  花酒天地: 'Flower Wines',
  茶饮: 'Tea',
  一醉千年: 'Millennium Spirits',
  葡萄酒: 'Wines',
  液体面包: 'Beers',
  缤纷饮品: 'Soft Drinks',
};
// 轮次标签是存进 sessionStorage 的中文数据，渲染时按语言转写（数据不动）
function roundLabelLang(s) {
  if (menuLang !== 'en' || !s) {
    return s;
  }
  return s
    .replace(/^第(\d+)轮点餐$/, 'Round $1')
    .replace(/^第(\d+)轮加菜$/, 'Round $1 · added')
    .replace(/^赠给 (\S+) 号桌$/, 'Gifted to Table $1');
}
// 服务端推荐理由模板 → 英文（reasonFor/table_recommend.js 与单菜推荐），尾缀"AI 匹配度 X%"保留数字
var REASON_EN = {
  '猫掌柜的招牌，来唐猫庭院必打卡': "The butler's check-in special at Tang Cat Courtyard",
  '猫掌柜的看家推荐，撑得住场面的招牌菜': "The butler's signature pick — a true centerpiece",
  '餐后甜口，席面收得漂亮': 'A sweet finish to close the feast',
  '主食收口，管饱又实惠': 'A filling staple, great value',
  '主食收口，分量正合适': 'A staple to round it off, just right',
  '陕味小吃，席面的烟火气': "Shaanxi snack — the feast's street-food soul",
  '时蔬汤羹，一桌荤素平衡全靠它': 'Greens & soup that balance the whole table',
  '开胃凉菜，清爽解腻': 'Appetizing cold dish, light and refreshing',
  '硬菜撑场，宴请倍儿有面子': 'A showstopper that honors the banquet',
  '一道硬菜，镇桌之选': 'A hearty dish, the anchor of the table',
  '猫掌柜点名的人气菜，闭眼点不踩雷': "Butler-approved favorite — you can't go wrong",
  猫掌柜依你的口味挑的家常热菜: 'Home-style hot dish picked for your taste',
  '本店人气招牌，最近大家都在点': 'House signature, trending lately',
  根据你的口味偏好为你推荐: 'Picked to match your taste profile',
  你的口味档案专属推荐: 'Chosen from your taste profile',
};
function reasonZhToEn(s) {
  if (!s) {
    return s;
  }
  if (REASON_EN[s]) {
    return REASON_EN[s];
  }
  // 带辣度拼接的模板：开胃凉菜，X爽口解腻 / 风味热菜，X过瘾下饭；及"模板，AI 匹配度 N%"尾缀
  const m = s.match(/^(开胃凉菜，|风味热菜，)(.+)(爽口解腻|过瘾下饭)$/);
  if (m) {
    return (
      (m[1] === '开胃凉菜，' ? 'Appetizing cold dish, ' : 'Flavorful hot dish, ') +
      (SPICE_EN[m[2]] || m[2]) +
      (m[3] === '爽口解腻' ? ' and refreshing' : ' — great with rice')
    );
  }
  const tail = s.match(/^(.*)，AI 匹配度 (\d+)%$/);
  if (tail && REASON_EN[tail[1]]) {
    return REASON_EN[tail[1]] + ', AI match ' + tail[2] + '%';
  }
  return s;
}
function uiText(key) {
  const v = UI_STR[key];
  return v ? (menuLang === 'en' ? v[1] : v[0]) : '';
}
// 参数化模板的行内双语助手(遍历式翻译只认整节点精确匹配,带插值的字符串须调用点自理)
function L(zh, en) {
  return menuLang === 'en' ? en : zh;
}
// ═══ 遍历式 UI 翻译：精确匹配文本节点（trim 后），en 替换并记忆原文，zh 还原 ═══
// 背景：data-i18n 只盖了骨架，筛选下拉/表单选项/按钮/动态渲染仍残留中文——用户实测"切了没变化"
var ZH_EN = {
  // 导航/通用
  首页: 'Home',
  关于本店: 'About Us',
  全部菜单: 'Full Menu',
  隐私政策: 'Privacy',
  跳转到主要内容: 'Skip to main content',
  我的: 'My Account',
  我的购物车: 'My Cart',
  登录: 'Sign In',
  注册: 'Register',
  返回: 'Back',
  关闭: 'Close',
  确定: 'OK',
  // ── 隐私政策(逐节点精确匹配) ──
  '一、信息收集': '1. Information We Collect',
  '唐猫庭院线上点餐与菜品推荐系统（下称"本系统"）在您使用过程中收集以下信息：':
    'The Tang Cat Courtyard online ordering and dish recommendation system (the "System") collects the following information during your use:',
  '1. 账户信息：您在注册时提供的用户名和加密后的密码':
    '1. Account info: the username and encrypted password you provide at registration',
  '2. 口味偏好：您设置的辣度、咸淡、甜酸、价位、过敏源等个性化偏好':
    '2. Taste preferences: your personalized settings such as spice level, saltiness, sweetness, price range and allergens',
  '3. 使用记录：您的订单信息、菜品评价反馈、推荐记录':
    '3. Usage records: your order information, dish ratings and feedback, and recommendation history',
  '4. 设备信息：浏览器类型、操作系统等基本访问日志':
    '4. Device info: basic access logs such as browser type and operating system',
  '二、信息使用': '2. How We Use Information',
  '1. 用于为您提供个性化菜品推荐服务': '1. To provide personalized dish recommendations',
  '2. 用于改进推荐算法和菜品质量': '2. To improve our recommendation algorithms and dish quality',
  '3. 用于优化系统性能和用户体验': '3. To optimize system performance and user experience',
  '三、信息安全': '3. Information Security',
  '您的密码使用 bcrypt 加密存储，绝不存储明文密码。所有敏感操作均通过 JWT 令牌认证，防止数据泄露。除法律要求外，本系统不会向任何第三方提供您的个人信息。':
    'Your password is stored hashed with bcrypt — plaintext passwords are never kept. All sensitive operations are authenticated with JWT tokens to prevent data leaks. Except where required by law, the System will never share your personal information with any third party.',
  '四、数据管理': '4. Data Management',
  '1. 您可在"我的"页面查看和修改个人偏好': '1. View and edit your preferences on the "My" page',
  '2. 您可随时注销账户，注销后您的个人数据将被清除':
    '2. Delete your account at any time — your personal data will be removed',
  '3. 您可导出个人数据（通过管理后台）': '3. Export your personal data (via the admin console)',
  '五、更新与联系': '5. Updates & Contact',
  '本系统可能不时更新隐私政策，更新后的政策将在本页面公布。如有疑问，请联系客服：029-8888-8888。':
    'This policy may be updated from time to time; updates will be published on this page. Questions? Contact us: 029-8888-8888.',
  '本政策最后更新日期：2026年8月8日': 'Last updated: August 8, 2026',
  订单号: 'Order #',
  '· 桌号': '· Table',
  '· 共': '· ',
  '件 · 合计': 'items · Total',
  '一席成宴 · 三套方案': 'A feast in three sets',
  重新配置: 'Reconfigure',
  加菜失败: 'Add-on failed',
  下单失败: 'Order failed',
  订单不存在或无权操作: 'Order not found or no permission',
  提示: 'Notice',
  取消: 'Cancel',
  '加载中...': 'Loading...',
  '正在提交订单...': 'Submitting your order...',
  展开导航菜单: 'Menu',
  // 桌号弹窗
  请选择桌号: 'Pick a Table',
  确认: 'Confirm',
  '🥡 打包带走': '🥡 Takeaway',
  // 菜单页
  '浏览本店全部菜品，共': 'Browse our full menu —',
  '道。': 'dishes.',
  重置: 'Reset',
  '＋ 加入': '+ Add',
  加入: 'Add',
  查看详情: 'View details',
  售罄: 'Sold out',
  补货: 'Restock',
  全部分类: 'All categories',
  全部辣度: 'All spice levels',
  全部价格: 'All prices',
  默认排序: 'Default order',
  按人气: 'By popularity',
  按评分: 'By rating',
  价格从低到高: 'Price: low to high',
  价格从高到低: 'Price: high to low',
  不辣: 'Mild',
  微辣: 'Mildly spicy',
  中辣: 'Medium spicy',
  重辣: 'Extra spicy',
  '20元以下': 'Under ¥20',
  '20-40元': '¥20–40',
  '40-60元': '¥40–60',
  '60元以上': 'Over ¥60',
  主食: 'Staples',
  招牌与游西安必打卡: 'Must-Try Signatures',
  热销菜品: 'Best Sellers',
  传承陕菜: 'Heritage Shaanxi',
  江湖海鲜: 'Jianghu Seafood',
  '田园时蔬·汤羹': 'Greens & Soups',
  特色凉菜: 'Signature Cold Dishes',
  陕西小吃: 'Shaanxi Snacks',
  飲品与酒水: 'Drinks & Wines',
  // 一席成宴表单
  '猫掌柜 · 一席成宴': 'Butler AI · Table Feast',
  壹用餐人数: '1. Party size',
  '贰人均预算 ': '2. Budget per guest ',
  '（含每人一碗米饭）': '(incl. a bowl of rice)',
  叁辣度偏好: '3. Spice level',
  肆咸淡偏好: '4. Saltiness',
  伍甜酸偏好: '5. Sweet & sour',
  陆热量偏好: '6. Calories',
  柒饮食要求: '7. Dietary',
  '捌忌口（过敏源）': '8. Allergies',
  无所谓: 'No preference',
  清淡: 'Light',
  适中: 'Just right',
  偏咸: 'Saltier',
  无味: 'Neither',
  甜味: 'Sweet',
  酸味: 'Sour',
  酸甜: 'Sweet & sour',
  不限: 'Any',
  低卡: 'Light',
  高能量: 'Hearty',
  无特殊要求: 'No restrictions',
  素食: 'Vegetarian',
  清真: 'Halal',
  无: 'None',
  海鲜: 'Seafood',
  花生: 'Peanuts',
  鸡蛋: 'Eggs',
  大豆: 'Soy',
  麸质: 'Gluten',
  '避开最近吃过的菜（7 天内点过的不再推荐）': 'Avoid dishes I ordered recently (within 7 days)',
  '生成席面 · 三套方案': 'Generate · 3 Set Menus',
  返回首页: 'Back to Home',
  '1 人': '1 guest',
  '2 人': '2 guests',
  '3 人': '3 guests',
  '4 人': '4 guests',
  '5 人': '5 guests',
  '6 人': '6 guests',
  '7 人': '7 guests',
  '8 人': '8 guests',
  '9 人': '9 guests',
  '10 人': '10 guests',
  '11 人': '11 guests',
  '12 人': '12 guests',
  '13 人': '13 guests',
  '14 人': '14 guests',
  '15 人': '15 guests',
  '16 人': '16 guests',
  '17 人': '17 guests',
  '18 人': '18 guests',
  '19 人': '19 guests',
  '20 人': '20 guests',
  '20-29 元': '¥20–29',
  '30-39 元': '¥30–39',
  '40-49 元': '¥40–49',
  '50-59 元': '¥50–59',
  '60-69 元': '¥60–69',
  '70-79 元': '¥70–79',
  '80-89 元': '¥80–89',
  '90-99 元': '¥90–99',
  '100-109 元': '¥100–109',
  '110-119 元': '¥110–119',
  '120-129 元': '¥120–129',
  '130-139 元': '¥130–139',
  '140-149 元': '¥140–149',
  '150 元以上': '¥150+',
  // 三套卡与理由（server 模板，渲染后经遍历器命中）
  家常版: 'Home-style',
  宴请版: 'Banquet',
  打卡版: 'Check-in',
  去选饮品: 'Drinks',
  生成分享图: 'Share Image',
  分享图: 'Share Image',
  整体加购: 'Add All',
  换一道: 'Swap',
  单点加购: 'Add',
  减少: '−',
  增加: '+',
  '猫掌柜的招牌，来唐猫庭院必打卡': "The butler's check-in special",
  '猫掌柜的看家推荐，撑得住场面的招牌菜': "The butler's signature pick — a true centerpiece",
  '餐后甜口，席面收得漂亮': 'A sweet finish to close the feast',
  '主食收口，管饱又实惠': 'A filling staple, great value',
  '主食收口，分量正合适': 'A staple to round it off, just right',
  '陕味小吃，席面的烟火气': 'Shaanxi snack — the soul of the feast',
  '时蔬汤羹，一桌荤素平衡全靠它': 'Greens & soup that balance the whole table',
  '开胃凉菜，清爽解腻': 'Appetizing cold dish, light and refreshing',
  '硬菜撑场，宴请倍儿有面子': 'A showstopper that honors the banquet',
  '一道硬菜，镇桌之选': 'A hearty dish, the anchor of the table',
  '猫掌柜点名的人气菜，闭眼点不踩雷': "Butler-approved favorite — you can't go wrong",
  猫掌柜依你的口味挑的家常热菜: 'Home-style hot dish picked for your taste',
  // 推荐页
  为您推荐: 'Recommended for You',
  推荐菜品: 'Recommended Dishes',
  '猫掌柜正在后厨为你挑选...': 'The butler is picking dishes for you...',
  换一批: 'Refresh',
  选好了: 'Done',
  退出: 'Exit',
  加一碗米饭: 'Add a bowl of rice',
  饮料酒水: 'Drinks',
  搭配更尽兴: 'Better together',
  操作: 'Actions',
  收藏: 'Favorite',
  已收藏: 'Favorited',
  拉黑: 'Block',
  已拉黑: 'Blocked',
  评分: 'Rate',
  匹配度: 'Match',
  试试手气: 'Try your luck',
  盲盒: 'Blind box',
  '本店人气招牌，最近大家都在点': 'House signature, trending lately',
  '去补全 →': 'Complete them →',
  换口味: 'Change taste',
  // 购物车
  菜品: 'Dish',
  数量: 'Qty',
  单价: 'Price',
  小计: 'Subtotal',
  去结算: 'Checkout',
  清空: 'Clear',
  '合计：': 'Total:',
  购物车是空的: 'Your cart is empty',
  去推荐菜品页面添加你喜欢的菜吧: 'Open recommendations to add dishes',
  待加菜: 'To add',
  查看订单: 'View order',
  已下单: 'Ordered',
  '✕ 关闭': '✕ Close',
  // 完成页
  点餐完成: 'Order Placed',
  '菜品已记录，厨房正在为您准备': 'Recorded — the kitchen is on it',
  本次点餐: 'This order',
  下单成功: 'Placed',
  当前轮: 'current',
  本轮推荐: 'This round',
  '本轮未启用 AI — 普通点餐，无推荐分析': 'AI off this round — plain order, no match stats',
  模型评估: 'Model quality',
  决定系数: 'R² score',
  均方误差: 'MSE',
  均方根误差: 'RMSE',
  平均绝对误差: 'MAE',
  '对这次推荐满意吗？': 'How were the picks?',
  点击选择满意度: 'Tap to rate',
  提交评价: 'Submit',
  影响推荐的关键因素: 'What shaped this',
  '加菜 / 继续点餐': 'Add more',
  重新点餐: 'Start over',
  '结束用餐，退出': 'Finish & exit',
  // 个人中心
  '最后登录：': 'Last sign-in:',
  最近推荐记录: 'Recent recommendations',
  还没有推荐记录: 'No recommendations yet',
  收藏菜品: 'Favorites',
  还没有收藏的菜品: 'No favorites yet',
  取消收藏: 'Unfavorite',
  拉黑的菜品: 'Blocked dishes',
  还没有拉黑的菜品: 'No blocked dishes',
  退出登录: 'Sign out',
  注销账号: 'Delete account',
  再来一单: 'Reorder',
  '● 辣度': '● Spice level',
  '◆ 咸淡': '◆ Saltiness',
  '● 甜酸': '● Sweet & sour',
  '● 预算': '● Budget',
  '◆ 热量': '◆ Calories',
  当前推荐模式: 'Current algorithm',
  盲盒推荐模式: 'Blind-box mode',
  '智能选（按偏好加权）': 'Smart (taste-weighted)',
  '纯随机（惊喜盲盒）': 'Pure random (surprise blind box)',
  '智能选更贴合口味，纯随机更有惊喜': 'Smart matches your taste; pure random adds surprise',
  桌号: 'Table No.',
  我的收藏: 'My Favorites',
  本轮加菜: 'Added this round',
  本轮平均匹配度: 'Avg match this round',
  '基于当前推荐批次，非累计': 'This batch only, not cumulative',
  本轮最高匹配度: 'Best match this round',
  模型精度: 'Model accuracy',
  评价菜品: 'Rate dishes',
  点击星星评分: 'Tap stars to rate',
  我的口味: 'My taste',
  未设置: 'Not set',
  口味偏好: 'Taste preferences',
  辣度: 'Spice level',
  咸淡: 'Saltiness',
  甜酸: 'Sweetness',
  '价位、忌口与饮食要求': 'Budget, allergies & dietary',
  预算: 'Budget',
  '经济（20元以下）': 'Value (under ¥20)',
  '适中（20-50元）': 'Mid-range (¥20–50)',
  '品质（50元以上）': 'Premium (over ¥50)',
  热量偏好: 'Calorie preference',
  过敏源: 'Allergens',
  推荐设置: 'Quick setup',
  '（2-20字符）': '(2–20 chars)',
  '（8-20 位，须含大小写字母和数字）': '(8–20 chars, with upper & lower case and digits)',
  '掌柜懂菜，更懂你 · 报上人数即成宴': 'The butler knows dishes — just tell us your party size',
  '猫掌柜正在为您设席 · 凉热荤素配平中': 'Setting your feast · balancing dishes',
  五常大米饭: 'Wuchang Steamed Rice',
  人均预算: 'Budget per guest',
  辣度偏好: 'Spice preference',
  咸淡偏好: 'Saltiness preference',
  甜酸偏好: 'Sweet-sour preference',
  '忌口（过敏源）': 'Allergies',
  用餐人数: 'Party size',
  '围炉设席，最忌众口难调——报上人数与预算，AI 为您配好三套席面':
    'Gathering around the table? Tell us your party size and budget — the AI will set three menus for you.',
  饮食要求: 'Dietary requirements',
  推荐模式: 'Algorithm',
  '自动选择（优先API）': 'Auto (API first)',
  '后端API推荐（更智能）': 'Backend API (smarter)',
  '本地推荐（更快速）': 'Local rules (faster)',
  选择推荐算法模式: 'Choose algorithm',
  显示当前使用的推荐算法: 'Shows the active algorithm',
  '🍽️ 点餐完成': '🍽️ Order Placed',
  '3元/碗': '¥3/bowl',
  '当前使用：': 'Currently using: ',
  本桌账单: 'Table Bill',
  查看上次推荐: 'View Last Recommendations',
  继续上次推荐: 'Continue Last Recommendations',
  // 登录/注册
  用户名: 'Username',
  密码: 'Password',
  确认密码: 'Confirm password',
  显示密码: 'Show',
  隐藏密码: 'Hide',
  '还没有账号？': 'No account yet?',
  去注册: 'Register',
  '已有账号？': 'Have an account?',
  去登录: 'Sign in',
  我已阅读并同意: 'I have read and agreed to the',
  '《隐私政策》': 'Privacy Policy',
  // 品牌面（2026-10-07 用户拍板：品牌资产也要翻——意译保唐韵，不逐字；品牌名保留中文为主）
  '— 唐风雅韵 · 猫趣悠然 —': '— Tang Elegance · Feline Charm —',
  唐风雅韵: 'Tang Elegance',
  '梦回大唐 · 品味长安': "Dream of the Tang, Taste of Chang'an",
  猫趣盎然: 'Playful Cats',
  '灵猫相伴 · 妙趣横生': 'Charming cats, delightful bites',
  珍馐美馔: 'Imperial Delicacies',
  '宫廷御膳 · 匠心呈现': 'Royal recipes, modern craft',
  '唐猫庭院 · 千年陕菜': 'Tang Cat Courtyard · A Thousand Years of Shaanxi Flavor',
  本地人的待客小宴: "A local's table for honored guests",
  '唐风雅韵，猫趣悠然': 'Tang Elegance, Feline Charm',
  '唐猫庭院，从网红店到本地头牌，十桌老顾客，八桌本地人。感谢一面之缘的外地新朋，更感谢每周光顾的本地老友。':
    'From internet sensation to local favorite — at any table, eight of ten are regulars. A warm welcome to first-time visitors from afar, and deeper thanks to the locals who dine with us every week.',
  '7年砥砺奋进，已成长为本地人日常待客、宴请、聚餐、约会的优选餐厅。是名副其实的':
    'Seven years on, we have become the local first choice for everyday hosting, banquets, gatherings and dates — a true ',
  '本地头牌·待客小宴': 'local icon and host of intimate feasts',
  '——"本地人的待客小宴"。': ' — "the locals\' table for honored guests."',
  '✨ 推荐特色': "✨ What We're Known For",
  大众点评收藏打卡关注门店送小挂件或冰峰: 'Follow & check in on Dianping for a free souvenir or Bingfeng soda',
  '🏆 荣誉': '🏆 Honors',
  '🍳 西安名厨精英大赛团体金奖': "🍳 Team Gold Award, Xi'an Master Chefs Competition",
  '📺 CCTV上榜品牌': '📺 Featured on CCTV',
  '🌟 粉丝千万级明星餐厅': '🌟 Star restaurant with 10M+ followers',
  '🥇 大众点评·美团 陕菜榜 N.1': '🥇 #1 Shaanxi Cuisine on Dianping & Meituan rankings',
  '🤝 四大服务承诺': '🤝 Our Four Service Promises',
  '① 上错菜品免费赠送': "① Wrong dish served? It's free",
  '② 菜品有问题直接退换': '② Any issue — return or replace, no questions',
  '③ 超30分钟菜未上齐，全单享9折优惠': '③ Order not complete in 30 min? 10% off the bill',
  '④ 打包菜品免打包费': '④ Free takeaway packing',
  '📍 门店信息': '📍 Locations',
  '🏆 招牌必打卡：唐猫酸汤锅子鱼、葫芦鸡、唐僧望塔酥、大唐妃子笑':
    '🏆 Must-try signatures: Tang Cat Sour Soup Fish, Gourd Crispy Chicken, Monk Pagoda Pastry, Imperial Concubine Smile',
  '🧠 智能推荐：根据口味偏好推荐菜品（梯度提升模型）':
    '🧠 Smart recommendations tuned to your taste (gradient-boosting model)',
  '👤 个性化定制：辣度、咸淡、甜酸随心选': '👤 Personalize spice, saltiness and sweet-sour to taste',
  '🏮 唐风体验：梦回大唐，品味长安': "🏮 Tang-dynasty dining: dream of the Tang, taste of Chang'an",
  技术栈: 'Tech Stack',
  前端: 'Frontend',
  后端: 'Backend',
  机器学习: 'Machine Learning',
};
var PH_EN = {
  '搜索菜品名称...': 'Search dishes...',
  搜索菜品名称: 'Search dishes',
  选择桌号: 'Pick a table',
  桌号: 'Table No.',
  '备注：少辣/不要香菜…': 'e.g. less spicy / no cilantro…',
};
function applyUiLang() {
  // ① data-i18n 声明式（骨架）
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = UI_STR[el.getAttribute('data-i18n')];
    if (!v) {
      return;
    }
    const target = menuLang === 'en' ? v[1] : v[0];
    let replaced = false;
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3 && n.textContent.trim()) {
        n.textContent = target;
        replaced = true;
      }
    });
    if (!replaced && !el.children.length) {
      el.textContent = target;
    }
  });
  const t = document.getElementById('lang-toggle-text');
  if (t) {
    t.textContent = menuLang === 'zh' ? 'EN' : '中';
  }
  // a11y: aria-label 需包含可见文本(EN/中),否则 Lighthouse label-content-name-mismatch(2026-10-19)
  const lt = document.getElementById('lang-toggle');
  if (lt) {
    lt.setAttribute(
      'aria-label',
      menuLang === 'zh' ? '切换到英文 Switch to English EN' : '切换到中文 Switch to Chinese 中'
    );
  }
  if (typeof updateTableStatusCard === 'function') {
    updateTableStatusCard();
  }
  if (typeof syncPageTitle === 'function') {
    syncPageTitle();
  } // 浏览器标签页标题随语言切换(2026-10-19 EN残留修复)
  if (typeof window.renderCartLangAware === 'function') {
    window.renderCartLangAware();
  } // 购物车参数化横幅/回执头(遍历式翻译够不着的模板)
  if (typeof updateCartBadge === 'function') {
    updateCartBadge();
  } // 悬浮条单位/合计标签
  // ② 遍历式：en 全页面扫描翻译；zh 只还原已翻译清单（免全文档扫描——中文模式每次按键渲染都会触发本函数）
  if (menuLang !== 'en') {
    __zhTranslated.forEach((n) => {
      if (n.__zhOrig !== undefined) {
        n.textContent = n.__zhOrig;
        delete n.__zhOrig;
      }
    });
    __zhTranslated = [];
    // 元素级翻译的还原（菜单筛选控件——option 文本不走路径②的文本节点清单）
    __zhElTranslated.forEach((el) => {
      if (el.__zhOrigEl !== undefined) {
        el.textContent = el.__zhOrigEl;
        delete el.__zhOrigEl;
      }
    });
    __zhElTranslated = [];
    document.querySelectorAll('input[data-zh-ph], textarea[data-zh-ph]').forEach((el) => {
      el.placeholder = el.getAttribute('data-zh-ph');
      el.removeAttribute('data-zh-ph');
    });
  } else {
    // ②-b 菜单筛选控件显式翻译：这些 option/按钮会被动态重渲染，文本节点不保证在路径②扫描时机内
    // （EN 模式曾出现 "All categories" 与 "全部辣度/默认排序" 中英混排）
    [
      'menu-filter-cat',
      'menu-filter-spice',
      'menu-filter-price',
      'menu-sort',
      'menu-reset-filter',
      'menu-search',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) {
        return;
      }
      if (el.tagName === 'INPUT') {
        // 搜索框 placeholder：重渲染后路径③的时机同样不保证，这里按 PH_EN 兜底
        // （placeholder 可能带 emoji 前缀，用包含式命中替换）
        if (el.placeholder) {
          const hit = Object.keys(PH_EN).find((k) => el.placeholder.indexOf(k) >= 0);
          if (hit) {
            if (el.dataset.zhPh === undefined) {
              el.setAttribute('data-zh-ph', el.placeholder);
            }
            el.placeholder = el.placeholder.replace(hit, PH_EN[hit]);
          }
        }
        return;
      }
      const texts = el.tagName === 'SELECT' ? Array.from(el.options) : [el];
      texts.forEach((o) => {
        const key = (o.textContent || '').trim();
        const en = ZH_EN[key];
        if (en) {
          if (o.__zhOrigEl === undefined) {
            o.__zhOrigEl = o.textContent;
          }
          o.textContent = en;
          if (__zhElTranslated.indexOf(o) < 0) {
            __zhElTranslated.push(o);
          }
        }
      });
    });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    nodes.forEach((n) => {
      const raw = n.textContent;
      if (!raw || !raw.trim()) {
        return;
      }
      if (n.__zhOrig === undefined) {
        const key = raw.trim();
        if (ZH_EN[key]) {
          n.__zhOrig = raw;
          __zhTranslated.push(n);
          n.textContent = raw.replace(key, ZH_EN[key]);
        }
      }
    });
  }
  // ③ placeholder
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((el) => {
    if (menuLang === 'en') {
      if (PH_EN[el.placeholder]) {
        if (el.dataset.zhPh === undefined) {
          el.setAttribute('data-zh-ph', el.placeholder);
        }
        el.placeholder = PH_EN[el.placeholder];
      }
    } else if (el.dataset && el.dataset.zhPh !== undefined) {
      el.placeholder = el.dataset.zhPh;
      el.removeAttribute('data-zh-ph');
    }
  });
  // ④ 地址行：中英并列（不替换——老外要英文认路，打车师傅要中文）；页脚与关于本店一致
  document.querySelectorAll('footer p, #about-section li, #about-section p').forEach((p) => {
    const isAddr = /大唐不夜城店|赛格店/.test(p.textContent);
    if (menuLang === 'en') {
      if (isAddr && !p.querySelector('.addr-en')) {
        const en = document.createElement('span');
        en.className = 'addr-en';
        en.style.cssText = 'display:block;font-size:0.78rem;color:#b8a88f;';
        en.textContent = /大唐不夜城店/.test(p.textContent)
          ? 'Grand Tang Mall Branch: Bldg 13-1, SE corner of Giant Wild Goose Pagoda South Plaza · Tel 19991210572'
          : "SAGA Int'l Mall Branch: 12F, Xiaozhai SAGA International · Tel 19829809735";
        p.appendChild(en);
      }
    } else {
      p.querySelectorAll('.addr-en').forEach((x) => x.remove());
    }
  });
}
var __zhTranslated = [];
var __zhElTranslated = []; // 菜单筛选控件等元素级翻译清单（option 文本不走路径②）
var _uiLangApplying = false,
  _uiLangPending = false;
function applyUiLangGuarded() {
  if (_uiLangApplying) {
    _uiLangPending = true;
    return;
  } // 锁内来的请求不丢弃, 解锁后补跑一轮
  _uiLangApplying = true;
  try {
    applyUiLang();
  } finally {
    setTimeout(() => {
      _uiLangApplying = false;
      if (_uiLangPending) {
        _uiLangPending = false;
        applyUiLangGuarded();
      }
    }, 60);
  }
}
function toggleMenuLang() {
  menuLang = menuLang === 'zh' ? 'en' : 'zh';
  localStorage.setItem(STORE_KEYS.menuLang, menuLang);
  applyUiLang();
  const sec = document.querySelector('.section.active');
  if (!sec) {
    return;
  }
  if (sec.id === 'dataset-section') {
    const tb = document.getElementById('category-tabs');
    if (tb) {
      delete tb.dataset.cats;
    }
    if (typeof buildCategoryUI === 'function') {
      buildCategoryUI();
    }
    renderMenuTable();
  } else if (sec.id === 'recommendation-section') {
    if (typeof displayRecommendations === 'function') {
      displayRecommendations();
    }
  } else if (sec.id === 'table-result-section') {
    if (typeof renderTableSets === 'function') {
      renderTableSets();
    }
  } else if (sec.id === 'cart-section') {
    if (typeof showCart === 'function') {
      showCart();
    }
  } else if (sec.id === 'profile-section') {
    if (typeof showProfile === 'function') {
      showProfile();
    }
  } else if (sec.id === 'home-section') {
    showSection('home-section');
  }
}
