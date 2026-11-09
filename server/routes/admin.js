'use strict';
const fs = require('fs');
const path = require('path');
// 唐猫庭院 · 管理后台业务域(除登录/上传图/认证中间件,仍留 server.js)——拆出(2026-10-13 可维护性改造4)
// 依赖经 deps 注入;新增依赖在 server.js 挂载处补齐
const ROOT = path.join(__dirname, '..', '..');
const RECOMMENDATION_EFFECT_PATH = path.join(ROOT, 'recommendation_effect.json'); // 项目根(拆出前的 server.js __dirname)

function register(app, deps) {
  const {
    db,
    logger,
    readJSON,
    tableSig,
    loadDishData,
    refreshRecommendationEffect,
    userStorage,
    loadModelInfo,
    getModelInfo,
    getWorkerReady,
    getPendingRequestsSize,
    getErrorStats,
    toCSV,
    getFeatureImportanceCache,
    runtimeSettings,
    saveRuntimeSettings,
    getRetrainingCheck,
    setRetrainingCheck,
    backupOldModel,
    syncDishRatings,
    trackMetrics,
  } = deps;
  app.get('/api/admin/table-qrcodes', (req, res) => {
    try {
      const from = Math.max(1, parseInt(req.query.from, 10) || 1);
      const to = Math.min(99, parseInt(req.query.to, 10) || 30);
      if (to < from) {
        return res.status(400).json({ success: false, error: '结束桌号不能小于起始桌号' });
      }
      const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http');
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000');
      const origin = proto + '://' + host;
      const qrcodes = [];
      for (let n = from; n <= to; n++) {
        const num = String(n).padStart(2, '0');
        qrcodes.push({
          table: num,
          url: origin + '/api/table-view?t=' + encodeURIComponent(num + '.' + tableSig(num)),
        });
      }
      res.json({ success: true, qrcodes });
    } catch (e) {
      logger.error('桌码生成失败:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/daily-report', async (req, res) => {
    try {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || ''))
        ? String(req.query.date)
        : new Date().toISOString().slice(0, 10);
      const byStatus = await db.query(
        `SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(total_price),0)::float AS amount
       FROM orders WHERE created_at::date = $1::date GROUP BY status`,
        [date]
      );
      let totalOrders = 0,
        revenue = 0,
        cancelled = 0,
        cancelledAmount = 0,
        pendingConfirmed = 0;
      byStatus.rows.forEach((r) => {
        if (r.status === 'cancelled') {
          cancelled += r.cnt;
          cancelledAmount += r.amount;
        } else {
          totalOrders += r.cnt;
          revenue += r.amount;
          if (r.status === 'pending' || r.status === 'confirmed') {
            pendingConfirmed += r.cnt;
          }
        }
      });
      const dishes = await db.query(
        `SELECT e->>'name' AS name, SUM((e->>'qty')::int) AS qty, SUM(COALESCE(e->>'price','0')::numeric * (e->>'qty')::int)::float AS revenue
       FROM orders o, jsonb_array_elements(o.items) e
       WHERE o.created_at::date = $1::date AND o.status <> 'cancelled'
       GROUP BY e->>'name' ORDER BY qty DESC, revenue DESC LIMIT 20`,
        [date]
      );
      const hours = await db.query(
        `SELECT EXTRACT(HOUR FROM created_at)::int AS hr, COUNT(*)::int AS cnt, COALESCE(SUM(total_price),0)::float AS amount
       FROM orders WHERE created_at::date = $1::date AND status <> 'cancelled' GROUP BY hr ORDER BY hr`,
        [date]
      );
      // ═══ 席面采纳统计（2026-11-09 数据飞轮第2步: 采纳率/热门组合进日报, 数据源 table_set_log）═══
      // 采纳率为会话级口径: 当日发生任一采纳事件的 show 会话数 / 当日 show 数;
      // show 与采纳可能跨日发生, 各自按事件发生日归入当日
      const tableShowRows = await db.query(
        `SELECT id, sets FROM table_set_log WHERE event_type = 'show' AND created_at::date = $1::date`,
        [date]
      );
      const adoptRows = await db.query(
        `SELECT event_type, log_id, set_key, dish_id FROM table_set_log
       WHERE event_type IN ('adopt_set', 'adopt_dish') AND created_at::date = $1::date`,
        [date]
      );
      const showById = new Map(tableShowRows.rows.map((r) => [r.id, r]));
      const adoptedSessionIds = new Set();
      const comboAgg = {};
      const dishAgg = {};
      adoptRows.rows.forEach((a) => {
        adoptedSessionIds.add(a.log_id);
        if (a.event_type === 'adopt_set') {
          const show = showById.get(a.log_id);
          const seg = show && Array.isArray(show.sets) ? show.sets.find((s) => s.key === a.set_key) : null;
          if (seg) {
            const k = a.set_key + '|' + (seg.dishIds || []).join(',');
            comboAgg[k] = comboAgg[k] || { style: seg.style, dishIds: seg.dishIds || [], totalPrice: seg.totalPrice, cnt: 0 };
            comboAgg[k].cnt += 1;
          }
        } else if (a.dish_id) {
          dishAgg[a.dish_id] = (dishAgg[a.dish_id] || 0) + 1;
        }
      });
      const shows = tableShowRows.rows.length;
      const topComboIds = [...new Set(Object.values(comboAgg).flatMap((c) => c.dishIds))];
      const topDishIds = Object.keys(dishAgg).map(Number).sort((x, y) => dishAgg[y] - dishAgg[x]).slice(0, 5);
      const nameRows = await db.query(
        `SELECT id, name FROM dishes WHERE id = ANY($1::int[])`,
        [[...topComboIds, ...topDishIds]]
      );
      const nameMap = {};
      nameRows.rows.forEach((r) => { nameMap[r.id] = r.name; });
      const tableSet = {
        shows,
        adoptedSessions: adoptedSessionIds.size,
        adoptSet: adoptRows.rows.filter((a) => a.event_type === 'adopt_set').length,
        adoptDish: adoptRows.rows.filter((a) => a.event_type === 'adopt_dish').length,
        rate: shows ? Math.round((adoptedSessionIds.size / shows) * 100) + '%' : null,
        topCombos: Object.values(comboAgg)
          .sort((x, y) => y.cnt - x.cnt)
          .slice(0, 3)
          .map((c) => ({ style: c.style, cnt: c.cnt, totalPrice: c.totalPrice, dishNames: c.dishIds.map((id) => nameMap[id] || '#' + id) })),
        topDishes: topDishIds.map((id) => ({ name: nameMap[id] || '#' + id, cnt: dishAgg[id] })),
      };
      // 桌数维度(2026-11-02 对齐商龙报表口径): 翻台率=非打包完成单去重桌数/30桌; 桌均=营收/去重桌数
      const tableAgg = await db.query(
        `SELECT COUNT(DISTINCT table_number)::int AS tables
       FROM orders WHERE created_at::date = $1::date AND status = 'completed' AND table_number ~ '^[0-9]+$'`,
        [date]
      );
      const usedTables = tableAgg.rows[0]?.tables || 0;
      const TABLE_COUNT = 30;
      // 环比昨日: 营收与单数
      const prev = await db.query(
        `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total_price),0)::float AS revenue
       FROM orders WHERE created_at::date = ($1::date - INTERVAL '1 day') AND status <> 'cancelled'`,
        [date]
      );
      const prevOrders = prev.rows[0]?.cnt || 0;
      const prevRevenue = parseFloat(prev.rows[0]?.revenue) || 0;
      const revenueChange = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 1000) / 10 : null;
      const ordersChange = prevOrders > 0 ? Math.round(((totalOrders - prevOrders) / prevOrders) * 1000) / 10 : null;
      res.json({
        success: true,
        date,
        stats: {
          totalOrders,
          revenue: Math.round(revenue * 100) / 100,
          avgTicket: totalOrders ? Math.round((revenue / totalOrders) * 100) / 100 : 0,
          cancelled,
          cancelledAmount: Math.round(cancelledAmount * 100) / 100,
          pendingConfirmed,
          usedTables,
          turnoverRate: Math.round((usedTables / TABLE_COUNT) * 100) + '%',
          avgPerTable: usedTables ? Math.round((revenue / usedTables) * 100) / 100 : 0,
          prevRevenue: Math.round(prevRevenue * 100) / 100,
          prevOrders,
          revenueChange,
          ordersChange,
        },
        dishes: dishes.rows.map((r) => ({ name: r.name, qty: r.qty, revenue: Math.round(r.revenue * 100) / 100 })),
        hours: hours.rows.map((r) => ({ hr: r.hr, cnt: r.cnt, amount: Math.round(r.amount * 100) / 100 })),
        tableSet,
      });
    } catch (e) {
      logger.error('营业日报失败:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/stats', async (req, res) => {
    try {
      const pool = db;
      // 今日推荐次数（最近24小时）
      const [today, guest, user, totalRec, totalFb, avgRating, totalUsers, totalDishes] = await Promise.all([
        pool.query("SELECT COUNT(*) FROM recommendation_log WHERE created_at > NOW() - INTERVAL '24 hours'"),
        pool.query(
          "SELECT COUNT(*) FROM recommendation_log WHERE user_type='guest' AND created_at > NOW() - INTERVAL '24 hours'"
        ),
        pool.query(
          "SELECT COUNT(*) FROM recommendation_log WHERE user_type='user' AND created_at > NOW() - INTERVAL '24 hours'"
        ),
        pool.query('SELECT COUNT(*) FROM recommendation_log'),
        pool.query('SELECT COUNT(*) FROM feedback'),
        pool.query('SELECT ROUND(AVG(rating),2) as avg FROM feedback'),
        pool.query('SELECT COUNT(*) FROM users'),
        pool.query('SELECT COUNT(*) FROM dishes WHERE is_active = TRUE'),
      ]);
      res.json({
        success: true,
        stats: {
          todayRecommendations: parseInt(today.rows[0].count),
          todayGuest: parseInt(guest.rows[0].count),
          todayUser: parseInt(user.rows[0].count),
          totalRecommendations: parseInt(totalRec.rows[0].count),
          totalFeedback: parseInt(totalFb.rows[0].count),
          avgRating: parseFloat(avgRating.rows[0]?.avg || 0),
          totalUsers: parseInt(totalUsers.rows[0].count),
          totalDishes: parseInt(totalDishes.rows[0].count),
        },
      });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/popular-dishes', async (req, res) => {
    try {
      const pool = db;
      // 饮品与主食不参与菜品排行(与推荐系统口径一致,2026-10-15);饮品经 scope=drink 单独成榜
      const where =
        req.query.scope === 'drink' ? "d.category = '飲品与酒水'" : "d.category NOT IN ('飲品与酒水', '主食')";
      const result = await pool.query(
        `SELECT d.id, d.name, d.category, d.price, d.rating, COUNT(f.id) as feedback_count, ROUND(AVG(f.rating),2) as avg_rating FROM dishes d LEFT JOIN feedback f ON d.id = f.dish_id WHERE d.is_active = TRUE AND ${where} GROUP BY d.id ORDER BY feedback_count DESC, avg_rating DESC NULLS LAST LIMIT 62`
      );
      res.json({ success: true, dishes: result.rows, scope: req.query.scope === 'drink' ? 'drink' : 'dish' });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/feedback-summary', async (req, res) => {
    try {
      const pool = db;
      // 可选 ?dish= 按菜品名过滤（2026-11-08 预警横幅跳转/店家按菜查反馈）：
      // 过滤时走 ILIKE 全量（LIMIT 200），不过滤保持默认最近 50 条
      const dishFilter = (req.query.dish || '').toString().trim().slice(0, 60);
      const result = dishFilter
        ? await pool.query(
            "SELECT f.id, f.dish_id, COALESCE(d.name, '已删除菜品(#' || f.dish_id || ')') as dish_name, f.rating, f.created_at FROM feedback f LEFT JOIN dishes d ON f.dish_id = d.id WHERE COALESCE(d.name, '') ILIKE $1 ORDER BY f.created_at DESC LIMIT 200",
            ['%' + dishFilter.replace(/[%_]/g, '\\$&') + '%']
          )
        : await pool.query(
            "SELECT f.id, f.dish_id, COALESCE(d.name, '已删除菜品(#' || f.dish_id || ')') as dish_name, f.rating, f.created_at FROM feedback f LEFT JOIN dishes d ON f.dish_id = d.id ORDER BY f.created_at DESC LIMIT 50"
          );
      const dist = await pool.query('SELECT rating, COUNT(*) FROM feedback GROUP BY rating ORDER BY rating');
      res.json({ success: true, feedbacks: result.rows, distribution: dist.rows, filteredBy: dishFilter || null });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.post('/api/admin/dish', async (req, res) => {
    try {
      const {
        name,
        category,
        spiciness,
        saltiness,
        sweetness,
        price,
        rating,
        tags,
        allergies,
        isHalal,
        isVegetarian,
        description,
        is_active,
        price_unit,
        serving,
        name_en,
        description_en,
      } = req.body;
      if (!name || name.trim().length < 2) {
        return res.status(400).json({ success: false, error: '菜名至少2个字符' });
      }
      if (name.trim().length > 100) {
        return res.status(400).json({ success: false, error: '菜名不能超过100个字符' });
      }
      if (description && description.length > 500) {
        return res.status(400).json({ success: false, error: '描述不能超过500个字符' });
      }
      // 计价单位/起售规格：空串归一为 null（前端对 null 走 /份 兜底，起售解析也以 null 为"无"）
      const unitNorm = price_unit === undefined || price_unit === null ? null : String(price_unit).trim() || null;
      const servingNorm = serving === undefined || serving === null ? null : String(serving).trim() || null;
      if (unitNorm && !unitNorm.startsWith('/')) {
        return res.status(400).json({ success: false, error: '计价单位需以 / 开头，如 /份、/4个' });
      }
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ success: false, error: '价格不能为负数' });
      }
      const ratingNum = parseFloat(rating);
      if (isNaN(ratingNum) || ratingNum < 0 || ratingNum > 5) {
        return res.status(400).json({ success: false, error: '评分必须在0-5之间' });
      }
      // 新增时尊重前端的上下架勾选；未传则默认上架（兼容旧行为）
      const activeFlag = is_active === undefined ? true : is_active === true || is_active === 'true';
      const pool = db;
      const result = await pool.query(
        `INSERT INTO dishes (name, category, spiciness, saltiness, sweetness, price, rating, tags, allergies, is_halal, is_vegetarian, is_active, description, price_unit, serving, name_en, description_en) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [
          name,
          category || null,
          spiciness || '不辣',
          saltiness || '适中',
          sweetness || '无味',
          priceNum,
          ratingNum,
          Array.isArray(tags)
            ? `{${tags.join(',')}}`
            : tags
              ? `{${String(tags)
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .join(',')}}`
              : '{}',
          allergies ? JSON.stringify(allergies) : '{}',
          isHalal || false,
          isVegetarian || false,
          activeFlag,
          description || null,
          unitNorm,
          servingNorm,
          name_en !== undefined ? (name_en === null ? null : String(name_en).trim() || null) : null,
          description_en !== undefined
            ? description_en === null
              ? null
              : String(description_en).trim() || null
            : null,
        ]
      );
      // 先刷缓存再应答（2026-10-14：响应先行的竞态让客户端紧随的读拿到旧菜名/单位，GUI 电池实测复现）
      try {
        await loadDishData();
      } catch (e) {
        logger.error('刷新菜品缓存失败:', e.message);
      }
      res.json({ success: true, message: '添加成功', id: result.rows[0].id });
    } catch (e) {
      logger.error('添加菜品失败:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.put('/api/admin/dish/:id', async (req, res) => {
    try {
      const dishId = parseInt(req.params.id);
      if (isNaN(dishId) || dishId <= 0) {
        return res.status(400).json({ success: false, error: '无效的菜品ID' });
      }
      const {
        name,
        category,
        spiciness,
        saltiness,
        sweetness,
        price,
        rating,
        tags,
        is_active,
        allergies,
        isHalal,
        isVegetarian,
        description,
        price_unit,
        serving,
        is_sold_out,
        daily_stock,
        name_en,
        description_en,
      } = req.body;
      if (name !== undefined && name.trim().length < 2) {
        return res.status(400).json({ success: false, error: '菜名至少2个字符' });
      }
      if (price !== undefined) {
        const p = parseFloat(price);
        if (isNaN(p) || p < 0) {
          return res.status(400).json({ success: false, error: '价格不能为负数' });
        }
      }
      if (rating !== undefined) {
        const r = parseFloat(rating);
        if (isNaN(r) || r < 0 || r > 5) {
          return res.status(400).json({ success: false, error: '评分必须在0-5之间' });
        }
      }
      // 计价单位/起售规格：传了就更新，空串归一为 null；单位需以 / 开头
      if (price_unit !== undefined) {
        const pu = price_unit === null ? null : String(price_unit).trim() || null;
        if (pu && !pu.startsWith('/')) {
          return res.status(400).json({ success: false, error: '计价单位需以 / 开头，如 /份、/4个' });
        }
      }
      const pool = db;
      const sets = [];
      const vals = [];
      let idx = 1;
      if (name !== undefined) {
        sets.push(`name = $${idx++}`);
        vals.push(name);
      }
      if (category !== undefined) {
        sets.push(`category = $${idx++}`);
        vals.push(category);
      }
      if (spiciness !== undefined) {
        sets.push(`spiciness = $${idx++}`);
        vals.push(spiciness);
      }
      if (saltiness !== undefined) {
        sets.push(`saltiness = $${idx++}`);
        vals.push(saltiness);
      }
      if (sweetness !== undefined) {
        sets.push(`sweetness = $${idx++}`);
        vals.push(sweetness);
      }
      if (price !== undefined) {
        sets.push(`price = $${idx++}`);
        vals.push(parseFloat(price));
      }
      if (rating !== undefined) {
        sets.push(`rating = $${idx++}`);
        vals.push(parseFloat(rating));
      }
      if (is_active !== undefined) {
        sets.push(`is_active = $${idx++}`);
        vals.push(is_active);
      }
      if (tags !== undefined) {
        const cleanTags = tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .join(',');
        sets.push(`tags = $${idx++}::text[]`);
        vals.push(`{${cleanTags}}`);
      }
      if (allergies !== undefined) {
        sets.push(`allergies = $${idx++}::jsonb`);
        vals.push(JSON.stringify(allergies));
      }
      if (isHalal !== undefined) {
        sets.push(`is_halal = $${idx++}`);
        vals.push(isHalal);
      }
      if (isVegetarian !== undefined) {
        sets.push(`is_vegetarian = $${idx++}`);
        vals.push(isVegetarian);
      }
      if (description !== undefined) {
        sets.push(`description = $${idx++}`);
        vals.push(description);
      }
      if (price_unit !== undefined) {
        sets.push(`price_unit = $${idx++}`);
        vals.push(price_unit === null ? null : String(price_unit).trim() || null);
      }
      if (serving !== undefined) {
        sets.push(`serving = $${idx++}`);
        vals.push(serving === null ? null : String(serving).trim() || null);
      }
      if (is_sold_out !== undefined) {
        sets.push(`is_sold_out = $${idx++}`);
        vals.push(is_sold_out === true);
      }
      // 估清备量(2026-11-02): null=改回不限量; 1-9999=设今日备量(即时生效, sold_today 不清零)
      if (daily_stock !== undefined) {
        let v = null;
        if (daily_stock !== null) {
          const n = parseInt(daily_stock);
          if (isNaN(n) || n < 1 || n > 9999) {
            return res.status(400).json({ success: false, error: '备量需为 1-9999 的整数，留空表示不限量' });
          }
          v = n;
        }
        sets.push(`daily_stock = $${idx++}`);
        vals.push(v);
      }
      if (name_en !== undefined) {
        sets.push(`name_en = $${idx++}`);
        vals.push(name_en === null ? null : String(name_en).trim() || null);
      }
      if (description_en !== undefined) {
        sets.push(`description_en = $${idx++}`);
        vals.push(description_en === null ? null : String(description_en).trim() || null);
      }
      if (!sets.length) {
        return res.status(400).json({ success: false, error: '没有要更新的字段' });
      }
      vals.push(dishId);
      await pool.query(`UPDATE dishes SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
      try {
        await loadDishData();
      } catch (e) {
        logger.error('刷新菜品缓存失败:', e.message);
      }
      res.json({ success: true, message: '更新成功' });
    } catch (e) {
      logger.error('更新菜品失败:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.delete('/api/admin/dish/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({ success: false, error: '无效的菜品ID' });
      }
      const pool = db;
      await pool.query('UPDATE dishes SET is_active = NOT is_active WHERE id = $1', [id]);
      try {
        await loadDishData();
      } catch (e) {
        logger.error('刷新菜品缓存失败:', e.message);
      }
      res.json({ success: true, message: '状态已切换' });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.delete('/api/admin/dish/:id/permanent', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({ success: false, error: '无效的菜品ID' });
      }
      const pool = db;
      await pool.query('DELETE FROM dishes WHERE id = $1', [id]);
      try {
        await loadDishData();
      } catch (e) {
        logger.error('刷新菜品缓存失败:', e.message);
      }
      res.json({ success: true, message: '已永久删除' });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/preference-stats', async (req, res) => {
    try {
      const pool = db;
      const fields = ['spiciness', 'saltiness', 'sweetness', 'price', 'calorie', 'religion'];
      const result = {};
      for (const field of fields) {
        const allowedFields = ['spiciness', 'saltiness', 'sweetness', 'price', 'calorie', 'religion'];
        if (!allowedFields.includes(field)) {
          continue;
        }
        const q = await pool.query(
          `SELECT ${field}, COUNT(*) FROM preference_log WHERE ${field} IS NOT NULL GROUP BY ${field} ORDER BY COUNT(*) DESC`
        );
        result[field] = q.rows.reduce((acc, r) => {
          acc[r[field] || '无'] = parseInt(r.count);
          return acc;
        }, {});
      }
      // 偏好完整度聚合：每字段"有效声明率"(非 NULL 且非"无")与每行声明维度数分布
      const completeness = { total: 0, perField: {}, distribution: [] };
      const declaredFields = ['spiciness', 'saltiness', 'sweetness', 'price', 'calorie'];
      const totalRow = await pool.query('SELECT COUNT(*) AS n FROM preference_log');
      completeness.total = parseInt(totalRow.rows[0]?.n || 0);
      if (completeness.total > 0) {
        // 每字段有效声明数(非 NULL 且非"无")
        const decQ = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE spiciness IS NOT NULL AND spiciness <> '无') AS spiciness,
          COUNT(*) FILTER (WHERE saltiness IS NOT NULL AND saltiness <> '无') AS saltiness,
          COUNT(*) FILTER (WHERE sweetness IS NOT NULL AND sweetness <> '无') AS sweetness,
          COUNT(*) FILTER (WHERE price    IS NOT NULL AND price    <> '无') AS price,
          COUNT(*) FILTER (WHERE calorie  IS NOT NULL AND calorie  <> '无') AS calorie
        FROM preference_log`);
        const dr = decQ.rows[0] || {};
        declaredFields.forEach((f) => {
          const n = parseInt(dr[f] || 0);
          completeness.perField[f] = { declared: n, rate: Math.round((n / completeness.total) * 100) };
        });
        // 每行声明维度数分布(0..5)
        const distQ = await pool.query(`
        SELECT declared_count, COUNT(*) AS n FROM (
          SELECT
            (CASE WHEN spiciness IS NOT NULL AND spiciness <> '无' THEN 1 ELSE 0 END +
             CASE WHEN saltiness IS NOT NULL AND saltiness <> '无' THEN 1 ELSE 0 END +
             CASE WHEN sweetness IS NOT NULL AND sweetness <> '无' THEN 1 ELSE 0 END +
             CASE WHEN price    IS NOT NULL AND price    <> '无' THEN 1 ELSE 0 END +
             CASE WHEN calorie  IS NOT NULL AND calorie  <> '无' THEN 1 ELSE 0 END) AS declared_count
          FROM preference_log
        ) t GROUP BY declared_count ORDER BY declared_count`);
        completeness.distribution = distQ.rows.map((r) => ({ count: parseInt(r.declared_count), n: parseInt(r.n) }));
      }
      res.json({ success: true, stats: result, completeness });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/daily-recommendations', async (req, res) => {
    try {
      const pool = db;
      const q = await pool.query(`
      SELECT DATE(created_at) as day, COUNT(*) as total,
             COUNT(*) FILTER (WHERE user_type='guest') as guest_count,
             COUNT(*) FILTER (WHERE user_type='user') as user_count,
             COUNT(*) FILTER (WHERE mode LIKE '一桌菜%') as table_mode_count
      FROM recommendation_log
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY day ORDER BY day
    `);
      res.json({ success: true, data: q.rows });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/user-activity', async (req, res) => {
    try {
      const pool = db;
      const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
      const dailyActive = await pool.query(`
      SELECT DATE(created_at) as day, COUNT(DISTINCT user_id) as active_users
      FROM recommendation_log
      WHERE user_id IS NOT NULL AND user_id != 'guest' AND created_at > NOW() - INTERVAL '14 days'
      GROUP BY day ORDER BY day
    `);
      const feedbackUsers = await pool.query('SELECT COUNT(DISTINCT user_id) FROM feedback WHERE user_id IS NOT NULL');
      res.json({
        success: true,
        stats: {
          totalUsers: parseInt(totalUsers.rows[0].count),
          feedbackUsers: parseInt(feedbackUsers.rows[0].count),
          dailyActive: dailyActive.rows,
        },
      });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/recommendation-details', async (req, res) => {
    try {
      const pool = db;
      const q = await pool.query(`
      SELECT rl.id, rl.user_type, rl.user_id, rl.created_at,
             f.id as feedback_id, f.rating, f.dish_id as feedback_dish_id
      FROM recommendation_log rl
      LEFT JOIN feedback f ON rl.user_id = f.user_id
        AND f.created_at BETWEEN rl.created_at AND rl.created_at + INTERVAL '5 minutes'
      ORDER BY rl.created_at DESC LIMIT 100
    `);
      res.json({ success: true, data: q.rows });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/model-history', (req, res) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const backupDir = path.join(ROOT, 'model_backups');
      const history = [];
      // 当前模型
      try {
        const data = readJSON(path.join(ROOT, 'model_metrics.json'));
        history.push({
          version: getModelInfo().version || '1.0',
          trainedAt: getModelInfo().trainedAt || null,
          r2: data.r2 || 0,
          feedbackCount: data.real_feedback_count || 0,
          isCurrent: true,
          file: 'recommendation_model.pkl',
        });
      } catch (e) {
        logger.warn('读取当前模型指标失败: ' + (e?.message || String(e)));
      }
      // 备份模型
      if (fs.existsSync(backupDir)) {
        const files = fs
          .readdirSync(backupDir)
          .filter((f) => f.endsWith('.pkl'))
          .sort()
          .reverse();
        files.forEach((f) => {
          const stat = fs.statSync(path.join(backupDir, f));
          // 尝试读取备份对应的指标
          const backupMetrics = { r2: 0, feedbackCount: 0 };
          history.push({
            version: '1.' + history.length,
            trainedAt: stat.mtime.toISOString(),
            r2: backupMetrics.r2,
            feedbackCount: backupMetrics.feedbackCount,
            isCurrent: false,
            file: f,
            sizeKB: (stat.size / 1024).toFixed(1),
          });
        });
      }
      res.json({ success: true, history });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/settings', (req, res) => res.json({ success: true, settings: { ...runtimeSettings } }));
  app.post('/api/admin/settings', (req, res) => {
    try {
      const { autoRetrain } = req.body || {};
      if (typeof autoRetrain === 'boolean') {
        runtimeSettings.autoRetrain = autoRetrain;
      }
      saveRuntimeSettings();
      logger.info(`自动重训开关 → ${runtimeSettings.autoRetrain ? '开启' : '关闭'}`);
      res.json({ success: true, settings: { ...runtimeSettings } });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/recommendation-effect', (req, res) => {
    try {
      res.json({ success: true, report: readJSON(RECOMMENDATION_EFFECT_PATH) });
    } catch (e) {
      res.json({ success: true, report: null, message: '尚未生成过，点「重新生成」试试' });
    }
  });
  app.post('/api/admin/recommendation-effect', (req, res) => {
    try {
      const { spawn } = require('child_process');
      const proc = spawn('python', ['ml/recommendation_effect_report.py'], {
        cwd: ROOT,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      });
      let err = '';
      proc.stderr.on('data', (d) => {
        err += d.toString();
      });
      proc.on('close', (code) => {
        if (code !== 0) {
          return res.status(500).json({ success: false, error: '生成失败: ' + err.slice(0, 200) });
        }
        try {
          res.json({ success: true, report: readJSON(RECOMMENDATION_EFFECT_PATH) });
        } catch (e) {
          res.status(500).json({ success: false, error: '报告文件读取失败' });
        }
      });
      proc.on('error', (e) => res.status(500).json({ success: false, error: 'Python 启动失败: ' + e.message }));
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.post('/api/admin/retrain', async (req, res) => {
    try {
      // 反馈重训开关关闭时一律不重训（手动按钮走的也是 retrain_from_feedback.py，
      // 同样吃 feedback 数据 —— 未上线时那些都是测试用例，会把模型带偏）
      if (!runtimeSettings.autoRetrain) {
        return res.status(409).json({
          success: false,
          message: '用户反馈重训已关闭（未上线时反馈都是测试数据）。如需重训，请先打开上方开关。',
        });
      }
      // 检查是否正在训练
      if (global._isRetraining || getRetrainingCheck()) {
        return res.status(409).json({ success: false, message: '模型正在训练中，请稍后' });
      }
      global._isRetraining = true;
      setRetrainingCheck(true);
      logger.info('管理员手动触发重训练...');
      backupOldModel();
      // 异步执行训练，不阻塞事件循环
      const { spawn } = require('child_process');
      const proc = spawn('python', [path.join(ROOT, 'ml', 'retrain_from_feedback.py')], {
        cwd: ROOT,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      });
      // 安全超时：30 秒后清除标志，仅当进程挂起时释放锁（防进程挂起导致标志永久锁定）
      const retrainTimeout = setTimeout(() => {
        if (proc.exitCode === null) {
          global._isRetraining = false;
          setRetrainingCheck(false);
        }
      }, 30000);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('error', (e) => {
        clearTimeout(retrainTimeout);
        logger.error('手动重训练进程错误: ' + e.message);
        global._isRetraining = false;
        setRetrainingCheck(false);
      });
      proc.on('close', async (code) => {
        clearTimeout(retrainTimeout);
        global._isRetraining = false;
        setRetrainingCheck(false);
        if (code === 0) {
          try {
            const pool = db;
            await pool.query('UPDATE feedback SET processed = TRUE WHERE processed = FALSE OR processed IS NULL');
          } catch (e) {
            logger.warn('标记反馈已处理失败: ' + (e?.message || String(e)));
          }
          const mi = getModelInfo();
          mi.version = (parseFloat(mi.version) + 0.1).toFixed(1);
          mi.trainedAt = new Date().toISOString();
          loadModelInfo();
          logger.info(`手动重训练完成，模型版本: ${mi.version}`);
          try {
            await syncDishRatings();
          } catch (e) {
            logger.warn('同步菜品评分失败: ' + (e?.message || ''));
          }
          try {
            await loadDishData();
          } catch (e) {
            logger.error('刷新菜品缓存失败:', e.message);
          }
          refreshRecommendationEffect();
        } else {
          logger.warn('手动重训练失败: ' + (stderr?.substring(0, 200) || ''));
        }
        // 更新模型监控
        try {
          trackMetrics();
        } catch (e) {}
      });
      // 立即返回，训练在后台进行
      res.json({ success: true, message: '重训练已开始，将在后台进行', training: true });
    } catch (e) {
      global._isRetraining = false;
      setRetrainingCheck(false);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/worst-dishes', async (req, res) => {
    try {
      const pool = db;
      const q = await pool.query(`
      SELECT d.id, d.name, d.category, d.price, d.rating as dish_rating,
             COUNT(f.id) as feedback_count,
             ROUND(AVG(f.rating), 2) as avg_feedback_rating,
             MIN(f.rating) as min_rating
      FROM dishes d
      JOIN feedback f ON d.id = f.dish_id
      WHERE d.is_active = TRUE
      GROUP BY d.id, d.name
      HAVING COUNT(f.id) >= 1
      ORDER BY avg_feedback_rating ASC, feedback_count DESC
      LIMIT 20
    `);
      res.json({ success: true, dishes: q.rows });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/model-compare', (req, res) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const backupDir = path.join(ROOT, 'model_backups');
      const versions = [];

      // 当前模型
      try {
        const data = readJSON(path.join(ROOT, 'model_metrics.json'));
        const mi = getModelInfo();
        versions.push({
          label: '当前模型',
          version: mi.version || '1.0',
          trainedAt: mi.trainedAt || null,
          r2: data.r2 || 0,
          mse: data.mse || 0,
          rmse: data.rmse || 0,
          mae: data.mae || 0,
          feedbackCount: data.real_feedback_count || 0,
          isCurrent: true,
        });
      } catch (e) {
        logger.warn('读取模型对比指标失败: ' + (e?.message || String(e)));
      }

      // 备份模型
      if (fs.existsSync(backupDir)) {
        const files = fs
          .readdirSync(backupDir)
          .filter((f) => f.endsWith('.pkl'))
          .sort()
          .reverse()
          .slice(0, 5);
        files.forEach((f, i) => {
          const stat = fs.statSync(path.join(backupDir, f));
          versions.push({
            label: '备份 ' + (i + 1),
            version: '1.' + (i + 1),
            trainedAt: stat.mtime.toISOString(),
            r2: 0,
            mse: 0,
            rmse: 0,
            mae: 0,
            feedbackCount: 0,
            isCurrent: false,
            file: f,
            sizeKB: (stat.size / 1024).toFixed(1),
          });
        });
      }

      // 当前模型特征重要性（使用缓存，避免每次启动 Python 进程）
      let currentImportance = [];
      const featureImportanceCache = getFeatureImportanceCache();
      if (featureImportanceCache && featureImportanceCache.importance) {
        currentImportance = featureImportanceCache.importance;
      }

      res.json({ success: true, versions, currentImportance });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/recommendation-stats', async (req, res) => {
    try {
      const pool = db;
      // 总推荐次数
      const totalRec = await pool.query('SELECT COUNT(*) FROM recommendation_log');
      const total = parseInt(totalRec.rows[0].count);
      // 有反馈的推荐（推荐后5分钟内有反馈）
      const withFeedback = await pool.query(`
      SELECT COUNT(DISTINCT rl.id) as cnt
      FROM recommendation_log rl
      JOIN feedback f ON rl.user_id = f.user_id
        AND f.created_at BETWEEN rl.created_at AND rl.created_at + INTERVAL '5 minutes'
    `);
      const feedbackCount = parseInt(withFeedback.rows[0].cnt);
      // 整体满意度分布
      const satDist = await pool.query(`
      SELECT rating, COUNT(*) FROM feedback
      WHERE dish_id = 0 OR dish_id IS NULL
      GROUP BY rating ORDER BY rating
    `);
      // 平均反馈评分
      const avgRating = await pool.query('SELECT ROUND(AVG(rating),2) as avg FROM feedback WHERE dish_id > 0');

      res.json({
        success: true,
        stats: {
          totalRecommendations: total,
          feedbackRate: total > 0 ? ((feedbackCount / total) * 100).toFixed(1) : 0,
          feedbackCount,
          avgRating: parseFloat(avgRating.rows[0]?.avg || 0),
          satisfactionDistribution: satDist.rows,
        },
      });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/model-info', (req, res) => {
    loadModelInfo();
    res.json({ success: true, model: getModelInfo() });
  });

  app.get('/api/admin/monitor', (req, res) => {
    try {
      const historyPath = path.join(ROOT, 'metrics_history.json');
      let metricsHistory = [];
      if (fs.existsSync(historyPath)) {
        metricsHistory = readJSON(historyPath);
      }
      // 计算 R² 变化趋势（只在「同一模型版本」内比较：跳过重构前的旧记录，
      // 避免把「重构去作弊」导致的 R² 回落误判为退化）
      let r2Trend = 'stable';
      let regimeStart = 0;
      for (let i = 1; i < metricsHistory.length; i++) {
        if (Math.abs(metricsHistory[i].r2 - metricsHistory[i - 1].r2) > 0.05) {
          regimeStart = i;
        }
      }
      const regime = metricsHistory.slice(regimeStart);
      if (regime.length >= 3) {
        const recent = regime.slice(-3);
        const avg = recent.reduce((s, e) => s + e.r2, 0) / recent.length;
        const first = regime[regime.length - 3].r2;
        if (avg < first - 0.05) {
          r2Trend = 'declining';
        } else if (avg > first + 0.05) {
          r2Trend = 'improving';
        }
      }
      // 错误日志状态
      const today = new Date().toISOString().slice(0, 10);
      const errorLogPath = path.join(ROOT, 'logs', 'error-' + today + '.log');
      let errorLogSize = 0,
        errorLogUpdated = null;
      if (fs.existsSync(errorLogPath)) {
        const stats = fs.statSync(errorLogPath);
        errorLogSize = stats.size;
        errorLogUpdated = stats.mtime.toISOString();
      }
      const combinedLogPath = path.join(ROOT, 'logs', 'combined-' + today + '.log');
      let combinedLogSize = 0;
      if (fs.existsSync(combinedLogPath)) {
        combinedLogSize = fs.statSync(combinedLogPath).size;
      }
      // 错误率统计
      const errorStats = getErrorStats();
      const hourlyErrors = errorStats.hourly.filter((e) => Date.now() - e.time < 3600000);
      const errorRate = hourlyErrors.length; // 过去 1 小时的错误数
      const recentErrors = hourlyErrors.slice(-10).map((e) => ({
        path: e.path,
        status: e.status,
        time: new Date(e.time).toISOString(),
      }));

      res.json({
        success: true,
        monitor: {
          r2Trend,
          metricsHistory: metricsHistory.slice(-10),
          errorLog: {
            sizeKB: Math.round(errorLogSize / 1024),
            lastUpdated: errorLogUpdated,
          },
          combinedLogSizeKB: Math.round(combinedLogSize / 1024),
          errorRate: {
            lastHour: errorRate,
            total: errorStats.total,
            recent: recentErrors,
          },
          uptime: process.uptime(),
          memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          pendingRequests: getPendingRequestsSize(),
          workerReady: getWorkerReady(),
          modelVersion: getModelInfo().version,
          modelR2: getModelInfo().r2,
          feedbackCount: getModelInfo().feedbackCount,
        },
      });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/export/popular-dishes', async (req, res) => {
    try {
      const pool = db;
      const result = await pool.query(
        'SELECT d.id, d.name, d.category, d.price, d.rating, COUNT(f.id) as feedback_count, ROUND(AVG(f.rating),2) as avg_rating FROM dishes d LEFT JOIN feedback f ON d.id = f.dish_id WHERE d.is_active = TRUE GROUP BY d.id ORDER BY feedback_count DESC'
      );
      const csv = toCSV(
        ['ID', '菜名', '分类', '价格', '评分', '反馈数', '平均评分'],
        result.rows.map((r) => [r.id, r.name, r.category, r.price, r.rating, r.feedback_count, r.avg_rating])
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=popular_dishes.csv');
      res.send(csv);
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/export/feedback', async (req, res) => {
    try {
      const pool = db;
      const result = await pool.query(
        'SELECT f.id, f.dish_id, d.name, f.rating, f.created_at FROM feedback f LEFT JOIN dishes d ON f.dish_id = d.id ORDER BY f.created_at DESC'
      );
      const csv = toCSV(
        ['ID', '菜品ID', '菜名', '评分', '时间'],
        result.rows.map((r) => [r.id, r.dish_id, r.name, r.rating, r.created_at])
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=feedback.csv');
      res.send(csv);
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/export/orders', async (req, res) => {
    try {
      const pool = db;
      const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
      const csv = toCSV(
        ['ID', '用户', '总价', '菜品数', '状态', '桌号', '时间'],
        result.rows.map((r) => [r.id, r.user_id, r.total_price, r.dish_count, r.status, r.table_number, r.created_at])
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
      res.send(csv);
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.post('/api/admin/dish/batch-status', async (req, res) => {
    try {
      const { ids, isActive } = req.body;
      if (!ids || !Array.isArray(ids) || !ids.length) {
        return res.status(400).json({ success: false, error: '请选择菜品' });
      }
      if (!ids.every((id) => Number.isInteger(id) || /^\d+$/.test(String(id)))) {
        return res.status(400).json({ success: false, error: '菜品ID必须为整数' });
      }
      const pool = db;
      await pool.query('UPDATE dishes SET is_active = $1 WHERE id = ANY($2::int[])', [isActive, ids]);
      res.json({ success: true, message: '已更新 ' + ids.length + ' 道菜品' });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.post('/api/admin/dish/batch-delete', async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || !ids.length) {
        return res.status(400).json({ success: false, error: '请选择菜品' });
      }
      if (!ids.every((id) => Number.isInteger(id) || /^\d+$/.test(String(id)))) {
        return res.status(400).json({ success: false, error: '菜品ID必须为整数' });
      }
      const pool = db;
      await pool.query('UPDATE dishes SET is_active = FALSE WHERE id = ANY($1::int[])', [ids]);
      res.json({ success: true, message: '已下架 ' + ids.length + ' 道菜品' });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/users', async (req, res) => {
    try {
      const pool = db;
      // 分页+服务端搜索：全量渲染曾一次性拉 5000+ 测试账号拖垮用户管理页
      const q = String(req.query.q || '').trim();
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
      const params = [];
      let where = '';
      if (q) {
        where = ' WHERE username ILIKE $1';
        params.push('%' + q + '%');
      }
      const totalR = await pool.query('SELECT COUNT(*)::int AS n FROM users' + where, params);
      params.push(limit);
      // created_at DESC:刚注册的用户必须排最前(管理端即时可见;last_login 会把未登录新用户沉底且被分页截断)
      const result = await pool.query(
        'SELECT id, username, created_at, last_login FROM users' +
          where +
          ' ORDER BY created_at DESC LIMIT $' +
          params.length,
        params
      );
      res.json({ success: true, users: result.rows, total: totalR.rows[0].n, limit });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/users/:id', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId) || userId <= 0) {
        return res.status(400).json({ success: false, error: '无效的用户ID' });
      }
      const pool = db;
      const result = await pool.query(
        'SELECT id, username, preferences, favorites, blacklist, created_at, last_login FROM users WHERE id = $1',
        [userId]
      );
      if (!result.rows.length) {
        return res.status(404).json({ success: false, error: '用户不存在' });
      }
      res.json({ success: true, user: result.rows[0] });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.put('/api/admin/users/:id/reset-password', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const newPassword = req.body ? req.body.newPassword : null;
      if (isNaN(userId) || userId <= 0) {
        return res.status(400).json({ success: false, error: '无效的用户ID' });
      }
      if (!newPassword || typeof newPassword !== 'string') {
        return res.status(400).json({ success: false, error: '新密码不能为空' });
      }
      if (newPassword.length < 8 || newPassword.length > 20) {
        return res.status(400).json({ success: false, error: '密码须为 8-20 位' });
      }
      if (!/[A-Z]/.test(newPassword)) {
        return res.status(400).json({ success: false, error: '密码必须包含大写字母' });
      }
      if (!/[a-z]/.test(newPassword)) {
        return res.status(400).json({ success: false, error: '密码必须包含小写字母' });
      }
      if (!/[0-9]/.test(newPassword)) {
        return res.status(400).json({ success: false, error: '密码必须包含数字' });
      }
      const found = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
      if (!found.rows.length) {
        return res.status(404).json({ success: false, error: '用户不存在' });
      }
      const ok = await userStorage.updateUser(found.rows[0].username, { password: newPassword });
      if (!ok) {
        return res.status(500).json({ success: false, error: '重置失败' });
      }
      logger.info(`管理员重置用户密码：${found.rows[0].username}`);
      res.json({ success: true, message: '密码已重置' });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/orders', async (req, res) => {
    try {
      const status = String(req.query.status || '').trim();
      const table = String(req.query.table || '').trim();
      const limitRaw = parseInt(req.query.limit) || 100;
      const limit = Math.min(Math.max(limitRaw, 1), 300);
      const conds = [];
      const vals = [];
      if (status && status !== 'all') {
        vals.push(status);
        conds.push(`status = $${vals.length}`);
      }
      if (table) {
        vals.push('%' + table + '%');
        conds.push(`table_number ILIKE $${vals.length}`);
      }
      const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
      const result = await db.query(
        `SELECT id, table_number, status, total_price, items, created_at FROM orders ${where} ORDER BY created_at DESC LIMIT ${limit}`,
        vals
      );
      res.json({ success: true, orders: result.rows });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.post('/api/admin/users/:id/toggle', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId) || userId <= 0) {
        return res.status(400).json({ success: false, error: '无效的用户ID' });
      }
      const pool = db;
      const user = await pool.query('SELECT id, username FROM users WHERE id = $1', [userId]);
      if (!user.rows.length) {
        return res.status(404).json({ success: false, error: '用户不存在' });
      }
      const username = user.rows[0].username;
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      // 清理用户相关的反馈和推荐日志（按用户名清理）
      await pool.query('DELETE FROM feedback WHERE user_id = $1', [String(username)]);
      await pool.query('DELETE FROM recommendation_log WHERE user_id = $1', [String(username)]);
      res.json({ success: true, message: '用户已删除，相关数据已清理' });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  app.get('/api/admin/notifications', async (req, res) => {
    try {
      const pool = db;
      const worst = await pool.query(
        'SELECT d.id, d.name, COUNT(f.id) as count, ROUND(AVG(f.rating),2) as avg FROM dishes d JOIN feedback f ON d.id = f.dish_id WHERE d.is_active = TRUE GROUP BY d.id HAVING AVG(f.rating) < 3.5 ORDER BY avg ASC LIMIT 5'
      );
      const newOrders = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'pending'");
      const notifications = [];
      worst.rows.forEach((r) => {
        notifications.push({
          type: 'warning',
          message: r.name + ' 评分偏低（' + r.avg + '分，' + r.count + '条反馈）',
          link: '#page-feedback',
          dishName: r.name, // 2026-11-08: 横幅点击跳反馈页时自动按菜过滤明细
        });
      });
      if (parseInt(newOrders.rows[0].count) > 0) {
        notifications.push({
          type: 'info',
          message: parseInt(newOrders.rows[0].count) + ' 个新订单待处理',
          link: '/kitchen',
        });
      }
      res.json({ success: true, notifications });
    } catch (e) {
      logger.error('API错误:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  // ─── 桌态总览 + 并台(2026-11-02 对标商龙桌台管理) ───
  // 无新表: 桌态 = 未完结订单按 table_number 实时聚合(1-30 号桌, "打包"单不在网格内)
  const TABLE_COUNT = 30;
  const isValidTable = (t) => {
    const n = parseInt(String(t).trim(), 10);
    return String(t).trim() !== '' && !isNaN(n) && n >= 1 && n <= TABLE_COUNT ? n : null;
  };

  app.get('/api/admin/tables/status', async (req, res) => {
    try {
      const r = await db.query(
        `SELECT table_number,
                COUNT(*)::int AS order_count,
                COALESCE(SUM(total_price),0)::float AS amount,
                MIN(created_at) AS first_at,
                jsonb_agg(jsonb_build_object('id', id, 'total', total_price, 'status', status, 'createdAt', created_at)) AS orders
         FROM orders
         WHERE status NOT IN ('completed','cancelled') AND table_number ~ '^[0-9]+$'
         GROUP BY table_number ORDER BY table_number`
      );
      const occupied = new Map(
        r.rows.map((x) => [parseInt(x.table_number), {
          orderCount: x.order_count,
          amount: Math.round(x.amount * 100) / 100,
          firstAt: x.first_at,
          orders: x.orders,
        }])
      );
      const tables = [];
      for (let i = 1; i <= TABLE_COUNT; i++) {
        tables.push({ table: i, occupied: occupied.has(i), ...(occupied.get(i) || { orderCount: 0, amount: 0, orders: [] }) });
      }
      res.json({ success: true, tableCount: TABLE_COUNT, tables });
    } catch (e) {
      logger.error('桌态查询失败:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  // 并台: fromTable 的全部未完结订单挪到 toTable(婚宴/拼桌场景一次并整桌; 单单挪走用现有 PATCH /api/order/:id/table)
  app.post('/api/admin/tables/merge', async (req, res) => {
    try {
      const { fromTable, toTable } = req.body;
      const from = isValidTable(fromTable);
      const to = isValidTable(toTable);
      if (!from || !to) {
        return res.status(400).json({ success: false, error: '桌号需为 1-30 的数字桌' });
      }
      if (from === to) {
        return res.status(400).json({ success: false, error: '源桌与目标桌相同' });
      }
      const r = await db.query(
        `UPDATE orders SET table_number=$1
         WHERE table_number=$2 AND status NOT IN ('completed','cancelled') RETURNING id`,
        [String(to), String(from)]
      );
      if (r.rowCount === 0) {
        return res.status(400).json({ success: false, error: `源桌 ${from} 没有进行中的订单` });
      }
      logger.info(`并台: ${from} 号桌 ${r.rowCount} 单并入 ${to} 号桌`);
      res.json({ success: true, from, to, mergedOrders: r.rowCount, orderIds: r.rows.map((x) => x.id) });
    } catch (e) {
      logger.error('并台失败:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });

  // 客群标签(2026-11-02 对标商龙六大智能标签): 按用户聚合订单数/消费额分三档(常客≥5/回头客2-4/新客1) + 口味偏好分布
  app.get('/api/admin/user-segments', async (req, res) => {
    try {
      const agg = await db.query(
        `SELECT user_id,
                COUNT(*)::int AS order_count,
                COALESCE(SUM(total_price),0)::float AS total_spend,
                MAX(created_at) AS last_seen
         FROM orders
         WHERE status <> 'cancelled' AND user_id IS NOT NULL AND user_id <> 'guest' AND user_id <> ''
         GROUP BY user_id`
      );
      const segments = { regular: 0, returning: 0, newcomer: 0 };
      const regulars = [];
      for (const row of agg.rows) {
        const n = row.order_count;
        if (n >= 5) {
          segments.regular++;
          if (regulars.length < 10) {
            regulars.push({ username: row.user_id, orders: n, spend: Math.round(row.total_spend * 100) / 100, lastSeen: row.last_seen });
          }
        } else if (n >= 2) segments.returning++;
        else segments.newcomer++;
      }
      regulars.sort((a, b) => b.spend - a.spend);
      // 口味分布: preference_log 最近一条/用户 的辣度
      const taste = await db.query(
        `SELECT spiciness, COUNT(*)::int AS n FROM preference_log
         WHERE spiciness IS NOT NULL AND spiciness <> ''
         GROUP BY spiciness ORDER BY n DESC LIMIT 5`
      );
      res.json({
        success: true,
        segments,
        tasteTop: taste.rows.map((x) => ({ label: x.spiciness, n: x.n })),
        topRegulars: regulars,
      });
    } catch (e) {
      logger.error('客群标签失败:', e.message);
      res.status(500).json({ success: false, error: '服务器内部错误' });
    }
  });
}

module.exports = { register };
