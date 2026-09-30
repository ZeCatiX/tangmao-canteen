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
 const img=(d.image_url&&(d.image_url.startsWith('/')||d.image_url.startsWith('http'))?'<img src="'+esc(d.image_url)+'" style="width:160px;height:160px;border-radius:12px;object-fit:cover;margin-left:12px;vertical-align:middle;" alt="'+esc(d.name)+'" loading="lazy" onerror="this.src=\''+defaultImg+'\'">':(d.image_url?'<span class="dish-emoji" style="font-size:3.5rem;vertical-align:middle;margin-left:12px;">'+esc(d.image_url)+'</span>':''));
	 dl.innerHTML+='<div class="list-group-item '+blindBoxClass+'"><div class="dish-info"><div class="dish-details flex-grow-1"><h5>'+(i+1)+'. '+tagBadges+orderedBadge+(d.type==='盲盒尝鲜'?'<span class="badge bg-info me-1">盲盒</span>':'')+esc(d.name)+img+'</h5>'+'<p class="mb-1">'+esc(d.category)+' · '+esc(d.spiciness)+' · '+esc(formatPrice(d))+(tags?' · '+esc(tags):'')+'</p><p class="dish-reason">'+esc(d.reason)+'</p>'+((d.type!=='盲盒尝鲜'||(d.type==='盲盒尝鲜'&&d.blindMode==='smart'))&&isFinite(d.matchIndex)?'<p class="text-muted small">匹配指数：'+d.matchIndex.toFixed(2)+'（口味'+(d.matchDetails?.taste||0)+'+招牌'+(d.matchDetails?.cuisine||0)+'+热量'+(d.matchDetails?.calorie||0)+'+价格'+(d.matchDetails?.price||0)+'+评分'+(d.matchDetails?.rating||0)+'）</p>':'<p class="text-muted small">匹配指数：— —</p>')+'<div class="dish-actions mt-2">'+renderRecipeCartBtn(d,cart)+'<button class="btn btn-sm '+(isFav?'btn-success':'btn-outline-success')+' me-2" onclick="addToFavorites('+d.id+')"'+(isFav?' disabled':'')+'><i class="bi bi-heart'+(isFav?'-fill':'')+'"></i> '+(isFav?'已收藏':'收藏')+'</button><button class="btn btn-sm '+(isBlk?'btn-dark':'btn-outline-dark')+'" onclick="addToBlacklist('+d.id+')"'+(isBlk?' disabled':'')+'><i class="bi bi-x-circle'+(isBlk?'-fill':'')+'"></i> '+(isBlk?'已拉黑':'拉黑')+'</button><button class="btn btn-sm btn-outline-warning ms-2" onclick="openStarFeedback(currentRecommendations['+i+'])" style="border-color:#f1c40f;color:#f39c12;"><i class="bi bi-star"></i> 评分</button></div></div><div class="dish-score text-center ms-3">'+(d.type==='盲盒尝鲜'&&d.blindMode==='random'?'<div class="badge badge-blind rounded-pill mb-2">🎁</div><div class="text-muted small" style="font-size:0.7rem;">试试手气</div>':'<div class="badge bg-danger rounded-pill mb-2">'+matchRatePct+'%</div><div class="text-muted small">匹配度</div>')+'</div></div></div>';
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
     +'<div class="dish-name-serif">'+esc(d.name)+'<span class="ms-2" style="font-size:0.73rem;color:var(--text-light);">'+esc(d.category)+' · '+esc(d.spiciness)+(d.serving?' · '+esc(d.serving):'')+'</span></div>'
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
     +'<div class="dish-name-serif">'+esc(d.name)+'<span class="ms-2" style="font-size:0.72rem;color:var(--gold);border:1px solid rgba(201,169,110,0.5);border-radius:10px;padding:1px 8px;">默认按人数 · 可自由加减</span></div>'
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
   return '<div class="d-flex align-items-center gap-2 py-2" style="border-bottom:1px solid rgba(201,169,110,0.14);">'
    +dishImg(c.image,52,c.name)
    +'<div class="flex-grow-1" style="min-width:0;">'
     +'<div class="dish-name-serif">🍹 '+esc(c.name)+'<span class="ms-2" style="font-size:0.73rem;color:var(--text-light);">已选饮品</span></div>'
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

