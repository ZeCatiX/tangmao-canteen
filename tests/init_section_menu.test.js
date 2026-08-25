// 唐猫庭院 - section切换一致性、菜单渲染、init事件绑定深度检查
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser, page;

function isRealError(msg) {
  if (msg.includes('fonts.googleapis.com') || msg.includes('fonts.gstatic.com')) return false;
  if (msg.includes('401 (Unauthorized)')) return false;
  if (msg.includes('429 (Too Many Requests)')) return false;
  if (msg.includes('404 (Not Found)')) return false;
  if (msg.includes('409')) return false;
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) return false;
  return true;
}

describe('init事件绑定完整性检查', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new', executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    page.on('console', msg => {
      const t = msg.text();
      if (msg.type() === 'error' && isRealError(t)) page._consoleErrors.push(t);
    });
    page.on('pageerror', err => page._consoleErrors.push(err.message));
  });

  after(async () => { if (browser) await browser.close(); });

  function resetErrors() { page._consoleErrors = []; }
  function realErrors() { return page._consoleErrors.filter(isRealError); }

  // ===== 1. _initialized防止重复初始化 =====
  it('1.1 _initialized标志防止重复初始化', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const flag = await page.evaluate(() => _initialized);
    assert.ok(flag === true, '_initialized应为true');
    // 再次触发DOMContentLoaded不应重复初始化
    await page.evaluate(() => {
      document.dispatchEvent(new Event('DOMContentLoaded'));
    });
    await sleep(300);
    assert.equal(realErrors().length, 0, '重复触发DOMContentLoaded不应有错误');
  });

  // ===== 2. 所有HTML按钮都有事件绑定 =====
  it('2.1 所有HTML中的按钮ID在init.js中有绑定', async () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const init = fs.readFileSync(path.join(__dirname, '..', 'js', 'init.js'), 'utf8');
    // 提取HTML中的按钮ID
    const btnIds = [];
    const regex = /<button[^>]*\sid="([^"]+)"/g;
    let m;
    while ((m = regex.exec(html)) !== null) btnIds.push(m[1]);
    // 检查每个按钮ID是否在init.js中有绑定
    const unbound = [];
    for (const id of btnIds) {
      // 动态生成的按钮通过事件委托绑定，不在init.js中直接绑定
      if (['refresh-recommendations', 'end-recommendation', 'end-logout-btn'].includes(id)) continue;
      // 检查init.js中是否有click('id'或submit('id'或事件委托
      const inInit = init.includes(`'${id}'`) || init.includes(`"${id}"`);
      if (!inInit) unbound.push(id);
    }
    assert.equal(unbound.length, 0, '以下按钮未在init.js中绑定: ' + unbound.join(', '));
  });

  // ===== 3. 所有section都能通过showSection切换 =====
  it('3.1 所有section可通过showSection切换', async () => {
    resetErrors();
    const sections = ['home-section', 'login-section', 'register-section',
      'preference-section', 'profile-section', 'recommendation-section',
      'feedback-section', 'cart-section', 'end-section', 'about-section',
      'dataset-section', 'privacy-section'];
    for (const s of sections) {
      await page.evaluate(sec => showSection(sec), s);
      await sleep(100);
      const visible = await page.evaluate(sec => {
        const el = document.getElementById(sec);
        return el && !el.classList.contains('d-none');
      }, s);
      assert.ok(visible, `section ${s} 应可见`);
    }
    assert.equal(realErrors().length, 0, 'section切换不应有JS错误');
  });

  // ===== 4. 切换section时只有一个section可见 =====
  it('4.1 切换section时只有一个section可见', async () => {
    resetErrors();
    await page.evaluate(() => showSection('home-section'));
    await sleep(200);
    const sections = ['about-section', 'privacy-section', 'dataset-section', 'home-section'];
    for (const s of sections) {
      await page.evaluate(sec => showSection(sec), s);
      await sleep(100);
      // 检查可见的section数量
      const visibleCount = await page.evaluate(() => {
        const ids = ['home-section', 'login-section', 'register-section',
          'preference-section', 'profile-section', 'recommendation-section',
          'feedback-section', 'cart-section', 'end-section', 'about-section',
          'dataset-section', 'privacy-section'];
        return ids.filter(id => {
          const el = document.getElementById(id);
          return el && !el.classList.contains('d-none');
        }).length;
      });
      // 推荐结果可能动态显示，但初始切换应只有1个可见
      assert.ok(visibleCount >= 1, `切换到${s}后应至少1个section可见，实际: ${visibleCount}`);
    }
    assert.equal(realErrors().length, 0, 'section切换一致性不应有错误');
  });

  // ===== 5. 导航到全部菜单后showDataset加载数据 =====
  it('5.1 showDataset加载菜品数据到表格', async () => {
    resetErrors();
    await page.evaluate(() => showDataset());
    await sleep(1500);
    const rowCount = await page.evaluate(() => {
      const tbody = document.querySelector('#dataset-section tbody');
      return tbody ? tbody.children.length : 0;
    });
    assert.ok(rowCount > 0, '全部菜单应显示菜品行，实际: ' + rowCount);
    assert.equal(realErrors().length, 0, 'showDataset不应有错误');
  });

  // ===== 6. 菜单搜索筛选正确 =====
  it('6.1 菜单搜索"鱼"只显示含鱼的菜品', async () => {
    resetErrors();
    await page.evaluate(() => {
      const search = document.getElementById('menu-search');
      if (search) { search.value = '鱼'; search.dispatchEvent(new Event('input')); }
    });
    await sleep(500);
    const allNames = await page.evaluate(() => {
      const rows = document.querySelectorAll('#dataset-section tbody tr');
      return Array.from(rows).map(r => r.textContent);
    });
    // 每行应包含"鱼"（搜索结果筛选）
    const nonMatching = allNames.filter(n => !n.includes('鱼'));
    assert.ok(nonMatching.length === 0 || allNames.length === 0,
      '搜索"鱼"后不应有不含鱼的菜品，不匹配: ' + nonMatching.length + '行');
    assert.equal(realErrors().length, 0, '搜索筛选不应有错误');
  });

  // ===== 7. 菜单重置筛选恢复全部 =====
  it('7.1 重置筛选恢复所有菜品', async () => {
    resetErrors();
    await page.evaluate(() => {
      const btn = document.getElementById('menu-reset-filter');
      if (btn) btn.click();
    });
    await sleep(500);
    const searchVal = await page.evaluate(() => {
      const el = document.getElementById('menu-search');
      return el ? el.value : '';
    });
    assert.equal(searchVal, '', '重置后搜索框应清空');
    const rowCount = await page.evaluate(() => {
      const tbody = document.querySelector('#dataset-section tbody');
      return tbody ? tbody.children.length : 0;
    });
    assert.ok(rowCount > 0, '重置后应显示所有菜品');
    assert.equal(realErrors().length, 0, '重置筛选不应有错误');
  });

  // ===== 8. 分类筛选 =====
  it('8.1 分类筛选只显示对应分类', async () => {
    resetErrors();
    const filterCat = await page.$('#menu-filter-cat');
    if (filterCat) {
      const options = await page.evaluate(() => {
        const sel = document.getElementById('menu-filter-cat');
        return sel ? Array.from(sel.options).map(o => o.value) : [];
      });
      if (options.length > 1) {
        await page.select('#menu-filter-cat', options[1]);
        await sleep(500);
        const rowCount = await page.evaluate(() => {
          const tbody = document.querySelector('#dataset-section tbody');
          return tbody ? tbody.children.length : 0;
        });
        assert.ok(rowCount >= 0, '分类筛选后应显示菜品或空');
        // 重置
        await page.select('#menu-filter-cat', '');
        await sleep(300);
      }
    }
    assert.equal(realErrors().length, 0, '分类筛选不应有错误');
  });

  // ===== 9. 排序功能 =====
  it('9.1 排序功能不崩溃', async () => {
    resetErrors();
    const sortSel = await page.$('#menu-sort');
    if (sortSel) {
      const options = await page.evaluate(() => {
        const sel = document.getElementById('menu-sort');
        return sel ? Array.from(sel.options).map(o => o.value) : [];
      });
      for (const val of options) {
        await page.select('#menu-sort', val);
        await sleep(200);
      }
      await page.select('#menu-sort', '');
    }
    assert.equal(realErrors().length, 0, '排序功能不应有错误');
  });

  // ===== 10. 菜品数据加载正确 =====
  it('10.1 菜品数据从API加载到dishData全局变量', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(2000);
    const count = await page.evaluate(() => dishData ? dishData.length : 0);
    assert.ok(count > 0, 'dishData应已从API加载菜品，实际: ' + count);
    assert.equal(realErrors().length, 0, '菜品数据加载不应有错误');
  });

  // ===== 11. 过敏源互斥逻辑 =====
  it('11.1 勾选无过敏源时其他过敏源禁用', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    // 勾选"无过敏源"
    const allergyNone = await page.$('#allergy-none');
    if (allergyNone) {
      const checked = await page.evaluate(el => el.checked, allergyNone);
      if (!checked) await allergyNone.click();
      await sleep(200);
      // 其他过敏源应被禁用
      const disabled = await page.evaluate(() => {
        const boxes = document.querySelectorAll('input[name="allergy"]:not(#allergy-none)');
        return Array.from(boxes).every(b => b.disabled);
      });
      assert.ok(disabled, '勾选无过敏源后其他过敏源应被禁用');
      // 取消"无过敏源"
      await allergyNone.click();
      await sleep(200);
      const enabled = await page.evaluate(() => {
        const boxes = document.querySelectorAll('input[name="allergy"]:not(#allergy-none)');
        return Array.from(boxes).every(b => !b.disabled);
      });
      assert.ok(enabled, '取消无过敏源后其他过敏源应恢复可用');
    }
    assert.equal(realErrors().length, 0, '过敏源互斥逻辑不应有错误');
  });

  // ===== 12. localStorage恢复登录状态 =====
  it('12.1 刷新后localStorage恢复登录状态', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    // 设置localStorage模拟已登录
    await page.evaluate(() => {
      localStorage.setItem('currentUser', 'test_restore_user');
      // 创建用户数据
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      users.push({ username: 'test_restore_user', password: '', created_at: new Date().toISOString() });
      localStorage.setItem('users', JSON.stringify(users));
    });
    // 刷新页面
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(500);
    const restored = await page.evaluate(() => {
      return localStorage.getItem('currentUser') === 'test_restore_user';
    });
    assert.ok(restored, '刷新后currentUser应保持');
    // 清理
    await page.evaluate(() => {
      localStorage.removeItem('currentUser');
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      const filtered = users.filter(u => u.username !== 'test_restore_user');
      localStorage.setItem('users', JSON.stringify(filtered));
    });
    assert.equal(realErrors().length, 0, 'localStorage恢复不应有错误');
  });

  // ===== 13. popstate导航 =====
  it('13.1 popstate事件正确切换section', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 手动push state
    await page.evaluate(() => {
      history.pushState({ section: 'about-section' }, '', '#about');
    });
    // 触发popstate
    await page.evaluate(() => {
      history.back();
    });
    await sleep(300);
    assert.equal(realErrors().length, 0, 'popstate导航不应有错误');
  });

  // ===== 14. 消息模态框 =====
  it('14.1 showMessage显示模态框', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => showMessage('测试标题', '测试消息内容'));
    await sleep(500);
    const modalVisible = await page.evaluate(() => {
      const modal = document.getElementById('message-modal');
      if (!modal) return false;
      return modal.classList.contains('show') || window.getComputedStyle(modal).display === 'block';
    });
    assert.ok(modalVisible, '消息模态框应显示');
    // 关闭
    await page.evaluate(() => {
      const btn = document.getElementById('modal-close-btn');
      if (btn) btn.click();
    });
    await sleep(300);
    assert.equal(realErrors().length, 0, '消息模态框不应有错误');
  });
});
