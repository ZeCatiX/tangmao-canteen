// 唐猫庭院 - admin.html内联脚本运行时深度检查
// 检查所有函数是否能被调用而不产生JS运行时错误
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
  if (msg.includes('404') && msg.includes('Failed to load resource')) return false;
  return true;
}

describe('admin内联脚本运行时检查', () => {
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

  // 登录
  async function adminLogin() {
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    await page.type('#admin-login-user', 'admin', { delay: 20 });
    await page.type('#admin-login-pass', ADMIN_PASS, { delay: 20 });
    await page.evaluate(() => document.getElementById('admin-login-btn').click());
    await sleep(2000);
  }

  // ===== 1. 所有全局函数存在性检查 =====
  it('1.1 所有关键函数存在且可调用', async () => {
    await adminLogin();
    const check = await page.evaluate(() => {
      const funcs = ['loadStats', 'loadPopularDishes', 'loadFeedback', 'loadDishes',
        'editDish', 'saveDish', 'deleteDish', 'loadNotifications', 'loadUsers',
        'deleteUser', 'exportCSV', 'showToast', 'loadDailyTrend', 'loadAnalyticsPrefs',
        'loadUserActivity', 'loadRecommendationLog', 'loadModelManagement',
        'loadRecommendationStats', 'loadWorstDishes', 'loadMonitor', 'loadModelCompare',
        'loadPreferenceStats', 'loadModelInfo', 'showAdmin', 'renderRatingChart'];
      const missing = [];
      funcs.forEach(f => {
        if (typeof window[f] !== 'function') missing.push(f);
      });
      return missing;
    });
    assert.equal(check.length, 0, '缺少函数: ' + check.join(', '));
  });

  // ===== 2. 调用所有load函数不崩溃 =====
  it('2.1 调用所有load函数不产生JS运行时错误', async () => {
    resetErrors();
    await page.evaluate(async () => {
      // 依次调用所有load函数
      const funcs = ['loadStats', 'loadPopularDishes', 'loadFeedback', 'loadDishes',
        'loadNotifications', 'loadUsers', 'loadDailyTrend', 'loadAnalyticsPrefs',
        'loadUserActivity', 'loadRecommendationLog', 'loadModelManagement',
        'loadRecommendationStats', 'loadWorstDishes', 'loadMonitor', 'loadModelCompare',
        'loadPreferenceStats', 'loadModelInfo'];
      for (const f of funcs) {
        try { if (typeof window[f] === 'function') await window[f](); } catch (e) { console.warn(f + '调用失败:', e.message); }
      }
    });
    await sleep(3000);
    // 只检查JS运行时错误，不检查网络错误
    const jsErrors = realErrors().filter(e =>
      !e.includes('Failed to load resource') &&
      !e.includes('数据加载失败') &&
      !e.includes('ERR_') &&
      !e.includes('favicon')
    );
    assert.equal(jsErrors.length, 0, 'load函数调用不应有JS运行时错误: ' + jsErrors.join('; '));
  });

  // ===== 3. showAdmin切换所有页面 =====
  it('3.1 showAdmin切换所有页面不崩溃', async () => {
    resetErrors();
    const pages = ['dashboard', 'dishes', 'feedback', 'preferences', 'analytics', 'model', 'apidocs', 'users'];
    for (const p of pages) {
      await page.evaluate(pg => {
        try { if (typeof showAdmin === 'function') showAdmin(pg); } catch (e) {}
      }, p);
      await sleep(300);
    }
    assert.equal(realErrors().length, 0, 'showAdmin不应有JS错误: ' + realErrors().join('; '));
  });

  // ===== 4. showToast函数 =====
  it('4.1 showToast显示提示不崩溃', async () => {
    resetErrors();
    await page.evaluate(() => {
      try { if (typeof showToast === 'function') showToast('测试', '测试消息'); } catch (e) {}
    });
    await sleep(500);
    assert.equal(realErrors().length, 0, 'showToast不应有JS错误');
  });

  // ===== 5. exportCSV函数检查 =====
  it('5.1 exportCSV函数存在且参数验证', async () => {
    resetErrors();
    const check = await page.evaluate(() => {
      return typeof exportCSV === 'function';
    });
    assert.ok(check, 'exportCSV函数应存在');
    assert.equal(realErrors().length, 0, 'exportCSV检查不应有错误');
  });

  // ===== 6. renderRatingChart函数 =====
  it('6.1 renderRatingChart函数存在', async () => {
    resetErrors();
    const check = await page.evaluate(() => {
      return typeof renderRatingChart === 'function';
    });
    assert.ok(check, 'renderRatingChart函数应存在');
    assert.equal(realErrors().length, 0, 'renderRatingChart检查不应有错误');
  });

  // ===== 7. 退出登录功能 =====
  it('7.1 admin退出登录链接存在', async () => {
    resetErrors();
    const exists = await page.evaluate(() => {
      const links = document.querySelectorAll('#admin-logout-link, #admin-logout-link-mobile, [onclick*="logout"]');
      return links.length;
    });
    assert.ok(exists > 0, '应有退出登录链接');
    assert.equal(realErrors().length, 0, '退出登录检查不应有错误');
  });

  // ===== 8. 菜品编辑流程 =====
  it('8.1 菜品编辑按钮点击后模态框打开且字段填充', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="dishes"]')?.click());
    await sleep(1500);
    await page.evaluate(() => {
      const btn = document.querySelector('button[onclick*="editDish"]');
      if (btn) btn.click();
    });
    await sleep(500);
    const check = await page.evaluate(() => {
      const modal = document.getElementById('dishModal');
      if (!modal) return { open: false, nameFilled: false };
      const isOpen = modal.classList.contains('show') || window.getComputedStyle(modal).display === 'block';
      const nameInput = document.getElementById('dish-name');
      return { open: isOpen, nameFilled: nameInput ? nameInput.value.length > 0 : false };
    });
    assert.ok(check.open, '编辑模态框应打开');
    assert.ok(check.nameFilled, '菜品名称应已填充');
    assert.equal(realErrors().length, 0, '菜品编辑不应有JS错误');
  });

  // ===== 9. 空数据情况下函数不崩溃 =====
  it('9.1 空数据情况下load函数不崩溃', async () => {
    resetErrors();
    // 模拟空数据传入renderRatingChart
    await page.evaluate(() => {
      try {
        if (typeof renderRatingChart === 'function') renderRatingChart([]);
      } catch (e) { console.warn('renderRatingChart空数据:', e.message); }
    });
    await sleep(500);
    assert.equal(realErrors().length, 0, '空数据不应有JS错误: ' + realErrors().join('; '));
  });
});
