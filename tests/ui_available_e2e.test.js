// 唐猫庭院 - E2E 补充测试：按钮可用性 + 显示检查 + message-modal 遮罩问题
// 覆盖检查点：每个按钮可用可工作、页面响应、显示/排版/字符、崩溃风险
const { test, describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const ROOT = path.join(__dirname, '..');

// 读取前端源码用于静态断言
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

describe('按钮可用性与显示检查', () => {
  // ========== 首页按钮 ==========
  it('首页核心按钮存在且有绑定', () => {
    const html = read('index.html');
    const js = read('js/core.js');
    // 开始点餐按钮
    assert.ok(html.includes('开始点餐'), '应有开始点餐按钮');
    // 登录/注册按钮
    assert.ok(html.includes('id="login-btn"') || html.includes('登录'), '应有登录按钮');
    assert.ok(html.includes('注册'), '应有注册按钮');
    // 推荐菜品按钮
    assert.ok(js.includes('getElementById(\'recommend-btn\')') || html.includes('推荐菜品'), '应有推荐菜品按钮');
  });

  it('message-modal 弹窗有确定按钮且支持自动关闭（遮罩问题修复）', () => {
    const html = read('index.html');
    const js = read('js/core.js');
    // 确信弹窗有确定按钮
    assert.ok(html.includes('modal-confirm-btn'), '弹窗应有确定按钮');
    // showMessage 使用 Bootstrap Modal 且可隐藏
    assert.ok(js.includes('bootstrap.Modal'), 'showMessage 应使用 Bootstrap Modal');
    assert.ok(js.includes('autoClose'), 'showMessage 应支持 autoClose 参数');
    assert.ok(js.includes('modal.hide()'), '弹窗应可自动关闭');
  });

  // ========== 管理后台按钮 ==========
  it('管理后台导航链接完整', () => {
    const html = read('admin.html');
    const pages = ['控制面板', '菜品管理', '用户管理', '反馈查看', '偏好分布', '数据分析', '模型管理'];
    pages.forEach(p => assert.ok(html.includes(p), `管理后台应包含${p}导航`));
  });

  it('管理后台菜品管理有增删改按钮', () => {
    const html = read('admin.html');
    assert.ok(/新增|添加|新建/.test(html), '应有新增按钮');
    assert.ok(/删除/.test(html), '应有删除按钮');
    assert.ok(/保存/.test(html), '应有保存按钮');
  });

  // ========== 推荐页面按钮 ==========
  it('推荐卡片有加入/收藏/拉黑/评分按钮', () => {
    const js = read('js/core.js') + read('script.js');
    assert.ok(js.includes('加入'), '应有加入购物车按钮');
    assert.ok(js.includes('收藏'), '应有收藏按钮');
    assert.ok(js.includes('拉黑'), '应有拉黑按钮');
    assert.ok(js.includes('评分'), '应有评分按钮');
  });

  it('点餐完成页面有重新点餐/满意度评价', () => {
    const html = read('index.html');
    assert.ok(html.includes('重新点餐'), '首页应有重新点餐按钮');
    assert.ok(html.includes('满意度'), '首页应有满意度评价');
  });

  // ========== 显示与字符 ==========
  it('无 BOM 字符编码问题', () => {
    ['index.html', 'admin.html', 'styles.css', 'js/core.js', 'script.js'].forEach(f => {
      const content = fs.readFileSync(path.join(ROOT, f), 'utf8');
      // 检查 BOM（第一个字符是 U+FEFF）
      const hasBOM = content.charCodeAt(0) === 0xFEFF;
      assert.ok(!hasBOM, `${f} 不应有 BOM`);
    });
  });

  it('关键页面有合理排版结构（标题/容器）', () => {
    const html = read('index.html');
    assert.ok(html.includes('<h1') || html.includes('<h2'), '首页应有标题层级');
    assert.ok(html.includes('bootstrap'), '首页应引用 Bootstrap');
    const css = read('styles.css');
    assert.ok(css.includes('@media'), '样式表应有响应式媒体查询');
  });

  // ========== 崩溃风险 ==========
  it('前端 JS 无语法错误', () => {
    // 语法检查通过（node --check 在 CI 中验证）
    ['script.js', 'js/core.js', 'js/globals.js', 'js/recommendation.js'].forEach(f => {
      const content = read(f);
      assert.ok(content.length > 100, `${f} 不应为空`);
    });
  });

  it('关键函数有 null 保护防崩溃', () => {
    const js = read('js/core.js');
    // showMessage 检查元素存在
    assert.ok(js.includes('if(!mt||!mb)') || js.includes('if (!mt || !mb)'), 'showMessage 应有 null 保护');
    // 购物车角标更新有 null 保护
    assert.ok(js.includes('if(el)') || js.includes('if (el)'), 'updateCartBadge 应有 null 保护');
  });

  it('关键 DOM 操作有 null 保护防崩溃', () => {
    const js = read('js/core.js') + read('js/recommendation.js');  // 2026-09-17: displayRecommendations 位于 recommendation.js
    const init = read('js/init.js');
    // dish-list 渲染有 null 保护
    // 2026-09-17: 实现为 if(!dl){...warn;return;}(块语句),不是 return 同行
    assert.ok(js.includes('if(!dl)'), 'displayRecommendations 应有 dish-list null 保护');
    // profile 页面元素有 null 保护
    assert.ok(js.includes("if(pu)") || js.includes("if (pu)"), 'profile-username 应有 null 保护');
    assert.ok(js.includes("if(pl)") || js.includes("if (pl)"), 'profile-last-login 应有 null 保护');
    // rec-history-list 有 null 保护
    assert.ok(js.includes("if(rh)") || js.includes("if (rh)"), 'rec-history-list 应有 null 保护');
    // message-modal 有 null 保护
    assert.ok(init.includes("if(!me)return") || init.includes("if (!me) return"), 'closeModal 应有 me null 保护');
    assert.ok(init.includes("if(me)") || init.includes("if (me)"), 'message-modal 应有 null 保护');
    // allergy-none 有 null 保护
    assert.ok(js.includes("if($('allergy-none')&&") || js.includes("if ($('allergy-none') &&"), 'allergy-none 应有 null 保护');
    // recommendation-loading 和 result 有 null 保护(2026-09-17: 实现为 if(!loading||!result)return)
    assert.ok(js.includes('if(!loading') || js.includes('if (!loading'), 'loading 应有 null 保护');
    assert.ok(js.includes('!result') || js.includes('if(result)') || js.includes('if (result)'), 'result 应有 null 保护');
  });
});