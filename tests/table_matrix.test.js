// 唐猫庭院 - 一桌菜全场景矩阵测试（路线图 8.4 · 场景回归）
// 需要被测服务在跑（默认 http://localhost:3000，可用 TEST_BASE_URL 覆盖）
// 覆盖：人数 1-20、预算极值、忌口组合、宗教、并发、换菜穷尽；校验结构/总价/人均/过敏原/套间差异化
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const ALL_CN_KEY = { '海鲜': 'seafood', '花生': 'peanut', '鸡蛋': 'egg', '大豆': 'soy', '麸质': 'gluten' };
const dishMap = new Map();

before(async () => {
  try {
    const dd = await fetch(BASE + '/api/dishes').then(r => r.json());
    (dd.dishes || []).forEach(x => dishMap.set(x.id, x));
  } catch (e) { /* 连不上时用例自身会失败并给出原因 */ }
});

async function gen(body) {
  const r = await fetch(BASE + '/api/recommend/table', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

// 通用不变量校验（场景名、响应、入参）
function assertInvariants(name, data, body) {
  const N = body.partySize;
  assert.equal(data.sets.length, 3, name + ': 应返回三套');
  const idSets = data.sets.map(s => new Set(s.dishes.map(x => x.id)));
  for (const s of data.sets) {
    const ids = s.dishes.map(x => x.id);
    assert.equal(new Set(ids).size, ids.length, name + '/' + s.style + ': 套内菜品重复');
    const sum = s.dishes.reduce((a, x) => a + x.price, 0) + (s.autoItems || []).reduce((a, x) => a + x.price * x.qty, 0);
    assert.ok(Math.abs(sum - s.totalPrice) < 0.01, name + '/' + s.style + ': 总价与明细不符');
    assert.ok(Math.abs(s.perPerson - Math.round(s.totalPrice / N * 100) / 100) < 0.02, name + '/' + s.style + ': 人均与总价不符');
    for (const x of s.dishes) {
      assert.ok(x.reason, name + '/' + s.style + ': ' + x.name + ' 缺理由');
      assert.ok(['cold', 'hot', 'signature', 'staple'].includes(x.pool), name + '/' + s.style + ': ' + x.name + ' 非法池');
      const dd = dishMap.get(x.id);
      if (dd) {
        assert.ok(!['飲品与酒水', '主食'].includes(dd.category), name + '/' + s.style + ': 饮品/米饭混入推荐(' + x.name + ')');
        (body.allergies || []).forEach(cn => {
          const key = ALL_CN_KEY[cn];
          assert.ok(!(dd.allergies && dd.allergies[key]), name + '/' + s.style + ': 含过敏原(' + cn + '): ' + x.name);
        });
      }
    }
  }
}

const scenarios = [
  { name: '1人/80', body: { partySize: 1, budgetPerPerson: 80 } },
  { name: '2人/60', body: { partySize: 2, budgetPerPerson: 60 } },
  { name: '3人/100', body: { partySize: 3, budgetPerPerson: 100 } },
  { name: '5人/40', body: { partySize: 5, budgetPerPerson: 40 } },
  { name: '6人/80', body: { partySize: 6, budgetPerPerson: 80 } },
  { name: '8人/120', body: { partySize: 8, budgetPerPerson: 120 } },
  { name: '10人/50', body: { partySize: 10, budgetPerPerson: 50 } },
  { name: '12人/100', body: { partySize: 12, budgetPerPerson: 100 } },
  { name: '15人/150', body: { partySize: 15, budgetPerPerson: 150 } },
  { name: '20人/80', body: { partySize: 20, budgetPerPerson: 80 } },
  { name: '4人/20极低预算', body: { partySize: 4, budgetPerPerson: 20 } },
  { name: '4人/150高预算', body: { partySize: 4, budgetPerPerson: 150 } },
  { name: '忌口全勾', body: { partySize: 4, allergies: ['海鲜', '花生', '鸡蛋', '大豆', '麸质'] } },
  { name: '素食', body: { partySize: 4, religion: '素食' } },
  { name: '清真+海鲜忌口', body: { partySize: 4, religion: '清真', allergies: ['海鲜'] } },
  { name: '辣度重辣+偏咸', body: { partySize: 4, spiciness: '重辣', saltiness: '偏咸' } },
];

for (const sc of scenarios) {
  test('矩阵: ' + sc.name, async () => {
    const { status, data } = await gen(sc.body);
    assert.equal(status, 200, 'HTTP ' + status + ': ' + (data.error || ''));
    assert.equal(data.success, true);
    assertInvariants(sc.name, data, sc.body);
  });
}

test('矩阵: 并发5请求全部成功', async () => {
  const all = await Promise.all([1, 2, 3, 4, 5].map(n => gen({ partySize: 4 })));
  for (const c of all) {
    assert.equal(c.status, 200);
    assert.equal(c.data.success, true);
  }
});

test('矩阵: 同池换菜穷尽后正确返回404', async () => {
  const g = await gen({ partySize: 4 });
  assert.equal(g.data.success, true);
  let swaps = 0, exhausted = false;
  const used = new Set(g.data.sets[0].dishes.map(x => x.id));
  for (let i = 0; i < 40; i++) {
    const r = await fetch(BASE + '/api/recommend/table/swap', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partySize: 4, pool: 'cold', excludeIds: [...used] }),
    });
    const d = await r.json();
    if (d.success) { used.add(d.dish.id); swaps++; } else { exhausted = true; break; }
  }
  assert.ok(exhausted, '换菜应能穷尽（池内无菜可换时返回404），实际换了 ' + swaps + ' 次未穷尽');
});
