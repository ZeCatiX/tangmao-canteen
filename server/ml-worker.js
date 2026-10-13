'use strict';
// 唐猫庭院 · Python worker 子系统与 ML 推理路由——从 server.js 整体搬移(2026-10-13 可维护性改造4)
// 对外: register(app,{logger,state}) 挂载 /api/worker-health 与 /api/predict-rf;
//       startPythonWorker()/dispatchToWorker() 供席面打分等内部调用。
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

// 项目根(拆出前的 server.js __dirname)。本文件在 server/ 一层深,只回退一级;
// 曾误抄 routes 子目录的 '../..' 指到 worktree 外,worker spawn 即退(退出码2)
const ROOT = path.join(__dirname, '..');

let pythonWorker = null;
let workerReady = false;
let workerSpawnAt = Date.now();
// 值必须是 Map:兜底打分(histgbNodeScoreDish/predict-rf 降级)用 .get(key, 默认值) 取序数,
// 曾误存普通对象导致 Python worker 不可用时兜底路径连环 TypeError
const ORD_MAPPINGS_CACHE = {
  '辣度': new Map([['无', 0], ['不辣', 1], ['微辣', 2], ['中辣', 3], ['重辣', 4]]),
  '咸淡': new Map([['无', 0], ['清淡', 1], ['适中', 2], ['偏咸', 3]]),
  '甜酸': new Map([['无', 0], ['无味', 1], ['偏甜', 2], ['偏酸', 3], ['甜酸', 4]]),
  '热量': new Map([['无', 0], ['低', 1], ['中', 2], ['高', 3]]),
  '价格区间': new Map([['经济型（<12元）', 0], ['标准型（12-20元）', 1], ['品质型（20元以上）', 2], ['经济', 1], ['适中', 2], ['品质', 3], ['无', 0], ['不限', 0]])
};

// ═══ Node 端 HistGB 兜底打分器: Python worker 不可用(重启窗口/崩溃)时的同模型降级 ═══
// 模型 JSON 由 ml/export_histgb_to_js.py 从生产 pkl 导出, 与 Python predict 偏差<1e-4分(实用精度)
// 与 predict_worker.py 的区分: worker 走 Python 原生推理(主路径); 此处为 Node 纯 JS 推理(兜底路径)
let histgbFallback = null;
try {
  histgbFallback = JSON.parse(fs.readFileSync(path.join(ROOT, 'ml', 'histgb_model.json'), 'utf8'));
  logger.info('Node 端 HistGB 兜底模型已加载: ' + histgbFallback.n + ' 棵树');
} catch (e) { logger.warn('HistGB 兜底模型加载失败(仅影响降级路径质量): ' + e.message); }
function histgbNodeScoreDish(d, up) {
  const M = ORD_MAPPINGS_CACHE;
  const f = [
    M['辣度'].get(d.spiciness, 1),
    M['咸淡'].get(d.saltiness, 1),
    M['甜酸'].get(d.sweetness, 1),
    M['热量'].get(d.calorie, 2),
    (parseFloat(d.price) || 0) / 100,
    (d.tags && d.tags.includes('招牌')) ? 1 : 0,
    (parseFloat(d.rating) || 3.5) / 5,
    M['辣度'].get(up['辣度'], 1),
    M['咸淡'].get(up['咸淡'], 1),
    M['甜酸'].get(up['甜酸'], 1),
    M['价格区间'].get(up['价格区间'], 1),
    M['热量'].get(up['calorie'], 1),
  ];
  return Math.max(0, Math.min(5, histgbNodePredict(f)));
}
function histgbNodePredict(features) {
  let sum = histgbFallback.baseline;
  for (const tree of histgbFallback.trees) {
    let ni = 0;
    for (;;) {
      const n = tree[ni];
      if (n.leaf) { sum += n.v; break; }
      ni = features[n.f] <= n.t ? n.l : n.r;
    }
  }
  return sum;
}
let workerStartTime = 0;
let pendingRequests = new Map();
let pendingRequestIdCounter = 0;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;

function startPythonWorker() {
  if (pythonWorker) { try { pythonWorker.kill(); } catch(e) {} pythonWorker = null; }
  const { spawn } = require('child_process');
  workerSpawnAt = Date.now();
  logger.info('ML Worker 启动中(加载模型约需1-2秒, 期间推荐自动降级本地规则)');
  pythonWorker = spawn('python', ['-u', path.join(ROOT, 'ml', 'predict_worker.py')], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    windowsHide: true
  });
  workerReady = false;
  workerStartTime = Date.now();
  let buffer = '';
  pythonWorker.stdout.on('data', (data) => {
    buffer += data.toString('utf8');
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.substring(0, newlineIndex);
      buffer = buffer.substring(newlineIndex + 1);
      if (line.trim()) {
        try {
          const result = JSON.parse(line);
          if (result.ready) { if (!workerReady) logger.info(`ML 模型加载完成(${Date.now() - (workerSpawnAt || Date.now())}ms), 推荐服务就绪`); workerReady = true; restartAttempts = 0; }
          else if (pendingRequests.size > 0) {
            // 使用 Map 的迭代器获取第一个待处理请求，保证 FIFO 顺序
            const firstEntry = pendingRequests.entries().next();
            if (!firstEntry.done) {
              const [reqId, entry] = firstEntry.value;
              pendingRequests.delete(reqId);
              if (entry.timeoutId) clearTimeout(entry.timeoutId);
              // 两种消费者：HTTP 请求（res 直写）与内部 Promise（/api/recommend/table 打分）
              if (entry.onResult) entry.onResult(result);
              else if (!entry.res.headersSent) entry.res.json(result);
            }
          }
        } catch(e) { logger.info('Python日志: ' + line); }
      }
    }
  });
  pythonWorker.stderr.on('data', (data) => {
    const msg = data.toString('utf8');
    if (msg.includes('[错误]')) logger.error('Python worker错误: ' + msg);
    else if (msg.includes('[信息]') || msg.includes('Worker')) logger.info('Python worker日志: ' + msg.trim());
  });
  pythonWorker.on('close', (code) => {
    logger.info('Python worker关闭，退出码: ' + code);
    pythonWorker = null; workerReady = false;
    for (const [reqId, pr] of pendingRequests.entries()) {
      if (!pr) continue;
      if (pr.timeoutId) clearTimeout(pr.timeoutId);
      if (pr.onError) pr.onError(503, '服务不可用，请重试');
      else if (pr.res && !pr.res.headersSent) pr.res.status(503).json({ success: false, error: '服务不可用，请重试' });
    }
    if (restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++;
      logger.info('将在2秒后重启Worker（第' + restartAttempts + '次尝试）...');
      setTimeout(startPythonWorker, 2000);
    }
  });
  pythonWorker.on('error', (err) => { logger.error('启动Python worker失败: ' + err.message); pythonWorker = null; workerReady = false; });
  logger.info('[信息] Python Worker启动中...');
}

// 统一的 worker 请求分发：/api/predict-rf 与 /api/recommend/table 共用同一条 FIFO 队列，
// worker 单行进单行出，谁先入队谁先拿到响应。
// handlers: { onResult(result), onError(status, message) }，二者只会被调用一次。
function dispatchToWorker(inputData, handlers) {
  let settled = false;
  const settleResult = (r) => { if (!settled) { settled = true; handlers.onResult(r); } };
  const settleError = (status, msg) => {
    if (settled) return;
    settled = true;
    // 兜底: Python worker 不可用时, Node 端用导出的 HistGB 同模型打分
    // 保证 ML 推荐可用性——降级的是推理引擎(Python→Node), 不是模型质量
    try {
      if (histgbFallback && inputData) {
        const input = JSON.parse(inputData);
        const up = input.userPrefs || {};
        const predictions = (input.dishes || []).map(d => ({
          id: d.id, name: d.name,
          score: Math.max(0, Math.min(5, histgbNodeScoreDish(d, up))),
        }));
        logger.warn(`ML降级: Python worker不可用(${msg}), Node端HistGB兜底打分 ${predictions.length} 道`);
        handlers.onResult({ success: true, predictions, degraded: 'node-histgb' });
        return;
      }
    } catch (e) { logger.error('Node HistGB 兜底失败: ' + e.message); }
    handlers.onError(status, msg);
  };
  const requestId = ++pendingRequestIdCounter;
  const timeoutId = setTimeout(() => {
    pendingRequests.delete(requestId);
    logger.warn('ML打分请求超时(50s), 可能模型过载');
    settleError(504, '请求超时，请重试');
  }, 50000);
  const addPendingRequest = () => {
    if (pendingRequests.size >= 100) { clearTimeout(timeoutId); settleError(503, '服务器繁忙，请稍后重试'); return; }
    pendingRequests.set(requestId, { timeoutId, onResult: settleResult, onError: settleError });
    pythonWorker.stdin.write(inputData + '\n');
  };
  if (!pythonWorker) {
    startPythonWorker();
    setTimeout(() => {
      if (workerReady && pythonWorker && pythonWorker.stdin.writable) addPendingRequest();
      else { clearTimeout(timeoutId); settleError(503, 'Worker未就绪，请重试'); }
    }, 3000);
  } else if (!workerReady) {
    let checkCount = 0;
    const checkReady = setInterval(() => {
      checkCount++;
      if (workerReady && pythonWorker && pythonWorker.stdin.writable) { clearInterval(checkReady); addPendingRequest(); }
      else if (checkCount >= 10 || !pythonWorker) { clearInterval(checkReady); clearTimeout(timeoutId); settleError(503, 'Worker未就绪，请重试'); }
    }, 500);
  } else if (pythonWorker.stdin.writable) { addPendingRequest(); }
  else { clearTimeout(timeoutId); settleError(500, 'Worker不可用'); }
  return { abort: () => { clearTimeout(timeoutId); pendingRequests.delete(requestId); } };
}

function getHealth() {
  return {
    success: true,
    alive: pythonWorker !== null,
    ready: workerReady,
    uptime: pythonWorker ? Date.now() - workerStartTime : 0,
    pendingRequests: pendingRequests.size,
    restartAttempts: restartAttempts,
    timestamp: new Date().toISOString()
  };
}

// 挂载 ML 推理路由(健康检查 + predict-rf, 含 HistGB 兜底)
function register(app, deps) {
  const { logger: _logger, state } = deps;

  app.get('/api/worker-health', (req, res) => {
    const status = getHealth();
    // 每隔 10 分钟记录一次健康检查日志(与拆分前 server.js 内联版行为一致)
    const now = Date.now();
    if (!global._lastHealthLog || now - global._lastHealthLog > 600000) {
      global._lastHealthLog = now;
      logger.info(`健康检查: alive=${status.alive} ready=${status.ready} pending=${status.pendingRequests} restarts=${status.restartAttempts}`);
    }
    res.json(status);
  });

  app.post('/api/predict-rf', (req, res) => {
    const { userPrefs, dishes } = req.body;
    if (!userPrefs || !dishes) return res.status(400).json({ success: false, error: '缺少必要参数 userPrefs 和 dishes' });
    if (!Array.isArray(dishes)) return res.status(400).json({ success: false, error: 'dishes 必须为数组' });
    if (dishes.length === 0) return res.status(400).json({ success: false, error: 'dishes 不能为空' });
    // 兼容不同参数格式：如果 dishes 是整数数组，从 state.dishData 查找完整对象
    let processedDishes = dishes;
    if (typeof dishes[0] === 'number') {
      processedDishes = dishes.map(id => state.dishData.find(d => d.id === id)).filter(Boolean);
      // 数字 id 全部未命中(展开为空)时立即 400:空载荷曾让 worker 挂满 50s 硬超时,占住 FIFO 队列拖垮并发
      if (processedDishes.length === 0) return res.status(400).json({ success: false, error: 'dishes 中的菜品 ID 均不存在' });
    }
    // 兼容 userPrefs 字段名：将英文名映射为中文名
    let processedPrefs = userPrefs;
    const fieldMap = { spiciness: '辣度', saltiness: '咸淡', sweetness: '甜酸', price: '价格区间', religion: '饮食_宗教', calorie: '热量' };
    const hasEnglish = Object.keys(fieldMap).some(k => userPrefs[k] !== undefined);
    const hasChinese = Object.values(fieldMap).some(v => userPrefs[v] !== undefined);
    if (hasEnglish && !hasChinese) {
      processedPrefs = { ...userPrefs };
      for (const [en, cn] of Object.entries(fieldMap)) {
        if (userPrefs[en] !== undefined) {
          processedPrefs[cn] = userPrefs[en];
          delete processedPrefs[en];
        }
      }
    }
    const inputData = JSON.stringify({ userPrefs: processedPrefs, dishes: processedDishes });
    let responseSent = false;
    const sendResponse = (status, data) => { if (!responseSent && !res.headersSent) { responseSent = true; res.status(status).json(data); } };
    const dispatch = dispatchToWorker(inputData, {
      onResult: (result) => sendResponse(200, result),
      onError: (status, msg) => {
        // 兜底: Python worker 不可用(重启窗口/崩溃)时, Node 端用导出的 HistGB 同模型打分
        // 保证 ML 推荐可用性——降级的是推理引擎, 不是模型质量
        try {
          if (!histgbFallback) throw new Error('Node 兜底模型未加载');
          const predictions = processedDishes.map(d => {
            const f = [
              ORD_MAPPINGS_CACHE['辣度'].get(d.spiciness, 1),
              ORD_MAPPINGS_CACHE['咸淡'].get(d.saltiness, 1),
              ORD_MAPPINGS_CACHE['甜酸'].get(d.sweetness, 1),
              ORD_MAPPINGS_CACHE['热量'].get(d.calorie, 2),
              (parseFloat(d.price) || 0) / 100,
              (d.tags && d.tags.includes('招牌')) ? 1 : 0,
              (parseFloat(d.rating) || 3.5) / 5,
              ORD_MAPPINGS_CACHE['辣度'].get(userPrefs['辣度'], 1),
              ORD_MAPPINGS_CACHE['咸淡'].get(userPrefs['咸淡'], 1),
              ORD_MAPPINGS_CACHE['甜酸'].get(userPrefs['甜酸'], 1),
              ORD_MAPPINGS_CACHE['价格区间'].get(userPrefs['价格区间'], 1),
              ORD_MAPPINGS_CACHE['热量'].get(userPrefs['calorie'], 1),
            ];
            return { id: d.id, name: d.name, score: Math.max(0, Math.min(5, histgbNodePredict(f))) };
          });
          logger.warn(`predict-rf 降级: Python worker 不可用(${msg}), 已用 Node 端 HistGB 兜底打分`);
          sendResponse(200, { success: true, predictions, degraded: 'node-histgb' });
        } catch (e) {
          logger.error('predict-rf Node 兜底也失败: ' + e.message);
          sendResponse(status, { success: false, error: msg });
        }
      },
    });
    req.on('aborted', () => dispatch.abort());
  });
}

// 优雅停机:清空待处理请求(503)并杀掉 Python worker——server.js gracefulShutdown 调用
function shutdown() {
  try {
    if (pythonWorker && pythonWorker.exitCode === null) {
      for (const [, pr] of pendingRequests) {
        if (pr && pr.res && !pr.res.headersSent) pr.res.status(503).json({ success: false, error: '服务器正在关闭，请稍后重试' });
      }
      pendingRequests.clear();
      pythonWorker.kill();
      logger.info('Python Worker 已关闭');
    }
  } catch (e) { logger.warn('关闭 Python Worker 失败: ' + (e?.message || String(e))); }
}

module.exports = { register, startPythonWorker, dispatchToWorker, getHealth, shutdown };
