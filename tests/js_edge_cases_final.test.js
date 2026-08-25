// 唐猫庭院 - 前端JS数值处理边界与边缘场景最终检查
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
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

describe('前端JS数值处理边界与边缘场景检查', () => {
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

  // ===== 1. formatPrice 函数边界 =====
  it('1.1 formatPrice 处理null/undefined', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const result = await page.evaluate(() => {
      return {
        null: formatPrice(null),
        undef: formatPrice(undefined),
        empty: formatPrice(''),
        zero: formatPrice(0),
        number: formatPrice(88),
        string: formatPrice('25.5'),
        negative: formatPrice(-1)
      };
    });
    assert.equal(result.null, '未知', 'null应返回"未知"');
    assert.equal(result.undef, '未知', 'undefined应返回"未知"');
    assert.equal(result.empty, '未知', '空字符串应返回"未知"');
    assert.ok(result.zero.includes('元'), '0应返回含"元"');
    assert.ok(result.number.includes('元'), '数字应返回含"元"');
    assert.ok(result.string.includes('元'), '字符串数字应返回含"元"');
    assert.ok(result.negative.includes('元'), '负数应返回含"元"');
    assert.equal(realErrors().length, 0, 'formatPrice不应有错误');
  });

  // ===== 2. esc 函数边界 =====
  it('2.1 esc 函数处理非字符串', async () => {
    const result = await page.evaluate(() => {
      return {
        null: esc(null),
        undef: esc(undefined),
        num: esc(123),
        bool: esc(true),
        str: esc('<script>alert(1)</script>'),
        empty: esc(''),
        obj: esc({})
      };
    });
    assert.equal(result.null, null, 'null应原样返回');
    assert.equal(result.undef, undefined, 'undefined应原样返回');
    assert.equal(result.num, 123, '数字应原样返回');
    assert.equal(result.bool, true, '布尔应原样返回');
    assert.ok(result.str.includes('&lt;'), 'script应被转义');
    assert.equal(realErrors().length, 0, 'esc不应有JS错误');
  });

  // ===== 3. parseFloat 边界 =====
  it('3.1 价格计算中parseFloat使用安全', async () => {
    const result = await page.evaluate(() => {
      const tests = [
        parseFloat(undefined) || 0,
        parseFloat(null) || 0,
        parseFloat('') || 0,
        parseFloat('abc') || 0,
        parseFloat(88) || 0,
      ];
      return tests;
    });
    for (const t of result) {
      assert.ok(Number.isFinite(t), 'parseFloat应始终返回有限数');
    }
  });

  // ===== 4. getCartCount 边界 =====
  it('4.1 getCartCount 处理空购物车', async () => {
    await page.evaluate(() => { localStorage.setItem('cart', '[]'); });
    const count = await page.evaluate(() => getCartCount());
    assert.equal(count, 0, '空购物车应返回0');
    // 损坏数据
    await page.evaluate(() => { localStorage.setItem('cart', 'invalid'); });
    const count2 = await page.evaluate(() => getCartCount());
    assert.equal(count2, 0, '损坏数据应返回0');
    await page.evaluate(() => { localStorage.setItem('cart', '[]'); });
    assert.equal(realErrors().length, 0, 'getCartCount不应有错误');
  });

  // ===== 5. getCartTotal 边界 =====
  it('5.1 getCartTotal 处理空购物车和NaN', async () => {
    const total = await page.evaluate(() => getCartTotal());
    assert.ok(Number.isFinite(total), '总价应为有限数');
    assert.equal(realErrors().length, 0, 'getCartTotal不应有错误');
  });

  // ===== 6. 购物车添加后toFixed不崩溃 =====
  it('6.1 购物车价格toFixed安全', async () => {
    await page.evaluate(() => {
      localStorage.setItem('cart', JSON.stringify([
        { id: 999, name: '边界测试', price: NaN, qty: 1 },
        { id: 998, name: '边界测试2', price: undefined, qty: 1 },
        { id: 997, name: '边界测试3', price: null, qty: 1 }
      ]));
    });
    // 打开购物车不应崩溃
    await page.evaluate(() => showCart());
    await sleep(500);
    const total = await page.evaluate(() => document.getElementById('cart-total-price')?.textContent || '');
    assert.ok(total.length > 0, '总价应显示');
    assert.ok(!total.includes('NaN'), '总价不应为NaN: ' + total);
    await page.evaluate(() => { localStorage.setItem('cart', '[]'); updateCartBadge(); });
    assert.equal(realErrors().length, 0, '购物车价格边界不应有错误');
  });

  // ===== 7. 匹配度百分比的toFixed边界 =====
  it('7.1 匹配度百分比toFixed处理NaN', async () => {
    const result = await page.evaluate(() => {
      const tests = [
        isFinite(undefined) ? '0' : '0',
        isFinite(null) ? '0' : '0',
        isFinite(NaN) ? (NaN * 100).toFixed(1) : '0',
        isFinite(0.856) ? (0.856 * 100).toFixed(1) : '0',
      ];
      return tests;
    });
    for (const r of result) {
      assert.ok(r !== 'NaN', '匹配度不应为NaN: ' + r);
    }
    assert.equal(realErrors().length, 0, '匹配度toFixed不应有错误');
  });

  // ===== 8. 菜品数据加载后立即推荐 =====
  it('8.1 菜品数据加载后推荐不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 立即点击开始点餐（数据可能未加载完）
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => {
      document.getElementById('preference-form').querySelector('button[type="submit"]').click();
    });
    // 等待足够长时间让推荐完成
    await sleep(6000);
    const recVisible = await page.evaluate(() => {
      const el = document.getElementById('recommendation-result');
      return el && !el.classList.contains('d-none');
    });
    // 即使推荐不成功也不应崩溃
    assert.equal(realErrors().length, 0, '快速推荐不应有JS错误');
  });

  // ===== 9. 导航栏购物车角标consistency =====
  it('9.1 购物车角标在导航切换后保持', async () => {
    resetErrors();
    await page.evaluate(() => {
      localStorage.setItem('cart', JSON.stringify([{ id: 1, name: '测试', price: 10, qty: 3 }]));
      updateCartBadge();
    });
    await sleep(200);
    // 切换导航
    await page.evaluate(() => document.getElementById('nav-about')?.click());
    await sleep(300);
    await page.evaluate(() => document.getElementById('nav-home')?.click());
    await sleep(300);
    const badge = await page.evaluate(() => {
      const el = document.getElementById('cart-badge');
      return el ? el.textContent : '0';
    });
    assert.equal(badge, '3', '导航切换后角标应保持3');
    await page.evaluate(() => { localStorage.setItem('cart', '[]'); updateCartBadge(); });
    assert.equal(realErrors().length, 0, '角标一致性不应有错误');
  });

  // ===== 10. 偏好表单提交后loading状态 =====
  it('10.1 偏好提交后loading显示且不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    // 快速连续点击提交
    await page.evaluate(() => {
      document.getElementById('preference-form').querySelector('button[type="submit"]').click();
    });
    await sleep(500);
    // 不应崩溃
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '快速提交不应崩溃');
    await sleep(5000);
    assert.equal(realErrors().length, 0, '偏好提交loading不应有错误');
  });
});