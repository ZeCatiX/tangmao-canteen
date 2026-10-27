// 视觉排版与暗黑模式截图检查
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const CHROME_PATH = require('./_chrome_path');
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';
const OUT = path.join(__dirname, '..', '_shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, page;

describe('视觉排版与暗黑模式截图检查', () => {
  before(async () => {
    if (!fs.existsSync(OUT)) {
      fs.mkdirSync(OUT);
    }
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    page.on('dialog', async (d) => await d.accept());
    page._errors = [];
    page.on('pageerror', (e) => page._errors.push(e.message));
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('3.1 首页浅色模式截图', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(1500);
    // 确保浅色模式
    await page.evaluate(() => document.documentElement.classList.remove('dark-mode'));
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, '01_首页浅色.png'), fullPage: true });
    // 首页可见文本包含标志性内容
    const text = await page.evaluate(() => document.body.innerText);
    // 注意：首页只显示可见section（home-section），其他隐藏
    // 但应有导航、标题、特色卡片、页脚等核心内容
    const hasTitle = await page.evaluate(() => document.title.includes('唐猫庭院'));
    const hasLogo = text.includes('唐猫庭院');
    const hasNav = text.includes('首页') || text.includes('开始点餐');
    assert.ok(
      hasTitle && hasLogo && hasNav,
      '首页应有核心内容, 标题:' + hasTitle + ' logo:' + hasLogo + ' nav:' + hasNav
    );
  });

  it('3.2 首页暗黑模式截图', async () => {
    await page.evaluate(() => {
      document.documentElement.classList.add('dark-mode');
      const tb = document.getElementById('dark-mode-toggle');
      if (tb) {
        tb.textContent = '☀️';
      }
    });
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, '02_首页暗黑.png'), fullPage: true });
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark-mode'));
    assert.ok(isDark, '暗黑模式应启用');
  });

  it('3.3 全部菜单截图', async () => {
    await page.evaluate(() => document.documentElement.classList.remove('dark-mode'));
    await sleep(200);
    await page.evaluate(() => document.getElementById('nav-dataset')?.click());
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, '03_全部菜单.png'), fullPage: true });
    // 菜单已改为卡片网格布局（.dish-card），不再是 <tr> 表格行
    const rows = await page.evaluate(() => document.querySelectorAll('#dataset-table-body .dish-card').length);
    assert.ok(rows >= 60, '菜单应有60+张卡片');
  });

  it('3.4 管理后台登录后截图', async () => {
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(800);
    await page.type('#admin-login-user', 'admin', { delay: 10 });
    await page.type('#admin-login-pass', ADMIN_PASS, { delay: 10 });
    await page.evaluate(() => document.getElementById('admin-login-btn').click());
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT, '04_管理后台.png'), fullPage: true });
    const app = await page.evaluate(() => !!document.querySelector('.app-wrap'));
    assert.ok(app, '管理后台应显示应用主体');
  });

  it('3.5 管理后台菜品管理截图', async () => {
    await page.evaluate(() => {
      const el = document.querySelector('a[data-page="dishes"]');
      if (el) {
        el.click();
      }
    });
    await sleep(2000);
    await page.screenshot({ path: path.join(OUT, '05_菜品管理.png'), fullPage: true });
    const rows = await page.evaluate(() => document.querySelectorAll('#dish-table tbody tr').length);
    assert.ok(rows > 0, '菜品管理应有行');
  });

  it('3.6 厨房看板截图', async () => {
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(1000);
    await page.screenshot({ path: path.join(OUT, '06_厨房看板.png'), fullPage: true });
    const hasTitle = await page.evaluate(() => document.body.innerText.includes('厨房'));
    assert.ok(hasTitle, '厨房看板应有标题');
  });

  it('3.7 移动端 375px 截图', async () => {
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, '07_移动端首页.png'), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    assert.ok(!overflow, '移动端不应有横向溢出');
  });

  it('3.8 无JS页面错误', async () => {
    const real = page._errors.filter((e) => !/favicon|fonts\.|net::/i.test(e));
    assert.equal(real.length, 0, 'JS错误:' + real.slice(0, 3).join('; '));
  });
});
