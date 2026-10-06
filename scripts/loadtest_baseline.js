// 压测基线脚本（零依赖，Node 18+）：对只读端点做 50 并发基线测量
// 用法: node scripts/loadtest_baseline.js [目标URL，默认 http://localhost:3100] [并发数，默认 50] [时长秒，默认 20]
// 只打读接口，不写库。建议对独立实例跑（拉高限流），避免污染 3000 端口的正常限流窗口。
'use strict';
const BASE = process.argv[2] || 'http://localhost:3100';
const CONCURRENCY = parseInt(process.argv[3]) || 50;
const DURATION_S = parseInt(process.argv[4]) || 20;

const MIX = [
  { path: '/api/dishes', weight: 5 },          // 菜品全量（最大响应）
  { path: '/', weight: 2 },                     // 首页 HTML
  { path: '/api/worker-health', weight: 2 },    // 健康检查（预测 worker）
  { path: '/api/admin/stats', weight: 1 },      // 管理统计（需 token 则 401 也计入，测的是路由+DB 前置开销）
];
const TOTAL_WEIGHT = MIX.reduce((s, m) => s + m.weight, 0);
function pick() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const m of MIX) { r -= m.weight; if (r <= 0) return m.path; }
  return MIX[0].path;
}

const latencies = [];
const statusCount = {};
let errors = 0, requests = 0;
let deadline = Date.now() + DURATION_S * 1000;
let stop = false;

async function worker() {
  while (!stop) {
    const url = BASE + pick();
    const t0 = process.hrtime.bigint();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      latencies.push(ms);
      statusCount[r.status] = (statusCount[r.status] || 0) + 1;
      requests++;
    } catch (e) {
      errors++;
    }
  }
}

(async () => {
  console.log(`压测目标 ${BASE} · 并发 ${CONCURRENCY} · 时长 ${DURATION_S}s · 混合: ${MIX.map(m => m.path + '×' + m.weight).join(' ')}`);
  // 预热
  await fetch(BASE + '/api/dishes').catch(() => {});
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await new Promise(r => setTimeout(r, DURATION_S * 1000));
  stop = true;
  await Promise.allSettled(workers);

  latencies.sort((a, b) => a - b);
  const pct = p => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p / 100))].toFixed(0) : '-';
  const rps = (requests / DURATION_S).toFixed(1);
  console.log('─────────────── 基线结果 ───────────────');
  console.log(`总请求: ${requests} · 吞吐: ${rps} req/s · 错误: ${errors}`);
  console.log(`状态码: ${JSON.stringify(statusCount)}`);
  if (latencies.length) {
    console.log(`延迟 p50: ${pct(50)}ms · p90: ${pct(90)}ms · p95: ${pct(95)}ms · p99: ${pct(99)}ms · max: ${latencies[latencies.length - 1].toFixed(0)}ms`);
  }
  console.log('────────────────────────────────────────');
})();
