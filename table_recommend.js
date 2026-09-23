// 唐猫庭院 - 一桌菜组合推荐（规则引擎 v1，路线图 8.4）
// 纯函数模块：输入按池分好、带 _score 的候选菜品，输出三套组合。不含 IO，可脱离服务单测。
// 池子结构见 buildPools；单菜评分由 server.js 调 Python worker 批量打分，本模块只管组合。
'use strict';

// ── 池子配置 ──
// 热菜不走 category='热菜'（那批是测试脏数据），由真实热菜分类组成；饮品永不参与。
const POOL_CATEGORIES = {
  cold: ['特色凉菜'],
  hot: ['传承陕菜', '热销菜品', '江湖海鲜', '田园时蔬·汤羹'],
};
// 主食池：主食分类 + 陕西小吃里的面点（按菜名关键词识别，菜单变动自动适应）
const STAPLE_NAME_RE = /(面|饭|馍|包|糕|皮|粥|饼)/;

// 忌口中文名（前端/用户档案口径）→ dishes.allergies JSONB 键
const ALLERGY_KEY_MAP = { '海鲜': 'seafood', '花生': 'peanut', '鸡蛋': 'egg', '大豆': 'soy', '麸质': 'gluten' };
const ALLERGY_KEYS = Object.values(ALLERGY_KEY_MAP);

// 三套风格变体：预算系数、招牌配额、排序偏好
const VARIANTS = [
  { key: 'home', label: '家常版', budgetFactor: 1.0, signatureQuota: 1, prefer: 'balanced' },
  { key: 'banquet', label: '宴请版', budgetFactor: 1.45, signatureQuota: 2, prefer: 'premium' },
  { key: 'checkin', label: '打卡版', budgetFactor: 1.1, signatureQuota: 2, prefer: 'popular' },
];

// 食材关键词（菜名启发式，用于"主料不重复"）；长词在前防误配（如"鱼香茄子"归茄子不归鱼）
const INGREDIENT_KEYWORDS = [
  ['鱼香', '茄子'], ['鱼', '鱼'], ['虾', '虾'], ['蟹', '蟹'], ['鱿鱼', '海鲜'], ['扇贝', '海鲜'], ['蛤', '海鲜'], ['海参', '海鲜'],
  ['鸡', '鸡'], ['鸭', '鸭'],
  ['牛肉', '牛'], ['牛排', '牛'], ['羊肉', '羊'],
  ['排骨', '猪'], ['酥肉', '猪'], ['肉夹馍', '猪'], ['梆梆肉', '猪'], ['回锅肉', '猪'], ['肉丝', '猪'], ['肉片', '猪'], ['肉丸', '猪'],
  ['豆腐', '豆腐'], ['茄子', '茄子'], ['土豆', '土豆'], ['莲菜', '莲藕'], ['莲藕', '莲藕'],
];

function ingredientOf(name) {
  if (typeof name !== 'string') return null;
  for (const [kw, ing] of INGREDIENT_KEYWORDS) {
    if (name.includes(kw)) return ing;
  }
  return null;
}

// 忌口入参归一：接受中文名（海鲜/花生/鸡蛋/大豆/麸质）或键名，返回去重键数组
function normalizeAllergies(list) {
  const keys = new Set();
  (Array.isArray(list) ? list : []).forEach(a => {
    if (typeof a !== 'string') return;
    const t = a.trim();
    if (ALLERGY_KEY_MAP[t]) keys.add(ALLERGY_KEY_MAP[t]);
    else if (ALLERGY_KEYS.includes(t)) keys.add(t);
  });
  return [...keys];
}

function dishHasAllergy(dish, allergyKeys) {
  if (!allergyKeys || !allergyKeys.length) return false;
  const al = dish.allergies || {};
  return allergyKeys.some(k => al[k] === true);
}

// 从全量菜品构建四个候选池（硬过滤：is_active、名称含"测试"的脏数据、忌口）
// 一道菜可同时进招牌池与其分类池（按 id 去重在服务端打分处做）
function buildPools(dishes, allergyKeys) {
  const pools = { cold: [], hot: [], signature: [], staple: [] };
  let excluded = 0;
  for (const d of (dishes || [])) {
    if (!d || d.is_active === false) continue;
    if (typeof d.name === 'string' && d.name.includes('测试')) { excluded++; continue; }
    if (dishHasAllergy(d, allergyKeys)) { excluded++; continue; }
    const tags = Array.isArray(d.tags) ? d.tags : [];
    if (tags.includes('招牌') || d.category === '招牌与游西安必打卡') pools.signature.push(d);
    if (POOL_CATEGORIES.cold.includes(d.category)) pools.cold.push(d);
    if (POOL_CATEGORIES.hot.includes(d.category)) pools.hot.push(d);
    if (d.category === '主食' || (d.category === '陕西小吃' && STAPLE_NAME_RE.test(d.name))) pools.staple.push(d);
  }
  return { pools, excluded };
}

// 结构模板配额（8.4 草案：凉菜×⌈N/2⌉ + 热菜×N + 招牌×1-2 + 主食×1-2），池子不够自动缩
function quotasFor(partySize, pools, variant) {
  return {
    cold: Math.min(Math.ceil(partySize / 2), 6, pools.cold.length),
    hot: Math.min(partySize, 10, pools.hot.length),
    signature: Math.min(variant.signatureQuota, pools.signature.length),
    staple: Math.min(partySize <= 3 ? 1 : 2, pools.staple.length),
  };
}

// 变体排序分：balanced 纯 ML 分；premium 同分偏好贵一点；popular 偏好点单多的
function sortValue(d, prefer) {
  let v = d._score || 0;
  if (prefer === 'premium') v += Math.min(Number(d.price) || 0, 200) / 400;
  if (prefer === 'popular') v += Math.min(Number(d.order_count) || 0, 60) / 150;
  return v;
}

// 从单个池贪心选菜（queue 会被消费）。
// state: { total, spiceCount, ingSeen, usedIds } 跨池共享——辣度分散与主料不重复是全桌约束，
// usedIds 保证同一道菜（招牌池与分类池可能同时收录）在整套里只出现一次。
// 第一遍在软预算内选且尽量避开已连选 2 次的辣度/已选主料（有替代时才让位）；
// 第二遍保配额，允许超预算（打 overBudget 标）。
function pickFromPool(queue, quota, softCap, state) {
  const taken = [];
  let overBudget = false;
  const take = (d) => {
    taken.push(d);
    state.usedIds.add(d.id);
    state.total += Number(d.price) || 0;
    state.spiceCount[d.spiciness] = (state.spiceCount[d.spiciness] || 0) + 1;
    const ing = ingredientOf(d.name);
    if (ing) state.ingSeen.add(ing);
  };
  for (let i = 0; i < queue.length && taken.length < quota;) {
    const d = queue[i];
    if (state.usedIds.has(d.id)) { i++; continue; }
    const price = Number(d.price) || 0;
    if (state.total + price > softCap) { i++; continue; }
    const rest = queue.slice(i + 1);
    if ((state.spiceCount[d.spiciness] || 0) >= 2 && rest.some(x => (state.spiceCount[x.spiciness] || 0) < 2)) { i++; continue; }
    const ing = ingredientOf(d.name);
    if (ing && state.ingSeen.has(ing) && rest.some(x => { const g = ingredientOf(x.name); return !g || !state.ingSeen.has(g); })) { i++; continue; }
    take(d);
    queue.splice(i, 1);
  }
  while (queue.length && taken.length < quota) {
    const d = queue.shift();
    if (state.usedIds.has(d.id)) continue;
    if (state.total + (Number(d.price) || 0) > softCap) overBudget = true;
    take(d);
  }
  return { taken, overBudget };
}

// 一句话推荐理由（按池 + 属性模板）
function reasonFor(dish, pool, variant, partySize) {
  const spicy = dish.spiciness || '不辣';
  const isSpicy = /辣/.test(spicy) && spicy !== '不辣';
  const price = Number(dish.price) || 0;
  if (pool === 'signature') {
    return variant && variant.key === 'checkin'
      ? '门店招牌，来唐猫庭院必打卡的看家菜'
      : '门店招牌，撑得住场面的看家菜';
  }
  if (pool === 'staple') {
    return partySize > 3 ? '主食收口，管饱又实惠' : '主食收口，分量正合适';
  }
  if (dish.category === '田园时蔬·汤羹') return '时蔬汤羹，一桌荤素平衡全靠它';
  if (pool === 'cold') {
    return isSpicy ? `开胃凉菜，${spicy}爽口解腻` : '开胃凉菜，清爽解腻';
  }
  // 热菜
  if (price >= 88) {
    return variant && variant.key === 'banquet' ? '硬菜撑场，宴请倍儿有面子' : '一道硬菜，镇桌之选';
  }
  if ((Number(dish.order_count) || 0) >= 20) return '桌桌必点的热门菜，闭眼点不踩雷';
  if (isSpicy) return `风味热菜，${spicy}过瘾下饭`;
  return 'AI 依你的口味挑的本帮热菜';
}

// 组合主入口：输入已打分（_score）的四个池，输出三套套餐。
// 每套 dishes 元素形如 { dish, pool, reason }，总价/人均由跨池共享的 state 累计。
function buildTableSets({ pools, partySize, budgetPerPerson }) {
  const sets = [];
  for (const variant of VARIANTS) {
    const quotas = quotasFor(partySize, pools, variant);
    const softCap = budgetPerPerson * partySize * variant.budgetFactor * 1.15;
    const state = { total: 0, spiceCount: {}, ingSeen: new Set(), usedIds: new Set() };
    // 消费顺序：招牌必保 → 热菜 → 凉菜 → 主食，让贵的先吃预算
    const order = [
      ['signature', quotas.signature],
      ['hot', quotas.hot],
      ['cold', quotas.cold],
      ['staple', quotas.staple],
    ];
    const picked = [];
    let overBudget = false;
    for (const [poolKey, quota] of order) {
      if (quota <= 0) continue;
      const queue = pools[poolKey].slice().sort((a, b) => sortValue(b, variant.prefer) - sortValue(a, variant.prefer));
      const r = pickFromPool(queue, quota, softCap, state);
      r.taken.forEach(d => picked.push({ dish: d, pool: poolKey }));
      if (r.overBudget) overBudget = true;
    }
    // 全套里 ML 分最高的一道带上匹配度话术
    let best = null;
    for (const p of picked) {
      if (!best || (p.dish._score || 0) > (best.dish._score || 0)) best = p;
    }
    const dishes = picked.map(p => {
      const reason = reasonFor(p.dish, p.pool, variant, partySize);
      if (p === best && (p.dish._score || 0) > 0) {
        return { dish: p.dish, pool: p.pool, reason: `${reason}，AI 匹配度 ${Math.round((p.dish._score || 0) / 5 * 100)}%` };
      }
      return { dish: p.dish, pool: p.pool, reason };
    });
    sets.push({
      key: variant.key,
      style: variant.label,
      dishes,
      totalPrice: Math.round(state.total * 100) / 100,
      perPerson: partySize ? Math.round(state.total / partySize * 100) / 100 : 0,
      overBudget,
    });
  }
  return sets;
}

// worker 不可用时的本地规则分兜底（口径与训练缺失兜底一致：评分按 3.5）
function fallbackScore(dish, prefs) {
  prefs = prefs || {};
  let s = 3.5;
  const price = Number(dish.price) || 0;
  const band = price <= 50 ? '经济' : price <= 100 ? '适中' : '品质';
  if (prefs['价格区间'] && prefs['价格区间'] === band) s += 0.4;
  if (prefs['辣度'] && prefs['辣度'] !== '无') s += (dish.spiciness === prefs['辣度'] ? 0.5 : -0.15);
  if (Array.isArray(dish.tags) && dish.tags.includes('招牌')) s += 0.5;
  s += Math.min(Number(dish.order_count) || 0, 50) / 100;
  return Math.round(s * 100) / 100;
}

module.exports = {
  POOL_CATEGORIES,
  ALLERGY_KEY_MAP,
  VARIANTS,
  ingredientOf,
  normalizeAllergies,
  buildPools,
  quotasFor,
  pickFromPool,
  reasonFor,
  buildTableSets,
  fallbackScore,
};
