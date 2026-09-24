// 唐猫庭院 - 一桌菜组合推荐（规则引擎 v1，路线图 8.4）
// 纯函数模块：输入按池分好、带 _score 的候选菜品，输出三套组合。不含 IO，可脱离服务单测。
// 池子结构见 buildPools；单菜评分由 server.js 调 Python worker 批量打分，本模块只管组合。
'use strict';

// ── 池子配置 ──
// 热菜不走 category='热菜'（那批是测试脏数据），由真实热菜分类组成；饮品永不参与。
// 小吃池（键名 staple 为历史遗留）：陕西小吃整类收编——面点当主食收口、点心当餐后甜口、
// 其余是席面的烟火气；米饭（主食分类）不进池，由 withAutoRice 按人数自动配。
const POOL_CATEGORIES = {
  cold: ['特色凉菜'],
  hot: ['传承陕菜', '热销菜品', '江湖海鲜', '田园时蔬·汤羹'],
};
const STAPLE_CATEGORIES = ['陕西小吃'];

// 忌口中文名（前端/用户档案口径）→ dishes.allergies JSONB 键
const ALLERGY_KEY_MAP = { '海鲜': 'seafood', '花生': 'peanut', '鸡蛋': 'egg', '大豆': 'soy', '麸质': 'gluten' };
const ALLERGY_KEYS = Object.values(ALLERGY_KEY_MAP);

// 三套风格变体：预算完全相同（用户拍板：不应调整预算，只有侧重点不同），
// 差异化来自选菜哲学——家常=吃饱（平价优先，同样预算吃更多道）、
// 宴请=吃好（偏爱贵菜硬菜，撑得起排场）、打卡=吃特色（招牌/传承/海鲜优先，人气作弱参考）。
const VARIANTS = [
  { key: 'home', label: '家常版', signatureQuota: 1, prefer: 'value' },
  { key: 'banquet', label: '宴请版', signatureQuota: 2, prefer: 'premium' },
  { key: 'checkin', label: '打卡版', signatureQuota: 2, prefer: 'special' },
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
    // 小吃池排除招牌菜：招牌菜专属招牌池（毛笔酥这类特色点心归打卡/招牌位，不当代小吃散配）
    if (d.category === '陕西小吃' && !tags.includes('招牌')) pools.staple.push(d);
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

// 荤菜识别：海鲜分类直接算荤，其余按菜名关键词（鸡鱼肘子牛肚这类硬菜）
function isMeaty(d) {
  if (!d) return false;
  if (d.category === '江湖海鲜') return true;
  return /鱼|虾|蟹|鳝|肚|牛|羊|排骨|肘子|海鲜|鸡(?!蛋)|鸭(?!蛋)|肉/.test(d.name || '');
}

// 变体排序分（三套哲学）：家常=吃饱（平价优先，同预算吃更多道）；
// 宴请=吃好（贵菜硬菜往前，撑得起排场）；打卡=吃特色（招牌/传承陕菜/江湖海鲜优先，人气仅弱参考）。
// prevPenalty：跨套差异化——前几套已选过的菜按次数降权（降权不排除，保留少量重叠）。
function sortValue(d, prefer, prevPenalty) {
  const price = Number(d.price) || 0;
  let v = d._score || 0;
  if (prefer === 'value') v += Math.max(0, 60 - price) / 75;
  if (prefer === 'premium') v += Math.min(price, 200) / 250;
  if (prefer === 'special') {
    if (Array.isArray(d.tags) && d.tags.includes('招牌')) v += 0.5;
    if (d.category === '江湖海鲜' || d.category === '传承陕菜') v += 0.2;
    if (isMeaty(d)) v += 0.15;
    v += Math.min(Number(d.order_count) || 0, 60) / 300;
  }
  if (prevPenalty) v -= (prevPenalty.get(d.id) || 0) * 0.6;
  return v;
}

// 从单个池贪心选菜（queue 会被消费）。
// state: { total, spiceCount, ingSeen, usedIds } 跨池共享——辣度分散与主料不重复是全桌约束，
// usedIds 保证同一道菜（招牌池与分类池可能同时收录）在整套里只出现一次。
// 第一遍在软预算内选且尽量避开已连选 2 次的辣度/已选主料（有替代时才让位）；
// opts.allowOver（默认 true）允许第二遍无视预算保配额并打 overBudget 标；
// 组合主流程用 allowOver:false 的单道轮转模式，预算不够宁可缩配额也不超支。
function pickFromPool(queue, quota, softCap, state, opts = {}) {
  const allowOver = opts.allowOver !== false;
  const priceCap = opts.priceCap;
  // priceStrict：超均价的候选一律让位（哪怕池里没有更低价也不破例）。
  // 热/冷/主食池用严格模式——否则价格断层（如 28 与 32 元之间无菜）时，
  // 天价/偏贵菜会以"找不到更便宜"破例入选，一口吃掉后续槽位的预算。
  // 招牌池走非严格（必点项，池浅价高，无更低价时允许入选）。
  const priceStrict = opts.priceStrict === true;
  // ignoreHeuristics：补结构阶段用——辣度分散/主料回避让位可能互相顶死，兜底时绕开
  const ignoreHeuristics = opts.ignoreHeuristics === true;
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
  const fits = (d) => {
    if (state.usedIds.has(d.id)) return false;
    return state.total + (Number(d.price) || 0) <= softCap;
  };
  for (let i = 0; i < queue.length && taken.length < quota;) {
    const d = queue[i];
    if (!fits(d)) { i++; continue; }
    if (priceCap !== undefined && (Number(d.price) || 0) > priceCap) {
      const hasCheaper = queue.some((x, j) => j > i && fits(x) && (Number(x.price) || 0) <= priceCap);
      if (priceStrict || hasCheaper) { i++; continue; }
    }
    const rest = queue.slice(i + 1);
    if (!ignoreHeuristics) {
      if ((state.spiceCount[d.spiciness] || 0) >= 2 && rest.some(x => (state.spiceCount[x.spiciness] || 0) < 2)) { i++; continue; }
      const ing = ingredientOf(d.name);
      if (ing && state.ingSeen.has(ing) && rest.some(x => { const g = ingredientOf(x.name); return !g || !state.ingSeen.has(g); })) { i++; continue; }
    }
    take(d);
    queue.splice(i, 1);
  }
  if (!allowOver) return { taken, overBudget };
  while (queue.length && taken.length < quota) {
    const d = queue.shift();
    if (state.usedIds.has(d.id)) continue;
    if (state.total + (Number(d.price) || 0) > softCap) overBudget = true;
    take(d);
  }
  return { taken, overBudget };
}

// 一句话推荐理由（按池 + 属性模板）；话术以"猫掌柜"人格口吻输出
function reasonFor(dish, pool, variant, partySize) {
  const spicy = dish.spiciness || '不辣';
  const isSpicy = /辣/.test(spicy) && spicy !== '不辣';
  const price = Number(dish.price) || 0;
  if (pool === 'signature') {
    return variant && variant.key === 'checkin'
      ? '掌柜的招牌，来唐猫庭院必打卡的看家菜'
      : '掌柜的看家推荐，撑得住场面的招牌菜';
  }
  if (pool === 'staple') {
    // 小吃池三种口吻：面点主食收口、糕点酸奶餐后甜口、其余是席面的烟火气
    const name = dish.name || '';
    if (/糕|酸奶/.test(name)) return '餐后甜口，席面收得漂亮';
    if (/面|饭|馍|皮|包/.test(name)) return partySize > 3 ? '主食收口，管饱又实惠' : '主食收口，分量正合适';
    return '陕味小吃，席面的烟火气';
  }
  if (dish.category === '田园时蔬·汤羹') return '时蔬汤羹，一桌荤素平衡全靠它';
  if (pool === 'cold') {
    return isSpicy ? `开胃凉菜，${spicy}爽口解腻` : '开胃凉菜，清爽解腻';
  }
  // 热菜
  if (price >= 88) {
    return variant && variant.key === 'banquet' ? '硬菜撑场，宴请倍儿有面子' : '一道硬菜，镇桌之选';
  }
  if ((Number(dish.order_count) || 0) >= 20) return '掌柜点名的人气菜，闭眼点不踩雷';
  if (isSpicy) return `风味热菜，${spicy}过瘾下饭`;
  return '掌柜依你的口味挑的家常热菜';
}

// 组合主入口：输入已打分（_score）的四个池，输出三套套餐。
// 每套 dishes 元素形如 { dish, pool, reason }，总价/人均由跨池共享的 state 累计。
// reservedExtras：预算外固定项（如按人数自动配的米饭）——先从预算里预留，保证含米饭的人均仍落在所选档位内。
function buildTableSets({ pools, partySize, budgetPerPerson, reservedExtras }) {
  const sets = [];
  // 跨套差异化：前一套选过的菜在后一套降权（降权不排除），让家常/宴请/打卡真正拉开差距
  const prevPenalty = new Map();
  for (const variant of VARIANTS) {
    const quotas = quotasFor(partySize, pools, variant);
    // 单双人简餐结构（用户拍板）：一人食/两人餐本无"席面"，不套四池规制——
    // 热菜×N + 小吃1 + 冷菜1（仅双人），招牌不设配额，由预算余额升级补位自然入选。
    if (partySize <= 2) {
      quotas.hot = partySize + 1; // 荤热菜×N + 时蔬汤羹×1（热菜池荤素拆分后自动各半）
      quotas.cold = partySize === 2 ? Math.min(1, pools.cold.length) : 0;
      quotas.staple = Math.min(1, pools.staple.length);
      quotas.signature = 0; // 招牌不设配额，预算余额升级补位自然入选
    }
    // 用户拍板（十元档）：家常取前五元、宴请/打卡取后五元。目标取各自半区顶部，
    // 贪心贴上限的落点即回到所选半区——家常人均落在档位前五，宴请/打卡落在后五。
    // 家常=吃饱：平价排序 + 配额加二（多吃两道），让"吃饱"落在档位内而不是吃不满。
    if (variant.key === 'home' && partySize >= 3) {
      quotas.hot = Math.min(quotas.hot + 1, 12, pools.hot.length);
      quotas.cold = Math.min(quotas.cold + 1, 8, pools.cold.length);
    }
    const BAND_WIDTH = 10;
    // 家常=前五元顶部（预算-5）；宴请=档位上沿（最贵，撑档次）；打卡=上沿-1（人气路线略低半档）
    const targetPerPerson = variant.key === 'home' ? budgetPerPerson - 5 : variant.key === 'checkin' ? budgetPerPerson - 1 : budgetPerPerson;
    const extras = Number(reservedExtras) || 0;
    const softCap = Math.max(0, targetPerPerson * partySize - extras);
    const state = { total: 0, spiceCount: {}, ingSeen: new Set(), usedIds: new Set() };
    // 轮转选取：每轮按 招牌→热菜→凉菜→主食 各选一道。若按池一口气吃满配额，
    // 高价热菜会把预算吃光、凉菜主食被挤到超支兜底；轮转保证席面结构均衡。
    // 预算不足时宁可该轮缺一道（allowOver:false），也不整体超支。
    // 热菜池拆荤/素两条子队列：荤菜保底 ⌈热菜配额/2⌉（打卡全素教训），
    // 荤子队列非严格限价（硬菜是席面亮点，允许在均价内破例），素子队列严格限价填剩余。
    const hotAll = pools.hot.slice();
    const hotMeatDishes = hotAll.filter(isMeaty);
    const hotVegDishes = hotAll.filter(d => !isMeaty(d));
    quotas.hotMeat = Math.min(Math.ceil(quotas.hot / 2), hotMeatDishes.length);
    quotas.hotVeg = quotas.hot - quotas.hotMeat;
    quotas.hot = quotas.hotMeat + quotas.hotVeg;
    const poolOut = k => (k === 'hotMeat' || k === 'hotVeg') ? 'hot' : k;
    const poolOrder = ['signature', 'hotMeat', 'hotVeg', 'cold', 'staple'];
    const queues = {};
    for (const k of poolOrder) {
      const src = k === 'hotMeat' ? hotMeatDishes : k === 'hotVeg' ? hotVegDishes : pools[k];
      queues[k] = src.slice().sort((a, b) => sortValue(b, variant.prefer, prevPenalty) - sortValue(a, variant.prefer, prevPenalty));
    }
    // 地板价封顶 35%：唯一荤菜若为天价菜，地板价会让它抢走大半预算——封顶后退回素菜补位
    const hotMeatFloor = hotMeatDishes.length
      ? Math.min(Math.min(...hotMeatDishes.map(x => Number(x.price) || 0)), Math.round(softCap * 0.35))
      : 0;
    const picked = [];
    let overBudget = false;
    const totalQuota = quotas.hotMeat + quotas.hotVeg + quotas.signature + quotas.cold + quotas.staple;
    // 全场最低菜价：用于给未填槽位留保底预算（reservation）
    let minPrice = Infinity;
    for (const k of ['cold', 'hot', 'signature', 'staple']) for (const x of pools[k]) { const p = Number(x.price) || 0; if (p > 0 && p < minPrice) minPrice = p; }
    if (!Number.isFinite(minPrice)) minPrice = 0;
    // 进度循环补选：每个未满配额的池在每轮都获得重试机会——
    // 早期因预算跳过的槽位，后续轮次预算判断变化后仍能补上，槽位不会永久死亡。
    // 循环终止：配额全满 / 无任何池能再选（预算或池子耗尽）。40 轮保险丝防意外死循环。
    const pickedCount = { signature: 0, hotMeat: 0, hotVeg: 0, cold: 0, staple: 0 };
    let progressed = true;
    let safetyRounds = 0;
    while (picked.length < totalQuota && progressed && safetyRounds++ < 40) {
      progressed = false;
      for (const k of poolOrder) {
        if (pickedCount[k] >= quotas[k] || !queues[k].length) continue;
        // 预算感知双约束取紧：
        //   均价制（剩余预算÷剩余配额）防早期冒进——贵菜把预算吃光、后期全靠捡漏；
        //   保底金制（剩余预算−其余槽位×最低菜价）防尾轮天价菜开"全款口子"饿死结构槽位。
        const remainingSlots = totalQuota - picked.length;
        const avgCap = (softCap - state.total) / remainingSlots;
        const reservedCap = softCap - state.total - minPrice * Math.max(0, remainingSlots - 1);
        let priceCap = Math.max(0, Math.min(avgCap, reservedCap));
        // 荤子队列地板价 = 池内最便宜荤菜：保证每席至少的荤菜不因均价制饿死
        if (k === 'hotMeat' && hotMeatFloor > 0) priceCap = Math.max(priceCap, hotMeatFloor);
        // 招牌是必点项走非严格（无更低价可破例）；其余池严格限价防价格断层破例
        const r = pickFromPool(queues[k], 1, softCap, state, { allowOver: false, priceCap, priceStrict: k !== 'signature' });

        r.taken.forEach(d => { picked.push({ dish: d, pool: poolOut(k) }); pickedCount[k]++; progressed = true; });
      }
    }
    // 补齐放宽：主循环可能因"辣度分散/主料不重复让位 + 限价"叠加而卡死（有预算、有候选、但互相让位）。
    // 此时放下限价与回避约束，仅按得分 + softCap 兜底补满未达配额的槽位——宁可结构满，不追求完美分散。
    while (picked.length < totalQuota && safetyRounds++ < 80) {
      const r = { any: false };
      for (const k of poolOrder) {
        if (pickedCount[k] >= quotas[k] || !queues[k].length) continue;
        // 补结构按最便宜优先——质量已在主循环按得分表达，这里只负责把结构填满
        const q = queues[k].slice().sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
        const pr = pickFromPool(q, 1, softCap, state, { allowOver: false, ignoreHeuristics: true });
        pr.taken.forEach(d => { picked.push({ dish: d, pool: poolOut(k) }); pickedCount[k]++; r.any = true; });
      }
      if (!r.any) break;
    }
    // 简餐升级补位（仅单双人）：结构满后预算若有余额，按得分继续加菜直到花不动——
    // 招牌不再设"必点豁免"，预算够就自然入选，不够就诚实缺席。
    if (partySize <= 2) {
      const restMap = new Map();
      for (const k of poolOrder) {
        const src = k === 'hotMeat' ? hotMeatDishes : k === 'hotVeg' ? hotVegDishes : queues[k];
        for (const x of src) if (!restMap.has(x.id) && !state.usedIds.has(x.id)) restMap.set(x.id, { dish: x, pool: poolOut(k) });
      }
      const rest = [...restMap.values()].filter(e => !state.usedIds.has(e.dish.id))
        .sort((a, b) => sortValue(b.dish, variant.prefer, prevPenalty) - sortValue(a.dish, variant.prefer, prevPenalty));
      for (const e of rest) {
        if (safetyRounds++ > 80) break;
        const price = Number(e.dish.price) || 0;
        if (price <= 0 || state.total + price > softCap) continue;
        state.usedIds.add(e.dish.id);
        state.total += price;
        picked.push({ dish: e.dish, pool: e.pool });
      }
    }
    // 家常=吃饱兜底（仅 N≥3）：配额满后若总分还没到档位下沿，
    // 继续用最便宜的可点菜加到下沿——保证"吃饱"且人均不低于所选档位。
    // N≤2 简餐结构不跑：最便宜兜底会拼出小吃拼盘，单人餐宁精勿凑。
    if (variant.key === 'home' && partySize >= 3) {
      const bandFloor = (budgetPerPerson - 9) * partySize; // 档位下沿（上沿-9）
      const restMap = new Map();
      for (const k of poolOrder) {
        const src = k === 'hotMeat' ? hotMeatDishes : k === 'hotVeg' ? hotVegDishes : queues[k];
        for (const x of src) if (!restMap.has(x.id) && !state.usedIds.has(x.id)) restMap.set(x.id, { dish: x, pool: poolOut(k) });
      }
      const rest = [...restMap.values()].sort((a, b) => (Number(a.dish.price) || 0) - (Number(b.dish.price) || 0));
      for (const e of rest) {
        if (state.total >= bandFloor) break;
        const price = Number(e.dish.price) || 0;
        if (price <= 0 || state.total + price > softCap) continue;
        state.usedIds.add(e.dish.id);
        state.total += price;
        picked.push({ dish: e.dish, pool: e.pool });
      }
    }
    // 热菜荤素平衡：热菜全素时，把最便宜的一道素热菜换成预算内的最高分荤菜
    const hotPicks = picked.filter(p => p.pool === 'hot');
    if (hotPicks.length >= 2 && !hotPicks.some(p => isMeaty(p.dish)) && pools.hot.length) {
      const meats = pools.hot.filter(d => !state.usedIds.has(d.id) && isMeaty(d))
        .sort((a, b) => (b._score || 0) - (a._score || 0));
      const vegs = hotPicks.slice().sort((a, b) => (Number(a.dish.price) || 0) - (Number(b.dish.price) || 0));
      let swapped = false;
      for (const vp of vegs) {
        if (swapped) break;
        const vpPrice = Number(vp.dish.price) || 0;
        for (const mc of meats) {
          const mcPrice = Number(mc.price) || 0;
          if (state.total - vpPrice + mcPrice <= softCap) {
            state.usedIds.delete(vp.dish.id);
            state.usedIds.add(mc.id);
            state.total = Math.round((state.total - vpPrice + mcPrice) * 100) / 100;
            const idx = picked.indexOf(vp);
            picked[idx] = { dish: mc, pool: 'hot' };
            swapped = true;
            break;
          }
        }
      }
    }
    // 本套已选菜计入跨套惩罚，下一套排序时让位给没上过的菜；
    // 热菜池惩罚减半——若全額惩罚，荤热菜会在后几套被素菜挤出（打卡全素教训）
    for (const p of picked) {
      const step = p.pool === 'hot' ? 0.3 : 0.6;
      prevPenalty.set(p.dish.id, (prevPenalty.get(p.dish.id) || 0) + step);
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
  // 菜价档与前端偏好表单口径一致：经济<20 / 适中20-50 / 品质>50
  const band = price < 20 ? '经济' : price <= 50 ? '适中' : '品质';
  if (prefs['价格区间'] && prefs['价格区间'] === band) s += 0.4;
  if (prefs['辣度'] && prefs['辣度'] !== '无') s += (dish.spiciness === prefs['辣度'] ? 0.5 : -0.15);
  if (Array.isArray(dish.tags) && dish.tags.includes('招牌')) s += 0.5;
  s += Math.min(Number(dish.order_count) || 0, 50) / 100;
  return Math.round(s * 100) / 100;
}

// ── 用户评分偏好组装（12 维模型的中文键）──
// 词表与前端偏好表单一致（口径统一才不丢值）
const PREF_VOCABS = {
  spiciness: ['无', '不辣', '微辣', '中辣', '重辣'],
  saltiness: ['无', '清淡', '适中', '偏咸'],
  sweetness: ['无', '无味', '甜味', '酸味', '酸甜'],
  calorie: ['无', '低卡', '适中', '高能量'],
  religion: ['无特殊要求', '素食', '清真'],
};

// params: { budgetPerPerson, spiciness, saltiness, sweetness, calorie, religion }（parseTableParams 已归一）
// profile: 登录用户 users.preferences（可为 null）——档案只作默认值，请求显式选择优先
// 价格区间永远由人均预算映射（预算是组合的硬约束，评分档位与之一致，不用档案价格档）
function buildTableUserPrefs(params, profile) {
  params = params || {};
  profile = (profile && typeof profile === 'object' && !Array.isArray(profile)) ? profile : {};
  const pick = (val, vocab, fallback) => (vocab.includes(val) ? val : fallback);
  // 请求显式选择（非中性值且在词表内）> 档案默认 > 中性兜底
  const explicit = (val, vocab, neutrals) => (val && !(neutrals || ['无']).includes(val) && vocab.includes(val)) ? val : null;
  const spicy = explicit(params.spiciness, PREF_VOCABS.spiciness) || pick(profile.spiciness, PREF_VOCABS.spiciness, '无');
  const budget = Number(params.budgetPerPerson) || 80;
  const band = budget <= 30 ? '经济' : budget <= 80 ? '适中' : '品质';
  return {
    '辣度': spicy,
    '咸淡': explicit(params.saltiness, PREF_VOCABS.saltiness) || pick(profile.saltiness, PREF_VOCABS.saltiness, '无'),
    '甜酸': explicit(params.sweetness, PREF_VOCABS.sweetness) || pick(profile.sweetness, PREF_VOCABS.sweetness, '无'),
    '价格区间': band,
    '饮食_宗教': explicit(params.religion, PREF_VOCABS.religion, ['无', '无特殊要求']) || pick(profile.religion, PREF_VOCABS.religion, '无特殊要求'),
    '热量': explicit(params.calorie, PREF_VOCABS.calorie) || pick(profile.calorie, PREF_VOCABS.calorie, '无'),
  };
}

// 按人数自动配米饭（用户方案：米饭作为配饭不参与推荐，直接按人数配好个数）。
// riceDish 从主食分类里找；缺失/下架则优雅跳过。米饭计入总价与人均，但不占推荐菜位、
// 没有换/加操作（前端按 autoItems 渲染固定搭配行）。
function withAutoRice(sets, riceDish, partySize) {
  if (!riceDish || !Array.isArray(sets)) {
    return (sets || []).map(s => ({ ...s, autoItems: [] }));
  }
  const unit = Math.round((Number(riceDish.price) || 0) * 100) / 100;
  return sets.map(s => {
    const autoItems = [{
      id: riceDish.id, name: riceDish.name, image_url: riceDish.image_url || '',
      price: unit, qty: partySize,
    }];
    const totalPrice = Math.round((s.totalPrice + unit * partySize) * 100) / 100;
    const perPerson = partySize ? Math.round(totalPrice / partySize * 100) / 100 : 0;
    return { ...s, autoItems, totalPrice, perPerson };
  });
}

module.exports = {
  POOL_CATEGORIES,
  ALLERGY_KEY_MAP,
  VARIANTS,
  PREF_VOCABS,
  ingredientOf,
  normalizeAllergies,
  isMeaty,
  buildPools,
  quotasFor,
  pickFromPool,
  reasonFor,
  buildTableSets,
  fallbackScore,
  buildTableUserPrefs,
  withAutoRice,
};
