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

test('回归-BUG1: 选桌后AI入口走 openAIRecommend 冷启动判定, 不再硬编码跳偏好表单', () => {
  const core = read('js/core.js');
  assert.ok(core.includes('function openAIRecommend()'), 'core.js 必须定义唯一判定源 openAIRecommend');
  // openAIRecommend 内部必须包含冷启动判定(偏好已填→偏好表单, 否则热门Top6)
  const fnStart = core.indexOf('function openAIRecommend()');
  const fnBody = core.slice(fnStart, core.indexOf('}', core.indexOf('coldStartHotRecommend', fnStart)) + 1);
  assert.ok(fnBody.includes('coldStartHotRecommend'), 'openAIRecommend 必须含冷启动分支');
  assert.ok(fnBody.includes("showSection('preference-section')"), 'openAIRecommend 必须含偏好表单分支');
  // 选桌后续路由的 ai 分支必须走判定源, 不允许硬编码
  const pick = core.slice(core.indexOf('function applyTableChoice'), core.indexOf('function showTableBill'));
  assert.ok(pick.includes("intent==='ai')openAIRecommend()"), 'applyTableChoice 的 ai 分支必须调 openAIRecommend');
  assert.ok(!pick.includes("intent==='ai')showSection('preference-section')"), 'ai 分支禁止硬编码跳偏好表单(会绕过冷启动)');
  // 首页按钮 handler 也走同一判定源
  const init = read('js/init.js');
  assert.ok(/ai-recommend-btn[\s\S]*?openAIRecommend\(\)/.test(init), '首页 AI 按钮必须调 openAIRecommend');
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
  const core = read('js/core.js');
  assert.ok(core.includes('const name=dish?esc(dishNameOf(dish)):esc(x.name)'), 'showCart 行名必须优先 dishNameOf(dish), 仅无匹配菜品时回退快照名');
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
  const src = read('js/core.js');
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
  const c = read('js/core.js');
  assert.ok(c.includes("uiText('table_none')") && c.includes("uiText('table_pick')"), '桌号状态卡应走 uiText');
  const i = read('js/init.js');
  assert.ok(i.includes('applyUiLang()'), '初始加载应应用已存语言');
});
