// 品牌启动动画遮罩 生命周期 E2E(2026-11-02)
// 背景: 协同压测期间遮罩卡死困住用户(rAF极慢时onDone不来+点击跳过被吞)——修复为三层防御后,
// 本文件把它钉死为回归: 兜底必关/点击必跳/只播一次/全程无console错误。
// 浏览器级(真实Chrome), puppeteer基建复用 filter_e2e 模式; 找不到Chrome则整组skip。
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = require('./_chrome_path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, page;
const consoleErrors = [];

async function freshLoadWithIntro() {
  // 清"已播"标记并加载 → 强制本会话重播动画(卡死场景入口)
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { sessionStorage.clear(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(600);
}
const overlayVisible = async () =>
  page.evaluate(() => {
    const ov = document.getElementById('logo-intro-overlay');
    return !!ov && getComputedStyle(ov).display !== 'none';
  });

describe('启动动画遮罩生命周期', () => {
  before(async function () {
    if (!CHROME_PATH) {
      this.skip();
      return;
    }
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  });

  it('兜底必关: 重播后不干预, 8秒硬兜底内遮罩自动消失(卡死回归)', async () => {
    await freshLoadWithIntro();
    assert.ok(await overlayVisible(), '重播后遮罩应先出现');
    // 硬兜底=8000ms; 给过渡留余量到9秒
    const deadline = Date.now() + 9000;
    let gone = false;
    while (Date.now() < deadline) {
      if (!(await overlayVisible())) { gone = true; break; }
      await sleep(300);
    }
    assert.ok(gone, '9秒内遮罩应被硬兜底关闭(卡死即回归失败)');
  });

  it('点击必跳: 重播后立即点击, 1.5秒内遮罩关闭(pointerdown捕获路径)', async () => {
    await freshLoadWithIntro();
    assert.ok(await overlayVisible(), '重播后遮罩应先出现');
    await page.click('body', { delay: 30 });
    await sleep(1500);
    assert.ok(!(await overlayVisible()), '点击后遮罩应关闭');
  });

  it('只播一次: 遮罩关闭后再刷新, 不再出现(sessionStorage标记)', async () => {
    await freshLoadWithIntro();
    // 等它关掉(兜底9秒内)
    const deadline = Date.now() + 9000;
    while (Date.now() < deadline && (await overlayVisible())) await sleep(300);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(800);
    assert.ok(!(await overlayVisible()), '同会话第二次加载不应再播动画');
  });

  it('全程无console错误', async () => {
    assert.deepEqual(consoleErrors, [], 'console错误: ' + JSON.stringify(consoleErrors.slice(0, 5)));
  });

  after(async () => {
    if (browser) await browser.close();
  });
});
