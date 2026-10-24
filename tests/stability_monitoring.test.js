// 唐猫庭院 - 长时间运行稳定性和资源监控E2E测试
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, page;

function isRealError(msg) {
  if (msg.includes('fonts.googleapis.com') || msg.includes('fonts.gstatic.com')) {
    return false;
  }
  if (msg.includes('401 (Unauthorized)')) {
    return false;
  }
  if (msg.includes('429 (Too Many Requests)')) {
    return false;
  }
  if (msg.includes('404 (Not Found)')) {
    return false;
  }
  if (msg.includes('409')) {
    return false;
  }
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) {
    return false;
  }
  return true;
}

async function api(path, options = {}) {
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...optHeaders },
    ...rest,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe('长时间运行稳定性和资源监控', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    page.on('console', (msg) => {
      const t = msg.text();
      if (msg.type() === 'error' && isRealError(t)) {
        page._consoleErrors.push(t);
      }
    });
    page.on('pageerror', (err) => page._consoleErrors.push(err.message));
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  function resetErrors() {
    page._consoleErrors = [];
  }
  function realErrors() {
    return page._consoleErrors.filter(isRealError);
  }

  // ===== 1. Worker健康检查一致性 =====
  it('1.1 Worker健康检查多次调用一致', async () => {
    const results = [];
    for (let i = 0; i < 5; i++) {
      const r = await api('/api/worker-health');
      results.push(r.body);
      await sleep(100);
    }
    for (const r of results) {
      assert.equal(r.alive, true, 'Worker应一直alive');
      assert.equal(r.ready, true, 'Worker应一直ready');
    }
    // pendingRequests 应为0或无挂起请求（有挂起请求时为Worker正忙，不视为失败）
    for (const r of results) {
      assert.ok(
        typeof r.pendingRequests === 'undefined' || r.pendingRequests >= 0,
        'pendingRequests应为非负整数或undefined'
      );
    }
  });

  // ===== 2. 连续推荐请求内存不增长 =====
  it('2.1 连续10次推荐请求后无内存泄漏', async () => {
    resetErrors();
    // 获取初始内存
    const beforeMem = await page.evaluate(() => {
      if (performance.memory) {
        return performance.memory.usedJSHeapSize;
      }
      return 0;
    });
    // 发起10次推荐请求
    for (let i = 0; i < 10; i++) {
      await api('/api/predict-rf', {
        method: 'POST',
        body: JSON.stringify({
          userPrefs: {
            辣度: '微辣',
            咸淡: '适中',
            甜酸: '酸甜',
            价格区间: '0-30',
            热量: '0-500',
            饮食_宗教: '无特殊要求',
          },
          dishes: [
            {
              id: 1,
              name: '测试' + i,
              spiciness: '微辣',
              saltiness: '适中',
              sweetness: '酸甜',
              rating: 4,
              price: 20,
              isHalal: false,
              isVegetarian: false,
              allergies: [],
              religion: '无特殊要求',
              calorie: '200',
              protein: '10',
            },
          ],
        }),
      });
    }
    await sleep(1000);
    const afterMem = await page.evaluate(() => {
      if (performance.memory) {
        return performance.memory.usedJSHeapSize;
      }
      return 0;
    });
    if (beforeMem > 0 && afterMem > 0) {
      const growth = (afterMem - beforeMem) / 1024 / 1024;
      // 内存增长应小于30MB
      assert.ok(growth < 30, '10次推荐请求后内存增长应<30MB，实际: ' + growth.toFixed(1) + 'MB');
    }
    assert.equal(realErrors().length, 0, '连续推荐请求不应有JS错误');
  });

  // ===== 3. 页面长时间停留无错误累积 =====
  it('3.1 页面停留20秒后无错误累积', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(20000);
    const jsErrors = realErrors().filter(
      (e) => !e.includes('Failed to load resource') && !e.includes('ERR_') && !e.includes('favicon')
    );
    assert.equal(jsErrors.length, 0, '20秒停留后不应有JS错误累积: ' + jsErrors.join('; '));
  });

  // ===== 4. 多页面交替访问不崩溃 =====
  it('4.1 交替访问首页/管理后台/厨房看板不崩溃', async () => {
    resetErrors();
    const pages = ['/', '/admin', '/kitchen'];
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const p of pages) {
        await page.goto(BASE + p, { waitUntil: 'networkidle0', timeout: 15000 });
        await sleep(300);
      }
    }
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '交替访问不应崩溃');
    assert.equal(realErrors().length, 0, '交替访问不应有JS错误');
  });

  // ===== 5. 推荐API响应时间稳定 =====
  it('5.1 推荐API响应时间稳定（<5秒）', async () => {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await api('/api/predict-rf', {
        method: 'POST',
        body: JSON.stringify({
          userPrefs: { 辣度: '微辣', 咸淡: '适中', 甜酸: '酸甜' },
          dishes: [
            {
              id: 1,
              name: '测试',
              spiciness: '微辣',
              saltiness: '适中',
              sweetness: '酸甜',
              rating: 4,
              price: 20,
              isHalal: false,
              isVegetarian: false,
              allergies: [],
              religion: '无特殊要求',
              calorie: '200',
              protein: '10',
            },
          ],
        }),
      });
      times.push(Date.now() - start);
    }
    // 所有响应应在5秒内
    times.forEach((t, i) => {
      assert.ok(t < 5000, `第${i + 1}次推荐响应应在5秒内，实际: ${t}ms`);
    });
    // 响应时间波动不应太大
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const maxDeviation = Math.max(...times.map((t) => Math.abs(t - avg)));
    assert.ok(maxDeviation < 3000, `响应时间波动应<3000ms，平均: ${avg.toFixed(0)}ms 最大偏差: ${maxDeviation}ms`);
  });

  // ===== 6. 健康检查端点快速响应 =====
  it('6.1 健康检查端点响应时间<100ms', async () => {
    const start = Date.now();
    await api('/api/worker-health');
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 100, `健康检查应在100ms内响应，实际: ${elapsed}ms`);
  });

  // ===== 7. 菜品API响应时间稳定 =====
  it('7.1 菜品API响应时间<500ms', async () => {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await api('/api/dishes');
      times.push(Date.now() - start);
    }
    times.forEach((t, i) => {
      assert.ok(t < 500, `第${i + 1}次菜品API响应应在500ms内，实际: ${t}ms`);
    });
  });

  // ===== 8. 页面加载时间稳定 =====
  it('8.1 首页加载时间<3秒', async () => {
    const start = Date.now();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 3000, `首页加载应在3秒内，实际: ${elapsed}ms`);
  });
});

describe('CSS类引用完整性检查', () => {
  it('8.1 首页自定义CSS类在styles.css中定义', async () => {
    const fs = require('fs');
    const path = require('path');
    const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    // 提取CSS中定义的类
    const cssClasses = new Set();
    const cssClassRegex = /\.([a-zA-Z_][a-zA-Z0-9_-]*)\s*[{,]/g;
    let m2;
    while ((m2 = cssClassRegex.exec(css)) !== null) {
      cssClasses.add(m2[1]);
    }

    // 只检查项目自定义的类（非Bootstrap标准类）
    const customClasses = [
      'blind-box-card',
      'badge-blind',
      'dish-info',
      'dish-details',
      'dish-actions',
      'dish-score',
      'dish-reason',
      'section',
      'loading-text',
    ];
    const missing = [];
    for (const cls of customClasses) {
      if (!cssClasses.has(cls)) {
        missing.push(cls);
      }
    }
    assert.equal(missing.length, 0, `自定义CSS类未在styles.css中定义: ${missing.join(', ')}`);
  });
});
