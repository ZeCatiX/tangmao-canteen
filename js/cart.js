// 购物车与结算域(2026-10-19 自 core.js 拆出): 购物车渲染/桌台选择/账单/赠菜轮次/加菜/结算全流程
// 纯整体搬移零逻辑改动;构建顺序见 build.js(共享顶层全局,内联 onclick 依赖顶层函数名)

// ═══════════════ 购物车功能 ═══════════════
// 购物车三处参数化文案(加菜横幅/赠菜横幅/回执头)的语言感知渲染——遍历式翻译只做整节点精确匹配,够不着带动态值的模板,须渲染路径自理
// showCart 与 applyUiLang(切语言)都会调用;2026-10-16 修复 EN 模式残留中文(A4 同类)
window.renderCartLangAware = function () {
  const en = menuLang === 'en';
  const ltB = ssGet('lockedTable') || '',
    loB = ssGet('lastOrderId') || '',
    lotB = ssGet('lastOrderTable') || '';
  const banner = document.getElementById('cart-order-banner');
  if (banner) {
    if (ltB && loB && lotB === ltB) {
      banner.style.display = 'flex';
      const bSpan = document.getElementById('banner-table') ? document.getElementById('banner-table').parentElement : null;
      if (bSpan)
        bSpan.innerHTML = en
          ? 'Adding to <strong id="banner-table" style="color:var(--primary-accent);">' + esc(tableLabel(ltB)) + '</strong> · Order <span id="banner-oid" style="color:var(--primary-accent);">#' + esc(loB) + '</span>'
          : '正在为 <strong id="banner-table" style="color:var(--primary-accent);">' + esc(ltB) + '</strong> 号桌加菜 · 订单 <span id="banner-oid" style="color:var(--primary-accent);">#' + esc(loB) + '</span>';
        // 订单存活异步校验(F3类收尾,2026-10-16): 已完结/已取消/不存在 → 清绑定+收横幅,防对死订单宣称"正在加菜"
        // TTL 60s 缓存: renderCartLangAware 会被 MutationObserver 高频回调,不缓存则每变更都发请求 → 风暴
        var now = Date.now();
        if (!window._orderChkCache || window._orderChkCache.oid !== loB || now - window._orderChkCache.ts > 60000) {
          window._orderChkCache = { oid: loB, ts: now, verdict: null };
          safeFetch('/api/order/' + encodeURIComponent(loB) + '/status-check?tableNumber=' + encodeURIComponent(ltB), { headers: authHeaders() })
            .then((r) => r.json())
            .then((chk) => {
              if (window._orderChkCache && window._orderChkCache.oid === loB) {
                window._orderChkCache.verdict = chk && chk.success && chk.exists ? chk.status : 'gone';
              }
              if (chk && chk.success && (!chk.exists || ['completed', 'cancelled'].indexOf(chk.status) >= 0)) {
                ['lastOrderId', 'lastOrderTable', 'lastOrderItems', 'lastOrderRounds', 'lastOrderAI', 'lastOrderStats'].forEach(function (k) {
                  ssRemove(k);
                });
                const b2 = document.getElementById('cart-order-banner');
                if (b2) b2.style.display = 'none';
              }
            })
            .catch(() => { window._orderChkCache = null; });
        } else if (window._orderChkCache.verdict && ['completed', 'cancelled', 'gone'].indexOf(window._orderChkCache.verdict) >= 0) {
          // 缓存判定为已死: 收横幅但不重复发请求
          banner.style.display = 'none';
        }
    } else {
      banner.style.display = 'none';
      window._orderChkCache = null;
    }
    // 赠菜模式提示:给别桌加菜进行中,明确告知目标桌号(2026-09-17)
    const gfb = document.getElementById('gift-mode-banner');
    if (gfb) {
      const sideOn = ssGet('sideOrder') === '1',
        pending = ssGet('sidePendingTable') || '';
      const target = pending || (sideOn ? ssGet('lockedTable') || ssGet('tableNumber') || '' : '');
      if (sideOn && target) {
        gfb.style.display = 'flex';
        gfb.innerHTML = en
          ? '🍱 Gifting mode: picking for <strong id="gift-mode-table" style="color:var(--primary-accent);font-size:1rem;">' + esc(tableLabel(target)) + '</strong> — will be billed to your own table'
          : '🍱 赠菜模式:正在为 <strong id="gift-mode-table" style="color:var(--primary-accent);font-size:1rem;">' + esc(target) + '</strong> 号桌选菜,结算后计入你本桌账单';
      } else gfb.style.display = 'none';
    }
  }
  // 已结算回执头
  let rounds = [];
  try {
    rounds = JSON.parse(ssGet('lastOrderRounds') || '[]');
  } catch (e) {}
  const si = document.getElementById('settled-order-info');
  if (si && rounds.length) {
    const totalItems = rounds.reduce((s, r) => s + r.items.reduce((a, x) => a + (x.qty || 1), 0), 0);
    const totalYuan = rounds.reduce((s, r) => s + (parseFloat(r.total) || 0), 0).toFixed(2);
    si.textContent = en
      ? 'Order #' + (loB || '-') + ' · ' + tableLabel(lotB || '-') + ' · ' + totalItems + ' items · ¥' + totalYuan
      : '订单 #' + (loB || '-') + ' · 桌号 ' + (lotB || '-') + ' · 共 ' + totalItems + ' 件 · ' + totalYuan + ' 元';
  }
};
function renderRoundsHTML(rounds) {
  if (!rounds || !rounds.length) return '';
  const lastIdx = rounds.length - 1;
  const normal = rounds.map((r, i) => ({ r, i })).filter((o) => !o.r.giftTo);
  const gifts = rounds.map((r, i) => ({ r, i })).filter((o) => o.r.giftTo);
  let html = normal
    .map((o) => {
      const r = o.r,
        cur = o.i === lastIdx;
      return (
        '<div style="border-left:2px solid ' +
        (cur ? 'var(--gold)' : 'rgba(201,169,110,0.25)') +
        ';padding-left:10px;margin-bottom:12px;opacity:' +
        (cur ? 1 : 0.6) +
        ';"><div style="font-size:0.8rem;font-weight:600;color:' +
        (cur ? 'var(--gold)' : 'var(--text-light)') +
        ';padding-bottom:3px;">● ' +
        roundLabelLang(r.label || '第' + (r.round || o.i + 1) + '轮') +
        (cur ? (menuLang === 'en' ? ' ← current' : ' ← 当前轮') : ' · ' + (r.time || '')) +
        '</div>' +
        (r.items || [])
          .map(
            (x) =>
              '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--cream-dark);border-radius:6px;margin-top:3px;"><span style="font-size:0.85rem;">' +
              esc((function () { var dd = dishData.find(function (d) { return Number(d.id) === Number(x.id); }); return dd ? dishNameOf(dd) : x.name; })()) +
              '</span><span style="font-size:0.8rem;color:var(--text-light);"><strong style="color:var(--text);">×' +
              (x.qty || 1) +
              '</strong> · ' +
              formatPrice(x.price) +
              '</span></div>'
          )
          .join('') +
        '</div>'
      );
    })
    .join('');
  // 赠菜区（本桌付费，赠给别桌）：分割线分开 + 可折叠
  if (gifts.length) {
    const merged = [];
    gifts.forEach((o) =>
      o.r.items.forEach((x) => {
        const ex = merged.find((m) => m.id === x.id && String(m.giftTo) === String(o.r.giftTo));
        if (ex) ex.qty = (ex.qty || 1) + (x.qty || 1);
        else merged.push({ ...x, giftTo: o.r.giftTo });
      })
    );
    const tables = [...new Set(gifts.map((o) => String(o.r.giftTo)))].join('、');
    const gTotal = gifts.reduce((s, o) => s + (parseFloat(o.r.total) || 0), 0);
    html +=
      '<div data-gift="1" style="border-left:2px solid rgba(201,169,110,0.55);padding-left:10px;margin-bottom:12px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;gap:8px;" onclick="toggleGiftRounds(this)">' +
      '<span style="font-size:0.8rem;font-weight:600;color:var(--gold);">🎁 赠给 ' +
      tables +
      ' 号桌 · 本桌付费 ' +
      gTotal.toFixed(2) +
      ' 元</span>' +
      '<span style="display:flex;align-items:center;gap:10px;white-space:nowrap;"><span onclick="event.stopPropagation();showGiftReceipt(\'' +
      esc(String(gifts[0].r.giftTo)) +
      '\')" style="font-size:0.72rem;color:var(--primary-accent);text-decoration:underline;">被赠桌小票</span><span class="gift-toggle-txt" style="font-size:0.72rem;color:var(--text-light);">隐藏</span></span></div>' +
      '<div class="gift-body" style="display:flex;flex-direction:column;margin-top:6px;">' +
      merged
        .map(
          (x) =>
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--cream-dark);border-radius:6px;margin-top:3px;"><span style="font-size:0.85rem;">' +
            esc((function () { var dd = dishData.find(function (d) { return Number(d.id) === Number(x.id); }); return dd ? dishNameOf(dd) : x.name; })()) +
            ' <span style="font-size:0.7rem;color:var(--gold);">→' +
            esc(String(x.giftTo)) +
            '号桌</span></span><span style="font-size:0.8rem;color:var(--text-light);"><strong style="color:var(--text);">×' +
            (x.qty || 1) +
            '</strong> · ' +
            formatPrice(x.price) +
            '</span></div>'
        )
        .join('') +
      '</div></div>';
  }
  return html;
}
// ─── 桌号体系：两位格式（01-99）或「打包」───
function normTableNo(v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = parseInt(s, 10);
  if (n < 1 || n > 99) return null;
  return String(n).padStart(2, '0');
}
function tableLabel(t) {
  if (menuLang === 'en') return t === '打包' ? 'Takeaway' : t ? 'Table ' + t : '';
  return t === '打包' ? '打包带走' : t ? t + ' 号桌' : '';
}
function updateTableStatusCard() {
  const t = ssGet('lockedTable') || '';
  const txt = document.getElementById('table-status-text');
  const btn = document.getElementById('table-change-btn');
  if (txt) txt.textContent = t ? tableLabel(t) : uiText('table_none');
  if (btn) btn.textContent = t ? uiText('table_change') : uiText('table_pick');
  const ti = document.getElementById('cart-table-number');
  if (ti) {
    ti.value = t === '打包' ? '打包' : t || '';
    ti.readOnly = !!t;
    ti.placeholder = t ? '' : '选择桌号';
    ti.style.background = t ? 'var(--cream-dark)' : '';
  }
  const pt = document.getElementById('pref-table-number');
  if (pt) {
    pt.value = t === '打包' ? '打包' : t || '';
    pt.readOnly = !!t;
    pt.placeholder = t ? '' : '选择桌号';
    pt.style.background = t ? 'var(--cream-dark)' : '';
  }
}
var _tablePickIntent = null;
// AI选菜入口的唯一判定源：已声明偏好的老用户进偏好表单微调，新客/未填偏好直达热门Top6（B7冷启动）。
// 首页按钮和"选完桌号后续路由"都走这里——之前选桌分支硬编码跳偏好表单，把冷启动整个绕过（回归修复）。
function openAIRecommend() {
  if (!currentUser) currentUser = 'guest';
  const prefs = currentUser !== 'guest' ? (getUserData(currentUser) || {}).preferences : null;
  const filled = (prefs && Object.keys(prefs).length > 0) || sessionStorage.getItem('tasteFilled') === '1';
  if (filled) showSection('preference-section');
  else coldStartHotRecommend();
}
function openTablePicker(intent) {
  _tablePickIntent = intent || null;
  const grid = document.getElementById('table-grid');
  if (grid && !grid.childElementCount) {
    let html = '';
    for (let i = 1; i <= 30; i++) {
      const t = String(i).padStart(2, '0');
      html +=
        '<button class="btn btn-sm table-grid-btn" data-t="' +
        t +
        '" style="background:transparent;color:var(--text);border:1px solid rgba(201,169,110,0.4);border-radius:8px;padding:6px 0;font-size:0.85rem;">' +
        t +
        '</button>';
    }
    grid.innerHTML = html;
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.table-grid-btn');
      if (b) applyTableChoice(b.dataset.t);
    });
  }
  const inp = document.getElementById('table-input');
  if (inp) inp.value = '';
  const hint = document.getElementById('table-picker-hint');
  if (hint) {
    const boundOid = ssGet('lastOrderId') || '';
    const boundTable = ssGet('lockedTable') || '';
    if (boundOid && boundTable) {
      // F1 收尾(2026-10-16): 有进行中订单时警示——选择将把订单一并改桌,不再静默挪单
      hint.innerHTML = L(
        '⚠ 有进行中订单 <strong>#' + esc(boundOid) + '</strong>（' + esc(tableLabel(boundTable)) + '）——选择其他桌号会把该订单一并改桌',
        '⚠ Open order <strong>#' + esc(boundOid) + '</strong> (' + esc(tableLabel(boundTable)) + ') — picking a new table will MOVE it'
      );
      hint.style.color = '#c0392b';
    } else {
      hint.textContent = '桌号为 1-2 位数字：输入 1 或 01 均指 01 号桌';
      hint.style.color = '';
    }
  }
  const m = document.getElementById('table-picker-modal');
  if (m) {
    m.inert = false;
    m.removeAttribute('aria-hidden');
    bootstrap.Modal.getOrCreateInstance(m).show();
  }
}
function closeTablePicker() {
  const m = document.getElementById('table-picker-modal');
  if (!m) return;
  const inst = bootstrap.Modal.getInstance(m);
  if (inst) {
    try {
      inst.hide();
    } catch (e) {}
  }
  setTimeout(() => {
    if (m.classList.contains('show')) {
      const mm = bootstrap.Modal.getInstance(m);
      if (mm) {
        mm._isTransitioning = false;
        try {
          mm.hide();
        } catch (e) {}
      }
    }
  }, 400);
}
// 选定桌号：有进行中订单→挪桌(PATCH 改订单)；无订单→仅改锁定。订单已完成→清旧状态按新用餐
async function applyTableChoice(t) {
  const cur = ssGet('lockedTable') || '';
  if (t !== cur) {
    const oid = parseInt(ssGet('lastOrderId') || '0');
    if (oid) {
      try {
        const r = await safeFetch('/api/order/' + oid + '/table', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ tableNumber: t, fromTable: cur }),
        });
        const d = await r.json();
        if (!d.success) {
          [
            'lastOrderId',
            'lastOrderTable',
            'lastOrderItems',
            'lastOrderRounds',
            'lastOrderAI',
            'lastOrderStats',
            'sideOrder',
            'orderBackup',
          ].forEach((k) => ssRemove(k));
          ssRemovePrefix('giftReceipt_');
          resetRecommendation();
        }
      } catch (e) {
        showMessage('提示', '网络错误，桌号未更改');
        return;
      }
    }
    ssSet('lockedTable', t);
    ssSet('tableNumber', t);
    ssSet('lastOrderTable', t);
    updateTableStatusCard();
    const et = document.getElementById('end-order-table');
    if (et) et.textContent = t;
    const ei = document.getElementById('settled-order-info');
    if (ei && ei.textContent) ei.textContent = ei.textContent.replace(/桌号 \S+/, '桌号 ' + t);
    showMessage('已设置', t === '打包' ? '已选择「打包带走」' : '桌号已设为 ' + t + ' 号', null, 2000);
  }
  closeTablePicker();
  const intent = _tablePickIntent;
  _tablePickIntent = null;
  if (intent === 'menu') showDataset();
  else if (intent === 'ai') openAIRecommend();
  else if (intent === 'table') {
    prefillTableBuilder();
    showSection('table-builder-section');
  } else if (intent === 'checkout') checkoutCart();
}
// 本桌账单（免登录，凭签名桌码只读查看）
function showTableBill() {
  const t = ssGet('tableToken') || '';
  if (!t) {
    showMessage('提示', '请扫描餐桌上的二维码');
    return;
  }
  const box = document.getElementById('table-bill-body');
  const title = document.getElementById('table-bill-title');
  if (box)
    box.innerHTML =
      '<div class="text-center py-4" style="color:var(--text-light);">' +
      (menuLang === 'en' ? 'Loading...' : '加载中...') +
      '</div>';
  const m = document.getElementById('table-bill-modal');
  if (m) {
    m.inert = false;
    m.removeAttribute('aria-hidden');
    bootstrap.Modal.getOrCreateInstance(m).show();
  }
  safeFetch('/api/table-view?t=' + encodeURIComponent(t))
    .then((r) => r.json())
    .then((d) => {
      if (!box) return;
      if (!d.success) {
        box.innerHTML =
          '<div class="text-center py-4" style="color:var(--text-light);">' + esc(d.error || '读取失败') + '</div>';
        return;
      }
      if (title) title.textContent = d.tableNumber + ' 号桌 · 账单';
      const orders = d.orders || [];
      if (!orders.length) {
        box.innerHTML = '<div class="text-center py-4" style="color:var(--text-light);">本桌暂无订单</div>';
        return;
      }
      let grand = 0;
      box.innerHTML =
        orders
          .map((o) => {
            let sub = 0;
            const rows = (o.items || [])
              .map((x) => {
                const qty = parseInt(x.qty || x.quantity) || 1;
                const p = x.giftFrom ? 0 : parseFloat(x.price) || 0; // 赠菜恒按 0 计（防脏数据误计）
                sub += p * qty;
                if (x.giftFrom) {
                  return (
                    '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--cream-dark);border-radius:6px;margin-top:4px;"><span style="font-size:0.86rem;">🎁 ' +
                    esc((function () { var dd = dishData.find(function (d) { return Number(d.id) === Number(x.id); }); return dd ? dishNameOf(dd) : x.name; })()) +
                    ' <span style="font-size:0.7rem;color:var(--gold);">×' +
                    qty +
                    '（' +
                    esc(String(x.giftFrom)) +
                    '号桌赠）</span></span><span style="font-size:0.86rem;color:var(--text);font-weight:600;">0元 <span style="font-size:0.72rem;color:var(--text-light);font-weight:400;text-decoration:line-through;">原价' +
                    (parseFloat(x.origPrice) || 0) +
                    '元</span></span></div>'
                  );
                }
                return (
                  '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--cream-dark);border-radius:6px;margin-top:4px;"><span style="font-size:0.86rem;">' +
                  esc((function () { var dd = dishData.find(function (d) { return Number(d.id) === Number(x.id); }); return dd ? dishNameOf(dd) : x.name; })()) +
                  ' <span style="font-size:0.72rem;color:var(--text-light);">×' +
                  qty +
                  '</span></span><span style="font-size:0.86rem;color:var(--text-light);">' +
                  (p * qty).toFixed(2) +
                  '元</span></div>'
                );
              })
              .join('');
            const st = o.status === 'completed' ? '✅ 已完成' : o.status === 'confirmed' ? '🔥 已确认' : '📌 待处理';
            grand += sub;
            const tm = o.created_at
              ? new Date(o.created_at).toLocaleString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '';
            return (
              '<div style="border-left:2px solid rgba(201,169,110,0.4);padding-left:10px;margin-bottom:14px;">' +
              '<div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text-light);padding-bottom:4px;"><span>订单 #' +
              esc(String(o.id)) +
              ' · ' +
              esc(tm) +
              '</span><span>' +
              st +
              '</span></div>' +
              rows +
              '<div style="display:flex;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px dashed rgba(201,169,110,0.3);font-size:0.85rem;"><span style="color:var(--text-light);">小计</span><strong style="color:var(--text);">' +
              sub.toFixed(2) +
              '元</strong></div>' +
              '</div>'
            );
          })
          .join('') +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(201,169,110,0.12);border-radius:10px;margin-top:6px;"><span style="font-size:0.9rem;color:var(--text);">合计</span><strong style="color:var(--primary-accent);font-size:1.2rem;">' +
        grand.toFixed(2) +
        ' 元</strong></div>' +
        '<div style="font-size:0.72rem;color:var(--text-light);text-align:center;margin-top:8px;">账单仅供参考，以收银为准</div>';
    })
    .catch(() => {
      if (box) box.innerHTML = '<div class="text-center py-4" style="color:var(--text-light);">网络错误</div>';
    });
}
function toggleGiftRounds(head) {
  const block = head.closest('[data-gift]');
  if (!block) return;
  const body = block.querySelector('.gift-body');
  if (!body) return;
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? 'flex' : 'none';
  const t = head.querySelector('.gift-toggle-txt');
  if (t) t.textContent = hidden ? '隐藏' : '显示';
}
// 被赠桌小票（只读）：赠菜 0 元 + 原价划线，合计不计费
function showGiftReceipt(table) {
  const raw = ssGet('giftReceipt_' + table);
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (e) {}
  const box = document.getElementById('gift-receipt-body');
  const title = document.getElementById('gift-receipt-title');
  if (!data || !box) {
    showMessage('提示', '未找到该桌的小票记录');
    return;
  }
  if (title) title.textContent = data.table + ' 号桌 · 赠菜单';
  box.innerHTML =
    '<div style="font-size:0.78rem;color:var(--text-light);margin-bottom:10px;">订单 #' +
    esc(String(data.id)) +
    ' · 来自 ' +
    (data.from ? esc(String(data.from)) + ' 号桌赠送' : '赠送') +
    '</div>' +
    (data.items || [])
      .map(
        (x) =>
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--cream-dark);border-radius:8px;margin-bottom:6px;">' +
          '<span style="font-size:0.9rem;">🎁 ' +
          esc((function () { var dd = dishData.find(function (d) { return Number(d.id) === Number(x.id); }); return dd ? dishNameOf(dd) : x.name; })()) +
          ' <span style="font-size:0.75rem;color:var(--gold);">×' +
          (x.qty || 1) +
          '</span></span>' +
          '<span style="font-size:0.9rem;color:var(--text);font-weight:600;">0元 <span style="font-size:0.75rem;color:var(--text-light);font-weight:400;text-decoration:line-through;">原价' +
          (parseFloat(x.origPrice) || 0) +
          '元</span></span>' +
          '</div>'
      )
      .join('') +
    '<div style="border-top:1px dashed rgba(201,169,110,0.35);margin:10px 0 0;padding-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:0.9rem;">' +
    '<span style="color:var(--text-light);">合计（赠菜不计费）</span><strong style="color:var(--primary-accent);font-size:1.05rem;">0.00 元</strong></div>';
  const m = document.getElementById('gift-receipt-modal');
  if (m) {
    m.inert = false;
    m.removeAttribute('aria-hidden');
    bootstrap.Modal.getOrCreateInstance(m).show();
  }
}
function showCart() {
  // 每次进入购物车强制隐藏提交过渡层（治本：不管上次结算状态如何都干净）
  const clo0 = document.getElementById('cart-loading');
  if (clo0) clo0.style.display = 'none';
  // 进行中订单提示条/赠菜横幅/回执头文案 → renderCartLangAware(语言感知;applyUiLang 切语言时亦调用)
  window.renderCartLangAware();
  // 桌号展示（选桌后只读，点击可更换/挪桌）
  updateTableStatusCard();
  window._prevScrollY = window.scrollY;
  const cart = getCart();
  const empty = document.getElementById('cart-empty'),
    content = document.getElementById('cart-content');
  const tb = document.getElementById('cart-table-body');
  const ti = document.getElementById('cart-total-items');
  const tp = document.getElementById('cart-total-price');
  // 已结算区（时间线：每轮独立，当前轮高亮）
  const rounds = (() => {
    try {
      return JSON.parse(ssGet('lastOrderRounds') || '[]');
    } catch (e) {
      return [];
    }
  })();
  const sSec = document.getElementById('settled-section'),
    sDiv = document.getElementById('settled-divider');
  if (rounds.length) {
    if (sSec) sSec.style.display = 'block';
    if (sDiv) sDiv.classList.remove('d-none');
    // 回执头文案由 renderCartLangAware 语言感知渲染(此处只管可见性)
    const sl = document.getElementById('settled-list');
    if (sl) sl.innerHTML = renderRoundsHTML(rounds);
  } else {
    if (sSec) sSec.style.display = 'none';
    if (sDiv) sDiv.classList.add('d-none');
  }
  if (!cart.length) {
    if (empty) empty.style.display = 'block';
    if (content) content.style.display = 'none';
    if (tb) tb.innerHTML = '';
  } else {
    if (empty) empty.style.display = 'none';
    if (content) content.style.display = 'block';
    if (tb)
      tb.innerHTML = cart
        .map((x) => {
          const dish = dishData.find((d) => d.id === x.id);
          const qtyVal = x.qty || 1;
          // 回退分支=菜品已从菜单删除,快照名(x.name)是唯一真相,勿改查表(同 id 必查不到,且会踩掉回归-BUG3 内容断言)
          const name = dish ? esc(dishNameOf(dish)) : esc(x.name);
          const unit =
            dish && dish.price_unit
              ? '<span style="font-size:0.75rem;color:var(--text-light);margin-left:4px;">' +
                esc(menuLang === 'en' ? UNIT_EN[dish.price_unit] || dish.price_unit : dish.price_unit) +
                '</span>'
              : '';
          const price = parseFloat(x.price) || 0;
          const subtotal = price * qtyVal;
          return (
            '<tr><td>' +
            (dish && dish.image_url
              ? dish.image_url.startsWith('/') || dish.image_url.startsWith('http')
                ? '<img src="' +
                  esc(dish.image_url || '') +
                  '" alt="' +
                  esc(dish.name || '菜品') +
                  '" loading="lazy" style="width:80px;height:80px;border-radius:8px;object-fit:cover;margin-right:8px;vertical-align:middle;" onerror="this.style.display=\'none\'">'
                : '<span class="dish-emoji" style="font-size:2rem;margin-right:8px;vertical-align:middle;">' +
                  esc(dish.image_url) +
                  '</span>'
              : '') +
            name +
            unit +
            '<div style="margin-top:4px;"><input class="form-control form-control-sm cart-note-input" data-id="' +
            esc(String(x.id)) +
            '" value="' +
            esc(x.note || '') +
            '" maxlength="30" placeholder="备注：少辣/不要香菜…" style="font-size:0.75rem;padding:2px 6px;border:1px solid #e4dbcf;border-radius:6px;width:100%;max-width:220px;box-sizing:border-box;" aria-label="菜品备注"></div></td>' +
            '<td><div class="input-group input-group-sm" style="width:110px;height:30px;align-items:stretch;"><button class="btn btn-outline-secondary cart-qty-minus" data-id="' +
            esc(String(x.id)) +
            '" style="padding:0 8px;height:30px;font-size:0.9rem;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:6px 0 0 6px;line-height:1;">−</button>' +
            '<input type="text" class="form-control text-center cart-qty-input" data-id="' +
            esc(String(x.id)) +
            '" value="' +
            esc(String(qtyVal)) +
            '" style="width:38px;height:30px;font-size:0.82rem;font-weight:600;padding:0;border-radius:0;border-left:1px solid #dee2e6;border-right:1px solid #dee2e6;text-align:center;display:flex;align-items:center;justify-content:center;">' +
            '<button class="btn btn-outline-secondary cart-qty-plus" data-id="' +
            esc(String(x.id)) +
            '" style="padding:0 8px;height:30px;font-size:0.9rem;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:0 6px 6px 0;line-height:1;">+</button></div></td>' +
            '<td>' +
            price.toFixed(2) +
            '</td><td style="color:#c0392b;font-weight:600;">' +
            subtotal.toFixed(2) +
            '</td>' +
            '<td><button class="btn btn-sm btn-outline-danger cart-remove-btn" data-id="' +
            esc(String(x.id)) +
            '" style="padding:2px 6px;font-size:0.7rem;"><i class="bi bi-x"></i></button></td></tr>'
          );
        })
        .join('');
    if (ti) ti.textContent = getCartCount();
    if (tp) tp.textContent = getCartTotal().toFixed(2);
    // 底栏合计标签(共N件/合计:X元)语言感知
    if (ti && ti.parentElement) {
      var nodes = ti.parentElement.childNodes;
      if (nodes[0]) nodes[0].textContent = L('共 ', '');
      if (nodes[nodes.length - 1]) nodes[nodes.length - 1].textContent = L(' 件', ' items');
    }
    if (tp && tp.parentElement) {
      var nodes2 = tp.parentElement.childNodes;
      if (nodes2[0]) nodes2[0].textContent = L('合计：', 'Total: ');
      if (nodes2[nodes2.length - 1]) nodes2[nodes2.length - 1].textContent = L(' 元', '');
    }
  }
  showSection('cart-section');
}
function rebuildEndView() {
  const rounds = (() => {
    try {
      return JSON.parse(ssGet('lastOrderRounds') || '[]');
    } catch (e) {
      return [];
    }
  })();
  if (!rounds.length) {
    showMessage('提示', '当前没有进行中的订单');
    return;
  }
  const allItems = [];
  rounds.forEach((r) =>
    r.items.forEach((x) => {
      const ex = allItems.find((m) => m.id === x.id);
      if (ex) ex.qty = (ex.qty || 1) + (x.qty || 1);
      else allItems.push({ ...x });
    })
  );
  const cnt = allItems.reduce((s, x) => s + (x.qty || 1), 0);
  const tot = Math.round(allItems.reduce((s, x) => s + (parseFloat(x.price) || 0) * (x.qty || 1), 0) * 100) / 100;
  const ec = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  ec('end-order-id', ssGet('lastOrderId') || '-');
  ec('end-order-table', ssGet('lastOrderTable') || '-');
  ec('end-cart-count', cnt);
  ec('end-cart-total', tot);
  const tip = document.getElementById('end-order-tip');
  if (tip) tip.textContent = rounds.length > 1 ? '· 加菜已追加' : '· 下单成功';
  const esl = document.getElementById('end-settled-list');
  if (esl) esl.innerHTML = renderRoundsHTML(rounds);
  const ediv = document.getElementById('end-add-divider');
  if (ediv) ediv.classList.add('d-none');
  const cl = document.getElementById('end-cart-list');
  if (cl) cl.innerHTML = '';
  // AI 属性读持久化状态（结算后推荐内存已归零，回看不能变「AI未启用」）
  const isAI = ssGet('lastOrderAI') === '1';
  document.querySelectorAll('#end-section .ai-stat').forEach((el) => (el.style.display = isAI ? '' : 'none'));
  const noAI3 = document.getElementById('end-no-ai');
  if (noAI3) noAI3.style.display = isAI ? 'none' : 'block';
  if (isAI) {
    const st = (() => {
      try {
        return JSON.parse(ssGet('lastOrderStats') || '{}');
      } catch (e) {
        return {};
      }
    })();
    const es3 = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    es3('end-dish-count', st.count ?? '-');
    es3('end-avg-match', (st.avg ?? '-') + '%');
    es3('end-top-match', (st.top ?? '-') + '%');
  }
  if (isAI) {
    setTimeout(() => {
      displayModelMetrics();
      displayFeatureImportance();
    }, 150);
  }
  showSection('end-section');
}

async function checkoutCart() {
  const cart = getCart(),
    bEl = document.getElementById('cart-checkout-btn');
  if (!cart.length) {
    showMessage('提示', '购物车是空的');
    return;
  }
  // 备注兜底：以结算时刻输入框的实际值为准——备注平时靠 change(失焦)事件保存，
  // 自动填充/部分移动键盘收起不触发 blur 会静默丢备注，结算前从 DOM 收口一次
  document.querySelectorAll('.cart-note-input').forEach((inp) => {
    const it = cart.find((c) => c.id === parseInt(inp.dataset.id));
    if (it)
      it.note = String(inp.value || '')
        .trim()
        .slice(0, 30);
  });
  saveCart(cart);
  // 起售数量闸门：任何菜品低于最小起售量（X个起）则拦截结算——最终防线，兜住所有漏网路径
  const violations = [];
  cart.forEach((x) => {
    const dish = dishData.find((d) => d.id === x.id);
    const min = minQtyOf(dish || {});
    if (min > 1 && (x.qty || 1) < min)
      violations.push((x.name || '菜品') + ' 需' + min + '个起售（当前' + (x.qty || 1) + '个）');
  });
  if (violations.length) {
    showMessage('起售数量不足', violations.join('；') + '，请调整数量后结算', null, 5000);
    return;
  }
  if (bEl) bEl.disabled = true;
  // 桌号：恒用锁定桌号（选桌后即锁定，改桌请用「更换/挪桌」）
  const tableNumber = ssGet('lockedTable') || '';
  if (!tableNumber) {
    if (bEl) bEl.disabled = false;
    openTablePicker('checkout');
    return;
  }
  if (tableNumber !== '打包' && !/^\d{2}$/.test(tableNumber)) {
    showMessage('桌号格式不对', '请重新选择桌号');
    if (bEl) bEl.disabled = false;
    return;
  }
  // 判断是否加菜（同桌已有进行中订单 → 追加，否则新建）
  let lastOrderId = parseInt(ssGet('lastOrderId') || '0');
  let lastOrderTable = ssGet('lastOrderTable') || '';
  let isAddMore = lastOrderId > 0 && lastOrderTable === tableNumber;
  // 赠菜双向记账：给别桌加菜时，被赠桌记 0 元（标原价+赠出桌），赠出桌正常计费（标赠给桌）
  const isSideOrder = ssGet('sideOrder') === '1';
  let myTableForGift = '';
  if (isSideOrder) {
    try {
      myTableForGift = JSON.parse(ssGet('orderBackup') || '{}').lastOrderTable || '';
    } catch (e) {}
  }
  const payItems = cart.map((x) => {
    const dish = dishData.find((d) => d.id === x.id);
    const p = parseFloat(x.price) || 0;
    return {
      id: x.id,
      name: x.name,
      price: p,
      type: '购物车',
      matchRate: 0.5,
      qty: x.qty || 1,
      note: String(x.note || '')
        .trim()
        .slice(0, 30),
    };
  });
  const items = isSideOrder
    ? payItems.map((i) => ({ ...i, price: 0, origPrice: i.price, giftFrom: myTableForGift }))
    : payItems;
  const total = items.reduce((s, i) => s + i.price * (i.qty || 1), 0);
  const payTotal = payItems.reduce((s, i) => s + i.price * (i.qty || 1), 0);
  const uid = currentUser || 'guest';
  const url = isAddMore ? '/api/order/' + lastOrderId + '/add' : '/api/order';
  // 点击后立即显示过渡动画（独立覆盖层，不破坏购物车 DOM 结构）
  const clo = document.getElementById('cart-loading');
  if (clo) clo.style.display = 'flex';
  safeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ userId: uid, items, totalPrice: total, tableNumber }),
  })
    .then((r) => r.json())
    .then((d) => {
      if (!d.success) {
        // F3: 加菜时订单已完结(完成/取消)或会话与订单失同步(404) → 清绑定并自动降级新建重试一次
        // 幂等闸在(同内容合并)+服务端重算价格,不会重复下单;重试仍失败才报错
        const staleErr =
          (d.error || '').indexOf('不能加菜') >= 0 ||
          (isAddMore && (d.error || '').indexOf('订单不存在或无权操作') >= 0);
        if (isAddMore && staleErr) {
          ['lastOrderId', 'lastOrderTable', 'lastOrderItems', 'lastOrderRounds', 'lockedTable', 'lastOrderAI', 'lastOrderStats', 'tableNumber'].forEach(function (k) {
            ssRemove(k);
          });
          return safeFetch('/api/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ userId: uid, items, totalPrice: total, tableNumber }),
          })
            .then((r2) => r2.json())
            .then((d2) => {
              if (!d2.success) {
                showMessage(L('下单失败', 'Order failed'), d2.error || L('服务器错误', 'Server error'));
                showCart();
                return;
              }
              if (d2.orderId) {
                ssSet('lastOrderId', d2.orderId);
                ssSet('lastOrderTable', tableNumber);
                ssSet('lockedTable', tableNumber);
              }
              if (clo) clo.style.display = 'none';
              showMessage(L('上一单已结束', 'Previous order closed'), L('已为你新建订单 #' + (d2.orderId || ''), 'Created new order #' + (d2.orderId || '')), null, 3500);
              clearCart();
              rebuildEndView();
            })
            .catch(() => {
              showMessage(L('下单失败', 'Order failed'), L('网络错误，请重试', 'Network error, please retry'));
              showCart();
            });
        }
        showMessage(L(isAddMore ? '加菜失败' : '下单失败', isAddMore ? 'Add-on failed' : 'Order failed'), d.error || L('服务器错误', 'Server error'));
        showCart();
        return;
      }
      // 给别桌加菜：该桌订单提交成功 → 赠菜追加到本桌订单（本桌付钱）+ 恢复本桌状态
      if (ssGet('sideOrder') === '1') {
        const backup = (() => {
          try {
            return JSON.parse(ssGet('orderBackup') || 'null');
          } catch (e) {
            return null;
          }
        })();
        ssRemove('sideOrder');
        ssRemove('orderBackup');
        if (backup && backup.lastOrderId) {
          const finishSide = () => {
            ssSet('lastOrderId', backup.lastOrderId);
            ssSet('lastOrderTable', backup.lastOrderTable);
            ssSet('lastOrderItems', backup.lastOrderItems);
            ssSet('lastOrderRounds', backup.lastOrderRounds);
            ssSet('lastOrderAI', backup.lastOrderAI);
            ssSet('lastOrderStats', backup.lastOrderStats);
            ssSet('lockedTable', backup.lockedTable);
            const clo0 = document.getElementById('cart-loading');
            if (clo0) clo0.style.display = 'none';
            clearCart();
            rebuildEndView();
            showMessage(
              '已提交',
              '已为 ' +
                tableNumber +
                ' 号桌赠菜 ' +
                payItems.length +
                ' 道（订单 #' +
                d.orderId +
                '），费用计入本桌，已返回您的订单',
              null,
              3500
            );
          };
          // 本桌时间线记录赠菜轮次
          const giftPayItems = payItems.map((x) => ({ ...x, giftTo: tableNumber }));
          let rounds = [];
          try {
            rounds = JSON.parse(backup.lastOrderRounds || '[]');
          } catch (e) {}
          const nD = new Date(),
            tm = String(nD.getHours()).padStart(2, '0') + ':' + String(nD.getMinutes()).padStart(2, '0');
          rounds.push({
            round: rounds.length + 1,
            label: '赠给 ' + tableNumber + ' 号桌',
            time: tm,
            items: giftPayItems,
            total: Math.round(payTotal * 100) / 100,
            giftTo: tableNumber,
          });
          backup.lastOrderRounds = JSON.stringify(rounds);
          // 保存被赠桌小票（本地只读视图：0元+原价）
          ssSet(
            'giftReceipt_' + tableNumber,
            JSON.stringify({ id: d.orderId, table: tableNumber, from: myTableForGift, items: items })
          );
          // 追加到本桌订单（本桌计费，标记 giftTo）——必须带 tableNumber:游客无登录态,桌号即归属凭证,缺失会被 /add 的归属校验 404 且被静默吞掉
          safeFetch('/api/order/' + backup.lastOrderId + '/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ items: giftPayItems, tableNumber: backup.lastOrderTable }),
          })
            .then((d2) => {
              if (!d2.success) showMessage('提示', '赠菜已下单，但计入本桌账单失败，请告知服务员', null, 4000);
            })
            .catch(() => {
              showMessage('提示', '赠菜已下单，但计入本桌账单失败，请告知服务员', null, 4000);
            })
            .finally(finishSide);
          return;
        }
      }
      // 新订单（首单/换桌）不继承上一单的时间线轮次
      if (!isAddMore) {
        ssRemove('lastOrderRounds');
        ssRemove('lastOrderItems');
      }
      let ordered = [];
      try {
        ordered = JSON.parse(localStorage.getItem('orderedDishes') || '[]');
      } catch (e) {}
      cart.forEach((x) => {
        if (!ordered.includes(x.id)) ordered.push(x.id);
      });
      try {
        localStorage.setItem('orderedDishes', JSON.stringify(ordered));
      } catch (e) {}
      ssSet('lastOrderId', d.orderId);
      ssSet('lastOrderTable', tableNumber);
      ssSet('lockedTable', tableNumber);
      // 记录本轮（时间线轮次）
      const rounds = (() => {
        try {
          return JSON.parse(ssGet('lastOrderRounds') || '[]');
        } catch (e) {
          return [];
        }
      })();
      const now = new Date(),
        time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      rounds.push({
        round: rounds.length + 1,
        label: rounds.length === 0 ? '第1轮点餐' : '第' + (rounds.length + 1) + '轮加菜',
        time,
        items: cart.map((x) => ({ ...x })),
        total,
      });
      try {
        ssSet('lastOrderRounds', JSON.stringify(rounds));
      } catch (e) {}
      const allItems = [];
      rounds.forEach((r) =>
        r.items.forEach((x) => {
          const ex = allItems.find((m) => m.id === x.id);
          if (ex) ex.qty = (ex.qty || 1) + (x.qty || 1);
          else allItems.push({ ...x });
        })
      );
      const orderCount = allItems.reduce((s, x) => s + (x.qty || 1), 0);
      const orderTotal = allItems.reduce((s, x) => s + (parseFloat(x.price) || 0) * (x.qty || 1), 0);
      const ec = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.textContent = v;
      };
      ec('end-order-id', d.orderId);
      ec('end-order-table', tableNumber);
      ec('end-cart-count', orderCount);
      ec('end-cart-total', Math.round(orderTotal * 100) / 100);
      const tip = document.getElementById('end-order-tip');
      if (tip) tip.textContent = rounds.length > 1 ? '· 加菜已追加' : '· 下单成功';
      const esl = document.getElementById('end-settled-list');
      if (esl) esl.innerHTML = renderRoundsHTML(rounds);
      const ediv = document.getElementById('end-add-divider');
      if (ediv) ediv.classList.add('d-none');
      const cl = document.getElementById('end-cart-list');
      if (cl) cl.innerHTML = '';
      const isAI = currentRecommendations && currentRecommendations.length > 0;
      document.querySelectorAll('#end-section .ai-stat').forEach((el) => (el.style.display = isAI ? '' : 'none'));
      const noAI2 = document.getElementById('end-no-ai');
      if (noAI2) noAI2.style.display = isAI ? 'none' : 'block';
      // AI 模式：填充推荐统计（推荐菜品数/平均匹配度/最高匹配度）
      if (isAI) {
        const cnt = currentRecommendations.length;
        const rates = currentRecommendations.filter((d) => d.type !== '盲盒尝鲜').map((d) => d.matchRate || 0);
        const avg = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) : 0;
        const top = rates.length ? Math.round(Math.max(...rates) * 100) : 0;
        const es = (id, v) => {
          const el = document.getElementById(id);
          if (el) el.textContent = v;
        };
        es('end-dish-count', cnt);
        es('end-avg-match', avg + '%');
        es('end-top-match', top + '%');
        // AI 属性与统计持久化（rebuildEndView 回看/刷新后保持一致）
        ssSet('lastOrderAI', '1');
        ssSet('lastOrderStats', JSON.stringify({ count: cnt, avg, top }));
      } else {
        ssSet('lastOrderAI', '0');
        ssRemove('lastOrderStats');
      }
      clearCart();
      // 结算完成，推荐状态归零（避免残留 recommendedIds/推荐统计影响后续菜单加购的结算与重新推荐）
      resetRecommendation();
      setTimeout(() => {
        const clo2 = document.getElementById('cart-loading');
        if (clo2) clo2.style.display = 'none';
        showSection('end-section');
        if (isAI) {
          setTimeout(() => {
            displayModelMetrics();
            displayFeatureImportance();
          }, 150);
        }
      }, 800);
    })
    .catch(() => {
      showMessage(isAddMore ? '加菜失败' : '下单失败', '网络错误，请稍后重试');
      showCart();
    })
    .finally(() => {
      const b = document.getElementById('cart-checkout-btn');
      if (b) b.disabled = false;
    });
}

// 桌号同步: 偏好页输入 → localStorage → 购物车自动填
function syncTableNumber(from) {
  const val = from?.value?.trim() || '';
  if (val) ssSet('tableNumber', val);
  const cart = document.getElementById('cart-table-number');
  if (cart && val) cart.value = val;
}
