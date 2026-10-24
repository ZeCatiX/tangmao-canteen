'use strict';
// 唐猫庭院 · 点餐与反馈域(下单/加菜/订单状态/反馈提交与查询)——从 server.js 拆出(2026-10-13 可维护性改造4)
// 含: 起售量校验/订单项重算/下单频度防刷(内存计数,定时清理已 unref)
const rateLimit = require('express-rate-limit');

function register(app, deps) {
  const { db, logger, softAuth, authMiddleware } = deps;
  const pool = db; // 顶层声明一次,不再每个 handler 重复 const pool = db

  // ── 共享辅助函数(消除跨 handler 重复模式) ──
  function getUser(req) {
    return req.user?.username || 'guest';
  }
  function serverError(res) {
    res.status(500).json({ success: false, error: '服务器开小差了，请稍后再试' });
  }

  // 起售数量校验：从菜品备注(serving)解析"X个起"，校验各菜品最终数量≥最小起售量
  // items 应为合并后的最终状态（建单=新items；加菜=merged）
  function validateMinQty(items, dishMeta) {
    const bad = [];
    for (const it of items) {
      const meta = dishMeta.get(parseInt(it.id));
      if (!meta) {
        continue;
      }
      // 起售备注口径与前端 minQtyOf 一致：serving 与 description 都参与解析
      const metaSrc = String((meta.serving || '') + ' ' + (meta.description || ''));
      // 量词不限于"个"——后台自建菜可能写 2盒起/3杯起
      const m = metaSrc.match(/(\d+)\s*[个盒杯碗瓶只块份包袋听支罐]?起/);
      if (!m) {
        continue;
      }
      const min = parseInt(m[1], 10);
      const qty = parseInt(it.qty) || 1;
      if (qty < min) {
        bad.push((meta.name || '菜品' + it.id) + ' 需' + min + '个起售（当前' + qty + '个）');
      }
    }
    return bad;
  }

  // 服务端重算订单价格：按 dish id 查 DB，拒绝客户端价格；赠菜受方(giftFrom)记 0 元
  async function recomputeOrderItems(pool, items) {
    const ids = items.map((i) => parseInt(i.id)).filter((n) => !isNaN(n));
    const priceMap = {};
    const soldOutNames = [];
    if (ids.length) {
      const pr = await pool.query('SELECT id, price, is_sold_out, name FROM dishes WHERE id = ANY($1::int[])', [ids]);
      pr.rows.forEach((r) => {
        priceMap[r.id] = parseFloat(r.price);
        if (r.is_sold_out === true) {
          soldOutNames.push(r.name || '菜品' + r.id);
        }
      });
    }
    if (soldOutNames.length) {
      return { error: '以下菜品已售罄：' + soldOutNames.join('、') + '，请移除后再结算' };
    }
    const validated = items.map((i) => {
      const did = parseInt(i.id);
      if (isNaN(did) || priceMap[did] === undefined) {
        return null;
      }
      // 数量必须为 1-999 的整数(2026-09-17 安全修复:负/零数量会与正单价相乘产生负价订单;缺省=1)
      const rawQty = i.qty !== undefined ? parseInt(i.qty) : parseInt(i.quantity);
      const qty = Number.isFinite(rawQty) ? rawQty : 1;
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
        return null;
      }
      const note = String(i.note || '')
        .trim()
        .slice(0, 50);
      const dbPrice = priceMap[did];
      return i.giftFrom ? { ...i, qty, price: 0, origPrice: dbPrice, note } : { ...i, qty, price: dbPrice, note };
    });
    if (validated.some((i) => i === null)) {
      return null;
    }
    const sum = validated.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.qty) || 1), 0);
    return { validated, total: Math.round(sum * 100) / 100 };
  }

  // 下单频度防刷：同一桌号（无桌号按 IP）60 秒内最多 5 单。
  // 正常顾客一桌一轮用餐加菜 2-3 次，远低于此阈值；用于挡脚本刷单。
  // 内存级即可（重启清零可接受）；按桌号而非 IP——店内所有顾客共享同一出口 IP，按 IP 会误伤。
  const _orderFreqMap = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of _orderFreqMap) {
      const alive = arr.filter((t) => now - t < 60000);
      if (alive.length) {
        _orderFreqMap.set(k, alive);
      } else {
        _orderFreqMap.delete(k);
      }
    }
  }, 300000).unref();
  // 防刷 key 三级取值:桌号 → 登录用户名 → IP。
  // 无桌号订单不能一律落到 IP:堂食 Wi-Fi 下所有顾客共享 NAT 出口,打包/外卖顾客会互相误触发限流;
  // 登录用户按用户名分桶,只有匿名无桌号单才回退 IP(防脚本滥用)。
  // 每桌/每身份 60 秒窗口内最多 N 单(防刷单)。测试并发跑同一服务时同桌易爆,可经 ORDER_FREQ_LIMIT 放宽(与 LOGIN_RATE_LIMIT_MAX 同款手法)
  const orderFreqLimit = parseInt(process.env.ORDER_FREQ_LIMIT || '5');

  function orderFreqCheck(tableNumber, identity) {
    const key = String(tableNumber || identity || 'unknown');
    const now = Date.now();
    const arr = (_orderFreqMap.get(key) || []).filter((t) => now - t < 60000);
    if (arr.length >= orderFreqLimit) {
      _orderFreqMap.set(key, arr);
      return false;
    }
    arr.push(now);
    _orderFreqMap.set(key, arr);
    return true;
  }

  // 订单 API（软身份验证）
  app.post('/api/order', softAuth, async (req, res) => {
    try {
      const { items, tableNumber } = req.body; // userId 取 JWT、totalPrice 服务端重算，均不信任客户端
      if (!items || !items.length) {
        return res.status(400).json({ success: false, error: '订单不能为空' });
      }
      // F2 收尾(2026-10-16): 桌号格式服务端校验——只放行 1-30 号桌或"打包"
      if (tableNumber !== undefined && tableNumber !== null && tableNumber !== '') {
        const tn = String(tableNumber).trim();
        const num = parseInt(tn, 10);
        if (tn !== '打包' && (isNaN(num) || num < 1 || num > 30)) {
          return res.status(400).json({ success: false, error: '桌号格式不正确（01-30 或"打包"）' });
        }
      }
      if (!orderFreqCheck(tableNumber, req.user?.username || req.ip)) {
        return res.status(429).json({ success: false, error: '下单过于频繁，请稍后再试' });
      }
      const effectiveUserId = getUser(req);
      // 服务端重算价格：按 dish id 查 DB，防止客户端篡改价格（0 元单）
      const recomputed = await recomputeOrderItems(pool, items);
      if (recomputed && recomputed.error) {
        return res.status(400).json({ success: false, error: recomputed.error });
      }
      if (!recomputed) {
        return res.status(400).json({ success: false, error: '订单包含无效菜品' });
      }
      const { validated: validatedItems, total: totalPrice } = recomputed;
      // 起售数量校验：X个起 的菜低于最小起售量直接拒单
      const metaIds = [...new Set(validatedItems.map((i) => parseInt(i.id)))];
      const metaR = await pool.query('SELECT id, name, serving, description FROM dishes WHERE id = ANY($1::int[])', [
        metaIds,
      ]);
      const dishMeta = new Map(metaR.rows.map((r) => [r.id, r]));
      const minBad = validateMinQty(validatedItems, dishMeta);
      if (minBad.length) {
        return res.status(400).json({ success: false, error: '起售数量不足：' + minBad.join('；') });
      }
      // 幂等性检查：同一用户 10 秒内相同内容且仍在进行中(pending/confirmed)的订单视为重复
      // 已完成/取消的单不算重复——顾客上单送达后重下相同单应新建
      // 时钟必须全在 PG 侧：created_at 是无时区 naive 列(存本地时间)，此前拿 UTC ISO 字符串
      // 作比较值，PG 按无时区直接剥离 Z，比较值比本地慢 8 小时 → 窗口实际≈8小时，
      // 不同桌的相同购物车会被并进旧桌订单；现改 NOW() 单侧计时并加桌号匹配
      const itemsStr = JSON.stringify(validatedItems);
      const existing = await pool.query(
        "SELECT id FROM orders WHERE user_id = $1 AND items = $2::jsonb AND created_at > NOW() - INTERVAL '10 seconds' AND status IN ('pending','confirmed') AND table_number IS NOT DISTINCT FROM $3 LIMIT 1",
        [effectiveUserId, itemsStr, tableNumber || null]
      );
      if (existing.rows.length > 0) {
        return res.json({ success: true, message: '订单已存在（防重复提交）', orderId: existing.rows[0].id });
      }
      // 检查 orders 表是否有 table_number 列
      const colCheck = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='table_number'"
      );
      let result;
      if (colCheck.rows.length > 0) {
        result = await pool.query(
          'INSERT INTO orders (user_id, items, total_price, dish_count, table_number) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [effectiveUserId, JSON.stringify(validatedItems), totalPrice, validatedItems.length, tableNumber || null]
        );
      } else {
        result = await pool.query(
          'INSERT INTO orders (user_id, items, total_price, dish_count) VALUES ($1,$2,$3,$4) RETURNING id',
          [effectiveUserId, JSON.stringify(validatedItems), totalPrice, validatedItems.length]
        );
      }
      res.json({ success: true, message: '订单已创建', orderId: result.rows[0].id });
    } catch (e) {
      logger.error('API错误:', e.message);
      serverError(res);
    }
  });

  // 加菜：往现有订单追加菜品（同订单累计，一张小票）
  app.post('/api/order/:id/add', softAuth, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { items, tableNumber } = req.body;
      if (!orderId || !items || !items.length) {
        return res.status(400).json({ success: false, error: '参数无效' });
      }
      // 归属校验：本人(登录用户)、管理员、或同桌（请求桌号与订单桌号一致——桌号即凭证）
      // 游客单的 user_id 一律是 'guest'，不能作为归属凭证（否则任何游客可给任何游客订单加菜）
      const effectiveUserId = getUser(req);
      const isAdmin = req.user?.role === 'admin';
      const existing = await pool.query(
        'SELECT items, total_price, status, table_number, user_id FROM orders WHERE id=$1',
        [orderId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, error: '订单不存在或无权操作' });
      }
      const row = existing.rows[0];
      const isOwner = effectiveUserId !== 'guest' && row.user_id === effectiveUserId;
      const isTableMatch = row.table_number && tableNumber && String(row.table_number) === String(tableNumber);
      if (!isAdmin && !isOwner && !isTableMatch) {
        return res.status(404).json({ success: false, error: '订单不存在或无权操作' });
      }
      if (row.status === 'completed' || row.status === 'cancelled') {
        return res
          .status(400)
          .json({ success: false, error: '订单已' + (row.status === 'completed' ? '完成' : '取消') + '，不能加菜' });
      }
      // 服务端重算加菜价格：按 dish id 查 DB，防止客户端篡改价格
      const recomputed = await recomputeOrderItems(pool, items);
      if (recomputed && recomputed.error) {
        return res.status(400).json({ success: false, error: recomputed.error });
      }
      if (!recomputed) {
        return res.status(400).json({ success: false, error: '加菜包含无效菜品' });
      }
      const addItems = recomputed.validated;
      const oldItems = Array.isArray(row.items) ? row.items : JSON.parse(row.items || '[]');
      // 同菜合并：id 与赠菜标记都相同才合并（普通菜与赠菜价格不同，不能混为一行）；备注不同视为不同行（厨房分开出）
      const keyOf = (it) => it.id + '|' + (it.giftTo || '') + '|' + (it.giftFrom || '') + '|' + (it.note || '');
      const mergedItems = oldItems.map((x) => ({ ...x }));
      for (const it of addItems) {
        const k = keyOf(it);
        const ex = mergedItems.find((m) => keyOf(m) === k);
        if (ex) {
          ex.qty = (parseInt(ex.qty || ex.quantity, 10) || 1) + (parseInt(it.qty || it.quantity, 10) || 1);
        } else {
          mergedItems.push({ ...it });
        }
      }
      const oldTotal = parseFloat(row.total_price) || 0;
      const newTotal = Math.round((oldTotal + recomputed.total) * 100) / 100;
      // 起售数量校验（合并口径）：同 id 订单已有数量 + 新加数量 ≥ 最小起售量
      const existingById = new Map();
      (Array.isArray(row.items) ? row.items : JSON.parse(row.items || '[]')).forEach((x) => {
        const q = parseInt(x.qty || x.quantity, 10) || 0;
        existingById.set(parseInt(x.id), (existingById.get(parseInt(x.id)) || 0) + q);
      });
      const metaIds = [...new Set([...mergedItems.map((i) => parseInt(i.id)), ...existingById.keys()])];
      const metaR = await pool.query('SELECT id, name, serving, description FROM dishes WHERE id = ANY($1::int[])', [
        metaIds,
      ]);
      const dishMeta = new Map(metaR.rows.map((r) => [r.id, r]));
      const minBad = validateMinQty(mergedItems, dishMeta);
      if (minBad.length) {
        return res.status(400).json({ success: false, error: '起售数量不足：' + minBad.join('；') });
      }
      const upd = await pool.query(
        "UPDATE orders SET items=$1, total_price=$2, dish_count=$3 WHERE id=$4 AND status NOT IN ('completed','cancelled')",
        [JSON.stringify(mergedItems), newTotal, mergedItems.length, orderId]
      );
      if (upd.rowCount === 0) {
        return res.status(400).json({ success: false, error: '订单状态已变化，不能加菜' });
      }
      res.json({
        success: true,
        message: '加菜成功',
        orderId,
        addedCount: items.length,
        totalPrice: newTotal,
        dishCount: mergedItems.length,
      });
    } catch (e) {
      logger.error('加菜API错误:', e.message);
      serverError(res);
    }
  });

  // 挪桌：修改进行中订单的桌号（订单跟客人走）
  app.patch('/api/order/:id/table', softAuth, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { tableNumber, fromTable } = req.body;
      if (!orderId || !tableNumber) {
        return res.status(400).json({ success: false, error: '参数无效' });
      }
      // F2 收尾(2026-10-16): 桌号格式校验——只放行 1-30 号桌或"打包"
      const tnNum = parseInt(String(tableNumber).trim(), 10);
      if (tableNumber !== '打包' && (isNaN(tnNum) || tnNum < 1 || tnNum > 30)) {
        return res.status(400).json({ success: false, error: '桌号格式不正确（01-30 或"打包"）' });
      }
      // 归属校验：本人、管理员、或同桌（fromTable=订单当前桌号——游客下单后登录挪桌，旧桌号即凭证）
      const effectiveUserId = getUser(req);
      const isAdmin = req.user?.role === 'admin';
      const colCheck = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='table_number'"
      );
      if (colCheck.rows.length === 0) {
        return res.json({ success: false, error: '订单表不支持桌号' });
      }
      const own = await pool.query('SELECT user_id, table_number, status FROM orders WHERE id=$1', [orderId]);
      if (own.rows.length === 0) {
        return res.status(400).json({ success: false, error: '订单不存在或无权操作' });
      }
      const isOwner = own.rows[0].user_id === effectiveUserId;
      const isTableMatch =
        own.rows[0].table_number && fromTable && String(own.rows[0].table_number) === String(fromTable);
      if (!isAdmin && !isOwner && !isTableMatch) {
        return res.status(400).json({ success: false, error: '订单不存在或无权操作' });
      }
      const r = await pool.query(
        "UPDATE orders SET table_number=$1 WHERE id=$2 AND status NOT IN ('completed','cancelled') RETURNING id",
        [String(tableNumber), orderId]
      );
      if (r.rows.length === 0) {
        return res.status(400).json({ success: false, error: '订单不存在或无权操作' });
      }
      res.json({ success: true, orderId, tableNumber });
    } catch (e) {
      logger.error('改桌号API错误:', e.message);
      serverError(res);
    }
  });

  // 订单存活校验(F3类收尾,2026-10-16): 前端会话绑定横幅/结算前自查,防对已完结订单宣称"正在加菜"
  // 授权与 /add 同口径(本人/管理员/同桌凭证);无权视同不存在(不泄露订单存在性)
  // 独立限流(30/分钟): 走 DB 查询,不宜被滥用
  const statusCheckLimiter = rateLimit({
    windowMs: 60000,
    max: 30,
    message: { success: false, error: '请求过于频繁' },
  });
  app.get('/api/order/:id/status-check', statusCheckLimiter, softAuth, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (!orderId || isNaN(orderId) || orderId <= 0) {
        return res.status(400).json({ success: false, error: '参数无效' });
      }
      const tableNumber = req.query.tableNumber || '';
      const r = await pool.query('SELECT status, table_number, user_id FROM orders WHERE id=$1', [orderId]);
      if (r.rows.length === 0) {
        return res.json({ success: true, exists: false });
      }
      const row = r.rows[0];
      const effectiveUserId = getUser(req);
      const isAdmin = req.user?.role === 'admin';
      const isOwner = effectiveUserId !== 'guest' && row.user_id === effectiveUserId;
      const isTableMatch = row.table_number && tableNumber && String(row.table_number) === String(tableNumber);
      if (!isAdmin && !isOwner && !isTableMatch) {
        return res.json({ success: true, exists: false });
      }
      res.json({ success: true, exists: true, status: row.status, table_number: row.table_number });
    } catch (e) {
      logger.error('订单存活校验API错误:', e.message);
      serverError(res);
    }
  });

  app.get('/api/orders', authMiddleware, async (req, res) => {
    try {
      const { status } = req.query;
      const userId = req.user?.username;
      if (!userId) {
        return res.status(401).json({ success: false, error: '请先登录' });
      }
      let query = 'SELECT * FROM orders';
      const params = [];
      const conditions = [];
      // 管理员可查看所有订单（厨房看板）；普通用户只能查看自己的订单
      const isAdmin = req.user?.role === 'admin';
      const queryUserId = req.query.userId || '';
      if (isAdmin) {
        if (queryUserId) {
          conditions.push('user_id = $' + (params.length + 1));
          params.push(queryUserId);
        }
      } else {
        conditions.push('user_id = $' + (params.length + 1));
        params.push(userId);
      }
      if (status) {
        const statuses = status.split(',');
        conditions.push('status = ANY($' + (params.length + 1) + '::text[])');
        params.push(statuses);
      }
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY created_at DESC';
      // 厨房看板等按状态筛选的场景：限制返回最新 100 条，避免海量订单一次性渲染导致页面卡顿
      // （普通用户查看自己订单不受影响）
      if (status) {
        query += ' LIMIT 100';
      }
      const result = await pool.query(query, params);
      res.json({ success: true, orders: result.rows });
    } catch (e) {
      logger.error('API错误:', e.message);
      serverError(res);
    }
  });

  // 更新订单状态
  app.put('/api/orders/:id/status', authMiddleware, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId) || orderId <= 0) {
        return res.status(400).json({ success: false, error: '无效的订单ID' });
      }
      const { status } = req.body;
      // 厨房操作允许管理员或订单所有者
      const validStatuses = ['pending', 'confirmed', 'preparing', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: '无效的状态' });
      }
      let result;
      // 管理员可以更新任意订单，普通用户只能更新自己的订单
      // 推进到 completed 时记完成时间（厨房"当日已完成"归档用；重复完成/回退不覆盖已有值）
      if (req.user.role === 'admin') {
        result = await pool.query(
          "UPDATE orders SET status = $1::text, completed_at = CASE WHEN $1::text = 'completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END WHERE id = $2",
          [status, orderId]
        );
      } else {
        result = await pool.query(
          "UPDATE orders SET status = $1::text, completed_at = CASE WHEN $1::text = 'completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END WHERE id = $2 AND user_id = $3::text",
          [status, orderId, req.user.username]
        );
      }
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: '订单不存在或无权限' });
      }
      res.json({ success: true, message: '订单状态已更新' });
    } catch (e) {
      logger.error('API错误:', e.message);
      serverError(res);
    }
  });

  // 反馈 API（软身份验证）
  app.post('/api/feedback', softAuth, async (req, res) => {
    try {
      const { dishId, score, userPreferences } = req.body;
      if (score === undefined) {
        return res.status(400).json({ success: false, error: '缺少必要参数' });
      }
      const scoreNum = parseFloat(score);
      if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 5) {
        return res.status(400).json({ success: false, error: '评分必须在 0-5 之间' });
      }
      const dishIdNum = dishId !== undefined && dishId !== null ? parseInt(dishId) : null;
      if (dishIdNum === null || isNaN(dishIdNum) || dishIdNum < 0) {
        return res.status(400).json({ success: false, error: '无效的菜品 ID' });
      }
      // dishId 为 0 表示整体满意度，允许
      // 优先使用 token 验证的用户 ID
      const effectiveUserId = getUser(req);
      await pool.query('INSERT INTO feedback (dish_id, user_id, rating, user_preferences) VALUES ($1,$2,$3,$4)', [
        dishIdNum,
        effectiveUserId,
        scoreNum,
        userPreferences ? JSON.stringify(userPreferences) : '{}',
      ]);
      res.json({ success: true, message: '反馈成功' });
    } catch (e) {
      logger.error('API错误:', e.message);
      serverError(res);
    }
  });

  app.get('/api/feedback', authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.username;
      if (!userId) {
        return res.status(401).json({ success: false, error: '请先登录' });
      }
      const result = await pool.query('SELECT * FROM feedback WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      res.json({ success: true, feedbacks: result.rows });
    } catch (e) {
      logger.error('API错误:', e.message);
      serverError(res);
    }
  });
}

module.exports = { register };
