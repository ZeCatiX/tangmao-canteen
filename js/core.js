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
 // 招牌菜加分
 if(dish.tags&&dish.tags.includes('招牌'))md.cuisine+=1.5;
 // 营养部分简化
 md.nutrition+=2;
 const s=parseFloat(dish.rating);md.rating=!isNaN(s)?Math.round((s/5)*2.5*10)/10:2.0;
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
  &&!(a.includes('鸡蛋')&&d.allergies?.egg)&&!(a.includes('大豆')&&d.allergies?.soy)&&!(a.includes('麸质')&&d.allergies?.gluten));
 if(!eligible.length)return null;
 // 偏好加权：与用户偏好匹配度越高，被选中的概率越大
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
 const tb=document.getElementById('dataset-table-body');if(!tb)return;
 // 如果 dishData 为空，最多重试 3 次（避免无限堆积）
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
 // 排序
 const sortVal=document.getElementById('menu-sort')?.value||'';
 if(sortVal==='popular')filtered.sort((a,b)=>(b.order_count||0)-(a.order_count||0));
 else if(sortVal==='rating')filtered.sort((a,b)=>parseFloat(b.rating)-parseFloat(a.rating));
 else if(sortVal==='price_asc')filtered.sort((a,b)=>parseFloat(a.price)-parseFloat(b.price));
 else if(sortVal==='price_desc')filtered.sort((a,b)=>parseFloat(b.price)-parseFloat(a.price));
 tb.innerHTML='';
 filtered.forEach(d=>{

// ═══════════════ 推荐逻辑 ═══════════════
  const r=document.createElement('tr');
  const tags=d.tags&&d.tags.length?d.tags.filter(t=>t!=='招牌'&&t!=='中辣'&&t!=='重辣'&&t!=='微辣'&&t!=='清爽'&&t!=='夏季限定').join(' '):'';
  const defaultImg='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23fdf6f0%22/%3E%3Ctext x=%2250%22 y=%2260%22 text-anchor=%22middle%22 font-size=%2236%22%3E🍜%3C/text%3E%3C/svg%3E';
  r.innerHTML='<td><img src="'+(d.image_url?esc(d.image_url):defaultImg)+'" style="width:50px;height:50px;border-radius:6px;object-fit:cover;" alt="'+esc(d.name)+'" loading="lazy" onerror="this.src=\''+defaultImg+'\'"></td><td>'+esc(d.category)+'</td><td>'+(d.tags&&d.tags.includes('招牌')?'⭐ ':'')+esc(d.name)+'</td><td>'+esc(d.spiciness)+'</td><td>'+esc(formatPrice(d.price))+'</td><td>'+esc(d.rating)+'</td><td>'+esc(tags)+'</td><td style="text-align:center;white-space:nowrap;"><button class="btn btn-sm btn-link add-to-cart-btn" data-id="'+d.id+'" style="text-decoration:none;font-size:1rem;padding:0 4px;color:#2e86c1;" title="加入购物车">🛒</button><button class="btn btn-sm btn-link" style="text-decoration:none;font-size:1rem;padding:0 4px;color:#e74c3c;" onclick="addToFavorites('+d.id+')" title="收藏">♥</button></td>';
  tb.appendChild(r);
 });
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
 const sp=$('spiciness'),sa=$('saltiness'),sw=$('sweetness'),pr=$('price'),ca=$('calorie'),re=$('religion'),rm=$('recommendation-mode');
 if(!sp||!sa||!sw||!pr||!ca||!re||!rm){showMessage('页面错误','偏好设置表单未完全加载');return;}
 userProfile={spiciness:sp.value,saltiness:sa.value,sweetness:sw.value,price:pr.value,calorie:ca.value,religion:re.value,allergies:[],recommendationMode:rm.value};
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

async function fetchRecommendations(isRefresh){
 console.group(isRefresh?'🔍刷新':'🔍推荐');
 const start=Date.now();
 const $=id=>document.getElementById(id);
 const rl=$('recommendation-loading'),rr=$('recommendation-result');
 if(!rl||!rr){showMessage('提示','页面加载中，请稍后重试');console.groupEnd();return;}

 // 等待菜品数据加载完成（最多等5秒）
 if(!dishData.length){
  for(let w=0;w<50;w++){
   await new Promise(r=>setTimeout(r,100));
   if(dishData.length)break;
  }
  if(!dishData.length){
   showMessage('提示','菜品数据加载中，请稍后重试');
   rl.classList.add('d-none');
   console.groupEnd();return;
  }
 }

 const prefs={'辣度':userProfile.spiciness,'咸淡':userProfile.saltiness,'甜酸':userProfile.sweetness,'价格区间':userProfile.price||'无','饮食_宗教':userProfile.religion==='无'?'无特殊要求':userProfile.religion,'allergies':userProfile.allergies||[],'calorie':userProfile.calorie||'无'};
 let blk=[];if(currentUser&&currentUser!=='guest'){const u=getUserData(currentUser);if(u)blk=u.blacklist||[];}

 let dishes=dishData.filter(d=>{
  if(d.is_active===false)return false;
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
 if(dishes.length<5){showMessage('提示','没有更多菜品啦！');$('recommendation-loading').classList.add('d-none');console.groupEnd();return;}

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
 checkApiAvailability().then(a=>{if(a)callAPI(dishes);else if(mode==='api'){showMessage('提示','API不可用，请切换为自动或本地模式');displayRecommendations();}else fallback(prefs,blk,dishes);});
}




// ═══════════════ 推荐结果渲染 ═══════════════
function displayRecommendations(){
 // 推荐完成，记录推荐次数
 fetch('/api/recommendation-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userType:currentUser==='guest'?'guest':currentUser?'user':'guest',userId:currentUser||'guest'})}).catch(()=>{});
 const $=id=>document.getElementById(id),loading=$('recommendation-loading'),result=$('recommendation-result');
 if(!loading||!result)return;
 const desc=currentRecommendationMode==='随机森林'?'(基于ML)':currentRecommendationMode==='决策树模型'?'(基于决策树)':'';
 result.innerHTML='<div style="background-color:#fdf2e9;border:2px solid #f5cba7;border-radius:8px;padding:15px;margin-bottom:20px;text-align:center"><p style="margin:0;color:#c0392b"><strong>当前使用：</strong>'+currentRecommendationMode+' '+desc+'</p></div><div class="mb-4"><h4 class="text-danger">为您推荐</h4><div class="list-group" id="dish-list"></div></div><div class="mt-5"><h4 class="text-danger">操作</h4><div class="row g-3 mt-3"><div class="col-md-4"><button class="btn btn-outline-primary w-100 py-2" id="refresh-recommendations"><i class="bi bi-arrow-repeat me-2"></i>换一批</button></div><div class="col-md-4"><button class="btn btn-outline-success w-100 py-2" id="end-recommendation"><i class="bi bi-check-circle me-2"></i>选好了</button></div><div class="col-md-4"><button class="btn btn-outline-danger w-100 py-2" id="end-logout-btn"><i class="bi bi-box-arrow-right me-2"></i>退出</button></div></div></div>';
 const old=result._delegateHandler;if(old)result.removeEventListener('click',old);
 const handler=e=>{const t=e.target.closest('button');if(!t)return;({'refresh-recommendations':()=>fetchRecommendations(true),'end-recommendation':()=>endRecommendation(),'end-logout-btn':()=>{resetRecommendation();showSection('home-section');}})[t.id]?.();};
 result.addEventListener('click',handler);result._delegateHandler=handler;
 let fav=[],blk=[];if(currentUser&&currentUser!=='guest'){const u=getUserData(currentUser);if(u){fav=u.favorites||[];blk=u.blacklist||[];}}
 let ordered=[];try{ordered=JSON.parse(localStorage.getItem('orderedDishes')||'[]')}catch(e){};
 const dl=$('dish-list');if(!dl)return;dl.innerHTML='';
 currentRecommendations.forEach((d,i)=>{
  const isFav=fav.includes(d.id),isBlk=blk.includes(d.id),isOrdered=ordered.includes(d.id);
  const tags=d.tags?d.tags.filter(t=>t!=='招牌'&&t!=='中辣'&&t!=='重辣'&&t!=='微辣'&&t!=='清爽'&&t!=='夏季限定').join(' '):'';
  const tagBadges=d.tags&&d.tags.includes('招牌')?'<span class="badge bg-warning me-1">⭐招牌</span>':'';
  const orderedBadge=isOrdered?'<span class="badge" style="background:#8b7a6a;color:#fff;font-size:0.7rem;">已点过</span> ':'';
  const blindBoxClass=d.type==='盲盒尝鲜'?'blind-box-card':'';
  dl.innerHTML+='<div class="list-group-item '+blindBoxClass+'"><div class="dish-info"><div class="dish-details flex-grow-1"><h5>'+(i+1)+'. '+tagBadges+orderedBadge+(d.type==='盲盒尝鲜'?'<span class="badge bg-info me-1">盲盒</span>':'')+esc(d.name)+'</h5><p class="mb-1">'+esc(d.category)+' · '+esc(d.spiciness)+' · '+esc(formatPrice(d.price))+(tags?' · '+esc(tags):'')+'</p><p class="dish-reason">'+esc(d.reason)+'</p>'+(d.matchIndex?'<p class="text-muted small">匹配指数：'+d.matchIndex.toFixed(2)+'（口味'+(d.matchDetails?.taste||0)+'+招牌'+(d.matchDetails?.cuisine||0)+'+营养'+(d.matchDetails?.nutrition||0)+'+评分'+(d.matchDetails?.rating||0)+'）</p>':'')+'<div class="dish-actions mt-2"><button class="btn btn-sm '+(isFav?'btn-success':'btn-outline-success')+' me-2" onclick="addToFavorites('+d.id+')"'+(isFav?' disabled':'')+'><i class="bi bi-heart'+(isFav?'-fill':'')+'"></i> '+(isFav?'已收藏':'收藏')+'</button><button class="btn btn-sm '+(isBlk?'btn-dark':'btn-outline-dark')+'" onclick="addToBlacklist('+d.id+')"'+(isBlk?' disabled':'')+'><i class="bi bi-x-circle'+(isBlk?'-fill':'')+'"></i> '+(isBlk?'已拉黑':'拉黑')+'</button><button class="btn btn-sm btn-outline-warning ms-2" onclick="openStarFeedback(currentRecommendations['+i+'])" style="border-color:#f1c40f;color:#f39c12;"><i class="bi bi-star"></i> 评分</button></div></div><div class="dish-score text-center ms-3">'+(d.type==='盲盒尝鲜'?'<div class="badge badge-blind rounded-pill mb-2">🎁</div><div class="text-muted small" style="font-size:0.7rem;">试试手气</div>':'<div class="badge bg-danger rounded-pill mb-2">'+(d.matchRate*100).toFixed(1)+'%</div><div class="text-muted small">匹配度</div>')+'</div></div></div>';
 });
 if(loading)loading.classList.add('d-none');if(result)result.classList.remove('d-none');
}


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
   return '<tr><td>'+(dish&&dish.image_url?'<img src="'+esc(dish.image_url||'')+'" alt="'+esc(dish.name||'菜品')+'" style="width:32px;height:32px;border-radius:4px;object-fit:cover;margin-right:8px;vertical-align:middle;" onerror="this.style.display=\'none\'">':'')+name+'</td>'
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
 const items=cart.map(x=>{const dish=dishData.find(d=>d.id===x.id);const p=parseFloat(x.price)||0;return{id:x.id,name:x.name,price:p,type:'购物车',matchRate:0.5,qty:x.qty||1};});
 const total=items.reduce((s,i)=>s+i.price*(i.qty||1),0);
 const uid=currentUser||'guest';
 fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({userId:uid,items,totalPrice:total})})
 .then(r=>r.json()).then(d=>{
  if(!d.success){showMessage('下单失败',d.error||'服务器错误');return;}
  // 下单成功后再清理本地数据
  let ordered=[];try{ordered=JSON.parse(localStorage.getItem('orderedDishes')||'[]')}catch(e){}
  cart.forEach(x=>{if(!ordered.includes(x.id))ordered.push(x.id);});
  try{localStorage.setItem('orderedDishes',JSON.stringify(ordered))}catch(e){};
  clearCart();
  showMessage('下单成功','您的订单已提交，感谢用餐！',function(){showSection('home-section');});
 }).catch(()=>showMessage('下单失败','网络错误，请稍后重试')).finally(()=>{const b=document.getElementById('cart-checkout-btn');if(b)b.disabled=false;});
}