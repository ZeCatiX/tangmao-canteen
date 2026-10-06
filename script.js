// ─── js/globals.js ───

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
  else if (sec.id === 'home-section') showSection('home-section');
}

// ─── js/core.js ───
// 核心功能模块
async function loadDecisionTreeModel(){
 if(decisionTreeLoaded||decisionTreeLoading)return decisionTreeLoaded;
 decisionTreeLoading=true;
 try{
  const r=await fetch('decision_tree_model.json',{cache:'no-cache'});
  if(!r.ok)throw Error('加载失败');
  decisionTreeModel=await r.json();
  decisionTreeLoaded=true;decisionTreeLoading=false;
  return true;
 }catch(e){console.error('[决策树]加载失败:',e);decisionTreeLoading=false;return false;}
}


// ═══════════════ 决策树预测 ═══════════════
function predictWithDecisionTree(prefs,dish){
 const actual=parseFloat(dish.rating);
 if(!decisionTreeModel||!decisionTreeLoaded)return !isNaN(actual)&&actual>0?actual:3.5;
 try{
  const f=encodeDishFeaturesForTree(dish);
  const ts=Math.max(0,Math.min(5,predictTreeNode(decisionTreeModel.nodes,f)));
  if(!isNaN(actual)&&actual>0)return Math.round((actual*0.4+ts*0.6)*100)/100;
  return ts;
 }catch(e){return !isNaN(actual)&&actual>0?actual:3.5;}
}

function encodeDishFeaturesForTree(dish){
 const m=decisionTreeModel,f=[];
 const rel=dish.religion||'无特殊要求';
 const cats=m.oheCategories['饮食_宗教']||['清真','素食'];
 for(let i=1;i<cats.length;i++)f.push(rel===cats[i]?1:0);
 const o=m.ordMappings;
 f.push(o['辣度'][dish.spiciness]||0);f.push(o['咸淡'][dish.saltiness]||0);f.push(o['甜酸'][dish.sweetness]||0);
 f.push(1);f.push(1);f.push(o['营养_蔬菜'][dish.vegetable]||1);f.push(1);
 const cal=extractNumber(dish.calorie),pro=extractNumber(dish.protein),pri=extractNumber(dish.price);
 f.push((cal-m.scalerMean[0])/m.scalerScale[0]);f.push((pro-m.scalerMean[1])/m.scalerScale[1]);f.push((pri-m.scalerMean[2])/m.scalerScale[2]);
 f.push(pro/(cal+1));f.push(pri/(cal+1));f.push(pro/(pri+1));
 f.push(dish.allergies?.seafood?1:0);f.push(dish.allergies?.peanut?1:0);f.push(0);f.push(0);f.push(0);
 return f;
}

function extractNumber(v){if(typeof v==='number')return v;if(typeof v==='string'){const m=v.match(/[\d.]+/);return m?parseFloat(m[0]):0;}return 0;}
function predictTreeNode(nodes,f){let id=0;while(true){const n=nodes[id];if(n.is_leaf)return n.value;if(f[n.feature]<=n.threshold)id=n.children_left;else id=n.children_right;}}


// ═══════════════ API 可用性检查 ═══════════════
function checkApiAvailability(){
 if(window.location.protocol==='file:')return Promise.resolve(false);
 const now=Date.now(),ca=now-apiCacheTimestamp;
 if(apiAvailabilityCache===true&&ca<API_CACHE_DURATION)return Promise.resolve(true);
 if(apiAvailabilityCache===false&&ca<5000)return Promise.resolve(false);
 return new Promise(r=>{
  // 8s：公网隧道往返实测 5s+（本地毫秒级），3s 会把健康的 ML 误判为不可用而强制降级
  const c=new AbortController(),t=setTimeout(()=>c.abort(),8000);
  safeFetch('/api/worker-health',{signal:c.signal,headers:{'Cache-Control':'no-cache'}})
  .then(res=>res.json()).then(d=>{apiAvailabilityCache=!!(d&&d.ready);apiCacheTimestamp=now;r(apiAvailabilityCache);})
  .catch(()=>{apiAvailabilityCache=null;apiCacheTimestamp=0;r(false);}).finally(()=>clearTimeout(t));
 });
}


// ═══════════════ 本地用户数据管理 ═══════════════
function loadUsers(){try{const d=localStorage.getItem('users');return d?JSON.parse(d):[];}catch(e){return[];}}
function saveUsers(u){try{localStorage.setItem('users',JSON.stringify(u));}catch(e){}}
function getUserData(n){return loadUsers().find(u=>u.username===n);}
function updateUserData(n,d){const u=loadUsers();const i=u.findIndex(x=>x.username===n);if(i===-1)return false;u[i]={...u[i],...d};saveUsers(u);return true;}
function removeUser(n){saveUsers(loadUsers().filter(u=>u.username!==n));}


// ═══════════════ 菜品匹配计算 ═══════════════
const SPICE_ORDER={'不辣':0,'微辣':1,'中辣':2,'重辣':3};
const SALT_ORDER={'清淡':0,'适中':1,'偏咸':2};
const CAL_ORDER={'低':0,'中':1,'高':2};
// 辣度: 超出承受-2重罚; 精确+2; 差1级+1; 差2级+0
function gradeScore(order,u,d){const ui=order[u],di=order[d];if(ui===undefined||di===undefined)return 0;if(di>ui)return -2;const diff=ui-di;return diff===0?2:diff===1?1:-1;}
// 咸淡/热量: 无超出概念, 精确+2; 差1级+1; 差2级以上-1(2026-09-17:不匹配应有代价)
function gradeScoreSoft(order,u,d){const ui=order[u],di=order[d];if(ui===undefined||di===undefined)return 0;const diff=Math.abs(ui-di);return diff===0?3:diff===1?1:-2;}  // 2026-09-19: exact +2→+3 适量加权咸淡/热量(收窄上线前权重差距);off-by-1 0→+1 对齐训练compute_score(修原train/serve偏差)
function computeDishMatch(prefs,dish){
 const md={taste:0,cuisine:0,calorie:0,rating:0,price:0};
 if(prefs['辣度']!=='无')md.taste+=gradeScore(SPICE_ORDER,prefs['辣度'],dish.spiciness);else md.taste+=2;
 if(prefs['咸淡']!=='无')md.taste+=gradeScoreSoft(SALT_ORDER,prefs['咸淡'],dish.saltiness);else md.taste+=2;
 if(prefs['甜酸']!=='无'){if(dish.sweetness===prefs['甜酸'])md.taste+=2;else md.taste-=1;}else md.taste+=2;
 if(dish.tags&&dish.tags.includes('招牌'))md.cuisine+=1.0;   // 原 1.5：会压过明确的口味偏好（差一级的匹配 +1 也盖不过），降到 1.0 让精确匹配能赢
 if(prefs['calorie']!=='无')md.calorie=gradeScoreSoft(CAL_ORDER,prefs['calorie'],dish.calorie);else md.calorie=1;
 // 价格软打分: 区间内+2, 邻近-1, 区间外-2; 无偏好+1
 const p=parseFloat(dish.price);
 if(!isNaN(p)&&prefs['价格区间']!=='无'&&prefs['价格区间']!=='不限'){
  if(prefs['价格区间']==='经济')md.price=p<20?2:(p<30?-1:-2);
  else if(prefs['价格区间']==='适中')md.price=(p>=20&&p<=50)?2:(p<20||p>50?-1:0);
  else if(prefs['价格区间']==='品质')md.price=p>50?2:(p>40?-1:-2);
 }else md.price=1;
 const s=parseFloat(dish.rating);md.rating=!isNaN(s)?Math.round((s/5)*2.5*10)/10:2.0;
 const total=md.taste+md.cuisine+md.calorie+md.price+md.rating;
 return{matchDetails:md,totalMatch:Math.round(total*10)/10,matchRate:total/15};  // 2026-09-19: /14→/15 配合咸淡/热量 exact +3,保持 matchRate 上限
}

function generateDishReason(prefs,dish){
 const p=[];
 const keyMap={'辣度':'spiciness','咸淡':'saltiness','甜酸':'sweetness'};
 ['辣度','咸淡','甜酸'].forEach(k=>{if(prefs[k]!=='无')p.push(k+'：'+dish[keyMap[k]]+(dish[keyMap[k]]===prefs[k]?' ✓':' ✗')+(dish[keyMap[k]]===prefs[k]?'':'偏好'+prefs[k]));else p.push(k+'：'+dish[keyMap[k]]+' ✓');});
 if(dish.tags&&dish.tags.includes('招牌'))p.push('⭐ 本店招牌');
 if(dish.tags&&dish.tags.includes('中辣'))p.push('🌶️ 中辣');
 if(dish.tags&&dish.tags.includes('重辣'))p.push('🌶️🌶️ 重辣');
 const pr=parseFloat(dish.price);if(!isNaN(pr)){if(pr<30)p.push('💰 经济实惠');else if(pr<60)p.push('💰 价格适中');else p.push('💰 品质之选');}
 const r=parseFloat(dish.rating);if(!isNaN(r)&&r>=4.5)p.push('⭐ 高分推荐('+r.toFixed(1)+'分)');
 return '推荐理由：'+p.join(' | ');
}

function selectBlindBoxDish(prefs,top,blk){
 const topIds=new Set(top.map(d=>d.id));
 const a=prefs['allergies']||[],r=prefs['饮食_宗教'];
 const eligible=dishData.filter(d=>!topIds.has(d.id)&&!recommendedIds.includes(d.id)&&!(blk&&blk.includes(d.id))
  &&!(r==='清真'&&!d.isHalal)&&!(r==='素食'&&!d.isVegetarian)
  &&!(a.includes('海鲜')&&d.allergies?.seafood)&&!(a.includes('花生')&&d.allergies?.peanut)
  &&!(a.includes('鸡蛋')&&d.allergies?.egg)&&!(a.includes('大豆')&&d.allergies?.soy)&&!(a.includes('麸质')&&d.allergies?.gluten)
  &&d.category!=='飲品与酒水'&&d.category!=='主食');
 if(!eligible.length)return null;
 // 纯随机模式
 if(prefs['blindBoxMode']==='random'){
  const d=eligible[Math.floor(Math.random()*eligible.length)];
  return{...d,reason:'🔮 盲盒推荐：纯随机惊喜，试试这个吧！',type:'盲盒尝鲜',blindMode:'random',matchIndex:0,matchRate:0.5};
 }
 // 智能选模式：按偏好加权
 const keyMap={'辣度':'spiciness','咸淡':'saltiness','甜酸':'sweetness'};
 const weighted=eligible.map(d=>{
  let score=1;
  ['辣度','咸淡','甜酸'].forEach(k=>{
   if(prefs[k]&&prefs[k]!=='无'&&d[keyMap[k]]===prefs[k])score+=3;
  });
  if(d.tags&&d.tags.includes('招牌'))score+=2;
  if(d.rating){const r=parseFloat(d.rating);if(!isNaN(r)&&r>=4.5)score+=2;}
  return{d,score};
 });
 // 按权重随机选择
 const totalScore=weighted.reduce((s,w)=>s+w.score,0);
 let rand=Math.random()*totalScore;
 for(const w of weighted){
  rand-=w.score;
  if(rand<=0){
   const d=w.d;
   const m=computeDishMatch(prefs,d);
   return{...d,reason:'🔮 盲盒推荐：试试这个吧，说不定有惊喜！',type:'盲盒尝鲜',blindMode:'smart',matchIndex:Math.round(m.matchRate*100)/100,matchRate:m.matchRate,matchDetails:m.matchDetails};
  }
 }
 // 保底
 const d=eligible[Math.floor(Math.random()*eligible.length)];
 const m=computeDishMatch(prefs,d);
 return{...d,reason:'🔮 盲盒推荐：试试这个吧，说不定有惊喜！',type:'盲盒尝鲜',blindMode:'smart',matchIndex:Math.round(m.matchRate*100)/100,matchRate:m.matchRate,matchDetails:m.matchDetails};
}



function updateUserNavbar(){
 const pi=document.getElementById('nav-profile-item'),nu=document.getElementById('nav-user');
 const lb=document.getElementById('logout-btn'),vb=document.getElementById('view-profile-btn');
 const cb=document.getElementById('continue-btn');
 if(!pi||!nu)return;
 if(currentUser&&currentUser!=='guest'){
  pi.classList.remove('d-none');nu.classList.add('d-none');
  if(lb)lb.textContent='退出登录';if(vb)vb.classList.remove('d-none');
  // 有保存的偏好则显示"继续上次推荐"
  const u=getUserData(currentUser);
  if(cb&&u&&u.preferences&&u.preferences.spiciness)cb.classList.remove('d-none');

// ═══════════════ 用户登录/注册 ═══════════════
 }else if(currentUser==='guest'){
  pi.classList.add('d-none');nu.classList.remove('d-none');
  if(lb)lb.textContent='退出';if(vb)vb.classList.add('d-none');
  if(cb)cb.classList.add('d-none');
 }else{
  pi.classList.add('d-none');nu.classList.remove('d-none');
  if(lb)lb.textContent='退出';if(vb)vb.classList.add('d-none');
  if(cb)cb.classList.add('d-none');
 }
}

function resetPreferenceForm(){
 const $=id=>document.getElementById(id);
 if($('spiciness'))$('spiciness').value='无';
 if($('saltiness'))$('saltiness').value='无';
 if($('sweetness'))$('sweetness').value='无';
 if($('price'))$('price').value='无';
 if($('calorie'))$('calorie').value='无';
 if($('religion'))$('religion').value='无';
 if($('allergy-none')){$('allergy-none').checked=true;['allergy-seafood','allergy-peanut','allergy-egg','allergy-soy','allergy-gluten'].forEach(id=>{if($(id)){$(id).checked=false;$(id).disabled=true;}});}
 if($('recommendation-mode'))$('recommendation-mode').value='auto';
}

// ═══ 偏好完整度引导 ═══
// 5 维口味声明率;咸淡/热量为"弱维度"(ML 当前低权重根因),重点提
const PREF_FIELDS=[
 {key:'spiciness',label:'辣度',weak:false},
 {key:'saltiness',label:'咸淡',weak:true},
 {key:'sweetness',label:'甜酸',weak:false},
 {key:'price',label:'预算',weak:false},
 {key:'calorie',label:'热量',weak:true}
];
function computePrefCompleteness(){
 const $=id=>document.getElementById(id);
 const fields=PREF_FIELDS.map(f=>{
  const el=$(f.key);const v=el?el.value:'无';
  const declared=v!=='无'&&v!=='无特殊要求'&&v!=='不限'&&v!=='';
  return Object.assign({},f,{value:v,declared});
 });
 const declaredCount=fields.filter(f=>f.declared).length;
 const weakUndeclared=fields.filter(f=>f.weak&&!f.declared);
 return {fields,declared:declaredCount,total:fields.length,weakUndeclared};
}
function prefScrollAndHighlight(key){
 const el=document.getElementById(key);
 if(!el)return;
 if(el.scrollIntoView)el.scrollIntoView({behavior:'smooth',block:'center'});
 el.classList.remove('pref-highlight');void el.offsetWidth;el.classList.add('pref-highlight');
 setTimeout(()=>el.classList.remove('pref-highlight'),2200);
 try{el.focus({preventScroll:true});}catch(e){}
}
function renderPrefCompleteness(){
 const meter=document.getElementById('pref-completeness-meter');
 if(!meter)return;
 const c=computePrefCompleteness();
 const pct=Math.round(c.declared/c.total*100);
 const items=c.fields.map(f=>{
  const state=f.declared?'done':'todo';
  const weakCls=f.weak?' weak':'';
  const cls='pref-meter-item '+state+weakCls;
  const dot=f.weak?'◆':'●';
  const tail=f.declared?'':'<small class="pref-meter-todo">未设置</small>';
  return '<span class="'+cls+'" data-pref-key="'+f.key+'" role="button" tabindex="0">'+dot+' '+f.label+tail+'</span>';
 }).join('');
 const badgeCls=pct===100?'bg-success':'bg-warning';
 meter.innerHTML='<div class="pref-meter-row">'
  +'<div class="pref-meter-track"><div class="pref-meter-fill" style="width:'+pct+'%"></div></div>'
  +'<span class="badge '+badgeCls+' rounded-pill">'+c.declared+'/'+c.total+'</span>'
  +'</div><div class="pref-meter-items">'+items+'</div>';
 meter.querySelectorAll('[data-pref-key]').forEach(el=>{
  el.addEventListener('click',()=>prefScrollAndHighlight(el.getAttribute('data-pref-key')));
  el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();prefScrollAndHighlight(el.getAttribute('data-pref-key'));}});
 });
}
function renderPrefCompletenessBanner(){
 const banner=document.getElementById('pref-completeness-banner');
 if(!banner)return;
 const c=computePrefCompleteness();
 const dismissed=localStorage.getItem('prefCompletenessDismissed')==='true';
 if(dismissed||c.declared>=c.total){
  banner.classList.add('d-none');
  banner.innerHTML='';
  banner.className='d-none';
  return;
 }
 banner.className='alert alert-warning alert-dismissible fade show pref-completeness-banner';
 banner.classList.remove('d-none');
 banner.innerHTML='<i class="bi bi-info-circle me-2"></i>还有 '+(c.total-c.declared)+' 项口味偏好未设置，补全后推荐更贴合你的口味。'
  +'<a href="#" class="alert-link ms-1" id="pref-completeness-goto">去补全 →</a>'
  +'<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="关闭"></button>';
 const goto=banner.querySelector('#pref-completeness-goto');
 if(goto)goto.addEventListener('click',function(e){e.preventDefault();showSection('preference-section');const fu=c.fields.find(f=>!f.declared);if(fu)setTimeout(()=>prefScrollAndHighlight(fu.key),350);});
 banner.addEventListener('closed.bs.alert',function(){localStorage.setItem('prefCompletenessDismissed','true');},{once:true});
}

const s_titleMap={'home-section':'唐猫庭院 - 菜品推荐','login-section':'登录 - 唐猫庭院','register-section':'注册 - 唐猫庭院','preference-section':'口味偏好 - 唐猫庭院','recommendation-section':'推荐菜品 - 唐猫庭院','feedback-section':'菜品评价 - 唐猫庭院','cart-section':'购物车 - 唐猫庭院','end-section':'点餐完成 - 唐猫庭院','about-section':'关于本店 - 唐猫庭院','dataset-section':'全部菜单 - 唐猫庭院','profile-section':'个人中心 - 唐猫庭院','privacy-section':'隐私政策 - 唐猫庭院','table-builder-section':'一席成宴 - 唐猫庭院','table-result-section':'一席成宴 · 三套方案 - 唐猫庭院'};
const s_navMap={'home-section':'nav-home','about-section':'nav-about','dataset-section':'nav-dataset','privacy-section':'nav-privacy','login-section':'nav-user','register-section':'nav-user','profile-section':'nav-profile'};

function showSection(sectionId,skipScroll){
 const el=document.getElementById(sectionId);
 if(!el){console.warn('showSection: 未找到元素',sectionId);return;}
 // 记录上一页（关闭购物车时返回）
 const cur=document.querySelector('.section.active');
 if(cur&&cur.id!==sectionId)window._prevSection=cur.id;
 document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
 el.classList.add('active');
 // 切换section时平滑滚动到顶部，提升浏览体验（购物车返回时跳过，恢复原位置）
 if(!skipScroll)window.scrollTo({ top: 0, behavior: 'smooth' });
 // 记录导航历史（用于浏览器前进/后退）
 try { history.pushState({ section: sectionId }, '', window.location.pathname); } catch(e) {}
 updateUserNavbar();
 // 更新页面标题
 if(s_titleMap[sectionId])document.title=s_titleMap[sectionId];
 const nid=s_navMap[sectionId];
 document.querySelectorAll('.navbar-nav .nav-link').forEach(l=>{l.classList.remove('active');l.removeAttribute('aria-current');});
 if(nid){const l=document.getElementById(nid);if(l){l.classList.add('active');l.setAttribute('aria-current','page');}}
 if(sectionId==='preference-section'){
  resetRecommendation();
  const sel=document.getElementById('recommendation-mode');
  if(sel){
   if(sel.options.length===0)sel.innerHTML='<option value="auto" selected>自动选择（优先API）</option><option value="api">后端API推荐（更智能）</option><option value="local">本地推荐（更快速）</option>';
   sel.value='auto';
   sel.removeEventListener('change',updateModeDisplay);
   sel.addEventListener('change',updateModeDisplay);
  }
  const u=getUserData(currentUser);if(currentUser&&currentUser!=='guest'&&u&&u.preferences)loadUserPreferences(u.preferences);else if(!currentUser)resetPreferenceForm();
  // 2026-09-17: 游客进偏好页同步过敏源联动态(勾"无"时其他项应为禁用,此前仅在重置表单时处理)
  {const an=$('allergy-none');if(an&&an.checked&&currentUser==='guest'){['allergy-seafood','allergy-peanut','allergy-egg','allergy-soy','allergy-gluten'].forEach(id=>{if($(id))$(id).disabled=true;});}}
  // 桌号锁定：加菜流程中偏好页桌号同样锁定
  const lockedTable1=ssGet('lockedTable')||'';
  const ptb=document.getElementById('pref-table-number');
  if(ptb){
   if(lockedTable1){ptb.value=lockedTable1;ptb.disabled=true;ptb.style.background='var(--cream-dark)';}
   else{ptb.disabled=false;ptb.style.background='';}
  }
  updateModeDisplay();
  renderPrefCompleteness();
 }
 updateFloatBar();
 // 进入推荐页：刷新加购按钮与购物车同步（清空/修改后返回也能恢复）
 if(sectionId==='recommendation-section'&&typeof refreshRecipeCartBtn==='function'){
  const ids=[...document.querySelectorAll('#recommendation-result [data-recipe-cart]')].map(el=>parseInt(el.dataset.recipeCart));
  ids.forEach(id=>refreshRecipeCartBtn(id));
 }
 if(sectionId==='recommendation-section')renderPrefCompletenessBanner();
 // 一席成宴选饮品模式：进入菜单页刷新横幅，返回席面页刷新总价（饮品可能已变）
 if(sectionId==='dataset-section'&&typeof renderDrinksModeBanner==='function')renderDrinksModeBanner();
 if(sectionId==='table-result-section'&&typeof window.tableSets!=='undefined'&&window.tableSets&&window.tableSets.length&&typeof recalcTableSetTotals==='function'){
  window.tableSets.forEach(recalcTableSetTotals);
  if(typeof renderTableSets==='function')renderTableSets();
 }
}

function updateModeDisplay(){const el=document.getElementById('current-recommendation-mode'),sel=document.getElementById('recommendation-mode');if(!el||!sel)return;el.textContent=({auto:'自动选择（优先API）',api:'后端API推荐（更智能）',local:'本地推荐（更快速）'})[sel.value]||'自动选择（优先API）';}

function showMessage(title,msg,callback,autoClose){
 const mt=document.getElementById('modal-title'),mb=document.getElementById('modal-body');
 if(!mt||!mb){console.warn('showMessage: 模态框元素未找到');return;}
 mt.textContent=title;
 mb.textContent=msg;
 const el=document.getElementById('message-modal');
 let m=bootstrap.Modal.getInstance(el);if(!m)m=new bootstrap.Modal(el,{focus:false});
 el.inert=false;el.removeAttribute('aria-hidden');m.show();
  // 模态框打开后聚焦到确定按钮（焦点管理）
  el.addEventListener('shown.bs.modal', function focusMsgHandler() {
    el.removeEventListener('shown.bs.modal', focusMsgHandler);
    const confirmBtn = document.getElementById('modal-confirm-btn');
    if (confirmBtn) setTimeout(function() { confirmBtn.focus(); }, 50);
  });
 // 保存回调，在模态框隐藏时调用
 if (typeof callback === 'function') {
   const handler = function() {
     el.removeEventListener('hidden.bs.modal', handler);
     callback();
   };
   el.addEventListener('hidden.bs.modal', handler);
 }
 // 自动关闭：信息提示在指定毫秒后自动隐藏，避免遮罩层长时间阻挡页面操作
 if (typeof autoClose === 'number' && autoClose > 0) {
   setTimeout(function() {
     const modal = bootstrap.Modal.getInstance(el);
     if (modal) modal.hide();
   }, autoClose);
 }
}

function showDataset(){
 sessionStorage.setItem('datasetScrollY',window.scrollY);
 showSection('dataset-section');
 renderMenuTable();
}
// ─── 分类元数据（唯一配置源：分类新增/改名只需改这里，下拉框/快捷按钮/图标/排序全部自动生成）───
const CATEGORY_CONFIG=[
 {cat:'主食',emoji:'🍚',tab:''},
 {cat:'招牌与游西安必打卡',emoji:'🏆',tab:'招牌'},
 {cat:'热销菜品',emoji:'🔥',tab:'热销'},
 {cat:'传承陕菜',emoji:'🍲',tab:'陕菜'},
 {cat:'江湖海鲜',emoji:'🦐',tab:'海鲜'},
 {cat:'田园时蔬·汤羹',emoji:'🥬',tab:'蔬羹'},
 {cat:'特色凉菜',emoji:'🥗',tab:'凉菜'},
 {cat:'陕西小吃',emoji:'🥟',tab:'小吃'},
 {cat:'飲品与酒水',emoji:'🍹',tab:'饮品'}
];
function catOrderOf(cat){const i=CATEGORY_CONFIG.findIndex(c=>c.cat===cat);return i===-1?999:i;}
function catEmojiOf(cat){const m=CATEGORY_CONFIG.find(c=>c.cat===cat);return m?m.emoji:'🍽';}
function catTabLabelOf(cat){const m=CATEGORY_CONFIG.find(c=>c.cat===cat);return m&&m.tab?m.tab:cat;}
// 从菜品实际分类生成分类 UI；分类集合变化时自动重建并保留当前选中
function buildCategoryUI(){
 const cats=[...new Set(dishData.map(d=>d.category).filter(Boolean))].sort((a,b)=>catOrderOf(a)-catOrderOf(b)||a.localeCompare(b,'zh'));
 const key=cats.join('|');
 const tabs=document.getElementById('category-tabs');
 if(tabs&&tabs.dataset.cats!==key){
  const cur=(tabs.querySelector('.cat-tab.active')||{dataset:{}}).dataset.cat||'';
  tabs.innerHTML='<button class="btn btn-sm cat-tab" data-cat="" style="border-radius:20px;padding:4px 14px;font-size:0.82rem;">全部</button>'
   +cats.map(c=>'<button class="btn btn-sm cat-tab" data-cat="'+esc(c)+'" style="border-radius:20px;padding:4px 14px;font-size:0.82rem;">'+esc(catTabLabelOf(c))+'</button>').join('');
  tabs.dataset.cats=key;
  tabs.querySelectorAll('.cat-tab').forEach(t=>{
   const on=t.dataset.cat===cur;
   t.classList.toggle('active',on);
   t.style.background=on?'var(--primary)':'transparent';
   t.style.color=on?'#fff':'var(--text)';
   t.style.border=on?'none':'1px solid var(--gold-light)';
  });
 }
 const sel=document.getElementById('menu-filter-cat');
 if(sel&&sel.dataset.cats!==key){
  const cur=sel.value;
  sel.innerHTML='<option value="">全部分类</option>'+cats.map(c=>'<option>'+esc(c)+'</option>').join('');
  sel.dataset.cats=key;
  if(cur&&cats.includes(cur))sel.value=cur;
 }
}
// B8 菜品详情弹层：点菜名看大图/描述/过敏源/热量/口味
function showDishDetail(id){
 const d=dishData.find(x=>x.id===id);
 if(!d)return;
 const old=document.getElementById('dish-detail-modal');if(old)old.remove();
 const al=d.allergies||{};
 const alTags=[['seafood','海鲜'],['peanut','花生'],['egg','鸡蛋'],['soy','大豆'],['gluten','麸质']].filter(a=>al[a[0]]).map(a=>'<span style="background:rgba(192,57,43,0.12);color:#c0392b;font-size:0.72rem;padding:2px 8px;border-radius:10px;margin-right:4px;">⚠ '+a[1]+'</span>').join('');
 const imgHtml=d.image_url&&(d.image_url.startsWith('/')||d.image_url.startsWith('http'))?'<img src="'+esc(d.image_url)+'" style="width:100%;max-height:260px;object-fit:cover;border-radius:10px;" alt="'+esc(d.name)+'" onerror="this.style.display=\'none\'">':(d.image_url?'<div style="font-size:5rem;text-align:center;">'+esc(d.image_url)+'</div>':'');
 const specs=(d._variants&&d._variants.length)?'<div style="margin:10px 0;"><div style="font-size:0.8rem;color:#8b7a6a;margin-bottom:4px;">可选规格</div>'+[d].concat(d._variants).map(v=>'<div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:3px 0;border-bottom:1px dashed #eee;"><span>'+esc((v._flavorLabel||(String(v.name).match(/\\(([^()]+)\\)$/)||[,''])[1])||'标准')+'</span><span>'+esc(formatPrice(v))+'</span></div>').join('')+'</div>':'';
 const modal=document.createElement('div');
 modal.id='dish-detail-modal';
 modal.innerHTML='<div class="modal fade" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content" style="border-radius:14px;overflow:hidden;">'
  +'<button type="button" class="btn-close" data-bs-dismiss="modal" style="position:absolute;top:10px;right:10px;z-index:10;background-color:rgba(255,255,255,0.9);border-radius:50%;padding:8px;"></button>'
  +imgHtml
  +'<div class="modal-body" style="padding:16px 20px;">'
  +'<h4 style="font-family:\'Noto Serif SC\',serif;font-weight:700;">'+esc(dishNameOf(d))+(d.tags&&d.tags.includes('招牌')?' <span style="background:var(--primary-accent);color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:10px;vertical-align:middle;">招牌</span>':'')+'</h4>'
  +'<p style="color:#8b7a6a;font-size:0.85rem;">'+esc(catNameOf(d.category))+' · '+esc(d.spiciness)+' · 咸淡'+esc(d.saltiness)+' · 甜酸'+esc(d.sweetness)+' · 热量'+esc(d.calorie||'未知')+'</p>'
  +(menuLang==='en'&&d.description_en?'<p style="font-size:0.9rem;color:var(--text);">'+esc(d.description_en)+'</p>':'')
  +(d.description?'<p style="font-size:0.9rem;">'+esc(d.description)+'</p>':'')
  +'<div style="font-size:1.2rem;color:var(--primary);font-weight:700;margin:6px 0;">'+esc(formatPrice(d))+'</div>'
  +specs
  +(alTags?'<div style="margin:10px 0;"><div style="font-size:0.8rem;color:#8b7a6a;margin-bottom:4px;">含过敏源</div>'+alTags+'</div>':'')
  +'<div style="margin-top:10px;font-size:0.8rem;color:#8b7a6a;">'+(d.is_sold_out===true?'⚠ 今日已售罄':'✅ 可正常点餐')+(d.serving?' · '+esc(d.serving):'')+'</div>'
  +'</div></div></div></div>';
 document.body.appendChild(modal);
 const el=modal.querySelector('.modal');
 let m=bootstrap.Modal.getInstance(el);if(!m)m=new bootstrap.Modal(el);
 el.addEventListener('hidden.bs.modal',function(){modal.remove();},{once:true});
 m.show();
}

function renderMenuTable(){
 const container=document.getElementById('dataset-table-body');if(!container)return;
 // 如果 dishData 为空，最多重试 3 次
 if(!dishData||!dishData.length){
  if(!renderMenuTable._retryCount)renderMenuTable._retryCount=0;
  if(renderMenuTable._retryCount<3){renderMenuTable._retryCount++;setTimeout(renderMenuTable,1000);}
  return;
 }
 renderMenuTable._retryCount=0;
 buildCategoryUI();
 const q=document.getElementById('menu-search')?.value?.trim().toLowerCase()||'';
 const cat=document.getElementById('menu-filter-cat')?.value||'';
 const spice=document.getElementById('menu-filter-spice')?.value||'';
 const priceRange=document.getElementById('menu-filter-price')?.value||'';
 const sorted=[...dishData].sort((a,b)=>catOrderOf(a.category)-catOrderOf(b.category)||a.id-b.id);
 const filtered=sorted.filter(d=>{
  if(q&&!d.name.toLowerCase().includes(q))return false;
  if(cat&&d.category!==cat)return false;
  if(spice&&d.spiciness!==spice)return false;
  if(priceRange){const p=parseFloat(d.price);if(isNaN(p))return false;const [lo,hi]=priceRange.split('-').map(Number);if(p<lo||p>=hi)return false;}
  return true;
 });
 const sortVal=document.getElementById('menu-sort')?.value||'';
 if(sortVal==='popular')filtered.sort((a,b)=>(b.order_count||0)-(a.order_count||0));
 else if(sortVal==='rating')filtered.sort((a,b)=>parseFloat(b.rating)-parseFloat(a.rating));
 else if(sortVal==='price_asc')filtered.sort((a,b)=>parseFloat(a.price)-parseFloat(b.price));
 else if(sortVal==='price_desc')filtered.sort((a,b)=>parseFloat(b.price)-parseFloat(a.price));
 const cart=getCart();
 // 按分类分组渲染，每组加分隔标题
 let html='';let lastCat='',lastSub='';
 const SUB_EMOJI={'特调饮品':'🍸','花酒天地':'🥂','茶饮':'🍵','一醉千年':'🏺','葡萄酒':'🍷','液体面包':'🍺','缤纷饮品':'🍹'};
 const SUBS=['特调饮品','花酒天地','茶饮','一醉千年','葡萄酒','液体面包','缤纷饮品'];
 // 规格 variant 合并: "X(壶)" 行并入同名主行 "X" 的卡片(与纸质菜单一行双价排版一致)
 // 注意: 变体挂在全局 dishData 对象引用上, 每次渲染前必须清残留, 否则重复叠加
 filtered.forEach(d=>{ delete d._variants; });
 const byName={};
 filtered.forEach(d=>{byName[d.name]=d;});
 const consumedVariants=new Set();
 filtered.forEach(d=>{
  const m=d.name.match(/^(.+)\(([^()]+)\)$/);
  if(m&&byName[m[1]]){const main=byName[m[1]];main._variants=main._variants||[];if(!main._variants.some(v=>v.id===d.id))main._variants.push(d);consumedVariants.add(d.id);}
 });
 // 美团式口味规格: 无裸名主行的同基础名规格(如虾球原味/芥末味、华山论剑年份)互并成一张虚拟主卡,
 // 标题取基础名, 规格行标签取括号后缀
 const virtualById={};
 (()=>{
  const groups={};
  filtered.forEach(d=>{
   if(consumedVariants.has(d.id))return;
   const m=d.name.match(/^(.+)\(([^()]+)\)$/);
   if(m)(groups[m[1]]=groups[m[1]]||[]).push(d);
  });
  Object.keys(groups).forEach(base=>{
   const g=groups[base];
   const clone=Object.assign({},g[0],{name:base,_flavorLabel:(g[0].name.match(/\(([^()]+)\)$/)||[])[1]});
   clone._variants=g.slice(1);
   virtualById[g[0].id]=clone;
   for(let i=1;i<g.length;i++)consumedVariants.add(g[i].id);
  });
 })();
 filtered.forEach(rawD=>{
  const d=virtualById[rawD.id]||rawD;
  if(consumedVariants.has(rawD.id))return;
  if(d.category!==lastCat){
   lastCat=d.category;lastSub='';
   html+='<div class="dish-cat-sep">'+catEmojiOf(d.category)+' '+esc(catNameOf(d.category))+'</div>';
  }
  // 飲品与酒水二级分隔
  if(d.category==='飲品与酒水'){
   const sub=d.tags&&d.tags.find(t=>SUBS.includes(t));
   if(sub&&sub!==lastSub){
    lastSub=sub;
    html+='<div class="dish-sub-sep">'+(SUB_EMOJI[sub]||'·')+' '+esc(sub)+'</div>';
   }
  }
  const ci=cart.find(c=>c.id===d.id);
  const qty=ci?(ci.qty||1):0;
  const defaultImg='/assets/illustrations/missing-dish-cat.webp';
  const imgUrl=d.image_url&&(d.image_url.startsWith('/')||d.image_url.startsWith('http'))?(function(){const src=esc(d.image_url);const thumb=d.image_url.startsWith('/uploads/')&&!d.image_url.includes('thumbs/')?('/uploads/thumbs/'+d.image_url.split('/').pop().replace(/\.[^.]+$/,'')+'.webp'):src;return '<img src="'+thumb+'" style="width:100%;height:160px;border-radius:10px;object-fit:cover;" alt="'+esc(d.name)+'" loading="lazy" onerror="if(this.src.indexOf(\'/thumbs/\')>-1){this.src=\''+src+'\';}else{this.onerror=null;this.src=\''+defaultImg+'\';}">';})():(d.image_url?'<span class="dish-emoji" style="font-size:4rem;display:flex;align-items:center;justify-content:center;height:160px;">'+esc(d.image_url)+'</span>':'');
  const star=d.tags&&d.tags.includes('招牌')?'<span class="badge" style="background:var(--primary-accent);color:#fff;font-size:0.65rem;">招牌</span> ':'';
  // 价格+加购区: 有规格变体时逐规格一行(各带加购), 否则单行
  const unitLabel=d=>(d.price_unit||'/份').replace(/^\//,'');
  // 规格行标签: 口味类取名字括号后缀(原味/芥末味/壶/年份), 其余退回单位(盖碗/6只)
  const specLabel=d2=>{ if(d2._flavorLabel)return d2._flavorLabel; const m=String(d2.name||'').match(/\(([^()]+)\)$/); return m?m[1]:unitLabel(d2); };
  const specRow=d2=>{
   const c2=cart.find(c=>c.id===d2.id);const q2=c2?(c2.qty||1):0;
   const so=d2.is_sold_out===true;
   const ctrl=so?'<span style="font-size:0.8rem;color:#b3261e;background:rgba(179,38,30,0.08);padding:3px 10px;border-radius:10px;white-space:nowrap;">已售罄</span>':(q2>0?'<span class="d-inline-flex align-items-center gap-1"><button class="btn btn-sm btn-outline-secondary cart-qty-minus" data-id="'+d2.id+'" style="padding:2px 8px;border-radius:6px;font-weight:700;">－</button><span style="font-weight:700;min-width:20px;text-align:center;">'+q2+'</span><button class="btn btn-sm btn-outline-success cart-qty-plus add-to-cart-btn" data-id="'+d2.id+'" style="padding:2px 8px;border-radius:6px;font-weight:700;">＋</button></span>':'<button class="btn btn-sm add-to-cart-btn" data-id="'+d2.id+'" style="background:var(--primary);color:#fff;border:none;border-radius:6px;padding:2px 12px;font-weight:600;white-space:nowrap;">＋ 加入</button>');
   return '<div class="d-flex justify-content-between align-items-center" style="margin-top:4px;gap:6px;'+(so?'opacity:0.65;':'')+'"><span style="font-size:0.85rem;color:var(--text-light);white-space:nowrap;">'+esc(specLabel(d2))+'</span><span style="display:inline-flex;align-items:center;gap:8px;"><strong style="color:var(--primary);font-size:1rem;white-space:nowrap;'+(so?'text-decoration:line-through;':'')+'">'+esc(formatPrice(d2))+'</strong>'+ctrl+'</span></div>';
  };
  let priceBlock;
  if(d._variants&&d._variants.length){
   priceBlock='<div style="margin-top:6px;">'+specRow(d)+d._variants.map(v=>specRow(v)).join('')+'</div>';
  }else if(d.is_sold_out===true){
   priceBlock='<div class="d-flex justify-content-between align-items-center" style="margin-top:6px;opacity:0.75;"><span style="font-size:0.85rem;color:#b3261e;background:rgba(179,38,30,0.08);padding:3px 10px;border-radius:10px;">今日已售罄</span><strong style="color:var(--text-light);font-size:1.05rem;text-decoration:line-through;">'+esc(formatPrice(d))+'</strong></div>';
  }else{
   priceBlock='<div class="d-flex justify-content-between align-items-center"><strong style="color:var(--primary);font-size:1.05rem;">'+esc(formatPrice(d))+'</strong>'+(qty>0?'<div class="d-flex align-items-center gap-1"><button class="btn btn-sm btn-outline-secondary cart-qty-minus" data-id="'+d.id+'" style="padding:2px 8px;border-radius:6px;font-weight:700;">－</button><span style="font-weight:700;min-width:20px;text-align:center;">'+qty+'</span><button class="btn btn-sm btn-outline-success cart-qty-plus add-to-cart-btn" data-id="'+d.id+'" style="padding:2px 8px;border-radius:6px;font-weight:700;">＋</button></div>':'<button class="btn btn-sm add-to-cart-btn" data-id="'+d.id+'" style="background:var(--primary);color:#fff;border:none;border-radius:6px;padding:4px 14px;font-weight:600;">＋ 加入</button>')+'</div>';
  }
  html+='<div class="dish-card"'+(d.is_sold_out===true&&!d._variants?' style="opacity:0.6;"':'')+'>'+imgUrl+'<div class="dish-card-body"><h6 style="font-family:Noto Serif SC,serif;font-weight:600;margin:8px 0 4px;cursor:pointer;" onclick="showDishDetail('+d.id+')" title="查看详情">'+(d.is_sold_out===true&&!d._variants?'<span style="background:#8f2318;color:#fff;font-size:0.65rem;padding:1px 6px;border-radius:4px;margin-right:4px;">已售罄</span>':'')+star+esc(dishNameOf(d))+'</h6><p style="font-size:0.78rem;color:var(--text-light);margin:0 0 8px;">'+esc(catNameOf(d.category))+' · '+esc(d.spiciness)+(d.serving?' · <span style="color:#e67e22;">'+esc(d.serving)+'</span>':'')+'</p>'+priceBlock+'</div></div>';
 });
 if(!filtered.length){
  // 空态: 搜索/筛选无结果时给出明确反馈与引导
  const kw=q?esc(q):'';
  const hint=q?'唐猫找了一圈，没有找到「'+kw+'」':'当前筛选条件下没有菜品';
  container.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px 16px;color:var(--text-light);">'
   +'<img src="/assets/illustrations/search-empty-cat.webp" alt="唐猫拿着放大镜在菜单里寻找" style="width:240px;display:block;margin:0 auto 10px;border-radius:12px;">'
   +'<p style="font-size:1.05rem;color:var(--ink);margin:0 0 6px;">'+hint+'</p>'
   +'<p style="font-size:0.85rem;margin:0;">换个关键词，或清除筛选条件再试试</p>'
   +'</div>';
  document.getElementById('menu-count').textContent='0/'+dishData.length;
  return;
 }
 container.innerHTML='<div class="dish-grid">'+html+'</div>';
 document.getElementById('menu-count').textContent=filtered.length+'/'+dishData.length;
 // 选饮品模式横幅随菜单重绘恢复（renderMenuTable 会重绘菜单容器周边 DOM）
 if(typeof renderDrinksModeBanner==='function')renderDrinksModeBanner();
}

function login(){
 const uEl=document.getElementById('login-username'),pEl=document.getElementById('login-password'),bEl=document.getElementById('login-btn');
 if(!uEl||!pEl){showMessage('页面错误','登录表单元素未找到');return;}
 if(bEl)bEl.disabled=true;
 const u=uEl.value.trim(),p=pEl.value;
 if(!u||!p){showMessage('登录失败','请输入用户名和密码');return;}
 safeFetch('/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})})
 .then(r=>r.json()).then(d=>{if(!d.success){showMessage('登录失败',d.error||'用户名或密码错误');return;}
 if(d.token)localStorage.setItem('userToken',d.token);
 currentUser=u;localStorage.setItem('currentUser',u);const users=loadUsers();const i=users.findIndex(x=>x.username===u);
 if(i===-1)users.push({username:u,created_at:new Date().toISOString(),lastLogin:new Date().toISOString(),favorites:d.user?.favorites||[],blacklist:d.user?.blacklist||[],preferences:d.user?.preferences||{}});
 else{users[i].lastLogin=new Date().toISOString();if(d.user?.favorites)users[i].favorites=d.user.favorites;if(d.user?.blacklist)users[i].blacklist=d.user.blacklist;if(d.user?.preferences)users[i].preferences=d.user.preferences;}
 saveUsers(users);showMessage('登录成功','欢迎回来，'+u+'！',function(){
     const pi=document.getElementById('nav-profile-item'),nu=document.getElementById('nav-user');
     if(pi)pi.classList.remove('d-none');if(nu)nu.classList.add('d-none');
     // 隐藏home区登录/注册按钮
     const hlb=document.getElementById('login-btn'),hrb=document.getElementById('register-btn');
     if(hlb)hlb.classList.add('d-none');if(hrb)hrb.classList.add('d-none');
     // 登录后重查首页两个"上次"按钮（页面加载时可能是游客态被隐藏）
     if(window.updateHomeButtons)window.updateHomeButtons();
     showSection('preference-section');if(d.user?.preferences)loadUserPreferences(d.user.preferences);
   });})
 .catch(()=>{showMessage('登录失败','无法连接到服务器，请检查网络');}).finally(()=>{const b=document.getElementById('login-btn');if(b)b.disabled=false;});
}

// 注册表单行内错误提示
function setRegErr(field,msg){
 const el=document.getElementById('register-'+field+'-err');
 if(!el)return;
 if(msg){el.textContent=msg;el.style.display='block';}
 else{el.textContent='';el.style.display='none';}
}
function clearRegErrs(){['username','password','confirm'].forEach(f=>setRegErr(f,''));}

function register(){
 const uEl=document.getElementById('register-username'),pEl=document.getElementById('register-password'),cEl=document.getElementById('register-confirm'),bEl=document.getElementById('register-btn');
 const aEl=document.getElementById('agree-privacy');
 if(!uEl||!pEl||!cEl){showMessage('页面错误','注册表单元素未找到');return;}
 if(bEl)bEl.disabled=true;
 const u=uEl.value.trim(),p=pEl.value,c=cEl.value;
 clearRegErrs();
 const fail=(field,msg)=>{setRegErr(field,msg);if(bEl)bEl.disabled=false;};
 if(!u){fail('username','请填写用户名');return;}
 if(u.length<2||u.length>20){fail('username','用户名需 2-20 个字符');return;}
 if(!p){fail('password','请填写密码');return;}
 if(p.length<8||p.length>20){fail('password','密码需 8-20 位');return;}
 if(!/[A-Z]/.test(p)){fail('password','密码须包含大写字母');return;}
 if(!/[a-z]/.test(p)){fail('password','密码须包含小写字母');return;}
 if(!/[0-9]/.test(p)){fail('password','密码须包含数字');return;}
 if(p!==c){fail('confirm','两次输入的密码不一致');return;}
 if(!aEl||!aEl.checked){showMessage('注册失败','请阅读并同意隐私政策');if(bEl)bEl.disabled=false;return;}
 safeFetch('/api/user/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})})
 .then(r=>r.json()).then(d=>{if(!d.success){
  const err=d.error||'注册失败';
  if(err.includes('用户名'))setRegErr('username',err);
  else if(err.includes('密码'))setRegErr('password',err);
  else showMessage('注册失败',err);
  return;}
 if(d.token)localStorage.setItem('userToken',d.token);
 currentUser=u;localStorage.setItem('currentUser',u);const users=loadUsers();if(!users.find(x=>x.username===u))users.push({username:u,created_at:new Date().toISOString(),lastLogin:new Date().toISOString(),favorites:[],blacklist:[],preferences:{}});saveUsers(users);
 showMessage('注册成功','欢迎，'+u+'！',function(){
     const pi=document.getElementById('nav-profile-item'),nu=document.getElementById('nav-user');
     if(pi)pi.classList.remove('d-none');if(nu)nu.classList.add('d-none');
     const hlb=document.getElementById('login-btn'),hrb=document.getElementById('register-btn');
     if(hlb)hlb.classList.add('d-none');if(hrb)hrb.classList.add('d-none');
     if(window.updateHomeButtons)window.updateHomeButtons();
     showSection('preference-section');
   });})
 .catch(()=>{showMessage('注册失败','无法连接到服务器，请检查网络');}).finally(()=>{const b=document.getElementById('register-btn');if(b)b.disabled=false;});
}

function loadUserPreferences(prefs){
 if(!prefs)return;
 const $=id=>document.getElementById(id);
 // 安全设置元素值（带 null 保护）
 const setVal = (id, val) => { const el = $(id); if (el) el.value = val; };
 const setChecked = (id, checked) => { const el = $(id); if (el) el.checked = checked; };
 const setDisabled = (id, disabled) => { const el = $(id); if (el) el.disabled = disabled; };
 if(prefs.spiciness) setVal('spiciness', prefs.spiciness);
 if(prefs.saltiness) setVal('saltiness', prefs.saltiness);
 if(prefs.sweetness) setVal('sweetness', prefs.sweetness);
 if(prefs.price) setVal('price', prefs.price);
 if(prefs.calorie) setVal('calorie', prefs.calorie);
 if(prefs.recommendationMode&&['auto','api','local'].includes(prefs.recommendationMode)) setVal('recommendation-mode', prefs.recommendationMode);
 if(prefs.religion) setVal('religion', prefs.religion);
 if(prefs.allergies&&prefs.allergies.length>0){
  setChecked('allergy-none', false);
  setChecked('allergy-seafood', prefs.allergies.includes('海鲜'));
  setChecked('allergy-peanut', prefs.allergies.includes('花生'));
  setChecked('allergy-egg', prefs.allergies.includes('鸡蛋'));
  setChecked('allergy-soy', prefs.allergies.includes('大豆'));
  setChecked('allergy-gluten', prefs.allergies.includes('麸质'));
 } else {
  setChecked('allergy-none', true);
  ['allergy-seafood','allergy-peanut','allergy-egg','allergy-soy','allergy-gluten'].forEach(id => {
   setChecked(id, false);
   setDisabled(id, true);
  });
 }
 }

// B7 冷启动：从未声明偏好的顾客直达本店热门 Top6（销量排序，排除饮品/主食/售罄），
// 结果页"还有 X 项偏好未设置"横幅自动引导补全——不强迫新客先填表
function coldStartHotRecommend(){
 const $=id=>document.getElementById(id);
 userProfile={spiciness:'无所谓',saltiness:'无所谓',sweetness:'无所谓',price:'不限',calorie:'不限',religion:'无特殊要求',allergies:[],recommendationMode:'本地推荐（更快速）',blindBoxMode:'智能选（按偏好加权）',coldStart:true};
 showSection('recommendation-section');
 const rl=$('recommendation-loading'),rr=$('recommendation-result');
 if(rl)rl.classList.add('d-none');
 if(rr)rr.classList.remove('d-none');
 const hot=dishData
  .filter(d=>d.is_active!==false&&d.is_sold_out!==true&&d.category!=='飲品与酒水'&&d.category!=='主食')
  .sort((a,b)=>(b.order_count||0)-(a.order_count||0)).slice(0,6)
  .map(d=>Object.assign({},d,{reason:'本店人气招牌，最近大家都在点',matchRate:0.5,matchIndex:0.5,type:'热门推荐'}));
 currentRecommendations=hot;
 const dl=$('dish-list');if(dl)dl.innerHTML='';
 if(typeof displayRecommendations==='function')displayRecommendations();
 if(typeof renderPrefCompletenessBanner==='function')renderPrefCompletenessBanner();
 safeFetch('/api/recommendation-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'冷启动热门推荐'})}).catch(()=>{});
}

function submitPreference(){
 const $=id=>document.getElementById(id);
 // null 保护：检查所有偏好元素是否存在
 const sp=$('spiciness'),sa=$('saltiness'),sw=$('sweetness'),pr=$('price'),ca=$('calorie'),re=$('religion'),rm=$('recommendation-mode'),bm=$('blind-box-mode');
 if(!sp||!sa||!sw||!pr||!ca||!re||!rm||!bm){showMessage('页面错误','偏好设置表单未完全加载');return;}
 userProfile={spiciness:sp.value,saltiness:sa.value,sweetness:sw.value,price:pr.value,calorie:ca.value,religion:re.value,allergies:[],recommendationMode:rm.value,blindBoxMode:bm.value};
 if($('allergy-none')&&!$('allergy-none').checked){
  const amap={'allergy-seafood':'海鲜','allergy-peanut':'花生','allergy-egg':'鸡蛋','allergy-soy':'大豆','allergy-gluten':'麸质'};
  Object.keys(amap).forEach(k=>{if($(k).checked)userProfile.allergies.push(amap[k]);});
 }
 if(currentUser!=='guest'){
  updateUserData(currentUser,{preferences:userProfile});
  localStorage.setItem('savedPrefs','true');
  safeFetch('/api/user-preferences',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,preferences:userProfile})}).catch(()=>{});
}
 // 记录偏好选择（填过表单的标记：下次点 AI 直达表单）
 sessionStorage.setItem('tasteFilled','1');
 safeFetch('/api/preference-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spiciness:userProfile.spiciness,saltiness:userProfile.saltiness,sweetness:userProfile.sweetness,price:userProfile.price,calorie:userProfile.calorie,religion:userProfile.religion,allergies:userProfile.allergies,userId:currentUser||'guest',recommendationMode:userProfile.recommendationMode})}).catch(()=>{});
 showSection('recommendation-section');
 const rl=$('recommendation-loading'),rr=$('recommendation-result');
 if(rl)rl.classList.remove('d-none');
 if(rr)rr.classList.add('d-none');
 fetchRecommendations();
}






// ═══════════════ 推荐结果渲染 ═══════════════



// ═══════════════ 评分反馈 ═══════════════
function submitStarFeedback(){
 if(!starRatingDish||!starRatingValue){showMessage('评价失败','请先选择评分');return;}
 const dish=starRatingDish;
 const $g=id=>{const el=document.getElementById(id);return el?el.value:'';};
 const prefs={spiciness:$g('spiciness'),saltiness:$g('saltiness'),sweetness:$g('sweetness'),price:$g('price'),allergies:[]};
 const uid=currentUser||'guest';
 safeFetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({dishId:dish.id,score:starRatingValue,userPreferences:prefs,userId:uid})})
 .then(r=>r.json()).then(d=>{if(!d.success){showMessage('评价失败',d.error||'提交失败，请重试');return;}showMessage('评价成功','感谢您对'+dish.name+'的评价！',function(){starRatingDish=null;starRatingValue=0;document.querySelectorAll('.star').forEach(s=>{s.textContent='☆';s.style.color='#ddd';});const h=document.getElementById('star-hint');if(h)h.textContent='点击星星评分';const sb=document.getElementById('star-submit-btn');if(sb)sb.disabled=true;showSection(ratingReturnTo||'recommendation-section');});}).catch(()=>showMessage('评价失败','网络错误，请稍后重试'));
}
function openStarFeedback(dish){
 starRatingDish=dish;starRatingValue=0;ratingReturnTo='recommendation-section';
 const fd=document.getElementById('star-feedback-dish');if(fd)fd.textContent='给「'+dish.name+'」评分';
 document.querySelectorAll('.star').forEach(s=>{s.textContent='☆';s.style.color='#ddd';});
 const h=document.getElementById('star-hint');if(h)h.textContent='点击星星评分';
 const sb=document.getElementById('star-submit-btn');if(sb)sb.disabled=true;
 showSection('feedback-section');
}

function endRecommendation(){
 // 记录已点过的菜品
 let ordered=[];try{ordered=JSON.parse(localStorage.getItem('orderedDishes')||'[]')}catch(e){};
 currentRecommendations.forEach(d=>{if(!ordered.includes(d.id))ordered.push(d.id);});
 try{localStorage.setItem('orderedDishes',JSON.stringify(ordered))}catch(e){};
 // 选好了 = 跳购物车结算（购物车里是用户自己加购的菜，不自动添加推荐菜）
 showCart();
}
function displayModelMetrics(){
 const el=document.getElementById('model-metrics');
 if(!el)return;
 safeFetch('/api/model-metrics').then(r=>r.json()).then(d=>{
  if(d.success&&d.metrics){
   const m=d.metrics;
   const items=[
    {label:'MSE',value:m.mse.toFixed(4),desc:'均方误差'},
    {label:'RMSE',value:m.rmse.toFixed(4),desc:'均方根误差'},
    {label:'MAE',value:m.mae.toFixed(4),desc:'平均绝对误差'},
    {label:'R²',value:m.r2.toFixed(4),desc:'决定系数'}
   ];
   el.innerHTML=items.map(i=>
    '<div style="text-align:center;min-width:100px;flex:1;">'+
    '<div style="font-size:1.5rem;font-weight:700;color:var(--text);">'+i.value+'</div>'+
    '<div style="font-size:0.8rem;color:var(--text-light);margin-top:2px;">'+i.desc+'</div>'+
    '<div style="font-size:0.7rem;color:#c9a96e;">'+i.label+'</div>'+
    '</div>'
   ).join('');
   const r2=document.getElementById('end-model-r2');
   if(r2)r2.textContent=m.r2.toFixed(2);
  }

// ═══════════════ 个人资料与历史 ═══════════════
 }).catch(()=>{});
}
function displayFeatureImportance(){
 const el=document.getElementById('feature-importance-chart');
 if(!el)return;
 // 显示加载状态
 const ctx=el.getContext('2d');
 const parent=el.parentElement;
 if(parent&&!parent.querySelector('.loading-text')){
  const tip=document.createElement('p');
  tip.className='loading-text';
  tip.style.cssText='color:var(--text-light);font-size:0.85rem;text-align:center;padding:20px;';
  tip.textContent='正在加载特征数据...';
  parent.appendChild(tip);
 }
 if(featureImportanceChart){featureImportanceChart.destroy();featureImportanceChart=null;}
 safeFetch('/api/feature-importance').then(r=>r.json()).then(d=>{
  if(d.success&&d.importance&&d.importance.length){
   const imp=d.importance.filter(x=>x.importance>0.005).slice(0,15);
   const labels=imp.map(x=>x.feature);
   const data=imp.map(x=>x.importance);
   const colors=['#8b1a1a','#b83a2a','#c0392b','#d45a4a','#e8a090','#e8d5b0','#c9a96e','#a8884e','#7a6a4e','#5a4a3e','#3a2a2e','#c0885e','#d0986e','#a0704e','#805030'];
   if(typeof Chart!=='undefined'){
    try {
     // 强制同步 canvas 尺寸（避免不可见时 clientWidth=0 导致 chart 不渲染）
     const cw=el.clientWidth||el.parentElement.clientWidth||553,ch=el.clientHeight||280;
     el.width=cw;el.height=ch;
     featureImportanceChart=new Chart(el.getContext('2d'),{
      type:'bar',
      data:{labels,datasets:[{label:'重要性',data,backgroundColor:colors.slice(0,labels.length),borderRadius:4}]},
      options:{
       indexAxis:'y',responsive:true,maintainAspectRatio:false,
       scales:{x:{beginAtZero:true,grid:{display:false}},y:{grid:{display:false}}},
       plugins:{legend:{display:false}}
      }
     });
     // 移除加载提示
     const lt=parent?.querySelector('.loading-text');
     if(lt)lt.remove();
    } catch(e) {}
   }
  }
 }).catch(()=>{
  const lt=parent?.querySelector('.loading-text');
  if(lt)lt.textContent='加载失败';
 });
}
function resetRecommendation(){currentRecommendations=[];recommendedIds=[];userProfile=null;}
function scrollToTop(){window.scrollTo({top:0,behavior:'smooth'});}
function logout(){const msg=currentUser==='guest'?'已退出':'已退出登录';
 // 尽力吊销服务端 token（fire-and-forget，不阻塞退出流程）
 const token=localStorage.getItem('userToken');
 if(token){safeFetch('/api/user/logout',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}}).catch(()=>{});}
 currentUser=null;localStorage.removeItem('currentUser');localStorage.removeItem('userToken');localStorage.removeItem('prefCompletenessDismissed');resetRecommendation();const pi=document.getElementById('nav-profile-item'),nu=document.getElementById('nav-user');if(pi)pi.classList.add('d-none');if(nu)nu.classList.remove('d-none');const hlb=document.getElementById('login-btn'),hrb=document.getElementById('register-btn');if(hlb)hlb.classList.remove('d-none');if(hrb)hrb.classList.remove('d-none');const vcbG=document.getElementById('view-cached-btn');if(vcbG)vcbG.classList.add('d-none');if(window.updateHomeButtons)window.updateHomeButtons();showMessage('已退出',msg,function(){showSection('home-section');});}
function showProfile(){
 if(!currentUser||currentUser==='guest'){showMessage('提示','请先登录');return;}
 const user=getUserData(currentUser);if(!user){showMessage('错误','无法获取用户信息');return;}
  const pu=document.getElementById('profile-username');if(pu)pu.textContent=user.username||currentUser;
 const pl=document.getElementById('profile-last-login');if(pl)pl.textContent=user.lastLogin||'从未登录';
 const $=id=>document.getElementById(id);
 const fl=$('favorites-list');if(fl)fl.innerHTML=user.favorites?.length?user.favorites.map((id,i)=>{const d=dishData.find(x=>x.id==id);return '<div class="d-flex justify-content-between align-items-center mb-2"><span>'+(i+1)+'. '+(d?esc(dishNameOf(d)):'菜品'+esc(String(id)))+'</span><button class="btn btn-sm btn-danger cancel-favorite" data-id="'+esc(String(id))+'">取消</button></div>';}).join(''):'<p class="text-muted">还没有收藏的菜品</p>';
 const bl=$('blacklist-list');if(bl)bl.innerHTML=user.blacklist?.length?user.blacklist.map((id,i)=>{const d=dishData.find(x=>x.id==id);return '<div class="d-flex justify-content-between align-items-center mb-2"><span>'+(i+1)+'. '+(d?esc(dishNameOf(d)):'菜品'+esc(String(id)))+'</span><button class="btn btn-sm btn-danger cancel-blacklist" data-id="'+esc(String(id))+'">取消</button></div>';}).join(''):'<p class="text-muted">还没有拉黑的菜品</p>';
 document.querySelectorAll('.cancel-favorite').forEach(b=>b.addEventListener('click',function(){const id=this.getAttribute('data-id');const u=getUserData(currentUser);if(u&&u.favorites){u.favorites=u.favorites.filter(x=>x!=id);updateUserData(currentUser,{favorites:u.favorites});safeFetch('/api/user-favorites',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,favorites:u.favorites})}).catch(()=>{});showMessage('成功','已取消收藏',showProfile);}}));
 document.querySelectorAll('.cancel-blacklist').forEach(b=>b.addEventListener('click',function(){const id=this.getAttribute('data-id');const u=getUserData(currentUser);if(u&&u.blacklist){u.blacklist=u.blacklist.filter(x=>x!=id);updateUserData(currentUser,{blacklist:u.blacklist});showMessage('成功','已取消',showProfile);}}));
 // 加载推荐历史（C13：缓存到全局供"再来一单"使用）
 const rh=$('rec-history-list');if(rh)rh.innerHTML='<p class="text-muted" style="font-size:0.85rem;">加载中...</p>';
 safeFetch('/api/orders?userId='+encodeURIComponent(currentUser),{headers:authHeaders()}).then(r=>r.json()).then(d=>{
  if(d.success&&d.orders&&d.orders.length){
   window.recentOrdersCache=d.orders;
            const items=d.orders.slice(0,10).map((o,oi)=>{
    const dishList=o.items||[];
    const time=o.created_at?new Date(o.created_at).toLocaleString():'';
    // 每道菜单独一行：菜名 + 评分按钮
    const dishRows=dishList.map((i,ii)=>{
     const dishId=i.id;
     return '<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px dashed rgba(201,169,110,0.08);">'
      +'<span>'+(ii+1)+'. '+esc(i.name||'未知')+'</span>'
      +'<button class="btn btn-sm btn-outline-warning re-rate-btn" data-dishid="'+esc(String(dishId))+'" data-dishname="'+esc(i.name||'未知')+'" style="font-size:0.72rem;padding:2px 8px;border-radius:4px;border-color:#f1c40f;color:#f39c12;"><i class="bi bi-star me-1"></i>评分</button>'
      +'</div>';
    }).join('');
    return '<div style="font-size:0.82rem;color:#4a3028;padding:6px 0;border-bottom:1px solid rgba(201,169,110,0.12);">'
     +'<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
     +'<span style="color:#8b7a6a;font-size:0.75rem;">'+time+'</span>'
     +'<span><button class="btn btn-sm reorder-btn" data-oi="'+oi+'" style="font-size:0.72rem;padding:1px 8px;border-radius:4px;border-color:var(--gold);color:var(--primary);margin-right:4px;" title="把这一单的菜重新加入购物车">🔁 再来一单</button>'
     +'<span style="color:#b83a2a;font-weight:600;">共'+dishList.length+'道</span></span>'
     +'</div>'
     +dishRows+'</div>';
   }).join('');  rh.innerHTML=items;
   // 绑定评分按钮事件
   // C13 再来一单：整单菜品重新加入购物车（赠菜/售罄/下架跳过）
   rh.querySelectorAll('.reorder-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
     const oi=parseInt(this.dataset.oi);
     const o=(window.recentOrdersCache||[])[oi];
     if(!o){showMessage('提示','订单数据已过期，请刷新后重试');return;}
     const items=(o.items||[]).filter(i=>!i.giftTo&&!i.giftFrom);
     if(!items.length){showMessage('提示','这一单没有可复购的菜品');return;}
     let added=0,skipped=[];
     items.forEach(i=>{
      const dish=dishData.find(d=>d.id===parseInt(i.id));
      if(!dish||dish.is_active===false||dish.is_sold_out===true){skipped.push(i.name||('菜品'+i.id));return;}
      const min=minQtyOf(dish);const q=Math.max(parseInt(i.qty)||1,min);
      addToCart({id:dish.id,name:dish.name,price:dish.price,image_url:dish.image_url,serving:dish.serving},q);added++;
     });
     if(skipped.length)showMessage('部分菜品已加入','以下菜品今日已售罄，已跳过：'+skipped.join('、'));
     else showMessage('已加入购物车',added+' 件商品已重新加入，去结算或继续加菜',function(){showSection('cart-section');showCart();});
    });
   });
   rh.querySelectorAll('.re-rate-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
     const dishId=parseInt(this.dataset.dishid);
     const dishName=this.dataset.dishname;
     if(!dishId)return;
     // 打开评分弹窗
     starRatingDish={id:dishId,name:dishName};starRatingValue=0;ratingReturnTo='profile-section';
     document.getElementById('star-feedback-dish').textContent='给「'+dishName+'」评分';
     document.querySelectorAll('.star').forEach(s=>{s.textContent='☆';s.style.color='#ddd';});
     document.getElementById('star-hint').textContent='点击星星评分';
     document.getElementById('star-submit-btn').disabled=true;
     showSection('feedback-section');
    });
   });
  }else{
   rh.innerHTML='<p class="text-muted" style="font-size:0.85rem;">还没有推荐记录</p>';
  }
 }).catch(()=>{rh.innerHTML='<p class="text-muted" style="font-size:0.85rem;">暂无记录</p>';});
 showSection('profile-section');
}

// ═══════════════ 收藏/拉黑 ═══════════════
function cancelFavorite(){
 const u=getUserData(currentUser);
 if(!u?.favorites?.length){showMessage('提示','收藏列表为空');return;}
 // 二次点击确认（沙箱 iframe 中原生 confirm 不可用）
 const btn=document.getElementById('cancel-favorite-btn');
 if(btn&&btn.dataset.armed!=='1'){btn.dataset.armed='1';const t=btn.textContent;btn.textContent='再次点击确认';btn.style.color='#c0392b';setTimeout(()=>{btn.dataset.armed='';btn.textContent=t;btn.style.color='';},3000);return;}
 if(btn){btn.dataset.armed='';}
 u.favorites=[];
 updateUserData(currentUser,{favorites:[]});
 safeFetch('/api/user-favorites',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,favorites:[]})}).catch(()=>{});
 showMessage('成功','已取消所有收藏');
 setTimeout(showProfile,1000);
}
function cancelBlacklist(){
 const u=getUserData(currentUser);
 if(!u?.blacklist?.length){showMessage('提示','列表为空');return;}
 const btn=document.getElementById('cancel-blacklist-btn');
 if(btn&&btn.dataset.armed!=='1'){btn.dataset.armed='1';const t=btn.textContent;btn.textContent='再次点击确认';btn.style.color='#c0392b';setTimeout(()=>{btn.dataset.armed='';btn.textContent=t;btn.style.color='';},3000);return;}
 if(btn){btn.dataset.armed='';}
 u.blacklist=[];
 updateUserData(currentUser,{blacklist:[]});
 safeFetch('/api/user-blacklist',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,blacklist:[]})}).catch(()=>{});
 showMessage('成功','已清空黑名单');
 setTimeout(showProfile,1000);
}
function addToFavorites(dishId){if(!currentUser||currentUser==='guest'){showMessage('提示','请先登录');return;}
 const user=getUserData(currentUser);if(!user){showMessage('错误','无法获取用户信息');return;}
 if(!user.favorites)user.favorites=[];if(user.favorites.includes(dishId)){showMessage('提示','已收藏');return;}
 if(user.blacklist?.includes(dishId)){user.blacklist=user.blacklist.filter(id=>id!==dishId);updateUserData(currentUser,{blacklist:user.blacklist});safeFetch('/api/user-blacklist',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,blacklist:user.blacklist})}).catch(()=>{});}
 user.favorites.push(dishId);updateUserData(currentUser,{favorites:user.favorites});const dish=dishData.find(d=>d.id===dishId);showMessage('成功','已收藏'+(dish?dish.name:''));
 safeFetch('/api/user-favorites',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,favorites:user.favorites})}).catch(()=>{});
 displayRecommendations();}
function addToBlacklist(dishId){if(!currentUser||currentUser==='guest'){showMessage('提示','请先登录');return;}
 const user=getUserData(currentUser);if(!user){showMessage('错误','无法获取用户信息');return;}
 if(!user.blacklist)user.blacklist=[];if(user.blacklist.includes(dishId)){showMessage('提示','已拉黑');return;}
 if(user.favorites?.includes(dishId)){user.favorites=user.favorites.filter(id=>id!==dishId);updateUserData(currentUser,{favorites:user.favorites});safeFetch('/api/user-favorites',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,favorites:user.favorites})}).catch(()=>{});}
 user.blacklist.push(dishId);updateUserData(currentUser,{blacklist:user.blacklist});const dish=dishData.find(d=>d.id===dishId);showMessage('成功','已拉黑'+(dish?dish.name:''));
 safeFetch('/api/user-blacklist',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,blacklist:user.blacklist})}).catch(()=>{});
 displayRecommendations();}
function deleteAccount(){
 const el=document.getElementById('message-modal'),cf=document.getElementById('modal-confirm-btn'),cb=document.getElementById('modal-close-btn');
 document.getElementById('modal-title').textContent='确认注销';document.getElementById('modal-body').innerHTML='确定要注销账号吗？此操作不可恢复！<input type="password" id="delete-pw-input" class="form-control mt-2" placeholder="输入登录密码确认" autocomplete="off" style="text-align:center;">';
 const origCf=cf.onclick,origCb=cb.onclick;
 const cleanup=()=>{cf.onclick=origCf;cb.onclick=origCb;el.removeEventListener('hidden.bs.modal',cleanup);};
 cf.onclick=function(){const username=currentUser;const pwInput=document.getElementById('delete-pw-input');const pw=pwInput?(pwInput.value||'').trim():'';
  if(!pw){if(pwInput){pwInput.style.borderColor='#e74c3c';pwInput.focus();}return;}
  safeFetch('/api/user/delete',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:username,password:pw})}).then(r=>r.json()).then(d=>{if(d.success){removeUser(username);currentUser=null;localStorage.removeItem('currentUser');localStorage.removeItem('userToken');resetRecommendation();const m=bootstrap.Modal.getInstance(el);if(m)m.hide();cleanup();setTimeout(()=>{showMessage('成功','账号已注销',function(){showSection('home-section');});},300);}else{showMessage('注销失败',d.error||'服务器错误');}}).catch(()=>{showMessage('网络错误','注销请求失败，请稍后重试');});};
 cb.onclick=function(){const m=bootstrap.Modal.getInstance(el);if(m)m.hide();cleanup();};
 el.addEventListener('hidden.bs.modal',cleanup);
 el.inert=false;el.removeAttribute('aria-hidden');let m=bootstrap.Modal.getInstance(el);if(!m)m=new bootstrap.Modal(el,{focus:false});m.show();
 setTimeout(()=>{const p=document.getElementById('delete-pw-input');if(p)p.focus();},300);
  // 聚焦确认按钮
  el.addEventListener('shown.bs.modal', function focusDelHandler() {
    el.removeEventListener('shown.bs.modal', focusDelHandler);
    const confirmBtn = document.getElementById('modal-confirm-btn');
    if (confirmBtn) setTimeout(function() { confirmBtn.focus(); }, 50);
  });
}

// ═══════════════ 购物车功能 ═══════════════
function renderRoundsHTML(rounds){
 if(!rounds||!rounds.length)return '';
 const lastIdx=rounds.length-1;
 const normal=rounds.map((r,i)=>({r,i})).filter(o=>!o.r.giftTo);
 const gifts=rounds.map((r,i)=>({r,i})).filter(o=>o.r.giftTo);
 let html=normal.map(o=>{
  const r=o.r,cur=o.i===lastIdx;
  return '<div style="border-left:2px solid '+(cur?'var(--gold)':'rgba(201,169,110,0.25)')+';padding-left:10px;margin-bottom:12px;opacity:'+(cur?1:0.6)+';"><div style="font-size:0.8rem;font-weight:600;color:'+(cur?'var(--gold)':'var(--text-light)')+';padding-bottom:3px;">● '+(r.label||('第'+(r.round||o.i+1)+'轮'))+(cur?' ← 当前轮':' · '+(r.time||''))+'</div>'
   +(r.items||[]).map(x=>'<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--cream-dark);border-radius:6px;margin-top:3px;"><span style="font-size:0.85rem;">'+esc(x.name)+'</span><span style="font-size:0.8rem;color:var(--text-light);"><strong style="color:var(--text);">×'+(x.qty||1)+'</strong> · '+formatPrice(x.price)+'</span></div>').join('')
   +'</div>';
 }).join('');
 // 赠菜区（本桌付费，赠给别桌）：分割线分开 + 可折叠
 if(gifts.length){
  const merged=[];
  gifts.forEach(o=>o.r.items.forEach(x=>{const ex=merged.find(m=>m.id===x.id&&String(m.giftTo)===String(o.r.giftTo));if(ex)ex.qty=(ex.qty||1)+(x.qty||1);else merged.push({...x,giftTo:o.r.giftTo});}));
  const tables=[...new Set(gifts.map(o=>String(o.r.giftTo)))].join('、');
  const gTotal=gifts.reduce((s,o)=>s+(parseFloat(o.r.total)||0),0);
  html+='<div data-gift="1" style="border-left:2px solid rgba(201,169,110,0.55);padding-left:10px;margin-bottom:12px;">'
   +'<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;gap:8px;" onclick="toggleGiftRounds(this)">'
   +'<span style="font-size:0.8rem;font-weight:600;color:var(--gold);">🎁 赠给 '+tables+' 号桌 · 本桌付费 '+gTotal.toFixed(2)+' 元</span>'
   +'<span style="display:flex;align-items:center;gap:10px;white-space:nowrap;"><span onclick="event.stopPropagation();showGiftReceipt(\''+esc(String(gifts[0].r.giftTo))+'\')" style="font-size:0.72rem;color:var(--primary-accent);text-decoration:underline;">被赠桌小票</span><span class="gift-toggle-txt" style="font-size:0.72rem;color:var(--text-light);">隐藏</span></span></div>'
   +'<div class="gift-body" style="display:flex;flex-direction:column;margin-top:6px;">'
   +merged.map(x=>'<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--cream-dark);border-radius:6px;margin-top:3px;"><span style="font-size:0.85rem;">'+esc(x.name)+' <span style="font-size:0.7rem;color:var(--gold);">→'+esc(String(x.giftTo))+'号桌</span></span><span style="font-size:0.8rem;color:var(--text-light);"><strong style="color:var(--text);">×'+(x.qty||1)+'</strong> · '+formatPrice(x.price)+'</span></div>').join('')
   +'</div></div>';
 }
 return html;
}
// ─── 桌号体系：两位格式（01-99）或「打包」───
function normTableNo(v){
 const s=String(v==null?'':v).trim();
 if(!/^\d{1,2}$/.test(s))return null;
 const n=parseInt(s,10);
 if(n<1||n>99)return null;
 return String(n).padStart(2,'0');
}
function tableLabel(t){return t==='打包'?'打包带走':(t?t+' 号桌':'');}
function updateTableStatusCard(){
 const t=ssGet('lockedTable')||'';
 const txt=document.getElementById('table-status-text');
 const btn=document.getElementById('table-change-btn');
 if(txt)txt.textContent=t?tableLabel(t):'未选择桌号';
 if(btn)btn.textContent=t?'更换':'选择桌号';
 const ti=document.getElementById('cart-table-number');
 if(ti){ti.value=t==='打包'?'打包':(t||'');ti.readOnly=!!t;ti.placeholder=t?'':'选择桌号';ti.style.background=t?'var(--cream-dark)':'';}
 const pt=document.getElementById('pref-table-number');
 if(pt){pt.value=t==='打包'?'打包':(t||'');pt.readOnly=!!t;pt.placeholder=t?'':'选择桌号';pt.style.background=t?'var(--cream-dark)':'';}
}
var _tablePickIntent=null;
function openTablePicker(intent){
 _tablePickIntent=intent||null;
 const grid=document.getElementById('table-grid');
 if(grid&&!grid.childElementCount){
  let html='';
  for(let i=1;i<=30;i++){const t=String(i).padStart(2,'0');html+='<button class="btn btn-sm table-grid-btn" data-t="'+t+'" style="background:transparent;color:var(--text);border:1px solid rgba(201,169,110,0.4);border-radius:8px;padding:6px 0;font-size:0.85rem;">'+t+'</button>';}
  grid.innerHTML=html;
  grid.addEventListener('click',e=>{const b=e.target.closest('.table-grid-btn');if(b)applyTableChoice(b.dataset.t);});
 }
 const inp=document.getElementById('table-input');if(inp)inp.value='';
 const hint=document.getElementById('table-picker-hint');
 if(hint){hint.textContent='桌号为 1-2 位数字：输入 1 或 01 均指 01 号桌';hint.style.color='';}
 const m=document.getElementById('table-picker-modal');
 if(m){m.inert=false;m.removeAttribute('aria-hidden');bootstrap.Modal.getOrCreateInstance(m).show();}
}
function closeTablePicker(){
 const m=document.getElementById('table-picker-modal');if(!m)return;
 const inst=bootstrap.Modal.getInstance(m);if(inst){try{inst.hide();}catch(e){}}
 setTimeout(()=>{if(m.classList.contains('show')){const mm=bootstrap.Modal.getInstance(m);if(mm){mm._isTransitioning=false;try{mm.hide();}catch(e){}}}},400);
}
// 选定桌号：有进行中订单→挪桌(PATCH 改订单)；无订单→仅改锁定。订单已完成→清旧状态按新用餐
async function applyTableChoice(t){
 const cur=ssGet('lockedTable')||'';
 if(t!==cur){
  const oid=parseInt(ssGet('lastOrderId')||'0');
  if(oid){
   try{
    const r=await safeFetch('/api/order/'+oid+'/table',{method:'PATCH',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({tableNumber:t,fromTable:cur})});
    const d=await r.json();
    if(!d.success){
     ['lastOrderId','lastOrderTable','lastOrderItems','lastOrderRounds','lastOrderAI','lastOrderStats','sideOrder','orderBackup'].forEach(k=>ssRemove(k));ssRemovePrefix('giftReceipt_');
     resetRecommendation();
    }
   }catch(e){showMessage('提示','网络错误，桌号未更改');return;}
  }
  ssSet('lockedTable',t);ssSet('tableNumber',t);ssSet('lastOrderTable',t);
  updateTableStatusCard();
  const et=document.getElementById('end-order-table');if(et)et.textContent=t;
  const ei=document.getElementById('settled-order-info');if(ei&&ei.textContent)ei.textContent=ei.textContent.replace(/桌号 \S+/,'桌号 '+t);
  showMessage('已设置',t==='打包'?'已选择「打包带走」':'桌号已设为 '+t+' 号',null,2000);
 }
 closeTablePicker();
 const intent=_tablePickIntent;_tablePickIntent=null;
 if(intent==='menu')showDataset();
 else if(intent==='ai')showSection('preference-section');
 else if(intent==='table'){prefillTableBuilder();showSection('table-builder-section');}
 else if(intent==='checkout')checkoutCart();
}
// 本桌账单（免登录，凭签名桌码只读查看）
function showTableBill(){
 const t=ssGet('tableToken')||'';
 if(!t){showMessage('提示','请扫描餐桌上的二维码');return;}
 const box=document.getElementById('table-bill-body');
 const title=document.getElementById('table-bill-title');
 if(box)box.innerHTML='<div class="text-center py-4" style="color:var(--text-light);">加载中...</div>';
 const m=document.getElementById('table-bill-modal');
 if(m){m.inert=false;m.removeAttribute('aria-hidden');bootstrap.Modal.getOrCreateInstance(m).show();}
 safeFetch('/api/table-view?t='+encodeURIComponent(t)).then(r=>r.json()).then(d=>{
  if(!box)return;
  if(!d.success){box.innerHTML='<div class="text-center py-4" style="color:var(--text-light);">'+esc(d.error||'读取失败')+'</div>';return;}
  if(title)title.textContent=d.tableNumber+' 号桌 · 账单';
  const orders=d.orders||[];
  if(!orders.length){box.innerHTML='<div class="text-center py-4" style="color:var(--text-light);">本桌暂无订单</div>';return;}
  let grand=0;
  box.innerHTML=orders.map(o=>{
   let sub=0;
   const rows=(o.items||[]).map(x=>{
    const qty=parseInt(x.qty||x.quantity)||1;
    const p=x.giftFrom?0:(parseFloat(x.price)||0); // 赠菜恒按 0 计（防脏数据误计）
    sub+=p*qty;
    if(x.giftFrom){
     return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--cream-dark);border-radius:6px;margin-top:4px;"><span style="font-size:0.86rem;">🎁 '+esc(x.name)+' <span style="font-size:0.7rem;color:var(--gold);">×'+qty+'（'+esc(String(x.giftFrom))+'号桌赠）</span></span><span style="font-size:0.86rem;color:var(--text);font-weight:600;">0元 <span style="font-size:0.72rem;color:var(--text-light);font-weight:400;text-decoration:line-through;">原价'+(parseFloat(x.origPrice)||0)+'元</span></span></div>';
    }
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--cream-dark);border-radius:6px;margin-top:4px;"><span style="font-size:0.86rem;">'+esc(x.name)+' <span style="font-size:0.72rem;color:var(--text-light);">×'+qty+'</span></span><span style="font-size:0.86rem;color:var(--text-light);">'+(p*qty).toFixed(2)+'元</span></div>';
   }).join('');
   const st=(o.status==='completed'?'✅ 已完成':o.status==='confirmed'?'🔥 已确认':'📌 待处理');
   grand+=sub;
   const tm=o.created_at?new Date(o.created_at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
   return '<div style="border-left:2px solid rgba(201,169,110,0.4);padding-left:10px;margin-bottom:14px;">'
    +'<div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text-light);padding-bottom:4px;"><span>订单 #'+esc(String(o.id))+' · '+esc(tm)+'</span><span>'+st+'</span></div>'
    +rows
    +'<div style="display:flex;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px dashed rgba(201,169,110,0.3);font-size:0.85rem;"><span style="color:var(--text-light);">小计</span><strong style="color:var(--text);">'+sub.toFixed(2)+'元</strong></div>'
    +'</div>';
  }).join('')
  +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(201,169,110,0.12);border-radius:10px;margin-top:6px;"><span style="font-size:0.9rem;color:var(--text);">合计</span><strong style="color:var(--primary-accent);font-size:1.2rem;">'+grand.toFixed(2)+' 元</strong></div>'
  +'<div style="font-size:0.72rem;color:var(--text-light);text-align:center;margin-top:8px;">账单仅供参考，以收银为准</div>';
 }).catch(()=>{if(box)box.innerHTML='<div class="text-center py-4" style="color:var(--text-light);">网络错误</div>';});
}
function toggleGiftRounds(head){
 const block=head.closest('[data-gift]');if(!block)return;
 const body=block.querySelector('.gift-body');if(!body)return;
 const hidden=body.style.display==='none';
 body.style.display=hidden?'flex':'none';
 const t=head.querySelector('.gift-toggle-txt');if(t)t.textContent=hidden?'隐藏':'显示';
}
// 被赠桌小票（只读）：赠菜 0 元 + 原价划线，合计不计费
function showGiftReceipt(table){
 const raw=ssGet('giftReceipt_'+table);
 let data=null;try{data=raw?JSON.parse(raw):null}catch(e){}
 const box=document.getElementById('gift-receipt-body');
 const title=document.getElementById('gift-receipt-title');
 if(!data||!box){showMessage('提示','未找到该桌的小票记录');return;}
 if(title)title.textContent=data.table+' 号桌 · 赠菜单';
 box.innerHTML='<div style="font-size:0.78rem;color:var(--text-light);margin-bottom:10px;">订单 #'+esc(String(data.id))+' · 来自 '+(data.from?esc(String(data.from))+' 号桌赠送':'赠送')+'</div>'
  +(data.items||[]).map(x=>'<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--cream-dark);border-radius:8px;margin-bottom:6px;">'
   +'<span style="font-size:0.9rem;">🎁 '+esc(x.name)+' <span style="font-size:0.75rem;color:var(--gold);">×'+(x.qty||1)+'</span></span>'
   +'<span style="font-size:0.9rem;color:var(--text);font-weight:600;">0元 <span style="font-size:0.75rem;color:var(--text-light);font-weight:400;text-decoration:line-through;">原价'+(parseFloat(x.origPrice)||0)+'元</span></span>'
   +'</div>').join('')
  +'<div style="border-top:1px dashed rgba(201,169,110,0.35);margin:10px 0 0;padding-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:0.9rem;">'
  +'<span style="color:var(--text-light);">合计（赠菜不计费）</span><strong style="color:var(--primary-accent);font-size:1.05rem;">0.00 元</strong></div>';
 const m=document.getElementById('gift-receipt-modal');
 if(m){m.inert=false;m.removeAttribute('aria-hidden');bootstrap.Modal.getOrCreateInstance(m).show();}
}
function showCart(){
 // 每次进入购物车强制隐藏提交过渡层（治本：不管上次结算状态如何都干净）
 const clo0=document.getElementById('cart-loading');if(clo0)clo0.style.display='none';
 // 进行中订单提示条（跳走后回来的入口）
 const ltB=ssGet('lockedTable')||'',loB=ssGet('lastOrderId')||'';
 const banner=document.getElementById('cart-order-banner');
 if(banner){
  if(ltB&&loB){banner.style.display='flex';const bt=document.getElementById('banner-table');if(bt)bt.textContent=ltB;const bo=document.getElementById('banner-oid');if(bo)bo.textContent='#'+loB;}
  else banner.style.display='none';
  // 赠菜模式提示:给别桌加菜进行中,明确告知目标桌号(2026-09-17)
  const gfb=document.getElementById('gift-mode-banner');
  if(gfb){const sideOn=ssGet('sideOrder')==='1',pending=ssGet('sidePendingTable')||'';const target=pending||(sideOn?(ssGet('lockedTable')||ssGet('tableNumber')||''):'');if(sideOn&&target){gfb.style.display='flex';const gt=document.getElementById('gift-mode-table');if(gt)gt.textContent=target;}else gfb.style.display='none';}
 }
 // 桌号展示（选桌后只读，点击可更换/挪桌）
 updateTableStatusCard();
 window._prevScrollY=window.scrollY;
 const cart=getCart();const empty=document.getElementById('cart-empty'),content=document.getElementById('cart-content');
 const tb=document.getElementById('cart-table-body');const ti=document.getElementById('cart-total-items');const tp=document.getElementById('cart-total-price');
 // 已结算区（时间线：每轮独立，当前轮高亮）
 const rounds=(()=>{try{return JSON.parse(ssGet('lastOrderRounds')||'[]')}catch(e){return[]}})();
 const sSec=document.getElementById('settled-section'),sDiv=document.getElementById('settled-divider');
 if(rounds.length){
  if(sSec)sSec.style.display='block';
  if(sDiv)sDiv.classList.remove('d-none');
  const si=document.getElementById('settled-order-info');
  if(si)si.textContent='订单 #'+(ssGet('lastOrderId')||'-')+' · 桌号 '+(ssGet('lastOrderTable')||'-')+' · 共 '+rounds.reduce((s,r)=>s+r.items.reduce((a,x)=>a+(x.qty||1),0),0)+' 件 · '+rounds.reduce((s,r)=>s+(parseFloat(r.total)||0),0).toFixed(2)+' 元';
  const sl=document.getElementById('settled-list');
  if(sl)sl.innerHTML=renderRoundsHTML(rounds);
 }else{
  if(sSec)sSec.style.display='none';
  if(sDiv)sDiv.classList.add('d-none');
 }
 if(!cart.length){if(empty)empty.style.display='block';if(content)content.style.display='none';if(tb)tb.innerHTML='';}else{
  if(empty)empty.style.display='none';if(content)content.style.display='block';
  if(tb)tb.innerHTML=cart.map(x=>{
   const dish=dishData.find(d=>d.id===x.id);
   const qtyVal=x.qty||1;
   const name=dish?esc(dish.name):esc(x.name);
   const unit=dish&&dish.price_unit?'<span style="font-size:0.75rem;color:var(--text-light);margin-left:4px;">'+esc(dish.price_unit)+'</span>':'';
   const price=parseFloat(x.price)||0;
   const subtotal=price*qtyVal;
   return '<tr><td>'+(dish&&dish.image_url?(dish.image_url.startsWith('/')||dish.image_url.startsWith('http')?'<img src="'+esc(dish.image_url||'')+'" alt="'+esc(dish.name||'菜品')+'" style="width:80px;height:80px;border-radius:8px;object-fit:cover;margin-right:8px;vertical-align:middle;" onerror="this.style.display=\'none\'">':'<span class="dish-emoji" style="font-size:2rem;margin-right:8px;vertical-align:middle;">'+esc(dish.image_url)+'</span>'):'')+name+unit+'<div style="margin-top:4px;"><input class="form-control form-control-sm cart-note-input" data-id="'+esc(String(x.id))+'" value="'+esc(x.note||'')+'" maxlength="30" placeholder="备注：少辣/不要香菜…" style="font-size:0.75rem;padding:2px 6px;border:1px solid #e4dbcf;border-radius:6px;max-width:220px;" aria-label="菜品备注"></div></td>'
    +'<td><div class="input-group input-group-sm" style="width:110px;height:30px;align-items:stretch;"><button class="btn btn-outline-secondary cart-qty-minus" data-id="'+esc(String(x.id))+'" style="padding:0 8px;height:30px;font-size:0.9rem;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:6px 0 0 6px;line-height:1;">−</button>'
    +'<input type="text" class="form-control text-center cart-qty-input" data-id="'+esc(String(x.id))+'" value="'+esc(String(qtyVal))+'" style="width:38px;height:30px;font-size:0.82rem;font-weight:600;padding:0;border-radius:0;border-left:1px solid #dee2e6;border-right:1px solid #dee2e6;text-align:center;display:flex;align-items:center;justify-content:center;">'
    +'<button class="btn btn-outline-secondary cart-qty-plus" data-id="'+esc(String(x.id))+'" style="padding:0 8px;height:30px;font-size:0.9rem;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:0 6px 6px 0;line-height:1;">+</button></div></td>'
    +'<td>'+price.toFixed(2)+'</td><td style="color:#c0392b;font-weight:600;">'+subtotal.toFixed(2)+'</td>'
    +'<td><button class="btn btn-sm btn-outline-danger cart-remove-btn" data-id="'+esc(String(x.id))+'" style="padding:2px 6px;font-size:0.7rem;"><i class="bi bi-x"></i></button></td></tr>';
  }).join('');
  if(ti)ti.textContent=getCartCount();
  if(tp)tp.textContent=getCartTotal().toFixed(2);
 }
 showSection('cart-section');
}
 function rebuildEndView(){
  const rounds=(()=>{try{return JSON.parse(ssGet('lastOrderRounds')||'[]')}catch(e){return[]}})();
  if(!rounds.length){showMessage('提示','当前没有进行中的订单');return;}
  const allItems=[];
  rounds.forEach(r=>r.items.forEach(x=>{const ex=allItems.find(m=>m.id===x.id);if(ex)ex.qty=(ex.qty||1)+(x.qty||1);else allItems.push({...x});}));
  const cnt=allItems.reduce((s,x)=>s+(x.qty||1),0);
  const tot=Math.round(allItems.reduce((s,x)=>s+(parseFloat(x.price)||0)*(x.qty||1),0)*100)/100;
  const ec=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  ec('end-order-id',ssGet('lastOrderId')||'-');
  ec('end-order-table',ssGet('lastOrderTable')||'-');
  ec('end-cart-count',cnt);
  ec('end-cart-total',tot);
  const tip=document.getElementById('end-order-tip');if(tip)tip.textContent=(rounds.length>1?'· 加菜已追加':'· 下单成功');
  const esl=document.getElementById('end-settled-list');
  if(esl)esl.innerHTML=renderRoundsHTML(rounds);
  const ediv=document.getElementById('end-add-divider');if(ediv)ediv.classList.add('d-none');
  const cl=document.getElementById('end-cart-list');if(cl)cl.innerHTML='';
  // AI 属性读持久化状态（结算后推荐内存已归零，回看不能变「AI未启用」）
  const isAI=ssGet('lastOrderAI')==='1';
  document.querySelectorAll('#end-section .ai-stat').forEach(el=>el.style.display=isAI?'':'none');
  const noAI3=document.getElementById('end-no-ai');if(noAI3)noAI3.style.display=isAI?'none':'block';
  if(isAI){
   const st=(()=>{try{return JSON.parse(ssGet('lastOrderStats')||'{}')}catch(e){return{}}})();
   const es3=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
   es3('end-dish-count',st.count??'-');es3('end-avg-match',(st.avg??'-')+'%');es3('end-top-match',(st.top??'-')+'%');
  }
  if(isAI){setTimeout(()=>{displayModelMetrics();displayFeatureImportance();},150);}
  showSection('end-section');
 }

async function checkoutCart(){
 const cart=getCart(),bEl=document.getElementById('cart-checkout-btn');
 if(!cart.length){showMessage('提示','购物车是空的');return;}
 // 起售数量闸门：任何菜品低于最小起售量（X个起）则拦截结算——最终防线，兜住所有漏网路径
 const violations=[];
 cart.forEach(x=>{
  const dish=dishData.find(d=>d.id===x.id);
  const min=minQtyOf(dish||{});
  if(min>1&&(x.qty||1)<min)violations.push((x.name||'菜品')+' 需'+min+'个起售（当前'+(x.qty||1)+'个）');
 });
 if(violations.length){showMessage('起售数量不足',violations.join('；')+'，请调整数量后结算',null,5000);return;}
 if(bEl)bEl.disabled=true;
 // 桌号：恒用锁定桌号（选桌后即锁定，改桌请用「更换/挪桌」）
 const tableNumber=ssGet('lockedTable')||'';
 if(!tableNumber){if(bEl)bEl.disabled=false;openTablePicker('checkout');return;}
 if(tableNumber!=='打包'&&!/^\d{2}$/.test(tableNumber)){showMessage('桌号格式不对','请重新选择桌号');if(bEl)bEl.disabled=false;return;}
 // 判断是否加菜（同桌已有进行中订单 → 追加，否则新建）
 let lastOrderId=parseInt(ssGet('lastOrderId')||'0');
 let lastOrderTable=ssGet('lastOrderTable')||'';
 let isAddMore=lastOrderId>0&&lastOrderTable===tableNumber;
 // 赠菜双向记账：给别桌加菜时，被赠桌记 0 元（标原价+赠出桌），赠出桌正常计费（标赠给桌）
 const isSideOrder=ssGet('sideOrder')==='1';
 let myTableForGift='';
 if(isSideOrder){try{myTableForGift=JSON.parse(ssGet('orderBackup')||'{}').lastOrderTable||''}catch(e){}}
 const payItems=cart.map(x=>{const dish=dishData.find(d=>d.id===x.id);const p=parseFloat(x.price)||0;return{id:x.id,name:x.name,price:p,type:'购物车',matchRate:0.5,qty:x.qty||1,note:String(x.note||'').trim().slice(0,30)};});
 const items=isSideOrder?payItems.map(i=>({...i,price:0,origPrice:i.price,giftFrom:myTableForGift})):payItems;
 const total=items.reduce((s,i)=>s+i.price*(i.qty||1),0);
 const payTotal=payItems.reduce((s,i)=>s+i.price*(i.qty||1),0);
 const uid=currentUser||'guest';
 const url=isAddMore?('/api/order/'+lastOrderId+'/add'):'/api/order';
 // 点击后立即显示过渡动画（独立覆盖层，不破坏购物车 DOM 结构）
 const clo=document.getElementById('cart-loading');
 if(clo)clo.style.display='flex';
 safeFetch(url,{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({userId:uid,items,totalPrice:total,tableNumber})})
 .then(r=>r.json()).then(d=>{
  if(!d.success){
   // 订单已被厨房完成后，清掉本地订单状态，允许同桌下新单（避免永远被拒）
   if((d.error||'').includes('不能加菜')){ssRemove('lastOrderId');ssRemove('lastOrderTable');ssRemove('lastOrderItems');ssRemove('lastOrderRounds');ssRemove('lockedTable');ssRemove('lastOrderAI');ssRemove('lastOrderStats');ssRemove('tableNumber');}
   showMessage(isAddMore?'加菜失败':'下单失败',d.error||'服务器错误');showCart();return;
  }
  // 给别桌加菜：该桌订单提交成功 → 赠菜追加到本桌订单（本桌付钱）+ 恢复本桌状态
  if(ssGet('sideOrder')==='1'){
   const backup=(()=>{try{return JSON.parse(ssGet('orderBackup')||'null')}catch(e){return null}})();
   ssRemove('sideOrder');ssRemove('orderBackup');
   if(backup&&backup.lastOrderId){
    const finishSide=()=>{
     ssSet('lastOrderId',backup.lastOrderId);ssSet('lastOrderTable',backup.lastOrderTable);ssSet('lastOrderItems',backup.lastOrderItems);ssSet('lastOrderRounds',backup.lastOrderRounds);ssSet('lastOrderAI',backup.lastOrderAI);ssSet('lastOrderStats',backup.lastOrderStats);ssSet('lockedTable',backup.lockedTable);
     const clo0=document.getElementById('cart-loading');if(clo0)clo0.style.display='none';
     clearCart();
     rebuildEndView();
     showMessage('已提交','已为 '+tableNumber+' 号桌赠菜 '+payItems.length+' 道（订单 #'+d.orderId+'），费用计入本桌，已返回您的订单',null,3500);
    };
    // 本桌时间线记录赠菜轮次
    const giftPayItems=payItems.map(x=>({...x,giftTo:tableNumber}));
    let rounds=[];try{rounds=JSON.parse(backup.lastOrderRounds||'[]')}catch(e){}
    const nD=new Date(),tm=String(nD.getHours()).padStart(2,'0')+':'+String(nD.getMinutes()).padStart(2,'0');
    rounds.push({round:rounds.length+1,label:'赠给 '+tableNumber+' 号桌',time:tm,items:giftPayItems,total:Math.round(payTotal*100)/100,giftTo:tableNumber});
    backup.lastOrderRounds=JSON.stringify(rounds);
    // 保存被赠桌小票（本地只读视图：0元+原价）
    ssSet('giftReceipt_'+tableNumber,JSON.stringify({id:d.orderId,table:tableNumber,from:myTableForGift,items:items}));
    // 追加到本桌订单（本桌计费，标记 giftTo）
    safeFetch('/api/order/'+backup.lastOrderId+'/add',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({items:giftPayItems})})
     .then(()=>{}).catch(()=>{showMessage('提示','赠菜已下单，但计入本桌账单失败，请告知服务员',null,4000);})
     .finally(finishSide);
    return;
   }
  }
  // 新订单（首单/换桌）不继承上一单的时间线轮次
  if(!isAddMore){ssRemove('lastOrderRounds');ssRemove('lastOrderItems');}
  let ordered=[];try{ordered=JSON.parse(localStorage.getItem('orderedDishes')||'[]')}catch(e){}
  cart.forEach(x=>{if(!ordered.includes(x.id))ordered.push(x.id);});
  try{localStorage.setItem('orderedDishes',JSON.stringify(ordered))}catch(e){};
  ssSet('lastOrderId',d.orderId);
  ssSet('lastOrderTable',tableNumber);
  ssSet('lockedTable',tableNumber);
  // 记录本轮（时间线轮次）
  const rounds=(()=>{try{return JSON.parse(ssGet('lastOrderRounds')||'[]')}catch(e){return[]}})();
  const now=new Date(),time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  rounds.push({round:rounds.length+1,label:(rounds.length===0?'第1轮点餐':'第'+(rounds.length+1)+'轮加菜'),time,items:cart.map(x=>({...x})),total});
  try{ssSet('lastOrderRounds',JSON.stringify(rounds))}catch(e){};
  const allItems=[];
  rounds.forEach(r=>r.items.forEach(x=>{const ex=allItems.find(m=>m.id===x.id);if(ex)ex.qty=(ex.qty||1)+(x.qty||1);else allItems.push({...x});}));
  const orderCount=allItems.reduce((s,x)=>s+(x.qty||1),0);
  const orderTotal=allItems.reduce((s,x)=>s+(parseFloat(x.price)||0)*(x.qty||1),0);
  const ec=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  ec('end-order-id',d.orderId);
  ec('end-order-table',tableNumber);
  ec('end-cart-count',orderCount);
  ec('end-cart-total',Math.round(orderTotal*100)/100);
  const tip=document.getElementById('end-order-tip');if(tip)tip.textContent=(rounds.length>1?'· 加菜已追加':'· 下单成功');
  const esl=document.getElementById('end-settled-list');
  if(esl)esl.innerHTML=renderRoundsHTML(rounds);
  const ediv=document.getElementById('end-add-divider');
  if(ediv)ediv.classList.add('d-none');
  const cl=document.getElementById('end-cart-list');
  if(cl)cl.innerHTML='';
  const isAI=currentRecommendations&&currentRecommendations.length>0;
  document.querySelectorAll('#end-section .ai-stat').forEach(el=>el.style.display=isAI?'':'none');
  const noAI2=document.getElementById('end-no-ai');if(noAI2)noAI2.style.display=isAI?'none':'block';
  // AI 模式：填充推荐统计（推荐菜品数/平均匹配度/最高匹配度）
  if(isAI){
   const cnt=currentRecommendations.length;
   const rates=currentRecommendations.filter(d=>d.type!=='盲盒尝鲜').map(d=>d.matchRate||0);
   const avg=rates.length?Math.round(rates.reduce((a,b)=>a+b,0)/rates.length*100):0;
   const top=rates.length?Math.round(Math.max(...rates)*100):0;
   const es=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
   es('end-dish-count',cnt);es('end-avg-match',avg+'%');es('end-top-match',top+'%');
   // AI 属性与统计持久化（rebuildEndView 回看/刷新后保持一致）
   ssSet('lastOrderAI','1');
   ssSet('lastOrderStats',JSON.stringify({count:cnt,avg,top}));
  }else{ssSet('lastOrderAI','0');ssRemove('lastOrderStats');}
  clearCart();
  // 结算完成，推荐状态归零（避免残留 recommendedIds/推荐统计影响后续菜单加购的结算与重新推荐）
  resetRecommendation();
  setTimeout(()=>{
   const clo2=document.getElementById('cart-loading');if(clo2)clo2.style.display='none';
   showSection('end-section');
   if(isAI){setTimeout(()=>{displayModelMetrics();displayFeatureImportance();},150);}
  },800);
 }).catch(()=>{showMessage(isAddMore?'加菜失败':'下单失败','网络错误，请稍后重试');showCart();}).finally(()=>{const b=document.getElementById('cart-checkout-btn');if(b)b.disabled=false;});
}

// 桌号同步: 偏好页输入 → localStorage → 购物车自动填
function syncTableNumber(from){
  const val=from?.value?.trim()||'';
  if(val)ssSet('tableNumber',val);
  const cart=document.getElementById('cart-table-number');
  if(cart&&val)cart.value=val;
}

// ─── js/recommendation.js ───
// 推荐逻辑模块
async function fetchRecommendations(isRefresh){
 console.group(isRefresh?'🔍刷新':'🔍推荐');
 const start=Date.now();
 const $=id=>document.getElementById(id);
 const rl=$('recommendation-loading'),rr=$('recommendation-result');
 if(!rl||!rr){console.warn('推荐元素未找到');showMessage('提示','页面加载中，请稍后重试');return;}
 rl.classList.remove('d-none');rr.classList.add('d-none');

 // 等待菜品数据加载完成（最多等5秒）
 if(!dishData.length){
  for(let w=0;w<50;w++){
   await new Promise(r=>setTimeout(r,100));
   if(dishData.length)break;
  }
  if(!dishData.length){
   showMessage('提示','菜品数据加载中，请稍后重试');
   rl.classList.add('d-none');
   return;
  }
 }

 const up=userProfile||{};const prefs={'辣度':up.spiciness||'无','咸淡':up.saltiness||'无','甜酸':up.sweetness||'无','价格区间':up.price||'无','饮食_宗教':up.religion==='无'?'无特殊要求':up.religion||'无','allergies':up.allergies||[],'calorie':up.calorie||'无','blindBoxMode':up.blindBoxMode||'smart'};
 let blk=[];if(currentUser&&currentUser!=='guest'){const u=getUserData(currentUser);if(u)blk=u.blacklist||[];}

 let dishes=dishData.filter(d=>{
  if(d.is_active===false)return false;
  if(d.category==='飲品与酒水'||d.category==='主食')return false;
  // 价格改为软打分(computeDishMatch),不再硬过滤
  const p=parseFloat(d.price);if(!isNaN(p)){}
  // 饮食要求筛选
  const r=prefs['饮食_宗教'];
  if(r!=='无特殊要求'){if(r==='清真'&&!d.isHalal)return false;if(r==='素食'&&!d.isVegetarian)return false;}
  if(recommendedIds.includes(d.id))return false;
  if(blk.includes(d.id))return false;
  const a=prefs['allergies']||[];
  if(a.includes('海鲜')&&d.allergies?.seafood)return false;
  if(a.includes('花生')&&d.allergies?.peanut)return false;
  if(a.includes('鸡蛋')&&d.allergies?.egg)return false;
  if(a.includes('大豆')&&d.allergies?.soy)return false;
  if(a.includes('麸质')&&d.allergies?.gluten)return false;
  return true;
 });
 if(dishes.length<5){showMessage('提示','没有更多菜品啦！');if($('recommendation-loading'))$('recommendation-loading').classList.add('d-none');return;}

 const processML=preds=>{
  const mlScores=dishes.map(d=>{const p=preds.find(p2=>p2.id==d.id);return p?p.score:0;});
  const mlMin=Math.min(...mlScores),mlMax=Math.max(...mlScores),mlR=mlMax-mlMin;
  dishes.forEach(d=>{
   const {matchDetails,totalMatch}=computeDishMatch(prefs,d);d.matchDetails=matchDetails;
   const pred=preds.find(p=>p.id==d.id);const ml=pred?pred.score:0;
   const rule=Math.min(totalMatch/14,1);
   // 评分全为默认3.5时归一化会放大ML噪声, 用绝对分ml/5让规则主导
   const mlNorm=Math.max(0,Math.min(1,ml/5));
   d.matchIndex=Math.round((rule*0.6+mlNorm*0.4)*100)/100;d.mlScore=ml;d.matchRate=rule*0.6+mlNorm*0.4;
  });
  dishes.sort((a,b)=>b.matchIndex-a.matchIndex);const top=dishes.slice(0,5);
  top.forEach(d=>{d.reason=generateDishReason(prefs,d);d.type='偏好推荐';});
  const blind=selectBlindBoxDish(prefs,top,blk);if(blind)top.push(blind);
  currentRecommendations=top;top.forEach(d=>{if(!recommendedIds.includes(d.id))recommendedIds.push(d.id);});
  currentRecommendationMode='机器学习(梯度提升)';console.groupEnd();displayRecommendations();
 };
 const callAPI=dlist=>{
  const TIMEOUT=15000,ft=(url,opt,ms)=>Promise.race([safeFetch(url,opt),new Promise((_,r)=>setTimeout(()=>r(new Error('超时')),ms))]);
  const od=dlist.slice(0,100).map(d=>({id:d.id,spiciness:d.spiciness,saltiness:d.saltiness,sweetness:d.sweetness,vegetable:'适量',rating:d.rating,price:d.price,isHalal:d.isHalal||false,isVegetarian:d.isVegetarian||false,allergies:d.allergies,religion:d.religion||'无特殊要求',calorie:d.calorie||'0',protein:d.protein||'0',tags:d.tags||[]}));
  ft('/api/predict-rf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userPrefs:prefs,dishes:od})},TIMEOUT)
  .then(r=>r.ok?r.json():Promise.reject(Error('HTTP'+r.status))).then(d=>{if(d.success)processML(d.predictions||[]);else fallback(prefs,blk,dishes);}).catch(()=>fallback(prefs,blk,dishes));
 };
 const mode=userProfile?.recommendationMode||'auto';
 if(mode==='local'){fallback(prefs,blk,dishes);return;}
 checkApiAvailability().then(a=>{if(a)callAPI(dishes);else if(mode==='api'){showMessage('提示','API不可用，已自动切换为本地推荐模式');fallback(prefs,blk,dishes);}else fallback(prefs,blk,dishes);});
}

async function fallback(prefs,blk,dishes){
 console.log('🔄本地推荐(决策树模型)');const start=Date.now();await loadDecisionTreeModel();
 dishes.forEach(d=>{
  const ps=predictWithDecisionTree(prefs,d);
  const md={taste:0,cuisine:0,calorie:0,rating:0,price:0};
  if(prefs['辣度']!=='无')md.taste+=gradeScore(SPICE_ORDER,prefs['辣度'],d.spiciness);else md.taste+=2;
  if(prefs['咸淡']!=='无')md.taste+=gradeScoreSoft(SALT_ORDER,prefs['咸淡'],d.saltiness);else md.taste+=2;
  if(prefs['甜酸']!=='无'){if(d.sweetness===prefs['甜酸'])md.taste+=2;else md.taste-=1;}else md.taste+=2;
  if(d.tags&&d.tags.includes('招牌'))md.cuisine+=1.0;   // 与 computeDishMatch 保持一致
  if(prefs['calorie']!=='无')md.calorie=gradeScoreSoft(CAL_ORDER,prefs['calorie'],d.calorie);else md.calorie=1;
  const pv=parseFloat(d.price);
  if(!isNaN(pv)&&prefs['价格区间']!=='无'&&prefs['价格区间']!=='不限'){
   if(prefs['价格区间']==='经济')md.price=pv<20?2:(pv<30?-1:-2);
   else if(prefs['价格区间']==='适中')md.price=(pv>=20&&pv<=50)?2:(pv<20||pv>50?-1:0);
   else if(prefs['价格区间']==='品质')md.price=pv>50?2:(pv>40?-1:-2);
  }else md.price=1;
  // 本地决策树模型(decision_tree_model.json)特征维度与 encodeDishFeaturesForTree 不匹配，预测值不可靠；rating 改用实际评分，与 computeDishMatch 一致
  const rs=parseFloat(d.rating);md.rating=!isNaN(rs)?Math.round((rs/5)*2.5*10)/10:2.0;
  const total=md.taste+md.cuisine+md.calorie+md.price+md.rating;
  d.matchIndex=Math.round(total*100)/100;d.matchDetails=md;d.predictedScore=ps;d.matchRate=total/14;
  d.reason='推荐理由：口味'+md.taste+' 招牌'+md.cuisine+' 热量'+md.calorie+' 价格'+md.price+' 评分'+md.rating;d.type='偏好推荐';
 });
 dishes.sort((a,b)=>b.matchIndex-a.matchIndex);const top=dishes.slice(0,5);
 const blind=selectBlindBoxDish(prefs,top,blk);if(blind)top.push(blind);
 currentRecommendations=top;top.forEach(d=>{if(!recommendedIds.includes(d.id))recommendedIds.push(d.id);});
 currentRecommendationMode='决策树模型';console.log('🍽️决策树推荐 '+top.length+'个菜品,耗时'+(Date.now()-start)/1000+'s');console.log('📊排名:',top.slice(0,5).map((d,i)=>(i+1)+'.'+d.name+'('+Math.round((d.matchRate||0)*100)+'%)').join('  '));if(top.find(d=>d.type==='盲盒尝鲜'))console.log('🎁盲盒:'+top.find(d=>d.type==='盲盒尝鲜').name);console.groupEnd();displayRecommendations();
}


// ═══════════════ 推荐结果渲染 ═══════════════
function renderRecipeCartBtn(d,cart){
 const ci=cart?cart.find(c=>c.id===d.id):null;
 if(ci)return '<div data-recipe-cart="'+d.id+'" class="d-inline-flex align-items-center" style="gap:4px;margin-right:4px;"><button class="btn btn-sm btn-outline-success cart-qty-minus" data-id="'+d.id+'" style="border-color:#27ae60;color:#27ae60;padding:2px 8px;line-height:1;">−</button><span class="cart-qty-val" data-id="'+d.id+'" style="font-weight:700;color:#27ae60;min-width:22px;text-align:center;">'+(ci.qty||1)+'</span><button class="btn btn-sm btn-outline-success cart-qty-plus" data-id="'+d.id+'" style="border-color:#27ae60;color:#27ae60;padding:2px 8px;line-height:1;">+</button></div>';
 return '<button data-recipe-cart="'+d.id+'" class="btn btn-sm btn-outline-success me-1 add-to-cart-btn" data-id="'+d.id+'" data-name="'+esc(d.name)+'" data-price="'+(d.price!==null&&d.price!==undefined?d.price:'')+'" data-image="'+esc(d.image_url||'')+'" style="border-color:#27ae60;color:#27ae60;"><i class="bi bi-cart-plus"></i> 加入</button>';
}
function refreshRecipeCartBtn(id){
 const rec=document.getElementById('recommendation-result');if(!rec)return;
 const d=currentRecommendations.find(x=>x.id===id)||dishData.find(x=>x.id===id);if(!d)return;
 const old=rec.querySelector('[data-recipe-cart="'+id+'"]');
 if(old)old.outerHTML=renderRecipeCartBtn(d,getCart());
}
// 跳转到饮料酒水分类（菜单页筛选+标签高亮），AI推荐与一席成宴共用（顶层函数）
// 传入席面下标时进入"为该席选饮品"模式：菜单页顶部横幅+返回席面，此模式加的饮品挂到席面
function gotoDrinksCategory(si){
 if(si!==undefined&&si!==null&&window.tableSets&&window.tableSets[si]){tableDrinksMode=si;}
 else{tableDrinksMode=null;}
 showSection('dataset-section');
 const sel=document.getElementById('menu-filter-cat');
 if(sel){sel.value='飲品与酒水';sel.dispatchEvent(new Event('change'));}
 const tab=[...document.querySelectorAll('.cat-tab')].find(t=>t.dataset.cat==='飲品与酒水');
 if(tab){document.querySelectorAll('.cat-tab').forEach(t=>{const on=t===tab;t.classList.toggle('active',on);t.style.background=on?'var(--primary)':'transparent';t.style.color=on?'#fff':'var(--text)';t.style.border=on?'none':'1px solid var(--gold-light)';});}
 if(tableDrinksMode!==null)renderDrinksModeBanner();
 if(typeof updateFloatBar==='function'){updateFloatBar();setTimeout(function(){updateFloatBar();},80);}
}
// 选饮品模式横幅：显示正在为哪套席面配饮品、已选几件，一键返回席面
function backToTableResult(){showSection('table-result-section');if(typeof updateFloatBar==='function'){updateFloatBar();setTimeout(function(){updateFloatBar();},80);}}
function renderDrinksModeBanner(){
 const ds=document.getElementById('dataset-section');if(!ds)return;
 let ban=document.getElementById('drinks-mode-banner');
 if(ban)ban.remove();
 if(tableDrinksMode===null||!window.tableSets||!window.tableSets[tableDrinksMode]){tableDrinksMode=null;return;}
 const s=window.tableSets[tableDrinksMode];
 const chosen=(s.chosenDrinkIds||[]).map(function(id){return getCart().find(function(x){return x.id===id;});}).filter(Boolean);
 ban=document.createElement('div');
 ban.id='drinks-mode-banner';
 ban.style.cssText='margin:10px 0;padding:10px 16px;border-radius:12px;background:linear-gradient(135deg,rgba(201,169,110,0.15),rgba(201,169,110,0.05));border:1px solid rgba(201,169,110,0.5);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;';
 ban.innerHTML='<span style="color:var(--text);font-size:0.9rem;">🍹 正在为「'+esc(s.style)+'」选饮品 · 已选 <strong style="color:var(--primary-accent);">'+chosen.length+'</strong> 件'+(chosen.length?'（'+esc(chosen.map(function(c){return c.name+'×'+(c.qty||1);}).join('、'))+'）':'')+'</span>'
  +'<button class="btn btn-sm" id="drinks-back-btn" style="background:var(--primary-accent);color:#fff;border:none;border-radius:20px;padding:4px 18px;font-size:0.85rem;letter-spacing:1px;">返回席面</button>';
 ds.insertBefore(ban,ds.firstChild);
 document.getElementById('drinks-back-btn').addEventListener('click',function(){showSection('table-result-section');});
}
function displayRecommendations(){
 // 推荐完成，记录推荐次数
 safeFetch('/api/recommendation-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userType:currentUser==='guest'?'guest':currentUser?'user':'guest',userId:currentUser||'guest'})}).catch(()=>{});
 // 缓存推荐结果到 localStorage（仅登录用户，键按用户隔离；游客不缓存）
 try { if(currentUser&&currentUser!=='guest'){localStorage.setItem('cachedRecommendations_'+currentUser, JSON.stringify(currentRecommendations)); localStorage.setItem('cachedRecMode_'+currentUser, currentRecommendationMode);} } catch(e) {}
 const $=id=>document.getElementById(id),loading=$('recommendation-loading'),result=$('recommendation-result');
 if(!loading||!result)return;
 const desc=currentRecommendationMode==='机器学习'?'(基于ML)':currentRecommendationMode==='决策树模型'?'(基于决策树)':'';
 const _rice=dishData.find(d=>d.name==='五常大米饭');
 result.innerHTML='<div style="background-color:#fdf2e9;border:2px solid #f5cba7;border-radius:8px;padding:15px;margin-bottom:20px;text-align:center"><p style="margin:0;color:#c0392b"><strong>当前使用：</strong>'+currentRecommendationMode+' '+desc+'</p></div><div class="mb-4"><h4 class="text-danger">为您推荐</h4><div class="list-group" id="dish-list"></div></div><div class="mt-3 p-3 rounded-3" style="background:linear-gradient(135deg,#fdf6f0,#f5ebe0);border:1px solid rgba(201,169,110,0.2);"><div class="row g-2 align-items-center"><div class="col-md-6"><div class="d-flex align-items-center justify-content-between"><div><span style="font-size:1.5rem;">🍚</span> <strong>五常大米饭</strong> <small style="color:var(--text-light);">3元/碗</small></div><button class="btn btn-sm btn-outline-success add-to-cart-btn" id="add-rice-btn" data-id="'+(_rice?_rice.id:'')+'"><i class="bi bi-plus-circle me-1"></i>加一碗米饭</button></div></div><div class="col-md-6"><div class="d-flex align-items-center justify-content-between"><div><span style="font-size:1.5rem;">🍹</span> <strong>饮料酒水</strong> <small style="color:var(--text-light);">搭配更尽兴</small></div><button class="btn btn-sm btn-outline-primary" id="goto-drinks-btn"><i class="bi bi-cup-straw me-1"></i>去选饮品</button></div></div></div></div></div><div class="mt-5"><h4 class="text-danger">操作</h4><div class="row g-3 mt-3"><div class="col-md-4"><button class="btn btn-outline-primary w-100 py-2" id="refresh-recommendations"><i class="bi bi-arrow-repeat me-2"></i>换一批</button></div><div class="col-md-4"><button class="btn btn-outline-success w-100 py-2" id="end-recommendation"><i class="bi bi-check-circle me-2"></i>选好了</button></div><div class="col-md-4"><button class="btn btn-outline-danger w-100 py-2" id="end-logout-btn"><i class="bi bi-box-arrow-right me-2"></i>退出</button></div></div></div>';
 const old=result._delegateHandler;if(old)result.removeEventListener('click',old);
 const handler=e=>{const t=e.target.closest('button');if(!t)return;({'refresh-recommendations':()=>fetchRecommendations(true),'end-recommendation':()=>endRecommendation(),'end-logout-btn':()=>{resetRecommendation();showSection('home-section');},'goto-drinks-btn':()=>gotoDrinksCategory()})[t.id]?.();};
 result.addEventListener('click',handler);result._delegateHandler=handler;
 const cart=getCart();
 let fav=[],blk=[];if(currentUser&&currentUser!=='guest'){const u=getUserData(currentUser);if(u){fav=u.favorites||[];blk=u.blacklist||[];}}
 let ordered=[];try{ordered=JSON.parse(localStorage.getItem('orderedDishes')||'[]')}catch(e){};
 const dl=$('dish-list');if(!dl){console.warn('dish-list 元素未找到');loading.classList.add('d-none');return;}dl.innerHTML='';
 currentRecommendations.forEach((d,i)=>{
  const isFav=fav.includes(d.id),isBlk=blk.includes(d.id),isOrdered=ordered.includes(d.id);
  const tags=d.tags?d.tags.filter(t=>t!=='招牌'&&t!=='中辣'&&t!=='重辣'&&t!=='微辣'&&t!=='清爽'&&t!=='夏季限定').join(' '):'';
  const tagBadges=d.tags&&d.tags.includes('招牌')?'<span class="badge bg-warning me-1">⭐招牌</span>':'';
  const orderedBadge='';
  const blindBoxClass=d.type==='盲盒尝鲜'?'blind-box-card':'';
  const defaultImg='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23fdf6f0%22/%3E%3Ctext x=%2250%22 y=%2260%22 text-anchor=%22middle%22 font-size=%2236%22%3E🍜%3C/text%3E%3C/svg%3E';
  const matchRatePct=isFinite(d.matchRate)?(d.matchRate*100).toFixed(1):'0';
 const img=(d.image_url&&(d.image_url.startsWith('/')||d.image_url.startsWith('http'))?(function(){const src=esc(d.image_url);const thumb=d.image_url.startsWith('/uploads/')&&!d.image_url.includes('thumbs/')?('/uploads/thumbs/'+d.image_url.split('/').pop().replace(/\.[^.]+$/,'')+'.webp'):src;return '<img src="'+thumb+'" style="width:160px;height:160px;border-radius:12px;object-fit:cover;margin-left:12px;vertical-align:middle;" alt="'+esc(d.name)+'" loading="lazy" onerror="if(this.src.indexOf(\'/thumbs/\')>-1){this.src=\''+src+'\';}else{this.onerror=null;this.src=\''+defaultImg+'\';}">';})():(d.image_url?'<span class="dish-emoji" style="font-size:3.5rem;vertical-align:middle;margin-left:12px;">'+esc(d.image_url)+'</span>':''));
	 dl.innerHTML+='<div class="list-group-item '+blindBoxClass+'"><div class="dish-info"><div class="dish-details flex-grow-1"><h5>'+(i+1)+'. '+tagBadges+orderedBadge+(d.type==='盲盒尝鲜'?'<span class="badge bg-info me-1">盲盒</span>':'')+esc(dishNameOf(d))+img+'</h5>'+'<p class="mb-1">'+esc(catNameOf(d.category))+' · '+esc(d.spiciness)+' · '+esc(formatPrice(d))+(tags?' · '+esc(tags):'')+'</p><p class="dish-reason">'+esc(d.reason)+'</p>'+((d.type!=='盲盒尝鲜'||(d.type==='盲盒尝鲜'&&d.blindMode==='smart'))&&isFinite(d.matchIndex)?'<p class="text-muted small">匹配指数：'+d.matchIndex.toFixed(2)+'（口味'+(d.matchDetails?.taste||0)+'+招牌'+(d.matchDetails?.cuisine||0)+'+热量'+(d.matchDetails?.calorie||0)+'+价格'+(d.matchDetails?.price||0)+'+评分'+(d.matchDetails?.rating||0)+'）</p>':'<p class="text-muted small">匹配指数：— —</p>')+'<div class="dish-actions mt-2">'+renderRecipeCartBtn(d,cart)+'<button class="btn btn-sm '+(isFav?'btn-success':'btn-outline-success')+' me-2" onclick="addToFavorites('+d.id+')"'+(isFav?' disabled':'')+'><i class="bi bi-heart'+(isFav?'-fill':'')+'"></i> '+(isFav?'已收藏':'收藏')+'</button><button class="btn btn-sm '+(isBlk?'btn-dark':'btn-outline-dark')+'" onclick="addToBlacklist('+d.id+')"'+(isBlk?' disabled':'')+'><i class="bi bi-x-circle'+(isBlk?'-fill':'')+'"></i> '+(isBlk?'已拉黑':'拉黑')+'</button><button class="btn btn-sm btn-outline-warning ms-2" onclick="openStarFeedback(currentRecommendations['+i+'])" style="border-color:#f1c40f;color:#f39c12;"><i class="bi bi-star"></i> 评分</button></div></div><div class="dish-score text-center ms-3">'+(d.type==='盲盒尝鲜'&&d.blindMode==='random'?'<div class="badge badge-blind rounded-pill mb-2">🎁</div><div class="text-muted small" style="font-size:0.7rem;">试试手气</div>':'<div class="badge bg-danger rounded-pill mb-2">'+matchRatePct+'%</div><div class="text-muted small">匹配度</div>')+'</div></div></div>';
 });
 loading.classList.add('d-none');result.classList.remove('d-none');
}


// ═══════════════ 评分反馈 ═══════════════

// ═══════════════ 一席成宴（组合推荐，路线图 8.4） ═══════════════
var tableSets=[];          // 当前三套方案
var lastTableParams=null;  // 生成时的入参，换单道时复用
var tableDrinksMode=null;  // 一席成宴"去选饮品"模式：当前正在配饮品的席面下标
var lastTableMeta=null;    // 服务端返回的元信息（已点排除数/是否用了口味档案）
// 席面口径默认数量: "X个起"的按个卖菜至少给到用餐人数(4人桌核桃包×4而非起售的×3,不够分不如不排);
// 非起售菜与束缚型规格(4个/笼、3碗、6块——"份"不可拆)不按人数补齐,仍为 1 份
function tableDefaultQtyOf(dish){
 var min=minQtyOf(dish)||1;
 if(min<=1)return 1;
 var ps=(lastTableParams&&lastTableParams.partySize)||0;
 return Math.min(99,Math.max(min,ps));
}
function prefillTableBuilder(){
 // 登录用户从口味档案带出辣度/忌口
 var prefs=null;
 if(currentUser&&currentUser!=='guest'){var u=getUserData(currentUser);if(u&&u.preferences)prefs=u.preferences;}
 var spicy=$('table-spicy');
 if(spicy)spicy.value=(prefs&&['不辣','微辣','中辣','重辣'].includes(prefs.spiciness))?prefs.spiciness:'无';
 // 咸淡/甜酸/热量/饮食要求同样从档案带出（值不在选项里则保持默认）
 [['table-saltiness','saltiness'],['table-sweetness','sweetness'],['table-calorie','calorie'],['table-religion','religion']].forEach(function(pair){
  var el=$(pair[0]);if(!el||!prefs)return;
  for(var i=0;i<el.options.length;i++){if(el.options[i].value===prefs[pair[1]]){el.value=prefs[pair[1]];break;}}
 });
 var none=$('table-allergy-none');
 var boxes=document.querySelectorAll('input[name="table-allergy"]');
 var has=false;
 boxes.forEach(function(cb){cb.checked=!!(prefs&&Array.isArray(prefs.allergies)&&prefs.allergies.includes(cb.value));if(cb.checked)has=true;});
 if(none){
  none.checked=!has;
  boxes.forEach(function(cb){cb.disabled=none.checked;});
 }
 // 近期避开（会所版防重复）仅登录用户可见
 var wrap=$('table-avoid-recent-wrap');
 if(wrap)wrap.style.display=(currentUser&&currentUser!=='guest')?'':'none';
}
var tableSwappedOut=[];    // 本次生成内被换掉的菜：换出去就不再换回来
function collectTableExclusions(){
 // 换菜状态：本次换出去的不应再换回（与身份无关，始终排除）
 var ids=tableSwappedOut.slice();
 // 已点排除（本会话各轮+购物车）：仅登录用户提供——游客无身份，不做已点排除（换桌/新客不继承他人记录）
 if(currentUser&&currentUser!=='guest'){
  try{ JSON.parse(sessionStorage.getItem('lastOrderRounds')||'[]').forEach(function(r){(r.items||[]).forEach(function(it){if(it&&it.id)ids.push(it.id);});}); }catch(e){}
  getCart().forEach(function(c){ids.push(c.id);});
 }
 return ids;
}
function collectTableParams(){
 var ps=parseInt($('table-party-size')?$('table-party-size').value:'4',10);
 var budget=parseFloat($('table-budget')?$('table-budget').value:'80');
 var allergies=[];
 document.querySelectorAll('input[name="table-allergy"]:checked').forEach(function(cb){allergies.push(cb.value);});
 var params={partySize:ps,budgetPerPerson:isNaN(budget)?80:budget,
  spiciness:$('table-spicy')?$('table-spicy').value:'无',
  saltiness:$('table-saltiness')?$('table-saltiness').value:'无',
  sweetness:$('table-sweetness')?$('table-sweetness').value:'无',
  calorie:$('table-calorie')?$('table-calorie').value:'无',
  religion:$('table-religion')?$('table-religion').value:'无特殊要求',
  allergies:allergies};
 var lt=ssGet('lockedTable');
 if(lt)params.tableNumber=lt;
 var excl=collectTableExclusions();
 if(excl.length)params.excludeIds=excl;
 var avoid=$('table-avoid-recent');
 if(avoid&&avoid.checked&&currentUser&&currentUser!=='guest')params.avoidRecentDays=7;
 return params;
}
async function submitTableBuilder(){
 if(!currentUser)currentUser='guest';
 var params=collectTableParams();
 lastTableParams=params;
 var form=$('table-builder-form'),loading=$('table-builder-loading'),btn=$('table-generate-btn');
 if(form)form.style.display='none';
 if(loading)loading.style.display='block';
 if(btn)btn.disabled=true;
 try{
  var r=await safeFetch('/api/recommend/table',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify(params)});
  var d=await r.json();
   if(d.success&&Array.isArray(d.sets)&&d.sets.length){
   tableSets=d.sets;
   tableDrinksMode=null;
   // 起售+人数归一化: X个起 的按个卖菜按 max(起售量,人数) 计入席面总价(4人桌核桃包×4), 行上标 ×数量;
   // 束缚型规格(笼/碗/块)仍按 1 份, 与纸质菜单/加购口径一致
   var ps=(lastTableParams&&lastTableParams.partySize)||1;
   tableSets.forEach(function(s){
    var adjusted=[];
    s.totalPrice=0;
    s.dishes.forEach(function(d){
     var min=minQtyOf(d);
     if(min>1){d._qty=tableDefaultQtyOf(d);adjusted.push(d.name+'×'+d._qty);}
     s.totalPrice=Math.round(((s.totalPrice||0)+d.price*(d._qty||1))*100)/100;
    });
    (s.autoItems||[]).forEach(function(d){s.totalPrice=Math.round(((s.totalPrice||0)+d.price*d.qty)*100)/100;});
    s.perPerson=ps?Math.round(s.totalPrice/ps*100)/100:s.totalPrice;
    s._adjusted=adjusted;
   });
   tableSwappedOut=[];
   lastTableMeta={excludedOrdered:d.excludedOrdered||0,usedProfile:!!d.usedProfile};
   renderTableSets();
   showSection('table-result-section');
  }else{
   showMessage('生成失败',esc(d.error||'请稍后再试'));
  }
 }catch(e){
  showMessage('网络错误','生成一桌菜失败，请检查网络后重试');
 }finally{
  if(form)form.style.display='';
  if(loading)loading.style.display='none';
  if(btn)btn.disabled=false;
 }
}
 function renderTableSets(){
 var box=$('table-result-container');if(!box)return;
 if(!tableSets.length){box.innerHTML='<p class="py-4 text-center" style="color:var(--text-light);letter-spacing:2px;">尚未设席，先去配置一下吧。</p>';return;}
 var notesHtml='';
 if(lastTableMeta){
  var notes=[];
  if(lastTableMeta.excludedOrdered>0)notes.push('已自动避开本桌已点/购物车中的 '+lastTableMeta.excludedOrdered+' 道菜');
  if(lastTableMeta.usedProfile)notes.push('已结合你的口味档案');
  if(notes.length)notesHtml='<div class="mb-2 text-center" style="font-size:0.82rem;color:var(--text-light);letter-spacing:1px;"><span class="tang-orn">◈</span>'+esc(notes.join(' · '))+'<span class="tang-orn">◈</span></div>';
 }
 var styleColors={'家常版':'var(--gold)','宴请版':'var(--primary-accent)','打卡版':'#8e44ad'};
 box.innerHTML=notesHtml+tableSets.map(function(s,si){
  var color=styleColors[s.style]||'var(--gold)';
  var rows=s.dishes.map(function(d){
   var q=d._qty||1;
   var stepper='<div class="d-flex align-items-center justify-content-end gap-1" style="width:96px;">'
    +'<button class="btn btn-sm table-qty-minus" data-set="'+si+'" data-id="'+d.id+'" title="减少" style="width:28px;height:28px;line-height:1;padding:0;border-radius:50%;background:transparent;border:1px solid var(--gold);color:var(--gold);font-size:0.95rem;'+(q<=1?'opacity:0.35;':'')+'">−</button>'
    +'<span style="min-width:34px;text-align:center;font-size:0.95rem;font-weight:600;">'+q+'</span>'
    +'<button class="btn btn-sm table-qty-plus" data-set="'+si+'" data-id="'+d.id+'" title="增加" style="width:28px;height:28px;line-height:1;padding:0;border-radius:50%;background:var(--gold);border:none;color:#fff;font-size:0.95rem;">＋</button>'
    +'</div>';
   return '<div class="d-flex align-items-center gap-2 py-2" style="border-bottom:1px solid rgba(201,169,110,0.14);">'
    +dishImg(d.image_url,52,d.name)
    +'<div class="flex-grow-1" style="min-width:0;">'
     +'<div class="dish-name-serif">'+esc(dishNameOf(d))+'<span class="ms-2" style="font-size:0.73rem;color:var(--text-light);">'+esc(catNameOf(d.category))+' · '+esc(d.spiciness)+(d.serving?' · '+esc(d.serving):'')+'</span></div>'
     +'<div style="font-size:0.78rem;color:var(--text-light);letter-spacing:0.3px;">'+esc(d.reason)+'</div>'
    +'</div>'
    +'<div class="text-nowrap dish-name-serif" style="font-size:0.95rem;color:var(--primary-accent);">'+esc(formatPrice(d))+'</div>'
    +stepper
    +'<button class="btn btn-sm table-swap-btn" data-set="'+si+'" data-id="'+d.id+'" data-pool="'+esc(d.pool)+'" title="换一道" style="background:transparent;border:1px solid var(--gold);color:var(--gold);border-radius:14px;padding:2px 10px;font-size:0.78rem;white-space:nowrap;"><i class="bi bi-arrow-repeat"></i> 换</button>'
    +'<button class="btn btn-sm table-addone-btn" data-set="'+si+'" data-id="'+d.id+'" title="单点加购" style="background:transparent;border:1px solid rgba(201,169,110,0.5);color:var(--text);border-radius:14px;padding:2px 10px;font-size:0.78rem;white-space:nowrap;"><i class="bi bi-plus-lg"></i> 加</button>'
   +'</div>';
  }).join('');
  var overTag=s.overBudget?'<span class="badge rounded-pill ms-1" style="background:rgba(192,57,43,0.12);color:var(--primary-accent);font-size:0.7rem;">略超预算</span>':'';
  var autoRows=(s.autoItems||[]).map(function(d){
   return '<div class="d-flex align-items-center gap-2 py-2" style="border-bottom:1px solid rgba(201,169,110,0.14);">'
    +dishImg(d.image_url,52,d.name)
    +'<div class="flex-grow-1" style="min-width:0;">'
     +'<div class="dish-name-serif">'+esc(dishNameOf(d))+'<span class="ms-2" style="font-size:0.72rem;color:var(--gold);border:1px solid rgba(201,169,110,0.5);border-radius:10px;padding:1px 8px;">默认按人数 · 可自由加减</span></div>'
     +'<div style="font-size:0.78rem;color:var(--text-light);letter-spacing:0.3px;">'+(d.qty===0?'本套不加米饭':'配饭不参与推荐，已计入总价')+'，加购后仍可在购物车增减</div>'
    +'</div>'
    +'<div class="text-nowrap dish-name-serif" style="font-size:0.95rem;color:var(--primary-accent);">'+esc(formatPrice(d))+'×'+d.qty+'</div>'
    +'<div class="d-flex align-items-center justify-content-end gap-1" style="width:126px;">'
     +'<button class="btn btn-sm table-rice-minus" data-set="'+si+'"'+(d.qty<=0?' disabled':'')+' style="width:30px;height:30px;line-height:1;padding:0;border-radius:50%;background:transparent;border:1px solid var(--gold);color:var(--gold);font-size:1rem;">−</button>'
     +'<span style="min-width:26px;text-align:center;font-size:0.95rem;">'+d.qty+'</span>'
     +'<button class="btn btn-sm table-rice-plus" data-set="'+si+'" style="width:30px;height:30px;line-height:1;padding:0;border-radius:50%;background:linear-gradient(135deg,var(--primary-accent),var(--primary-dark));border:none;color:#fff;font-size:1rem;">＋</button>'
    +'</div>'
   +'</div>';
  }).join('');
  // 已选饮品行（"去选饮品"入口加入的，数量以购物车实时为准，含在席面总计中，可在席面上步进调整）
  var drinkRows=(s.chosenDrinkIds||[]).map(function(id){
   var c=getCart().find(function(x){return x.id===id;});
   if(!c)return '';
   var q=c.qty||1;
   var _cd=null;for(var _ci=0;_ci<dishData.length;_ci++){if(dishData[_ci].id===c.id){_cd=dishData[_ci];break;}}
   var _cn=_cd?dishNameOf(_cd):c.name;
   return '<div class="d-flex align-items-center gap-2 py-2" style="border-bottom:1px solid rgba(201,169,110,0.14);">'
    +dishImg(c.image,52,c.name)
    +'<div class="flex-grow-1" style="min-width:0;">'
     +'<div class="dish-name-serif">🍹 '+esc(_cn)+'<span class="ms-2" style="font-size:0.73rem;color:var(--text-light);">已选饮品</span></div>'
    +'</div>'
    +'<div class="text-nowrap dish-name-serif" style="font-size:0.95rem;color:var(--primary-accent);">'+esc(formatPrice(c.price))+'</div>'
    +'<div class="d-flex align-items-center justify-content-end gap-1" style="width:96px;">'
     +'<button class="btn btn-sm table-drink-minus" data-id="'+c.id+'" title="减少" style="width:28px;height:28px;line-height:1;padding:0;border-radius:50%;background:transparent;border:1px solid var(--gold);color:var(--gold);font-size:0.95rem;">−</button>'
     +'<span style="min-width:34px;text-align:center;font-size:0.95rem;font-weight:600;">'+q+'</span>'
     +'<button class="btn btn-sm table-drink-plus" data-id="'+c.id+'" title="增加" style="width:28px;height:28px;line-height:1;padding:0;border-radius:50%;background:var(--gold);border:none;color:#fff;font-size:0.95rem;">＋</button>'
    +'</div>'
   +'</div>';
  }).join('');
  return '<div class="card mb-4 shadow-sm table-set-card" style="border:1px solid rgba(201,169,110,0.35);background:var(--cream);">'
   +'<div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2" style="border:none;">'
    +'<div class="d-flex align-items-center flex-wrap gap-2">'
     +'<span class="badge tang-tag" style="background:'+color+';font-size:0.85rem;">'+esc(s.style)+'</span>'+overTag
     +'<span style="font-size:0.85rem;letter-spacing:0.5px;">共 '+s.dishes.length+' 道 · 席面总计 <strong class="table-total">'+esc(formatPrice(s.totalPrice))+'</strong> · 人均 '+esc(formatPrice(s.perPerson))+'</span></div>'
    +'<div class="d-flex gap-2">'
     +'<button class="btn btn-sm table-drinks-btn" data-set="'+si+'" title="跳转到饮料酒水分类" style="background:transparent;border:1px solid var(--gold);color:var(--gold);border-radius:20px;padding:4px 14px;font-size:0.82rem;letter-spacing:2px;"><i class="bi bi-cup-straw me-1"></i>去选饮品</button>'
     +'<button class="btn btn-sm table-share-btn" data-set="'+si+'" title="生成分享图" style="background:transparent;border:1px solid var(--gold);color:var(--gold);border-radius:20px;padding:4px 14px;font-size:0.82rem;letter-spacing:2px;"><i class="bi bi-image me-1"></i>分享图</button>'
     +'<button class="btn btn-sm table-addall-btn" data-set="'+si+'" style="background:linear-gradient(135deg,var(--primary-accent),var(--primary-dark));color:#fff;border:1px solid rgba(201,169,110,0.55);border-radius:20px;padding:4px 18px;font-size:0.85rem;letter-spacing:2px;font-family:\'Noto Serif SC\',serif;"><i class="bi bi-cart-plus me-1"></i>整体加购</button>'
    +'</div>'
   +'</div>'
   +'<div class="card-body py-2">'+rows+autoRows+drinkRows+'</div>'
   +'</div>';
 }).join('');
}
async function swapTableDish(si,dishId,pool,btn){
 var s=tableSets[si];if(!s)return;
 // 排除集=桌上现有菜+本会话已点/购物车（tableNumber 由 lastTableParams 带给服务端再查进行中订单）
 var excl=s.dishes.map(function(d){return d.id;}).concat(collectTableExclusions());
 var outDish=s.dishes.find(function(x){return x.id===dishId;});
 var params=Object.assign({},lastTableParams||collectTableParams(),{pool:pool,excludeIds:excl,outId:dishId,style:s.key,planTotal:s.totalPrice,outPrice:outDish?(outDish.price||0):0});
 var ps=(lastTableParams&&lastTableParams.partySize)||1;
 if(btn){btn.disabled=true;btn.innerHTML='<i class="bi bi-hourglass-split"></i>';}
 try{
  var r=await safeFetch('/api/recommend/table/swap',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify(params)});
  var d=await r.json();
  if(d.success&&d.dish){
   var idx=s.dishes.findIndex(function(x){return x.id===dishId;});
   if(idx>-1){
    var old=s.dishes[idx];
    tableSwappedOut.push(old.id);
    var newMin=tableDefaultQtyOf(d.dish);d.dish._qty=newMin;
    s.dishes[idx]=d.dish;
    var oldQty=old._qty||1;
    s.totalPrice=Math.round((s.totalPrice-(old.price||0)*oldQty+(d.dish.price||0)*newMin)*100)/100;
    s.perPerson=Math.round(s.totalPrice/ps*100)/100;
    s.overBudget=s.totalPrice>(lastTableParams?lastTableParams.budgetPerPerson*ps:s.totalPrice);
   }
   renderTableSets();
  }else{
   showMessage('换菜失败',esc(d.error||'请稍后再试'));
   if(btn){btn.disabled=false;btn.innerHTML='<i class="bi bi-arrow-repeat"></i> 换';}
  }
 }catch(e){
  showMessage('网络错误','换菜失败，请重试');
  if(btn){btn.disabled=false;btn.innerHTML='<i class="bi bi-arrow-repeat"></i> 换';}
 }
}
function setTableRiceQty(si,qty){
 // 米饭步进：人数只是默认值，加减自由；下限 0（不加），上限 30 仅防误触。
 // 总价/人均按 菜品合计+米饭 重算（换单道的价差已含在菜品价里），人均仍按人数均摊。
 var s=tableSets[si];if(!s||!s.autoItems||!s.autoItems.length)return;
 var rice=s.autoItems[0];
 var ps=(lastTableParams&&lastTableParams.partySize)||rice.qty;
 rice.qty=Math.max(0,Math.min(qty,30));
 var dishSum=s.dishes.reduce(function(sum,x){return sum+(x.price||0);},0);
 s.totalPrice=Math.round((dishSum+rice.price*rice.qty)*100)/100;
 s.perPerson=ps?Math.round(s.totalPrice/ps*100)/100:0;
 renderTableSets();
}
function addTableDishToCart(si,dishId){
 var s=tableSets[si];if(!s)return;
 var d=s.dishes.find(function(x){return x.id===dishId;});
 if(!d)return;
 // 按步进器调好的数量加购（未动过的起售菜默认 max(起售量,人数)，其余默认 1）
 var q=d._qty||minQtyOf(d)||1;
 addToCart({id:d.id,name:d.name,price:d.price,image_url:d.image_url,serving:d.serving},q);
}
function addTableSetToCart(si){
 var s=tableSets[si];if(!s||!s.dishes.length)return;
 // 直接写购物车避免 addToCart 逐菜弹 toast，整桌只提示一次；米饭等自动搭配项按份数一并进车
 // 起售数量：X个起 的菜品整桌加购按席面默认数量(max(起售量,人数))入车（如4人桌核桃包→×4），并在提示中说明
 // 已选饮品（chosenDrinkIds）已在购物车中，不重复加
 var cart=getCart();
 var adjusted=[];
 var chosen=(s.chosenDrinkIds||[]);
 s.dishes.forEach(function(d){
  var min=d._qty||minQtyOf(d);
  var i=cart.findIndex(function(x){return x.id===d.id;});
  if(i>=0)cart[i].qty=(cart[i].qty||1)+min;
  else{
   var q=Math.max(1,min);
   cart.push({id:d.id,name:d.name,price:d.price,qty:q,image:d.image_url||''});
   if(q>1)adjusted.push(d.name+'×'+q);
  }
 });
 (s.autoItems||[]).forEach(function(d){
  if(d.qty<=0)return;
  var i=cart.findIndex(function(x){return x.id===d.id;});
  if(i>=0)cart[i].qty=(cart[i].qty||1)+d.qty;
  else cart.push({id:d.id,name:d.name,price:d.price,qty:d.qty,image:d.image_url||''});
 });
 saveCart(cart);updateCartBadge();
 var riceQty=(s.autoItems&&s.autoItems[0]&&s.autoItems[0].qty)||0;
 var riceNote=riceQty>0?'（含米饭×'+riceQty+'）':'（未加米饭）';
 var drinkNote=chosen.length?'（含已选饮品×'+chosen.length+'）':'';
 var adjNote=adjusted.length?'；起售调整：'+adjusted.join('、'):'';
 showMessage('已加入购物车','「'+esc(s.style)+'」整桌 '+s.dishes.length+' 道菜'+riceNote+drinkNote+'已加购'+adjNote+'，可去购物车结算',null,4000);
}
// ═══════════════ 一桌菜分享图（canvas 手绘，固定浅色品牌配色，不受暗色模式影响） ═══════════════
function loadCanvasImg(src){
 return new Promise(function(res,rej){var im=new Image();im.onload=function(){res(im);};im.onerror=rej;im.src=src;});
}
// 按当前各菜数量重算席面总价与人均（步进器/换菜/起售调整后统一走这里）
function recalcTableSetTotals(s){
 var t=0;
 s.dishes.forEach(function(d){t+=d.price*(d._qty||1);});
 (s.autoItems||[]).forEach(function(d){if(d.qty>0)t+=d.price*d.qty;});
 // 已选饮品（从"去选饮品"入口加入，数量以购物车实时为准）
 (s.chosenDrinkIds||[]).forEach(function(id){var c=getCart().find(function(x){return x.id===id;});if(c)t+=c.price*(c.qty||1);});
 s.totalPrice=Math.round(t*100)/100;
 var ps=(lastTableParams&&lastTableParams.partySize)||1;
 s.perPerson=ps?Math.round(s.totalPrice/ps*100)/100:0;
}
// 席面菜品数量步进：−/＋ 调整某道菜数量（下限=最小起售量），实时重算席面总价
function changeTableDishQty(si,id,delta){
 var s=tableSets[si];if(!s)return;
 var d=s.dishes.find(function(x){return x.id===id;});if(!d)return;
 var min=Math.max(1,minQtyOf(d));
 var cur=d._qty||1;
 var nv=cur+delta;
 if(nv<min){showMessage('起售数量','「'+d.name+'」'+min+'个起售，数量不能低于 '+min);return;}
 if(nv>99){showMessage('提示','数量最多 99');return;}
 d._qty=nv;recalcTableSetTotals(s);renderTableSets();
}
// 席面已选饮品步进：−/＋ 改购物车实时数量（减到 0 整项取消，与购物车语义一致）
function changeTableDrinkQty(id,delta){
 var c=getCart().find(function(x){return x.id===id;});if(!c)return;
 var nq=(c.qty||1)+delta;
 if(nq<=0)removeFromCart(id);else updateCartQty(id,nq);
 recalcTableSetTotalsAll();renderTableSets();
}
// 三套席面全部重算（饮品数量改动会影响所属席面总价）
function recalcTableSetTotalsAll(){tableSets.forEach(recalcTableSetTotals);}
function canvasRoundRect(ctx,x,y,w,h,r){
 ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}
function canvasClipText(ctx,text,maxW){
 if(text===undefined||text===null)return'';text=String(text);
 if(ctx.measureText(text).width<=maxW)return text;
 while(text.length>1&&ctx.measureText(text+'…').width>maxW)text=text.slice(0,-1);
 return text+'…';
}
function canvasDishImg(ctx,img,x,y,d){
 ctx.save();ctx.beginPath();ctx.arc(x+d/2,y+d/2,d/2,0,Math.PI*2);ctx.clip();ctx.drawImage(img,x,y,d,d);ctx.restore();
 ctx.strokeStyle='#c9a96e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+d/2,y+d/2,d/2,0,Math.PI*2);ctx.stroke();
}
function shareTableSetImage(si,btn){
 var s=tableSets[si];if(!s||!s.dishes.length)return;
 if(btn)btn.disabled=true;
 var W=750,pad=44,rowH=100,headerH=170,totalsH=140,footerH=96;
 // 行列表 = 推荐菜 + 自动搭配（米饭按人数），分享图完整反映一桌
 var rows=s.dishes.map(function(d){return {name:d.name,sub:(d.category||'')+' · '+(d.spiciness||'')+'，'+(d.reason||''),price:d.price,img:d.image_url,__imgEl:null};})
  .concat((s.autoItems||[]).filter(function(d){return d.qty>0;}).map(function(d){return {name:d.name+' × '+d.qty,sub:'按人数自动配齐（配饭，已计入总价）',price:d.price*d.qty,img:d.image_url,__imgEl:null};}));
 var H=headerH+rows.length*rowH+totalsH+footerH;
 var c=document.createElement('canvas');c.width=W;c.height=H;
 var ctx=c.getContext('2d');
 var ps=(lastTableParams&&lastTableParams.partySize)||4;
 function draw(brandImg){
  // 底色与品牌头
  ctx.fillStyle='#fdf6f0';ctx.fillRect(0,0,W,H);
  var grad=ctx.createLinearGradient(0,0,W,120);
  grad.addColorStop(0,'#8f2a1e');grad.addColorStop(1,'#b83a2a');
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,120);
  ctx.fillStyle='#c9a96e';ctx.fillRect(0,120,W,4);
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#fff';ctx.font='bold 42px "Noto Serif SC",serif';
  ctx.fillText('唐猫庭院 · 一席成宴',W/2-30,48);
  ctx.fillStyle='#f3e3c3';ctx.font='22px "Noto Serif SC",serif';
  ctx.fillText('千年陕菜 · 唐风雅韵',W/2-30,90);
  if(brandImg)canvasDishImg(ctx,brandImg,W-72,32,80);
  // 套名行
  ctx.fillStyle='#8f2a1e';ctx.font='bold 34px "Noto Serif SC",serif';
  ctx.fillText('「'+s.style+'」席面 · '+ps+' 人 · 共 '+s.dishes.length+' 道',W/2,headerH-23);
  // 菜品行
  var textW=W-pad*2-84-90;
  rows.forEach(function(d,i){
   var ry=headerH+i*rowH;
   if(i%2===0){ctx.fillStyle='rgba(201,169,110,0.10)';ctx.fillRect(pad-16,ry,W-2*(pad-16),rowH);}
   var x=pad;
   if(d.__imgEl)canvasDishImg(ctx,d.__imgEl,x,ry+18,64);
   else if(d.img&&!/^(https?:|\/)/.test(d.img)){ctx.font='40px serif';ctx.textAlign='center';ctx.fillText(d.img,x+32,ry+50);ctx.textAlign='left';}
   ctx.textAlign='left';ctx.textBaseline='alphabetic';
   ctx.fillStyle='#3a2a20';ctx.font='bold 26px "Noto Serif SC",serif';
   ctx.fillText(canvasClipText(ctx,d.name,textW),x+84,ry+44);
   ctx.fillStyle='#8a7a6a';ctx.font='19px "Noto Serif SC",serif';
   ctx.fillText(canvasClipText(ctx,d.sub,textW),x+84,ry+76);
   ctx.textAlign='right';ctx.fillStyle='#b83a2a';ctx.font='bold 28px "Noto Serif SC",serif';ctx.textBaseline='middle';
   ctx.fillText('¥'+d.price,W-pad,ry+rowH/2);
   ctx.textAlign='left';ctx.textBaseline='alphabetic';
  });
  // 汇总卡
  var ty=headerH+rows.length*rowH+16;
  ctx.fillStyle='#fff';canvasRoundRect(ctx,pad-10,ty,W-2*(pad-10),totalsH-40,14);ctx.fill();
  ctx.strokeStyle='#c9a96e';ctx.lineWidth=1.5;ctx.stroke();
  ctx.textAlign='left';ctx.fillStyle='#3a2a20';ctx.font='bold 30px "Noto Serif SC",serif';
  ctx.fillText('席面总计',pad+22,ty+48);
  ctx.textAlign='right';ctx.fillStyle='#b83a2a';ctx.font='bold 36px "Noto Serif SC",serif';
  ctx.fillText('¥'+s.totalPrice,W-pad-22,ty+48);
  ctx.textAlign='left';ctx.fillStyle='#8a7a6a';ctx.font='22px "Noto Serif SC",serif';
  ctx.fillText('人均 ¥'+Math.round(s.perPerson)+(s.overBudget?' · 为保席面结构略超预算':''),pad+22,ty+84);
  // 页脚
  ctx.textAlign='center';ctx.fillStyle='#b83a2a';ctx.font='bold 22px "Noto Serif SC",serif';
  ctx.fillText('唐猫庭院 · 千年陕菜',W/2,H-56);
  ctx.fillStyle='#8a7a6a';ctx.font='17px serif';
  ctx.fillText(new Date().toLocaleDateString('zh-CN'),W/2,H-26);
 }
 // 预载图片：品牌猫图 + 同源菜品图（emoji/外链图直接跳过用文字兜底）
 var jobs=[];
 var brandJob=loadCanvasImg('/assets/brand/tangcat-official.png').catch(function(){return null;});
 rows.forEach(function(d){
  if(d.img&&d.img.indexOf('/')===0&&d.img.indexOf('//')!==0){
   jobs.push(loadCanvasImg(d.img).then(function(im){d.__imgEl=im;}).catch(function(){}));
  }
 });
 var timeout=new Promise(function(res){setTimeout(res,4000);});
 Promise.race([Promise.all(jobs).then(function(){return brandJob;}),timeout]).then(function(r){
  try{draw(r||null);var url=c.toDataURL('image/png');
   var a=document.createElement('a');a.href=url;a.download='唐猫庭院一席成宴-'+s.style+'.png';
   document.body.appendChild(a);a.click();a.remove();
   showMessage('分享图已生成','图片已开始下载，可以发给同桌的人',null,2500);
  }catch(e){showMessage('生成失败','分享图生成失败，请重试');}
  if(btn)btn.disabled=false;
 });
}


// ─── js/init.js ───
// 页面初始化模块
document.addEventListener('DOMContentLoaded',function(){
 if(_initialized)return;_initialized=true;
 // 从localStorage恢复登录状态
 const savedUser=localStorage.getItem('currentUser');
 if(savedUser&&getUserData(savedUser))currentUser=savedUser;
 showSection('home-section');
 // 恢复购物车徽标（刷新后保持显示）
 if(typeof updateCartBadge==='function')updateCartBadge();
 // 恢复语言按钮文字（中英切换记忆）
 (function(){const t=document.getElementById('lang-toggle-text');if(t&&typeof menuLang!=='undefined')t.textContent=menuLang==='en'?'中':'EN';})();
 // 暗黑模式：检测系统偏好 + 用户手动切换
 const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches;
 const savedDark=localStorage.getItem('darkMode');
 // 优先级：localStorage保存的偏好 > 系统偏好
 const shouldBeDark=savedDark!==null?savedDark==='true':prefersDark;
 if(shouldBeDark){document.documentElement.classList.add('dark-mode');const tb=document.getElementById('dark-mode-toggle');if(tb){const ic=tb.querySelector('i');if(ic)ic.className='bi bi-sun';}}
	 // 从API加载菜品数据（弱网兜底：先用本地缓存立即渲染菜单，成功后覆盖并更新缓存——断网/慢网下菜单仍可浏览）
	 let hasCache=false;
	 try{
	  const cached=localStorage.getItem('dishDataCache');
	  if(cached){const arr=JSON.parse(cached);if(Array.isArray(arr)&&arr.length){dishData=filterVisibleDishes(arr);hasCache=true;renderMenuTable();}}
	 }catch(e){}
	 Promise.race([safeFetch('/api/dishes'),new Promise((_,r)=>setTimeout(()=>r(new Error('超时')),10000))]).then(r=>r.json()).then(d=>{
	  if(d.success&&d.dishes.length){
	    // 顾客端只显示上架菜(is_active !== false)；下架菜不进菜单/推荐池/购物车
	    dishData=filterVisibleDishes(d.dishes);
	    try{localStorage.setItem('dishDataCache',JSON.stringify(dishData));}catch(e){}
	    renderMenuTable(); // 数据就绪后立即渲染，避免竞态空表格
	  }
	}).catch((e)=>{console.warn('菜品数据加载超时/失败',e);
	 if(hasCache){console.warn('使用本地缓存菜单（弱网模式）');return;}
	 const tb=document.getElementById('dataset-table-body');if(tb)tb.innerHTML='<tr><td colspan="8" style="text-align:center;padding:24px;color:#c0392b;">菜品数据加载失败，<a href="#" id="retry-load-dishes" style="color:#27ae60;font-weight:600;">点击重试</a></td></tr>';const rb=document.getElementById('retry-load-dishes');if(rb)rb.addEventListener('click',function(ev){ev.preventDefault();location.reload();});});
 setTimeout(()=>checkApiAvailability().then(a=>{if(a)console.log('API可用,ML模型已就绪');else console.log('ML模型启动中,暂用本地推荐(稍后自动恢复)')}),100);
 const $=id=>document.getElementById(id);
 const click=(id,fn)=>{const el=$(id);if(el)el.addEventListener('click',fn);};
 const submit=(id,fn)=>{const el=$(id);if(el)el.addEventListener('submit',e=>{e.preventDefault();fn();});};
 // 桌号同步: 偏好页输入实时存localStorage
 const prefTable=$('pref-table-number');
 if(prefTable){const saved=ssGet('tableNumber');if(saved)prefTable.value=saved;prefTable.addEventListener('input',()=>syncTableNumber(prefTable));}
 // 购物车桌号自动填
 const cartTable=$('cart-table-number');
 if(cartTable){const saved=ssGet('tableNumber');if(saved)cartTable.value=saved;cartTable.addEventListener('input',()=>syncTableNumber(cartTable));}
 // 分类Tab切换
 // 分类快捷按钮（事件委托：按钮由 buildCategoryUI 动态生成）
 (function(){
  const wrap=document.getElementById('category-tabs');
  if(!wrap)return;
  wrap.addEventListener('click',e=>{
   const tab=e.target.closest('.cat-tab');if(!tab)return;
   wrap.querySelectorAll('.cat-tab').forEach(t=>{
    const on=t===tab;
    t.classList.toggle('active',on);
    t.style.background=on?'var(--primary)':'transparent';
    t.style.color=on?'#fff':'var(--text)';
    t.style.border=on?'none':'1px solid var(--gold-light)';
   });
   const catSel=document.getElementById('menu-filter-cat');
   if(catSel){catSel.value=tab.dataset.cat||'';catSel.dispatchEvent(new Event('change'));}
  });
 })();
 // 全部菜单页滚动时保存位置
 window.addEventListener('scroll',()=>{if(document.getElementById('dataset-section')?.classList.contains('active'))sessionStorage.setItem('datasetScrollY',window.scrollY);});

// ═══════════════ 页面切换与弹窗 ═══════════════
 click('nav-home',e=>{e.preventDefault();showSection('home-section');});
 click('nav-about',e=>{e.preventDefault();showSection('about-section');});
 click('nav-dataset',e=>{e.preventDefault();showDataset();});
 click('nav-privacy',e=>{e.preventDefault();showSection('privacy-section');});
 // 搜索和筛选事件绑定
 ['menu-search','menu-filter-cat','menu-filter-spice','menu-filter-price','menu-sort'].forEach(id=>{
  const el=document.getElementById(id);if(!el)return;
  el.addEventListener('change',renderMenuTable);
  if(id==='menu-search')el.addEventListener('input',renderMenuTable);
 });
 const resetBtn=document.getElementById('menu-reset-filter');
 if(resetBtn)resetBtn.addEventListener('click',function(){
  // 重置所有筛选条件
  const ids=['menu-search','menu-filter-cat','menu-filter-spice','menu-filter-price','menu-sort'];
  ids.forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  // 如果菜品数据为空，重新加载
  if(!dishData||!dishData.length){
   safeFetch('/api/dishes').then(r=>r.json()).then(d=>{if(d.success&&d.dishes.length){dishData=filterVisibleDishes(d.dishes);renderMenuTable();showMessage('提示','筛选条件已重置');}}).catch(()=>showMessage('提示','数据加载失败，请刷新页面'));
   return;
  }
  renderMenuTable();
  showMessage('提示','筛选条件已重置');
 });
 click('nav-user',e=>{e.preventDefault();showSection('login-section');});
 click('nav-profile',e=>{e.preventDefault();showProfile();});
 click('login-btn',()=>showSection('login-section'));
 click('register-btn',()=>showSection('register-section'));
 click('guest-btn',()=>{if(!currentUser)currentUser='guest';if(!ssGet('lockedTable')){openTablePicker('menu');return;}showDataset();});
 click('ai-recommend-btn',()=>{if(!currentUser)currentUser='guest';if(!ssGet('lockedTable')){openTablePicker('ai');return;}
  // B7 冷启动：从未声明偏好的顾客直达本店热门，结果页横幅引导补全
  const prefs=currentUser!=='guest'?(getUserData(currentUser)||{}).preferences:null;
  const filled=(prefs&&Object.keys(prefs).length>0)||sessionStorage.getItem('tasteFilled')==='1';
  if(filled)showSection('preference-section');else coldStartHotRecommend();
 });
 click('ai-table-btn',()=>{if(!currentUser)currentUser='guest';if(!ssGet('lockedTable')){openTablePicker('table');return;}prefillTableBuilder();showSection('table-builder-section');});
 submit('table-builder-form',submitTableBuilder);
 click('table-builder-back-btn',()=>showSection('home-section'));
 click('table-restart-btn',()=>{prefillTableBuilder();showSection('table-builder-section');});
 click('table-result-home-btn',()=>showSection('home-section'));
 // 一桌菜结果页按钮（事件委托，卡片由 renderTableSets 动态生成）
 document.addEventListener('click',function(e){
  const swap=e.target.closest('.table-swap-btn');
  if(swap){swapTableDish(parseInt(swap.dataset.set),parseInt(swap.dataset.id),swap.dataset.pool,swap);return;}
  const addone=e.target.closest('.table-addone-btn');
  if(addone){addTableDishToCart(parseInt(addone.dataset.set),parseInt(addone.dataset.id));return;}
  const addall=e.target.closest('.table-addall-btn');
  if(addall){addTableSetToCart(parseInt(addall.dataset.set));return;}
  const riceMinus=e.target.closest('.table-rice-minus');
  if(riceMinus){const si=parseInt(riceMinus.dataset.set);const it=tableSets[si]&&tableSets[si].autoItems&&tableSets[si].autoItems[0];if(it)setTableRiceQty(si,it.qty-1);return;}
  const ricePlus=e.target.closest('.table-rice-plus');
  if(ricePlus){const si=parseInt(ricePlus.dataset.set);const it=tableSets[si]&&tableSets[si].autoItems&&tableSets[si].autoItems[0];if(it)setTableRiceQty(si,it.qty+1);return;}
  // 席面菜品数量步进器：− 不低于最小起售量，＋ 自由加，总价/人均实时重算
  const qMinus=e.target.closest('.table-qty-minus');
  if(qMinus){changeTableDishQty(parseInt(qMinus.dataset.set),parseInt(qMinus.dataset.id),-1);return;}
  const qPlus=e.target.closest('.table-qty-plus');
  if(qPlus){changeTableDishQty(parseInt(qPlus.dataset.set),parseInt(qPlus.dataset.id),1);return;}
  // 席面已选饮品步进：改购物车实时数量（减到 0 整项取消）
  const dMinus=e.target.closest('.table-drink-minus');
  if(dMinus){changeTableDrinkQty(parseInt(dMinus.dataset.id),-1);return;}
  const dPlus=e.target.closest('.table-drink-plus');
  if(dPlus){changeTableDrinkQty(parseInt(dPlus.dataset.id),1);return;}
  const share=e.target.closest('.table-share-btn');
  if(share){shareTableSetImage(parseInt(share.dataset.set),share);return;}
  const drinks=e.target.closest('.table-drinks-btn');
  if(drinks){gotoDrinksCategory(parseInt(drinks.dataset.set));return;}
 });
 const tanone=$('table-allergy-none'),taboxes=document.querySelectorAll('input[name="table-allergy"]');
 if(tanone){tanone.addEventListener('change',function(){taboxes.forEach(cb=>{cb.checked=false;cb.disabled=this.checked;});if(!this.checked)taboxes.forEach(cb=>cb.disabled=false);});taboxes.forEach(cb=>cb.addEventListener('change',function(){if(this.checked){tanone.checked=false;tanone.disabled=false;}}));}
 click('continue-btn',()=>{if(currentUser&&currentUser!=='guest'){const u=getUserData(currentUser);if(u&&u.preferences)loadUserPreferences(u.preferences);}showSection('preference-section');});
 click('back-to-home',()=>showSection('home-section'));
 click('back-to-home-from-register',()=>showSection('home-section'));
 click('back-from-about',()=>showSection('home-section'));
 click('back-from-dataset',()=>showSection('home-section'));
click('back-from-privacy',()=>showSection('home-section'));
click('privacy-link',e=>{e.preventDefault();showSection('privacy-section');});
 submit('login-form',login);submit('register-form',register);
 const an=$('allergy-none'),ac=document.querySelectorAll('input[name="allergy"]');
 if(an){an.addEventListener('change',function(){ac.forEach(cb=>{cb.checked=false;cb.disabled=this.checked;});if(!this.checked)ac.forEach(cb=>cb.disabled=false);});ac.forEach(cb=>cb.addEventListener('change',function(){if(this.checked){an.checked=false;an.disabled=false;}}));
 // 初始化时同步禁用状态（allergy-none 默认 checked 时应禁用其他选项）
 if(an.checked){ac.forEach(cb=>{cb.disabled=true;});}
 }
 submit('preference-form',submitPreference);
 // 2026-09-17: 过敏源联动——勾「无」清空并禁用其他;勾任一具体项自动取消「无」(互斥多选)
 (function(){const an=$('allergy-none');if(!an)return;const others=['allergy-seafood','allergy-peanut','allergy-egg','allergy-soy','allergy-gluten'];const sync=()=>{const off=an.checked;others.forEach(id=>{const el=$(id);if(el){el.disabled=off;if(off)el.checked=false;}});};an.addEventListener('change',sync);others.forEach(id=>{const el=$(id);if(el)el.addEventListener('change',()=>{if(el.checked&&an.checked){an.checked=false;sync();}});});sync();})();
 // 2026-09-17: 偏好完整度仪表盘——5 维 select 变化时实时重算
 (function(){['spiciness','saltiness','sweetness','price','calorie'].forEach(id=>{const el=$(id);if(el)el.addEventListener('change',()=>{if(typeof renderPrefCompleteness==='function')renderPrefCompleteness();});});})();
 click('view-profile-btn',showProfile);click('back-from-profile',()=>showSection('preference-section'));
 click('cancel-favorite-btn',cancelFavorite);click('cancel-blacklist-btn',cancelBlacklist);
 click('delete-account-btn',deleteAccount);click('profile-logout-btn',logout);click('back-to-preference',()=>showSection('preference-section'));
 // 模态框隐藏前移出焦点：焦点留在弹窗内时隐藏会触发 aria-hidden 无障碍警告(Blocked aria-hidden)
 // Bootstrap 5 的 hide.bs.modal 事件会冒泡,document 级监听一次覆盖全站所有弹窗(提示框/选桌号/账单等)
 document.addEventListener('hide.bs.modal',e=>{
  const modal=e.target;
  if(modal&&modal.classList&&modal.classList.contains('modal')){
   const ae=document.activeElement;
   if(ae&&modal.contains(ae))ae.blur();
  }
 });
 // 注:#goto-drinks-btn 在 recommendation-result 内,由 displayRecommendations 事件委托处理(js/recommendation.js)
 click('logout-btn',logout);
 click('back-to-recommendations',()=>showSection(ratingReturnTo||'recommendation-section'));
 click('new-recommendation',()=>{resetRecommendation();['lastOrderId','lastOrderTable','lastOrderItems','lastOrderRounds','lockedTable','lastOrderAI','lastOrderStats','tableNumber','sideOrder','orderBackup'].forEach(k=>ssRemove(k));ssRemovePrefix('giftReceipt_');updateTableStatusCard();showSection('preference-section');});
 click('end-logout',()=>{resetRecommendation();['lastOrderId','lastOrderTable','lastOrderItems','lastOrderRounds','lockedTable','lastOrderAI','lastOrderStats','tableNumber','sideOrder','orderBackup'].forEach(k=>ssRemove(k));ssRemovePrefix('giftReceipt_');updateTableStatusCard();showSection('home-section');});
 // ─── 加菜面板（桌号锁定，全面板内操作，无原生弹窗依赖）───
 function showAddonView(v){
  ['main','move','other','pick'].forEach(x=>{
   const el=document.getElementById(x==='main'?'addon-main':'addon-view-'+x);
   if(el)el.style.display=(x===v)?(x==='main'?'':'block'):'none';
  });
  const pending=ssGet('sidePendingTable');
  const curTable=ssGet('lockedTable')||ssGet('lastOrderTable')||'-';
  const pt=document.getElementById('addon-pick-table');
  if(pt)pt.textContent=(v==='pick'&&pending)?pending:curTable;
  // 表头实时同步（给别桌切换/挪桌后返回主视图不再显示旧订单）
  const at=document.getElementById('addon-table');if(at)at.textContent=curTable;
  const ao=document.getElementById('addon-order');if(ao)ao.textContent='#'+(ssGet('lastOrderId')||'-');
 }
 // 给别桌：确认时只暂存待切桌号，等用户真正开始点菜（AI推荐/浏览菜单）才切换状态——返回即取消
 function applySideOrderSwitch(){
  const pending=ssGet('sidePendingTable');
  if(!pending)return;
  ssRemove('sidePendingTable');
  ['lastOrderId','lastOrderItems','lastOrderRounds','lastOrderAI','lastOrderStats'].forEach(k=>ssRemove(k));
  ssSet('lastOrderTable',pending);ssSet('lockedTable',pending);
 }
 function openAddonPanel(){
  const m=document.getElementById('addon-modal');if(!m)return;
  // 清理未完成的「给别桌」暂存（关弹窗后重开 = 取消该操作）
  if(ssGet('sidePendingTable')){ssRemove('sidePendingTable');if(ssGet('orderBackup')){ssRemove('orderBackup');ssRemove('sideOrder');}}
  const t=ssGet('lockedTable')||ssGet('lastOrderTable')||'-';
  const at=document.getElementById('addon-table');if(at)at.textContent=t;
  const ao=document.getElementById('addon-order');if(ao)ao.textContent='#'+(ssGet('lastOrderId')||'-');
  showAddonView('main');
  m.inert=false;m.removeAttribute('aria-hidden');
  bootstrap.Modal.getOrCreateInstance(m).show();
 }
 function closeAddonPanel(){
  const m=document.getElementById('addon-modal');if(!m)return;
  const inst=bootstrap.Modal.getInstance(m);
  if(inst){try{inst.hide();}catch(e){}}
  // 兜底：fade 过渡卡 _isTransitioning 时 hide 被静默忽略（同 message-modal 的坑）
  setTimeout(()=>{
   if(m.classList.contains('show')){
    const mm=bootstrap.Modal.getInstance(m);
    if(mm){mm._isTransitioning=false;try{mm.hide();}catch(e){}}
   }
  },400);
 }
 click('end-add-more',()=>openAddonPanel());
 // 本桌加菜 → 选菜方式（桌号已锁定）
 click('addon-do-add',()=>showAddonView('pick'));
 // 挪桌（面板内输入，无 prompt）
 // 挪桌 → 复用选桌器（有进行中订单自动改单，无订单只改锁定）
 click('addon-do-move',()=>{closeAddonPanel();openTablePicker();});
 // 给别桌加菜（面板内输入，无 prompt）→ 切换新桌新订单 → 选菜方式
 click('addon-do-other',()=>showAddonView('other'));
 click('addon-other-confirm',()=>{
  const inp=document.getElementById('addon-other-input');
  const to=normTableNo(inp?inp.value:'');
  if(!to){showMessage('提示','桌号格式不对（请输入 1-2 位数字）');return;}
  const cur=ssGet('lockedTable')||ssGet('lastOrderTable')||'';
  if(to===cur){showMessage('提示','这就是当前桌号——本桌加菜请选「本桌加菜」');return;}
  // 备份本桌订单状态（给别桌=临时离开，该桌订单提交后自动恢复本桌）
  if(ssGet('lastOrderId')){
   const backup={lastOrderId:ssGet('lastOrderId'),lastOrderTable:ssGet('lastOrderTable'),lastOrderItems:ssGet('lastOrderItems'),lastOrderRounds:ssGet('lastOrderRounds'),lastOrderAI:ssGet('lastOrderAI'),lastOrderStats:ssGet('lastOrderStats'),lockedTable:ssGet('lockedTable')};
   ssSet('orderBackup',JSON.stringify(backup));ssSet('sideOrder','1');
  }
  // 只暂存待切桌号，真正开始点菜（AI推荐/浏览菜单）时才切换——点「返回」= 取消给别桌
  ssSet('sidePendingTable',to);
  showAddonView('pick');
 });
 click('addon-ai',()=>{applySideOrderSwitch();closeAddonPanel();resetRecommendation();showSection('preference-section');});
 click('addon-menu',()=>{applySideOrderSwitch();closeAddonPanel();showDataset();});
 click('addon-back-1',()=>showAddonView('main'));
 click('addon-back-2',()=>showAddonView('main'));
 click('addon-back-3',()=>{
  // 从「给别桌」的选菜视图返回 = 取消给别桌，恢复本桌
  if(ssGet('sidePendingTable')){
   ssRemove('sidePendingTable');
   if(ssGet('orderBackup')){ssRemove('orderBackup');ssRemove('sideOrder');}
  }
  showAddonView('main');
 });
 // 「查看订单」：从 localStorage 重建点餐完成界面（跳走/刷新后随时可回）
 click('banner-view-order',()=>rebuildEndView());
 // rebuildEndView 已提升为顶层函数（checkoutCart 的别桌恢复也需调用）
 // 购物车事件绑定
 click('nav-cart',e=>{e.preventDefault();showCart();});
 click('cart-close-btn',()=>{
  const prev=window._prevSection||'home-section';
  // 在 showSection 之前保存滚动位置（showSection 会重置）
  const scrollY=window.scrollY;
  showSection(prev,true);
  // 全部菜单页: 恢复滚动位置 + 重新渲染卡片(清空后按钮回归"加入")
  if(prev==='dataset-section'){renderMenuTable();const sy=parseInt(sessionStorage.getItem('datasetScrollY')||'0');window.scrollTo(0,sy);}
  // 推荐页: 整体刷新加购按钮（与购物车同步，清空后恢复"加入"）
  if(prev==='recommendation-section'){
   const ids=[...document.querySelectorAll('#recommendation-result [data-recipe-cart]')].map(el=>parseInt(el.dataset.recipeCart));
   ids.forEach(id=>refreshRecipeCartBtn(id));
   const riceBtn=document.getElementById('add-rice-btn');
   if(riceBtn){const rc=getCart().find(c=>c.id===parseInt(riceBtn.dataset.id));if(!rc)riceBtn.innerHTML='<i class="bi bi-plus-circle me-1"></i>加一碗米饭';}
  }
 });
 click('cart-clear-btn',()=>{clearCart();showCart();});
 click('cart-checkout-btn',()=>{checkoutCart();});
 // 购物车数量修改事件委托
 document.addEventListener('click',function(e){
  const target=e.target.closest('.cart-qty-plus,.cart-qty-minus,.cart-remove-btn,.add-to-cart-btn');
  if(!target)return;
  const id=parseInt(target.dataset.id);
  if(target.classList.contains('add-to-cart-btn')){
   const dish=dishData.find(d=>d.id===id);
   if(dish){addToCart(dish,1);if(document.getElementById('dataset-section')?.classList.contains('active'))renderMenuTable();}else{showMessage('提示','菜品数据未加载');}
   if(target.closest('#recommendation-result'))refreshRecipeCartBtn(id);
   return;
  }
  if(target.classList.contains('cart-qty-plus')){const cart=getCart();const x=cart.find(c=>c.id===id);if(x)updateCartQty(id,(x.qty||1)+1);if(document.getElementById('dataset-section')?.classList.contains('active'))renderMenuTable();else if(document.getElementById('cart-section')?.classList.contains('active'))showCart();refreshRecipeCartBtn(id);}
  else if(target.classList.contains('cart-qty-minus')){const cart=getCart();const x=cart.find(c=>c.id===id);if(x){const nq=(x.qty||1)-1;const dish=dishData.find(d=>d.id===id);const min=minQtyOf(dish||{});if(nq>=min){updateCartQty(id,nq);}else{removeFromCart(id);showMessage('已移除','「'+(x.name||'菜品')+'」已从购物车移除',null,2000);}}if(document.getElementById('dataset-section')?.classList.contains('active'))renderMenuTable();else if(document.getElementById('cart-section')?.classList.contains('active'))showCart();refreshRecipeCartBtn(id);}
  else if(target.classList.contains('cart-remove-btn')){removeFromCart(id);showCart();}
 });
 // 购物车数量输入变更
 document.addEventListener('change',function(e){
  if(e.target.classList.contains('cart-note-input')){
   // 菜品要求备注：写进购物车条目，随订单到厨房
   const id=parseInt(e.target.dataset.id);const cart=getCart();
   const it=cart.find(c=>c.id===id);
   if(it){it.note=e.target.value.trim().slice(0,30);saveCart(cart);}
   return;
  }
  if(!e.target.classList.contains('cart-qty-input'))return;
  const id=parseInt(e.target.dataset.id);const val=parseInt(e.target.value);
  if(!isNaN(val)&&val>0)updateCartQty(id,val);else updateCartQty(id,1);
  showCart();
 });
 const me=$('message-modal'),cb=$('modal-close-btn'),cf=$('modal-confirm-btn');
 const closeModal=()=>{
  if(!me)return;
  const m=bootstrap.Modal.getInstance(me);
  if(m){try{m.hide();}catch(e){}}
  // 兜底：fade 过渡卡在 transitioning 态时 BS 会静默忽略 hide（fresh 首点必现）——400ms 后仍显示则强制解卡重试
  setTimeout(()=>{
   if(me.classList.contains('show')){
    const mm=bootstrap.Modal.getInstance(me);
    if(mm){mm._isTransitioning=false;try{mm.hide();}catch(e){}}
   }
  },400);
 };
 if(cb)cb.addEventListener('click',e=>{e.preventDefault();closeModal();});
 if(cf)cf.addEventListener('click',e=>{e.preventDefault();closeModal();});
 if(me)me.addEventListener('hidden.bs.modal',()=>{me.inert=true;me.setAttribute('aria-hidden','true');if(me.contains(document.activeElement))document.activeElement&&document.activeElement.blur();});
 // 星级评分（使用全局变量）
 const sc=document.getElementById('star-rating');
 if(sc){sc.addEventListener('click',function(e){const st=e.target.closest('.star');if(!st)return;starRatingValue=parseInt(st.dataset.value);document.querySelectorAll('.star').forEach((s,i)=>{s.textContent=i<starRatingValue?'★':'☆';s.style.color=i<starRatingValue?'#f1c40f':'#ddd';});document.getElementById('star-hint').textContent='您给了 '+starRatingValue+' 星';document.getElementById('star-submit-btn').disabled=false;});}
 const sb=document.getElementById('star-submit-btn');
 if(sb)sb.addEventListener('click',submitStarFeedback);
 // 完成页整体满意度
 const satEl=document.getElementById('end-satisfaction');
 if(satEl){
  let satVal=0;
  satEl.addEventListener('click',function(e){
   const st=e.target.closest('.sat-star');if(!st)return;
   satVal=parseInt(st.dataset.val);
   document.querySelectorAll('.sat-star').forEach((s,i)=>{
    s.style.opacity=i<satVal?'1':'0.4';
    s.style.transform=i<satVal?'scale(1.2)':'scale(1)';
    s.style.transition='all 0.2s';
   });
   document.getElementById('end-sat-hint').textContent=['','不满意','一般','满意','很满意','非常满意'][satVal];
   document.getElementById('end-sat-submit').disabled=false;
  });
  document.getElementById('end-sat-submit').addEventListener('click',function(){
   safeFetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({dishId:0,score:satVal,userPreferences:{},userId:currentUser||'guest',type:'overall_satisfaction'})}).catch(e=>console.warn('满意度评价提交失败:',e));
   this.textContent='已提交 ✓';this.disabled=true;this.style.background='#27ae60';
   document.getElementById('end-sat-hint').textContent='感谢您的评价！';
  });
 }
 // 页面加载时清理被刷新打断的「给别桌」中间态（暂存/备份跨刷新无意义）
 ['sidePendingTable','sideOrder','orderBackup'].forEach(k=>ssRemove(k));
 // 首页两个"上次"按钮的显隐（init/登录/退出统一走此函数，避免只在加载时判一次）
 function updateHomeButtons(){
  try{
   const savedPrefs=localStorage.getItem('savedPrefs');
   const cb2=document.getElementById('continue-btn');
   if(cb2){
    if(currentUser&&currentUser!=='guest'&&(savedPrefs||getUserData(currentUser)?.preferences?.spiciness))cb2.classList.remove('d-none');
    else cb2.classList.add('d-none');
   }
   const vcb=document.getElementById('view-cached-btn');
   if(vcb){
    if(currentUser&&currentUser!=='guest'){
     const cached=localStorage.getItem('cachedRecommendations_'+currentUser);
     const parsed=cached?JSON.parse(cached):null;
     if(Array.isArray(parsed)&&parsed.length>0)vcb.classList.remove('d-none');
     else vcb.classList.add('d-none');
    } else vcb.classList.add('d-none');
   }
  }catch(e){}
 }
 window.updateHomeButtons=updateHomeButtons;
 updateHomeButtons();
 // ─── 桌码：?t=<桌号>.<签名>（扫桌上的二维码）→ 显示「本桌账单」入口 + 预填桌号 ───
 (function initTableToken(){
  try{
   const sp=new URLSearchParams(__initialSearch);
   const t=sp.get('t')||'';
   if(!/^\d{1,4}\.[0-9a-f]{8,}$/i.test(t))return;
   ssSet('tableToken',t);
   const num=normTableNo(t.split('.')[0]);
   if(!num)return;
   ssSet('tableNumber',num); // 桌码即当前桌，同步到会话桌号
   ssSet('lockedTable',num);
   const btn=document.getElementById('table-bill-btn');
   if(btn){btn.classList.remove('d-none');const txt=document.getElementById('table-bill-btn-txt');if(txt)txt.textContent='本桌账单（'+num+'号桌）';}
  }catch(e){}
 })();
 click('table-bill-btn',showTableBill);
 // ─── 选桌交互 ───
 click('table-change-btn',()=>openTablePicker());
 click('table-input-confirm',()=>{
  const inp=document.getElementById('table-input');
  const n=normTableNo(inp?inp.value:'');
  if(!n){const h=document.getElementById('table-picker-hint');if(h){h.textContent='不符合桌号格式（请输入 1-2 位数字，如 1 或 01）';h.style.color='#e74c3c';}return;}
  applyTableChoice(n);
 });
 click('table-takeaway',()=>applyTableChoice('打包'));
 (function(){
  const ti=document.getElementById('table-input');
  if(ti)ti.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();document.getElementById('table-input-confirm').click();}});
  const ct=document.getElementById('cart-table-number');
  if(ct)ct.addEventListener('click',()=>openTablePicker());
  const ptb=document.getElementById('pref-table-number');
  if(ptb)ptb.addEventListener('click',()=>openTablePicker());
 })();
 updateTableStatusCard();
click('view-cached-btn', () => {
  // 游客不支持查看上次推荐
  if(!currentUser||currentUser==='guest'){showMessage('提示','登录后才能查看上次推荐');return;}
  try {
    const cached = localStorage.getItem('cachedRecommendations_'+currentUser);
    const mode = localStorage.getItem('cachedRecMode_'+currentUser) || '本地推荐';
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        currentRecommendations = parsed;
        currentRecommendationMode = mode;
        showSection('recommendation-section');
        displayRecommendations();
        return;
      }
    }
    showMessage('提示', '没有找到上次的推荐记录');
  } catch(e) { showMessage('提示', '读取推荐记录失败'); }
});
 // 初始化已点过列表
 if(!localStorage.getItem('orderedDishes'))localStorage.setItem('orderedDishes','[]');
 // 触控滑动支持（左滑拉黑，右滑收藏）
 let touchStartX=0,touchStartY=0,touchEl=null;
 // storage 事件派发到 window，挂在 document 上收不到——跨标签页购物车同步必须挂 window
 window.addEventListener('storage',function(e){
 if(e.key==='cart'){updateCartBadge();const cs=document.getElementById('cart-section');if(cs&&cs.classList.contains('active'))showCart();}
});
document.addEventListener('touchstart',function(e){
  const item=e.target.closest('.list-group-item');
  if(!item||!item.closest('#dish-list'))return;
  touchStartX=e.touches[0].clientX;
  touchStartY=e.touches[0].clientY;
  touchEl=item;
 },{passive:true});
 document.addEventListener('touchmove',function(e){
  if(!touchEl||!touchStartX)return;
  const dx=e.touches[0].clientX-touchStartX;
  const dy=e.touches[0].clientY-touchStartY;
  if(Math.abs(dx)>Math.abs(dy)*1.5){ // 水平滑动
   e.preventDefault();
   touchEl.style.transform='translateX('+dx+'px)';
   touchEl.style.transition='transform 0.05s';
   touchEl.style.opacity=1-Math.abs(dx)/300;
  }
 },{passive:false});
 document.addEventListener('touchend',function(e){
  if(!touchEl||!touchStartX)return;
  const dx=e.changedTouches[0].clientX-touchStartX;
  const threshold=80;
  if(dx<-threshold){
   // 左滑 - 拉黑
   const btn=touchEl.querySelector('button[onclick*="addToBlacklist"]');
   if(btn){const match=btn.getAttribute('onclick').match(/addToBlacklist\((\d+)\)/);if(match)addToBlacklist(parseInt(match[1]));}
  }else if(dx>threshold){
   // 右滑 - 收藏
   const btn=touchEl.querySelector('button[onclick*="addToFavorites"]');
   if(btn){const match=btn.getAttribute('onclick').match(/addToFavorites\((\d+)\)/);if(match)addToFavorites(parseInt(match[1]));}
  }
  touchEl.style.transform='';touchEl.style.opacity='';touchStartX=0;touchStartY=0;touchEl=null;
 },{passive:true});
 // 添加 touchcancel 处理，防止触摸中断时状态残留
 document.addEventListener('touchcancel',function(){
  if(touchEl){touchEl.style.transform='';touchEl.style.opacity='';}
  touchStartX=0;touchStartY=0;touchEl=null;
 },{passive:true});
// 浏览器前进/后退按钮导航
window.addEventListener('popstate', function(e) {
  const section = e.state && e.state.section ? e.state.section : 'home-section';
  const el = document.getElementById(section);
  if (el) showSection(section);
});
// 回到顶部按钮：滚动超过200px时显示
const backToTopBtn = document.getElementById('back-to-top');
if (backToTopBtn) {
  window.addEventListener('scroll', function() {
    backToTopBtn.classList.toggle('visible', window.scrollY > 200);
  }, { passive: true });
}
});

