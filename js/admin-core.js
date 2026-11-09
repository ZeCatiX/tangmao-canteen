// ═══ admin-core.js:admin.html 全部后台逻辑(2026-11-09 自内联 script 拆出)═══
// 来源:admin.html 原四个内联块(主逻辑/按需加载器/桌码QR/营业日报)按原执行顺序合并。
// 加载约束:必须以普通同步 <script src> 引于 body 尾——内联 onclick(toggleSoldOut/editDish/
//   showTableDetail/exportCSV 等)依赖本文件顶层 function 声明的全局作用域,
//   禁止改为 type=module 或 IIFE 包裹,否则内联事件全部失效。
// esc 消重说明:原块1 与块4 各有一份 esc,语义不同(块1: 非字符串透传;块4: String 强转)。
//   同层级 function 声明后者覆盖,页面运行时实际生效的一直是块4 的 String 版,
//   故此处只保留 String 版(原块4),行为与拆分前完全一致。

// ── 原块2:第三方重库按需加载 ──
// ═══ 第三方重库按需加载（2026-10-19 性能改造）═══
// Chart.js 208KB / qrcode 57KB 不再全局加载，首次真正用到时注入——后台日常管理页省 265KB
function loadScriptOnce(src, cb) {
  loadScriptOnce.done = loadScriptOnce.done || {};
  if (loadScriptOnce.done[src]) { cb && cb(); return; }
  const s = document.createElement('script');
  s.src = src;
  s.onload = function() { loadScriptOnce.done[src] = true; cb && cb(); };
  s.onerror = function() { showToast('组件加载失败，请刷新重试', 'error'); };
  document.head.appendChild(s);
}
function ensureChartJs(cb) { loadScriptOnce('node_modules/chart.js/dist/chart.umd.min.js', cb); }
function ensureQrcodeJs(cb) { loadScriptOnce('js/vendor/qrcode.min.js', cb); }

// ── 原块1:后台主逻辑 ──
// 统一切页入口（2026-11-08 架构梳理: 原[data-page]委托与预警横幅委托两处复制且行为漂移——
// 导航版有各页数据加载, 横幅版有回顶+反馈过滤联动; 收口为单一函数, 两处调用同一实现）
function showAdminPage(pageId, opts) {
  opts = opts || {};
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (!target) return;
  target.classList.add('active');
  const navKey = pageId.replace('page-', '');
  document.querySelectorAll('[data-page]').forEach(l => l.classList.toggle('active', l.dataset.page === navKey));
  window.scrollTo({ top: 0, behavior: opts.smoothScroll ? 'smooth' : 'auto' });
  // 各页进入时加载对应数据
  if (navKey === 'analytics') {
    setTimeout(() => { loadDailyTrend(); loadAnalyticsPrefs(); loadUserActivity(); loadRecommendationLog(); loadRecommendationStats(); loadWorstDishes(); }, 200);
  }
  if (navKey === 'model') {
    setTimeout(() => { loadModelManagement(); loadModelCompare(); }, 100);
  }
  if (navKey === 'users') {
    setTimeout(function () { loadUsers(); if (typeof loadUserSegments === 'function') loadUserSegments(); }, 100);
  }
  if (navKey === 'orders') {
    setTimeout(() => { if (typeof loadAdminOrders === 'function') loadAdminOrders(); }, 100);
  }
  if (navKey === 'tables') {
    setTimeout(() => { if (typeof loadTables === 'function') loadTables(); }, 100);
  }
  if (navKey === 'report') {
    // 营业日报：进入 tab 时默认查今天（若无值先填今天）
    const inp = document.getElementById('report-date');
    if (inp && !inp.value) { const d = new Date(); inp.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
    setTimeout(() => { if (typeof loadDailyReport === 'function') loadDailyReport(inp ? inp.value : localToday()); }, 100);
  }
  if (navKey === 'feedback' && opts.dishFilter) {
    // 预警横幅跳转联动：自动按菜过滤反馈明细
    const fi = document.getElementById('feedback-filter-input');
    if (fi) fi.value = opts.dishFilter;
    setTimeout(() => { if (typeof loadFeedback === 'function') loadFeedback(opts.dishFilter); }, 100);
  }
}
document.querySelectorAll('[data-page]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    showAdminPage('page-' + a.dataset.page);
  });
});

function loadStats() {
  fetch('/api/admin/stats').then(r => r.json()).then(d => {
    if (!d.success) return;
    const s = d.stats;
    document.getElementById('stat-cards').innerHTML = [
      { icon: '📈', val: s.todayRecommendations, label: '今日推荐', color: '#b83a2a' },
      { icon: '👥', val: s.todayGuest, label: '游客推荐', color: '#8b7a6a' },
      { icon: '👤', val: s.todayUser, label: '用户推荐', color: '#2d8a6e' },
      { icon: '💬', val: s.totalFeedback, label: '总反馈', color: '#c9a96e' },
      { icon: '🍽️', val: s.totalDishes, label: '总菜品', color: '#b83a2a' },
    ].map(c => `<div class="col-6 col-md"><div class="stat-card"><div class="icon">${c.icon}</div><div class="value" style="color:${c.color}">${c.val}</div><div class="label">${c.label}</div></div></div>`).join('');
  }).catch(() => { console.warn('数据加载失败'); });
}

function loadPopularDishes() {
  // 菜品与饮品分榜(2026-10-15):后端按 scope 过滤,两边都不含对方品类
  const renderRows = (d) => (d.dishes || []).map((x, i) =>
    `<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${esc(x.category||'-')}</td><td>${x.price!=null?esc(x.price):'-'}元</td><td>${esc(x.rating||'-')}</td><td>${x.feedback_count}</td><td>${esc(x.avg_rating||'-')}</td></tr>`
  ).join('');
  fetch('/api/admin/popular-dishes').then(r => r.json()).then(d => {
    if (!d.success) return;
    document.querySelector('#popular-table tbody').innerHTML = renderRows(d);
  }).catch(() => { console.warn('数据加载失败'); });
  fetch('/api/admin/popular-dishes?scope=drink').then(r => r.json()).then(d => {
    if (!d.success) return;
    document.querySelector('#popular-drink-table tbody').innerHTML = renderRows(d);
  }).catch(() => { console.warn('数据加载失败'); });
}

function loadFeedback(dishFilter) {
  // 服务端过滤(2026-11-08): summary 默认 LIMIT 50 装不下老反馈, 按菜过滤时走服务端 ILIKE 全量
  const qs = dishFilter ? '?dish=' + encodeURIComponent(dishFilter) : '';
  fetch('/api/admin/feedback-summary' + qs).then(r => r.json()).then(d => {
    if (!d.success) return;
    document.querySelector('#feedback-table tbody').innerHTML = d.feedbacks.map((x, i) =>
      `<tr><td>${i+1}</td><td>${esc(x.dish_name||'未知')}</td><td><span class="badge ${x.rating >= 4 ? 'bg-success' : x.rating >= 3 ? 'bg-warning' : 'bg-danger'}" style="border-radius:4px;">${x.rating}</span></td><td style="font-size:0.78rem;color:var(--text-light);">${new Date(x.created_at).toLocaleString()}</td></tr>`
    ).join('');
    // 渲染评分分布chart（等待canvas渲染完成）
    renderRatingChart(d.distribution);
  }).catch(() => { console.warn('数据加载失败'); });
}

// 反馈过滤输入(2026-11-08): 防抖 300ms 触发服务端过滤; 清空按钮回全量
(function bindFeedbackFilter() {
  document.addEventListener('DOMContentLoaded', function () {
    const input = document.getElementById('feedback-filter-input');
    const clear = document.getElementById('feedback-filter-clear');
    let timer = null;
    if (input) input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { if (typeof loadFeedback === 'function') loadFeedback(input.value.trim()); }, 300);
    });
    if (clear) clear.addEventListener('click', function () {
      if (input) input.value = '';
      if (typeof loadFeedback === 'function') loadFeedback();
    });
  });
})();

// 反馈过滤框事件(2026-11-08): 输入即过滤 + 清空按钮
(function bindFeedbackFilter() {
  document.addEventListener('DOMContentLoaded', function () {
    const input = document.getElementById('feedback-filter-input');
    const clear = document.getElementById('feedback-filter-clear');
    if (input) input.addEventListener('input', function () { if (typeof applyFeedbackFilter === 'function') applyFeedbackFilter(); });
    if (clear) clear.addEventListener('click', function () {
      if (input) input.value = '';
      if (typeof applyFeedbackFilter === 'function') applyFeedbackFilter();
    });
  });
})();

function renderRatingChart(distribution) {
  if (typeof Chart === 'undefined') return ensureChartJs(function() { renderRatingChart(distribution); });
  const ctx = document.getElementById('rating-chart');
  if (!ctx) return;
  if (ctx.offsetWidth === 0 || ctx.offsetHeight === 0) {
    setTimeout(() => renderRatingChart(distribution), 200);
    return;
  }
  const canvas = ctx.getContext('2d');
  if (!canvas) return;
  if (window.ratingChart) window.ratingChart.destroy();
  const labels = distribution.map(x => x.rating + '分');
  const data = distribution.map(x => parseInt(x.count));
  const total = data.reduce((a, b) => a + b, 0);
  if (data.length) {
    window.ratingChart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{
        label: '评分分布', data,
        backgroundColor: ['#e74c3c','#e67e22','#f1c40f','#27ae60','#2ecc71'],
        borderRadius: 6
      }]},
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                const val = context.parsed.y;
                const pct = total > 0 ? (val / total * 100).toFixed(1) : 0;
                return val + '分 (' + pct + '%)';
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                if (total === 0) return value;
                return (value / total * 100).toFixed(0) + '%';
              }
            }
          }
        }
      },
      plugins: [{
        id: 'barLabels',
        afterDraw: function(chart) {
          const ctx = chart.ctx;
          chart.data.datasets.forEach(function(dataset, i) {
            const meta = chart.getDatasetMeta(i);
            meta.data.forEach(function(bar, index) {
              const val = dataset.data[index];
              const pct = total > 0 ? (val / total * 100).toFixed(1) : 0;
              ctx.fillStyle = '#2c1810';
              ctx.font = '12px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(val + '分', bar.x, bar.y - 6);
            });
          });
        }
      }]
    });
  }
}

// ═══════════════════════════════════════════
// 数据分析 & 模型管理
// ═══════════════════════════════════════════

function loadDailyTrend() {
  if (typeof Chart === 'undefined') return ensureChartJs(loadDailyTrend);
  fetch('/api/admin/daily-recommendations').then(r => r.json()).then(d => {
    if (!d.success || !d.data.length) return;
    const labels = d.data.map(x => x.day ? x.day.substring(5,10) : '');
    const total = d.data.map(x => parseInt(x.total));
    const guest = d.data.map(x => parseInt(x.guest_count));
    const user = d.data.map(x => parseInt(x.user_count));
    const ctx = document.getElementById('daily-trend-chart');
    if (!ctx) return;
    if (window.dailyChart) window.dailyChart.destroy();
    window.dailyChart = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '游客', data: guest, borderColor: '#8b7a6a', backgroundColor: 'rgba(139,122,106,0.1)', tension: 0.3, fill: true },
          { label: '用户', data: user, borderColor: '#b83a2a', backgroundColor: 'rgba(184,58,42,0.1)', tension: 0.3, fill: true },
          { label: '总计', data: total, borderColor: '#2c1810', backgroundColor: 'transparent', borderDash: [4,2], tension: 0.3 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true, ticks: { maxTicksLimit: 8, precision: 0 } } } }
    });
  }).catch(() => { console.warn('数据加载失败'); });
}

function loadAnalyticsPrefs() {
  if (typeof Chart === 'undefined') return ensureChartJs(loadAnalyticsPrefs);
  fetch('/api/admin/preference-stats').then(r => r.json()).then(d => {
    if (!d.success) return;
    // 合并所有偏好到饼图
    const merged = {};
    const fields = ['spiciness','saltiness','sweetness'];
    const labels_cn = {'spiciness':'辣度','saltiness':'咸淡','sweetness':'甜酸'};
    for (const f of fields) {
      for (const [k, v] of Object.entries(d.stats[f] || {})) {
        if (k === '无' || k === '无特殊要求') continue;
        const key = labels_cn[f] + ':' + k;
        merged[key] = (merged[key] || 0) + parseInt(v);
      }
    }
    const entries = Object.entries(merged).sort((a,b) => b[1] - a[1]).slice(0, 8);
    const colors = ['#b83a2a','#c0392b','#e67e22','#f1c40f','#27ae60','#2ecc71','#2980b9','#8e44ad'];
    const ctx = document.getElementById('pref-pie-chart');
    if (!ctx) return;
    if (window.prefChart) window.prefChart.destroy();
    window.prefChart = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: colors.slice(0, entries.length) }] },
      options: { responsive: true, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } } }
    });
  }).catch(() => { console.warn('数据加载失败'); });
}

function loadUserActivity() {
  if (typeof Chart === 'undefined') return ensureChartJs(loadUserActivity);
  fetch('/api/admin/user-activity').then(r => r.json()).then(d => {
    if (!d.success) return;
    document.getElementById('analytics-total-users').textContent = d.stats.totalUsers;
    document.getElementById('analytics-feedback-users').textContent = d.stats.feedbackUsers;
    const ctx = document.getElementById('user-activity-chart');
    if (!ctx || !d.stats.dailyActive.length) return;
    if (window.activityChart) window.activityChart.destroy();
    const labels = d.stats.dailyActive.map(x => x.day ? x.day.substring(5,10) : '');
    const data = d.stats.dailyActive.map(x => parseInt(x.active_users));
    window.activityChart = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: '活跃用户', data, backgroundColor: 'rgba(184,58,42,0.6)', borderRadius: 4 }] },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { maxTicksLimit: 8, precision: 0 } } } }
    });
  }).catch(() => { console.warn('数据加载失败'); });
}

function loadRecommendationLog() {
  fetch('/api/admin/recommendation-details').then(r => r.json()).then(d => {
    if (!d.success) return;
    document.querySelector('#rec-log-table').innerHTML = d.data.map((x, i) =>
      '<tr><td>' + (i+1) + '</td><td>' + esc(x.user_id || 'guest') + '</td><td>' + esc(x.user_type || '-') + '</td><td>'
      + (x.created_at ? new Date(x.created_at).toLocaleString() : '-') + '</td><td>'
      + (x.rating ? '<span class="badge bg-success" style="border-radius:4px;">' + esc(x.rating) + '分</span>' : '-') + '</td></tr>'
    ).join('');
  }).catch(() => { console.warn('数据加载失败'); });
}

function loadModelManagement() {
  loadAutoRetrainToggle();   // 每次进入本页都刷新开关的真实状态（登录后首次进入也能拿到）
  loadRecEffect();           // 推荐效果报告
  // 加载模型信息
  fetch('/api/admin/model-info').then(r => r.json()).then(d => {
    if (!d.success) return;
    const m = d.model;
    document.getElementById('model-mgr-version').textContent = m.version || '-';
    document.getElementById('model-mgr-time').textContent = m.trainedAt ? new Date(m.trainedAt).toLocaleString() : '-';
    document.getElementById('model-mgr-r2').textContent = m.r2 ? m.r2.toFixed(4) : '-';
    document.getElementById('model-mgr-fb').textContent = m.feedbackCount || '0';
  }).catch(() => { console.warn('数据加载失败'); });
  // 历史模型版本
  fetch('/api/admin/model-history').then(r => r.json()).then(d => {
    if (!d.success) return;
    document.querySelector('#model-history-table').innerHTML = d.history.map((h, i) =>
      '<tr' + (h.isCurrent ? ' style="background:#fdf2e9;"' : '') + '><td>' + esc(h.version) + '</td><td>'
      + (h.trainedAt ? new Date(h.trainedAt).toLocaleString() : '-') + '</td><td>' + (h.r2 ? h.r2.toFixed(4) : '-') + '</td><td>'
      + esc(h.feedbackCount || '0') + '</td><td>' + esc(h.file) + '</td><td>' + (h.isCurrent ? '当前' : '') + '</td></tr>'
    ).join('');
  }).catch(() => { console.warn('数据加载失败'); });
}

// 推荐统计模块
function loadRecommendationStats() {
  fetch('/api/admin/recommendation-stats').then(r => r.json()).then(d => {
    if (!d.success) return;
    const s = d.stats;
    document.getElementById('stat-total-rec').textContent = s.totalRecommendations;
    document.getElementById('stat-fb-rec').textContent = s.feedbackCount;
    document.getElementById('stat-conversion').textContent = s.feedbackRate + '%';
    document.getElementById('stat-avg-rating').textContent = s.avgRating ? s.avgRating.toFixed(2) : '-';
  }).catch(() => { console.warn('数据加载失败'); });
}

// 加载最差菜品
function loadWorstDishes() {
  fetch('/api/admin/worst-dishes').then(r => r.json()).then(d => {
    if (!d.success) return;
    document.querySelector('#worst-dishes-table').innerHTML = d.dishes.map((x, i) =>
      '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.category || '-') + '</td><td>' + x.feedback_count + '</td><td>'
      + '<span class="badge ' + (parseFloat(x.avg_feedback_rating) >= 4 ? 'bg-success' : parseFloat(x.avg_feedback_rating) >= 3 ? 'bg-warning' : 'bg-danger') + '" style="border-radius:4px;">'
      + x.avg_feedback_rating + '</span></td></tr>'
    ).join('');
  }).catch(() => { console.warn('数据加载失败'); });
}

function loadMonitor() {
  fetch('/api/admin/monitor').then(r => r.json()).then(d => {
    if (!d.success) return;
    const m = d.monitor;
    document.getElementById('monitor-r2-trend').textContent = ({ stable: '稳定', improving: '提升中', declining: '下降' })[m.r2Trend] || '-';
    document.getElementById('monitor-uptime').textContent = Math.floor(m.uptime / 3600) + 'h';
    document.getElementById('monitor-memory').textContent = m.memoryUsage || '-';
    document.getElementById('monitor-error-log').textContent = m.errorLog.sizeKB + 'KB';
    document.getElementById('monitor-combined-log').textContent = m.combinedLogSizeKB + 'KB';
    document.getElementById('monitor-pending').textContent = m.pendingRequests || '0';
    const history = m.metricsHistory || [];
    if (history.length) {
      // 在 R² 显著跳变处标注「模型重构」，避免把去作弊后的回落误读为退化
      const parts = history.map((h, i) => {
        const mark = (i > 0 && Math.abs(h.r2 - history[i - 1].r2) > 0.05) ? ' ⚡模型重构 ' : '';
        return mark + h.r2.toFixed(4);
      });
      document.getElementById('monitor-r2-history').textContent = 'R2历史: ' + parts.join(' -> ');
      const note = document.getElementById('monitor-r2-note');
      if (note) { note.textContent = '注：⚡处为模型重构（旧 R² 用复印样本虚高，重构后为真实值，回落非退化）'; note.style.display = 'block'; }
    }
  }).catch(() => { console.warn('数据加载失败'); });
}
// 模型版本对比
function loadModelCompare() {
  fetch('/api/admin/model-compare').then(r => { if (!r.ok) throw Error('HTTP '+r.status); return r.json(); }).then(d => {
    if (!d.success) { console.warn('[model-compare] API请求失败'); return; }
    document.querySelector('#model-compare-table').innerHTML = d.versions.map((v, i) =>
      '<tr' + (v.isCurrent ? ' style="background:#fdf2e9;"' : '') + '><td>' + esc(v.label) + '</td><td>'
      + (v.trainedAt ? new Date(v.trainedAt).toLocaleString() : '-') + '</td><td>' + (v.r2 ? v.r2.toFixed(4) : '-') + '</td><td>'
      + (v.mse ? v.mse.toFixed(4) : '-') + '</td><td>' + (v.mae ? v.mae.toFixed(4) : '-') + '</td><td>'
      + (v.feedbackCount || '0') + '</td><td>' + (v.isCurrent ? '当前' : '') + '</td></tr>'
    ).join('');
    // 显示特征重要性
    if (d.currentImportance && d.currentImportance.length) {
      const impHtml = d.currentImportance.map(i =>
        '<div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:#4a3028;">'
        + '<span style="width:60px;text-align:right;">' + esc(i.feature) + '</span>'
        + '<div style="flex:1;height:18px;background:#f0e8d8;border-radius:4px;overflow:hidden;">'
        + '<div style="height:100%;width:' + (i.importance * 100) + '%;background:linear-gradient(90deg,#c9a96e,#b83a2a);border-radius:4px;"></div></div>'
        + '<span style="width:40px;font-size:0.78rem;color:#8b7a6a;">' + (i.importance * 100).toFixed(1) + '%</span></div>'
      ).join('');
      const impContainer = document.getElementById('model-importance-compare');
      if (impContainer) impContainer.innerHTML = impHtml;
    }
  }).catch(e => console.warn('[model-compare] 请求失败:', e));
}

// 重新训练模型
document.getElementById('retrain-btn')?.addEventListener('click', function() {
  const btn = this;
  const status = document.getElementById('retrain-status');
  btn.disabled = true;
  status.textContent = '训练中...';
  fetch('/api/admin/retrain', { method: 'POST' })
    .then(r => r.json()).then(d => {
      if (d.success) {
        // 后端是异步训练、立即返回「已开始」，响应里没有 version；不能谎报「训练完成」
        status.textContent = d.message || '重训练已开始，将在后台进行';
        loadModelManagement();
        loadModelInfo();
      } else {
        status.textContent = d.message || '训练失败，请重试';
      }
    }).catch(() => { status.textContent = '训练失败，网络错误'; })
    .finally(() => { btn.disabled = false; });
});

// 自动重训开关：未上线时 feedback 里全是测试用例，默认关闭（只收集、不自动重训）
// 抽成函数供 loadModelManagement() 调用 —— 否则登录后进入本页不会刷新真实状态
let _autoRetrainBound = false;
function loadAutoRetrainToggle() {
  const toggle = document.getElementById('auto-retrain-toggle');
  const hint = document.getElementById('auto-retrain-hint');
  if (!toggle) return;
  const render = (on) => {
    toggle.checked = !!on;
    if (hint) hint.textContent = on
      ? '已开启：反馈攒够阈值会自动重训，「重新训练模型」按钮也可用'
      : '已关闭：反馈照常收集但不用于重训，且「重新训练模型」按钮会被拦下（未上线前建议关闭）';
  };
  if (!_autoRetrainBound) {
    _autoRetrainBound = true;
    toggle.addEventListener('change', function () {
      const want = this.checked;
      fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoRetrain: want })
      }).then(r => r.json())
        .then(d => { if (d.success) render(d.settings.autoRetrain); else { render(!want); showToast('保存失败', 'error'); } })
        .catch(() => { render(!want); showToast('保存失败，网络错误', 'error'); });
    });
  }
  fetch('/api/admin/settings').then(r => r.json())
    .then(d => { if (d.success) render(d.settings.autoRetrain); })
    .catch(() => { if (hint) hint.textContent = '读取设置失败'; });
}

// 推荐效果：ML 有没有打过规则？（数据源：feedback 里带偏好的真实评分）
function renderRecEffect(r) {
  const el = document.getElementById('rec-effect-body');
  if (!el) return;
  if (!r) { el.innerHTML = '<span style="color:#8b7a6a;">还没有报告 —— 点下方「重新生成」</span>'; return; }
  if (r.verdict === 'insufficient') {
    el.innerHTML = '<div style="color:#8b7a6a;">还不能判断：' + esc(r.note || '') + '</div>'
      + '<div style="font-size:0.82rem;color:#8b7a6a;margin-top:6px;">当前样本：<strong>' + (r.sample_size || 0) + '</strong> 条真实评分</div>';
    return;
  }
  const badge = r.verdict === 'ml' ? '<span class="badge bg-success">ML 胜出</span>'
              : r.verdict === 'rule' ? '<span class="badge bg-warning">规则仍更强</span>'
              : '<span class="badge bg-secondary">不相上下</span>';
  el.innerHTML =
    '<div style="margin-bottom:10px;">' + badge + ' <span style="font-size:0.85rem;">' + esc(r.note || '') + '</span></div>'
    + '<table class="table table-sm mb-0" style="font-size:0.85rem;max-width:540px;">'
    + '<thead><tr><th>来源</th><th>与真实评分的相关性</th><th>平均误差</th></tr></thead><tbody>'
    + '<tr><td>规则匹配</td><td>' + r.rule.spearman.toFixed(3) + '</td><td>' + r.rule.mae.toFixed(3) + '</td></tr>'
    + '<tr><td>ML 模型</td><td><strong>' + r.ml.spearman.toFixed(3) + '</strong></td><td>' + r.ml.mae.toFixed(3) + '</td></tr>'
    + '</tbody></table>'
    + '<div style="font-size:0.78rem;color:#8b7a6a;margin-top:8px;">'
    + '样本 ' + r.sample_size + ' 条真实评分 · 生成于 ' + String(r.generated_at || '').slice(0, 19).replace('T', ' ')
    + (r.caveat ? '<br>⚠️ ' + esc(r.caveat) : '') + '</div>';
}
function loadRecEffect() {
  const el = document.getElementById('rec-effect-body');
  if (!el) return;
  fetch('/api/admin/recommendation-effect').then(r => r.json())
    .then(d => { if (d.success) renderRecEffect(d.report); })
    .catch(() => { el.innerHTML = '<span style="color:#8b7a6a;">读取失败</span>'; });
}
(function bindRecEffect() {
  const btn = document.getElementById('rec-effect-refresh');
  if (!btn) return;
  btn.addEventListener('click', function () {
    const st = document.getElementById('rec-effect-status');
    btn.disabled = true; if (st) st.textContent = '生成中（要跑 Python，约几秒）...';
    fetch('/api/admin/recommendation-effect', { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (d.success) { renderRecEffect(d.report); if (st) st.textContent = '已更新'; }
        else if (st) st.textContent = d.error || '生成失败';
      })
      .catch(() => { if (st) st.textContent = '网络错误'; })
      .finally(() => { btn.disabled = false; setTimeout(() => { if (st) st.textContent = ''; }, 4000); });
  });
})();

function loadModelInfo() {
  fetch('/api/admin/model-info').then(r => r.json()).then(d => {
    if (!d.success) return;
    const m = d.model;
    document.getElementById('model-version').textContent = m.version || '-';
    document.getElementById('model-trained-at').textContent = m.trainedAt ? new Date(m.trainedAt).toLocaleString() : '-';
    document.getElementById('model-r2').textContent = m.r2 ? m.r2.toFixed(4) : '-';
    document.getElementById('model-feedback-count').textContent = m.feedbackCount || '0';
    // 真实数据占比进度条（2026-11-08 模型真实化仪表）
    const ratio = Math.min(1, Math.max(0, m.realRatio || 0));
    document.getElementById('model-real-ratio-pct').textContent = (ratio * 100).toFixed(1) + '%';
    document.getElementById('model-real-ratio-bar').style.width = (ratio * 100).toFixed(1) + '%';
    const hint = document.getElementById('model-real-hint');
    if (ratio <= 0.001) {
      hint.textContent = '当前为冷启动状态：推荐基于店家选品规则（模拟训练），真实顾客数据积累后自动进化';
    } else if (ratio < 0.05) {
      hint.textContent = '真实数据开始积累：显式评分 ' + (m.feedbackCount || 0) + ' 条 + 收藏/拉黑 ' + (m.implicitCount || 0) + ' 条——继续引导顾客评分与使用席面';
    } else if (ratio < 0.2) {
      hint.textContent = '模型真实化进行中：真实样本已具统计意义，可在"模型管理"页触发增量重训生效';
    } else {
      hint.textContent = '真实数据驱动阶段：推荐已主要由真实顾客行为塑造';
    }
  }).catch(() => { console.warn('数据加载失败'); });
}

function loadPreferenceStats() {
  fetch('/api/admin/preference-stats').then(r => r.json()).then(d => {
    if (!d.success) return;
    // 声明率看板
    renderPrefCompletenessBoard(d.completeness);
    const fields = ['spiciness','saltiness','sweetness','price','calorie','religion'];
    const labels = {'spiciness':'辣度','saltiness':'咸淡','sweetness':'甜酸','price':'价格','calorie':'热量','religion':'饮食宗教'};
    const colors = {'spiciness':'#b83a2a','saltiness':'#c9a96e','sweetness':'#27ae60','price':'#2d8a6e','calorie':'#e67e22','religion':'#8e44ad'};
    fields.forEach(field => {
      const el = document.getElementById('pref-' + field);
      if (!el) return;
      const data = d.stats[field] || {};
      const entries = Object.entries(data);
      if (entries.length === 0) { el.innerHTML = '<div style="color:#8b7a6a;font-size:0.85rem;padding:8px;">暂无数据</div>'; return; }
      const total = entries.reduce((s,e) => s + e[1], 0) || 1;
      el.innerHTML = entries.map(e =>
        '<div class="pref-row">'
        + '<span class="label">' + esc(e[0] === '无' ? '无特殊要求' : e[0]) + '</span>'
        + '<div class="track"><div class="fill" style="width:' + (e[1]/total*100) + '%;background:' + colors[field] + '"></div></div>'
        + '<span class="count">' + e[1] + '</span>'
        + '<span class="pct">' + Math.round(e[1]/total*100) + '%</span></div>'
      ).join('');
    });
  }).catch(() => { console.warn('数据加载失败'); });
}

// 偏好声明率看板：每字段有效声明率(咸淡/热量高亮)+完整度分布
function renderPrefCompletenessBoard(c) {
  const el = document.getElementById('pref-completeness-board');
  if (!el) return;
  if (!c || !c.total) { el.innerHTML = '<div style="color:#8b7a6a;font-size:0.85rem;padding:8px;">暂无偏好记录</div>'; return; }
  const labels = {spiciness:'辣度',saltiness:'咸淡',sweetness:'甜酸',price:'预算',calorie:'热量'};
  // 弱维度由数据驱动：声明率低于 50% 才高亮（避免硬编码与实际数据自相矛盾）
  const WEAK_THRESHOLD = 50;
  let html = '<div style="font-size:0.85rem;color:#8b7a6a;margin-bottom:10px;">共 ' + c.total + ' 条偏好记录 · 声明率低于 ' + WEAK_THRESHOLD + '% 的维度高亮（ML 信号弱）</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">';
  Object.keys(labels).forEach(f => {
    const pf = c.perField[f] || {declared:0, rate:0};
    const weak = pf.rate < WEAK_THRESHOLD;
    const hl = weak ? 'border:1px solid #b83a2a;background:#fdf0ee;' : '';
    const lblColor = weak ? 'color:#b83a2a;font-weight:700;' : '';
    html += '<div class="pref-row" style="' + hl + 'padding:6px 8px;border-radius:6px;">'
      + '<span class="label" style="' + lblColor + '">' + labels[f] + '</span>'
      + '<div class="track"><div class="fill" style="width:' + pf.rate + '%;background:' + (weak?'#b83a2a':'#c9a96e') + '"></div></div>'
      + '<span class="count">' + pf.declared + '/' + c.total + '</span>'
      + '<span class="pct">' + pf.rate + '%</span></div>';
  });
  html += '</div>';
  // 完整度分布(0..5 维)
  if (c.distribution && c.distribution.length) {
    const maxN = Math.max(...c.distribution.map(x => x.n)) || 1;
    html += '<div style="margin-top:14px;font-size:0.85rem;color:#5a4a3a;font-weight:600;margin-bottom:6px;">每行声明维度数分布（0=全默认，5=全声明）</div>';
    html += '<div style="display:flex;align-items:flex-end;gap:6px;height:70px;">';
    for (let i = 0; i <= 5; i++) {
      const bucket = c.distribution.find(x => x.count === i);
      const n = bucket ? bucket.n : 0;
      const h = Math.round(n / maxN * 60);
      const full = i === 5;
      html += '<div style="flex:1;text-align:center;">'
        + '<div style="height:' + (h+4) + 'px;display:flex;align-items:flex-end;justify-content:center;">'
        + '<div style="width:70%;height:' + (h||2) + 'px;border-radius:4px 4px 0 0;background:' + (full?'#27ae60':(i>=3?'#c9a96e':'#d8c8b0')) + ';"></div></div>'
        + '<div style="font-size:0.7rem;margin-top:2px;">' + i + '维</div>'
        + '<div style="font-size:0.7rem;color:#8b7a6a;">' + n + '</div></div>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

function loadDishes() {
  fetch('/api/dishes').then(r => r.json()).then(d => {
    if (!d.success) return;
    document.querySelector('#dish-table-body').innerHTML = d.dishes.map(x =>
      `<tr><td>${esc(x.id)}</td><td>${x.image_url?(x.image_url.startsWith('/')||x.image_url.startsWith('http')?`<img src="${esc(x.image_url)}" style="width:32px;height:32px;border-radius:4px;object-fit:cover;margin-right:6px;vertical-align:middle;" alt="${esc(x.name)}" onerror="this.style.display='none'">`:`<span style="font-size:1.3rem;margin-right:6px;vertical-align:middle;">${esc(x.image_url)}</span>`):""}${esc(x.name)}</td><td>${esc(x.category||'-')}</td><td>${esc(x.spiciness||'-')}</td><td>${esc(x.saltiness||'-')}</td><td>${esc(x.sweetness||'-')}</td><td>${x.price!=null?esc(x.price):'-'}</td><td>${esc(x.rating)}</td><td><span class="badge ${x.is_active===false?'bg-secondary':'bg-success'}" style="border-radius:4px;">${x.is_active===false?'已下架':'已上架'}</span>${x.is_sold_out===true?' <span class="badge bg-danger" style="border-radius:4px;">售罄</span>':''}${x.daily_stock!=null?` <span style="font-size:0.7rem;color:#8b7a6a;">备${esc(x.daily_stock)}·已售${esc(x.sold_today||0)}</span>`:''}</td>
        <td><button class="btn btn-sm ${x.is_sold_out?'btn-success':'btn-outline-danger'}" onclick="toggleSoldOut(${esc(x.id)}, ${x.is_sold_out===true})" style="font-size:0.72rem;padding:2px 8px;border-radius:4px;margin-right:4px;" title="售罄菜当日不进菜单与推荐">${x.is_sold_out?'补货':'售罄'}</button><button class="btn btn-sm btn-outline-secondary" onclick="editDailyStock(${esc(x.id)}, ${x.daily_stock===null||x.daily_stock===undefined?'null':esc(x.daily_stock)})" style="font-size:0.72rem;padding:2px 8px;border-radius:4px;margin-right:4px;" title="设今日备量，卖完自动售罄">备量</button><button class="btn btn-sm btn-outline-primary" onclick="editDish(${esc(x.id)})" style="font-size:0.72rem;padding:2px 8px;border-radius:4px;"><i class="bi bi-pencil"></i> 编辑</button></td></tr>`
    ).join('');
  }).catch(() => { console.warn('数据加载失败'); });
}

function toggleSoldOut(id, cur) {
  const token = localStorage.getItem('adminToken');
  fetch('/api/admin/dish/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ is_sold_out: !cur }) })
    .then(r => r.json()).then(d => {
      if (d.success) { setTimeout(function() { loadDishes(); }, 500); showToast(cur ? '已标记补货' : '已标记售罄', 'success'); }
      else showToast(d.error || '操作失败', 'error');
    }).catch(() => showToast('网络错误', 'error'));
}

// 估清备量(2026-11-02): 设今日备量, 卖完自动售罄; 取消/清空=不限量
function editDailyStock(id, cur) {
  const input = prompt(
    '设「菜品 #' + id + '」今日备量（卖完自动售罄，次日自动恢复）\n留空并确定 = 不限量' + (cur !== null ? '\n当前备量: ' + cur : ''),
    cur === null ? '' : String(cur)
  );
  if (input === null) return;
  const token = localStorage.getItem('adminToken');
  const val = input.trim() === '' ? null : parseInt(input);
  if (val !== null && (isNaN(val) || val < 1 || val > 9999)) {
    showToast('备量需为 1-9999 的整数，留空表示不限量', 'error');
    return;
  }
  fetch('/api/admin/dish/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ daily_stock: val }) })
    .then(r => r.json()).then(d => {
      if (d.success) { setTimeout(loadDishes, 500); showToast(val === null ? '已设为不限量' : '今日备量已设为 ' + val + ' 份', 'success'); }
      else showToast(d.error || '操作失败', 'error');
    }).catch(() => showToast('网络错误', 'error'));
}

// ─── 桌态总览(2026-11-02 对标商龙桌台管理): 30桌网格+并台 ───
let _tablesTimer = null;
function loadTables() {
  const token = localStorage.getItem('adminToken');
  fetch('/api/admin/tables/status', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => r.json()).then(d => {
      if (!d.success) return;
      const grid = document.getElementById('tables-grid');
      if (!grid) return;
      grid.innerHTML = d.tables.map(t => {
        const occ = t.occupied;
        const mins = occ && t.orders && t.orders[0] ? Math.max(0, Math.round((Date.now() - new Date(t.orders[0].createdAt).getTime()) / 60000)) : 0;
        return '<div class="card" style="width:110px;padding:0.5rem;border-radius:10px;cursor:pointer;' +
          (occ ? 'border:2px solid #b83a2a;background:rgba(184,58,42,0.05);' : 'border:1px solid #e4dbcf;opacity:0.7;') + '"' +
          ' onclick="showTableDetail(' + t.table + ')">' +
          '<div style="font-weight:700;color:' + (occ ? '#b83a2a' : '#8b7a6a') + ';">' + t.table + ' 号桌</div>' +
          '<div style="font-size:0.75rem;color:#8b7a6a;">' + (occ ? esc(t.orderCount) + ' 单 · ¥' + esc(t.amount) + (mins ? ' · ' + mins + '分' : '') : '空桌') + '</div>' +
          '</div>';
      }).join('');
      // 60秒自动刷新(重复进入页面只挂一个定时器)
      if (_tablesTimer) clearInterval(_tablesTimer);
      _tablesTimer = setInterval(() => {
        if (!document.getElementById('page-tables')?.classList.contains('active')) { clearInterval(_tablesTimer); _tablesTimer = null; return; }
        loadTables();
      }, 60000);
    }).catch(function (e) { console.warn('桌态加载失败:', e); });
}
function showTableDetail(tableNo) {
  const token = localStorage.getItem('adminToken');
  fetch('/api/admin/tables/status', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => r.json()).then(d => {
      if (!d.success) return;
      const t = d.tables.find(x => x.table === tableNo);
      const el = document.getElementById('table-detail');
      if (!t || !t.occupied) { el.innerHTML = '<div style="color:#8b7a6a;font-size:0.85rem;">' + tableNo + ' 号桌：空桌</div>'; return; }
      el.innerHTML = '<div class="card"><div class="card-header">' + tableNo + ' 号桌 · ' + esc(t.orderCount) + ' 个进行中订单 · 合计 ¥' + esc(t.amount) +
        '</div><div class="card-body" style="font-size:0.82rem;">' +
        t.orders.map(o => '<div style="margin-bottom:4px;">#' + esc(o.id) + ' · ¥' + esc(o.total) + ' · ' + ({pending:'待处理',confirmed:'已确认',preparing:'制作中',cooking:'烹饪中'}[o.status] || esc(o.status)) + '</div>').join('') +
        '<button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById(\'merge-from\').value=' + tableNo + '" style="border-radius:6px;">并到其他桌 →填到源桌</button>' +
        '</div></div>';
    }).catch(function (e) { console.warn('桌态详情加载失败:', e); });
}
document.getElementById('merge-btn')?.addEventListener('click', function () {
  const from = parseInt(document.getElementById('merge-from').value);
  const to = parseInt(document.getElementById('merge-to').value);
  if (!from || !to) { showToast('请填源桌与目标桌号', 'error'); return; }
  if (!confirm('确认把 ' + from + ' 号桌的全部进行中订单并入 ' + to + ' 号桌？')) return;
  const token = localStorage.getItem('adminToken');
  fetch('/api/admin/tables/merge', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ fromTable: from, toTable: to }) })
    .then(r => r.json()).then(d => {
      if (d.success) { showToast('并台成功：' + d.mergedOrders + ' 单已挪到 ' + to + ' 号桌', 'success'); loadTables(); document.getElementById('table-detail').innerHTML = ''; }
      else showToast(d.error || '并台失败', 'error');
    }).catch(() => showToast('网络错误', 'error'));
});

function editDish(id) {
  fetch('/api/dishes/' + id).then(r => r.json()).then(d => {
    if (!d.success || !d.dish) return;
    const dish = d.dish;
    document.getElementById('edit-dish-id').value = id;
    document.getElementById('dish-name').value = dish.name;
    document.getElementById('dish-category').value = dish.category || '';
    document.getElementById('dish-spiciness').value = dish.spiciness || '微辣';
    document.getElementById('dish-price').value = parseFloat(dish.price) || 0;
    document.getElementById('dish-rating').value = parseFloat(dish.rating) || 4.0;
    document.getElementById('dish-tags').value = (dish.tags||[]).join(', ');
    document.getElementById('dish-name-en').value = dish.name_en || '';
    document.getElementById('dish-description-en').value = dish.description_en || '';
    document.getElementById('dish-price-unit').value = dish.price_unit || '';
    document.getElementById('dish-serving').value = dish.serving || '';
    document.getElementById('dish-saltiness').value = dish.saltiness || '适中';
    document.getElementById('dish-sweetness').value = dish.sweetness || '无味';
        const _iu = dish.image_url || '';
    const _isPath = _iu && (_iu.startsWith('/') || _iu.startsWith('http'));
    const _pv = document.getElementById('dish-image-preview');
    _pv.src = _isPath ? _iu : '';
    _pv.style.display = _isPath ? 'block' : 'none';
    document.getElementById('dish-description').value = dish.description || '';
document.getElementById('dish-active').checked = dish.is_active !== false;
    var a = dish.allergies || {};
    document.getElementById('dish-allergy-seafood').checked = a.seafood || false;
    document.getElementById('dish-allergy-peanut').checked = a.peanut || false;
    document.getElementById('dish-allergy-egg').checked = a.egg || false;
    document.getElementById('dish-allergy-gluten').checked = a.gluten || false;
    document.getElementById('dish-allergy-soy').checked = a.soy || false;
    document.getElementById('dish-halal').checked = dish.isHalal || false;
    document.getElementById('dish-vegetarian').checked = dish.isVegetarian || false;
    document.getElementById('dishModalTitle').textContent = '编辑菜品';
    document.getElementById('delete-dish-btn').style.display = 'inline-block';
    document.getElementById('delete-dish-btn').onclick = function() { deleteDish(id, this); };
    document.getElementById('save-dish-btn').onclick = () => saveDish(id);
    new bootstrap.Modal(document.getElementById('dishModal')).show();
  }).catch(() => { console.warn('数据加载失败'); });
}

// 修复 toggleDish 导致已下架菜品无法编辑的问题

document.getElementById('add-dish-btn').addEventListener('click', () => {
  const preview = document.getElementById('dish-image-preview');
  const fileInput = document.getElementById('dish-image-file');
  document.getElementById('edit-dish-id').value = '';
  document.getElementById('dish-name').value = '';
  document.getElementById('dish-category').value = '热菜';
  document.getElementById('dish-spiciness').value = '微辣';
  document.getElementById('dish-saltiness').value = '适中';
  document.getElementById('dish-sweetness').value = '无味';
  document.getElementById('dish-description').value = '';
  document.getElementById('dish-price').value = 0;
  document.getElementById('dish-rating').value = 4.0;
  document.getElementById('dish-tags').value = '';
  document.getElementById('dish-price-unit').value = '';
  document.getElementById('dish-serving').value = '';
  document.getElementById('dish-name-en').value = '';
  document.getElementById('dish-description-en').value = '';
  document.getElementById('dish-active').checked = true;
  document.getElementById('dish-halal').checked = false;
  document.getElementById('dish-vegetarian').checked = false;
  document.getElementById('dish-allergy-seafood').checked = false;
  document.getElementById('dish-allergy-peanut').checked = false;
  document.getElementById('dish-allergy-egg').checked = false;
  document.getElementById('dish-allergy-gluten').checked = false;
  document.getElementById('dish-allergy-soy').checked = false;
  document.getElementById('dishModalTitle').textContent = '添加菜品';
  document.getElementById('delete-dish-btn').style.display = 'none';
  document.getElementById('save-dish-btn').onclick = () => saveDish(null);
  // 重置图片上传状态
  if (preview) { preview.style.display = 'none'; preview.src = ''; }
  if (fileInput) { fileInput.value = ''; }
  new bootstrap.Modal(document.getElementById('dishModal')).show();
});

// 菜品图片上传
document.getElementById('dish-image-upload').addEventListener('click', async () => {
  const fileInput = document.getElementById('dish-image-file');
  const file = fileInput.files?.[0];
  if (!file) { showToast('请先选择图片文件', 'warning'); return; }
  const editId = document.getElementById('edit-dish-id').value;
  if (!editId) { showToast('请先保存菜品信息再上传图片', 'warning'); return; }
  const formData = new FormData();
  formData.append('image', file);
  formData.append('dishId', editId);
  try {
    const token = localStorage.getItem('adminToken');
    const res = await fetch('/api/admin/dish/upload-image', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData,
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('dish-image-preview').src = data.imageUrl;
      document.getElementById('dish-image-preview').style.display = 'block';
      showToast('图片上传成功');
    } else {
      showToast('上传失败: ' + (data.error || '未知错误'), 'error');
    }
  } catch (e) {
    showToast('上传失败: ' + e.message, 'error');
  }
});

function saveDish(id) {
  const name = document.getElementById('dish-name').value.trim();
  const price = document.getElementById('dish-price').value;
  const rating = document.getElementById('dish-rating').value;
  if (!name) { showToast('菜品名称不能为空', 'warning'); return; }
  const priceNum = parseFloat(price);
  const ratingNum = parseFloat(rating);
  if (price === '' || isNaN(priceNum) || priceNum < 0) { showToast('价格不能为空且不能小于0', 'warning'); return; }
  if (rating === '' || isNaN(ratingNum) || ratingNum < 0 || ratingNum > 5) { showToast('评分必须在0-5之间', 'warning'); return; }
  // 评分最多保留一位小数
  if (rating.indexOf('.') >= 0 && rating.split('.')[1].length > 1) { showToast('评分最多保留一位小数，如 4.5', 'warning'); return; }
  // 价格最多保留一位小数
  if (price.indexOf('.') >= 0 && price.split('.')[1].length > 1) { showToast('价格最多保留一位小数，如 28.5', 'warning'); return; }
  const data = {
    name: name,
      description: document.getElementById('dish-description').value,
    category: document.getElementById('dish-category').value,
    spiciness: document.getElementById('dish-spiciness').value,
    saltiness: document.getElementById('dish-saltiness').value,
    sweetness: document.getElementById('dish-sweetness').value,
    price: priceNum,
    rating: ratingNum,
    tags: document.getElementById('dish-tags').value.split(',').map(t => t.trim()).filter(Boolean).join(','),
    price_unit: document.getElementById('dish-price-unit').value.trim(),
    serving: document.getElementById('dish-serving').value.trim(),
    name_en: document.getElementById('dish-name-en').value.trim(),
    description_en: document.getElementById('dish-description-en').value.trim(),
    is_active: document.getElementById('dish-active').checked,
    allergies: {seafood:document.getElementById('dish-allergy-seafood').checked,peanut:document.getElementById('dish-allergy-peanut').checked,egg:document.getElementById('dish-allergy-egg').checked,gluten:document.getElementById('dish-allergy-gluten').checked,soy:document.getElementById('dish-allergy-soy').checked},
    isHalal: document.getElementById('dish-halal').checked,
    isVegetarian: document.getElementById('dish-vegetarian').checked,

  };
  const url = id ? '/api/admin/dish/' + id : '/api/admin/dish';
  const method = id ? 'PUT' : 'POST';
  const token = localStorage.getItem('adminToken');
  fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(data) })
    .then(r => r.json()).then(d => {
      if (d.success) {
        var m=bootstrap.Modal.getInstance(document.getElementById('dishModal'));if(m)m.hide();
        // 保存菜品后等待服务器缓存刷新再重新加载列表
        setTimeout(function() { loadDishes(); loadStats(); }, 800);
      } else { showToast(d.error || '保存失败', 'error'); }
    }).catch(() => { showToast('网络错误，请重试', 'error'); });
}

function deleteDish(id, btn) {
  confirmAction(btn, '删除', function() {
    const token = localStorage.getItem('adminToken');
    fetch('/api/admin/dish/' + id + '/permanent', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    })
      .then(r => r.json()).then(d => {
        if (d.success) {
          var m=bootstrap.Modal.getInstance(document.getElementById('dishModal'));if(m)m.hide();
          // 删除菜品后等待服务器缓存刷新再重新加载列表
          setTimeout(function() { loadDishes(); loadStats(); }, 800);
        } else { showToast(d.error || '删除失败', 'error'); }
      }).catch(() => { showToast('网络错误，请重试', 'error'); });
  });
}


// 弹窗关闭前移走焦点，避免 aria-hidden 警告
document.getElementById('dishModal').addEventListener('show.bs.modal', function() {
  _lastTrigger = document.activeElement;
});
document.getElementById('dishModal').addEventListener('hide.bs.modal', function() {
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
  document.body.focus();
});

  // 管理后台登录
  const adminToken = localStorage.getItem('adminToken');
  const loginPage = document.getElementById('admin-login-page');
  const appWrap = document.querySelector('.app-wrap');
  
  function showAdmin(show) {
    if (loginPage) {
      loginPage.style.display = show ? 'none' : 'flex';
      // 登录页置顶(2026-11-05: 过期token弹回登录页后, fixed侧栏(z-index:100)的溢出内容
      // 曾截获登录按钮的真实点击致"正确凭据也登不进"死锁——登录页压到侧栏之上, 双端可达)
      loginPage.style.zIndex = show ? '' : '3000';
      loginPage.style.position = show ? '' : 'relative';
    }
    // 2026-11-08 关键修复: app-wrap 不得用 flex——sidebar 是 position:fixed 不参与流,
    // main 靠 margin-left:220 定位; flex 化会让 main 变成随内容收缩的 flex 项,
    // 内容窄的页面(反馈查看等)整个后台塌缩到左半边, 右侧大片空白
    if (appWrap) appWrap.style.display = show ? 'block' : 'none';
  }
  
  // 拦截 fetch 自动注入 admin token，遇 401 自动登出（幂等：重复登录只注册一次）
  let _adminFetchIntercepted = false;
  function installAdminFetchInterceptor() {
    if (_adminFetchIntercepted) return;
    _adminFetchIntercepted = true;
    const origFetch = window.fetch;
    window.fetch = function(url, opts) {
      opts = opts || {};
      if (typeof url === 'string' && url.includes('/api/admin/')) {
        opts.headers = opts.headers || {};
        opts.headers['Authorization'] = 'Bearer ' + (localStorage.getItem('adminToken') || '');
      }
      return origFetch.call(window, url, opts).then(function(resp) {
        if (resp.status === 401 && typeof url === 'string' && url.includes('/api/admin/') && !url.includes('/login')) {
          localStorage.removeItem('adminToken');
          showAdmin(false);
          const el = document.getElementById('admin-login-error');
          if (el) { el.textContent = '登录已过期，请重新登录'; el.style.display = 'block'; }
        }
        return resp;
      });
    };
  }

  // 检查是否有已保存的 admin token
  if (adminToken) {
    // 用 stats 接口验证 token 是否有效
    showAdmin(true);
    installAdminFetchInterceptor();
    // 加载初始数据
    loadStats(); loadPopularDishes(); loadFeedback(); loadDishes(); loadPreferenceStats(); loadModelInfo(); loadMonitor(); loadNotifications();
  } else {
    showAdmin(false);
  }

  // 暗黑模式切换
  var dmt = document.getElementById('dark-mode-toggle');
  var dmtm = document.getElementById('dark-mode-toggle-mobile');
  function toggleDark() {
    document.documentElement.classList.toggle('dark-mode');
    var isDark = document.documentElement.classList.contains('dark-mode');
    if (dmt) dmt.textContent = isDark ? '☀️' : '🌙';
    if (dmtm) dmtm.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('darkMode', isDark);
  }
  (function initDark() {
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches;
    var savedDark = localStorage.getItem('darkMode');
    var shouldBeDark = savedDark !== null ? savedDark === 'true' : prefersDark;
    if (shouldBeDark) { document.documentElement.classList.add('dark-mode'); if (dmt) dmt.textContent = '☀️'; if (dmtm) dmtm.textContent = '☀️'; }
    if (dmt) dmt.addEventListener('click', toggleDark);
    if (dmtm) dmtm.addEventListener('click', toggleDark);
  })();

  // 退出登录
  function adminLogout(){
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    showAdmin(false);
    location.reload();
  }
  ['admin-logout-link','admin-logout-link-mobile'].forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.addEventListener('click',function(e){e.preventDefault();adminLogout();});
  });
  window.scrollToTop=()=>window.scrollTo({top:0,behavior:'smooth'});

  // 预警横幅点击(2026-11-08): 内部链接走统一切页 showAdminPage, 带 dishName 时跳反馈页并自动按菜过滤
  document.getElementById('notification-bar').addEventListener('click', function (e) {
    const card = e.target.closest('[data-goto]');
    if (!card) return;
    const link = card.getAttribute('data-goto');
    const dish = card.getAttribute('data-dish') || '';
    if (link.startsWith('#page-')) {
      showAdminPage(link.slice(1), { dishFilter: dish, smoothScroll: true });
    } else if (link.startsWith('/')) {
      location.href = link;
    }
  });

  // 显示Toast通知
  function showToast(msg, type) {
    var bar = document.getElementById('notification-bar');
    if (!bar) return;
    bar.style.display = 'block';
    bar.textContent = msg;
    bar.style.background = type === 'warning' ? '#f39c12' : type === 'error' ? '#e74c3c' : '#27ae60';
    bar.style.color = '#fff';
    bar.style.padding = '8px 12px';
    bar.style.borderRadius = '6px';
    bar.style.marginBottom = '12px';
    setTimeout(function() { bar.style.display = 'none'; }, 3000);
  }

  // 二次点击确认（不依赖原生 confirm，沙箱环境也可用）
  function confirmAction(btn, label, onConfirm) {
    if (btn && btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.dataset.orig = btn.textContent;
      btn.textContent = '再点' + label;
      btn.style.background = '#e74c3c';
      btn.style.color = '#fff';
      setTimeout(function() { if (btn.dataset.armed === '1') { btn.dataset.armed = ''; btn.textContent = btn.dataset.orig || label; btn.style.background = ''; btn.style.color = ''; } }, 3000);
      return;
    }
    if (btn) { btn.dataset.armed = ''; btn.textContent = btn.dataset.orig || label; btn.style.background = ''; btn.style.color = ''; }
    onConfirm();
  }

  // 登录按钮
  const loginBtn = document.getElementById('admin-login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', function() {
      const user = document.getElementById('admin-login-user').value.trim();
      const pass = document.getElementById('admin-login-pass').value.trim();
      const errEl = document.getElementById('admin-login-error');
      if (!user || !pass) { errEl.textContent = '请输入用户名和密码'; errEl.style.display = 'block'; return; }
      fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      }).then(r => r.json()).then(d => {
        if (d.success) {
          localStorage.setItem('adminToken', d.token);
          errEl.style.display = 'none';
          showAdmin(true);
          installAdminFetchInterceptor();
          loadStats(); loadPopularDishes(); loadFeedback(); loadDishes(); loadPreferenceStats(); loadModelInfo(); loadMonitor(); loadNotifications();
        } else {
          errEl.textContent = d.error || '登录失败';
          errEl.style.display = 'block';
        }
      }).catch(function() {
        errEl.textContent = '网络连接失败，请检查网络';
        errEl.style.display = 'block';
      });
    });
    // 回车键登录
    document.getElementById('admin-login-pass').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') loginBtn.click();
    });
  }


  // 加载通知
  function loadNotifications() {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    fetch('/api/admin/notifications', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
      .then(r => r.json()).then(d => {
        if (!d.success || !d.notifications.length) return;
        const bar = document.getElementById('notification-bar');
        if (!bar) return;
        bar.innerHTML = d.notifications.map(n => {
          // 2026-11-08: # 开头的内部链接支持点击跳转(section切换+可选菜品过滤), 不再只认 http/斜杠
          const isInternal = n.link && n.link.startsWith('#page-');
          const isExternal = n.link && (n.link.startsWith('/') || n.link.startsWith('http://') || n.link.startsWith('https://'));
          const clickable = isInternal || isExternal;
          return '<div' + (clickable ? ' style="padding:8px 14px;border-radius:8px;font-size:0.85rem;margin-bottom:4px;background:' + (n.type === 'warning' ? '#fef3cd' : '#d1ecf1') + ';color:' + (n.type === 'warning' ? '#856404' : '#0c5460') + ';display:flex;align-items:center;gap:8px;cursor:pointer;" data-goto="' + esc(n.link || '') + '" data-dish="' + esc(n.dishName || '') + '"' : ' style="padding:8px 14px;border-radius:8px;font-size:0.85rem;margin-bottom:4px;background:' + (n.type === 'warning' ? '#fef3cd' : '#d1ecf1') + ';color:' + (n.type === 'warning' ? '#856404' : '#0c5460') + ';display:flex;align-items:center;gap:8px;"') + '>'
          + '<i class="bi bi-' + (n.type === 'warning' ? 'exclamation-triangle' : 'info-circle') + '"></i>'
          + '<span>' + esc(n.message) + '</span>'
          + (clickable ? '<span style="margin-left:auto;color:inherit;text-decoration:underline;">查看详情 »</span>' : '')
          + '</div>';
        }).join('');
        bar.style.display = 'block';
      }).catch(() => { console.warn('数据加载失败'); });
  }

  // 加载用户列表
  var usersCache = [];
  // 客群概览(2026-11-02 对标商龙六大智能标签): 三档客群+口味分布+常客TOP
  function loadUserSegments() {
    const token = localStorage.getItem('adminToken');
    fetch('/api/admin/user-segments', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(r => r.json()).then(d => {
        if (!d.success) return;
        const el = document.getElementById('user-segments-body');
        if (!el) return;
        const s = d.segments;
        el.innerHTML =
          '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px;">'
          + '<span class="badge" style="background:rgba(184,58,42,0.12);color:#b83a2a;padding:4px 12px;border-radius:12px;">常客(≥5单): ' + s.regular + '</span>'
          + '<span class="badge" style="background:rgba(201,169,110,0.15);color:#8b7a6a;padding:4px 12px;border-radius:12px;">回头客(2-4单): ' + s.returning + '</span>'
          + '<span class="badge" style="background:rgba(45,138,110,0.12);color:#2d8a6e;padding:4px 12px;border-radius:12px;">新客(1单): ' + s.newcomer + '</span>'
          + '</div>'
          + (d.tasteTop.length ? '<div style="font-size:0.78rem;color:#8b7a6a;">口味偏好: ' + d.tasteTop.map(t => esc(t.label) + '×' + t.n).join(' · ') + '</div>' : '')
          + (d.topRegulars.length ? '<details style="margin-top:6px;"><summary style="cursor:pointer;color:#c9a96e;font-size:0.78rem;">常客 TOP（按消费额）</summary><div style="margin-top:4px;font-size:0.78rem;">'
            + d.topRegulars.map(u => esc(u.username) + ' · ' + u.orders + '单 · ' + u.spend + '元').join('<br>') + '</div></details>' : '');
      }).catch(function (e) { console.warn('客群加载失败', e); });
  }

  function loadUsers(q) {
    const token = localStorage.getItem('adminToken');
    document.querySelector('#user-table-body').innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8b7a6a;padding:20px;">加载中...</td></tr>';
    fetch('/api/admin/users' + (q ? '?q=' + encodeURIComponent(q) : ''), {
      headers: { 'Authorization': 'Bearer ' + token }
    })
      .then(r => r.json()).then(d => {
        if (!d.success) return;
        usersCache = d.users;
        renderUserRows(d.users, d.total);
      }).catch(() => { document.querySelector('#user-table-body').innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8b7a6a;padding:20px;">加载失败</td></tr>'; });
  }
  function renderUserRows(users, total) {
    if (!users.length) { document.querySelector('#user-table-body').innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8b7a6a;padding:20px;">无匹配用户</td></tr>'; return; }
    const hint = (total && total > users.length) ? '<tr><td colspan="5" style="text-align:center;color:#8b7a6a;padding:8px;background:#fdfaf5;font-size:0.8rem;">共 ' + esc(total) + ' 位用户 · 当前显示最新 ' + esc(users.length) + ' 位 · 顶部搜索框可按用户名查找</td></tr>' : '';
    document.querySelector('#user-table-body').innerHTML = hint + users.map(u =>
      '<tr><td>' + esc(u.id) + '</td><td>' + esc(u.username) + '</td><td>' + (u.created_at ? new Date(u.created_at).toLocaleString() : '-') + '</td><td>' + (u.last_login ? new Date(u.last_login).toLocaleString() : '从未登录') + '</td>'
      + '<td><button class="btn btn-sm btn-outline-secondary text-body" onclick="toggleUserDetail(' + esc(u.id) + ', this)" style="font-size:0.72rem;padding:2px 8px;border-radius:4px;margin-right:4px;">详情</button>'
      + '<button class="btn btn-sm btn-outline-secondary text-body" onclick="openResetPwd(' + esc(u.id) + ', \'' + esc(u.username).replace(/'/g, "\\'") + '\')" style="font-size:0.72rem;padding:2px 8px;border-radius:4px;margin-right:4px;">重置密码</button>'
      + '<button class="btn btn-sm btn-outline-danger fw-bold" onclick="deleteUser(' + esc(u.id) + ', this)" style="font-size:0.72rem;padding:2px 8px;border-radius:4px;">删除</button></td></tr>'
      + '<tr class="user-detail-row" id="user-detail-' + esc(u.id) + '" style="display:none;"><td colspan="5" style="background:#fdfaf5;padding:12px;">点击查看详情</td></tr>'
    ).join('');
  }
  function toggleUserDetail(id, btn) {
    const row = document.getElementById('user-detail-' + id);
    if (!row) return;
    const show = row.style.display === 'none';
    document.querySelectorAll('.user-detail-row').forEach(r => { if (r !== row) r.style.display = 'none'; });
    row.style.display = show ? '' : 'none';
    btn.textContent = show ? '收起' : '详情';
    if (show && !row.dataset.loaded) {
      row.querySelector('td').textContent = '加载中...';
      fetch('/api/admin/users/' + id, { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('adminToken') } })
        .then(r => r.json()).then(d => {
          if (!d.success || !d.user) { row.querySelector('td').textContent = '加载失败'; return; }
          row.dataset.loaded = '1';
          const u = d.user, p = u.preferences || {}, fav = u.favorites || [], blk = u.blacklist || [];
          row.querySelector('td').innerHTML =
            '<div style="font-size:0.82rem;line-height:1.8;">'
            + '<div><strong>口味偏好：</strong>' + esc(p.spiciness||'-') + ' / ' + esc(p.saltiness||'-') + ' / ' + esc(p.sweetness||'-') + (p.price?' · 价格'+esc(p.price):'') + (p.calorie?' · 热量'+esc(p.calorie):'') + (p.religion&&p.religion!=='无'?' · '+esc(p.religion):'') + '</div>'
            + '<div><strong>收藏 (' + fav.length + ')：</strong>' + (fav.length ? fav.map(x=>esc(String(x))).join(', ') : '无') + '</div>'
            + '<div><strong>拉黑 (' + blk.length + ')：</strong>' + (blk.length ? blk.map(x=>esc(String(x))).join(', ') : '无') + '</div>'
            + '</div>';
        }).catch(() => { row.querySelector('td').textContent = '加载失败'; });
    }
  }
  // 用户搜索（客户端过滤用户名）
  // 用户搜索：300ms 防抖走服务端 ILIKE 查询(可搜全库)，空串回到最新 200 位
  (function(){ var s=document.getElementById('user-search'); if(!s) return; var t=null;
    s.addEventListener('input', function(){ var q=this.value.trim();
      renderUserRows((usersCache||[]).filter(u => (u.username||'').toLowerCase().includes(q.toLowerCase())));
      clearTimeout(t); t=setTimeout(function(){ loadUsers(q || undefined); }, 300);
    });
  })();

  // ─── 重置用户密码（顾客忘记密码时店主线下核实后操作）───
  var resetPwdUserId = null, resetPwdUsername = '';
  function openResetPwd(id, username) {
    resetPwdUserId = id; resetPwdUsername = username;
    document.getElementById('reset-pwd-username').textContent = username;
    document.getElementById('reset-pwd-new').value = '';
    document.getElementById('reset-pwd-msg').style.display = 'none';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('resetPwdModal')).show();
  }
  function submitResetPwd() {
    var np = document.getElementById('reset-pwd-new').value;
    var msg = document.getElementById('reset-pwd-msg');
    msg.style.display = 'none';
    fetch('/api/admin/users/' + resetPwdUserId + '/reset-password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('adminToken') },
      body: JSON.stringify({ newPassword: np })
    }).then(r => r.json()).then(d => {
      msg.style.display = 'block';
      msg.style.color = d.success ? '#27ae60' : '#e74c3c';
      msg.textContent = d.message || d.error || (d.success ? '已重置' : '重置失败');
      if (d.success) { setTimeout(function(){ bootstrap.Modal.getInstance(document.getElementById('resetPwdModal')).hide(); }, 1200); }
    }).catch(function(){ msg.style.display = 'block'; msg.style.color = '#e74c3c'; msg.textContent = '网络错误，请重试'; });
  }
  (function(){ var b=document.getElementById('reset-pwd-confirm'); if(b) b.addEventListener('click', submitResetPwd); })();

  // ─── 订单管理（只读列表 + 状态/桌号筛选）───
  var ORDERS_STATUS_MAP = { pending: '📌 待处理', confirmed: '✅ 已确认', preparing: '🍳 制作中', completed: '✅ 已完成', cancelled: '🚫 已取消' };
  function loadAdminOrders() {
    var status = document.getElementById('orders-status').value;
    var table = document.getElementById('orders-table-search').value.trim();
    var body = document.getElementById('orders-table-body');
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#8b7a6a;padding:20px;">查询中...</td></tr>';
    var qs = new URLSearchParams();
    if (status && status !== 'all') qs.set('status', status);
    if (table) qs.set('table', table);
    qs.set('limit', '100');
    fetch('/api/admin/orders?' + qs.toString(), { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('adminToken') } })
      .then(r => r.json()).then(d => {
        if (!d.success) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#e74c3c;padding:20px;">加载失败</td></tr>'; return; }
        if (!d.orders.length) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#8b7a6a;padding:20px;">无匹配订单</td></tr>'; return; }
        body.innerHTML = d.orders.map(function(o) {
          var items = (o.items || []);
          var qty = items.reduce(function(s, i) { return s + (parseInt(i.qty || i.quantity) || 1); }, 0);
          var detail = items.map(function(i) { return esc(i.name || '?') + ' × ' + (parseInt(i.qty || i.quantity) || 1); }).join('；');
          var time = o.created_at ? new Date(o.created_at).toLocaleString() : '-';
          return '<tr><td>#' + esc(o.id) + '</td><td>' + esc(o.table_number || '外卖') + '</td>'
            + '<td>' + (ORDERS_STATUS_MAP[o.status] || esc(o.status)) + '</td>'
            + '<td>' + qty + '</td><td>' + (parseFloat(o.total_price) || 0).toFixed(2) + ' 元</td><td>' + time + '</td>'
            + '<td style="max-width:260px;font-size:0.75rem;color:#6b5d4f;word-break:break-all;">' + detail + '</td></tr>';
        }).join('');
      }).catch(function(){ body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#e74c3c;padding:20px;">网络错误</td></tr>'; });
  }
  (function(){
    var btn=document.getElementById('orders-load-btn'); if(btn) btn.addEventListener('click', loadAdminOrders);
    var sel=document.getElementById('orders-status'); if(sel) sel.addEventListener('change', loadAdminOrders);
    var inp=document.getElementById('orders-table-search'); if(inp) inp.addEventListener('keydown', function(e){ if(e.key==='Enter') loadAdminOrders(); });
  })();

  function deleteUser(id, btn) {
    confirmAction(btn, '删除', function() {
      const token = localStorage.getItem('adminToken');
      fetch('/api/admin/users/' + id + '/toggle', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      })
        .then(r => r.json()).then(d => {
          if (d.success) { loadUsers(); showToast('用户已删除'); }
          else showToast(d.error || '删除失败', 'error');
        }).catch(() => showToast('删除失败，网络错误', 'error'));
    });
  }

  // 管理员点击导航时加载对应页面数据
  // 修复 CSV 导出缺少 Authorization 头
  function exportCSV(type) {
    const token = localStorage.getItem('adminToken');
    if (!token) { showToast('请先登录', 'warning'); return; }
    const urls = { 'popular-dishes': '/api/admin/export/popular-dishes', 'feedback': '/api/admin/export/feedback', 'orders': '/api/admin/export/orders' };
    const url = urls[type];
    if (!url) return;
    fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
      .then(r => { if (!r.ok) throw new Error('导出失败'); return r.text(); })
      .then(csv => {
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = type + '_' + new Date().toISOString().slice(0, 10) + '.csv';
        link.click();
        URL.revokeObjectURL(link.href);
      })
      .catch(e => showToast('导出失败: ' + e.message, 'error'));
  }

  // 加载通知
  setTimeout(loadNotifications, 500);
  

// ── 原块3:桌码管理(A2)──
// ═══ 桌码管理（A2）：签名桌码链接批量生成二维码 ═══
document.getElementById('qr-gen-btn').addEventListener('click', async function() {
  if (typeof qrcode === 'undefined') { const b = this; ensureQrcodeJs(function() { b.click(); }); return; }
  const btn = this;
  const from = parseInt(document.getElementById('qr-from').value, 10);
  const to = parseInt(document.getElementById('qr-to').value, 10);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from || to > 99) { showToast('桌号范围 1-99 且起始不大于结束', 'warning'); return; }
  btn.disabled = true; btn.textContent = '生成中...';
  try {
    const token = localStorage.getItem('adminToken');
    const r = await fetch('/api/admin/table-qrcodes?from=' + from + '&to=' + to, { headers: { 'Authorization': 'Bearer ' + token } });
    const d = await r.json();
    if (!d.success) { showToast(d.error || '生成失败', 'error'); return; }
    const grid = document.getElementById('qr-grid');
    grid.innerHTML = d.qrcodes.map(q => {
      const g = qrcode(0, 'M'); g.addData(q.url); g.make();
      return '<div class="qr-card"><div style="display:flex;justify-content:center;"><img src="' + g.createDataURL(6, 4) + '" alt="' + esc(q.table) + ' 号桌桌码" style="width:120px;height:120px;"></div><div class="qr-table-no">' + esc(q.table) + ' 号桌</div></div>';
    }).join('');
    document.getElementById('qr-print-btn').style.display = 'inline-block';
    showToast('已生成 ' + d.qrcodes.length + ' 张桌码', 'success');
  } catch (e) { showToast('网络错误', 'error'); }
  finally { btn.disabled = false; btn.textContent = '生成桌码'; }
});
document.getElementById('qr-print-btn').addEventListener('click', function() { window.print(); });

// ── 原块4:营业日报(A3)──
// ═══ 营业日报（A3）：按日聚合查询与渲染 ═══
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function localToday(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}
function loadDailyReport(date){
  const token=localStorage.getItem('adminToken');
  fetch('/api/admin/daily-report?date='+encodeURIComponent(date),{headers:{'Authorization':'Bearer '+token}})
  .then(r=>r.json()).then(d=>{
    if(!d.success){showToast(d.error||'加载失败','error');return;}
    const s=d.stats;
    document.getElementById('report-stats').innerHTML=
      '<div class="col-md-3 col-6"><div class="card" style="padding:0.8rem;"><div style="font-size:0.75rem;color:#8b7a6a;">有效单量</div><h4 style="margin:0;">'+s.totalOrders+(s.ordersChange!==null&&s.ordersChange!==undefined?' <small style="font-size:0.7rem;color:'+(s.ordersChange>=0?'#2d8a6e':'#b3261e')+';">'+(s.ordersChange>=0?'↑':'↓')+Math.abs(s.ordersChange)+'%</small>':'')+'</h4></div></div>'
     +'<div class="col-md-3 col-6"><div class="card" style="padding:0.8rem;"><div style="font-size:0.75rem;color:#8b7a6a;">营业额</div><h4 style="margin:0;">'+s.revenue+' 元'+(s.revenueChange!==null&&s.revenueChange!==undefined?' <small style="font-size:0.7rem;color:'+(s.revenueChange>=0?'#2d8a6e':'#b3261e')+';">'+(s.revenueChange>=0?'↑':'↓')+Math.abs(s.revenueChange)+'%</small>':'')+'</h4></div></div>'
     +'<div class="col-md-3 col-6"><div class="card" style="padding:0.8rem;"><div style="font-size:0.75rem;color:#8b7a6a;">客单价</div><h4 style="margin:0;">'+s.avgTicket+' 元</h4></div></div>'
     +'<div class="col-md-3 col-6"><div class="card" style="padding:0.8rem;"><div style="font-size:0.75rem;color:#8b7a6a;">退单</div><h4 style="margin:0;">'+s.cancelled+' <small style="font-size:0.7rem;color:#8b7a6a;">('+s.cancelledAmount+'元)</small></h4></div></div>'
     +'<div class="col-md-3 col-6"><div class="card" style="padding:0.8rem;"><div style="font-size:0.75rem;color:#8b7a6a;">翻台率(30桌)</div><h4 style="margin:0;">'+(s.turnoverRate||'-')+' <small style="font-size:0.7rem;color:#8b7a6a;">动用'+(s.usedTables||0)+'桌</small></h4></div></div>'
     +'<div class="col-md-3 col-6"><div class="card" style="padding:0.8rem;"><div style="font-size:0.75rem;color:#8b7a6a;">桌均营收</div><h4 style="margin:0;">'+(s.avgPerTable||0)+' 元</h4></div></div>'
     +'<div class="col-md-3 col-6"><div class="card" style="padding:0.8rem;"><div style="font-size:0.75rem;color:#8b7a6a;">昨日营收</div><h4 style="margin:0;">'+(s.prevRevenue||0)+' 元</h4></div></div>'
     +'<div class="col-md-3 col-6"><div class="card" style="padding:0.8rem;"><div style="font-size:0.75rem;color:#8b7a6a;">昨日单量</div><h4 style="margin:0;">'+(s.prevOrders||0)+'</h4></div></div>';
    const tb=document.querySelector('#report-dishes tbody');
    tb.innerHTML=d.dishes.length?d.dishes.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+x.qty+'</td><td>'+x.revenue+' 元</td></tr>').join(''):'<tr><td colspan="3" style="color:#8b7a6a;">当日无动销</td></tr>';
    const maxC=Math.max(1,...d.hours.map(h=>h.cnt));
    document.getElementById('report-hours').innerHTML=d.hours.length?d.hours.map(h=>'<div style="text-align:center;"><div style="width:26px;margin:0 auto;background:linear-gradient(180deg,var(--gold),var(--primary));border-radius:4px 4px 0 0;height:'+Math.round(h.cnt/maxC*80+6)+'px;" title="'+h.cnt+' 单 / '+h.amount+' 元"></div><small style="font-size:0.65rem;color:#8b7a6a;">'+h.hr+'时</small></div>').join(''):'<div style="color:#8b7a6a;font-size:0.8rem;">当日无有效订单</div>';
    // ═══ 席面采纳卡(2026-11-09 数据飞轮第2步)═══
    const ts=d.tableSet||{};
    document.getElementById('report-tableset-stats').innerHTML=
      '<div><span style="color:#8b7a6a;">席面展示</span> <b>'+esc(ts.shows||0)+'</b> 次</div>'
     +'<div><span style="color:#8b7a6a;">有采纳会话</span> <b>'+esc(ts.adoptedSessions||0)+'</b> 个</div>'
     +'<div><span style="color:#8b7a6a;">采纳率</span> <b style="color:var(--primary);">'+esc(ts.rate===null||ts.rate===undefined?'-':ts.rate)+'</b></div>'
     +'<div><span style="color:#8b7a6a;">整桌采纳</span> <b>'+esc(ts.adoptSet||0)+'</b> 次</div>'
     +'<div><span style="color:#8b7a6a;">单菜加购</span> <b>'+esc(ts.adoptDish||0)+'</b> 次</div>';
    document.getElementById('report-tableset-combos').innerHTML=
      (ts.topCombos&&ts.topCombos.length?ts.topCombos.map((c,i)=>'<div style="padding:0.45rem 0;border-top:1px dashed #e8ddd0;"><b>#'+(i+1)+'</b> '+esc(c.style||'')+' · '+esc(c.dishNames?c.dishNames.length:0)+' 菜 · 约'+esc(c.totalPrice||0)+'元 · 采纳 <b>'+esc(c.cnt)+'</b> 次<div style="font-size:0.75rem;color:#8b7a6a;margin-top:2px;">'+esc((c.dishNames||[]).join('、'))+'</div></div>').join('')
      +(ts.topDishes&&ts.topDishes.length?'<div style="margin-top:0.5rem;font-size:0.8rem;"><span style="color:#8b7a6a;">单菜加购热门:</span> '+ts.topDishes.map(x=>esc(x.name)+'×'+x.cnt).join('、')+'</div>':'')
      :'<div style="color:#8b7a6a;font-size:0.8rem;">当日无席面采纳记录</div>');
  }).catch(()=>showToast('网络错误','error'));
}
document.getElementById('report-load-btn').addEventListener('click',function(){
  const v=document.getElementById('report-date').value;
  if(v)loadDailyReport(v);else showToast('请选择日期','warning');
});

// ═══ 回到顶部(back-to-top 内联 onclick 依赖)═══
// admin.html 从未引入 script.js(顾客端打包产物),back-to-top 按钮的 onclick="scrollToTop()"
// 此前在后台页必然 ReferenceError——2026-11-09 补定义,实现与 js/core.js 同款平滑滚动
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
