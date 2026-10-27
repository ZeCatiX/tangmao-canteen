// 复现 kitchen_reco_deep 同款时序: guest+偏好提交 → 立即点换一批 → 每200ms采样 loading/list/recIds
const puppeteer = require('puppeteer');
const CHROME_PATH = require('./tests/_chrome_path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME_PATH, args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 150)));
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0', timeout: 15000 });
  await page.evaluate(() => document.getElementById('logo-intro-overlay')?.click());
  await sleep(1200);
  await page.evaluate(() => document.getElementById('guest-btn')?.click());
  await sleep(400);
  await page.select('#spiciness', '微辣');
  await page.select('#saltiness', '适中');
  await page.select('#sweetness', '酸甜');
  await page.evaluate(() => document.getElementById('preference-form').querySelector('button[type="submit"]').click());
  await sleep(5000);
  const before = await page.evaluate(() => [...document.querySelectorAll('#dish-list .list-group-item')].map((el) => { const b = el.querySelector('button[onclick*="addToFavorites"]'); return b ? (b.getAttribute('onclick').match(/\d+/) || [null])[0] : null; }));
  // 同测试: 直接 evaluate click 换一批
  await page.evaluate(() => document.getElementById('refresh-recommendations')?.click());
  const samples = [];
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    const s = await page.evaluate(() => ({
      loading: !document.getElementById('recommendation-loading')?.classList.contains('d-none'),
      len: document.querySelectorAll('#dish-list .list-group-item').length,
      firstId: (() => { const el = document.querySelector('#dish-list .list-group-item button[onclick*="addToFavorites"]'); return el ? (el.getAttribute('onclick').match(/\d+/) || [null])[0] : null; })(),
      recIdsLen: (typeof recommendedIds !== 'undefined') ? recommendedIds.length : 'undef',
    }));
    samples.push(i * 250 + 'ms:' + JSON.stringify(s));
  }
  console.log('before(first3):', JSON.stringify(before.slice(0, 3)));
  console.log(samples.join('\n'));
  await browser.close();
})();
