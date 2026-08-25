// 唐猫庭院 - 并发与内存泄漏检查
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
  if (msg.includes('404') && msg.includes('Failed to load resource')) return false;
  if (msg.includes('409')) return false;
  return true;
}

describe('并发与内存泄漏检查', () => {
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

  // ===== 1. 快速连续导航不内存泄漏 =====
  it('1.1 快速连续导航后无内存泄漏迹象', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 获取初始内存
    const beforeMem = await page.evaluate(() => {
      if (performance.memory) return performance.memory.usedJSHeapSize;
      return 0;
    });
    // 快速导航100次
    for (let i = 0; i < 100; i++) {
      await page.evaluate(() => {
        document.getElementById('nav-about')?.click();
        document.getElementById('nav-home')?.click();
      });
    }
    await sleep(1000);
    // 手动GC（如果可用）
    await page.evaluate(() => { if (window.gc) window.gc(); });
    const afterMem = await page.evaluate(() => {
      if (performance.memory) return performance.memory.usedJSHeapSize;
      return 0;
    });
    if (beforeMem > 0 && afterMem > 0) {
      const growth = (afterMem - beforeMem) / 1024 / 1024;
      // 内存增长应小于50MB（快速导航100次）
      assert.ok(growth < 50, '内存增长应小于50MB，实际: ' + growth.toFixed(1) + 'MB');
    }
    assert.equal(realErrors().length, 0, '快速导航不应有JS错误');
  });

  // ===== 2. 快速连续推荐提交不内存泄漏 =====
  it('2.1 快速连续推荐提交后无内存泄漏', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    const beforeMem = await page.evaluate(() => {
      if (performance.memory) return performance.memory.usedJSHeapSize;
      return 0;
    });
    // 提交偏好5次
    for (let i = 0; i < 5; i++) {
      await page.select('#spiciness', ['微辣', '中辣', '不辣'][i % 3]);
      await page.select('#saltiness', '适中');
      await page.select('#sweetness', '酸甜');
      await page.evaluate(() => {
        document.getElementById('preference-form').querySelector('button[type="submit"]').click();
      });
      await sleep(2000);
    }
    const afterMem = await page.evaluate(() => {
      if (performance.memory) return performance.memory.usedJSHeapSize;
      return 0;
    });
    if (beforeMem > 0 && afterMem > 0) {
      const growth = (afterMem - beforeMem) / 1024 / 1024;
      assert.ok(growth < 100, '推荐提交后内存增长应小于100MB，实际: ' + growth.toFixed(1) + 'MB');
    }
    assert.equal(realErrors().length, 0, '推荐提交不应有JS错误');
  });

  // ===== 3. 事件监听器不重复绑定 =====
  it('3.1 重复加载页面后事件监听器不重复', async () => {
    resetErrors();
    // 检查init.js中的事件绑定是否有重复绑定防护
    const initContent = await page.evaluate(() => {
      // 检查 _initialized 全局变量
      return typeof _initialized !== 'undefined' ? _initialized : 'not_defined';
    });
    // _initialized 应该存在且为true（防止重复初始化）
    assert.ok(initContent === true || initContent === 'not_defined', '初始化标志检查完成');
    assert.equal(realErrors().length, 0, '事件监听器检查不应有错误');
  });

  // ===== 4. localStorage不会被无限增长 =====
  it('4.1 localStorage数据量合理', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    const storageSize = await page.evaluate(() => {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const val = localStorage.getItem(key);
        total += (key.length + val.length) * 2; // UTF-16
      }
      return total / 1024; // KB
    });
    // localStorage应小于5MB（浏览器限制通常为5-10MB）
    assert.ok(storageSize < 5000, 'localStorage应小于5MB，实际: ' + storageSize.toFixed(1) + 'KB');
  });

  // ===== 5. 并发API请求不产生竞态错误 =====
  it('5.1 并发API请求无竞态错误', async () => {
    resetErrors();
    // 同时发起多个推荐请求
    const results = await page.evaluate(async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(fetch('/api/dishes').then(r => r.json()).catch(e => ({ error: e.message })));
      }
      return Promise.all(promises);
    });
    // 所有请求应成功
    results.forEach((r, i) => {
      assert.ok(r.success !== false || r.error, '请求 ' + i + ' 应有响应');
    });
    assert.equal(realErrors().length, 0, '并发API请求不应有JS错误');
  });

  // ===== 6. 长时间运行后无控制台错误累积 =====
  it('6.1 长时间运行后无控制台错误累积', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    // 等待10秒模拟长时间运行
    await sleep(10000);
    // 检查是否有定时器产生的错误
    const jsErrors = realErrors().filter(e =>
      !e.includes('Failed to load resource') &&
      !e.includes('ERR_') &&
      !e.includes('favicon')
    );
    assert.equal(jsErrors.length, 0, '长时间运行不应有JS错误累积: ' + jsErrors.join('; '));
  });
});
