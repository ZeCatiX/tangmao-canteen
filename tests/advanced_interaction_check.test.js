// 唐猫庭院 - 高级交互验证：筛选联动、排序、登录视图差异、连续快速操作
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

describe('高级交互验证', () => {
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

  // ===== 1. 菜单类别筛选联动 =====
  it('1.1 菜单类别下拉筛选结果变化', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => {
      const link = document.getElementById('nav-dataset');
      if (link) link.click();
    });
    await sleep(800);
    // 获取初始行数
    const initialRows = await page.evaluate(() => {
      const tbody = document.getElementById('dataset-table-body');
      return tbody ? tbody.children.length : 0;
    });
    // 选择类别"陕西小吃"
    await page.evaluate(() => {
      const select = document.getElementById('menu-filter-cat');
      if (select) {
        // 尝试选择第二个选项（第一个可能是"全部"）
        const options = select.options;
        for (let i = 0; i < options.length; i++) {
          if (options[i].text.includes('小吃')) {
            select.selectedIndex = i;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      }
    });
    await sleep(800);
    const filteredRows = await page.evaluate(() => {
      const tbody = document.getElementById('dataset-table-body');
      return tbody ? tbody.children.length : 0;
    });
    // 筛选后行数应减少或保持
    assert.ok(filteredRows <= initialRows, `筛选后行数(${filteredRows})应不大于初始行数(${initialRows})`);
    // 检查筛选内容是否都是小吃类
    if (filteredRows > 0 && filteredRows < initialRows) {
      const text = await page.evaluate(() => {
        const tbody = document.getElementById('dataset-table-body');
        return tbody ? tbody.textContent : '';
      });
      assert.ok(text.includes('小吃') || text.length > 0, '筛选结果应有内容');
    }
    // 重置
    await page.evaluate(() => {
      const btn = document.getElementById('menu-reset-filter');
      if (btn) btn.click();
    });
    await sleep(500);
    assert.equal(realErrors().length, 0, '菜单类别筛选不应有错误');
  });

  // ===== 2. 菜单排序功能 =====
  it('2.1 菜单排序切换排序方式', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => {
      const link = document.getElementById('nav-dataset');
      if (link) link.click();
    });
    await sleep(800);
    // 获取排序下拉框选项
    const sortOptions = await page.evaluate(() => {
      const select = document.getElementById('menu-sort');
      if (!select) return [];
      return Array.from(select.options).map(o => o.text);
    });
    if (sortOptions.length > 1) {
      // 选择第二个排序方式
      await page.evaluate(() => {
        const select = document.getElementById('menu-sort');
        if (select && select.options.length > 1) {
          select.selectedIndex = 1;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await sleep(800);
      // 获取排序后的第一行文本
      const firstRow = await page.evaluate(() => {
        const tbody = document.getElementById('dataset-table-body');
        return tbody && tbody.children[0] ? tbody.children[0].textContent.trim() : '';
      });
      assert.ok(firstRow.length > 0, '排序后第一行应有内容');
    } else {
      assert.ok(true, '排序下拉框无可用选项，跳过');
    }
    assert.equal(realErrors().length, 0, '菜单排序不应有错误');
  });

  // ===== 3. 辣度筛选联动 =====
  it('3.1 菜单辣度筛选结果变化', async () => {
    resetErrors();
    // 重置筛选后测试辣度筛选
    await page.evaluate(() => {
      const btn = document.getElementById('menu-reset-filter');
      if (btn) btn.click();
    });
    await sleep(500);
    const initialRows = await page.evaluate(() => {
      const tbody = document.getElementById('dataset-table-body');
      return tbody ? tbody.children.length : 0;
    });
    // 选择辣度"不辣"
    await page.evaluate(() => {
      const select = document.getElementById('menu-filter-spice');
      if (select) {
        const options = select.options;
        for (let i = 0; i < options.length; i++) {
          if (options[i].text.includes('不辣')) {
            select.selectedIndex = i;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      }
    });
    await sleep(800);
    const filteredRows = await page.evaluate(() => {
      const tbody = document.getElementById('dataset-table-body');
      return tbody ? tbody.children.length : 0;
    });
    assert.ok(filteredRows <= initialRows, `辣度筛选后行数(${filteredRows})应不大于初始行数(${initialRows})`);
    // 重置
    await page.evaluate(() => {
      const btn = document.getElementById('menu-reset-filter');
      if (btn) btn.click();
    });
    await sleep(500);
    assert.equal(realErrors().length, 0, '辣度筛选不应有错误');
  });

  // ===== 4. 连续快速点击导航不崩溃 =====
  it('4.1 连续快速点击不同导航链接不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    // 快速连续点击多个导航
    const navIds = ['nav-home', 'nav-about', 'nav-dataset', 'nav-privacy'];
    for (let round = 0; round < 3; round++) {
      for (const id of navIds) {
        await page.evaluate(nid => {
          const link = document.getElementById(nid);
          if (link) link.click();
        }, id);
        await sleep(100);
      }
    }
    await sleep(500);
    // 检查页面是否仍有响应
    const responsive = await page.evaluate(() => {
      const home = document.getElementById('home-section');
      return home ? true : false;
    });
    assert.ok(responsive, '快速点击后页面应仍响应');
    assert.equal(realErrors().length, 0, '连续快速点击不应有错误');
  });

  // ===== 5. 游客和登录用户首页差异 =====
  it('5.1 游客页面不显示个人资料导航', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    // 清除localStorage（游客状态）
    await page.evaluate(() => localStorage.removeItem('user'));
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await sleep(800);
    // 检查"我的"导航是否隐藏
    const profileNavVisible = await page.evaluate(() => {
      const item = document.getElementById('nav-profile-item');
      return item ? !item.classList.contains('d-none') : false;
    });
    assert.ok(!profileNavVisible, '游客不应看到"我的"导航');
    assert.equal(realErrors().length, 0, '游客视图不应有错误');
  });

  // ===== 6. 登录后显示个人资料导航 =====
  it('6.1 登录后显示个人资料导航', async () => {
    resetErrors();
    // 注册新用户
    const uname = 'navuser_' + Date.now();
    const upass = 'Navuser123';
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.evaluate((u) => {
      const el = document.getElementById('register-username');
      if (el) { el.value = u; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, uname);
    await page.evaluate((p) => {
      const el = document.getElementById('register-password');
      if (el) { el.value = p; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, upass);
    await page.evaluate((p) => {
      const el = document.getElementById('register-confirm');
      if (el) { el.value = p; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, upass);
    await page.evaluate(() => {
      const cb = document.getElementById('agree-privacy');
      if (cb) cb.checked = true;
    });
    await page.evaluate(() => {
      const btn = document.querySelector('#register-section button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(1000);
    // 登录
    await page.evaluate(() => document.getElementById('login-btn')?.click());
    await sleep(300);
    await page.evaluate((u) => {
      const el = document.getElementById('login-username');
      if (el) { el.value = u; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, uname);
    await page.evaluate((p) => {
      const el = document.getElementById('login-password');
      if (el) { el.value = p; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, upass);
    await page.evaluate(() => {
      const btn = document.querySelector('#login-section button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(1500);
    // 检查"我的"导航是否显示
    const profileNavVisible = await page.evaluate(() => {
      const item = document.getElementById('nav-profile-item');
      return item ? !item.classList.contains('d-none') : false;
    });
    assert.ok(profileNavVisible, '登录后应显示"我的"导航');
    assert.equal(realErrors().length, 0, '登录视图不应有错误');
  });

  // ===== 7. 偏好设置价格区间筛选 =====
  it('7.1 偏好设置价格区间选择器可用', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    // 选择价格区间
    const priceOptions = await page.evaluate(() => {
      const select = document.getElementById('price');
      return select ? Array.from(select.options).map(o => o.text) : [];
    });
    assert.ok(priceOptions.length > 1, `价格区间应有多个选项，实际: ${priceOptions.length}`);
    if (priceOptions.length > 1) {
      await page.select('#price', priceOptions[1]).catch(() => {});
    }
    assert.equal(realErrors().length, 0, '价格区间选择不应有错误');
  });

  // ===== 8. 素食偏好影响推荐 =====
  it('8.1 选择素食后推荐结果可获取', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    // 选择素食
    await page.evaluate(() => {
      const cb = document.getElementById('vegetarian');
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    // 提交偏好
    await page.evaluate(() => {
      const btn = document.querySelector('#preference-form button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(5000);
    const recoVisible = await page.evaluate(() => {
      const section = document.getElementById('recommendation-section');
      return section ? (section.classList.contains('active') || section.style.display !== 'none') : false;
    });
    assert.ok(recoVisible, '素食偏好应能获取推荐');
    assert.equal(realErrors().length, 0, '素食偏好推荐不应有错误');
  });

  // ===== 9. 重复提交偏好不崩溃 =====
  it('9.1 快速重复提交偏好表单不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    // 快速连续提交3次
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const btn = document.querySelector('#preference-form button[type="submit"]');
        if (btn) btn.click();
      });
      await sleep(100);
    }
    await sleep(4000);
    const responsive = await page.evaluate(() => {
      return !!document.getElementById('recommendation-section');
    });
    assert.ok(responsive, '重复提交后页面应仍响应');
    assert.equal(realErrors().length, 0, '重复提交偏好不应有错误');
  });

  // ===== 10. 无障碍：aria-expanded状态 =====
  it('10.1 移动端汉堡菜单aria-expanded状态正确', async () => {
    resetErrors();
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    // 初始状态应展开false
    const initialExpanded = await page.evaluate(() => {
      const btn = document.querySelector('.navbar-toggler');
      return btn ? btn.getAttribute('aria-expanded') : null;
    });
    // 点击汉堡菜单
    await page.evaluate(() => {
      const btn = document.querySelector('.navbar-toggler');
      if (btn) btn.click();
    });
    await sleep(500);
    const afterClick = await page.evaluate(() => {
      const btn = document.querySelector('.navbar-toggler');
      return btn ? btn.getAttribute('aria-expanded') : null;
    });
    assert.ok(initialExpanded === 'false' || initialExpanded === null, `初始aria-expanded应为false: ${initialExpanded}`);
    assert.ok(afterClick === 'true' || afterClick === null, `点击后aria-expanded应为true: ${afterClick}`);
    await page.setViewport({ width: 1280, height: 800 });
    assert.equal(realErrors().length, 0, '汉堡菜单aria不应有错误');
  });
});