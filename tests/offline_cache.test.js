// 断网缓存渲染 + 盲盒枯竭 null 安全 E2E（2026-11-05 系统性补边角）
// 场景1(断网兜底): 首次加载写入 localStorage['dishDataCache'], 之后拦截 /api/dishes 使其失败,
//   reload 后应"先用本地缓存立即渲染菜单"(js/init.js 弱网兜底链路)——菜品卡片必须仍在 DOM。
// 场景2(盲盒枯竭): selectBlindBoxDish 在候选全被过敏/拉黑排除时应返回 null(调用方 if(blind) 已保护),
//   本测试操纵全局 dishData/prefs 直接调函数钉死该契约(真 Chrome, 找不到则整组 skip)。
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = require('./_chrome_path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, page, interceptor;
const CAN_RUN = Boolean(CHROME_PATH);

describe('断网缓存渲染与盲盒枯竭', () => {
  before(async function () {
    if (!CAN_RUN) {
      console.log('  skip: 本地无 Chrome');
      return;
    }
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
  });

  after(async function () {
    if (browser) await browser.close();
  });

  it('首次加载写入 dishDataCache', async function () {
    if (!CAN_RUN) { this.skip(); return; }
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await sleep(2500); // 等菜单数据加载+缓存写入
    const cached = await page.evaluate(() => {
      const arr = JSON.parse(localStorage.getItem('dishDataCache') || '[]');
      return { len: arr.length, hasHuluji: arr.some((d) => d.name === '葫芦鸡') };
    });
    assert.ok(cached.len > 50, '缓存菜品数应>50: ' + cached.len);
    assert.ok(cached.hasHuluji, '缓存应含葫芦鸡');
  });

  it('拦截 /api/dishes 后 reload, 菜单应从本地缓存渲染(断网兜底)', async function () {
    if (!CAN_RUN) { this.skip(); return; }
    await page.setRequestInterception(true);
    interceptor = (req) => {
      if (req.url().includes('/api/dishes')) {
        req.abort('connectionfailed');
      } else {
        req.continue();
      }
    };
    page.on('request', interceptor);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(4000); // 10s race 前 abort 立即失败 → catch → 缓存渲染
    const state = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        cacheKept: !!localStorage.getItem('dishDataCache'),
        dishDataLoaded: (window.dishData || []).length,
        dishVisibleAnywhere: document.documentElement.outerHTML.indexOf('葫芦鸡') !== -1,
        rowsInTable: (document.getElementById('dataset-table-body') || { childElementCount: 0 }).childElementCount,
      };
    });
    await page.off('request', interceptor);
    await page.setRequestInterception(false);
    assert.ok(state.cacheKept, '缓存应保留');
    // 断网兜底核心断言: /api/dishes 失败时, 菜品数据从 localStorage 缓存进入渲染管线
    assert.ok(state.dishDataLoaded > 50, '缓存应进入渲染数据(dishData>50): ' + state.dishDataLoaded);
    assert.ok(state.dishVisibleAnywhere, '菜品名应出现在页面 DOM(缓存渲染)');
    assert.ok(state.rowsInTable > 0 || state.dishVisibleAnywhere, '菜单应有渲染产出');
  });

  it('盲盒候选全被排除时 selectBlindBoxDish 返回 null(枯竭契约)', async function () {
    if (!CAN_RUN) { this.skip(); return; }
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    const r = await page.evaluate(() => {
      const orig = window.dishData;
      try {
        // 全部菜含海鲜过敏源 → 候选枯竭
        window.dishData = (orig || []).map((d) => ({ ...d, allergies: { seafood: true } }));
        const prefs = { allergies: ['海鲜'], blindBoxMode: 'smart' };
        const nullCase = window.selectBlindBoxDish(prefs, [], [], false);
        // 正常数据应非 null(契约的另一面)
        window.dishData = orig;
        const okCase = window.selectBlindBoxDish({ allergies: [], blindBoxMode: 'smart' }, [], [], false);
        return { nullCase: nullCase === null, okCase: okCase !== null && okCase !== undefined };
      } finally {
        window.dishData = orig;
      }
    });
    assert.equal(r.nullCase, true, '候选枯竭应返回 null');
    assert.equal(r.okCase, true, '正常数据应返回盲盒菜');
  });
});
