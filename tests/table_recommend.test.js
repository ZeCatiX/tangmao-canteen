// 唐猫庭院 - 一桌菜组合推荐测试（路线图 8.4）
// 纯逻辑组：直接 require ../table_recommend，无需服务
// API 组：需要被测服务在跑（默认 http://localhost:3000，可用 TEST_BASE_URL 覆盖）
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const tr = require('../table_recommend');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

// ── 造数工具 ──
function mkDish(id, name, category, price, spiciness, extra = {}) {
  return { id, name, category, price, spiciness, is_active: true, tags: [], allergies: {}, order_count: 10, ...extra };
}
// 给池子统一打分
function score(pools, v) {
  for (const key of Object.keys(pools)) pools[key].forEach(d => { d._score = v[key] ?? 3.5; });
  return pools;
}
// 合成一套深度足够的池（价格压低，避免触发软预算分支干扰结构断言）
function deepPools() {
  return {
    cold: Array.from({ length: 6 }, (_, i) => mkDish(100 + i, `凉菜${i}`, '特色凉菜', 20, i % 2 ? '微辣' : '不辣')),
    hot: Array.from({ length: 8 }, (_, i) => mkDish(200 + i, `热菜${i}`, '传承陕菜', 40, i % 3 ? '不辣' : '微辣')),
    signature: [mkDish(301, '招牌甲', '招牌与游西安必打卡', 58, '不辣', { tags: ['招牌'] }),
                mkDish(302, '招牌乙', '招牌与游西安必打卡', 59, '不辣', { tags: ['招牌'] })],
    staple: [mkDish(401, '油泼面', '陕西小吃', 16, '微辣'),
             mkDish(402, '米饭', '主食', 3, '不辣'),
             mkDish(403, '肉夹馍', '陕西小吃', 6, '不辣')],
  };
}

// ═══════════ 纯逻辑组 ═══════════

test('normalizeAllergies: 中文名/键名归一并去重', () => {
  assert.deepEqual(tr.normalizeAllergies(['海鲜', '花生', 'seafood', '不认识的东西']), ['seafood', 'peanut']);
  assert.deepEqual(tr.normalizeAllergies(null), []);
  assert.deepEqual(tr.normalizeAllergies('海鲜'), []);
});

test('buildPools: 忌口硬过滤 + 测试脏数据排除 + 池归属', () => {
  const dishes = [
    mkDish(1, '凉皮', '陕西小吃', 12, '微辣'),
    mkDish(2, '清蒸鲈鱼', '江湖海鲜', 88, '不辣', { allergies: { seafood: true } }),
    mkDish(3, '测试重复菜名', '热菜', 20, '不辣'),
    mkDish(4, '葫芦鸡', '传承陕菜', 98, '不辣', { tags: ['招牌'] }),
    mkDish(5, '油泼面', '陕西小吃', 16, '微辣'),
    mkDish(6, '酸梅汤', '飲品与酒水', 8, '不辣'),
  ];
  const { pools, excluded } = tr.buildPools(dishes, ['seafood']);
  assert.equal(excluded, 2); // 鲈鱼(忌口) + 测试菜(脏数据)
  assert.deepEqual(pools.cold, []);
  assert.equal(pools.hot.length, 1);       // 葫芦鸡（鲈鱼被忌口滤掉）
  assert.equal(pools.signature.length, 1); // 葫芦鸡
  assert.equal(pools.staple.length, 2);    // 凉皮 + 油泼面（面点关键词），酸梅汤饮品不入池
});

test('buildTableSets: 4人三套结构 = 凉菜2+热菜4+招牌1-2+主食2，全套菜品唯一', () => {
  const sets = tr.buildTableSets({ pools: score(deepPools(), { cold: 3.8, hot: 4.0, signature: 4.5, staple: 3.5 }), partySize: 4, budgetPerPerson: 80 });
  assert.deepEqual(sets.map(s => s.style), ['家常版', '宴请版', '打卡版']);
  for (const s of sets) {
    const ids = s.dishes.map(x => x.dish.id);
    assert.equal(new Set(ids).size, ids.length, '同一套内同一道菜不得出现两次');
    const cnt = {};
    s.dishes.forEach(x => { cnt[x.pool] = (cnt[x.pool] || 0) + 1; });
    assert.equal(cnt.cold, 2);
    assert.equal(cnt.hot, 4);
    assert.ok(cnt.signature >= 1, '每套必含招牌');
    assert.equal(cnt.staple, 2);
    assert.equal(s.totalPrice, s.dishes.reduce((sum, x) => sum + x.dish.price, 0));
  }
  assert.equal(sets[0].dishes.filter(x => x.pool === 'signature').length, 1); // 家常版招牌1
  assert.equal(sets[1].dishes.filter(x => x.pool === 'signature').length, 2); // 宴请版招牌2
});

test('buildTableSets: 池子不足自动缩配额且不炸', () => {
  const pools = {
    cold: [mkDish(1, '唯一凉菜', '特色凉菜', 20, '不辣')],
    hot: [mkDish(2, '唯一热菜', '传承陕菜', 40, '不辣')],
    signature: [mkDish(3, '唯一招牌', '招牌与游西安必打卡', 58, '不辣', { tags: ['招牌'] })],
    staple: [],
  };
  const sets = tr.buildTableSets({ pools: score(pools, {}), partySize: 10, budgetPerPerson: 80 });
  assert.equal(sets.length, 3);
  for (const s of sets) {
    assert.deepEqual(s.dishes.map(x => x.pool).sort(), ['cold', 'hot', 'signature']);
    const ids = s.dishes.map(x => x.dish.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('pickFromPool: 软预算内贪心，超预算需第二遍兜底并打标', () => {
  const freshState = () => ({ total: 0, spiceCount: {}, ingSeen: new Set(), usedIds: new Set() });
  const rich = Array.from({ length: 5 }, (_, i) => mkDish(10 + i, `平价菜${i}`, '传承陕菜', 30, '不辣'));
  rich.forEach(d => { d._score = 4; });
  const r1 = tr.pickFromPool(rich.slice(), 2, 100, freshState()); // 2×30=60 ≤ 100，第一遍完成
  assert.equal(r1.taken.length, 2);
  assert.equal(r1.overBudget, false);
  const r2 = tr.pickFromPool(rich.slice(), 4, 100, freshState()); // 4×30=120 > 100，第二遍兜底
  assert.equal(r2.taken.length, 4);
  assert.equal(r2.overBudget, true);
});

test('pickFromPool: 主料不重复——有替代时让位，无替代时可重复', () => {
  const state = { total: 0, spiceCount: {}, ingSeen: new Set(), usedIds: new Set() };
  const queue = [
    mkDish(1, '葫芦鸡甲', '传承陕菜', 50, '不辣'),
    mkDish(2, '葫芦鸡乙', '传承陕菜', 48, '不辣'),
    mkDish(3, '烧豆腐', '传承陕菜', 30, '不辣'),
  ];
  [4, 3.9, 3.8].forEach((v, i) => { queue[i]._score = v; });
  const r = tr.pickFromPool(queue, 2, 999, state); // 鸡乙与鸡甲同主料且有替代 → 让位选豆腐
  assert.deepEqual(r.taken.map(d => d.name), ['葫芦鸡甲', '烧豆腐']);
});

test('reasonFor: 招牌/凉菜/时蔬模板各归其位', () => {
  const v = tr.VARIANTS[2]; // 打卡版
  assert.match(tr.reasonFor(mkDish(1, '葫芦鸡', '招牌与游西安必打卡', 98, '不辣', { tags: ['招牌'] }), 'signature', v, 4), /打卡/);
  assert.match(tr.reasonFor(mkDish(2, '凉菜', '特色凉菜', 20, '不辣'), 'cold', v, 4), /凉菜/);
  assert.match(tr.reasonFor(mkDish(3, '时蔬', '田园时蔬·汤羹', 28, '不辣'), 'hot', v, 4), /荤素/);
  assert.match(tr.reasonFor(mkDish(4, '米饭', '主食', 3, '不辣'), 'staple', v, 4), /主食/);
});

test('fallbackScore: 辣度/价格/招牌加成方向正确', () => {
  const base = mkDish(1, '菜', '传承陕菜', 40, '微辣');
  const prefs = { '辣度': '微辣', '价格区间': '适中' };
  const s1 = tr.fallbackScore(base, prefs);
  const sOff = tr.fallbackScore(mkDish(2, '菜', '传承陕菜', 40, '重辣'), prefs);
  const sBandOff = tr.fallbackScore(mkDish(3, '菜', '传承陕菜', 150, '微辣'), prefs);
  const sSig = tr.fallbackScore(mkDish(4, '菜', '传承陕菜', 40, '微辣', { tags: ['招牌'] }), prefs);
  assert.ok(s1 > sOff, '辣度匹配应高于不匹配');
  assert.ok(s1 > sBandOff, '价格档匹配应高于不匹配');
  assert.ok(sSig > s1, '招牌应有加成');
});

// ═══════════ API 组 ═══════════
var dishAllergyMap = {}; // id → allergies（交叉验证忌口过滤）

before(async () => {
  try {
    const r = await fetch(BASE + '/api/dishes');
    const d = await r.json();
    (d.dishes || []).forEach(x => { dishAllergyMap[x.id] = x.allergies || {}; });
  } catch (e) { /* API 组用例会因连不上而失败，错误信息已足够定位 */ }
});

test('API: 4人默认预算返回三套完整结构', async () => {
  const r = await fetch(BASE + '/api/recommend/table', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partySize: 4 }),
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.success, true);
  assert.equal(d.sets.length, 3);
  assert.deepEqual(d.sets.map(s => s.style), ['家常版', '宴请版', '打卡版']);
  for (const s of d.sets) {
    assert.ok(s.dishes.length >= 4, '每套至少覆盖四个池');
    assert.equal(typeof s.totalPrice, 'number');
    assert.ok(s.totalPrice > 0);
    for (const dish of s.dishes) {
      assert.ok(dish.id && dish.name, '菜品必须有 id 与名称');
      assert.ok(dish.reason && dish.reason.length > 0, '每道菜必须有一句话理由');
      assert.equal(dish.qty, 1);
      assert.ok(['cold', 'hot', 'signature', 'staple'].includes(dish.pool));
    }
  }
});

test('API: 参数校验——缺人数/越界返回400', async () => {
  for (const body of [{}, { partySize: 0 }, { partySize: 21 }, { partySize: 4, budgetPerPerson: 5 }, { partySize: 4, budgetPerPerson: 9999 }]) {
    const r = await fetch(BASE + '/api/recommend/table', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 400, '入参 ' + JSON.stringify(body) + ' 应返回400');
    const d = await r.json();
    assert.equal(d.success, false);
  }
});

test('API: 忌口海鲜——结果中不出现海鲜过敏菜品', async () => {
  const r = await fetch(BASE + '/api/recommend/table', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partySize: 4, allergies: ['海鲜'] }),
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.success, true);
  const seafoodIds = d.sets.flatMap(s => s.dishes).filter(x => dishAllergyMap[x.id] && dishAllergyMap[x.id].seafood === true).map(x => x.id);
  assert.deepEqual(seafoodIds, [], '忌口海鲜时结果不得含 seafood 菜品，违反者: ' + seafoodIds.join(','));
});

test('API: 换菜返回同池且不在排除名单的新菜', async () => {
  const r1 = await fetch(BASE + '/api/recommend/table', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partySize: 4 }),
  });
  const d1 = await r1.json();
  assert.equal(d1.success, true);
  const home = d1.sets[0];
  const hotDish = home.dishes.find(x => x.pool === 'hot');
  assert.ok(hotDish, '家常版应含热菜');
  const r2 = await fetch(BASE + '/api/recommend/table/swap', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partySize: 4, pool: 'hot', excludeIds: home.dishes.map(x => x.id), style: 'home' }),
  });
  assert.equal(r2.status, 200);
  const d2 = await r2.json();
  assert.equal(d2.success, true);
  assert.equal(d2.dish.pool, 'hot');
  assert.ok(d2.dish.reason, '换菜也要带理由');
  assert.ok(!home.dishes.some(x => x.id === d2.dish.id), '换来的菜不得与桌上已有菜重复');
});

test('API: 换菜 pool 非法返回400', async () => {
  const r = await fetch(BASE + '/api/recommend/table/swap', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partySize: 4, pool: 'drinks' }),
  });
  assert.equal(r.status, 400);
});

test('API: 打卡版含双招牌（招牌池充足前提下）', async () => {
  const r = await fetch(BASE + '/api/recommend/table', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partySize: 4 }),
  });
  const d = await r.json();
  const checkin = d.sets.find(s => s.style === '打卡版');
  assert.ok(checkin, '必须有打卡版');
  assert.equal(checkin.dishes.filter(x => x.pool === 'signature').length, 2, '打卡版应含2道招牌');
});
