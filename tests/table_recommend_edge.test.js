// 一席成宴 边角回归（2026-11-05 系统性补边角）
// 覆盖: 招牌池全空(拉黑全招牌/售罄同效)的席面降级、忌口拉满池子枯竭、partySize=1 简餐模式
// 纯逻辑组：直接 require ../table_recommend，无需服务
'use strict';
const { test, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const tr = require('../table_recommend');

function mkDish(id, name, category, price, spiciness, extra = {}) {
  return { id, name, category, price, spiciness, is_active: true, tags: [], allergies: {}, order_count: 10, ...extra };
}
function score(pools, v) {
  for (const key of Object.keys(pools)) {
    pools[key].forEach((d) => {
      d._score = v[key] ?? 3.5;
    });
  }
  return pools;
}
// 常规菜池（无招牌菜——模拟"招牌全被拉黑/售罄"后的池态：buildPools 无招牌入口）
function poolsNoSignature() {
  const dishes = [
    ...Array.from({ length: 4 }, (_, i) => mkDish(100 + i, `凉菜${i}`, '特色凉菜', 20, '不辣')),
    ...Array.from({ length: 8 }, (_, i) => mkDish(200 + i, `热菜${i}`, '传承陕菜', 40, '不辣')),
    ...Array.from({ length: 6 }, (_, i) => mkDish(300 + i, `小吃${i}`, '陕西小吃', 15, '不辣')),
  ];
  return tr.buildPools(dishes, []).pools;
}
function deepPools() {
  const dishes = [
    ...Array.from({ length: 6 }, (_, i) => mkDish(100 + i, `凉菜${i}`, '特色凉菜', 20, '不辣')),
    ...Array.from({ length: 8 }, (_, i) => mkDish(200 + i, `热菜${i}`, '传承陕菜', 40, '不辣')),
    ...Array.from({ length: 4 }, (_, i) => mkDish(300 + i, `招牌菜${i}`, '招牌', 60, '不辣', { tags: ['招牌'] })),
    ...Array.from({ length: 6 }, (_, i) => mkDish(400 + i, `小吃${i}`, '陕西小吃', 15, '不辣')),
  ];
  return tr.buildPools(dishes, []).pools;
}

describe('一席成宴 边角', () => {
  it('招牌池全空(拉黑/售罄后): 席面仍生成, 无招牌位, 不崩', () => {
    const pools = score(poolsNoSignature(), {});
    assert.equal(pools.signature.length, 0, '前置: 招牌池应为空');
    const sets = tr.buildTableSets({ pools, partySize: 4, budgetPerPerson: 60, reservedExtras: 0 });
    assert.ok(Array.isArray(sets) && sets.length > 0, '席面应仍有产出(降级)');
    for (const s of sets) {
      for (const d of s.dishes) {
        assert.notEqual(d.category, '招牌', '席面不应出现招牌池菜(池子为空)');
      }
    }
  });

  it('忌口拉满: buildPools 池子枯竭, buildTableSets 空池不崩', () => {
    const dishes = [
      mkDish(1, '海鲜大虾', '江湖海鲜', 80, '不辣', { allergies: { seafood: true } }),
      mkDish(2, '花生鸡丁', '传承陕菜', 40, '不辣', { allergies: { peanut: true, egg: true } }),
      mkDish(3, '豆腐羹', '田园时蔬', 20, '不辣', { allergies: { soy: true, gluten: true } }),
    ];
    const ALL = ['seafood', 'peanut', 'egg', 'soy', 'gluten'];
    const { pools, excluded } = tr.buildPools(dishes, ALL);
    assert.equal(excluded, dishes.length, '全部菜被忌口排除');
    assert.equal(
      pools.cold.length + pools.hot.length + pools.signature.length + pools.staple.length,
      0,
      '四池全空'
    );
    const sets = tr.buildTableSets({ pools: score(pools, {}), partySize: 4, budgetPerPerson: 60, reservedExtras: 0 });
    assert.ok(Array.isArray(sets), '空池下仍应返回数组结构');
    const totalDishes = sets.reduce((n, s) => n + (s.dishes ? s.dishes.length : 0), 0);
    assert.equal(totalDishes, 0, '空池席面不应凭空出菜');
  });

  it('partySize=1 简餐模式: 招牌无配额, 冷菜0, 结构合法', () => {
    const pools = score(deepPools(), {});
    const sets = tr.buildTableSets({ pools, partySize: 1, budgetPerPerson: 60, reservedExtras: 0 });
    assert.ok(Array.isArray(sets) && sets.length > 0);
    for (const s of sets) {
      const sig = s.dishes.filter((d) => d.pool === 'signature');
      assert.ok(sig.length <= 2, '招牌最多补位2道');
    }
  });

  it('quotasFor: 池子不足自动缩(不为负、不超池长)', () => {
    const pools = { cold: [], hot: [mkDish(1, '热菜', '传承陕菜', 40, '不辣')], signature: [], staple: [] };
    const q = tr.quotasFor(10, pools, { signatureQuota: 2 });
    assert.equal(q.cold, 0);
    assert.equal(q.hot, 1);
    assert.equal(q.signature, 0);
    assert.equal(q.staple, 0);
  });
});
