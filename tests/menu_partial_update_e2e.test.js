// 唐猫庭院 - 菜单加购局部刷新 E2E 测试
// 回归: 加购/改数量只原位更新受影响菜品卡(节点不重建),不再触发 renderMenuTable 全量重绘
// (LayoutObserver 登记项: 弹窗内加购触发菜单全量重绘 0.162 布局位移闪烁)
require('dotenv').config();
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = require('./_chrome_path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, page;

function isRealError(msg) {
  if (msg.includes('fonts.googleapis.com') || msg.includes('fonts.gstatic.com')) {
    return false;
  }
  if (msg.match(/\b[4-5]\d{2}\b/)) {
    return false;
  }
  return true;
}

describe('菜单加购局部刷新', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 412, height: 915 });
    page._err = [];
    page.on('pageerror', (e) => page._err.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && isRealError(m.text())) {
        page._err.push(m.text());
      }
    });
  });
  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('进店选打包带走,进入菜单', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('logo-intro-overlay')?.click());
    await sleep(500);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(600);
    await page.evaluate(() => document.getElementById('table-takeaway')?.click());
    await sleep(800);
    const active = await page.evaluate(() => document.getElementById('dataset-section')?.classList.contains('active'));
    assert.ok(active, '应进入菜单视图');
  });

  it('首次加入:＋加入原位换步进器,菜品卡节点不重建(哨兵保留)', async () => {
    await page.evaluate(() => window.scrollTo(0, 1200));
    await sleep(300);
    const before = await page.evaluate(() => {
      const b = document.querySelector('#dataset-table-body .add-to-cart-btn');
      if (!b) {
        return null;
      }
      const card = b.closest('.dish-card');
      card.dataset.keepme = '1';
      return { id: b.dataset.id, scroll: window.scrollY };
    });
    assert.ok(before, '视口内应有可加购菜品');
    await page.evaluate(
      (id) => document.querySelector('#dataset-table-body .add-to-cart-btn[data-id="' + id + '"]').click(),
      before.id
    );
    await sleep(400);
    const after = await page.evaluate((id) => {
      const card = document.querySelector('#dataset-table-body .dish-card[data-keepme="1"]');
      const span = card?.querySelector('.cart-qty-minus[data-id="' + id + '"] + span');
      return {
        kept: !!card,
        span: span ? span.textContent : null,
        scroll: window.scrollY,
        cart: JSON.parse(localStorage.getItem('cart') || '[]').map((c) => c.id + 'x' + c.qty),
      };
    }, before.id);
    assert.ok(after.kept, '菜品卡节点应保留(局部更新),全量重绘会重建节点丢失哨兵');
    assert.equal(after.span, '1', '步进器数量应为 1,实际: ' + after.span);
    // ±加入→步进器存在控件高度差(与旧全量重绘同源),滚动允许 ≤32px 漂移;关键是不做全表重绘
    assert.ok(
      Math.abs(after.scroll - before.scroll) <= 32,
      '滚动漂移应 ≤32px,实际 ' + (after.scroll - before.scroll) + 'px'
    );
    assert.equal(after.cart.length, 1, '购物车应有 1 项');
    assert.equal(page._err.length, 0, '不应有控制台错误: ' + page._err.join('; '));
  });

  it('步进器加减:数量文本原地更新,节点继续保留', async () => {
    const plus = await page.evaluate(() => {
      const b = document.querySelector('#dataset-table-body .cart-qty-plus');
      const card = b.closest('.dish-card');
      card.dataset.keepme2 = '1';
      b.click();
      return { scroll: window.scrollY };
    });
    await sleep(350);
    const r2 = await page.evaluate(() => {
      const card = document.querySelector('#dataset-table-body .dish-card[data-keepme2="1"]');
      const span = card?.querySelector('.cart-qty-minus + span');
      return { kept: !!card, span: span?.textContent, scroll: window.scrollY };
    });
    assert.ok(r2.kept, '节点应保留');
    assert.equal(r2.span, '2', '加号后数量应为 2');
    assert.ok(
      Math.abs(r2.scroll - plus.scroll) <= 8,
      '纯文本更新滚动漂移应 ≤8px,实际 ' + (r2.scroll - plus.scroll) + 'px'
    );
    assert.equal(page._err.length, 0, '不应有控制台错误');
  });
});
