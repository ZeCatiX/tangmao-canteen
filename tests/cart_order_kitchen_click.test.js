// 购物车→结算→下单→厨房看板 完整用户路径模拟点击E2E
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, page;

describe('购物车结算与厨房看板模拟点击检查', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    // 确认类对话框默认接受（模拟用户点"确定"）
    page.on('dialog', async (d) => {
      const msg = d.message() || '';
      console.log('  [对话框]', msg.slice(0, 40));
      await d.accept();
    });
    page._errors = [];
    page.on('pageerror', (e) => page._errors.push(e.message));
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('2.1 从菜单加购菜品到购物车', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(1500);
    await page.evaluate(() => document.getElementById('nav-dataset').click());
    await sleep(1000);
    // 点击第一行的加购按钮
    const clicked = await page.evaluate(() => {
      const row = document.querySelector('#dataset-table-body .dish-card');
      if (!row) {
        return 'no-row';
      }
      const btn = row.querySelector('.btn');
      if (!btn) {
        return 'no-btn';
      }
      btn.click();
      return 'clicked:' + btn.textContent.trim().slice(0, 10);
    });
    await sleep(800);
    const badge = await page.evaluate(() => {
      const b = document.getElementById('cart-badge');
      return b ? b.textContent : 'no-badge';
    });
    console.log('加购结果:', clicked, '徽标:', badge);
    assert.ok(clicked.startsWith('clicked'), '应能点击加购按钮');
  });

  it('2.2 打开购物车查看商品', async () => {
    await page.evaluate(() => document.getElementById('nav-cart').click());
    await sleep(800);
    const cartState = await page.evaluate(() => {
      const sec = document.getElementById('cart-section');
      const rows = document.querySelectorAll('#cart-table-body tr').length;
      return { active: sec ? sec.classList.contains('active') : false, rows };
    });
    assert.ok(cartState.active, '购物车section应激活');
    assert.ok(cartState.rows >= 1, '购物车应有商品行');
  });

  it('2.3 购物车数量加减', async () => {
    // 2026-10-06:购物车行内首个 input 是备注框,数量读写用专用类;+号类名为 cart-qty-plus
    const beforeCount = await page.evaluate(() => {
      const input = document.querySelector('#cart-table-body .cart-qty-input');
      return input ? input.value : null;
    });
    // 点击+号
    await page.evaluate(() => {
      const btn = document.querySelector('#cart-table-body .cart-qty-plus');
      if (btn) {
        btn.click();
      }
    });
    await sleep(500);
    const afterCount = await page.evaluate(() => {
      const input = document.querySelector('#cart-table-body .cart-qty-input');
      return input ? input.value : null;
    });
    console.log('数量:', beforeCount, '->', afterCount);
    assert.ok(afterCount && parseInt(afterCount) >= 1, '数量应有效');
  });

  it('2.4 清空购物车', async () => {
    await page.evaluate(() => document.getElementById('cart-clear-btn')?.click());
    await sleep(500);
    const rows = await page.evaluate(() => document.querySelectorAll('#cart-table-body tr').length);
    assert.ok(rows === 0, '清空后购物车应无商品，实际:' + rows);
  });

  it('2.5 游客下单完整流程', async () => {
    // 重新加购一个商品(卡片布局选择器)
    await page.evaluate(() => document.getElementById('nav-dataset').click());
    await sleep(800);
    await page.evaluate(() => {
      const card = document.querySelector('#dataset-table-body .dish-card');
      const btn = card ? card.querySelector('.add-to-cart-btn') : null;
      if (btn) {
        btn.click();
      }
    });
    await sleep(600);
    // 打开购物车结算
    await page.evaluate(() => document.getElementById('nav-cart').click());
    await sleep(600);
    await page.evaluate(() => document.getElementById('cart-checkout-btn')?.click());
    await sleep(800);
    // 选桌层弹出:选 08,验证选完桌号自动续结算
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#table-picker-modal button')].find(function (x) {
        return x.textContent.trim() === '08';
      });
      if (b) {
        b.click();
      }
    });
    await sleep(4000);
    const state = await page.evaluate(() => {
      const modal = document.getElementById('modal-title');
      const body = document.getElementById('modal-body');
      const home = document.getElementById('home-section');
      return {
        modalTitle: modal ? modal.textContent : 'no-modal',
        modalBody: body ? body.textContent.slice(0, 30) : 'no-body',
        homeActive: home ? home.classList.contains('active') : false,
        endActive: (document.getElementById('end-section') || {}).classList?.contains('active') || false,
        orderId: sessionStorage.getItem('lastOrderId') || '',
      };
    });
    console.log('下单结果:', JSON.stringify(state));
    // 下单成功显示"下单成功"模态框，或跳转回首页
    // 成功形态:进入订单完成页(end-section)且订单已创建(2026-09-17 对齐现行 UX)
    assert.ok(state.endActive && state.orderId, '下单成功应进入订单完成页,实际:' + JSON.stringify(state));
  });

  it('2.6 厨房看板可登录并加载', async () => {
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(1000);
    const hasLogin = await page.evaluate(() => {
      const u = document.getElementById('login-user');
      const p = document.getElementById('login-pass');
      const b = document.getElementById('login-btn');
      return !!(u && p && b);
    });
    assert.ok(hasLogin, '厨房看板应有登录表单');
    if (hasLogin) {
      await page.type('#login-user', 'admin', { delay: 10 });
      await page.type('#login-pass', ADMIN_PASS, { delay: 10 });
      await page.evaluate(() => document.getElementById('login-btn').click());
      await sleep(2500);
      const loaded = await page.evaluate(() => {
        const list = document.getElementById('order-list');
        const title = document.body.innerText.includes('厨房');
        return { list: !!list, title, bodyLen: document.body.innerText.length };
      });
      console.log('厨房看板:', JSON.stringify(loaded));
      assert.ok(loaded.title, '厨房看板应显示标题');
    }
  });

  it('2.7 全流程无页面JS错误', async () => {
    const real = page._errors.filter((e) => !/favicon|fonts\.|net::/i.test(e));
    assert.equal(real.length, 0, 'JS错误:' + real.slice(0, 3).join('; '));
  });
});
