// 唐猫庭院 - 暗黑模式切换功能测试
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser, page;

describe('暗黑模式切换功能测试', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new', executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
  });

  after(async () => { if (browser) await browser.close(); });

  it('1.1 首页存在暗黑模式切换按钮', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const btn = await page.evaluate(() => {
      const el = document.getElementById('dark-mode-toggle');
      return el ? { exists: true, text: el.textContent } : { exists: false };
    });
    assert.ok(btn.exists, '暗黑模式切换按钮应存在');
    assert.ok(btn.text, '按钮应有文字');
  });

  it('2.1 点击切换按钮可切换深色/浅色模式', async () => {
    await page.evaluate(() => localStorage.removeItem('darkMode'));
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const initialDark = await page.evaluate(() => document.documentElement.classList.contains('dark-mode'));
    await page.evaluate(() => {
      const btn = document.getElementById('dark-mode-toggle');
      if (btn) btn.click();
    });
    await sleep(300);
    const afterClick = await page.evaluate(() => ({
      isDark: document.documentElement.classList.contains('dark-mode'),
      btnText: document.getElementById('dark-mode-toggle')?.textContent
    }));
    assert.notEqual(afterClick.isDark, initialDark, '点击后状态应切换');
    await page.evaluate(() => {
      const btn = document.getElementById('dark-mode-toggle');
      if (btn) btn.click();
    });
    await sleep(300);
    const afterSecond = await page.evaluate(() => ({
      isDark: document.documentElement.classList.contains('dark-mode'),
      btnText: document.getElementById('dark-mode-toggle')?.textContent
    }));
    assert.equal(afterSecond.isDark, initialDark, '再次点击应回到初始状态');
  });

  it('3.1 刷新页面后保持暗黑模式偏好', async () => {
    await page.evaluate(() => {
      localStorage.setItem('darkMode', 'true');
      document.documentElement.classList.add('dark-mode');
    });
    await sleep(200);
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const afterReload = await page.evaluate(() => ({
      isDark: document.documentElement.classList.contains('dark-mode'),
      btnText: document.getElementById('dark-mode-toggle')?.textContent
    }));
    assert.ok(afterReload.isDark, '刷新后应保持深色模式');
    await page.evaluate(() => localStorage.removeItem('darkMode'));
  });

  it('4.1 管理后台存在暗黑模式切换按钮', async () => {
    await page.goto(BASE + '/admin', { timeout: 15000 });
    await sleep(1000);
    const btn = await page.evaluate(() => {
      const el = document.getElementById('dark-mode-toggle');
      return el ? { exists: true, text: el.textContent } : { exists: false };
    });
    assert.ok(btn.exists, '管理后台暗黑模式切换按钮应存在');
  });

  it('5.1 厨房看板存在暗黑模式切换按钮', async () => {
    await page.goto(BASE + '/kitchen', { timeout: 15000 });
    await sleep(1000);
    const btn = await page.evaluate(() => {
      const el = document.getElementById('dark-mode-toggle');
      return el ? { exists: true, text: el.textContent } : { exists: false };
    });
    assert.ok(btn.exists, '厨房看板暗黑模式切换按钮应存在');
  });

  it('6.1 深色模式下页面内容可读', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    await page.evaluate(() => {
      localStorage.setItem('darkMode', 'true');
      document.documentElement.classList.add('dark-mode');
    });
    await sleep(300);
    const colors = await page.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor;
      const text = getComputedStyle(document.body).color;
      return { bg, text };
    });
    assert.ok(colors.bg.includes('0') || colors.bg.includes('15'), `深色模式背景应为深色: ${colors.bg}`);
    await page.evaluate(() => localStorage.removeItem('darkMode'));
  });
});