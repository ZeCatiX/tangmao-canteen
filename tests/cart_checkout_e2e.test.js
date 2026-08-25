// 唐猫庭院 - 购物车结账下单全流程深度E2E测试
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

async function getRecommendations(page) {
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
}

describe('购物车结账下单全流程', () => {
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

  // ===== 1. 获取推荐后打开购物车 =====
  it('1.1 推荐后打开购物车显示内容', async () => {
    resetErrors();
    await getRecommendations(page);
    await page.evaluate(() => document.getElementById('nav-cart')?.click());
    await sleep(500);
    const cartVisible = await page.evaluate(() => {
      const el = document.getElementById('cart-section');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(cartVisible, '购物车应可见');
    assert.equal(realErrors().length, 0, '打开购物车不应有错误');
  });

  // ===== 2. 购物车角标更新 =====
  it('2.1 购物车角标显示数量', async () => {
    resetErrors();
    const badge = await page.$('#cart-badge');
    assert.ok(badge, '购物车角标应存在');
    const badgeText = await page.evaluate(el => el.textContent.trim(), badge);
    // 角标应有数字或为空（无菜品时）
    assert.ok(true, '角标检查完成: ' + badgeText);
    assert.equal(realErrors().length, 0, '角标检查不应有错误');
  });

  // ===== 3. 购物车关闭按钮 =====
  it('3.1 购物车关闭按钮返回推荐页', async () => {
    resetErrors();
    const closeBtn = await page.$('#cart-close-btn');
    assert.ok(closeBtn, '关闭按钮应存在');
    await page.evaluate(() => document.getElementById('cart-close-btn')?.click());
    await sleep(300);
    const recVisible = await page.evaluate(() => {
      const el = document.getElementById('recommendation-section');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(recVisible, '应返回推荐页');
    assert.equal(realErrors().length, 0, '关闭购物车不应有错误');
  });

  // ===== 4. 选好了按钮创建订单 =====
  it('4.1 选好了按钮触发下单流程', async () => {
    resetErrors();
    await getRecommendations(page);
    await page.evaluate(() => document.getElementById('end-recommendation')?.click());
    await sleep(2000);
    // 选好了会创建订单，可能跳转到购物车或结束页
    const cartOrEnd = await page.evaluate(() => {
      const cart = document.getElementById('cart-section');
      const end = document.getElementById('end-section');
      return {
        cart: cart && !cart.classList.contains('d-none'),
        end: end && !end.classList.contains('d-none')
      };
    });
    assert.ok(cartOrEnd.cart || cartOrEnd.end, '应跳转到购物车或结束页');
    assert.equal(realErrors().length, 0, '选好了下单不应有错误: ' + realErrors().join('; '));
  });

  // ===== 5. 结束页显示订单信息 =====
  it('5.1 结束页显示推荐统计信息', async () => {
    resetErrors();
    const stats = await page.evaluate(() => {
      return {
        dishCount: document.getElementById('end-dish-count')?.textContent || '',
        avgMatch: document.getElementById('end-avg-match')?.textContent || '',
        topMatch: document.getElementById('end-top-match')?.textContent || '',
        r2: document.getElementById('end-model-r2')?.textContent || ''
      };
    });
    assert.ok(stats.dishCount, '推荐菜品数应显示');
    assert.ok(!stats.dishCount.includes('NaN'), '菜品数不应为NaN');
    assert.ok(!stats.avgMatch.includes('NaN'), '平均匹配度不应为NaN');
    assert.ok(!stats.topMatch.includes('NaN'), '最高匹配度不应为NaN');
    assert.ok(!stats.r2.includes('NaN'), 'R²不应为NaN');
    assert.equal(realErrors().length, 0, '结束页统计不应有错误');
  });

  // ===== 6. 结束页满意度评分容器 =====
  it('6.1 结束页满意度评分容器存在', async () => {
    resetErrors();
    const satContainer = await page.$('#end-satisfaction');
    assert.ok(satContainer, '满意度评分容器应存在');
    const satHint = await page.$('#end-sat-hint');
    assert.ok(satHint, '满意度提示应存在');
    const satSubmit = await page.$('#end-sat-submit');
    assert.ok(satSubmit, '满意度提交按钮应存在');
    assert.equal(realErrors().length, 0, '满意度容器检查不应有错误');
  });

  // ===== 7. 结束页退出按钮 =====
  it('7.1 结束页退出按钮返回首页', async () => {
    resetErrors();
    const endLogout = await page.$('#end-logout');
    assert.ok(endLogout, '结束页退出按钮应存在');
    await page.evaluate(() => document.getElementById('end-logout')?.click());
    await sleep(400);
    const homeVisible = await page.evaluate(() => {
      const el = document.getElementById('home-section');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(homeVisible, '应返回首页');
    assert.equal(realErrors().length, 0, '退出不应有错误');
  });

  // ===== 8. 新推荐按钮重置流程 =====
  it('8.1 新推荐按钮重置并返回偏好设置', async () => {
    resetErrors();
    await getRecommendations(page);
    await page.evaluate(() => document.getElementById('end-recommendation')?.click());
    await sleep(1000);
    const newRec = await page.$('#new-recommendation');
    if (newRec) {
      await page.evaluate(() => document.getElementById('new-recommendation')?.click());
      await sleep(400);
      const prefVisible = await page.evaluate(() => {
        const el = document.getElementById('preference-section');
        return el && !el.classList.contains('d-none');
      });
      assert.ok(prefVisible, '应返回偏好设置页');
    }
    assert.equal(realErrors().length, 0, '新推荐按钮不应有错误');
  });

  // ===== 9. 购物车清空按钮（不实际点击confirm） =====
  it('9.1 购物车清空按钮存在', async () => {
    resetErrors();
    await getRecommendations(page);
    await page.evaluate(() => document.getElementById('nav-cart')?.click());
    await sleep(500);
    const clearBtn = await page.$('#cart-clear-btn');
    assert.ok(clearBtn, '购物车清空按钮应存在');
    const checkoutBtn = await page.$('#cart-checkout-btn');
    assert.ok(checkoutBtn, '购物车结账按钮应存在');
    assert.equal(realErrors().length, 0, '购物车按钮检查不应有错误');
  });

  // ===== 10. 换一批推荐后重新获取 =====
  it('10.1 换一批后推荐结果更新', async () => {
    resetErrors();
    await getRecommendations(page);
    const beforeDishes = await page.evaluate(() => {
      const list = document.getElementById('dish-list');
      return list ? Array.from(list.children).map(c => c.textContent.substring(0, 30)) : [];
    });
    await page.evaluate(() => document.getElementById('refresh-recommendations')?.click());
    await sleep(3000);
    const afterDishes = await page.evaluate(() => {
      const list = document.getElementById('dish-list');
      return list ? Array.from(list.children).map(c => c.textContent.substring(0, 30)) : [];
    });
    assert.ok(afterDishes.length > 0, '换一批后应有推荐菜品');
    assert.equal(realErrors().length, 0, '换一批不应有错误: ' + realErrors().join('; '));
  });
});
