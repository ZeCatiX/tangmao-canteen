
// ═══════════════ 全局变量与工具函数 ═══════════════
// 唐猫庭院 - 菜品推荐系统 v2.0
var currentUser=null,userProfile=null,currentRecommendations=[],recommendedIds=[];
var currentRecommendationMode='本地计算'; var featureImportanceChart=null;
var decisionTreeModel=null,decisionTreeLoaded=false,decisionTreeLoading=false;
var apiAvailabilityCache=null,apiCacheTimestamp=0;
var dishData=[];  // 菜品数据，从API加载
// 客户端菜品准入：下架的与名称含「测试」的脏数据一律不进 dishData（防测试菜露出到菜单/推荐/盲盒）
function filterVisibleDishes(list){return (list||[]).filter(x=>x.is_active!==false&&!(x.name||'').includes('测试'));}
var starRatingDish=null,starRatingValue=0,ratingReturnTo='recommendation-section';  // 全局评分状态
var _initialized=false;
// 页面初始查询串（showSection 的 pushState 会抹掉它，桌码解析需要提前捕获）
var __initialSearch=(typeof location!=='undefined'&&location.search)||'';
const API_CACHE_DURATION=30000;
const $=id=>document.getElementById(id);
// HTML 转义，防止 XSS
function esc(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// 价格格式化：数字 → "88元"，null/undefined → "未知"
function formatPrice(d){const p=(d&&typeof d==='object')?d.price:d;if(p===null||p===undefined||p==='')return'未知';return parseFloat(p).toFixed(0)+'元'+((d&&d.price_unit)||'');}
// 获取用户认证头
function authHeaders(){const t=localStorage.getItem('userToken');return t?{'Authorization':'Bearer '+t}:{};}
const DEFAULT_DISH_IMG='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23fdf6f0%22/%3E%3Ctext x=%2250%22 y=%2260%22 text-anchor=%22middle%22 font-size=%2236%22%3E🍜%3C/text%3E%3C/svg%3E';
function dishImg(url,size,alt){size=size||50;const u=url||'';const st='width:'+size+'px;height:'+size+'px;border-radius:6px;object-fit:cover;';const st2='width:'+size+'px;height:'+size+'px;display:inline-flex;align-items:center;justify-content:center;font-size:'+Math.round(size*0.6)+'px;';if(u.startsWith('/uploads/')||u.startsWith('data:'))return '<img src="'+esc(u)+'" style="'+st+'" alt="'+esc(alt||'')+'" loading="lazy">';if(u)return '<span style="'+st2+'">'+esc(u)+'</span>';return '<img src="'+DEFAULT_DISH_IMG+'" style="'+st+'" alt="'+esc(alt||'')+'" loading="lazy">';}

// 订单/桌号状态存 sessionStorage（一次浏览会话内有效：跳走/刷新保留，关标签重开=新用餐自动干净）
function ssGet(k){return sessionStorage.getItem(k)}
function ssSet(k,v){try{sessionStorage.setItem(k,v)}catch(e){}}
function ssRemove(k){sessionStorage.removeItem(k)}
function ssRemovePrefix(prefix){try{Object.keys(sessionStorage).filter(k=>k.startsWith(prefix)).forEach(k=>sessionStorage.removeItem(k));}catch(e){}}
// 安全 fetch 包装器：自动处理 401 登录过期和网络错误
function safeFetch(url, opts) {
  const fetcher = opts?.method
    ? fetch(url, opts)
    : (typeof url === 'string' ? fetch(url, opts) : url);
  return fetcher.then(r => {
    if (r.status === 401 && localStorage.getItem('userToken')) {
      localStorage.removeItem('userToken');
      localStorage.removeItem('currentUser');
      showMessage('登录已过期', '请重新登录');
    }
    return r;
  }).catch(e => {
    console.warn('网络请求失败:', url, e.message);
    return new Response(JSON.stringify({ success: false, error: '网络请求失败' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  });
}
// ═══════════════ 购物车功能 ═══════════════
function getCart(){try{return JSON.parse(localStorage.getItem('cart')||'[]')}catch(e){return[]}}
function saveCart(c){try{localStorage.setItem('cart',JSON.stringify(c))}catch(e){};if(typeof updateCartBadge==='function')updateCartBadge();}
function minQtyOf(dish){
 if(!dish)return 1;
 // 起售备注可能在 serving 或 description 字段（历史数据不一致）；量词不限于"个"——后台自建菜可能写 2盒起/3杯起
 const src=((dish.serving||'')+' '+(dish.description||''));
 const m=src.match(/(\d+)\s*[个盒杯碗瓶只块份包袋听支罐]?起/);
 return m?Math.max(1,parseInt(m[1],10)):1;
}
function addToCart(dish,qty){
 const cart=getCart();const i=cart.findIndex(x=>x.id===dish.id);
 const min=minQtyOf(dish);
 const q=typeof qty==='number'&&qty>0?qty:1;
 // 一席成宴选饮品模式：饮品自动挂到当前席面（先记录，再入车，保证浮窗/横幅读到最新）
 const inDrinksMode=typeof tableDrinksMode!=='undefined'&&tableDrinksMode!==null&&window.tableSets&&window.tableSets[tableDrinksMode]&&dish.category==='飲品与酒水';
 if(inDrinksMode){
  const s=window.tableSets[tableDrinksMode];
  s.chosenDrinkIds=s.chosenDrinkIds||[];
  if(!s.chosenDrinkIds.includes(dish.id))s.chosenDrinkIds.push(dish.id);
 }
 if(i>=0){cart[i].qty=(cart[i].qty||1)+q;saveCart(cart);updateCartBadge();}
 else{
  // 起售数量：首次加入按最小起售量（如核桃包3个起、迷你肉夹馍2个起）
  const add=Math.max(q,min);
  cart.push({id:dish.id,name:dish.name,price:dish.price,qty:add,image:dish.image_url||''});
  saveCart(cart);updateCartBadge();
  if(add>q)showMessage('已加入购物车','「'+dish.name+'」'+min+'个起售，已加 '+add+' 个',null,2500);
  else showMessage('已加入购物车','「'+dish.name+'」已加入购物车',null,2500);
 }
 if(inDrinksMode){
  const s=window.tableSets[tableDrinksMode];
  if(typeof recalcTableSetTotals==='function')recalcTableSetTotals(s);
  if(typeof renderDrinksModeBanner==='function')renderDrinksModeBanner();
 }
}
function addRiceToCart(){
  const rice = dishData.find(d => d.name === '五常大米饭');
  if(rice){
    addToCart(rice, 1);
    const btn = document.getElementById('add-rice-btn');
    if(btn){
      const ci = getCart().find(c => c.id === rice.id);
      const qty = ci ? (ci.qty || 1) : 1;
      btn.innerHTML = '<i class="bi bi-check-circle me-1"></i>已加 ' + qty;
    }
  } else {
    showMessage('提示','米饭数据未加载');
  }
}
function removeFromCart(id){
 const cart=getCart().filter(x=>x.id!==id);saveCart(cart);updateCartBadge();
}
function updateCartQty(id,qty){
 const cart=getCart();const i=cart.findIndex(x=>x.id===id);
 if(i<0)return;
 if(qty<=0){cart.splice(i,1);saveCart(cart);updateCartBadge();return;}
 // 起售数量保护：减到低于最小起售量时拦截（整件移除走 ✕ 删除按钮）
 const dish=dishData.find(d=>d.id===id);
 const min=minQtyOf(dish);
 if(qty<min){showMessage('起售数量','「'+(cart[i].name||'该菜品')+'」'+min+'个起售，数量不能低于 '+min+' 个');return;}
 cart[i].qty=qty;saveCart(cart);updateCartBadge();
}
function getCartCount(){return getCart().reduce((s,x)=>s+(x.qty||1),0)}
function getCartTotal(){return getCart().reduce((s,x)=>s+parseFloat(x.price||0)*(x.qty||1),0)}
function clearCart(){saveCart([]);updateCartBadge();}
function updateCartBadge(){
 const el=document.getElementById('cart-badge');
 if(el){const c=getCartCount();el.textContent=c;el.style.display=c>0?'inline':'none';}
 updateFloatBar();
}
function updateFloatBar(){
 const bar=document.getElementById('float-cart-bar');
 if(!bar)return;
 const c=getCartCount();
 const onEnd=document.getElementById('end-section')?.classList.contains('active');
 const onCart=document.getElementById('cart-section')?.classList.contains('active');
 const onMenu=document.getElementById('dataset-section')?.classList.contains('active');
 if(c>0&&!onEnd&&!onCart){
  bar.style.display='flex';
  document.getElementById('float-cart-count').textContent=c;
  document.getElementById('float-cart-total').textContent=getCartTotal();
  // 一席成宴选饮品模式：仅在菜单页可见时（选饮品现场）显示提示与返回席面按钮
  const drinksBack=document.getElementById('float-drinks-back');
  const dsEl=document.getElementById('dataset-section');
  const onMenu=dsEl?getComputedStyle(dsEl).display!=='none':false;
  let hint=document.getElementById('float-drinks-hint');
  if(drinksBack){
   const active=onMenu&&typeof tableDrinksMode!=='undefined'&&tableDrinksMode!==null&&window.tableSets&&window.tableSets[tableDrinksMode];
   drinksBack.style.display=active?'inline-block':'none';
   if(active){
    const s=window.tableSets[tableDrinksMode];
    const chosen=(s.chosenDrinkIds||[]).map(function(id){return getCart().find(function(x){return x.id===id;});}).filter(Boolean);
    if(!hint){hint=document.createElement('div');hint.id='float-drinks-hint';hint.style.cssText='font-size:0.85rem;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';bar.insertBefore(hint,bar.firstChild.nextSibling);}
    hint.style.display=active?'block':'none';
    hint.textContent='🍹 正在为「'+s.style+'」选饮品 · 已选 '+chosen.length+' 件';
   } else if(hint) hint.style.display='none';
  }
 } else bar.style.display='none';
}



// ═══ 中英双语（C11）：菜名/分类/描述按语言显示，切换记忆在 localStorage ═══
var menuLang = localStorage.getItem('menuLang') || 'zh';
var CAT_EN = { '主食': 'Staples', '招牌与游西安必打卡': 'Must-Try Signatures', '热销菜品': 'Best Sellers', '传承陕菜': 'Heritage Shaanxi', '江湖海鲜': 'Jianghu Seafood', '田园时蔬·汤羹': 'Greens & Soups', '特色凉菜': 'Signature Cold Dishes', '陕西小吃': 'Shaanxi Snacks', '飲品与酒水': 'Drinks & Wines', '凉菜凉拌': 'Cold Dishes', '汤粥糖水': 'Soups & Desserts', '主食小吃': 'Staples & Snacks', '甜品饮品': 'Desserts & Drinks', '海鲜水产': 'Seafood', '清爽素食': 'Light Vegetarian' };
function dishNameOf(d) {
  if (menuLang === 'en' && d) { if (d.name_en) return d.name_en; const m = String(d.name || '').match(/^(.+)\(([^()]+)\)$/); if (m && d.name_en) return d.name_en; }
  return (d && d.name) || '';
}
function catNameOf(c) { return menuLang === 'en' && CAT_EN[c] ? CAT_EN[c] : c; }
function toggleMenuLang() {
  menuLang = menuLang === 'zh' ? 'en' : 'zh';
  localStorage.setItem('menuLang', menuLang);
  const t = document.getElementById('lang-toggle-text'); if (t) t.textContent = menuLang === 'zh' ? 'EN' : '中';
  const sec = document.querySelector('.section.active');
  if (!sec) return;
  if (sec.id === 'dataset-section') renderMenuTable();
  else if (sec.id === 'recommendation-section') { if (typeof displayRecommendations === 'function') displayRecommendations(); }
  else if (sec.id === 'table-result-section') { if (typeof renderTableSets === 'function') renderTableSets(); }
  else if (sec.id === 'cart-section') { if (typeof showCart === 'function') showCart(); }
  else if (sec.id === 'profile-section') { if (typeof showProfile === 'function') showProfile(); }
  else if (sec.id === 'home-section') showSection('home-section');
}
