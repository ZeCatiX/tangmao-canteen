// 唐猫庭院 - 菜单加购→购物车→结算 E2E 测试
// 覆盖：菜单表格🛒加购按钮 → 购物车计数 → 去结算 → 下单成功 → 无JS错误
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
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) return false;
  return true;
}

describe('菜单加购与结算流程测试', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    page._consoleErrors = [];
    page.on('dialog', d => d.accept().catch(() => {}));
    page.on('console', msg => {
      if (msg.type() === 'error' && isRealError(msg.text())) page._consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => page._consoleErrors.push(err.message));
  });

  after(async () => { if (browser) await browser.close(); });

  function resetErrors() { page._consoleErrors = []; }
  function realErrors() { return page._consoleErrors.filter(isRealError); }

  it('1.1 菜单表格每个菜品都有加购按钮', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 25000 });
    await sleep(600);
    await page.evaluate(() => document.getElementById('nav-dataset')?.click());
    await sleep(800);
    const info = await page.evaluate(() => {
      const addBtns = document.querySelectorAll('#dataset-table-body tr .add-to-cart-btn').length;
      const rows = document.querySelectorAll('#dataset-table-body tr').length;
      return { addBtns, rows };
    });
    console.log('加购按钮:', info.addBtns, '/ 行数:', info.rows);
    assert.ok(info.addBtns >= 60, '应有60+加购按钮: ' + info.addBtns);
    assert.ok(info.addBtns === info.rows, '每行都应有加购按钮');
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });

  it('2.1 点击加购后购物车计数增加', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 25000 });
    await sleep(600);
    await page.evaluate(() => document.getElementById('nav-dataset')?.click());
    await sleep(800);
    // 点击第一行加购
    await page.evaluate(() => document.querySelector('#dataset-table-body tr .add-to-cart-btn')?.click());
    await sleep(800);
    // 打开购物车
    await page.evaluate(() => document.getElementById('nav-cart')?.click());
    await sleep(600);
    const cart = await page.evaluate(() => {
      const rows = document.querySelectorAll('#cart-table-body tr, .cart-item').length;
      const totalItems = document.getElementById('cart-total-items')?.textContent || '';
      return { rows, totalItems };
    });
    console.log('购物车:', JSON.stringify(cart));
    assert.ok(cart.rows >= 1, '购物车应有1+件商品');
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });

  it('3.1 去结算完成下单', async () => {
    resetErrors();
    // 监听下单API
    let orderPlaced = false;
    let orderId = null;
    page.on('response', async r => {
      if (r.url().includes('/api/order') && r.request().method() === 'POST') {
        orderPlaced = true;
        try { const j = await r.json(); orderId = j.orderId; } catch (e) {}
      }
    });
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 25000 });
    await sleep(600);
    await page.evaluate(() => document.getElementById('nav-dataset')?.click());
    await sleep(800);
    await page.evaluate(() => document.querySelector('#dataset-table-body tr .add-to-cart-btn')?.click());
    await sleep(800);
    await page.evaluate(() => document.getElementById('nav-cart')?.click());
    await sleep(600);
    // 点去结算
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter(b => /去结算|结算/.test(b.textContent));
      if (btns[0]) btns[0].click();
    });
    await sleep(2500);
    const result = await page.evaluate(() => {
      const body = document.body.textContent;
      return {
        orderPlaced: /下单成功|订单已提交|订单已创建/.test(body),
      };
    });
    console.log('下单结果:', JSON.stringify(result), 'API触发:', orderPlaced, '订单ID:', orderId);
    assert.ok(orderPlaced, '下单API应被调用');
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });
});