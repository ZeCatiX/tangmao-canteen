// 唐猫庭院 - 前端回归契约（源码级）
// 背景: 2026-10-06 真机点击回归发现 3 个前端缺陷, 均发生在无自动化覆盖的 DOM 行为上:
//   BUG-1 选桌后 AI 入口硬编码跳偏好表单, 绕过 B7 冷启动热门推荐
//   BUG-2 厨房"完成"二次确认状态挂在按钮节点上, 被 10 秒轮询重渲染静默重置
//   BUG-3 购物车菜名不随英文菜单切换(用快照名, 没走 dishNameOf)
// 这三处行为 HTTP 层测不到; 此文件用源码契约锁定修复点, 防止将来改回去。
// 行为级验证由部署后的真机点击冒烟承担(见会话记录)。
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
// 改造1 后 js/ 源码经 prettier 格式化,历史紧凑断言串需空白归一化后比较
const sq = (s) => String(s).replace(/\s+/g, '');
// ZH_EN 词典键有带引号/不带引号两种书写形态,断言需双形态兼容
const hasDictKey = (g, k) => g.includes("'" + k + "':") || new RegExp('^\\s*' + k + ':', 'm').test(g);

test('回归-BUG1: 选桌后AI入口走 openAIRecommend 冷启动判定, 不再硬编码跳偏好表单', () => {
  const core = frontSrc();
  assert.ok(core.includes('function openAIRecommend()'), 'core.js 必须定义唯一判定源 openAIRecommend');
  // openAIRecommend 内部必须包含冷启动判定(偏好已填→偏好表单, 否则热门Top6)
  const fnStart = core.indexOf('function openAIRecommend()');
  const fnBody = core.slice(fnStart, core.indexOf('}', core.indexOf('coldStartHotRecommend', fnStart)) + 1);
  assert.ok(fnBody.includes('coldStartHotRecommend'), 'openAIRecommend 必须含冷启动分支');
  assert.ok(fnBody.includes("showSection('preference-section')"), 'openAIRecommend 必须含偏好表单分支');
  // 选桌后续路由的 ai 分支必须走判定源, 不允许硬编码
  const pick = sq(core.slice(core.indexOf('function applyTableChoice'), core.indexOf('function showTableBill')));
  assert.ok(pick.includes("intent==='ai')openAIRecommend()"), 'applyTableChoice 的 ai 分支必须调 openAIRecommend');
  assert.ok(!pick.includes("intent==='ai')showSection('preference-section')"), 'ai 分支禁止硬编码跳偏好表单(会绕过冷启动)');
  // 首页按钮 handler 也走同一判定源
  const init = read('js/init.js');
  assert.ok(/ai-recommend-btn[\s\S]*?openAIRecommend\(\)/.test(sq(init)), '首页 AI 按钮必须调 openAIRecommend');
});

test('回归-BUG2: 厨房完成按钮的二次确认状态按订单id记录, 重渲染后可恢复', () => {
  const kit = read('kitchen.html');
  assert.ok(kit.includes('var _armedCompletes'), '确认状态必须存在订单id级映射里');
  assert.ok(kit.includes('_armedCompletes[o.id]'), 'cardOf 渲染时必须按订单id恢复确认态按钮(轮询重渲染不打断确认)');
  assert.ok(!/btn\.dataset\.armed/.test(kit), '禁止再把确认状态挂在按钮节点属性上(会被 innerHTML 重建清掉)');
});

test('回归-看板稳定: 订单数据无变化时跳过整表重建(不重绘/不打断交互)', () => {
  const kit = read('kitchen.html');
  assert.ok(kit.includes('var _lastRenderSig'), '必须有渲染签名变量');
  assert.ok(kit.includes('renderSig === _lastRenderSig'), '数据未变化必须 early return 跳过 innerHTML 重建');
  // 签名检查必须在新单响铃之后（不能因为跳过重绘而漏掉新单提示音）
  const sigPos = kit.indexOf('renderSig === _lastRenderSig');
  const beepPos = kit.indexOf('beepNewOrders');
  assert.ok(beepPos > -1 && beepPos < sigPos, '响铃判定必须在渲染签名检查之前执行');
});

test('回归-BUG3: 购物车行菜名走 dishNameOf(随英文菜单切换)', () => {
  const core = sq(frontSrc());
  assert.ok(core.includes('constname=dish?esc(dishNameOf(dish)):esc(x.name)'), 'showCart 行名必须优先 dishNameOf(dish), 仅无匹配菜品时回退快照名');
});

// ═══ 备注保存三重防线（2026-10-07 内置浏览器实测发现备注静默丢失）═══
// 背景: 备注原只靠 change(失焦)事件保存, 自动填充/移动键盘收起等不触发 blur 的路径
//       会让备注静默丢失(订单11196实测note为空)。修复: ①init.js input+change 双事件
//       实时写车 ②core.js 结算前从 DOM 收口读取实际值。
test('备注保存防线①: init.js 同时监听 input 与 change 事件写购物车', () => {
  const src = read('js/init.js');
  assert.ok(/addEventListener\('input'[\s\S]{0,200}cart-note-input/.test(src), 'init.js 应监听 input 事件保存备注');
  assert.ok(/addEventListener\('change'[\s\S]{0,400}cart-qty-input/.test(src), 'change 监听器应保留(数量输入)');
});

test('备注保存防线②: 结算前从 .cart-note-input DOM 收口实际值', () => {
  const src = frontSrc();
  const cki = src.indexOf('async function checkoutCart()');
  assert.ok(cki > 0, 'checkoutCart 应存在');
  const body = src.slice(cki, cki + 2000);
  assert.ok(/querySelectorAll\('\.cart-note-input'\)/.test(body), '结算开头应遍历备注输入框兜底读取');
  assert.ok(body.indexOf('saveCart(cart)') < body.indexOf('起售数量'), '兜底应在起售闸门之前写回购物车');
});

// ═══ UI 骨架 i18n（2026-10-07 用户实测反馈：切英文后首页/导航毫无变化，"中英文切换没有用"）═══
// 根因: 翻译只覆盖菜品数据面(菜名/分类/描述), 导航/首页按钮/桌号卡/菜单页头全是写死中文,
//       切换后唯一变化是折叠菜单里的小按钮文字——用户感知为零。
// 修复: UI_STR 字典 + data-i18n 声明 + applyUiLang() 统一应用(切换与初始加载都调用)。
test('UI骨架i18n①: 关键骨架元素带 data-i18n 声明', () => {
  const src = read('index.html');
  for (const id of ['nav-home', 'nav-dataset', 'guest-btn', 'ai-recommend-btn', 'ai-table-btn', 'table-change-btn', 'login-btn', 'register-btn']) {
    const at = src.indexOf('id="' + id + '"');
    assert.ok(at > 0 && src.slice(at, at + 400).includes('data-i18n'), id + ' 应带 data-i18n 声明');
  }
  assert.ok(src.includes('data-i18n="menu_title"'), '菜单页头应带 data-i18n');
});

test('UI骨架i18n②: 字典/应用函数/切换与初始加载接线', () => {
  const g = read('js/globals.js');
  assert.ok(g.includes('var UI_STR'), 'globals 应有 UI_STR 字典');
  assert.ok(g.includes('function applyUiLang'), 'globals 应有 applyUiLang');
  assert.ok(/function toggleMenuLang\(\)[\s\S]{0,300}applyUiLang\(\)/.test(g), 'toggleMenuLang 应调用 applyUiLang');
  assert.ok(g.includes('var TAB_EN'), '分类 tab 短名应有 TAB_EN 映射');
  const c = frontSrc();
  assert.ok(c.includes("uiText('table_none')") && c.includes("uiText('table_pick')"), '桌号状态卡应走 uiText');
  const i = read('js/init.js');
  assert.ok(i.includes('applyUiLang()'), '初始加载应应用已存语言');
});

// ═══ 遍历式 UI 翻译（2026-10-07 "都做"包：筛选下拉/表单选项/理由话术等动态面全量英文化）═══
test('遍历式翻译①: ZH_EN 字典覆盖扫描出的残留串', () => {
  const g = read('js/globals.js');
  const must = ['全部分类','全部辣度','全部价格','默认排序','按人气','请选择桌号','🥡 打包带走','浏览本店全部菜品，共','购物车是空的','去结算','家常版','宴请版','打卡版','壹用餐人数','避开最近吃过的菜（7 天内点过的不再推荐）','生成席面 · 三套方案','再来一单','退出登录','注销账号','去注册'];
  for (const k of must) assert.ok(hasDictKey(g, k), 'ZH_EN 缺: ' + k);
  assert.ok(g.includes('var PH_EN') && g.includes('搜索菜品名称'), 'placeholder 映射应存在');
  assert.ok(g.includes('createTreeWalker'), '应有遍历器');
  assert.ok(g.includes('REASON_EN') && g.includes('function reasonZhToEn'), '理由话术映射应存在');
});

test('遍历式翻译②: 动态渲染接入(下拉/meta/匹配指数/轮次/观察器)', () => {
  const c = frontSrc();
  assert.ok(c.includes("catNameOf(c)") && c.includes("All categories"), '分类下拉显示应走 catNameOf');
  assert.ok(c.includes('roundLabelLang'), '轮次条应按语言转写');
  const r = read('js/recommendation.js');
  assert.ok(r.includes('SPICE_EN[d.spiciness]') && r.includes('reasonZhToEn(d.reason)') && r.includes("Match: "), '推荐卡 meta/理由/匹配指数应按语言输出');
  const i = read('js/init.js');
  assert.ok(i.includes('MutationObserver') && i.includes('applyUiLangGuarded'), '动态渲染应挂观察器补翻');
});

// ═══ 品牌面英译（2026-10-07 用户拍板：品牌资产也要翻，意译保唐韵；品牌名保留中文为主）═══
test('品牌面英译: hero诗句/口号/关于本店/页脚双语并列', () => {
  const g = read('js/globals.js');
  for (const k of ['— 唐风雅韵 · 猫趣悠然 —', '梦回大唐 · 品味长安', '宫廷御膳 · 匠心呈现', '唐猫庭院 · 千年陕菜', '本地人的待客小宴', '大众点评收藏打卡关注门店送小挂件或冰峰']) {
    assert.ok(hasDictKey(g, k), 'ZH_EN 缺品牌条目: ' + k);
  }
  assert.ok(g.includes('addr-en') && g.includes('Grand Tang Mall Branch'), '页脚地址应中英并列注入');
  // 品牌名"唐猫庭院"与地址原文不得作为 key(保留中文/并列而非替换)
  assert.ok(!/^\s*'唐猫庭院':/.test(g), '品牌名本身不应被翻译替换');
  assert.ok(!g.includes("'🏮 大唐不夜城店"), '门店地址原文不应整体替换');
});

// ═══ 遍历器遮挡修复（2026-10-07 实测: 同段多文本节点只翻第一个）═══
test('遍历器遮挡修复: 原文记忆挂文本节点自身而非父元素', () => {
  const g = read('js/globals.js');
  assert.ok(g.includes('n.__zhOrig'), '记忆应挂文本节点自身(__zhOrig)');
  assert.ok(!g.includes('data-zh-orig'), '不得再把记忆挂父元素 data-zh-orig(同段多节点互相遮挡)');
  assert.ok(g.includes('Grand Tang Mall Branch') && g.includes('SAGA'), '页脚/门店英文地址应存在');
  assert.ok(g.includes('本地人的待客小宴') && g.includes("the locals"), '尾句条目应存在(两种引号形态其一)');
});

// ═══ 推荐页动态拼接串双语（2026-10-07 用户实测 EN 推荐页残留三处）═══
test('推荐页动态串①: 偏好横幅/当前使用行/米饭行按语言输出', () => {
  const c = frontSrc();
  assert.ok(c.includes("taste preferences not set"), 'core.js 偏好横幅应双语');
  const r = read('js/recommendation.js');
  assert.ok(r.includes("Currently using: ") && r.includes("MODE_EN"), '当前使用行应双语+mode映射');
  assert.ok(r.includes("Wuchang Steamed Rice") && r.includes("¥3/bowl"), '米饭行应双语');
});

// ═══ 偏好表单残留修复（2026-10-07 用户实测：退出登录后偏好选项残留给下一顾客）═══
// 根因: 偏好回填三分支漏了 guest——currentUser='guest' 时既不回填账号偏好也不重置表单,
//       上一登录用户的选项残留给下一顾客(共享平板/扫码设备隐私问题)。
test('偏好表单残留修复①: guest 态也重置表单(回填条件覆盖三分支)', () => {
  const c = frontSrc();
  assert.ok(c.includes("else resetPreferenceForm();"), 'guest/未登录应走 resetPreferenceForm');
  assert.ok(!c.includes("else if(!currentUser)resetPreferenceForm();"), '旧条件(仅null重置)应已移除');
  assert.ok(c.includes("removeItem('savedPrefs')"), '退出登录应清 savedPrefs 偏好痕迹标记');
  assert.ok(/localStorage\.removeItem\('savedPrefs'\);[\s\S]{0,120}resetPreferenceForm\(\)/.test(c), '退出登录应同步重置偏好表单DOM');
});

// ═══ 推荐卡双bug修复（2026-10-07 用户实测EN推荐页发现）═══
// bug1: 评分按钮重复渲染两次(背靠背两个openStarFeedback按钮)
// bug2: 无口味声明用户显示"80.9%匹配度"——未声明维度给中性分,菜品质量分冒充个性匹配分,语义误导
test('推荐卡修复①: 评分按钮去重(只渲染一个)', () => {
  const r = read('js/recommendation.js');
  // prettier 后 dish-actions 行可能被拆分,直接全文统计评分按钮的渲染出现次数
  const btnCount = (r.match(/openStarFeedback\(currentRecommendations/g) || []).length;
  assert.ok(btnCount === 1, '评分按钮应只出现1次, 实际' + btnCount);
});

test('推荐卡修复②: 无口味声明不显示匹配度%, 改显本店推荐徽标', () => {
  const r = sq(read('js/recommendation.js'));
  assert.ok(r.includes('hasTasteSignal'), '应有口味信号判定');
  assert.ok(r.includes('House pick') || r.includes('本店推荐'), '无信号应显本店推荐徽标');
  // processML 里声明数判定存在
  assert.ok(r.includes("v&&v!=='无'&&v!=='无特殊要求'&&v!=='不限'"), '声明判定条件应存在');
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
