// 唐猫庭院 - 排版与无障碍检查 E2E 测试
// 覆盖：页面溢出、空内容、乱码、NaN/undefined显示、图片alt、按钮aria-label
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser, page;

describe('排版与无障碍检查', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new', executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
  });

  after(async () => { if (browser) await browser.close(); });

  // ===== 首页 =====
  it('首页无水平溢出', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, '首页不应水平溢出，溢出量: ' + overflow + 'px');
  });

  it('首页无NaN/undefined显示', async () => {
    const text = await page.evaluate(() => document.body.innerText);
    assert.ok(!text.includes('NaN'), '首页不应显示NaN');
    assert.ok(!text.includes('undefined'), '首页不应显示undefined');
    assert.ok(!text.includes('[object'), '首页不应显示对象引用');
  });

  it('首页图片有alt属性', async () => {
    const noAlt = await page.evaluate(() => {
      // alt="" 是装饰性图片的规范写法(分类圆徽图标旁有可见文字标签),只揪真正缺失 alt 的
      return Array.from(document.querySelectorAll('img'))
        .filter(img => img.getAttribute('alt') === null)
        .map(img => img.src.substring(0, 50));
    });
    assert.equal(noAlt.length, 0, '首页所有图片应有alt属性，缺少: ' + noAlt.join(', '));
  });

  it('首页按钮无空内容（有aria-label或文字或图标）', async () => {
    const emptyButtons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button'))
        .filter(b => {
          const text = b.textContent.trim();
          const hasIcon = b.querySelector('i,svg');
          const hasAriaLabel = b.getAttribute('aria-label');
          return !text && !hasIcon && !hasAriaLabel;
        })
        .map(b => b.id || b.className);
    });
    assert.equal(emptyButtons.length, 0, '首页不应有空按钮，空: ' + emptyButtons.join(', '));
  });

  // ===== 推荐结果页 =====
  it('推荐结果页无水平溢出且无NaN', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => {
      const form = document.getElementById('preference-form');
      form.querySelector('button[type="submit"]').click();
    });
    await sleep(5000);
    const check = await page.evaluate(() => {
      const results = [];
      if (document.body.scrollWidth > window.innerWidth) results.push('溢出: ' + document.body.scrollWidth);
      const text = document.getElementById('recommendation-section')?.innerText || '';
      if (text.includes('NaN')) results.push('NaN');
      if (text.includes('undefined')) results.push('undefined');
      // 检查匹配度徽章
      const badges = document.querySelectorAll('#dish-list .badge');
      badges.forEach(b => {
        const t = b.textContent.trim();
        if (t.includes('NaN') || t.includes('undefined')) results.push('匹配度异常: ' + t);
      });
      return results;
    });
    assert.equal(check.length, 0, '推荐页问题: ' + check.join('; '));
  });

  // ===== 管理后台 =====
  it('管理后台无水平溢出且图片有alt', async () => {
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    await page.type('#admin-login-user', 'admin', { delay: 20 });
    await page.type('#admin-login-pass', ADMIN_PASS, { delay: 20 });
    await page.evaluate(() => document.getElementById('admin-login-btn').click());
    await sleep(2000);
    const check = await page.evaluate(() => {
      const results = [];
      if (document.body.scrollWidth > window.innerWidth) results.push('溢出: ' + document.body.scrollWidth);
      const noAltImgs = Array.from(document.querySelectorAll('img'))
        .filter(img => !img.getAttribute('alt')).map(img => img.id || img.src.substring(0, 30));
      if (noAltImgs.length > 0) results.push('图片无alt: ' + noAltImgs.join(','));
      const text = document.body.innerText;
      if (text.includes('NaN')) results.push('NaN');
      if (text.includes('undefined')) results.push('undefined');
      return results;
    });
    assert.equal(check.length, 0, '管理后台问题: ' + check.join('; '));
  });

  it('管理后台各页面内容非空', async () => {
    const pages = ['dashboard', 'dishes', 'feedback', 'preferences', 'analytics', 'model', 'apidocs', 'users'];
    for (const p of pages) {
      await page.evaluate(pg => document.querySelector('[data-page="' + pg + '"]')?.click(), p);
      await sleep(1000);
      const check = await page.evaluate(() => {
        const visible = document.querySelector('[id^="page-"]:not(.d-none)');
        if (!visible) return '无可见页面';
        const text = visible.textContent.trim();
        if (text.length < 5) return '内容过少: 长度=' + text.length;
        if (text.includes('NaN')) return 'NaN';
        if (text.includes('undefined')) return 'undefined';
        return '';
      });
      assert.equal(check, '', '管理后台页面 ' + p + ' 问题: ' + check);
    }
  });

  // ===== 厨房看板 =====
  it('厨房看板无水平溢出且时间正常', async () => {
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const check = await page.evaluate(() => {
      const results = [];
      if (document.body.scrollWidth > window.innerWidth) results.push('溢出: ' + document.body.scrollWidth);
      const time = document.getElementById('current-time')?.textContent.trim() || '';
      if (!time) results.push('时间未显示');
      if (time.includes('NaN') || time.includes('undefined')) results.push('时间异常: ' + time);
      const text = document.body.innerText;
      if (text.includes('NaN')) results.push('NaN');
      if (text.includes('undefined')) results.push('undefined');
      return results;
    });
    assert.equal(check.length, 0, '厨房看板问题: ' + check.join('; '));
  });

  // ===== 移动端 =====
  it('移动端375px无水平溢出', async () => {
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, '移动端不应水平溢出，溢出量: ' + overflow + 'px');
    await page.setViewport({ width: 1280, height: 800 });
  });

  it('平板端768px无水平溢出', async () => {
    await page.setViewport({ width: 768, height: 1024 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, '平板端不应水平溢出，溢出量: ' + overflow + 'px');
    await page.setViewport({ width: 1280, height: 800 });
  });
});
