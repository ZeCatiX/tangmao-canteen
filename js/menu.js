// 菜单渲染域(2026-10-19 自 core.js 拆出): 分类元数据/分类UI/菜品详情/购物数量步进/菜单表格渲染
// 纯整体搬移零逻辑改动;构建顺序见 build.js(共享顶层全局,内联 onclick 依赖顶层函数名)

// ─── 分类元数据（唯一配置源：分类新增/改名只需改这里，下拉框/快捷按钮/图标/排序全部自动生成）───
const CATEGORY_CONFIG = [
  { cat: '主食', emoji: '🍚', tab: '', icon: 'assets/icons/cat-staple.webp' },
  { cat: '招牌与游西安必打卡', emoji: '🏆', tab: '招牌', icon: 'assets/icons/cat-signature.webp' },
  { cat: '热销菜品', emoji: '🔥', tab: '热销', icon: 'assets/icons/cat-hot.webp' },
  { cat: '传承陕菜', emoji: '🍲', tab: '陕菜', icon: 'assets/icons/cat-heritage.webp' },
  { cat: '江湖海鲜', emoji: '🦐', tab: '海鲜', icon: 'assets/icons/cat-seafood.webp' },
  { cat: '田园时蔬·汤羹', emoji: '🥬', tab: '蔬羹', icon: 'assets/icons/cat-veggies.webp' },
  { cat: '特色凉菜', emoji: '🥗', tab: '凉菜', icon: 'assets/icons/cat-cold.webp' },
  { cat: '陕西小吃', emoji: '🥟', tab: '小吃', icon: 'assets/icons/cat-snacks.webp' },
  { cat: '飲品与酒水', emoji: '🍹', tab: '饮品', icon: 'assets/icons/cat-drinks.webp' },
];
function catOrderOf(cat) {
  const i = CATEGORY_CONFIG.findIndex((c) => c.cat === cat);
  return i === -1 ? 999 : i;
}
function catEmojiOf(cat) {
  const m = CATEGORY_CONFIG.find((c) => c.cat === cat);
  return m ? m.emoji : '🍽';
}
function catIconOf(cat) {
  const m = CATEGORY_CONFIG.find((c) => c.cat === cat);
  return m && m.icon
    ? '<img src="' +
        m.icon +
        '" alt="" loading="lazy" style="width:22px;height:22px;border-radius:50%;vertical-align:-5px;margin-right:6px;box-shadow:0 1px 3px rgba(139,0,0,.25);">'
    : catEmojiOf(cat) + ' ';
}
function catTabLabelOf(cat) {
  const m = CATEGORY_CONFIG.find((c) => c.cat === cat);
  const tab = m && m.tab ? m.tab : cat;
  return menuLang === 'en' && TAB_EN[tab] ? TAB_EN[tab] : tab;
}
// 从菜品实际分类生成分类 UI；分类集合变化时自动重建并保留当前选中
function buildCategoryUI() {
  const cats = [...new Set(dishData.map((d) => d.category).filter(Boolean))].sort(
    (a, b) => catOrderOf(a) - catOrderOf(b) || a.localeCompare(b, 'zh')
  );
  // 签名含语言：切换中英时分类 chips/select 也要按新语言重建（曾只比对分类集合，切语言后 chips 残留中文）
  const key = cats.join('|') + '|' + menuLang;
  const tabs = document.getElementById('category-tabs');
  if (tabs && tabs.dataset.cats !== key) {
    const cur = (tabs.querySelector('.cat-tab.active') || { dataset: {} }).dataset.cat || '';
    tabs.innerHTML =
      '<button class="btn btn-sm cat-tab" data-cat="" style="border-radius:20px;padding:4px 14px;font-size:0.82rem;">' +
      (menuLang === 'en' ? 'All' : '全部') +
      '</button>' +
      cats
        .map(
          (c) =>
            '<button class="btn btn-sm cat-tab" data-cat="' +
            esc(c) +
            '" style="border-radius:20px;padding:4px 14px;font-size:0.82rem;">' +
            esc(catTabLabelOf(c)) +
            '</button>'
        )
        .join('');
    tabs.dataset.cats = key;
    tabs.querySelectorAll('.cat-tab').forEach((t) => {
      const on = t.dataset.cat === cur;
      t.classList.toggle('active', on);
      t.style.background = on ? 'var(--primary)' : 'transparent';
      t.style.color = on ? '#fff' : 'var(--text)';
      t.style.border = on ? 'none' : '1px solid var(--gold-light)';
    });
  }
  const sel = document.getElementById('menu-filter-cat');
  if (sel && sel.dataset.cats !== key) {
    const cur = sel.value;
    sel.innerHTML =
      '<option value="">' +
      (menuLang === 'en' ? 'All categories' : '全部分类') +
      '</option>' +
      cats.map((c) => '<option value="' + esc(c) + '">' + esc(catNameOf(c)) + '</option>').join('');
    sel.dataset.cats = key;
    if (cur && cats.includes(cur)) sel.value = cur;
  }
}
// B8 菜品详情弹层：点菜名看大图/描述/过敏源/热量/口味
function showDishDetail(id) {
  const d = dishData.find((x) => x.id === id);
  if (!d) return;
  // 规格组重聚: 虚拟主卡(同基础名规格互并)的 _variants 挂在渲染期克隆上,详情按同一规则重聚,
  // 否则弹窗丢规格(如一口脆虾球原味/芥末味、华山论剑年份、八宝茶壶)
  const nm = String(d.name || '');
  const vm = nm.match(/^(.+)\(([^()]+)\)$/);
  let specList, h4Name;
  if (vm) {
    const base = vm[1];
    const group = dishData
      .filter((x) => x.is_active !== false && String(x.name || '').indexOf(base + '(') === 0)
      .sort((a, b) => a.id - b.id);
    specList = group.map((x) =>
      Object.assign({}, x, { name: base, _flavorLabel: (String(x.name).match(/\(([^()]+)\)$/) || [])[1] })
    );
    h4Name = base;
  } else if (d._variants && d._variants.length) {
    specList = [d].concat(d._variants);
    h4Name = dishNameOf(d);
  } else {
    specList = [d];
    h4Name = dishNameOf(d);
  }
  const old = document.getElementById('dish-detail-modal');
  if (old) old.remove();
  const al = d.allergies || {};
  const alTags = [
    ['seafood', '海鲜'],
    ['peanut', '花生'],
    ['egg', '鸡蛋'],
    ['soy', '大豆'],
    ['gluten', '麸质'],
  ]
    .filter((a) => al[a[0]])
    .map(
      (a) =>
        '<span style="background:rgba(192,57,43,0.12);color:#c0392b;font-size:0.72rem;padding:2px 8px;border-radius:10px;margin-right:4px;">⚠ ' +
        a[1] +
        '</span>'
    )
    .join('');
  const imgHtml =
    d.image_url && (d.image_url.startsWith('/') || d.image_url.startsWith('http'))
      ? '<img src="' +
        esc(d.image_url) +
        '" style="width:100%;max-height:260px;object-fit:cover;border-radius:10px;" alt="' +
        esc(d.name) +
        '" loading="lazy" onerror="this.style.display=\'none\'">'
      : d.image_url
        ? '<div style="font-size:5rem;text-align:center;">' + esc(d.image_url) + '</div>'
        : '';
  /* 规格行=可点选的选项(选中高亮),底部大按钮加"选中的"规格——标准电商SKU选择交互 */
  const selId0 = specList[0].id;
  const specs =
    specList.length > 1 || specList[0] !== d
      ? '<div style="margin:10px 0;"><div style="font-size:0.8rem;color:#8b7a6a;margin-bottom:4px;">可选规格</div>' +
        specList
          .map(
            (v) =>
              '<div class="dish-detail-spec' +
              (v.id === selId0 ? ' selected' : '') +
              '" data-sel-id="' +
              v.id +
              '" style="display:flex;justify-content:space-between;align-items:center;font-size:0.85rem;padding:5px 8px;border-bottom:1px dashed #eee;gap:6px;cursor:pointer;"><span>' +
              esc(v._flavorLabel || '标准') +
              '</span><span style="display:inline-flex;align-items:center;gap:8px;">' +
              esc(formatPrice(v)) +
              '</span></div>'
          )
          .join('') +
        '<div style="font-size:0.75rem;color:#8b7a6a;margin-top:4px;">点击规格选择后加入购物车</div></div>'
      : '';
  let selId = selId0;
  const modal = document.createElement('div');
  modal.id = 'dish-detail-modal';
  modal.innerHTML =
    '<div class="modal fade" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content" style="border-radius:14px;overflow:hidden;">' +
    '<button type="button" class="btn-close" data-bs-dismiss="modal" style="position:absolute;top:10px;right:10px;z-index:10;background-color:rgba(255,255,255,0.9);border-radius:50%;padding:8px;"></button>' +
    imgHtml +
    '<div class="modal-body" style="padding:16px 20px;">' +
    '<h4 style="font-family:\'Noto Serif SC\',serif;font-weight:700;">' +
    esc(h4Name) +
    (d.tags && d.tags.includes('招牌')
      ? ' <span style="background:var(--primary-accent);color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:10px;vertical-align:middle;">招牌</span>'
      : '') +
    '</h4>' +
    '<p style="color:#8b7a6a;font-size:0.85rem;">' +
    esc(catNameOf(d.category)) +
    ' · ' +
    esc(menuLang === 'en' ? SPICE_EN[d.spiciness] || d.spiciness : d.spiciness) +
    ' · ' +
    (menuLang === 'en'
      ? 'Salt ' +
        (SALT_EN[d.saltiness] || d.saltiness) +
        ' · Sweet-sour ' +
        (SWEET_EN[d.sweetness] || d.sweetness) +
        ' · Calories ' +
        (CAL_EN[d.calorie] || d.calorie || 'Unknown')
      : '咸淡' + esc(d.saltiness) + ' · 甜酸' + esc(d.sweetness) + ' · 热量' + esc(d.calorie || '未知')) +
    '</p>' +
    (menuLang === 'en' && d.description_en
      ? '<p style="font-size:0.9rem;color:var(--text);">' + esc(d.description_en) + '</p>'
      : '') +
    (d.description ? '<p style="font-size:0.9rem;">' + esc(d.description) + '</p>' : '') +
    '<div style="font-size:1.2rem;color:var(--primary);font-weight:700;margin:6px 0;">' +
    esc(formatPrice(d)) +
    '</div>' +
    specs +
    (alTags
      ? '<div style="margin:10px 0;"><div style="font-size:0.8rem;color:#8b7a6a;margin-bottom:4px;">' +
        (menuLang === 'en' ? 'Allergens' : '含过敏源') +
        '</div>' +
        alTags +
        '</div>'
      : '') +
    '<div style="margin-top:10px;font-size:0.8rem;color:#8b7a6a;">' +
    (d.is_sold_out === true
      ? menuLang === 'en'
        ? '⚠ Sold out today'
        : '⚠ 今日已售罄'
      : menuLang === 'en'
        ? '✅ Orderable now'
        : '✅ 可正常点餐') +
    (d.serving ? ' · ' + esc(specLang(d.serving)) : '') +
    '</div>' +
    '<div style="margin-top:12px;"><button class="btn add-to-cart-btn w-100" data-id="' +
    selId +
    '"' +
    ((specList[0] && specList[0].is_sold_out === true) || d.is_sold_out === true
      ? ' disabled style="background:#ccc;color:#888;border:none;border-radius:8px;padding:10px;font-weight:600;"'
      : ` style="background:var(--primary-accent);color:#fff;border:none;border-radius:8px;padding:10px;font-weight:600;letter-spacing:2px;"`) +
    '>' +
    (d.is_sold_out === true
      ? menuLang === 'en'
        ? 'Sold out'
        : '已售罄'
      : menuLang === 'en'
        ? 'Add to cart'
        : '加入购物车') +
    '</button></div>' +
    '</div></div></div></div>';
  document.body.appendChild(modal);
  const el = modal.querySelector('.modal');
  let m = bootstrap.Modal.getInstance(el);
  if (!m) m = new bootstrap.Modal(el);
  // 弹窗开关时背景页滚动会跳(bootstrap焦点管理+浏览器滚动锚定),显式钉住滚动位置
  const _sy = window.scrollY;
  const pinScroll = () => window.scrollTo(0, _sy);
  el.addEventListener('shown.bs.modal', pinScroll);
  el.addEventListener('hidden.bs.modal', pinScroll);
  el.addEventListener(
    'hidden.bs.modal',
    function () {
      modal.remove();
    },
    { once: true }
  );
  // 规格行点击=选中SKU:高亮+底部大按钮切到该规格(含售罄禁用)
  el.addEventListener('click', function (e) {
    const spec = e.target.closest('.dish-detail-spec');
    if (spec && spec.dataset.selId) {
      selId = parseInt(spec.dataset.selId, 10);
      modal.querySelectorAll('.dish-detail-spec').forEach((x) => x.classList.toggle('selected', x === spec));
      const sp = specList.find((v) => v.id === selId);
      const big = el.querySelector('.add-to-cart-btn.w-100');
      if (big && sp) {
        const so = sp.is_sold_out === true;
        big.dataset.id = String(selId);
        big.disabled = so;
        big.style.background = so ? '#ccc' : 'var(--primary-accent)';
        big.style.color = so ? '#888' : '#fff';
      }
      return;
    }
    if (e.target.closest('.add-to-cart-btn') && !e.target.disabled) {
      const inst = bootstrap.Modal.getInstance(el);
      setTimeout(function () {
        inst && inst.hide();
      }, 350);
    }
  });
  m.show();
}

// 数量步进器统一渲染(菜单普通卡/规格行/局部刷新共用唯一副本——改样式只改这里)
function qtyStepperHtml(id, qty) {
  return (
    '<div class="d-flex align-items-center gap-1"><button class="btn btn-sm btn-outline-secondary cart-qty-minus" data-id="' +
    id +
    '" style="padding:2px 8px;border-radius:6px;font-weight:700;">－</button><span style="font-weight:700;min-width:20px;text-align:center;">' +
    qty +
    '</span><button class="btn btn-sm btn-outline-success cart-qty-plus add-to-cart-btn" data-id="' +
    id +
    '" style="padding:2px 8px;border-radius:6px;font-weight:700;">＋</button></div>'
  );
}
// 局部刷新:菜单里受影响菜品卡的数量控件原地更新,不做全表重绘(根治加购闪烁,2026-10-12)。
// 返回 true=已局部更新;false=形态超出局部能力(如售罄态),调用方回退 renderMenuTable() 全量重绘。
function refreshMenuCardCtrl(id) {
  const idStr = String(id);
  const card = (
    document.querySelector('#dataset-table-body .cart-qty-plus[data-id="' + idStr + '"]') ||
    document.querySelector('#dataset-table-body .cart-qty-minus[data-id="' + idStr + '"]') ||
    document.querySelector('#dataset-table-body .add-to-cart-btn[data-id="' + idStr + '"]')
  )?.closest('.dish-card');
  if (!card) return false;
  const qty = (getCart().find((c) => c.id === id) || {}).qty || 0;
  if (qty > 0) {
    // 已有步进器:数量文本原地改(最高频路径,零重排)
    const span = card.querySelector('.cart-qty-minus[data-id="' + idStr + '"] + span');
    if (span) {
      span.textContent = String(qty);
      return true;
    }
    // 首次加入:＋加入按钮原位换步进器
    const join = card.querySelector('.add-to-cart-btn[data-id="' + idStr + '"]');
    if (join) {
      join.outerHTML = qtyStepperHtml(idStr, qty);
      return true;
    }
    return false;
  }
  // 数量归零(规格下限触发移除):步进器原位换回＋加入
  const minus = card.querySelector('.cart-qty-minus[data-id="' + idStr + '"]');
  if (minus) {
    minus.parentElement.outerHTML =
      '<button class="btn btn-sm add-to-cart-btn" data-id="' +
      idStr +
      '" style="background:var(--primary);color:#fff;border:none;border-radius:6px;padding:4px 14px;font-weight:600;">＋<span class="add-txt"> 加入</span></button>';
    return true;
  }
  return false;
}
function renderMenuTable() {
  const container = document.getElementById('dataset-table-body');
  if (!container) return;
  // 如果 dishData 为空，最多重试 3 次
  if (!dishData || !dishData.length) {
    if (!renderMenuTable._retryCount) renderMenuTable._retryCount = 0;
    if (renderMenuTable._retryCount < 3) {
      renderMenuTable._retryCount++;
      setTimeout(renderMenuTable, 1000);
    }
    return;
  }
  renderMenuTable._retryCount = 0;
  buildCategoryUI();
  const q = document.getElementById('menu-search')?.value?.trim().toLowerCase() || '';
  const cat = document.getElementById('menu-filter-cat')?.value || '';
  const spice = document.getElementById('menu-filter-spice')?.value || '';
  const priceRange = document.getElementById('menu-filter-price')?.value || '';
  const sorted = [...dishData].sort((a, b) => catOrderOf(a.category) - catOrderOf(b.category) || a.id - b.id);
  const filtered = sorted.filter((d) => {
    if (q && !d.name.toLowerCase().includes(q)) return false;
    if (cat && d.category !== cat) return false;
    if (spice && d.spiciness !== spice) return false;
    if (priceRange) {
      const p = parseFloat(d.price);
      if (isNaN(p)) return false;
      const [lo, hi] = priceRange.split('-').map(Number);
      if (p < lo || p >= hi) return false;
    }
    return true;
  });
  const sortVal = document.getElementById('menu-sort')?.value || '';
  if (sortVal === 'popular') filtered.sort((a, b) => (b.order_count || 0) - (a.order_count || 0));
  else if (sortVal === 'rating') filtered.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
  else if (sortVal === 'price_asc') filtered.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  else if (sortVal === 'price_desc') filtered.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  const cart = getCart();
  // 按分类分组渲染，每组加分隔标题
  let html = '';
  let lastCat = '',
    lastSub = '';
  const SUB_EMOJI = {
    特调饮品: '🍸',
    花酒天地: '🥂',
    茶饮: '🍵',
    一醉千年: '🏺',
    葡萄酒: '🍷',
    液体面包: '🍺',
    缤纷饮品: '🍹',
  };
  const SUBS = ['特调饮品', '花酒天地', '茶饮', '一醉千年', '葡萄酒', '液体面包', '缤纷饮品'];
  // 规格 variant 合并: "X(壶)" 行并入同名主行 "X" 的卡片(与纸质菜单一行双价排版一致)
  // 注意: 变体挂在全局 dishData 对象引用上, 每次渲染前必须清残留, 否则重复叠加
  filtered.forEach((d) => {
    delete d._variants;
  });
  const byName = {};
  filtered.forEach((d) => {
    byName[d.name] = d;
  });
  const consumedVariants = new Set();
  filtered.forEach((d) => {
    const m = d.name.match(/^(.+)\(([^()]+)\)$/);
    if (m && byName[m[1]]) {
      const main = byName[m[1]];
      main._variants = main._variants || [];
      if (!main._variants.some((v) => v.id === d.id)) main._variants.push(d);
      consumedVariants.add(d.id);
    }
  });
  // 美团式口味规格: 无裸名主行的同基础名规格(如虾球原味/芥末味、华山论剑年份)互并成一张虚拟主卡,
  // 标题取基础名, 规格行标签取括号后缀
  const virtualById = {};
  (() => {
    const groups = {};
    filtered.forEach((d) => {
      if (consumedVariants.has(d.id)) return;
      const m = d.name.match(/^(.+)\(([^()]+)\)$/);
      if (m) (groups[m[1]] = groups[m[1]] || []).push(d);
    });
    Object.keys(groups).forEach((base) => {
      const g = groups[base];
      const clone = Object.assign({}, g[0], { name: base, _flavorLabel: (g[0].name.match(/\(([^()]+)\)$/) || [])[1] });
      clone._variants = g.slice(1);
      virtualById[g[0].id] = clone;
      for (let i = 1; i < g.length; i++) consumedVariants.add(g[i].id);
    });
  })();
  filtered.forEach((rawD) => {
    const d = virtualById[rawD.id] || rawD;
    if (consumedVariants.has(rawD.id)) return;
    if (d.category !== lastCat) {
      lastCat = d.category;
      lastSub = '';
      html += '<div class="dish-cat-sep">' + catIconOf(d.category) + esc(catNameOf(d.category)) + '</div>';
    }
    // 飲品与酒水二级分隔
    if (d.category === '飲品与酒水') {
      const sub = d.tags && d.tags.find((t) => SUBS.includes(t));
      if (sub && sub !== lastSub) {
        lastSub = sub;
        html +=
          '<div class="dish-sub-sep">' +
          (SUB_EMOJI[sub] || '·') +
          ' ' +
          esc(menuLang === 'en' ? SUB_EN[sub] || sub : sub) +
          '</div>';
      }
    }
    const ci = cart.find((c) => c.id === d.id);
    const qty = ci ? ci.qty || 1 : 0;
    const defaultImg = '/assets/illustrations/missing-dish-cat.webp';
    const imgUrl =
      d.image_url && (d.image_url.startsWith('/') || d.image_url.startsWith('http'))
        ? (function () {
            const src = esc(d.image_url);
            const thumb =
              d.image_url.startsWith('/uploads/') && !d.image_url.includes('thumbs/')
                ? '/uploads/thumbs/' +
                  d.image_url
                    .split('/')
                    .pop()
                    .replace(/\.[^.]+$/, '') +
                  '.webp'
                : src;
            return (
              '<img src="' +
              thumb +
              '" onclick="showDishDetail(' +
              d.id +
              ')" style="width:100%;height:160px;border-radius:10px;object-fit:cover;cursor:pointer;" title="' +
              (menuLang === 'en' ? 'View photo' : '查看大图') +
              '" alt="' +
              esc(d.name) +
              '" loading="lazy" onerror="if(this.src.indexOf(\'/thumbs/\')>-1){this.src=\'' +
              src +
              "';}else{this.onerror=null;this.src='" +
              defaultImg +
              '\';}">'
            );
          })()
        : d.image_url
          ? '<span class="dish-emoji" onclick="showDishDetail(' +
            d.id +
            ')" style="font-size:4rem;display:flex;align-items:center;justify-content:center;height:160px;cursor:pointer;" title="' +
            (menuLang === 'en' ? 'View details' : '查看详情') +
            '">' +
            esc(d.image_url) +
            '</span>'
          : '';
    const star =
      d.tags && d.tags.includes('招牌')
        ? '<span class="badge" style="background:var(--primary-accent);color:#fff;font-size:0.65rem;">' +
          (menuLang === 'en' ? 'Signature' : '招牌') +
          '</span> '
        : '';
    // 价格+加购区: 有规格变体时逐规格一行(各带加购), 否则单行
    const unitLabel = (d) => {
      const u = (d.price_unit || '/份').replace(/^\//, '');
      return menuLang === 'en' ? (UNIT_EN['/' + u] || '/' + u).replace(/^\//, '') : u;
    };
    // 规格行标签: 口味类取名字括号后缀(原味/芥末味/壶/年份), 其余退回单位(盖碗/6只)
    const specLabel = (d2) => {
      if (d2._flavorLabel) return d2._flavorLabel;
      const m = String(d2.name || '').match(/\(([^()]+)\)$/);
      return m ? m[1] : unitLabel(d2);
    };
    const specRow = (d2) => {
      const c2 = cart.find((c) => c.id === d2.id);
      const q2 = c2 ? c2.qty || 1 : 0;
      const so = d2.is_sold_out === true;
      const ctrl = so
        ? '<span style="font-size:0.8rem;color:#b3261e;background:rgba(179,38,30,0.08);padding:3px 10px;border-radius:10px;white-space:nowrap;">已售罄</span>'
        : q2 > 0
          ? '<span class="d-inline-flex align-items-center gap-1">' + qtyStepperHtml(d2.id, q2) + '</span>'
          : '<button class="btn btn-sm add-to-cart-btn" data-id="' +
            d2.id +
            '" title="' +
            (menuLang === 'en' ? 'Add' : '加入购物车') +
            '" style="background:var(--primary);color:#fff;border:none;border-radius:6px;padding:2px 10px;font-weight:600;white-space:nowrap;">＋<span class="add-txt"> 加入</span></button>';
      return (
        '<div class="d-flex justify-content-between align-items-center spec-row" style="margin-top:4px;gap:6px;' +
        (so ? 'opacity:0.65;' : '') +
        '"><span style="font-size:0.85rem;color:var(--text-light);white-space:nowrap;">' +
        esc(specLang(specLabel(d2))) +
        '</span><span style="display:inline-flex;align-items:center;gap:8px;"><strong style="color:var(--primary);font-size:1rem;white-space:nowrap;' +
        (so ? 'text-decoration:line-through;' : '') +
        '">' +
        esc(formatPrice(d2)) +
        '</strong>' +
        ctrl +
        '</span></div>'
      );
    };
    let priceBlock;
    if (d._variants && d._variants.length) {
      priceBlock =
        '<div style="margin-top:6px;">' + specRow(d) + d._variants.map((v) => specRow(v)).join('') + '</div>';
    } else if (d.is_sold_out === true) {
      priceBlock =
        '<div class="d-flex justify-content-between align-items-center" style="margin-top:6px;opacity:0.75;"><span style="font-size:0.85rem;color:#b3261e;background:rgba(179,38,30,0.08);padding:3px 10px;border-radius:10px;">今日已售罄</span><strong style="color:var(--text-light);font-size:1.05rem;text-decoration:line-through;">' +
        esc(formatPrice(d)) +
        '</strong></div>';
    } else {
      priceBlock =
        '<div class="d-flex justify-content-between align-items-center"><strong style="color:var(--primary);font-size:1.05rem;">' +
        esc(formatPrice(d)) +
        '</strong>' +
        (qty > 0
          ? qtyStepperHtml(d.id, qty)
          : '<button class="btn btn-sm add-to-cart-btn" data-id="' +
            d.id +
            '" style="background:var(--primary);color:#fff;border:none;border-radius:6px;padding:4px 14px;font-weight:600;">＋ 加入</button>') +
        '</div>';
    }
    html +=
      '<div class="dish-card"' +
      (d.is_sold_out === true && !d._variants ? ' style="opacity:0.6;"' : '') +
      '>' +
      imgUrl +
      '<div class="dish-card-body"><h6 style="font-family:Noto Serif SC,serif;font-weight:600;margin:8px 0 4px;cursor:pointer;" onclick="showDishDetail(' +
      d.id +
      ')" title="查看详情">' +
      (d.is_sold_out === true && !d._variants
        ? '<span style="background:#8f2318;color:#fff;font-size:0.65rem;padding:1px 6px;border-radius:4px;margin-right:4px;">' +
          (menuLang === 'en' ? 'Sold out' : '已售罄') +
          '</span>'
        : '') +
      star +
      esc(dishNameOf(d)) +
      '</h6><p style="font-size:0.78rem;color:var(--text-light);margin:0 0 8px;">' +
      esc(catNameOf(d.category)) +
      ' · ' +
      esc(menuLang === 'en' ? SPICE_EN[d.spiciness] || d.spiciness : d.spiciness) +
      (d.serving ? ' · <span style="color:#e67e22;">' + esc(specLang(d.serving)) + '</span>' : '') +
      '</p>' +
      priceBlock +
      '</div></div>';
  });
  if (!filtered.length) {
    // 空态: 搜索/筛选无结果时给出明确反馈与引导
    const kw = q ? esc(q) : '';
    const hint = q
      ? menuLang === 'en'
        ? 'The cat looked everywhere — no "' + kw + '" on the menu'
        : '唐猫找了一圈，没有找到「' + kw + '」'
      : menuLang === 'en'
        ? 'No dishes match the current filters'
        : '当前筛选条件下没有菜品';
    container.innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:40px 16px;color:var(--text-light);">' +
      '<img src="/assets/illustrations/search-empty-cat.webp" alt="唐猫拿着放大镜在菜单里寻找" loading="lazy" style="width:240px;display:block;margin:0 auto 10px;border-radius:12px;">' +
      '<p style="font-size:1.05rem;color:var(--ink);margin:0 0 6px;">' +
      hint +
      '</p>' +
      '<p style="font-size:0.85rem;margin:0;">' +
      (menuLang === 'en' ? 'Try another keyword, or reset the filters' : '换个关键词，或清除筛选条件再试试') +
      '</p>' +
      '</div>';
    document.getElementById('menu-count').textContent = '0/' + dishData.length;
    return;
  }
  container.innerHTML = '<div class="dish-grid">' + html + '</div>';
  document.getElementById('menu-count').textContent = filtered.length + '/' + dishData.length;
  // 选饮品模式横幅随菜单重绘恢复（renderMenuTable 会重绘菜单容器周边 DOM）
  if (typeof renderDrinksModeBanner === 'function') renderDrinksModeBanner();
}
