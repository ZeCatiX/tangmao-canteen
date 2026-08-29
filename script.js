// ─── js/globals.js ───

// ═══════════════ 全局变量与工具函数 ═══════════════
// 唐猫庭院 - 菜品推荐系统 v2.0
var currentUser=null,userProfile=null,currentRecommendations=[],recommendedIds=[];
var currentRecommendationMode='本地计算'; var featureImportanceChart=null;
var decisionTreeModel=null,decisionTreeLoaded=false,decisionTreeLoading=false;
var apiAvailabilityCache=null,apiCacheTimestamp=0;
var dishData=[];  // 菜品数据，从API加载
var starRatingDish=null,starRatingValue=0,ratingReturnTo='recommendation-section';  // 全局评分状态
var _initialized=false;
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
function saveCart(c){try{localStorage.setItem('cart',JSON.stringify(c))}catch(e){}}
function addToCart(dish,qty){
 const cart=getCart();const i=cart.findIndex(x=>x.id===dish.id);
 const q=typeof qty==='number'&&qty>0?qty:1;
 if(i>=0){cart[i].qty=(cart[i].qty||1)+q}else{cart.push({id:dish.id,name:dish.name,price:dish.price,qty:q,image:dish.image_url||''})}
 saveCart(cart);updateCartBadge();showMessage('已加入购物车','「'+dish.name+'」已加入购物车',null,2500);
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
 if(i>=0){if(qty<=0)cart.splice(i,1);else cart[i].qty=qty;saveCart(cart);updateCartBadge();}
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
 if(c>0){bar.style.display='flex';document.getElementById('float-cart-count').textContent=c;document.getElementById('float-cart-total').textContent=getCartTotal();}
 else bar.style.display='none';
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
  const c=new AbortController(),t=setTimeout(()=>c.abort(),3000);
  fetch('/api/worker-health',{signal:c.signal,headers:{'Cache-Control':'no-cache'}})
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
function computeDishMatch(prefs,dish){
 const md={taste:0,cuisine:0,nutrition:0,rating:0};
 const keyMap={'辣度':'spiciness','咸淡':'saltiness','甜酸':'sweetness'};
 ['辣度','咸淡','甜酸'].forEach(k=>{if(prefs[k]!=='无'){if(dish[keyMap[k]]===prefs[k])md.taste+=1;}else md.taste+=1;});
 if(dish.tags&&dish.tags.includes('招牌'))md.cuisine+=1.5;
 md.nutrition+=2;
 const s=parseFloat(dish.rating);if(!isNaN(s))md.rating=Math.round((s/5)*2.5*10)/10;
 const total=md.taste+md.cuisine+md.nutrition+md.rating;
 return{matchDetails:md,totalMatch:Math.round(total*10)/10,matchRate:total/8.5};
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
  return{...d,reason:'🔮 盲盒推荐：纯随机惊喜，试试这个吧！',type:'盲盒尝鲜',matchIndex:0,matchRate:0.5};
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
   return{...d,reason:'🔮 盲盒推荐：试试这个吧，说不定有惊喜！',type:'盲盒尝鲜',matchIndex:0,matchRate:0.5};
  }
 }
 // 保底
 const d=eligible[Math.floor(Math.random()*eligible.length)];
 return{...d,reason:'🔮 盲盒推荐：试试这个吧，说不定有惊喜！',type:'盲盒尝鲜',matchIndex:0,matchRate:0.5};
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

const s_titleMap={'home-section':'唐猫庭院 - 菜品推荐','login-section':'登录 - 唐猫庭院','register-section':'注册 - 唐猫庭院','preference-section':'口味偏好 - 唐猫庭院','recommendation-section':'推荐菜品 - 唐猫庭院','feedback-section':'菜品评价 - 唐猫庭院','cart-section':'购物车 - 唐猫庭院','end-section':'点餐完成 - 唐猫庭院','about-section':'关于本店 - 唐猫庭院','dataset-section':'全部菜单 - 唐猫庭院','profile-section':'个人中心 - 唐猫庭院','privacy-section':'隐私政策 - 唐猫庭院'};
const s_navMap={'home-section':'nav-home','about-section':'nav-about','dataset-section':'nav-dataset','privacy-section':'nav-privacy','login-section':'nav-user','register-section':'nav-user','profile-section':'nav-profile'};

function showSection(sectionId){
 const el=document.getElementById(sectionId);
 if(!el){console.warn('showSection: 未找到元素',sectionId);return;}
 // 记录上一页（关闭购物车时返回）
 const cur=document.querySelector('.section.active');
 if(cur&&cur.id!==sectionId)window._prevSection=cur.id;
 document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
 el.classList.add('active');
 // 切换section时平滑滚动到顶部，提升浏览体验
 window.scrollTo({ top: 0, behavior: 'smooth' });
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
  updateModeDisplay();
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
 showSection('dataset-section');
 renderMenuTable();
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
 const q=document.getElementById('menu-search')?.value?.trim().toLowerCase()||'';
 const cat=document.getElementById('menu-filter-cat')?.value||'';
 const spice=document.getElementById('menu-filter-spice')?.value||'';
 const priceRange=document.getElementById('menu-filter-price')?.value||'';
 const catOrder=['招牌','热销菜品','传承陕菜','江湖海鲜','特色凉菜','田园时蔬','陕西小吃'];
 const sorted=[...dishData].sort((a,b)=>catOrder.indexOf(a.category)-catOrder.indexOf(b.category)||a.id-b.id);
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
 container.innerHTML='<div class="dish-grid">'+filtered.map(d=>{
  const ci=cart.find(c=>c.id===d.id);
  const qty=ci?(ci.qty||1):0;
  const defaultImg='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23fdf6f0%22/%3E%3Ctext x=%2250%22 y=%2260%22 text-anchor=%22middle%22 font-size=%2236%22%3E🍜%3C/text%3E%3C/svg%3E';
  const imgUrl=d.image_url&&(d.image_url.startsWith('/')||d.image_url.startsWith('http'))?'<img src="'+esc(d.image_url)+'" style="width:100%;height:160px;border-radius:10px;object-fit:cover;" alt="'+esc(d.name)+'" loading="lazy" onerror="this.src=\''+defaultImg+'\'">':(d.image_url?'<span style="font-size:4rem;display:flex;align-items:center;justify-content:center;height:160px;">'+esc(d.image_url)+'</span>':'');
  const star=d.tags&&d.tags.includes('招牌')?'<span class="badge" style="background:var(--primary-accent);color:#fff;font-size:0.65rem;">招牌</span> ':'';
  return '<div class="dish-card">'+imgUrl+'<div class="dish-card-body"><h6 style="font-family:Noto Serif SC,serif;font-weight:600;margin:8px 0 4px;">'+star+esc(d.name)+'</h6><p style="font-size:0.78rem;color:var(--text-light);margin:0 0 8px;">'+esc(d.category)+' · '+esc(d.spiciness)+'</p><div class="d-flex justify-content-between align-items-center"><strong style="color:var(--primary);font-size:1.05rem;">'+esc(formatPrice(d.price))+'</strong>'+(qty>0?'<div class="d-flex align-items-center gap-1"><button class="btn btn-sm btn-outline-secondary cart-qty-minus" data-id="'+d.id+'" style="padding:2px 8px;border-radius:6px;font-weight:700;">－</button><span style="font-weight:700;min-width:20px;text-align:center;">'+qty+'</span><button class="btn btn-sm btn-outline-success cart-qty-plus add-to-cart-btn" data-id="'+d.id+'" style="padding:2px 8px;border-radius:6px;font-weight:700;">＋</button></div>':'<button class="btn btn-sm add-to-cart-btn" data-id="'+d.id+'" style="background:var(--primary);color:#fff;border:none;border-radius:6px;padding:4px 14px;font-weight:600;">＋ 加入</button>')+'</div></div></div>';
 }).join('')+'</div>';
 document.getElementById('menu-count').textContent=filtered.length+'/'+dishData.length;
}

function login(){
 const uEl=document.getElementById('login-username'),pEl=document.getElementById('login-password'),bEl=document.getElementById('login-btn');
 if(!uEl||!pEl){showMessage('页面错误','登录表单元素未找到');return;}
 if(bEl)bEl.disabled=true;
 const u=uEl.value.trim(),p=pEl.value;
 if(!u||!p){showMessage('登录失败','请输入用户名和密码');return;}
 fetch('/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})})
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
     showSection('preference-section');if(d.user?.preferences)loadUserPreferences(d.user.preferences);
   });})
 .catch(()=>{showMessage('登录失败','无法连接到服务器，请检查网络');}).finally(()=>{const b=document.getElementById('login-btn');if(b)b.disabled=false;});
}

function register(){
 const uEl=document.getElementById('register-username'),pEl=document.getElementById('register-password'),cEl=document.getElementById('register-confirm'),bEl=document.getElementById('register-btn');
 const aEl=document.getElementById('agree-privacy');
 if(!uEl||!pEl||!cEl){showMessage('页面错误','注册表单元素未找到');return;}
 if(bEl)bEl.disabled=true;const u=uEl.value.trim(),p=pEl.value,c=cEl.value;
 if(!u||!p){showMessage('注册失败','请填写完整信息');if(bEl)bEl.disabled=false;return;}
 if(p!==c){showMessage('注册失败','两次密码不一致');if(bEl)bEl.disabled=false;return;}
 if(!aEl||!aEl.checked){showMessage('注册失败','请阅读并同意隐私政策');if(bEl)bEl.disabled=false;return;}
 fetch('/api/user/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})})
 .then(r=>r.json()).then(d=>{if(!d.success){showMessage('注册失败',d.error||'注册失败');return;}
 if(d.token)localStorage.setItem('userToken',d.token);
 currentUser=u;localStorage.setItem('currentUser',u);const users=loadUsers();if(!users.find(x=>x.username===u))users.push({username:u,created_at:new Date().toISOString(),lastLogin:new Date().toISOString(),favorites:[],blacklist:[],preferences:{}});saveUsers(users);
 showMessage('注册成功','欢迎，'+u+'！',function(){
     const pi=document.getElementById('nav-profile-item'),nu=document.getElementById('nav-user');
     if(pi)pi.classList.remove('d-none');if(nu)nu.classList.add('d-none');
     const hlb=document.getElementById('login-btn'),hrb=document.getElementById('register-btn');
     if(hlb)hlb.classList.add('d-none');if(hrb)hrb.classList.add('d-none');
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
  fetch('/api/user-preferences',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,preferences:userProfile})}).catch(()=>{});
}
 // 记录偏好选择
 fetch('/api/preference-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spiciness:userProfile.spiciness,saltiness:userProfile.saltiness,sweetness:userProfile.sweetness,price:userProfile.price,calorie:userProfile.calorie,religion:userProfile.religion,allergies:userProfile.allergies,userId:currentUser||'guest',recommendationMode:userProfile.recommendationMode})}).catch(()=>{});
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
 fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({dishId:dish.id,score:starRatingValue,userPreferences:prefs,userId:uid})})
 .then(r=>r.json()).then(d=>{showMessage('评价成功','感谢您对'+dish.name+'的评价！',function(){starRatingDish=null;starRatingValue=0;document.querySelectorAll('.star').forEach(s=>{s.textContent='☆';s.style.color='#ddd';});const h=document.getElementById('star-hint');if(h)h.textContent='点击星星评分';const sb=document.getElementById('star-submit-btn');if(sb)sb.disabled=true;showSection(ratingReturnTo||'recommendation-section');});}).catch(()=>showMessage('评价失败','网络错误，请稍后重试'));
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
 // 创建订单（发送到服务器）
 const items=currentRecommendations.map(d=>{const p=parseFloat(d.price);return{id:d.id,name:d.name,price:isNaN(p)?0:p,type:d.type||'偏好推荐',matchRate:d.matchRate||0};});
 const total=items.reduce((s,i)=>s+i.price,0);
 const uid=currentUser||'guest';
 fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({userId:uid,items,totalPrice:total})}).catch(()=>{showMessage('下单失败','网络错误，请稍后重试');});
 const $s=id=>{const el=document.getElementById(id);return el;};
 // 缓冲过渡
 const rl=$s('recommendation-loading'),rr=$s('recommendation-result');
 if(rl)rl.classList.remove('d-none');
 if(rr)rr.classList.add('d-none');
 if(rl)rl.innerHTML='<div class="text-center py-5"><div class="spinner-border text-danger" role="status"><span class="visually-hidden">加载中...</span></div><p class="mt-3" style="color:#8b7a6a;letter-spacing:2px;font-size:0.9rem;">正在生成推荐总结...</p><div class="mt-2" style="width:120px;height:3px;background:var(--gold-light);border-radius:2px;margin:0 auto;overflow:hidden;"><div style="width:40%;height:100%;background:var(--gold);border-radius:2px;animation:loadingBar 0.8s ease-in-out infinite alternate;"></div></div></div>';
 setTimeout(()=>{
  showSection('end-section');
  const cnt=currentRecommendations.length;
  const rates=currentRecommendations.filter(d=>d.type!=='盲盒尝鲜').map(d=>d.matchRate||0);
  const allRates=currentRecommendations.map(d=>d.matchRate||0);
  const avgMatch=allRates.length?Math.round(allRates.reduce((a,b)=>a+b,0)/allRates.length*100):0;
  const topMatch=rates.length?Math.round(Math.max(...rates)*100):0;
  const e=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  e('end-dish-count',cnt);
  e('end-avg-match',avgMatch+'%');
  e('end-top-match',topMatch+'%');
  displayModelMetrics();
  displayFeatureImportance();
 },1500);
}
function displayModelMetrics(){
 const el=document.getElementById('model-metrics');
 if(!el)return;
 fetch('/api/model-metrics').then(r=>r.json()).then(d=>{
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
    '<div style="font-size:1.5rem;font-weight:700;color:#2c1810;">'+i.value+'</div>'+
    '<div style="font-size:0.8rem;color:#8b7a6a;margin-top:2px;">'+i.desc+'</div>'+
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
  tip.style.cssText='color:#8b7a6a;font-size:0.85rem;text-align:center;padding:20px;';
  tip.textContent='正在加载特征数据...';
  parent.appendChild(tip);
 }
 if(featureImportanceChart){featureImportanceChart.destroy();featureImportanceChart=null;}
 fetch('/api/feature-importance').then(r=>r.json()).then(d=>{
  if(d.success&&d.importance&&d.importance.length){
   const imp=d.importance.filter(x=>x.importance>0.005).slice(0,15);
   const labels=imp.map(x=>x.feature);
   const data=imp.map(x=>x.importance);
   const colors=['#8b1a1a','#b83a2a','#c0392b','#d45a4a','#e8a090','#e8d5b0','#c9a96e','#a8884e','#7a6a4e','#5a4a3e','#3a2a2e','#c0885e','#d0986e','#a0704e','#805030'];
   if(typeof Chart!=='undefined'){
    try {
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
 if(token){fetch('/api/user/logout',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}}).catch(()=>{});}
 currentUser=null;localStorage.removeItem('currentUser');localStorage.removeItem('userToken');resetRecommendation();const pi=document.getElementById('nav-profile-item'),nu=document.getElementById('nav-user');if(pi)pi.classList.add('d-none');if(nu)nu.classList.remove('d-none');const hlb=document.getElementById('login-btn'),hrb=document.getElementById('register-btn');if(hlb)hlb.classList.remove('d-none');if(hrb)hrb.classList.remove('d-none');showMessage('已退出',msg,function(){showSection('home-section');});}
function showProfile(){
 if(!currentUser||currentUser==='guest'){showMessage('错误','请先登录');return;}
 const user=getUserData(currentUser);if(!user){showMessage('错误','无法获取用户信息');return;}
  const pu=document.getElementById('profile-username');if(pu)pu.textContent=user.username||currentUser;
 const pl=document.getElementById('profile-last-login');if(pl)pl.textContent=user.lastLogin||'从未登录';
 const $=id=>document.getElementById(id);
 const fl=$('favorites-list');if(fl)fl.innerHTML=user.favorites?.length?user.favorites.map((id,i)=>{const d=dishData.find(x=>x.id==id);return '<div class="d-flex justify-content-between align-items-center mb-2"><span>'+(i+1)+'. '+(d?esc(d.name):'菜品'+id)+'</span><button class="btn btn-sm btn-danger cancel-favorite" data-id="'+esc(String(id))+'">取消</button></div>';}).join(''):'<p class="text-muted">还没有收藏的菜品</p>';
 const bl=$('blacklist-list');if(bl)bl.innerHTML=user.blacklist?.length?user.blacklist.map((id,i)=>{const d=dishData.find(x=>x.id==id);return '<div class="d-flex justify-content-between align-items-center mb-2"><span>'+(i+1)+'. '+(d?esc(d.name):'菜品'+id)+'</span><button class="btn btn-sm btn-danger cancel-blacklist" data-id="'+esc(String(id))+'">取消</button></div>';}).join(''):'<p class="text-muted">还没有拉黑的菜品</p>';
 document.querySelectorAll('.cancel-favorite').forEach(b=>b.addEventListener('click',function(){const id=this.getAttribute('data-id');const u=getUserData(currentUser);if(u&&u.favorites){u.favorites=u.favorites.filter(x=>x!=id);updateUserData(currentUser,{favorites:u.favorites});fetch('/api/user-favorites',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,favorites:u.favorites})}).catch(()=>{});showMessage('成功','已取消收藏',showProfile);}}));
 document.querySelectorAll('.cancel-blacklist').forEach(b=>b.addEventListener('click',function(){const id=this.getAttribute('data-id');const u=getUserData(currentUser);if(u&&u.blacklist){u.blacklist=u.blacklist.filter(x=>x!=id);updateUserData(currentUser,{blacklist:u.blacklist});showMessage('成功','已取消',showProfile);}}));
 // 加载推荐历史
 const rh=$('rec-history-list');if(rh)rh.innerHTML='<p class="text-muted" style="font-size:0.85rem;">加载中...</p>';
 fetch('/api/orders?userId='+encodeURIComponent(currentUser),{headers:authHeaders()}).then(r=>r.json()).then(d=>{
  if(d.success&&d.orders&&d.orders.length){
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
     +'<span style="color:#b83a2a;font-weight:600;">共'+dishList.length+'道</span>'
     +'</div>'
     +dishRows+'</div>';
   }).join('');  rh.innerHTML=items;
   // 绑定评分按钮事件
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
 if(!confirm('确定要取消所有收藏吗？'))return;
 u.favorites=[];
 updateUserData(currentUser,{favorites:[]});
 fetch('/api/user-favorites',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,favorites:[]})}).catch(()=>{});
 showMessage('成功','已取消所有收藏');
 setTimeout(showProfile,1000);
}
function cancelBlacklist(){
 const u=getUserData(currentUser);
 if(!u?.blacklist?.length){showMessage('提示','列表为空');return;}
 if(!confirm('确定要清空黑名单吗？'))return;
 u.blacklist=[];
 updateUserData(currentUser,{blacklist:[]});
 fetch('/api/user-blacklist',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,blacklist:[]})}).catch(()=>{});
 showMessage('成功','已清空黑名单');
 setTimeout(showProfile,1000);
}
function addToFavorites(dishId){if(!currentUser||currentUser==='guest'){showMessage('提示','请先登录');return;}
 const user=getUserData(currentUser);if(!user){showMessage('错误','无法获取用户信息');return;}
 if(!user.favorites)user.favorites=[];if(user.favorites.includes(dishId)){showMessage('提示','已收藏');return;}
 user.favorites.push(dishId);updateUserData(currentUser,{favorites:user.favorites});const dish=dishData.find(d=>d.id===dishId);showMessage('成功','已收藏'+(dish?dish.name:''));
 fetch('/api/user-favorites',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,favorites:user.favorites})}).catch(()=>{});
 displayRecommendations();}
function addToBlacklist(dishId){if(!currentUser||currentUser==='guest'){showMessage('提示','请先登录');return;}
 const user=getUserData(currentUser);if(!user){showMessage('错误','无法获取用户信息');return;}
 if(!user.blacklist)user.blacklist=[];if(user.blacklist.includes(dishId)){showMessage('提示','已拉黑');return;}
 if(user.favorites?.includes(dishId)){user.favorites=user.favorites.filter(id=>id!==dishId);updateUserData(currentUser,{favorites:user.favorites});fetch('/api/user-favorites',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,favorites:user.favorites})}).catch(()=>{});}
 user.blacklist.push(dishId);updateUserData(currentUser,{blacklist:user.blacklist});const dish=dishData.find(d=>d.id===dishId);showMessage('成功','已拉黑'+(dish?dish.name:''));
 fetch('/api/user-blacklist',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:currentUser,blacklist:user.blacklist})}).catch(()=>{});
 displayRecommendations();}
function deleteAccount(){
 const el=document.getElementById('message-modal'),cf=document.getElementById('modal-confirm-btn'),cb=document.getElementById('modal-close-btn');
 document.getElementById('modal-title').textContent='确认注销';document.getElementById('modal-body').textContent='确定要注销账号吗？此操作不可恢复！';
 const origCf=cf.onclick,origCb=cb.onclick;
 const cleanup=()=>{cf.onclick=origCf;cb.onclick=origCb;el.removeEventListener('hidden.bs.modal',cleanup);};
 cf.onclick=function(){const username=currentUser;fetch('/api/user/delete',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({username:username})}).then(r=>r.json()).then(d=>{if(d.success){removeUser(username);currentUser=null;localStorage.removeItem('currentUser');localStorage.removeItem('userToken');resetRecommendation();const m=bootstrap.Modal.getInstance(el);if(m)m.hide();cleanup();setTimeout(()=>{showMessage('成功','账号已注销',function(){showSection('home-section');});},300);}else{showMessage('注销失败',d.error||'服务器错误');}}).catch(()=>{showMessage('网络错误','注销请求失败，请稍后重试');});};
 cb.onclick=function(){const m=bootstrap.Modal.getInstance(el);if(m)m.hide();cleanup();};
 el.addEventListener('hidden.bs.modal',cleanup);
 el.inert=false;el.removeAttribute('aria-hidden');let m=bootstrap.Modal.getInstance(el);if(!m)m=new bootstrap.Modal(el,{focus:false});m.show();
  // 聚焦确认按钮
  el.addEventListener('shown.bs.modal', function focusDelHandler() {
    el.removeEventListener('shown.bs.modal', focusDelHandler);
    const confirmBtn = document.getElementById('modal-confirm-btn');
    if (confirmBtn) setTimeout(function() { confirmBtn.focus(); }, 50);
  });
}

// ═══════════════ 购物车功能 ═══════════════
function showCart(){
 const cart=getCart();const empty=document.getElementById('cart-empty'),content=document.getElementById('cart-content');
 const tb=document.getElementById('cart-table-body');const ti=document.getElementById('cart-total-items');const tp=document.getElementById('cart-total-price');
 if(!cart.length){if(empty)empty.style.display='block';if(content)content.style.display='none';if(tb)tb.innerHTML='';}else{
  if(empty)empty.style.display='none';if(content)content.style.display='block';
  if(tb)tb.innerHTML=cart.map(x=>{
   const dish=dishData.find(d=>d.id===x.id);
   const qtyVal=x.qty||1;
   const name=dish?esc(dish.name):esc(x.name);
   const price=parseFloat(x.price)||0;
   const subtotal=price*qtyVal;
   return '<tr><td>'+(dish&&dish.image_url?(dish.image_url.startsWith('/')||dish.image_url.startsWith('http')?'<img src="'+esc(dish.image_url||'')+'" alt="'+esc(dish.name||'菜品')+'" style="width:80px;height:80px;border-radius:8px;object-fit:cover;margin-right:8px;vertical-align:middle;" onerror="this.style.display=\'none\'">':'<span style="font-size:2rem;margin-right:8px;vertical-align:middle;">'+esc(dish.image_url)+'</span>'):'')+name+'</td>'
    +'<td><div class="input-group input-group-sm" style="width:100px;"><button class="btn btn-outline-secondary cart-qty-minus" data-id="'+esc(String(x.id))+'" style="padding:2px 6px;">−</button>'
    +'<input type="text" class="form-control text-center cart-qty-input" data-id="'+esc(String(x.id))+'" value="'+esc(String(qtyVal))+'" style="width:36px;height:28px;font-size:0.8rem;">'
    +'<button class="btn btn-outline-secondary cart-qty-plus" data-id="'+esc(String(x.id))+'" style="padding:2px 6px;">+</button></div></td>'
    +'<td>'+price.toFixed(2)+'</td><td style="color:#c0392b;font-weight:600;">'+subtotal.toFixed(2)+'</td>'
    +'<td><button class="btn btn-sm btn-outline-danger cart-remove-btn" data-id="'+esc(String(x.id))+'" style="padding:2px 6px;font-size:0.7rem;"><i class="bi bi-x"></i></button></td></tr>';
  }).join('');
  if(ti)ti.textContent=getCartCount();
  if(tp)tp.textContent=getCartTotal().toFixed(2);
 }
 showSection('cart-section');
}
function checkoutCart(){
 const cart=getCart(),bEl=document.getElementById('cart-checkout-btn');
 if(!cart.length){showMessage('提示','购物车是空的');return;}
 if(bEl)bEl.disabled=true;
 const tableInput=document.getElementById('cart-table-number');
 const tableNumber=tableInput?tableInput.value.trim():'';
 if(!tableNumber){showMessage('请输入桌号','下单前请填写桌号，让厨房知道送哪桌');if(bEl)bEl.disabled=false;return;}
 const items=cart.map(x=>{const dish=dishData.find(d=>d.id===x.id);const p=parseFloat(x.price)||0;return{id:x.id,name:x.name,price:p,type:'购物车',matchRate:0.5,qty:x.qty||1};});
 const total=items.reduce((s,i)=>s+i.price*(i.qty||1),0);
 const uid=currentUser||'guest';
 fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({userId:uid,items,totalPrice:total,tableNumber})})
 .then(r=>r.json()).then(d=>{
  if(!d.success){showMessage('下单失败',d.error||'服务器错误');return;}
  let ordered=[];try{ordered=JSON.parse(localStorage.getItem('orderedDishes')||'[]')}catch(e){}
  cart.forEach(x=>{if(!ordered.includes(x.id))ordered.push(x.id);});
  try{localStorage.setItem('orderedDishes',JSON.stringify(ordered))}catch(e){};
  clearCart();
  if(tableInput)tableInput.value='';
  showMessage('下单成功 ✓','订单号: '+d.orderId+' | 桌号: '+tableNumber+' | 合计: '+total+'元\n\n厨房已接单，正在为您准备',function(){showSection('home-section');});
 }).catch(()=>showMessage('下单失败','网络错误，请稍后重试')).finally(()=>{const b=document.getElementById('cart-checkout-btn');if(b)b.disabled=false;});
}

// 桌号同步: 偏好页输入 → localStorage → 购物车自动填
function syncTableNumber(from){
  const val=from?.value?.trim()||'';
  if(val)localStorage.setItem('tableNumber',val);
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

 const up=userProfile||{};const prefs={'辣度':up.spiciness||'','咸淡':up.saltiness||'','甜酸':up.sweetness||'','价格区间':up.price||'无','饮食_宗教':up.religion==='无'?'无特殊要求':up.religion||'无','allergies':up.allergies||[],'calorie':up.calorie||'无','blindBoxMode':up.blindBoxMode||'smart'};
 let blk=[];if(currentUser&&currentUser!=='guest'){const u=getUserData(currentUser);if(u)blk=u.blacklist||[];}

 let dishes=dishData.filter(d=>{
  if(d.is_active===false)return false;
  if(d.category==='飲品与酒水'||d.category==='主食')return false;
  if(prefs['价格区间']!=='无'&&prefs['价格区间']!=='不限'){
   const p=parseFloat(d.price);if(!isNaN(p)){
    if(prefs['价格区间']==='经济'&&p>=20)return false;
    if(prefs['价格区间']==='适中'&&(p<20||p>50))return false;
    if(prefs['价格区间']==='品质'&&p<=50)return false;
  }}
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
   const rule=Math.min(totalMatch/8.5,1);
   const mlNorm=mlR>0.01?(ml-mlMin)/mlR:(ml/5);
   d.matchIndex=Math.round((rule*0.4+mlNorm*0.6)*100)/100;d.mlScore=ml;d.matchRate=rule*0.4+mlNorm*0.6;
  });
  dishes.sort((a,b)=>b.matchIndex-a.matchIndex);const top=dishes.slice(0,5);
  top.forEach(d=>{d.reason=generateDishReason(prefs,d);d.type='偏好推荐';});
  const blind=selectBlindBoxDish(prefs,top,blk);if(blind)top.push(blind);
  currentRecommendations=top;top.forEach(d=>{if(!recommendedIds.includes(d.id))recommendedIds.push(d.id);});
  currentRecommendationMode='随机森林';displayRecommendations();
 };
 const callAPI=dlist=>{
  const TIMEOUT=60000,ft=(url,opt,ms)=>Promise.race([fetch(url,opt),new Promise((_,r)=>setTimeout(()=>r(new Error('超时')),ms))]);
  const od=dlist.slice(0,100).map(d=>({id:d.id,spiciness:d.spiciness,saltiness:d.saltiness,sweetness:d.sweetness,vegetable:'适量',rating:d.rating,price:d.price,isHalal:d.isHalal||false,isVegetarian:d.isVegetarian||false,allergies:d.allergies,religion:d.religion||'无特殊要求',calorie:d.calorie||'0',protein:d.protein||'0'}));
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
  const md={taste:0,cuisine:0,nutrition:0,rating:0};
  const keyMap={'辣度':'spiciness','咸淡':'saltiness','甜酸':'sweetness'};
  ['辣度','咸淡','甜酸'].forEach(k=>{if(prefs[k]!=='无'){if(d[keyMap[k]]===prefs[k])md.taste+=1;}else md.taste+=1;});
  if(d.tags&&d.tags.includes('招牌'))md.cuisine+=1.5;
  md.nutrition+=2;md.rating=Math.round((ps/5)*2.5*10)/10;
  const total=md.taste+md.cuisine+md.nutrition+md.rating;
  d.matchIndex=Math.round(total*100)/100;d.matchDetails=md;d.predictedScore=ps;d.matchRate=total/8.5;
  d.reason='推荐理由：口味'+md.taste+' 招牌'+md.cuisine+' 营养'+md.nutrition+' 评分'+md.rating+(ps>=4.0?'（模型预测'+ps.toFixed(2)+'分）':'');d.type='偏好推荐';
 });
 dishes.sort((a,b)=>b.matchIndex-a.matchIndex);const top=dishes.slice(0,5);
 const a=prefs['allergies']||[],r=prefs['饮食_宗教'];
 const eligible=dishData.filter(d=>d.is_active!==false&&!top.some(t=>t.id===d.id)&&!recommendedIds.includes(d.id)&&!(blk&&blk.includes(d.id))
  &&!(r==='清真'&&!d.isHalal)&&!(r==='素食'&&!d.isVegetarian)
  &&!(a.includes('海鲜')&&d.allergies?.seafood)&&!(a.includes('花生')&&d.allergies?.peanut)
  &&!(a.includes('鸡蛋')&&d.allergies?.egg)&&!(a.includes('大豆')&&d.allergies?.soy)&&!(a.includes('麸质')&&d.allergies?.gluten)
  &&d.category!=='飲品与酒水'&&d.category!=='主食');
 if(eligible.length){const bd=eligible[Math.floor(Math.random()*eligible.length)];bd.reason='🔮 盲盒推荐：试试这个吧，说不定有惊喜！';bd.type='盲盒尝鲜';bd.matchIndex=0;bd.matchRate=0.5;top.push(bd);}
 currentRecommendations=top;top.forEach(d=>{if(!recommendedIds.includes(d.id))recommendedIds.push(d.id);});
 currentRecommendationMode='决策树模型';console.log('🍽️决策树推荐 '+top.length+'个菜品,耗时'+(Date.now()-start)/1000+'s');console.log('📊排名:',top.slice(0,5).map((d,i)=>(i+1)+'.'+d.name+'('+Math.round((d.matchIndex||0)*100)+'%)').join('  '));if(top.find(d=>d.type==='盲盒尝鲜'))console.log('🎁盲盒:'+top.find(d=>d.type==='盲盒尝鲜').name);console.groupEnd();displayRecommendations();
}


// ═══════════════ 推荐结果渲染 ═══════════════
function displayRecommendations(){
 // 推荐完成，记录推荐次数
 fetch('/api/recommendation-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userType:currentUser==='guest'?'guest':currentUser?'user':'guest',userId:currentUser||'guest'})}).catch(()=>{});
 // 缓存推荐结果到 localStorage
 try { localStorage.setItem('cachedRecommendations', JSON.stringify(currentRecommendations)); localStorage.setItem('cachedRecMode', currentRecommendationMode); } catch(e) {}
 const $=id=>document.getElementById(id),loading=$('recommendation-loading'),result=$('recommendation-result');
 if(!loading||!result)return;
 const desc=currentRecommendationMode==='随机森林'?'(基于ML)':currentRecommendationMode==='决策树模型'?'(基于决策树)':'';
 const _rice=dishData.find(d=>d.name==='五常大米饭');
 result.innerHTML='<div style="background-color:#fdf2e9;border:2px solid #f5cba7;border-radius:8px;padding:15px;margin-bottom:20px;text-align:center"><p style="margin:0;color:#c0392b"><strong>当前使用：</strong>'+currentRecommendationMode+' '+desc+'</p></div><div class="mb-4"><h4 class="text-danger">为您推荐</h4><div class="list-group" id="dish-list"></div></div><div class="mt-3 p-3 rounded-3" style="background:linear-gradient(135deg,#fdf6f0,#f5ebe0);border:1px solid rgba(201,169,110,0.2);"><div class="d-flex align-items-center justify-content-between"><div><span style="font-size:1.5rem;">🍚</span> <strong>五常大米饭</strong> <small style="color:var(--text-light);">3元/碗</small></div><button class="btn btn-sm btn-outline-success add-to-cart-btn" id="add-rice-btn" data-id="'+(_rice?_rice.id:'')+'"><i class="bi bi-plus-circle me-1"></i>加一碗米饭</button></div></div></div><div class="mt-5"><h4 class="text-danger">操作</h4><div class="row g-3 mt-3"><div class="col-md-4"><button class="btn btn-outline-primary w-100 py-2" id="refresh-recommendations"><i class="bi bi-arrow-repeat me-2"></i>换一批</button></div><div class="col-md-4"><button class="btn btn-outline-success w-100 py-2" id="end-recommendation"><i class="bi bi-check-circle me-2"></i>选好了</button></div><div class="col-md-4"><button class="btn btn-outline-danger w-100 py-2" id="end-logout-btn"><i class="bi bi-box-arrow-right me-2"></i>退出</button></div></div></div>';
 const old=result._delegateHandler;if(old)result.removeEventListener('click',old);
 const handler=e=>{const t=e.target.closest('button');if(!t)return;({'refresh-recommendations':()=>fetchRecommendations(true),'end-recommendation':()=>endRecommendation(),'end-logout-btn':()=>{resetRecommendation();showSection('home-section');}})[t.id]?.();};
 result.addEventListener('click',handler);result._delegateHandler=handler;
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
 const img=(d.image_url&&(d.image_url.startsWith('/')||d.image_url.startsWith('http'))?'<img src="'+esc(d.image_url)+'" style="width:160px;height:160px;border-radius:12px;object-fit:cover;margin-left:12px;vertical-align:middle;" alt="'+esc(d.name)+'" loading="lazy" onerror="this.src=\''+defaultImg+'\'">':(d.image_url?'<span style="font-size:3.5rem;vertical-align:middle;margin-left:12px;">'+esc(d.image_url)+'</span>':''));
	 dl.innerHTML+='<div class="list-group-item '+blindBoxClass+'"><div class="dish-info"><div class="dish-details flex-grow-1"><h5>'+(i+1)+'. '+tagBadges+orderedBadge+(d.type==='盲盒尝鲜'?'<span class="badge bg-info me-1">盲盒</span>':'')+esc(d.name)+img+'</h5>'+'<p class="mb-1">'+esc(d.category)+' · '+esc(d.spiciness)+' · '+esc(formatPrice(d.price))+(tags?' · '+esc(tags):'')+'</p><p class="dish-reason">'+esc(d.reason)+'</p>'+(d.type!=='盲盒尝鲜'&&isFinite(d.matchIndex)?'<p class="text-muted small">匹配指数：'+d.matchIndex.toFixed(2)+'（口味'+(d.matchDetails?.taste||0)+'+招牌'+(d.matchDetails?.cuisine||0)+'+营养'+(d.matchDetails?.nutrition||0)+'+评分'+(d.matchDetails?.rating||0)+'）</p>':'<p class="text-muted small">匹配指数：— —</p>')+'<div class="dish-actions mt-2"><button class="btn btn-sm btn-outline-success me-1 add-to-cart-btn" data-id="'+d.id+'" data-name="'+esc(d.name)+'" data-price="'+(d.price!==null&&d.price!==undefined?d.price:'')+'" data-image="'+esc(d.image_url||'')+'" style="border-color:#27ae60;color:#27ae60;"><i class="bi bi-cart-plus"></i> 加入</button><button class="btn btn-sm '+(isFav?'btn-success':'btn-outline-success')+' me-2" onclick="addToFavorites('+d.id+')"'+(isFav?' disabled':'')+'><i class="bi bi-heart'+(isFav?'-fill':'')+'"></i> '+(isFav?'已收藏':'收藏')+'</button><button class="btn btn-sm '+(isBlk?'btn-dark':'btn-outline-dark')+'" onclick="addToBlacklist('+d.id+')"'+(isBlk?' disabled':'')+'><i class="bi bi-x-circle'+(isBlk?'-fill':'')+'"></i> '+(isBlk?'已拉黑':'拉黑')+'</button><button class="btn btn-sm btn-outline-warning ms-2" onclick="openStarFeedback(currentRecommendations['+i+'])" style="border-color:#f1c40f;color:#f39c12;"><i class="bi bi-star"></i> 评分</button></div></div><div class="dish-score text-center ms-3">'+(d.type==='盲盒尝鲜'?'<div class="badge badge-blind rounded-pill mb-2">🎁</div><div class="text-muted small" style="font-size:0.7rem;">试试手气</div>':'<div class="badge bg-danger rounded-pill mb-2">'+matchRatePct+'%</div><div class="text-muted small">匹配度</div>')+'</div></div></div>';
 });
 loading.classList.add('d-none');result.classList.remove('d-none');
}


// ═══════════════ 评分反馈 ═══════════════

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
 // 暗黑模式：检测系统偏好 + 用户手动切换
 const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches;
 const savedDark=localStorage.getItem('darkMode');
 // 优先级：localStorage保存的偏好 > 系统偏好
 const shouldBeDark=savedDark!==null?savedDark==='true':prefersDark;
 if(shouldBeDark){document.documentElement.classList.add('dark-mode');const tb=document.getElementById('dark-mode-toggle');if(tb){const ic=tb.querySelector('i');if(ic)ic.className='bi bi-sun';}}
	 // 从API加载菜品数据
 Promise.race([fetch('/api/dishes'),new Promise((_,r)=>setTimeout(()=>r(new Error('超时')),10000))]).then(r=>r.json()).then(d=>{
  if(d.success&&d.dishes.length){
    dishData=d.dishes;
    renderMenuTable(); // 数据就绪后立即渲染，避免竞态空表格
  }
}).catch(()=>console.warn('菜品数据加载超时/失败'));
 setTimeout(()=>checkApiAvailability().then(a=>{if(a)console.log('API可用,ML模型已就绪');else console.log('ML模型启动中,暂用本地推荐(稍后自动恢复)')}),100);
 const $=id=>document.getElementById(id);
 const click=(id,fn)=>{const el=$(id);if(el)el.addEventListener('click',fn);};
 const submit=(id,fn)=>{const el=$(id);if(el)el.addEventListener('submit',e=>{e.preventDefault();fn();});};
 // 桌号同步: 偏好页输入实时存localStorage
 const prefTable=$('pref-table-number');
 if(prefTable){const saved=localStorage.getItem('tableNumber');if(saved)prefTable.value=saved;prefTable.addEventListener('input',()=>syncTableNumber(prefTable));}
 // 购物车桌号自动填
 const cartTable=$('cart-table-number');
 if(cartTable){const saved=localStorage.getItem('tableNumber');if(saved)cartTable.value=saved;cartTable.addEventListener('input',()=>syncTableNumber(cartTable));}
 // 分类Tab切换
 document.querySelectorAll('.cat-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
   document.querySelectorAll('.cat-tab').forEach(t=>{t.classList.remove('active');t.style.background='transparent';t.style.color='var(--text)';t.style.border='1px solid var(--gold-light)';});
   tab.classList.add('active');tab.style.background='var(--primary)';tab.style.color='#fff';tab.style.border='none';
   const cat=tab.dataset.cat;
   const catSel=$('menu-filter-cat');if(catSel){catSel.value=cat;catSel.dispatchEvent(new Event('change'));}
  });
 });

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
   fetch('/api/dishes').then(r=>r.json()).then(d=>{if(d.success&&d.dishes.length){dishData=d.dishes;renderMenuTable();showMessage('提示','筛选条件已重置');}}).catch(()=>showMessage('提示','数据加载失败，请刷新页面'));
   return;
  }
  renderMenuTable();
  showMessage('提示','筛选条件已重置');
 });
 click('nav-user',e=>{e.preventDefault();showSection('login-section');});
 click('nav-profile',e=>{e.preventDefault();showProfile();});
 click('login-btn',()=>showSection('login-section'));
 click('register-btn',()=>showSection('register-section'));
 click('guest-btn',()=>{if(!currentUser)currentUser='guest';showSection('preference-section');});
 click('ai-recommend-btn',()=>{if(!currentUser)currentUser='guest';showSection('preference-section');});
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
 click('view-profile-btn',showProfile);click('back-from-profile',()=>showSection('preference-section'));
 click('cancel-favorite-btn',cancelFavorite);click('cancel-blacklist-btn',cancelBlacklist);
 click('delete-account-btn',deleteAccount);click('back-to-preference',()=>showSection('preference-section'));
 click('logout-btn',logout);
 click('back-to-recommendations',()=>showSection(ratingReturnTo||'recommendation-section'));
 click('new-recommendation',()=>{resetRecommendation();showSection('preference-section');});
 click('end-logout',()=>{resetRecommendation();showSection('home-section');});
 // 购物车事件绑定
 click('nav-cart',e=>{e.preventDefault();showCart();});
 click('cart-close-btn',()=>{
  const prev=window._prevSection||'home-section';
  showSection(prev);
  // 返回推荐页时刷新加购按钮状态(购物车删菜后按钮回归"加入")
  if(prev==='recommendation-section'){
   const cart=getCart();
   document.querySelectorAll('#recommendation-result .add-to-cart-btn').forEach(btn=>{
    const id=parseInt(btn.dataset.id);
    const ci=cart.find(c=>c.id===id);
    btn.innerHTML=ci?'<i class="bi bi-check-circle me-1"></i>已加 '+(ci.qty||1):'<i class="bi bi-cart-plus"></i> 加入';
   });
   // 米饭按钮回归初始文字
   const riceBtn=document.getElementById('add-rice-btn');
   if(riceBtn){const rc=cart.find(c=>c.id===parseInt(riceBtn.dataset.id));if(!rc)riceBtn.innerHTML='<i class="bi bi-plus-circle me-1"></i>加一碗米饭';}
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
   return;
  }
  if(target.classList.contains('cart-qty-plus')){const cart=getCart();const x=cart.find(c=>c.id===id);if(x)updateCartQty(id,(x.qty||1)+1);if(document.getElementById('dataset-section')?.classList.contains('active'))renderMenuTable();else showCart();}
  else if(target.classList.contains('cart-qty-minus')){const cart=getCart();const x=cart.find(c=>c.id===id);if(x)updateCartQty(id,(x.qty||1)-1);if(document.getElementById('dataset-section')?.classList.contains('active'))renderMenuTable();else showCart();}
  else if(target.classList.contains('cart-remove-btn')){removeFromCart(id);showCart();}
 });
 // 购物车数量输入变更
 document.addEventListener('change',function(e){
  if(!e.target.classList.contains('cart-qty-input'))return;
  const id=parseInt(e.target.dataset.id);const val=parseInt(e.target.value);
  if(!isNaN(val)&&val>0)updateCartQty(id,val);else updateCartQty(id,1);
  showCart();
 });
 const me=$('message-modal'),cb=$('modal-close-btn'),cf=$('modal-confirm-btn');
 const closeModal=()=>{if(!me)return;const m=bootstrap.Modal.getInstance(me);if(!m)return;if(document.activeElement)document.activeElement&&document.activeElement.blur();me.inert=true;m.hide();setTimeout(()=>me.setAttribute('aria-hidden','true'),100);};
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
   fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dishId:0,score:satVal,userPreferences:{},userId:currentUser||'guest',type:'overall_satisfaction'})}).catch(e=>console.warn('满意度评价提交失败:',e));
   this.textContent='已提交 ✓';this.disabled=true;this.style.background='#27ae60';
   document.getElementById('end-sat-hint').textContent='感谢您的评价！';
  });
 }
 // 检查是否显示"继续上次推荐"
 const savedPrefs=localStorage.getItem('savedPrefs');
 const cb2=document.getElementById('continue-btn');
 if(currentUser&&currentUser!=='guest'&&(savedPrefs||getUserData(currentUser)?.preferences?.spiciness)){if(cb2)cb2.classList.remove('d-none');}
// 检查是否有缓存的推荐结果
try {
  const cached = localStorage.getItem('cachedRecommendations');
  const vcb = document.getElementById('view-cached-btn');
  if (cached && vcb) {
    const parsed = JSON.parse(cached);
    if (Array.isArray(parsed) && parsed.length > 0) vcb.classList.remove('d-none');
  }
} catch(e) {}
click('view-cached-btn', () => {
  try {
    const cached = localStorage.getItem('cachedRecommendations');
    const mode = localStorage.getItem('cachedRecMode') || '本地推荐';
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
 document.addEventListener('storage',function(e){
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

