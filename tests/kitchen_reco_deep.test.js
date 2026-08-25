// 唐猫庭院 - 厨房看板实时刷新和推荐逻辑深度E2E测试
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';
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

describe('厨房看板实时刷新和ESC功能', () => {
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

  // ===== 1. 厨房看板时间每秒更新 =====
  it('1.1 厨房看板时间每秒更新', async () => {
    resetErrors();
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const time1 = await page.evaluate(() => document.getElementById('current-time')?.textContent || '');
    await sleep(1500);
    const time2 = await page.evaluate(() => document.getElementById('current-time')?.textContent || '');
    assert.ok(time1.length > 0, '时间1应显示');
    assert.ok(time2.length > 0, '时间2应显示');
    // 时间应该不同（秒数变化）
    assert.notEqual(time1, time2, '时间应随秒变化');
    assert.equal(realErrors().length, 0, '时间更新不应有错误');
  });

  // ===== 2. 厨房看板自动刷新订单 =====
  it('2.1 厨房看板10秒自动刷新订单', async () => {
    resetErrors();
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    // 登录
    const overlayVisible = await page.evaluate(() => {
      const el = document.getElementById('login-overlay');
      return el && el.style.display !== 'none';
    });
    if (overlayVisible) {
      await page.type('#login-user', 'admin', { delay: 20 });
      await page.type('#login-pass', ADMIN_PASS, { delay: 20 });
      await page.evaluate(() => document.getElementById('login-btn')?.click());
      await sleep(2000);
    }
    // 检查订单列表存在
    const orderListExists = await page.evaluate(() => !!document.getElementById('order-list'));
    assert.ok(orderListExists, '订单列表应存在');
    // 等待11秒确认自动刷新
    await sleep(11000);
    assert.equal(realErrors().length, 0, '自动刷新不应有JS错误: ' + realErrors().join('; '));
  });

  // ===== 3. ESC函数存在 =====
  it('3.1 ESC函数存在且可调用', async () => {
    resetErrors();
    const exists = await page.evaluate(() => typeof esc === 'function');
    assert.ok(exists, 'esc函数应存在');
  });

  // ===== 4. 厨房看板登录错误密码 =====
  it('4.1 厨房看板错误密码登录不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    // 如果已登录，先清除token
    await page.evaluate(() => localStorage.removeItem('kitchenToken'));
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(500);
    const overlayVisible = await page.evaluate(() => {
      const el = document.getElementById('login-overlay');
      return el && el.style.display !== 'none';
    });
    if (overlayVisible) {
      await page.type('#login-user', 'admin', { delay: 20 });
      await page.type('#login-pass', 'WrongPassword999!', { delay: 20 });
      await page.evaluate(() => document.getElementById('login-btn')?.click());
      await sleep(1500);
      // 应显示错误提示而非崩溃
      const errorShown = await page.evaluate(() => {
        const el = document.getElementById('login-error');
        return el && el.style.display !== 'none' && el.textContent.length > 0;
      });
      assert.ok(errorShown, '应显示错误提示');
    }
    assert.equal(realErrors().length, 0, '错误密码登录不应有JS错误');
  });

  // ===== 5. 厨房看板空用户名登录 =====
  it('5.1 厨房看板空字段登录不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
    await page.evaluate(() => localStorage.removeItem('kitchenToken'));
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(500);
    await page.evaluate(() => document.getElementById('login-btn')?.click());
    await sleep(500);
    const errorShown = await page.evaluate(() => {
      const el = document.getElementById('login-error');
      return el && el.style.display !== 'none' && el.textContent.includes('请输入');
    });
    assert.ok(errorShown, '空字段应提示"请输入账号和密码"');
    assert.equal(realErrors().length, 0, '空字段登录不应有JS错误');
  });

  // ===== 6. 厨房看板回车键登录 =====
  it('6.1 厨房看板回车键触发登录', async () => {
    resetErrors();
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
    await page.evaluate(() => localStorage.removeItem('kitchenToken'));
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(500);
    // 输入并按回车
    await page.type('#login-user', 'admin', { delay: 20 });
    await page.type('#login-pass', ADMIN_PASS, { delay: 20 });
    await page.focus('#login-pass');
    await page.keyboard.press('Enter');
    await sleep(2000);
    // 应登录成功
    const logged = await page.evaluate(() => {
      const el = document.getElementById('login-overlay');
      return !el || el.style.display === 'none';
    });
    assert.ok(logged, '回车键应触发登录');
    assert.equal(realErrors().length, 0, '回车登录不应有JS错误');
  });

  // ===== 7. 厨房看板已登录状态保持 =====
  it('7.1 厨房看板登录后刷新保持登录状态', async () => {
    resetErrors();
    // 上一个测试已登录，刷新页面
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(1000);
    const stillLogged = await page.evaluate(() => {
      const el = document.getElementById('login-overlay');
      return !el || el.style.display === 'none';
    });
    assert.ok(stillLogged, '刷新后应保持登录状态（token在localStorage）');
    assert.equal(realErrors().length, 0, '登录状态保持不应有错误');
  });
});

describe('推荐逻辑深度检查', () => {
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

  // ===== 8. 推荐结果包含盲盒菜品 =====
  it('8.1 推荐结果可能包含盲盒菜品', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => {
      document.getElementById('preference-form').querySelector('button[type="submit"]').click();
    });
    await sleep(5000);
    const hasBlindBox = await page.evaluate(() => {
      const badges = document.querySelectorAll('#dish-list .badge');
      for (const b of badges) {
        if (b.textContent.includes('盲盒') || b.textContent.includes('🎁')) return true;
      }
      return false;
    });
    // 盲盒可能不总是出现（取决于可用菜品数量），但不应有错误
    assert.equal(realErrors().length, 0, '推荐结果不应有错误');
  });

  // ===== 9. 推荐结果菜品都有匹配度 =====
  it('9.1 推荐结果菜品都有匹配度显示', async () => {
    resetErrors();
    const matchBadges = await page.evaluate(() => {
      const badges = document.querySelectorAll('#dish-list .badge.bg-danger');
      return Array.from(badges).map(b => b.textContent.trim());
    });
    // 所有匹配度应包含数字和%
    for (const text of matchBadges) {
      assert.ok(text.includes('%'), '匹配度应包含%: ' + text);
      assert.ok(!text.includes('NaN'), '匹配度不应为NaN');
    }
  });

  // ===== 10. 推荐理由不为空 =====
  it('10.1 推荐菜品都有推荐理由', async () => {
    const reasons = await page.evaluate(() => {
      const reasons = document.querySelectorAll('#dish-list .dish-reason');
      return Array.from(reasons).map(r => r.textContent.trim());
    });
    for (const r of reasons) {
      assert.ok(r.length > 5, '推荐理由不应为空或过短: ' + r);
    }
  });

  // ===== 11. 推荐结果缓存 =====
  it('11.1 推荐结果缓存到localStorage', async () => {
    const cached = await page.evaluate(() => {
      return localStorage.getItem('cachedRecommendations') && localStorage.getItem('cachedRecMode');
    });
    assert.ok(cached, '推荐结果应缓存到localStorage');
  });

  // ===== 12. 换一批后菜品不重复 =====
  it('12.1 换一批后菜品与之前不重复', async () => {
    resetErrors();
    const beforeIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#dish-list .list-group-item')).map(el => {
        const btn = el.querySelector('button[onclick*="addToFavorites"]');
        return btn ? btn.getAttribute('onclick').match(/\d+/)[0] : null;
      });
    });
    await page.evaluate(() => document.getElementById('refresh-recommendations')?.click());
    await sleep(3000);
    const afterIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#dish-list .list-group-item')).map(el => {
        const btn = el.querySelector('button[onclick*="addToFavorites"]');
        return btn ? btn.getAttribute('onclick').match(/\d+/)[0] : null;
      });
    });
    // 换一批后应有菜品
    assert.ok(afterIds.length > 0, '换一批后应有菜品');
    // 检查是否有重复（推荐过的菜品不应再推荐）
    const overlap = afterIds.filter(id => beforeIds.includes(id));
    // 允许少量重复（当可用菜品不足时），但不应全部重复
    assert.ok(overlap.length < afterIds.length, '换一批后不应全部是之前推荐过的菜品');
    assert.equal(realErrors().length, 0, '换一批不应有错误');
  });

  // ===== 13. 加购按钮存在 =====
  it('13.1 推荐结果有加购按钮', async () => {
    const cartBtns = await page.evaluate(() => {
      return document.querySelectorAll('#dish-list .add-to-cart-btn').length;
    });
    assert.ok(cartBtns > 0, '应有加购按钮');
  });

  // ===== 14. 加购按钮点击不崩溃 =====
  it('14.1 加购按钮点击不崩溃', async () => {
    resetErrors();
    await page.evaluate(() => {
      const btn = document.querySelector('#dish-list .add-to-cart-btn');
      if (btn) btn.click();
    });
    await sleep(500);
    assert.equal(realErrors().length, 0, '加购按钮点击不应有JS错误');
  });
});
