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
  .then(res=>res.json()).then(d=>{apiAvailabilityCache=!!(d&&d.ready);apiCacheTimestamp=now;if(!apiAvailabilityCache)console.warn('[推荐] ML未就绪(worker加载中), 本次使用本地推荐');r(apiAvailabilityCache);})
  .catch(()=>{apiAvailabilityCache=null;apiCacheTimestamp=0;console.warn('[推荐] ML健康检查失败, 本次使用本地推荐');r(false);}).finally(()=>clearTimeout(t));
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
 banner.innerHTML='<i class="bi bi-info-circle me-2"></i>'+(menuLang==='en'?(c.total-c.declared)+' taste preferences not set — complete them for better matches.':'还有 '+(c.total-c.declared)+' 项口味偏好未设置，补全后推荐更贴合你的口味。')
  +'<a href="#" class="alert-link ms-1" id="pref-completeness-goto">'+(menuLang==='en'?'Complete them →':'去补全 →')+'</a>'
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
  const u=getUserData(currentUser);if(currentUser&&currentUser!=='guest'&&u&&u.preferences)loadUserPreferences(u.preferences);else resetPreferenceForm();
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
 {cat:'主食',emoji:'🍚',tab:'',icon:'assets/icons/cat-staple.webp'},
 {cat:'招牌与游西安必打卡',emoji:'🏆',tab:'招牌',icon:'assets/icons/cat-signature.webp'},
 {cat:'热销菜品',emoji:'🔥',tab:'热销',icon:'assets/icons/cat-hot.webp'},
 {cat:'传承陕菜',emoji:'🍲',tab:'陕菜',icon:'assets/icons/cat-heritage.webp'},
 {cat:'江湖海鲜',emoji:'🦐',tab:'海鲜',icon:'assets/icons/cat-seafood.webp'},
 {cat:'田园时蔬·汤羹',emoji:'🥬',tab:'蔬羹',icon:'assets/icons/cat-veggies.webp'},
 {cat:'特色凉菜',emoji:'🥗',tab:'凉菜',icon:'assets/icons/cat-cold.webp'},
 {cat:'陕西小吃',emoji:'🥟',tab:'小吃',icon:'assets/icons/cat-snacks.webp'},
 {cat:'飲品与酒水',emoji:'🍹',tab:'饮品',icon:'assets/icons/cat-drinks.webp'}
];
function catOrderOf(cat){const i=CATEGORY_CONFIG.findIndex(c=>c.cat===cat);return i===-1?999:i;}
function catEmojiOf(cat){const m=CATEGORY_CONFIG.find(c=>c.cat===cat);return m?m.emoji:'🍽';}
function catIconOf(cat){const m=CATEGORY_CONFIG.find(c=>c.cat===cat);return m&&m.icon?'<img src="'+m.icon+'" alt="" loading="lazy" style="width:22px;height:22px;border-radius:50%;vertical-align:-5px;margin-right:6px;box-shadow:0 1px 3px rgba(139,0,0,.25);">':catEmojiOf(cat)+' ';}
function catTabLabelOf(cat){const m=CATEGORY_CONFIG.find(c=>c.cat===cat);const tab=m&&m.tab?m.tab:cat;return menuLang==='en'&&TAB_EN[tab]?TAB_EN[tab]:tab;}
// 从菜品实际分类生成分类 UI；分类集合变化时自动重建并保留当前选中
function buildCategoryUI(){
 const cats=[...new Set(dishData.map(d=>d.category).filter(Boolean))].sort((a,b)=>catOrderOf(a)-catOrderOf(b)||a.localeCompare(b,'zh'));
 const key=cats.join('|');
 const tabs=document.getElementById('category-tabs');
 if(tabs&&tabs.dataset.cats!==key){
  const cur=(tabs.querySelector('.cat-tab.active')||{dataset:{}}).dataset.cat||'';
  tabs.innerHTML='<button class="btn btn-sm cat-tab" data-cat="" style="border-radius:20px;padding:4px 14px;font-size:0.82rem;">'+(menuLang==='en'?'All':'全部')+'</button>'
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
  sel.innerHTML='<option value="">'+(menuLang==='en'?'All categories':'全部分类')+'</option>'+cats.map(c=>'<option value="'+esc(c)+'">'+esc(catNameOf(c))+'</option>').join('');
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
  +'<p style="color:#8b7a6a;font-size:0.85rem;">'+esc(catNameOf(d.category))+' · '+esc(menuLang==='en'?(SPICE_EN[d.spiciness]||d.spiciness):d.spiciness)+' · '+(menuLang==='en'?('Salt '+(SALT_EN[d.saltiness]||d.saltiness)+' · Sweet-sour '+(SWEET_EN[d.sweetness]||d.sweetness)+' · Calories '+(CAL_EN[d.calorie]||d.calorie||'Unknown')):('咸淡'+esc(d.saltiness)+' · 甜酸'+esc(d.sweetness)+' · 热量'+esc(d.calorie||'未知')))+'</p>'
  +(menuLang==='en'&&d.description_en?'<p style="font-size:0.9rem;color:var(--text);">'+esc(d.description_en)+'</p>':'')
  +(d.description?'<p style="font-size:0.9rem;">'+esc(d.description)+'</p>':'')
  +'<div style="font-size:1.2rem;color:var(--primary);font-weight:700;margin:6px 0;">'+esc(formatPrice(d))+'</div>'
  +specs
  +(alTags?'<div style="margin:10px 0;"><div style="font-size:0.8rem;color:#8b7a6a;margin-bottom:4px;">'+(menuLang==='en'?'Allergens':'含过敏源')+'</div>'+alTags+'</div>':'')
  +'<div style="margin-top:10px;font-size:0.8rem;color:#8b7a6a;">'+(d.is_sold_out===true?(menuLang==='en'?'⚠ Sold out today':'⚠ 今日已售罄'):(menuLang==='en'?'✅ Orderable now':'✅ 可正常点餐'))+(d.serving?' · '+esc(specLang(d.serving)):'')+'</div>'
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
   html+='<div class="dish-cat-sep">'+catIconOf(d.category)+esc(catNameOf(d.category))+'</div>';
  }
  // 飲品与酒水二级分隔
  if(d.category==='飲品与酒水'){
   const sub=d.tags&&d.tags.find(t=>SUBS.includes(t));
   if(sub&&sub!==lastSub){
    lastSub=sub;
    html+='<div class="dish-sub-sep">'+(SUB_EMOJI[sub]||'·')+' '+esc(menuLang==='en'?(SUB_EN[sub]||sub):sub)+'</div>';
   }
  }
  const ci=cart.find(c=>c.id===d.id);
  const qty=ci?(ci.qty||1):0;
  const defaultImg='/assets/illustrations/missing-dish-cat.webp';
  const imgUrl=d.image_url&&(d.image_url.startsWith('/')||d.image_url.startsWith('http'))?(function(){const src=esc(d.image_url);const thumb=d.image_url.startsWith('/uploads/')&&!d.image_url.includes('thumbs/')?('/uploads/thumbs/'+d.image_url.split('/').pop().replace(/\.[^.]+$/,'')+'.webp'):src;return '<img src="'+thumb+'" style="width:100%;height:160px;border-radius:10px;object-fit:cover;" alt="'+esc(d.name)+'" loading="lazy" onerror="if(this.src.indexOf(\'/thumbs/\')>-1){this.src=\''+src+'\';}else{this.onerror=null;this.src=\''+defaultImg+'\';}">';})():(d.image_url?'<span class="dish-emoji" style="font-size:4rem;display:flex;align-items:center;justify-content:center;height:160px;">'+esc(d.image_url)+'</span>':'');
  const star=d.tags&&d.tags.includes('招牌')?'<span class="badge" style="background:var(--primary-accent);color:#fff;font-size:0.65rem;">'+(menuLang==='en'?'Signature':'招牌')+'</span> ':'';
  // 价格+加购区: 有规格变体时逐规格一行(各带加购), 否则单行
  const unitLabel=d=>{const u=(d.price_unit||'/份').replace(/^\//,'');return menuLang==='en'?((UNIT_EN['/'+u]||('/'+u)).replace(/^\//,'')):u;};
  // 规格行标签: 口味类取名字括号后缀(原味/芥末味/壶/年份), 其余退回单位(盖碗/6只)
  const specLabel=d2=>{ if(d2._flavorLabel)return d2._flavorLabel; const m=String(d2.name||'').match(/\(([^()]+)\)$/); return m?m[1]:unitLabel(d2); };
  const specRow=d2=>{
   const c2=cart.find(c=>c.id===d2.id);const q2=c2?(c2.qty||1):0;
   const so=d2.is_sold_out===true;
   const ctrl=so?'<span style="font-size:0.8rem;color:#b3261e;background:rgba(179,38,30,0.08);padding:3px 10px;border-radius:10px;white-space:nowrap;">已售罄</span>':(q2>0?'<span class="d-inline-flex align-items-center gap-1"><button class="btn btn-sm btn-outline-secondary cart-qty-minus" data-id="'+d2.id+'" style="padding:2px 8px;border-radius:6px;font-weight:700;">－</button><span style="font-weight:700;min-width:20px;text-align:center;">'+q2+'</span><button class="btn btn-sm btn-outline-success cart-qty-plus add-to-cart-btn" data-id="'+d2.id+'" style="padding:2px 8px;border-radius:6px;font-weight:700;">＋</button></span>':'<button class="btn btn-sm add-to-cart-btn" data-id="'+d2.id+'" style="background:var(--primary);color:#fff;border:none;border-radius:6px;padding:2px 12px;font-weight:600;white-space:nowrap;">＋ 加入</button>');
   return '<div class="d-flex justify-content-between align-items-center" style="margin-top:4px;gap:6px;'+(so?'opacity:0.65;':'')+'"><span style="font-size:0.85rem;color:var(--text-light);white-space:nowrap;">'+esc(specLang(specLabel(d2)))+'</span><span style="display:inline-flex;align-items:center;gap:8px;"><strong style="color:var(--primary);font-size:1rem;white-space:nowrap;'+(so?'text-decoration:line-through;':'')+'">'+esc(formatPrice(d2))+'</strong>'+ctrl+'</span></div>';
  };
  let priceBlock;
  if(d._variants&&d._variants.length){
   priceBlock='<div style="margin-top:6px;">'+specRow(d)+d._variants.map(v=>specRow(v)).join('')+'</div>';
  }else if(d.is_sold_out===true){
   priceBlock='<div class="d-flex justify-content-between align-items-center" style="margin-top:6px;opacity:0.75;"><span style="font-size:0.85rem;color:#b3261e;background:rgba(179,38,30,0.08);padding:3px 10px;border-radius:10px;">今日已售罄</span><strong style="color:var(--text-light);font-size:1.05rem;text-decoration:line-through;">'+esc(formatPrice(d))+'</strong></div>';
  }else{
   priceBlock='<div class="d-flex justify-content-between align-items-center"><strong style="color:var(--primary);font-size:1.05rem;">'+esc(formatPrice(d))+'</strong>'+(qty>0?'<div class="d-flex align-items-center gap-1"><button class="btn btn-sm btn-outline-secondary cart-qty-minus" data-id="'+d.id+'" style="padding:2px 8px;border-radius:6px;font-weight:700;">－</button><span style="font-weight:700;min-width:20px;text-align:center;">'+qty+'</span><button class="btn btn-sm btn-outline-success cart-qty-plus add-to-cart-btn" data-id="'+d.id+'" style="padding:2px 8px;border-radius:6px;font-weight:700;">＋</button></div>':'<button class="btn btn-sm add-to-cart-btn" data-id="'+d.id+'" style="background:var(--primary);color:#fff;border:none;border-radius:6px;padding:4px 14px;font-weight:600;">＋ 加入</button>')+'</div>';
  }
  html+='<div class="dish-card"'+(d.is_sold_out===true&&!d._variants?' style="opacity:0.6;"':'')+'>'+imgUrl+'<div class="dish-card-body"><h6 style="font-family:Noto Serif SC,serif;font-weight:600;margin:8px 0 4px;cursor:pointer;" onclick="showDishDetail('+d.id+')" title="查看详情">'+(d.is_sold_out===true&&!d._variants?'<span style="background:#8f2318;color:#fff;font-size:0.65rem;padding:1px 6px;border-radius:4px;margin-right:4px;">'+(menuLang==='en'?'Sold out':'已售罄')+'</span>':'')+star+esc(dishNameOf(d))+'</h6><p style="font-size:0.78rem;color:var(--text-light);margin:0 0 8px;">'+esc(catNameOf(d.category))+' · '+esc(menuLang==='en'?(SPICE_EN[d.spiciness]||d.spiciness):d.spiciness)+(d.serving?' · <span style="color:#e67e22;">'+esc(specLang(d.serving))+'</span>':'')+'</p>'+priceBlock+'</div></div>';
 });
 if(!filtered.length){
  // 空态: 搜索/筛选无结果时给出明确反馈与引导
  const kw=q?esc(q):'';
  const hint=q?(menuLang==='en'?('The cat looked everywhere — no "'+kw+'" on the menu'):'唐猫找了一圈，没有找到「'+kw+'」'):(menuLang==='en'?'No dishes match the current filters':'当前筛选条件下没有菜品');
  container.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px 16px;color:var(--text-light);">'
   +'<img src="/assets/illustrations/search-empty-cat.webp" alt="唐猫拿着放大镜在菜单里寻找" style="width:240px;display:block;margin:0 auto 10px;border-radius:12px;">'
   +'<p style="font-size:1.05rem;color:var(--ink);margin:0 0 6px;">'+hint+'</p>'
   +'<p style="font-size:0.85rem;margin:0;">'+(menuLang==='en'?'Try another keyword, or reset the filters':'换个关键词，或清除筛选条件再试试')+'</p>'
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
 if(prefs.recommendationMode){const m=prefs.recommendationMode;const norm=['auto','api','local'].includes(m)?m:(m.indexOf('本地')>=0?'local':m.indexOf('API')>=0?'api':'');if(norm)setVal('recommendation-mode',norm);}
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
 userProfile={spiciness:'无所谓',saltiness:'无所谓',sweetness:'无所谓',price:'不限',calorie:'不限',religion:'无特殊要求',allergies:[],recommendationMode:'local',blindBoxMode:'smart',coldStart:true};
 showSection('recommendation-section');
 const rl=$('recommendation-loading'),rr=$('recommendation-result');
 if(rl)rl.classList.add('d-none');
 if(rr)rr.classList.remove('d-none');
 const hot=dishData
  .filter(d=>d.is_active!==false&&d.is_sold_out!==true&&d.category!=='飲品与酒水'&&d.category!=='主食')
  .sort((a,b)=>(b.order_count||0)-(a.order_count||0)).slice(0,6)
  .map(d=>Object.assign({},d,{reason:'本店人气招牌，最近大家都在点',matchRate:0.5,matchIndex:0.5,hasTasteSignal:false,type:'热门推荐'}));
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
 currentUser=null;localStorage.removeItem('currentUser');localStorage.removeItem('userToken');localStorage.removeItem('prefCompletenessDismissed');localStorage.removeItem('savedPrefs');
 if(typeof resetPreferenceForm==='function')resetPreferenceForm();resetRecommendation();const pi=document.getElementById('nav-profile-item'),nu=document.getElementById('nav-user');if(pi)pi.classList.add('d-none');if(nu)nu.classList.remove('d-none');const hlb=document.getElementById('login-btn'),hrb=document.getElementById('register-btn');if(hlb)hlb.classList.remove('d-none');if(hrb)hrb.classList.remove('d-none');const vcbG=document.getElementById('view-cached-btn');if(vcbG)vcbG.classList.add('d-none');if(window.updateHomeButtons)window.updateHomeButtons();showMessage('已退出',msg,function(){showSection('home-section');});}
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
  return '<div style="border-left:2px solid '+(cur?'var(--gold)':'rgba(201,169,110,0.25)')+';padding-left:10px;margin-bottom:12px;opacity:'+(cur?1:0.6)+';"><div style="font-size:0.8rem;font-weight:600;color:'+(cur?'var(--gold)':'var(--text-light)')+';padding-bottom:3px;">● '+roundLabelLang(r.label||('第'+(r.round||o.i+1)+'轮'))+(cur?(menuLang==='en'?' ← current':' ← 当前轮'):' · '+(r.time||''))+'</div>'
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
function tableLabel(t){
 if(menuLang==='en')return t==='打包'?'Takeaway':(t?'Table '+t:'');
 return t==='打包'?'打包带走':(t?t+' 号桌':'');
}
function updateTableStatusCard(){
 const t=ssGet('lockedTable')||'';
 const txt=document.getElementById('table-status-text');
 const btn=document.getElementById('table-change-btn');
 if(txt)txt.textContent=t?tableLabel(t):uiText('table_none');
 if(btn)btn.textContent=t?uiText('table_change'):uiText('table_pick');
 const ti=document.getElementById('cart-table-number');
 if(ti){ti.value=t==='打包'?'打包':(t||'');ti.readOnly=!!t;ti.placeholder=t?'':'选择桌号';ti.style.background=t?'var(--cream-dark)':'';}
 const pt=document.getElementById('pref-table-number');
 if(pt){pt.value=t==='打包'?'打包':(t||'');pt.readOnly=!!t;pt.placeholder=t?'':'选择桌号';pt.style.background=t?'var(--cream-dark)':'';}
}
var _tablePickIntent=null;
// AI选菜入口的唯一判定源：已声明偏好的老用户进偏好表单微调，新客/未填偏好直达热门Top6（B7冷启动）。
// 首页按钮和"选完桌号后续路由"都走这里——之前选桌分支硬编码跳偏好表单，把冷启动整个绕过（回归修复）。
function openAIRecommend(){
 if(!currentUser)currentUser='guest';
 const prefs=currentUser!=='guest'?(getUserData(currentUser)||{}).preferences:null;
 const filled=(prefs&&Object.keys(prefs).length>0)||sessionStorage.getItem('tasteFilled')==='1';
 if(filled)showSection('preference-section');else coldStartHotRecommend();
}
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
 else if(intent==='ai')openAIRecommend();
 else if(intent==='table'){prefillTableBuilder();showSection('table-builder-section');}
 else if(intent==='checkout')checkoutCart();
}
// 本桌账单（免登录，凭签名桌码只读查看）
function showTableBill(){
 const t=ssGet('tableToken')||'';
 if(!t){showMessage('提示','请扫描餐桌上的二维码');return;}
 const box=document.getElementById('table-bill-body');
 const title=document.getElementById('table-bill-title');
 if(box)box.innerHTML='<div class="text-center py-4" style="color:var(--text-light);">'+(menuLang==='en'?'Loading...':'加载中...')+'</div>';
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
   const name=dish?esc(dishNameOf(dish)):esc(x.name);
   const unit=dish&&dish.price_unit?'<span style="font-size:0.75rem;color:var(--text-light);margin-left:4px;">'+esc(menuLang==='en'?(UNIT_EN[dish.price_unit]||dish.price_unit):dish.price_unit)+'</span>':'';
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
 // 备注兜底：以结算时刻输入框的实际值为准——备注平时靠 change(失焦)事件保存，
 // 自动填充/部分移动键盘收起不触发 blur 会静默丢备注，结算前从 DOM 收口一次
 document.querySelectorAll('.cart-note-input').forEach(inp=>{
  const it=cart.find(c=>c.id===parseInt(inp.dataset.id));
  if(it)it.note=String(inp.value||'').trim().slice(0,30);
 });
 saveCart(cart);
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
