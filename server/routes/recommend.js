'use strict';
// 唐猫庭院 · 推荐与 ML 信息域(偏好/推荐埋点、模型指标、特征重要性、一桌菜组合推荐)——从 server.js 拆出(2026-10-13 改造4)
// 依赖注入: db/logger/softAuth/state/readJSON/mlworker(worker 健康与打分分发)
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const tableRecommend = require('../../table_recommend');

const ROOT = path.join(__dirname, '..', '..');

function register(app, deps) {
  const { db, logger, softAuth, state, readJSON, mlworker } = deps;

  // ─── 偏好记录(软身份验证) ───
  app.post('/api/preference-log', softAuth, async (req, res) => {
    try {
      const { spiciness, saltiness, sweetness, price, calorie, religion, allergies, recommendationMode } = req.body;
      // userId 取自 JWT，拒绝客户端伪造（与 /api/feedback、/api/order 一致）
      const effectiveUserId = req.user?.username || 'guest';
      const pool = db;
      await pool.query(
        "INSERT INTO preference_log (spiciness, saltiness, sweetness, price, calorie, religion, allergies, user_id, recommendation_mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [spiciness||null, saltiness||null, sweetness||null, price||null, calorie||null, religion||null, allergies||[], effectiveUserId, recommendationMode||'auto']
      );
      res.json({ success: true });
    } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
  });

  // ─── 推荐次数记录 ───
  app.post('/api/recommendation-log', softAuth, async (req, res) => {
    try {
      // userType / userId 取自 JWT，拒绝客户端伪造
      const effectiveUserId = req.user?.username || 'guest';
      const effectiveUserType = req.user ? 'user' : 'guest';
      // mode 区分推荐形态（单菜推荐/一桌菜组合/一桌菜换菜），截断防脏数据
      let mode = '单菜推荐';
      if (req.body && typeof req.body.mode === 'string' && req.body.mode.trim()) {
        mode = req.body.mode.trim().slice(0, 30);
      }
      const pool = db;
      await pool.query('INSERT INTO recommendation_log (user_type, user_id, mode) VALUES ($1,$2,$3)', [effectiveUserType, effectiveUserId, mode]);
      res.json({ success: true });
    } catch (e) { logger.error('API错误:', e.message); res.status(500).json({ success: false, error: '服务器内部错误' }); }
  });

  // ─── 模型指标(读 model_metrics.json 缓存) ───
  app.get('/api/model-metrics', (req, res) => {
    try {
      const metricsPath = path.join(ROOT, 'model_metrics.json');
      if (fs.existsSync(metricsPath)) {
        const metrics = readJSON(metricsPath);
        return res.json({ success: true, metrics });
      }
      // 缓存文件不存在时返回空指标，不阻塞事件循环、不返回误导性假数据
      res.json({ success: false, metrics: null, error: '模型指标暂未生成，请触发重训练后重试' });
    } catch (e) { res.json({ success: false, metrics: null, error: '模型指标读取失败' }); }
  });

  // ─── 特征重要性(启动时预加载，长时间缓存) ───
  let featureImportanceCache = null;
  let featureImportanceCacheTime = 0;
  const FEATURE_IMPORTANCE_CACHE_DURATION = 86400000; // 24小时（模型很少变化）

  // 启动后异步预加载
  function preloadFeatureImportance() {
    try {
      const staticPath = path.join(ROOT, 'feature_importance.json');
      if (!fs.existsSync(staticPath)) {
        logger.warn('特征重要性静态文件不存在，跳过预加载');
        return;
      }
      const data = readJSON(staticPath);
      if (data.success && data.importance) {
        featureImportanceCache = {
          success: true,
          importance: data.importance,
          explanation: '模型基于以下12个维度预测您对菜品的喜好程度：菜品辣度、咸淡、甜酸、热量，价格、评分、是否招牌，以及您的个人口味偏好（辣度/咸淡/甜酸/价格区间/热量）。',
          key_factors: [
            '1. 用户口味偏好（咸淡/辣度/甜酸）是影响推荐的首要因素',
            '2. 辣度特征（菜品辣度 + 您的口味偏好）影响显著',
            '3. 您的甜酸和咸淡偏好也有重要影响',
            '4. 评分和招牌属性作为辅助参考'
          ]
        };
        featureImportanceCacheTime = Date.now();
        logger.info('特征重要性预加载成功');
      }
    } catch(e) { logger.warn('特征重要性预加载失败: ' + (e?.message || '')); }
  }
  setTimeout(preloadFeatureImportance, 5000);

  app.get('/api/feature-importance', (req, res) => {
    try {
      const now = Date.now();
      if (featureImportanceCache && (now - featureImportanceCacheTime < FEATURE_IMPORTANCE_CACHE_DURATION)) {
        return res.json(featureImportanceCache);
      }
      // 从静态 JSON 文件读取（避免每次启动 Python 进程，耗时 8-10 秒）
      const staticPath = path.join(ROOT, 'feature_importance.json');
      if (fs.existsSync(staticPath)) {
        const data = readJSON(staticPath);
        if (data.success && data.importance) {
          const response = {
            success: true,
            importance: data.importance,
            explanation: '模型基于以下12个维度预测您对菜品的喜好程度：菜品辣度、咸淡、甜酸、热量，价格、评分、是否招牌，以及您的个人口味偏好（辣度/咸淡/甜酸/价格区间/热量）。',
            key_factors: [
              '1. 用户口味偏好（咸淡/辣度/甜酸）是影响推荐的首要因素',
              '2. 辣度特征（菜品辣度 + 您的口味偏好）影响显著',
              '3. 您的甜酸和咸淡偏好也有重要影响',
              '4. 评分和招牌属性作为辅助参考'
            ]
          };
          featureImportanceCache = response;
          featureImportanceCacheTime = now;
          return res.json(response);
        }
      }
      throw new Error('特征重要性数据文件不存在');
    } catch (e) {
      logger.error('获取特征重要性失败: ' + (e?.message || ''));
      if (featureImportanceCache) {
        return res.json(featureImportanceCache);
      }
      // 最后的备用方案：硬编码的默认值
      const fallback = {
        success: true,
        importance: [
          { feature: '招牌', importance: 0.2108 },
          { feature: '用户辣度', importance: 0.1616 },
          { feature: '用户甜酸', importance: 0.13 },
          { feature: '辣度', importance: 0.1279 },
          { feature: '甜酸', importance: 0.114 },
          { feature: '用户咸淡', importance: 0.0878 },
          { feature: '价格', importance: 0.0728 },
          { feature: '评分', importance: 0.0106 }
        ],
        explanation: '模型基于以下12个维度预测您对菜品的喜好程度：菜品辣度、咸淡、甜酸、热量，价格、评分、是否招牌，以及您的个人口味偏好（辣度/咸淡/甜酸/价格区间/热量）。',
        key_factors: [
          '1. 是否招牌菜对推荐影响最大',
          '2. 您的个人口味偏好（辣度、甜酸、咸淡）非常重要',
          '3. 菜品本身的口味特征（辣度、甜酸、咸淡）也有影响',
          '4. 价格和评分作为辅助参考因素'
        ]
      };
      res.json(fallback);
    }
  });

  // ═══════════════════════════════════════════════
  // 一桌菜组合推荐（路线图 8.4 · MVP）：规则引擎组合 + worker 批量打分
  // ═══════════════════════════════════════════════

  // 组合推荐要过一遍 worker 批量打分，比普通查询贵，单独限流（env 可覆盖）。
  // 默认 100 次/15 分钟：店内 WiFi 下顾客共享出口 IP，整店共享额度，不宜过低。
  const TABLE_RATE_LIMIT_RAW = parseInt(process.env.TABLE_RATE_LIMIT_MAX || '100');
  const TABLE_RATE_LIMIT_MAX = (Number.isFinite(TABLE_RATE_LIMIT_RAW) && TABLE_RATE_LIMIT_RAW >= 1) ? TABLE_RATE_LIMIT_RAW : 30;
  const tableLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: TABLE_RATE_LIMIT_MAX,
    message: { success: false, error: '一桌菜生成过于频繁，请稍后再试' },
  });

  const TABLE_SPICY_LEVELS = ['无', '不辣', '微辣', '中辣', '重辣'];
  const TABLE_POOL_KEYS = ['cold', 'hot', 'signature', 'staple'];

  function parseTableParams(body) {
    const partySize = parseInt(body.partySize, 10);
    if (!Number.isFinite(partySize) || partySize < 1 || partySize > 20) {
      return { error: 'partySize 必须为 1-20 的整数' };
    }
    let budget = 80;
    if (body.budgetPerPerson !== undefined && body.budgetPerPerson !== null && body.budgetPerPerson !== '') {
      budget = Number(body.budgetPerPerson);
      if (!Number.isFinite(budget) || budget < 10 || budget > 1000) {
        return { error: 'budgetPerPerson 必须为 10-1000 的数字' };
      }
    }
    const spiciness = TABLE_SPICY_LEVELS.includes(body.spiciness) ? body.spiciness : '无';
    const religion = ['无特殊要求', '素食', '清真'].includes(body.religion) ? body.religion : '无特殊要求';
    const V = tableRecommend.PREF_VOCABS;
    const saltiness = V.saltiness.includes(body.saltiness) ? body.saltiness : '无';
    const sweetness = V.sweetness.includes(body.sweetness) ? body.sweetness : '无';
    const calorie = V.calorie.includes(body.calorie) ? body.calorie : '无';
    // 已点菜排除入参：excludeIds 是客户端补充（本会话各轮+购物车），tableNumber 由服务端查本桌进行中订单
    const excludeIds = (Array.isArray(body.excludeIds) ? body.excludeIds : [])
      .map(n => parseInt(n, 10)).filter(Number.isFinite).slice(0, 500);
    let tableNumber = null;
    if (body.tableNumber !== undefined && body.tableNumber !== null && body.tableNumber !== '') {
      const t = String(body.tableNumber);
      if (!/^\d{1,2}$/.test(t) && t !== '打包') return { error: 'tableNumber 格式不正确' };
      tableNumber = t;
    }
    let avoidRecentDays = 0;
    if (body.avoidRecentDays !== undefined && body.avoidRecentDays !== null && body.avoidRecentDays !== '') {
      avoidRecentDays = parseInt(body.avoidRecentDays, 10);
      if (!Number.isFinite(avoidRecentDays) || avoidRecentDays < 1 || avoidRecentDays > 30) {
        return { error: 'avoidRecentDays 必须为 1-30 的整数' };
      }
    }
    return { partySize, budgetPerPerson: budget, spiciness, saltiness, sweetness, calorie, religion, allergyKeys: tableRecommend.normalizeAllergies(body.allergies), excludeIds, tableNumber, avoidRecentDays };
  }

  // 登录用户口味档案（路线图 8.4 二期：忌口/口味从档案带出；档案只作默认值，请求显式选择优先）
  async function getProfilePrefs(req) {
    if (!req.user || !req.user.id) return { allergyKeys: [], profile: null };
    try {
      const r = await db.query('SELECT preferences FROM users WHERE id = $1', [req.user.id]);
      const prefs = r.rows[0] && r.rows[0].preferences;
      const profile = (prefs && typeof prefs === 'object' && !Array.isArray(prefs)) ? prefs : null;
      return { allergyKeys: tableRecommend.normalizeAllergies(profile && profile.allergies), profile };
    } catch (e) {
      logger.error('读取用户口味档案失败: ' + e.message);
      return { allergyKeys: [], profile: null };
    }
  }

  // 已点菜排除：本桌进行中订单必避（消灭加菜轮重复推荐）；登录用户可选避开近 N 天吃过的（会所版防重复）
  async function collectOrderedDishIds({ tableNumber, avoidRecentDays, req }) {
    const ids = new Set();
    if (tableNumber) {
      try {
        const r = await db.query(
          `SELECT (e->>'id')::int AS dish_id FROM orders o, jsonb_array_elements(o.items) e
           WHERE o.table_number = $1 AND o.status IN ('pending','confirmed')`,
          [tableNumber]
        );
        r.rows.forEach(row => { if (Number.isFinite(row.dish_id)) ids.add(row.dish_id); });
      } catch (e) { logger.error('查询本桌已点菜品失败: ' + e.message); }
    }
    if (avoidRecentDays > 0 && req.user && req.user.username) {
      try {
        const r = await db.query(
          `SELECT (e->>'id')::int AS dish_id FROM orders o, jsonb_array_elements(o.items) e
           WHERE o.user_id = $1 AND o.status <> 'cancelled' AND o.created_at > NOW() - make_interval(days => $2::int)`,
          [req.user.username, avoidRecentDays]
        );
        r.rows.forEach(row => { if (Number.isFinite(row.dish_id)) ids.add(row.dish_id); });
      } catch (e) { logger.error('查询近期吃过菜品失败: ' + e.message); }
    }
    return ids;
  }

  // 埋点：一次推荐动作=一行（mode 列由启动迁移保证；写入失败仅记日志，不影响主流程）
  function logRecommendationMode(req, mode) {
    const userId = (req.user && req.user.username) || 'guest';
    const userType = req.user ? 'user' : 'guest';
    db.query('INSERT INTO recommendation_log (user_type, user_id, mode) VALUES ($1, $2, $3)', [userType, userId, mode])
      .catch(e => logger.error('推荐埋点写入失败: ' + e.message));
  }

  // 批量打分：worker 可用走 ML，不可用降级本地规则分（接口不 5xx）
  async function scoreTableCandidates(userPrefs, dishes) {
    try {
      const preds = await new Promise((resolve, reject) => {
        mlworker.dispatchToWorker(JSON.stringify({ userPrefs, dishes }), {
          onResult: (result) => {
            if (result && result.success && Array.isArray(result.predictions)) resolve(result.predictions);
            else reject(new Error((result && result.error) || 'worker 返回异常'));
          },
          onError: (status, msg) => { const err = new Error(msg); err.status = status; reject(err); },
        });
      });
      const byId = new Map(preds.map(p => [p.id, Number(p.score) || 0]));
      dishes.forEach(d => { d._score = byId.has(d.id) ? byId.get(d.id) : tableRecommend.fallbackScore(d, userPrefs); });
      return 'worker';
    } catch (e) {
      logger.info('一桌菜 worker 打分不可用，本地规则分兜底: ' + e.message);
      dishes.forEach(d => { d._score = tableRecommend.fallbackScore(d, userPrefs); });
      return 'fallback';
    }
  }

  function dishToResult(d, pool) {
    return {
      id: d.id, name: d.name, category: d.category, spiciness: d.spiciness,
      price: Math.round((Number(d.price) || 0) * 100) / 100,
      price_unit: d.price_unit || '', serving: d.serving || '',
      image_url: d.image_url || '', qty: 1, pool,
      matchPct: Math.min(100, Math.max(0, Math.round((d._score || 0) / 5 * 100))),
    };
  }

  app.post('/api/recommend/table', tableLimiter, softAuth, async (req, res) => {
    const params = parseTableParams(req.body || {});
    if (params.error) return res.status(400).json({ success: false, error: params.error });
    try {
      const { allergyKeys: profileAllergyKeys, profile } = await getProfilePrefs(req);
      const allAllergyKeys = new Set(params.allergyKeys);
      profileAllergyKeys.forEach(k => allAllergyKeys.add(k));
      const { pools, excluded } = tableRecommend.buildPools(state.dishData || [], [...allAllergyKeys]);
      // 宗教饮食硬排除（2026-10-08）：清真→猪肉系剔除；素食→荤菜+海鲜剔除。
      // 宗教饮食是硬约束非打分偏好——曾只进 ML 打分特征，清真实测被推猪肉菜
      const religionEff = (params.religion && params.religion !== '无特殊要求') ? params.religion
        : ((profile && profile.religion && profile.religion !== '无特殊要求') ? profile.religion : '');
      let religionExcluded = 0;
      let effPools = pools;
      if (religionEff) {
        effPools = tableRecommend.filterByReligion(pools, religionEff);
        religionExcluded = TABLE_POOL_KEYS.reduce((s, k) => s + ((pools[k].length || 0) - (effPools[k].length || 0)), 0);
      }
      // 已点菜排除：仅登录用户提供（游客无身份，不做已点排除——换桌/新客不继承他人记录）
      // 登录用户：客户端 excludeIds + 本桌进行中订单 +（可选）近 N 天吃过
      const isLoggedIn = req.user && req.user.username && req.user.username !== 'guest';
      const orderedIds = new Set(isLoggedIn ? params.excludeIds : []);
      if (isLoggedIn) {
        (await collectOrderedDishIds({ tableNumber: params.tableNumber, avoidRecentDays: params.avoidRecentDays, req }))
          .forEach(id => orderedIds.add(id));
      }
      // 跨池按 id 去重后浅克隆打分（不污染共享缓存 state.dishData）
      const union = [];
      const seen = new Set();
      for (const key of TABLE_POOL_KEYS) {
        for (const d of effPools[key]) if (!seen.has(d.id)) { seen.add(d.id); union.push({ ...d }); }
      }
      let excludedOrdered = 0;
      const candidates = union.filter(d => {
        if (orderedIds.has(d.id)) { excludedOrdered++; return false; }
        return true;
      });
      if (!candidates.length) {
        const msg = excludedOrdered > 0 ? '候选菜品都被忌口或已点排除，请调整条件后重试' : '当前没有可推荐的菜品，请稍后再试';
        return res.status(503).json({ success: false, error: msg });
      }
      const source = await scoreTableCandidates(tableRecommend.buildTableUserPrefs(params, profile), candidates);
      const byId = new Map(candidates.map(d => [d.id, d]));
      for (const key of TABLE_POOL_KEYS) effPools[key] = effPools[key].filter(d => byId.has(d.id)).map(d => byId.get(d.id));
      // 米饭按人数自动配：预算先预留米饭钱，保证含饭人均仍在所选档位内
      const riceDish = (state.dishData || []).find(d => d && d.is_active !== false && d.category === '主食'
        && typeof d.name === 'string' && d.name.includes('米饭'));
      const riceReserve = riceDish ? (Number(riceDish.price) || 0) * params.partySize : 0;
      const sets = tableRecommend.buildTableSets({
        pools: effPools, partySize: params.partySize, budgetPerPerson: params.budgetPerPerson, reservedExtras: riceReserve,
      }).map(s => ({
        key: s.key, style: s.style,
        dishes: s.dishes.map(x => ({ ...dishToResult(x.dish, x.pool), reason: x.reason })),
        totalPrice: s.totalPrice, perPerson: s.perPerson, overBudget: s.overBudget,
      }));
      const finalSets = tableRecommend.withAutoRice(sets, riceDish, params.partySize);
      logRecommendationMode(req, '一桌菜组合');
      logger.info(`一桌菜推荐: ${params.partySize}人/人均${params.budgetPerPerson}元 来源=${source} 忌口排除=${excludedOrdered} 已点排除=${excludedOrdered}`);
      res.json({ success: true, sets: finalSets, excludedAllergy: excluded, excludedOrdered, usedProfile: !!profile });
    } catch (e) {
      logger.error('一桌菜推荐API错误: ' + e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  // 单道更换：同池重新打分，排除桌上已有的菜，返回最高分的替代
  app.post('/api/recommend/table/swap', tableLimiter, softAuth, async (req, res) => {
    const params = parseTableParams(req.body || {});
    if (params.error) return res.status(400).json({ success: false, error: params.error });
    const poolKey = req.body.pool;
    if (!TABLE_POOL_KEYS.includes(poolKey)) {
      return res.status(400).json({ success: false, error: 'pool 必须为 cold/hot/signature/staple' });
    }
    try {
      const { allergyKeys: profileAllergyKeys, profile } = await getProfilePrefs(req);
      const allAllergyKeys = new Set(params.allergyKeys);
      profileAllergyKeys.forEach(k => allAllergyKeys.add(k));
      const { pools } = tableRecommend.buildPools(state.dishData || [], [...allAllergyKeys]);
      // 已点排除仅登录用户(与主接口同规——游客无身份,不继承他人记录); 换菜本体 outId 任何身份都必须排除,防"换出同款"
      const isLoggedIn = req.user && req.user.username && req.user.username !== 'guest';
      const orderedIds = new Set(isLoggedIn ? params.excludeIds : []);
      const outId = parseInt(req.body.outId, 10);
      if (Number.isFinite(outId)) orderedIds.add(outId);
      if (isLoggedIn) {
        (await collectOrderedDishIds({ tableNumber: params.tableNumber, avoidRecentDays: params.avoidRecentDays, req }))
          .forEach(id => orderedIds.add(id));
      }
      const candidates = pools[poolKey].filter(d => !orderedIds.has(d.id)).map(d => ({ ...d }));
      if (!candidates.length) return res.status(404).json({ success: false, error: '这个位置已经没有可换的菜了' });
      await scoreTableCandidates(tableRecommend.buildTableUserPrefs(params, profile), candidates);
      candidates.sort((a, b) => (b._score || 0) - (a._score || 0));
      // 预算感知: 同价位段优先——优先换入"换完人均仍在本档位内"的候选;档内无候选才回退全局最高分(前端以"略超预算"角标提示)
      let top = candidates[0];
      const planTotal = Number(req.body.planTotal);
      const outPrice = Number(req.body.outPrice);
      if (Number.isFinite(planTotal) && Number.isFinite(outPrice) && planTotal >= 0) {
        const budgetCap = params.budgetPerPerson * params.partySize;
        const maxSwapIn = outPrice + (budgetCap - planTotal);
        const inBudget = candidates.filter(c => (Number(c.price) || 0) <= maxSwapIn + 0.001);
        if (inBudget.length) top = inBudget[0];
      }
      const styleKey = ['home', 'banquet', 'checkin'].includes(req.body.style) ? req.body.style : 'home';
      const variant = tableRecommend.VARIANTS.find(v => v.key === styleKey);
      logRecommendationMode(req, '一桌菜换菜');
      logger.info(`一桌菜换菜: 池=${poolKey} 排除${orderedIds.size}道`);
      res.json({ success: true, dish: { ...dishToResult(top, poolKey), reason: tableRecommend.reasonFor(top, poolKey, variant, params.partySize) } });
    } catch (e) {
      logger.error('一桌菜换菜API错误: ' + e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  // ─── worker 健康薄路由(状态取自 ml-worker,由 server.js 注入) ───
  app.get('/api/worker-health', (req, res) => res.json(mlworker.getHealth()));
}

module.exports = { register, preloadFeatureImportance };
