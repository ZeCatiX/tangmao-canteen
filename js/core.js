// 核心功能模块
async function loadDecisionTreeModel() {
  if (decisionTreeLoaded || decisionTreeLoading) {
    return decisionTreeLoaded;
  }
  decisionTreeLoading = true;
  try {
    const r = await fetch('decision_tree_model.json', { cache: 'no-cache' });
    if (!r.ok) {
      throw Error('加载失败');
    }
    decisionTreeModel = await r.json();
    decisionTreeLoaded = true;
    decisionTreeLoading = false;
    return true;
  } catch (e) {
    console.error('[决策树]加载失败:', e);
    decisionTreeLoading = false;
    return false;
  }
}

// ═══════════════ 决策树预测 ═══════════════
function predictWithDecisionTree(prefs, dish) {
  const actual = parseFloat(dish.rating);
  if (!decisionTreeModel || !decisionTreeLoaded) {
    return !isNaN(actual) && actual > 0 ? actual : 3.5;
  }
  try {
    const f = encodeDishFeaturesForTree(dish);
    const ts = Math.max(0, Math.min(5, predictTreeNode(decisionTreeModel.nodes, f)));
    if (!isNaN(actual) && actual > 0) {
      return Math.round((actual * 0.4 + ts * 0.6) * 100) / 100;
    }
    return ts;
  } catch (e) {
    return !isNaN(actual) && actual > 0 ? actual : 3.5;
  }
}

function encodeDishFeaturesForTree(dish) {
  const m = decisionTreeModel,
    f = [];
  const rel = dish.religion || '无特殊要求';
  const cats = m.oheCategories['饮食_宗教'] || ['清真', '素食'];
  for (let i = 1; i < cats.length; i++) {
    f.push(rel === cats[i] ? 1 : 0);
  }
  const o = m.ordMappings;
  f.push(o['辣度'][dish.spiciness] || 0);
  f.push(o['咸淡'][dish.saltiness] || 0);
  f.push(o['甜酸'][dish.sweetness] || 0);
  f.push(1);
  f.push(1);
  f.push(o['营养_蔬菜'][dish.vegetable] || 1);
  f.push(1);
  const cal = extractNumber(dish.calorie),
    pro = extractNumber(dish.protein),
    pri = extractNumber(dish.price);
  f.push((cal - m.scalerMean[0]) / m.scalerScale[0]);
  f.push((pro - m.scalerMean[1]) / m.scalerScale[1]);
  f.push((pri - m.scalerMean[2]) / m.scalerScale[2]);
  f.push(pro / (cal + 1));
  f.push(pri / (cal + 1));
  f.push(pro / (pri + 1));
  f.push(dish.allergies?.seafood ? 1 : 0);
  f.push(dish.allergies?.peanut ? 1 : 0);
  f.push(0);
  f.push(0);
  f.push(0);
  return f;
}

function extractNumber(v) {
  if (typeof v === 'number') {
    return v;
  }
  if (typeof v === 'string') {
    const m = v.match(/[\d.]+/);
    return m ? parseFloat(m[0]) : 0;
  }
  return 0;
}
function predictTreeNode(nodes, f) {
  let id = 0;
  while (true) {
    const n = nodes[id];
    if (n.is_leaf) {
      return n.value;
    }
    if (f[n.feature] <= n.threshold) {
      id = n.children_left;
    } else {
      id = n.children_right;
    }
  }
}

// ═══════════════ API 可用性检查 ═══════════════
function checkApiAvailability(onWaiting) {
  if (window.location.protocol === 'file:') {
    return Promise.resolve(false);
  }
  const now = Date.now(),
    ca = now - apiCacheTimestamp;
  if (apiAvailabilityCache === true && ca < API_CACHE_DURATION) {
    return Promise.resolve(true);
  }
  if (apiAvailabilityCache === false && ca < 5000) {
    return Promise.resolve(false);
  }
  return new Promise((r) => {
    // 8s：公网隧道往返实测 5s+（本地毫秒级），3s 会把健康的 ML 误判为不可用而强制降级
    const c = new AbortController(),
      t = setTimeout(() => c.abort(), 8000);
    const probe = () =>
      safeFetch('/api/worker-health', { signal: c.signal, headers: { 'Cache-Control': 'no-cache' } })
        .then((res) => res.json())
        .then((d) => !!(d && d.ready));
    // 轮询等待 ML 就绪(最多 8s):刚打开页面/服务重启后 worker 加载模型需数秒,
    // ready:false 时立即降级本地会让"第一次点AI推荐"永远回退本地计算(2026-10-27 修复)
    const attempt = (left) => {
      probe()
        .then((ready) => {
          if (!ready && left > 0 && typeof onWaiting === 'function') {
            try { onWaiting(); } catch (e) { /* UI 提示失败不影响判定 */ }
          }
          if (ready || left <= 0) {
            apiAvailabilityCache = ready;
            apiCacheTimestamp = Date.now();
            if (!ready) {
              console.warn('[推荐] ML未就绪(worker加载中), 本次使用本地推荐');
            }
            r(ready);
          } else {
            setTimeout(() => attempt(left - 600), 600);
          }
        })
        .catch(() => {
          // 网络级失败(非未就绪)不重试,直接判不可用
          apiAvailabilityCache = false;
          apiCacheTimestamp = Date.now();
          r(false);
        });
    };
    attempt(8000);
  });
}

// ═══════════════ 本地用户数据管理 ═══════════════
function loadUsers() {
  try {
    const d = localStorage.getItem('users');
    return d ? JSON.parse(d) : [];
  } catch (e) {
    return [];
  }
}
function saveUsers(u) {
  try {
    localStorage.setItem('users', JSON.stringify(u));
  } catch (e) {}
}
function getUserData(n) {
  return loadUsers().find((u) => u.username === n);
}
function updateUserData(n, d) {
  const u = loadUsers();
  const i = u.findIndex((x) => x.username === n);
  if (i === -1) {
    return false;
  }
  u[i] = { ...u[i], ...d };
  saveUsers(u);
  return true;
}
function removeUser(n) {
  saveUsers(loadUsers().filter((u) => u.username !== n));
}

// ═══════════════ 菜品匹配计算 ═══════════════
const SPICE_ORDER = { 不辣: 0, 微辣: 1, 中辣: 2, 重辣: 3 };
const SALT_ORDER = { 清淡: 0, 适中: 1, 偏咸: 2 };
const CAL_ORDER = { 低: 0, 中: 1, 高: 2 };
// 辣度: 超出承受-2重罚; 精确+2; 差1级+1; 差2级+0
function gradeScore(order, u, d) {
  const ui = order[u],
    di = order[d];
  if (ui === undefined || di === undefined) {
    return 0;
  }
  if (di > ui) {
    return -2;
  }
  const diff = ui - di;
  return diff === 0 ? 2 : diff === 1 ? 1 : -1;
}
// 咸淡/热量: 无超出概念, 精确+2; 差1级+1; 差2级以上-1(2026-09-17:不匹配应有代价)
function gradeScoreSoft(order, u, d) {
  const ui = order[u],
    di = order[d];
  if (ui === undefined || di === undefined) {
    return 0;
  }
  const diff = Math.abs(ui - di);
  return diff === 0 ? 3 : diff === 1 ? 1 : -2;
} // 2026-09-19: exact +2→+3 适量加权咸淡/热量(收窄上线前权重差距);off-by-1 0→+1 对齐训练compute_score(修原train/serve偏差)
function computeDishMatch(prefs, dish) {
  const md = { taste: 0, cuisine: 0, calorie: 0, rating: 0, price: 0 };
  if (prefs['辣度'] !== '无') {
    md.taste += gradeScore(SPICE_ORDER, prefs['辣度'], dish.spiciness);
  } else {
    md.taste += 2;
  }
  if (prefs['咸淡'] !== '无') {
    md.taste += gradeScoreSoft(SALT_ORDER, prefs['咸淡'], dish.saltiness);
  } else {
    md.taste += 2;
  }
  if (prefs['甜酸'] !== '无') {
    if (dish.sweetness === prefs['甜酸']) {
      md.taste += 2;
    } else {
      md.taste -= 1;
    }
  } else {
    md.taste += 2;
  }
  if (dish.tags && dish.tags.includes('招牌')) {
    md.cuisine += 1.0;
  } // 原 1.5：会压过明确的口味偏好（差一级的匹配 +1 也盖不过），降到 1.0 让精确匹配能赢
  if (prefs['calorie'] !== '无') {
    md.calorie = gradeScoreSoft(CAL_ORDER, prefs['calorie'], dish.calorie);
  } else {
    md.calorie = 1;
  }
  // 价格软打分: 区间内+2, 邻近-1, 区间外-2; 无偏好+1
  const p = parseFloat(dish.price);
  if (!isNaN(p) && prefs['价格区间'] !== '无' && prefs['价格区间'] !== '不限') {
    if (prefs['价格区间'] === '经济') {
      md.price = p < 20 ? 2 : p < 30 ? -1 : -2;
    } else if (prefs['价格区间'] === '适中') {
      md.price = p >= 20 && p <= 50 ? 2 : p < 20 || p > 50 ? -1 : 0;
    } else if (prefs['价格区间'] === '品质') {
      md.price = p > 50 ? 2 : p > 40 ? -1 : -2;
    }
  } else {
    md.price = 1;
  }
  const s = parseFloat(dish.rating);
  md.rating = !isNaN(s) ? Math.round((s / 5) * 2.5 * 10) / 10 : 2.0;
  const total = md.taste + md.cuisine + md.calorie + md.price + md.rating;
  return { matchDetails: md, totalMatch: Math.round(total * 10) / 10, matchRate: total / 15 }; // 2026-09-19: /14→/15 配合咸淡/热量 exact +3,保持 matchRate 上限
}

function generateDishReason(prefs, dish) {
  const p = [];
  const en = menuLang === 'en';
  const keyMap = { 辣度: 'spiciness', 咸淡: 'saltiness', 甜酸: 'sweetness' };
  const keyEn = { 辣度: 'Spice', 咸淡: 'Salt', 甜酸: 'Sweet-sour' };
  const valEn = { 辣度: SPICE_EN, 咸淡: SALT_EN, 甜酸: SWEET_EN };
  const prefEn = function (k, v) {
    if (v === '无') {
      return 'any';
    }
    return (valEn[k] && valEn[k][v]) || v;
  };
  ['辣度', '咸淡', '甜酸'].forEach((k) => {
    const declared = prefs[k] !== undefined && prefs[k] !== null && prefs[k] !== '无';
    const match = dish[keyMap[k]] === prefs[k];
    if (en) {
      // 无声明偏好=什么都合(✓),只有真声明了才允许 ✗——上轮误把 any 也打 ✗,语义反了
      if (!declared) {
        p.push(keyEn[k] + ': ' + prefEn(k, dish[keyMap[k]]) + ' ✓');
      } else {
        p.push(
          keyEn[k] + ': ' + prefEn(k, dish[keyMap[k]]) + (match ? ' ✓' : ' ✗ (you prefer ' + prefEn(k, prefs[k]) + ')')
        );
      }
    } else if (prefs[k] !== '无') {
      p.push(k + '：' + dish[keyMap[k]] + (match ? ' ✓' : ' ✗') + (match ? '' : '偏好' + prefs[k]));
    } else {
      p.push(k + '：' + dish[keyMap[k]] + ' ✓');
    }
  });
  if (dish.tags && dish.tags.includes('招牌')) {
    p.push(en ? '⭐ House signature' : '⭐ 本店招牌');
  }
  if (dish.tags && dish.tags.includes('中辣')) {
    p.push(en ? '🌶️ Medium spice' : '🌶️ 中辣');
  }
  if (dish.tags && dish.tags.includes('重辣')) {
    p.push(en ? '🌶️🌶️ Hot' : '🌶️🌶️ 重辣');
  }
  const pr = parseFloat(dish.price);
  if (!isNaN(pr)) {
    if (pr < 30) {
      p.push(en ? '💰 Great value' : '💰 经济实惠');
    } else if (pr < 60) {
      p.push(en ? '💰 Mid-range' : '💰 价格适中');
    } else {
      p.push(en ? '💰 Premium pick' : '💰 品质之选');
    }
  }
  const r = parseFloat(dish.rating);
  if (!isNaN(r) && r >= 4.5) {
    p.push(en ? '⭐ High rating (' + r.toFixed(1) + ')' : '⭐ 高分推荐(' + r.toFixed(1) + '分)');
  }
  return en ? 'Why this dish: ' + p.join(' | ') : '推荐理由：' + p.join(' | ');
}

function selectBlindBoxDish(prefs, top, blk, isRefresh) {
  // 2026-10-28 确定性(负责人拍板): 同偏好应给同样的推荐, 随机性只留给"换一批"主动触发;
  // isRefresh=false 时各分支取确定性候选(加权最高/首个), 顾客重复进入结果稳定不显随机
  const topIds = new Set(top.map((d) => d.id));
  const a = prefs['allergies'] || [],
    r = prefs['饮食_宗教'];
  const eligible = dishData.filter(
    (d) =>
      !topIds.has(d.id) &&
      !recommendedIds.includes(d.id) &&
      !(blk && blk.includes(d.id)) &&
      !(r === '清真' && !d.isHalal) &&
      !(r === '素食' && !d.isVegetarian) &&
      !(a.includes('海鲜') && d.allergies?.seafood) &&
      !(a.includes('花生') && d.allergies?.peanut) &&
      !(a.includes('鸡蛋') && d.allergies?.egg) &&
      !(a.includes('大豆') && d.allergies?.soy) &&
      !(a.includes('麸质') && d.allergies?.gluten) &&
      d.category !== '飲品与酒水' &&
      d.category !== '主食'
  );
  if (!eligible.length) {
    return null;
  }
  // 纯随机模式: 仅换一批时随机, 正常获取取首个(确定性)
  if (prefs['blindBoxMode'] === 'random') {
    const d = isRefresh ? eligible[Math.floor(Math.random() * eligible.length)] : eligible[0];
    return {
      ...d,
      reason: L('🔮 盲盒推荐：纯随机惊喜，试试这个吧！', '🔮 Blind box: pure random surprise — give it a try!'),
      type: '盲盒尝鲜',
      blindMode: 'random',
      matchIndex: 0,
      matchRate: 0.5,
    };
  }
  // 智能选模式：按偏好加权
  const keyMap = { 辣度: 'spiciness', 咸淡: 'saltiness', 甜酸: 'sweetness' };
  const weighted = eligible.map((d) => {
    let score = 1;
    ['辣度', '咸淡', '甜酸'].forEach((k) => {
      if (prefs[k] && prefs[k] !== '无' && d[keyMap[k]] === prefs[k]) {
        score += 3;
      }
    });
    if (d.tags && d.tags.includes('招牌')) {
      score += 2;
    }
    if (d.rating) {
      const r = parseFloat(d.rating);
      if (!isNaN(r) && r >= 4.5) {
        score += 2;
      }
    }
    return { d, score };
  });
  // 按权重选择: 换一批时加权随机; 正常获取确定性取最高权重(同分取先出现)
  const totalScore = weighted.reduce((s, w) => s + w.score, 0);
  if (!isRefresh) {
    const bestW = weighted.reduce((a, b) => (b.score > a.score ? b : a));
    const d = bestW.d;
    const m = computeDishMatch(prefs, d);
    return {
      ...d,
      reason: L(
        '🔮 盲盒推荐：试试这个吧，说不定有惊喜！',
        '🔮 Blind box: try this one — you might be in for a surprise!'
      ),
      type: '盲盒尝鲜',
      blindMode: 'smart',
      matchIndex: Math.round(m.matchRate * 100) / 100,
      matchRate: m.matchRate,
      matchDetails: m.matchDetails,
    };
  }
  // 保底
  const d = isRefresh ? eligible[Math.floor(Math.random() * eligible.length)] : eligible[0];
  const m = computeDishMatch(prefs, d);
  return {
    ...d,
    reason: L(
      '🔮 盲盒推荐：试试这个吧，说不定有惊喜！',
      '🔮 Blind box: try this one — you might be in for a surprise!'
    ),
    type: '盲盒尝鲜',
    blindMode: 'smart',
    matchIndex: Math.round(m.matchRate * 100) / 100,
    matchRate: m.matchRate,
    matchDetails: m.matchDetails,
  };
}

function updateUserNavbar() {
  const pi = document.getElementById('nav-profile-item'),
    nu = document.getElementById('nav-user');
  const lb = document.getElementById('logout-btn'),
    vb = document.getElementById('view-profile-btn');
  const cb = document.getElementById('continue-btn');
  if (!pi || !nu) {
    return;
  }
  if (currentUser && currentUser !== 'guest') {
    pi.classList.remove('d-none');
    nu.classList.add('d-none');
    if (lb) {
      lb.textContent = '退出登录';
    }
    if (vb) {
      vb.classList.remove('d-none');
    }
    // 有保存的偏好则显示"继续上次推荐"
    const u = getUserData(currentUser);
    if (cb && u && u.preferences && u.preferences.spiciness) {
      cb.classList.remove('d-none');
    }

    // ═══════════════ 用户登录/注册 ═══════════════
  } else if (currentUser === 'guest') {
    pi.classList.add('d-none');
    nu.classList.remove('d-none');
    if (lb) {
      lb.textContent = '退出';
    }
    if (vb) {
      vb.classList.add('d-none');
    }
    if (cb) {
      cb.classList.add('d-none');
    }
  } else {
    pi.classList.add('d-none');
    nu.classList.remove('d-none');
    if (lb) {
      lb.textContent = '退出';
    }
    if (vb) {
      vb.classList.add('d-none');
    }
    if (cb) {
      cb.classList.add('d-none');
    }
  }
}

function resetPreferenceForm() {
  const $ = (id) => document.getElementById(id);
  // 重置值必须与各 select 实际 option 的 value 一致,否则赋值无匹配→selectedIndex=-1→显示空白
  // (辣度/咸淡/甜酸的默认项 value='无' 显示'无所谓'; 预算/热量默认项 value='不限'; 饮食要求 value='无特殊要求')
  if ($('spiciness')) {
    $('spiciness').value = '无';
  }
  if ($('saltiness')) {
    $('saltiness').value = '无';
  }
  if ($('sweetness')) {
    $('sweetness').value = '无';
  }
  if ($('price')) {
    $('price').value = '无';
  }
  if ($('calorie')) {
    $('calorie').value = '无';
  }
  if ($('religion')) {
    $('religion').value = '无特殊要求';
  }
  if ($('allergy-none')) {
    $('allergy-none').checked = true;
    ['allergy-seafood', 'allergy-peanut', 'allergy-egg', 'allergy-soy', 'allergy-gluten'].forEach((id) => {
      if ($(id)) {
        $(id).checked = false;
        $(id).disabled = true;
      }
    });
  }
  if ($('recommendation-mode')) {
    $('recommendation-mode').value = 'auto';
  }
}

// ═══ 偏好完整度引导 ═══
// 5 维口味声明率;咸淡/热量为"弱维度"(ML 当前低权重根因),重点提
const PREF_FIELDS = [
  { key: 'spiciness', label: '辣度', weak: false },
  { key: 'saltiness', label: '咸淡', weak: true },
  { key: 'sweetness', label: '甜酸', weak: false },
  { key: 'price', label: '预算', weak: false },
  { key: 'calorie', label: '热量', weak: true },
];
function computePrefCompleteness() {
  const $ = (id) => document.getElementById(id);
  const fields = PREF_FIELDS.map((f) => {
    const el = $(f.key);
    const v = el ? el.value : '无';
    const declared = v !== '无' && v !== '无特殊要求' && v !== '不限' && v !== '';
    return Object.assign({}, f, { value: v, declared });
  });
  const declaredCount = fields.filter((f) => f.declared).length;
  const weakUndeclared = fields.filter((f) => f.weak && !f.declared);
  return { fields, declared: declaredCount, total: fields.length, weakUndeclared };
}
function prefScrollAndHighlight(key) {
  const el = document.getElementById(key);
  if (!el) {
    return;
  }
  if (el.scrollIntoView) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  el.classList.remove('pref-highlight');
  void el.offsetWidth;
  el.classList.add('pref-highlight');
  setTimeout(() => el.classList.remove('pref-highlight'), 2200);
  try {
    el.focus({ preventScroll: true });
  } catch (e) {}
}
function renderPrefCompleteness() {
  const meter = document.getElementById('pref-completeness-meter');
  if (!meter) {
    return;
  }
  const c = computePrefCompleteness();
  const pct = Math.round((c.declared / c.total) * 100);
  const items = c.fields
    .map((f) => {
      const state = f.declared ? 'done' : 'todo';
      const weakCls = f.weak ? ' weak' : '';
      const cls = 'pref-meter-item ' + state + weakCls;
      const dot = f.weak ? '◆' : '●';
      const tail = f.declared ? '' : '<small class="pref-meter-todo">未设置</small>';
      return (
        '<span class="' +
        cls +
        '" data-pref-key="' +
        f.key +
        '" role="button" tabindex="0">' +
        dot +
        ' ' +
        f.label +
        tail +
        '</span>'
      );
    })
    .join('');
  const badgeCls = pct === 100 ? 'bg-success' : 'bg-warning';
  meter.innerHTML =
    '<div class="pref-meter-row">' +
    '<div class="pref-meter-track"><div class="pref-meter-fill" style="width:' +
    pct +
    '%"></div></div>' +
    '<span class="badge ' +
    badgeCls +
    ' rounded-pill">' +
    c.declared +
    '/' +
    c.total +
    '</span>' +
    '</div><div class="pref-meter-items">' +
    items +
    '</div>';
  meter.querySelectorAll('[data-pref-key]').forEach((el) => {
    el.addEventListener('click', () => prefScrollAndHighlight(el.getAttribute('data-pref-key')));
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        prefScrollAndHighlight(el.getAttribute('data-pref-key'));
      }
    });
  });
}
function renderPrefCompletenessBanner() {
  const banner = document.getElementById('pref-completeness-banner');
  if (!banner) {
    return;
  }
  const c = computePrefCompleteness();
  const dismissed = localStorage.getItem('prefCompletenessDismissed') === 'true';
  if (dismissed || c.declared >= c.total) {
    banner.classList.add('d-none');
    banner.innerHTML = '';
    banner.className = 'd-none';
    return;
  }
  banner.className = 'alert alert-warning alert-dismissible fade show pref-completeness-banner';
  banner.classList.remove('d-none');
  banner.innerHTML =
    '<i class="bi bi-info-circle me-2"></i>' +
    (menuLang === 'en'
      ? c.total - c.declared + ' taste preferences not set — complete them for better matches.'
      : '还有 ' + (c.total - c.declared) + ' 项口味偏好未设置，补全后推荐更贴合你的口味。') +
    '<a href="#" class="alert-link ms-1" id="pref-completeness-goto">' +
    (menuLang === 'en' ? 'Complete them →' : '去补全 →') +
    '</a>' +
    '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="关闭"></button>';
  const goto = banner.querySelector('#pref-completeness-goto');
  if (goto) {
    goto.addEventListener('click', function (e) {
      e.preventDefault();
      showSection('preference-section');
      const fu = c.fields.find((f) => !f.declared);
      if (fu) {
        setTimeout(() => prefScrollAndHighlight(fu.key), 350);
      }
    });
  }
  banner.addEventListener(
    'closed.bs.alert',
    function () {
      localStorage.setItem('prefCompletenessDismissed', 'true');
    },
    { once: true }
  );
}

const s_titleMap = {
  'home-section': '唐猫庭院 - 菜品推荐',
  'login-section': '登录 - 唐猫庭院',
  'register-section': '注册 - 唐猫庭院',
  'preference-section': '口味偏好 - 唐猫庭院',
  'recommendation-section': '推荐菜品 - 唐猫庭院',
  'feedback-section': '菜品评价 - 唐猫庭院',
  'cart-section': '购物车 - 唐猫庭院',
  'end-section': '点餐完成 - 唐猫庭院',
  'about-section': '关于本店 - 唐猫庭院',
  'dataset-section': '全部菜单 - 唐猫庭院',
  'profile-section': '个人中心 - 唐猫庭院',
  'privacy-section': '隐私政策 - 唐猫庭院',
  'table-builder-section': '一席成宴 - 唐猫庭院',
  'table-result-section': '一席成宴 · 三套方案 - 唐猫庭院',
};
// EN 标题(品牌名"唐猫庭院"保留中文——品牌名不翻译,2026-10-19 EN残留修复)
const s_titleMapEn = {
  'home-section': 'Tang Cat Courtyard - Menu',
  'login-section': 'Sign In - 唐猫庭院',
  'register-section': 'Sign Up - 唐猫庭院',
  'preference-section': 'Taste Preferences - 唐猫庭院',
  'recommendation-section': 'Recommendations - 唐猫庭院',
  'feedback-section': 'Dish Rating - 唐猫庭院',
  'cart-section': 'My Cart - 唐猫庭院',
  'end-section': 'Order Placed - 唐猫庭院',
  'about-section': 'About Us - 唐猫庭院',
  'dataset-section': 'Full Menu - 唐猫庭院',
  'profile-section': 'My Account - 唐猫庭院',
  'privacy-section': 'Privacy - 唐猫庭院',
  'table-builder-section': 'Feast Builder - 唐猫庭院',
  'table-result-section': 'Feast Plans - 唐猫庭院',
};
function syncPageTitle(sectionId) {
  const id = sectionId || (document.querySelector('[id$="-section"].active') || {}).id;
  if (menuLang === 'en') {
    if (s_titleMapEn[id]) {
      document.title = s_titleMapEn[id];
    }
  } else if (s_titleMap[id]) {
    document.title = s_titleMap[id];
  }
}
const s_navMap = {
  'home-section': 'nav-home',
  'about-section': 'nav-about',
  'dataset-section': 'nav-dataset',
  'privacy-section': 'nav-privacy',
  'login-section': 'nav-user',
  'register-section': 'nav-user',
  'profile-section': 'nav-profile',
};

function showSection(sectionId, skipScroll, skipPush) {
  const el = document.getElementById(sectionId);
  if (!el) {
    console.warn('showSection: 未找到元素', sectionId);
    return;
  }
  // 记录上一页（关闭购物车时返回）
  const cur = document.querySelector('.section.active');
  if (cur && cur.id !== sectionId) {
    window._prevSection = cur.id;
  }
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  el.classList.add('active');
  // 切换section时平滑滚动到顶部，提升浏览体验（购物车返回时跳过，恢复原位置）
  if (!skipScroll) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  // 记录导航历史（用于浏览器前进/后退）；popstate 恢复时不可再 push——否则会清掉前进栈，后退后永远无法前进(2026-10-19 修复)
  if (!skipPush) {
    try {
      history.pushState({ section: sectionId }, '', window.location.pathname);
    } catch (e) {}
  }
  updateUserNavbar();
  // 更新页面标题
  syncPageTitle(sectionId);
  const nid = s_navMap[sectionId];
  document.querySelectorAll('.navbar-nav .nav-link').forEach((l) => {
    l.classList.remove('active');
    l.removeAttribute('aria-current');
  });
  if (nid) {
    const l = document.getElementById(nid);
    if (l) {
      l.classList.add('active');
      l.setAttribute('aria-current', 'page');
    }
  }
  if (sectionId === 'preference-section') {
    // 2026-10-08: 不再在此 resetRecommendation——清数组却留旧卡片,用户返回推荐页点评分/收藏会
    // 引用已清空的数组而报错;新提交会整体重建推荐,旧结果在提交前保持与数组同步
    const sel = document.getElementById('recommendation-mode');
    if (sel) {
      if (sel.options.length === 0) {
        sel.innerHTML =
          '<option value="auto" selected>自动选择（优先API）</option><option value="api">后端API推荐（更智能）</option><option value="local">本地推荐（更快速）</option>';
      }
      sel.value = 'auto';
      sel.removeEventListener('change', updateModeDisplay);
      sel.addEventListener('change', updateModeDisplay);
    }
    const u = getUserData(currentUser);
    if (currentUser && currentUser !== 'guest' && u && u.preferences) {
      loadUserPreferences(u.preferences);
    } else {
      resetPreferenceForm();
    }
    // 2026-09-17: 游客进偏好页同步过敏源联动态(勾"无"时其他项应为禁用,此前仅在重置表单时处理)
    {
      const an = $('allergy-none');
      if (an && an.checked && currentUser === 'guest') {
        ['allergy-seafood', 'allergy-peanut', 'allergy-egg', 'allergy-soy', 'allergy-gluten'].forEach((id) => {
          if ($(id)) {
            $(id).disabled = true;
          }
        });
      }
    }
    // 桌号锁定：加菜流程中偏好页桌号同样锁定
    const lockedTable1 = ssGet('lockedTable') || '';
    const ptb = document.getElementById('pref-table-number');
    if (ptb) {
      if (lockedTable1) {
        ptb.value = lockedTable1;
        ptb.disabled = true;
        ptb.style.background = 'var(--cream-dark)';
      } else {
        ptb.disabled = false;
        ptb.style.background = '';
      }
    }
    updateModeDisplay();
    renderPrefCompleteness();
  }
  updateFloatBar();
  // 进入推荐页：刷新加购按钮与购物车同步（清空/修改后返回也能恢复）
  if (sectionId === 'recommendation-section' && typeof refreshRecipeCartBtn === 'function') {
    const ids = [...document.querySelectorAll('#recommendation-result [data-recipe-cart]')].map((el) =>
      parseInt(el.dataset.recipeCart)
    );
    ids.forEach((id) => refreshRecipeCartBtn(id));
  }
  if (sectionId === 'recommendation-section') {
    renderPrefCompletenessBanner();
  }
  // 一席成宴选饮品模式：进入菜单页刷新横幅，返回席面页刷新总价（饮品可能已变）
  if (sectionId === 'dataset-section' && typeof renderDrinksModeBanner === 'function') {
    renderDrinksModeBanner();
  }
  if (
    sectionId === 'table-result-section' &&
    typeof window.tableSets !== 'undefined' &&
    window.tableSets &&
    window.tableSets.length &&
    typeof recalcTableSetTotals === 'function'
  ) {
    window.tableSets.forEach(recalcTableSetTotals);
    if (typeof renderTableSets === 'function') {
      renderTableSets();
    }
  }
}

function updateModeDisplay() {
  const el = document.getElementById('current-recommendation-mode'),
    sel = document.getElementById('recommendation-mode');
  if (!el || !sel) {
    return;
  }
  el.textContent =
    { auto: '自动选择（优先API）', api: '后端API推荐（更智能）', local: '本地推荐（更快速）' }[sel.value] ||
    '自动选择（优先API）';
}

// 登录/注册成功后的导航栏认证态切换(2026-10-27: 从弹窗"确定"回调提前到 API 成功时——
// 用户点 X 关闭弹窗曾跳过回调,导航停留在"登录"态而实际已登录)
function updateNavAuthState() {
  const pi = document.getElementById('nav-profile-item'),
    nu = document.getElementById('nav-user');
  if (pi) {
    pi.classList.remove('d-none');
  }
  if (nu) {
    nu.classList.add('d-none');
  }
  const hlb = document.getElementById('login-btn'),
    hrb = document.getElementById('register-btn');
  if (hlb) {
    hlb.classList.add('d-none');
  }
  if (hrb) {
    hrb.classList.add('d-none');
  }
}

function showMessage(title, msg, callback, autoClose) {
  const mt = document.getElementById('modal-title'),
    mb = document.getElementById('modal-body');
  if (!mt || !mb) {
    console.warn('showMessage: 模态框元素未找到');
    return;
  }
  mt.textContent = title;
  mb.textContent = msg;
  const el = document.getElementById('message-modal');
  let m = bootstrap.Modal.getInstance(el);
  if (!m) {
    m = new bootstrap.Modal(el, { focus: false });
  }
  el.inert = false;
  el.removeAttribute('aria-hidden');
  m.show();
  // 模态框打开后聚焦到确定按钮（焦点管理）
  el.addEventListener('shown.bs.modal', function focusMsgHandler() {
    el.removeEventListener('shown.bs.modal', focusMsgHandler);
    const confirmBtn = document.getElementById('modal-confirm-btn');
    if (confirmBtn) {
      setTimeout(function () {
        confirmBtn.focus();
      }, 50);
    }
  });
  // 保存回调，在模态框隐藏时调用
  if (typeof callback === 'function') {
    const handler = function () {
      el.removeEventListener('hidden.bs.modal', handler);
      callback();
    };
    el.addEventListener('hidden.bs.modal', handler);
  }
  // 自动关闭：信息提示在指定毫秒后自动隐藏，避免遮罩层长时间阻挡页面操作
  if (typeof autoClose === 'number' && autoClose > 0) {
    setTimeout(function () {
      const modal = bootstrap.Modal.getInstance(el);
      if (modal) {
        modal.hide();
      }
    }, autoClose);
  }
}

function showDataset() {
  sessionStorage.setItem('datasetScrollY', window.scrollY);
  showSection('dataset-section');
  renderMenuTable();
}
function login() {
  const uEl = document.getElementById('login-username'),
    pEl = document.getElementById('login-password'),
    bEl = document.getElementById('login-btn');
  if (!uEl || !pEl) {
    showMessage('页面错误', '登录表单元素未找到');
    return;
  }
  if (bEl) {
    bEl.disabled = true;
  }
  const u = uEl.value.trim(),
    p = pEl.value;
  if (!u || !p) {
    showMessage('登录失败', '请输入用户名和密码');
    return;
  }
  safeFetch('/api/user/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p }),
  })
    .then((r) => r.json())
    .then((d) => {
      if (!d.success) {
        showMessage('登录失败', d.error || '用户名或密码错误');
        return;
      }
      if (d.token) {
        localStorage.setItem('userToken', d.token);
      }
      currentUser = u;
      localStorage.setItem('currentUser', u);
      const users = loadUsers();
      const i = users.findIndex((x) => x.username === u);
      if (i === -1) {
        users.push({
          username: u,
          created_at: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          favorites: d.user?.favorites || [],
          blacklist: d.user?.blacklist || [],
          preferences: d.user?.preferences || {},
        });
      } else {
        users[i].lastLogin = new Date().toISOString();
        if (d.user?.favorites) {
          users[i].favorites = d.user.favorites;
        }
        if (d.user?.blacklist) {
          users[i].blacklist = d.user.blacklist;
        }
        if (d.user?.preferences) {
          users[i].preferences = d.user.preferences;
        }
      }
      saveUsers(users);
      showMessage(L('登录成功', 'Signed in'), L('欢迎回来，' + u + '！', 'Welcome back, ' + u + '!'), function () {
        updateNavAuthState();
        // 登录后重查首页两个"上次"按钮（页面加载时可能是游客态被隐藏）
        if (window.updateHomeButtons) {
          window.updateHomeButtons();
        }
        showSection('preference-section');
        if (d.user?.preferences) {
          loadUserPreferences(d.user.preferences);
        }
      });
      updateNavAuthState();
    })
    .catch(() => {
      showMessage('登录失败', '无法连接到服务器，请检查网络');
    })
    .finally(() => {
      const b = document.getElementById('login-btn');
      if (b) {
        b.disabled = false;
      }
    });
}

// 注册表单行内错误提示
function setRegErr(field, msg) {
  const el = document.getElementById('register-' + field + '-err');
  if (!el) {
    return;
  }
  if (msg) {
    el.textContent = msg;
    el.style.display = 'block';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}
function clearRegErrs() {
  ['username', 'password', 'confirm'].forEach((f) => setRegErr(f, ''));
}

function register() {
  const uEl = document.getElementById('register-username'),
    pEl = document.getElementById('register-password'),
    cEl = document.getElementById('register-confirm'),
    bEl = document.getElementById('register-btn');
  const aEl = document.getElementById('agree-privacy');
  if (!uEl || !pEl || !cEl) {
    showMessage('页面错误', '注册表单元素未找到');
    return;
  }
  if (bEl) {
    bEl.disabled = true;
  }
  const u = uEl.value.trim(),
    p = pEl.value,
    c = cEl.value;
  clearRegErrs();
  const fail = (field, msg) => {
    setRegErr(field, msg);
    if (bEl) {
      bEl.disabled = false;
    }
  };
  if (!u) {
    fail('username', '请填写用户名');
    return;
  }
  if (u.length < 2 || u.length > 20) {
    fail('username', '用户名需 2-20 个字符');
    return;
  }
  if (!p) {
    fail('password', '请填写密码');
    return;
  }
  if (p.length < 8 || p.length > 20) {
    fail('password', '密码需 8-20 位');
    return;
  }
  if (!/[A-Z]/.test(p)) {
    fail('password', '密码须包含大写字母');
    return;
  }
  if (!/[a-z]/.test(p)) {
    fail('password', '密码须包含小写字母');
    return;
  }
  if (!/[0-9]/.test(p)) {
    fail('password', '密码须包含数字');
    return;
  }
  if (p !== c) {
    fail('confirm', '两次输入的密码不一致');
    return;
  }
  if (!aEl || !aEl.checked) {
    showMessage('注册失败', '请阅读并同意隐私政策');
    if (bEl) {
      bEl.disabled = false;
    }
    return;
  }
  safeFetch('/api/user/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p }),
  })
    .then((r) => r.json())
    .then((d) => {
      if (!d.success) {
        const err = d.error || '注册失败';
        if (err.includes('用户名')) {
          setRegErr('username', err);
        } else if (err.includes('密码')) {
          setRegErr('password', err);
        } else {
          showMessage('注册失败', err);
        }
        return;
      }
      if (d.token) {
        localStorage.setItem('userToken', d.token);
      }
      currentUser = u;
      localStorage.setItem('currentUser', u);
      const users = loadUsers();
      if (!users.find((x) => x.username === u)) {
        users.push({
          username: u,
          created_at: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          favorites: [],
          blacklist: [],
          preferences: {},
        });
      }
      saveUsers(users);
      showMessage(L('注册成功', 'Registered'), L('欢迎，' + u + '！', 'Welcome, ' + u + '!'), function () {
        updateNavAuthState();
        if (window.updateHomeButtons) {
          window.updateHomeButtons();
        }
        showSection('preference-section');
      });
      updateNavAuthState();
    })
    .catch(() => {
      showMessage('注册失败', '无法连接到服务器，请检查网络');
    })
    .finally(() => {
      const b = document.getElementById('register-btn');
      if (b) {
        b.disabled = false;
      }
    });
}

function loadUserPreferences(prefs) {
  if (!prefs) {
    return;
  }
  const $ = (id) => document.getElementById(id);
  // 安全设置元素值（带 null 保护 + select 容错）
  // 2026-10-27: 偏好档案里可能存有下拉选项之外的值(如口味填'无所谓'存进预算/热量字段),
  // 直接赋值会 selectedIndex=-1 显示空白——赋值后无匹配则回退该下拉的默认项
  const setVal = (id, val) => {
    const el = $(id);
    if (el) {
      el.value = val;
      if (el.tagName === 'SELECT' && el.selectedIndex === -1 && el.options.length > 0) {
        el.selectedIndex = 0;
      }
    }
  };
  const setChecked = (id, checked) => {
    const el = $(id);
    if (el) {
      el.checked = checked;
    }
  };
  const setDisabled = (id, disabled) => {
    const el = $(id);
    if (el) {
      el.disabled = disabled;
    }
  };
  if (prefs.spiciness) {
    setVal('spiciness', prefs.spiciness);
  }
  if (prefs.saltiness) {
    setVal('saltiness', prefs.saltiness);
  }
  if (prefs.sweetness) {
    setVal('sweetness', prefs.sweetness);
  }
  if (prefs.price) {
    setVal('price', prefs.price);
  }
  if (prefs.calorie) {
    setVal('calorie', prefs.calorie);
  }
  if (prefs.recommendationMode) {
    const m = prefs.recommendationMode;
    const norm = ['auto', 'api', 'local'].includes(m)
      ? m
      : m.indexOf('本地') >= 0
        ? 'local'
        : m.indexOf('API') >= 0
          ? 'api'
          : '';
    if (norm) {
      setVal('recommendation-mode', norm);
    }
  }
  if (prefs.religion) {
    setVal('religion', prefs.religion);
  }
  if (prefs.allergies && prefs.allergies.length > 0) {
    setChecked('allergy-none', false);
    setChecked('allergy-seafood', prefs.allergies.includes('海鲜'));
    setChecked('allergy-peanut', prefs.allergies.includes('花生'));
    setChecked('allergy-egg', prefs.allergies.includes('鸡蛋'));
    setChecked('allergy-soy', prefs.allergies.includes('大豆'));
    setChecked('allergy-gluten', prefs.allergies.includes('麸质'));
  } else {
    setChecked('allergy-none', true);
    ['allergy-seafood', 'allergy-peanut', 'allergy-egg', 'allergy-soy', 'allergy-gluten'].forEach((id) => {
      setChecked(id, false);
      setDisabled(id, true);
    });
  }
}

// B7 冷启动：从未声明偏好的顾客直达本店热门 Top6（销量排序，排除饮品/主食/售罄），
// 结果页"还有 X 项偏好未设置"横幅自动引导补全——不强迫新客先填表
function coldStartHotRecommend() {
  const $ = (id) => document.getElementById(id);
  userProfile = {
    spiciness: '无所谓',
    saltiness: '无所谓',
    sweetness: '无所谓',
    price: '不限',
    calorie: '不限',
    religion: '无特殊要求',
    allergies: [],
    recommendationMode: 'local',
    blindBoxMode: 'smart',
    coldStart: true,
  };
  // 冷启动热门流按人气排序,不走 ML——模式标记须如实显示"热门推荐",
  // 曾沿用全局默认"本地计算"误导用户以为 AI 失效回退(2026-10-27)
  currentRecommendationMode = '热门推荐';
  showSection('recommendation-section');
  const rl = $('recommendation-loading'),
    rr = $('recommendation-result');
  if (rl) {
    rl.classList.add('d-none');
  }
  if (rr) {
    rr.classList.remove('d-none');
  }
  const filteredHot = dishData.filter(
    (d) => d.is_active !== false && d.is_sold_out !== true && d.category !== '飲品与酒水' && d.category !== '主食'
  );
  const hot = filteredHot
    .sort((a, b) => (b.order_count || 0) - (a.order_count || 0))
    .slice(0, 6)
    .map((d) => {
      // 文案按真实订单量动态: 被点≥30次才说"最近大家都在点"(试运营初期数据不足时不说虚话——2026-10-27)
      const realPopularity = (d.order_count || 0) >= 30;
      return Object.assign({}, d, {
        reason: realPopularity
          ? '本店人气招牌，最近大家都在点'
          : '本店招牌推荐，不知道吃什么就从这里选',
        matchRate: 0.5,
        matchIndex: 0.5,
        hasTasteSignal: false,
        type: '热门推荐',
      });
    });
  currentRecommendations = hot;
  const dl = $('dish-list');
  if (dl) {
    dl.innerHTML = '';
  }
  if (typeof displayRecommendations === 'function') {
    displayRecommendations();
  }
  if (typeof renderPrefCompletenessBanner === 'function') {
    renderPrefCompletenessBanner();
  }
  safeFetch('/api/recommendation-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: '冷启动热门推荐' }),
  }).catch(() => {});
}

function submitPreference() {
  const $ = (id) => document.getElementById(id);
  // null 保护：检查所有偏好元素是否存在
  const sp = $('spiciness'),
    sa = $('saltiness'),
    sw = $('sweetness'),
    pr = $('price'),
    ca = $('calorie'),
    re = $('religion'),
    rm = $('recommendation-mode'),
    bm = $('blind-box-mode');
  if (!sp || !sa || !sw || !pr || !ca || !re || !rm || !bm) {
    showMessage('页面错误', '偏好设置表单未完全加载');
    return;
  }
  userProfile = {
    spiciness: sp.value,
    saltiness: sa.value,
    sweetness: sw.value,
    price: pr.value,
    calorie: ca.value,
    religion: re.value,
    allergies: [],
    recommendationMode: rm.value,
    blindBoxMode: bm.value,
  };
  if ($('allergy-none') && !$('allergy-none').checked) {
    const amap = {
      'allergy-seafood': '海鲜',
      'allergy-peanut': '花生',
      'allergy-egg': '鸡蛋',
      'allergy-soy': '大豆',
      'allergy-gluten': '麸质',
    };
    Object.keys(amap).forEach((k) => {
      if ($(k).checked) {
        userProfile.allergies.push(amap[k]);
      }
    });
  }
  if (currentUser !== 'guest') {
    updateUserData(currentUser, { preferences: userProfile });
    localStorage.setItem('savedPrefs', 'true');
    safeFetch('/api/user-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ username: currentUser, preferences: userProfile }),
    }).catch(() => {});
  }
  // 记录偏好选择（填过表单的标记：下次点 AI 直达表单）
  sessionStorage.setItem('tasteFilled', '1');
  safeFetch('/api/preference-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spiciness: userProfile.spiciness,
      saltiness: userProfile.saltiness,
      sweetness: userProfile.sweetness,
      price: userProfile.price,
      calorie: userProfile.calorie,
      religion: userProfile.religion,
      allergies: userProfile.allergies,
      userId: currentUser || 'guest',
      recommendationMode: userProfile.recommendationMode,
    }),
  }).catch(() => {});
  showSection('recommendation-section');
  const rl = $('recommendation-loading'),
    rr = $('recommendation-result');
  if (rl) {
    rl.classList.remove('d-none');
  }
  if (rr) {
    rr.classList.add('d-none');
  }
  fetchRecommendations();
}

// ═══════════════ 推荐结果渲染 ═══════════════

// ═══════════════ 评分反馈 ═══════════════
function submitStarFeedback() {
  if (!starRatingDish || !starRatingValue) {
    showMessage('评价失败', '请先选择评分');
    return;
  }
  const dish = starRatingDish;
  const $g = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };
  const prefs = {
    spiciness: $g('spiciness'),
    saltiness: $g('saltiness'),
    sweetness: $g('sweetness'),
    price: $g('price'),
    allergies: [],
  };
  const uid = currentUser || 'guest';
  safeFetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ dishId: dish.id, score: starRatingValue, userPreferences: prefs, userId: uid }),
  })
    .then((r) => r.json())
    .then((d) => {
      if (!d.success) {
        showMessage('评价失败', d.error || '提交失败，请重试');
        return;
      }
      showMessage(
        L('评价成功', 'Review submitted'),
        L('感谢您对' + dish.name + '的评价！', 'Thanks for reviewing ' + dish.name + '!'),
        function () {
          starRatingDish = null;
          starRatingValue = 0;
          document.querySelectorAll('.star').forEach((s) => {
            s.textContent = '☆';
            s.style.color = '#ddd';
          });
          const h = document.getElementById('star-hint');
          if (h) {
            h.textContent = '点击星星评分';
          }
          const sb = document.getElementById('star-submit-btn');
          if (sb) {
            sb.disabled = true;
          }
          showSection(ratingReturnTo || 'recommendation-section');
        }
      );
    })
    .catch(() => showMessage('评价失败', '网络错误，请稍后重试'));
}
function openStarFeedback(dish) {
  if (!dish) {
    showMessage('提示', '推荐已刷新，请重新生成后再评分');
    return;
  }
  starRatingDish = dish;
  starRatingValue = 0;
  ratingReturnTo = 'recommendation-section';
  const fd = document.getElementById('star-feedback-dish');
  if (fd) {
    fd.textContent = L('给「' + dish.name + '」评分', 'Rate "' + dish.name + '"');
  }
  document.querySelectorAll('.star').forEach((s) => {
    s.textContent = '☆';
    s.style.color = '#ddd';
  });
  const h = document.getElementById('star-hint');
  if (h) {
    h.textContent = '点击星星评分';
  }
  const sb = document.getElementById('star-submit-btn');
  if (sb) {
    sb.disabled = true;
  }
  showSection('feedback-section');
}

function endRecommendation() {
  // 记录已点过的菜品
  let ordered = [];
  try {
    ordered = JSON.parse(localStorage.getItem('orderedDishes') || '[]');
  } catch (e) {}
  currentRecommendations.forEach((d) => {
    if (!ordered.includes(d.id)) {
      ordered.push(d.id);
    }
  });
  try {
    localStorage.setItem('orderedDishes', JSON.stringify(ordered));
  } catch (e) {}
  // 选好了 = 跳购物车结算（购物车里是用户自己加购的菜，不自动添加推荐菜）
  showCart();
}
function displayModelMetrics() {
  const el = document.getElementById('model-metrics');
  if (!el) {
    return;
  }
  safeFetch('/api/model-metrics')
    .then((r) => r.json())
    .then((d) => {
      if (d.success && d.metrics) {
        const m = d.metrics;
        const items = [
          { label: 'MSE', value: m.mse.toFixed(4), desc: '均方误差' },
          { label: 'RMSE', value: m.rmse.toFixed(4), desc: '均方根误差' },
          { label: 'MAE', value: m.mae.toFixed(4), desc: '平均绝对误差' },
          { label: 'R²', value: m.r2.toFixed(4), desc: '决定系数' },
        ];
        el.innerHTML = items
          .map(
            (i) =>
              '<div style="text-align:center;min-width:100px;flex:1;">' +
              '<div style="font-size:1.5rem;font-weight:700;color:var(--text);">' +
              i.value +
              '</div>' +
              '<div style="font-size:0.8rem;color:var(--text-light);margin-top:2px;">' +
              i.desc +
              '</div>' +
              '<div style="font-size:0.7rem;color:#c9a96e;">' +
              i.label +
              '</div>' +
              '</div>'
          )
          .join('');
        const r2 = document.getElementById('end-model-r2');
        if (r2) {
          r2.textContent = m.r2.toFixed(2);
        }
      }

      // ═══════════════ 个人资料与历史 ═══════════════
    })
    .catch(() => {});
}
function displayFeatureImportance() {
  const el = document.getElementById('feature-importance-chart');
  if (!el) {
    return;
  }
  // 显示加载状态
  const ctx = el.getContext('2d');
  const parent = el.parentElement;
  if (parent && !parent.querySelector('.loading-text')) {
    const tip = document.createElement('p');
    tip.className = 'loading-text';
    tip.style.cssText = 'color:var(--text-light);font-size:0.85rem;text-align:center;padding:20px;';
    tip.textContent = '正在加载特征数据...';
    parent.appendChild(tip);
  }
  if (featureImportanceChart) {
    featureImportanceChart.destroy();
    featureImportanceChart = null;
  }
  // Chart.js 按需加载(2026-10-16): 从全局加载改为按需,客户浏览/点餐流程不需要 Chart.js(~200KB)
  if (typeof Chart === 'undefined') {
    const cs = document.createElement('script');
    cs.src = 'node_modules/chart.js/dist/chart.umd.min.js';
    document.head.appendChild(cs);
  }
  safeFetch('/api/feature-importance')
    .then((r) => r.json())
    .then((d) => {
      if (d.success && d.importance && d.importance.length) {
        const imp = d.importance.filter((x) => x.importance > 0.005).slice(0, 15);
        const FEATURE_EN = {
          辣度: 'Spiciness',
          咸淡: 'Saltiness',
          甜酸: 'Sweet-Sour',
          热量: 'Calories',
          价格: 'Price',
          招牌: 'Signature',
          评分: 'Rating',
          用户辣度: 'Your spiciness',
          用户咸淡: 'Your saltiness',
          用户甜酸: 'Your sweet-sour',
          用户热量: 'Your calories',
          用户价格: 'Your price range',
        };
        const labels = imp.map((x) => (menuLang === 'en' && FEATURE_EN[x.feature]) || x.feature);
        const data = imp.map((x) => x.importance);
        const colors = [
          '#8b1a1a',
          '#b83a2a',
          '#c0392b',
          '#d45a4a',
          '#e8a090',
          '#e8d5b0',
          '#c9a96e',
          '#a8884e',
          '#7a6a4e',
          '#5a4a3e',
          '#3a2a2e',
          '#c0885e',
          '#d0986e',
          '#a0704e',
          '#805030',
        ];
        if (typeof Chart !== 'undefined') {
          try {
            // 强制同步 canvas 尺寸（避免不可见时 clientWidth=0 导致 chart 不渲染）
            const cw = el.clientWidth || el.parentElement.clientWidth || 553,
              ch = el.clientHeight || 280;
            el.width = cw;
            el.height = ch;
            featureImportanceChart = new Chart(el.getContext('2d'), {
              type: 'bar',
              data: {
                labels,
                datasets: [{ label: '重要性', data, backgroundColor: colors.slice(0, labels.length), borderRadius: 4 }],
              },
              options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { beginAtZero: true, grid: { display: false } }, y: { grid: { display: false } } },
                plugins: { legend: { display: false } },
              },
            });
            // 移除加载提示
            const lt = parent?.querySelector('.loading-text');
            if (lt) {
              lt.remove();
            }
          } catch (e) {}
        }
      }
    })
    .catch(() => {
      const lt = parent?.querySelector('.loading-text');
      if (lt) {
        lt.textContent = '加载失败';
      }
    });
}
function resetRecommendation() {
  currentRecommendations = [];
  recommendedIds = [];
  userProfile = null;
}
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function logout() {
  const msg = currentUser === 'guest' ? '已退出' : '已退出登录';
  // 尽力吊销服务端 token（fire-and-forget，不阻塞退出流程）
  const token = localStorage.getItem('userToken');
  if (token) {
    safeFetch('/api/user/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    }).catch(() => {});
  }
  currentUser = null;
  localStorage.removeItem('currentUser');
  localStorage.removeItem('userToken');
  localStorage.removeItem('prefCompletenessDismissed');
  localStorage.removeItem('savedPrefs');
  if (typeof resetPreferenceForm === 'function') {
    resetPreferenceForm();
  }
  resetRecommendation();
  const pi = document.getElementById('nav-profile-item'),
    nu = document.getElementById('nav-user');
  if (pi) {
    pi.classList.add('d-none');
  }
  if (nu) {
    nu.classList.remove('d-none');
  }
  const hlb = document.getElementById('login-btn'),
    hrb = document.getElementById('register-btn');
  if (hlb) {
    hlb.classList.remove('d-none');
  }
  if (hrb) {
    hrb.classList.remove('d-none');
  }
  const vcbG = document.getElementById('view-cached-btn');
  if (vcbG) {
    vcbG.classList.add('d-none');
  }
  if (window.updateHomeButtons) {
    window.updateHomeButtons();
  }
  // 立即回首页（2026-10-14：仅靠弹窗关闭回调曾出现退出后主区空白、需手动刷新）
  showSection('home-section');
  showMessage('已退出', msg, function () {
    showSection('home-section');
  });
}
function showProfile() {
  if (!currentUser || currentUser === 'guest') {
    showMessage('提示', '请先登录');
    return;
  }
  const user = getUserData(currentUser);
  if (!user) {
    showMessage('错误', '无法获取用户信息');
    return;
  }
  const pu = document.getElementById('profile-username');
  if (pu) {
    pu.textContent = user.username || currentUser;
  }
  const pl = document.getElementById('profile-last-login');
  if (pl) {
    pl.textContent = user.lastLogin || '从未登录';
  }
  const $ = (id) => document.getElementById(id);
  const fl = $('favorites-list');
  if (fl) {
    fl.innerHTML = user.favorites?.length
      ? user.favorites
          .map((id, i) => {
            const d = dishData.find((x) => x.id == id);
            return (
              '<div class="d-flex justify-content-between align-items-center mb-2"><span>' +
              (i + 1) +
              '. ' +
              (d ? esc(dishNameOf(d)) : L('菜品', 'Dish #') + esc(String(id))) +
              '</span><button class="btn btn-sm btn-danger cancel-favorite" data-id="' +
              esc(String(id)) +
              '">取消</button></div>'
            );
          })
          .join('')
      : '<p class="text-muted">还没有收藏的菜品</p>';
  }
  const bl = $('blacklist-list');
  if (bl) {
    bl.innerHTML = user.blacklist?.length
      ? user.blacklist
          .map((id, i) => {
            const d = dishData.find((x) => x.id == id);
            return (
              '<div class="d-flex justify-content-between align-items-center mb-2"><span>' +
              (i + 1) +
              '. ' +
              (d ? esc(dishNameOf(d)) : '菜品' + esc(String(id))) +
              '</span><button class="btn btn-sm btn-danger cancel-blacklist" data-id="' +
              esc(String(id)) +
              '">取消</button></div>'
            );
          })
          .join('')
      : '<p class="text-muted">还没有拉黑的菜品</p>';
  }
  // 清空按钮仅在列表非空时可见(空态下是死按钮,2026-10-12)
  const cfb = $('cancel-favorite-btn');
  if (cfb) {
    cfb.style.display = user.favorites?.length ? '' : 'none';
  }
  const cbb = $('cancel-blacklist-btn');
  if (cbb) {
    cbb.style.display = user.blacklist?.length ? '' : 'none';
  }
  document.querySelectorAll('.cancel-favorite').forEach((b) =>
    b.addEventListener('click', function () {
      const id = this.getAttribute('data-id');
      const u = getUserData(currentUser);
      if (u && u.favorites) {
        u.favorites = u.favorites.filter((x) => x != id);
        updateUserData(currentUser, { favorites: u.favorites });
        safeFetch('/api/user-favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ username: currentUser, favorites: u.favorites }),
        }).catch(() => {});
        showMessage('成功', '已取消收藏', showProfile);
      }
    })
  );
  document.querySelectorAll('.cancel-blacklist').forEach((b) =>
    b.addEventListener('click', function () {
      const id = this.getAttribute('data-id');
      const u = getUserData(currentUser);
      if (u && u.blacklist) {
        u.blacklist = u.blacklist.filter((x) => x != id);
        updateUserData(currentUser, { blacklist: u.blacklist });
        showMessage('成功', '已取消', showProfile);
      }
    })
  );
  // 加载推荐历史（C13：缓存到全局供"再来一单"使用）
  const rh = $('rec-history-list');
  if (rh) {
    rh.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">加载中...</p>';
  }
  safeFetch('/api/orders?userId=' + encodeURIComponent(currentUser), { headers: authHeaders() })
    .then((r) => r.json())
    .then((d) => {
      if (d.success && d.orders && d.orders.length) {
        window.recentOrdersCache = d.orders;
        const items = d.orders
          .slice(0, 10)
          .map((o, oi) => {
            const dishList = o.items || [];
            const time = o.created_at ? new Date(o.created_at).toLocaleString() : '';
            // 每道菜单独一行：菜名 + 评分按钮
            const dishRows = dishList
              .map((i, ii) => {
                const dishId = i.id;
                return (
                  '<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px dashed rgba(201,169,110,0.08);">' +
                  '<span>' +
                  (ii + 1) +
                  '. ' +
                  esc(i.name || '未知') +
                  '</span>' +
                  '<button class="btn btn-sm btn-outline-warning re-rate-btn" data-dishid="' +
                  esc(String(dishId)) +
                  '" data-dishname="' +
                  esc(i.name || '未知') +
                  '" style="font-size:0.72rem;padding:2px 8px;border-radius:4px;border-color:#f1c40f;color:#f39c12;"><i class="bi bi-star me-1"></i>评分</button>' +
                  '</div>'
                );
              })
              .join('');
            return (
              '<div style="font-size:0.82rem;color:#4a3028;padding:6px 0;border-bottom:1px solid rgba(201,169,110,0.12);">' +
              '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
              '<span style="color:#8b7a6a;font-size:0.75rem;">' +
              time +
              '</span>' +
              '<span><button class="btn btn-sm reorder-btn" data-oi="' +
              oi +
              '" style="font-size:0.72rem;padding:1px 8px;border-radius:4px;border-color:var(--gold);color:var(--primary);margin-right:4px;" title="把这一单的菜重新加入购物车">🔁 再来一单</button>' +
              '<span style="color:#b83a2a;font-weight:600;">' +
              L('共' + dishList.length + '道', dishList.length + ' dishes') +
              '</span></span>' +
              '</div>' +
              dishRows +
              '</div>'
            );
          })
          .join('');
        rh.innerHTML = items;
        // 绑定评分按钮事件
        // C13 再来一单：整单菜品重新加入购物车（赠菜/售罄/下架跳过）
        rh.querySelectorAll('.reorder-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const oi = parseInt(this.dataset.oi);
            const o = (window.recentOrdersCache || [])[oi];
            if (!o) {
              showMessage('提示', '订单数据已过期，请刷新后重试');
              return;
            }
            const items = (o.items || []).filter((i) => !i.giftTo && !i.giftFrom);
            if (!items.length) {
              showMessage('提示', '这一单没有可复购的菜品');
              return;
            }
            let added = 0;
            const skipped = [];
            items.forEach((i) => {
              const dish = dishData.find((d) => d.id === parseInt(i.id));
              if (!dish || dish.is_active === false || dish.is_sold_out === true) {
                skipped.push(i.name || L('菜品', 'Dish #') + i.id);
                return;
              }
              const min = minQtyOf(dish);
              const q = Math.max(parseInt(i.qty) || 1, min);
              addToCart(
                { id: dish.id, name: dish.name, price: dish.price, image_url: dish.image_url, serving: dish.serving },
                q
              );
              added++;
            });
            if (skipped.length) {
              showMessage(
                L('部分菜品已加入', 'Some items added'),
                L('以下菜品今日已售罄，已跳过：' + skipped.join('、'), 'Sold out today, skipped: ' + skipped.join(', '))
              );
            } else {
              showMessage('已加入购物车', added + ' 件商品已重新加入，去结算或继续加菜', function () {
                showSection('cart-section');
                showCart();
              });
            }
          });
        });
        rh.querySelectorAll('.re-rate-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const dishId = parseInt(this.dataset.dishid);
            const dishName = this.dataset.dishname;
            if (!dishId) {
              return;
            }
            // 打开评分弹窗
            starRatingDish = { id: dishId, name: dishName };
            starRatingValue = 0;
            ratingReturnTo = 'profile-section';
            document.getElementById('star-feedback-dish').textContent = L(
              '给「' + dishName + '」评分',
              'Rate "' + dishName + '"'
            );
            document.querySelectorAll('.star').forEach((s) => {
              s.textContent = '☆';
              s.style.color = '#ddd';
            });
            document.getElementById('star-hint').textContent = '点击星星评分';
            document.getElementById('star-submit-btn').disabled = true;
            showSection('feedback-section');
          });
        });
      } else {
        rh.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">还没有推荐记录</p>';
      }
    })
    .catch(() => {
      rh.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">暂无记录</p>';
    });
  showSection('profile-section');
}

// ═══════════════ 收藏/拉黑 ═══════════════
function cancelFavorite() {
  const u = getUserData(currentUser);
  if (!u?.favorites?.length) {
    showMessage('提示', '收藏列表为空');
    return;
  }
  // 二次点击确认（沙箱 iframe 中原生 confirm 不可用）
  const btn = document.getElementById('cancel-favorite-btn');
  if (btn && btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    const t = btn.textContent;
    btn.textContent = '再次点击确认';
    btn.style.color = '#c0392b';
    setTimeout(() => {
      btn.dataset.armed = '';
      btn.textContent = t;
      btn.style.color = '';
    }, 3000);
    return;
  }
  if (btn) {
    btn.dataset.armed = '';
  }
  u.favorites = [];
  updateUserData(currentUser, { favorites: [] });
  safeFetch('/api/user-favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ username: currentUser, favorites: [] }),
  }).catch(() => {});
  showMessage('成功', '已取消所有收藏');
  setTimeout(showProfile, 1000);
}
function cancelBlacklist() {
  const u = getUserData(currentUser);
  if (!u?.blacklist?.length) {
    showMessage('提示', '列表为空');
    return;
  }
  const btn = document.getElementById('cancel-blacklist-btn');
  if (btn && btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    const t = btn.textContent;
    btn.textContent = '再次点击确认';
    btn.style.color = '#c0392b';
    setTimeout(() => {
      btn.dataset.armed = '';
      btn.textContent = t;
      btn.style.color = '';
    }, 3000);
    return;
  }
  if (btn) {
    btn.dataset.armed = '';
  }
  u.blacklist = [];
  updateUserData(currentUser, { blacklist: [] });
  safeFetch('/api/user-blacklist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ username: currentUser, blacklist: [] }),
  }).catch(() => {});
  showMessage('成功', '已清空黑名单');
  setTimeout(showProfile, 1000);
}
function addToFavorites(dishId) {
  if (!currentUser || currentUser === 'guest') {
    showMessage('提示', '请先登录');
    return;
  }
  const user = getUserData(currentUser);
  if (!user) {
    showMessage('错误', '无法获取用户信息');
    return;
  }
  if (!user.favorites) {
    user.favorites = [];
  }
  if (user.favorites.includes(dishId)) {
    showMessage('提示', '已收藏');
    return;
  }
  if (user.blacklist?.includes(dishId)) {
    user.blacklist = user.blacklist.filter((id) => id !== dishId);
    updateUserData(currentUser, { blacklist: user.blacklist });
    safeFetch('/api/user-blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ username: currentUser, blacklist: user.blacklist }),
    }).catch(() => {});
  }
  user.favorites.push(dishId);
  updateUserData(currentUser, { favorites: user.favorites });
  const dish = dishData.find((d) => d.id === dishId);
  showMessage(L('成功', 'Done'), L('已收藏' + (dish ? dish.name : ''), 'Favorited ' + (dish ? dish.name : '')));
  safeFetch('/api/user-favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ username: currentUser, favorites: user.favorites }),
  }).catch(() => {});
  displayRecommendations();
}
function addToBlacklist(dishId) {
  if (!currentUser || currentUser === 'guest') {
    showMessage('提示', '请先登录');
    return;
  }
  const user = getUserData(currentUser);
  if (!user) {
    showMessage('错误', '无法获取用户信息');
    return;
  }
  if (!user.blacklist) {
    user.blacklist = [];
  }
  if (user.blacklist.includes(dishId)) {
    showMessage('提示', '已拉黑');
    return;
  }
  if (user.favorites?.includes(dishId)) {
    user.favorites = user.favorites.filter((id) => id !== dishId);
    updateUserData(currentUser, { favorites: user.favorites });
    safeFetch('/api/user-favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ username: currentUser, favorites: user.favorites }),
    }).catch(() => {});
  }
  user.blacklist.push(dishId);
  updateUserData(currentUser, { blacklist: user.blacklist });
  const dish = dishData.find((d) => d.id === dishId);
  showMessage(L('成功', 'Done'), L('已拉黑' + (dish ? dish.name : ''), 'Blocked ' + (dish ? dish.name : '')));
  safeFetch('/api/user-blacklist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ username: currentUser, blacklist: user.blacklist }),
  }).catch(() => {});
  displayRecommendations();
}
function deleteAccount() {
  const el = document.getElementById('message-modal'),
    cf = document.getElementById('modal-confirm-btn'),
    cb = document.getElementById('modal-close-btn');
  document.getElementById('modal-title').textContent = '确认注销';
  document.getElementById('modal-body').innerHTML =
    '确定要注销账号吗？此操作不可恢复！<input type="password" id="delete-pw-input" class="form-control mt-2" placeholder="输入登录密码确认" autocomplete="off" style="text-align:center;">';
  const origCf = cf.onclick,
    origCb = cb.onclick;
  const cleanup = () => {
    cf.onclick = origCf;
    cb.onclick = origCb;
    el.removeEventListener('hidden.bs.modal', cleanup);
  };
  cf.onclick = function () {
    const username = currentUser;
    const pwInput = document.getElementById('delete-pw-input');
    const pw = pwInput ? (pwInput.value || '').trim() : '';
    if (!pw) {
      if (pwInput) {
        pwInput.style.borderColor = '#e74c3c';
        pwInput.focus();
      }
      return;
    }
    safeFetch('/api/user/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ username: username, password: pw }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          removeUser(username);
          currentUser = null;
          localStorage.removeItem('currentUser');
          localStorage.removeItem('userToken');
          resetRecommendation();
          // 立即回首页（2026-10-14：仅靠弹窗关闭回调曾出现注销后主区空白、需手动刷新）
          showSection('home-section');
          const m = bootstrap.Modal.getInstance(el);
          if (m) {
            m.hide();
          }
          cleanup();
          setTimeout(() => {
            showMessage('成功', '账号已注销', function () {
              showSection('home-section');
            });
          }, 300);
        } else {
          showMessage('注销失败', d.error || '服务器错误');
        }
      })
      .catch(() => {
        showMessage('网络错误', '注销请求失败，请稍后重试');
      });
  };
  cb.onclick = function () {
    const m = bootstrap.Modal.getInstance(el);
    if (m) {
      m.hide();
    }
    cleanup();
  };
  el.addEventListener('hidden.bs.modal', cleanup);
  el.inert = false;
  el.removeAttribute('aria-hidden');
  let m = bootstrap.Modal.getInstance(el);
  if (!m) {
    m = new bootstrap.Modal(el, { focus: false });
  }
  m.show();
  setTimeout(() => {
    const p = document.getElementById('delete-pw-input');
    if (p) {
      p.focus();
    }
  }, 300);
  // 聚焦确认按钮
  el.addEventListener('shown.bs.modal', function focusDelHandler() {
    el.removeEventListener('shown.bs.modal', focusDelHandler);
    const confirmBtn = document.getElementById('modal-confirm-btn');
    if (confirmBtn) {
      setTimeout(function () {
        confirmBtn.focus();
      }, 50);
    }
  });
}
