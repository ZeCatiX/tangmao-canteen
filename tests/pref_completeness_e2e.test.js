// 唐猫庭院 - 偏好完整度引导 E2E 测试
// 覆盖：仪表盘渲染、select change 实时更新、banner 触发/跳转高亮/关闭/退出清理
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser, page;

describe('偏好完整度引导', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => page._consoleErrors.push(err.message));
  });

  after(async () => { if (browser) await browser.close(); });

  function resetErrors() { page._consoleErrors = []; }
  function realErrors() {
    return page._consoleErrors.filter(e =>
      !e.includes('fonts.') && !e.includes('401 (Unauthorized)') &&
      !e.includes('429 (Too Many Requests)') && !e.includes('404 (Not Found)'));
  }

  // 1. 仪表盘渲染：游客进偏好页应显示 0/5，咸淡/热量标 weak
  it('1.1 游客进偏好页仪表盘渲染 0/5', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 25000 });
    await sleep(600);
    await page.evaluate(() => {
      localStorage.removeItem('prefCompletenessDismissed');
      showSection('preference-section');
    });
    await sleep(300);
    const r = await page.evaluate(() => {
      const m = document.getElementById('pref-completeness-meter');
      if (!m) return { err: 'no meter' };
      const items = [...m.querySelectorAll('[data-pref-key]')].map(el => ({
        key: el.dataset.prefKey,
        cls: el.className
      }));
      return {
        badge: m.querySelector('.badge')?.textContent.trim(),
        fillW: m.querySelector('.pref-meter-fill')?.style.width,
        items
      };
    });
    assert.strictEqual(r.badge, '0/5', '初始应为 0/5');
    assert.strictEqual(r.fillW, '0%', '进度条应为 0%');
    const weaks = r.items.filter(i => i.cls.includes('weak'));
    assert.strictEqual(weaks.length, 2, '咸淡+热量应为 weak 维度');
    assert.ok(weaks.every(i => i.cls.includes('todo')), '初始咸淡/热量应为 todo 状态');
    assert.equal(realErrors().length, 0, '不应有错误');
  });

  // 2. select change 触发仪表盘实时更新
  it('1.2 改咸淡=清淡 仪表盘实时更新为 1/5', async () => {
    resetErrors();
    await page.evaluate(() => {
      const sa = document.getElementById('saltiness');
      sa.value = '清淡';
      sa.dispatchEvent(new Event('change'));
    });
    await sleep(300);
    const r = await page.evaluate(() => {
      const m = document.getElementById('pref-completeness-meter');
      return {
        badge: m.querySelector('.badge').textContent.trim(),
        saltinessCls: m.querySelector('[data-pref-key="saltiness"]').className,
        fillW: m.querySelector('.pref-meter-fill').style.width
      };
    });
    assert.strictEqual(r.badge, '1/5', '改一项后应为 1/5');
    assert.ok(r.saltinessCls.includes('done') && r.saltinessCls.includes('weak'),
      '咸淡应变为 done+weak 状态, got: ' + r.saltinessCls);
    assert.strictEqual(r.fillW, '20%', '进度条应为 20%');
    assert.equal(realErrors().length, 0, '不应有错误');
  });

  // 3. 推荐页 banner：热量=无时应出现
  it('2.1 推荐页低完整度时出现 banner', async () => {
    resetErrors();
    await page.evaluate(() => showSection('recommendation-section'));
    await sleep(300);
    const r = await page.evaluate(() => {
      const b = document.getElementById('pref-completeness-banner');
      if (!b) return { err: 'no banner el' };
      return {
        visible: !b.classList.contains('d-none'),
        text: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
        hasGoto: !!b.querySelector('#pref-completeness-goto'),
        hasClose: !!b.querySelector('.btn-close')
      };
    });
    assert.ok(r.visible, 'banner 应可见');
    assert.ok(r.text.includes('热量'), '文案应提及热量, got: ' + r.text);
    assert.ok(r.hasGoto, '应有"去补全"链接');
    assert.ok(r.hasClose, '应有关闭按钮');
    assert.equal(realErrors().length, 0, '不应有错误');
  });

  // 4. 点"去补全"跳回偏好页 + 高亮热量 select
  it('2.2 点去补全跳回偏好页并高亮热量', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('#pref-completeness-goto')?.click());
    await sleep(800); // 滚动 + 高亮动画
    const r = await page.evaluate(() => {
      const active = document.querySelector('.section.active');
      const hl = document.querySelector('.pref-highlight');
      return {
        activeSec: active?.id,
        highlightId: hl?.id
      };
    });
    assert.strictEqual(r.activeSec, 'preference-section', '应跳到偏好页');
    assert.strictEqual(r.highlightId, 'calorie', '应高亮热量 select');
    assert.equal(realErrors().length, 0, '不应有错误');
  });

  // 5. 关闭 banner → dismissed 标记 + 再进不出现
  it('2.3 关闭 banner 后 localStorage 标记生效', async () => {
    resetErrors();
    await page.evaluate(() => showSection('recommendation-section'));
    await sleep(200);
    await page.evaluate(() => {
      const c = document.querySelector('#pref-completeness-banner .btn-close');
      if (c) c.click();
    });
    await sleep(500); // 等 closed.bs.alert
    const flag = await page.evaluate(() => localStorage.getItem('prefCompletenessDismissed'));
    assert.strictEqual(flag, 'true', '应写入 dismissed=true');
    // 再进推荐页, banner 应不出现
    await page.evaluate(() => showSection('recommendation-section'));
    await sleep(200);
    const r = await page.evaluate(() => {
      const b = document.getElementById('pref-completeness-banner');
      return { exists: !!b, visible: b ? !b.classList.contains('d-none') : false };
    });
    assert.ok(!r.visible, '关闭后 banner 不应再出现');
    assert.equal(realErrors().length, 0, '不应有错误');
  });

  // 6. logout 应清除 dismissed 标记
  it('3.1 logout 清除 prefCompletenessDismissed 标记', async () => {
    resetErrors();
    // 先设上标记
    await page.evaluate(() => localStorage.setItem('prefCompletenessDismissed', 'true'));
    const before = await page.evaluate(() => localStorage.getItem('prefCompletenessDismissed'));
    assert.strictEqual(before, 'true', '前置：标记应为 true');
    // 调 logout(同步部分先清 localStorage)
    await page.evaluate(() => {
      try { logout(); } catch (e) {}
    });
    await sleep(200);
    // 关掉 logout 弹出的 modal
    await page.evaluate(() => {
      try {
        const m = document.getElementById('message-modal');
        if (m) { const inst = bootstrap.Modal.getInstance(m); if (inst) inst.hide(); }
      } catch (e) {}
    });
    const after = await page.evaluate(() => localStorage.getItem('prefCompletenessDismissed'));
    assert.strictEqual(after, null, 'logout 后 dismissed 标记应被清除');
    assert.equal(realErrors().length, 0, '不应有错误');
  });
});
