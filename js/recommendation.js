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
 currentRecommendationMode='决策树模型';console.log('🍽️决策树推荐 '+top.length+'个菜品,耗时'+(Date.now()-start)/1000+'s');console.log('📊排名:',top.slice(0,5).map((d,i)=>(i+1)+'.'+d.name+'('+Math.round((d.matchIndex||0)*100)+'%)').join('  '));if(top.find(d=>d.type==='盲盒尝鲜'))console.log('🎁盲盒:'+top.find(d=>d.type==='盲盒尝鲜').name);console.groupEnd();displayRecommendations();
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
function displayRecommendations(){
 // 推荐完成，记录推荐次数
 safeFetch('/api/recommendation-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userType:currentUser==='guest'?'guest':currentUser?'user':'guest',userId:currentUser||'guest'})}).catch(()=>{});
 // 缓存推荐结果到 localStorage（仅登录用户，键按用户隔离；游客不缓存）
 try { if(currentUser&&currentUser!=='guest'){localStorage.setItem('cachedRecommendations_'+currentUser, JSON.stringify(currentRecommendations)); localStorage.setItem('cachedRecMode_'+currentUser, currentRecommendationMode);} } catch(e) {}
 const $=id=>document.getElementById(id),loading=$('recommendation-loading'),result=$('recommendation-result');
 if(!loading||!result)return;
 const desc=currentRecommendationMode==='机器学习'?'(基于ML)':currentRecommendationMode==='决策树模型'?'(基于决策树)':'';
 const _rice=dishData.find(d=>d.name==='五常大米饭');
 result.innerHTML='<div style="background-color:#fdf2e9;border:2px solid #f5cba7;border-radius:8px;padding:15px;margin-bottom:20px;text-align:center"><p style="margin:0;color:#c0392b"><strong>当前使用：</strong>'+currentRecommendationMode+' '+desc+'</p></div><div class="mb-4"><h4 class="text-danger">为您推荐</h4><div class="list-group" id="dish-list"></div></div><div class="mt-3 p-3 rounded-3" style="background:linear-gradient(135deg,#fdf6f0,#f5ebe0);border:1px solid rgba(201,169,110,0.2);"><div class="d-flex align-items-center justify-content-between"><div><span style="font-size:1.5rem;">🍚</span> <strong>五常大米饭</strong> <small style="color:var(--text-light);">3元/碗</small></div><button class="btn btn-sm btn-outline-success add-to-cart-btn" id="add-rice-btn" data-id="'+(_rice?_rice.id:'')+'"><i class="bi bi-plus-circle me-1"></i>加一碗米饭</button></div></div></div><div class="mt-5"><h4 class="text-danger">操作</h4><div class="row g-3 mt-3"><div class="col-md-4"><button class="btn btn-outline-primary w-100 py-2" id="refresh-recommendations"><i class="bi bi-arrow-repeat me-2"></i>换一批</button></div><div class="col-md-4"><button class="btn btn-outline-success w-100 py-2" id="end-recommendation"><i class="bi bi-check-circle me-2"></i>选好了</button></div><div class="col-md-4"><button class="btn btn-outline-danger w-100 py-2" id="end-logout-btn"><i class="bi bi-box-arrow-right me-2"></i>退出</button></div></div></div>';
 const old=result._delegateHandler;if(old)result.removeEventListener('click',old);
 const handler=e=>{const t=e.target.closest('button');if(!t)return;({'refresh-recommendations':()=>fetchRecommendations(true),'end-recommendation':()=>endRecommendation(),'end-logout-btn':()=>{resetRecommendation();showSection('home-section');}})[t.id]?.();};
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
 const img=(d.image_url&&(d.image_url.startsWith('/')||d.image_url.startsWith('http'))?'<img src="'+esc(d.image_url)+'" style="width:160px;height:160px;border-radius:12px;object-fit:cover;margin-left:12px;vertical-align:middle;" alt="'+esc(d.name)+'" loading="lazy" onerror="this.src=\''+defaultImg+'\'">':(d.image_url?'<span style="font-size:3.5rem;vertical-align:middle;margin-left:12px;">'+esc(d.image_url)+'</span>':''));
	 dl.innerHTML+='<div class="list-group-item '+blindBoxClass+'"><div class="dish-info"><div class="dish-details flex-grow-1"><h5>'+(i+1)+'. '+tagBadges+orderedBadge+(d.type==='盲盒尝鲜'?'<span class="badge bg-info me-1">盲盒</span>':'')+esc(d.name)+img+'</h5>'+'<p class="mb-1">'+esc(d.category)+' · '+esc(d.spiciness)+' · '+esc(formatPrice(d.price))+(tags?' · '+esc(tags):'')+'</p><p class="dish-reason">'+esc(d.reason)+'</p>'+((d.type!=='盲盒尝鲜'||(d.type==='盲盒尝鲜'&&d.blindMode==='smart'))&&isFinite(d.matchIndex)?'<p class="text-muted small">匹配指数：'+d.matchIndex.toFixed(2)+'（口味'+(d.matchDetails?.taste||0)+'+招牌'+(d.matchDetails?.cuisine||0)+'+热量'+(d.matchDetails?.calorie||0)+'+价格'+(d.matchDetails?.price||0)+'+评分'+(d.matchDetails?.rating||0)+'）</p>':'<p class="text-muted small">匹配指数：— —</p>')+'<div class="dish-actions mt-2">'+renderRecipeCartBtn(d,cart)+'<button class="btn btn-sm '+(isFav?'btn-success':'btn-outline-success')+' me-2" onclick="addToFavorites('+d.id+')"'+(isFav?' disabled':'')+'><i class="bi bi-heart'+(isFav?'-fill':'')+'"></i> '+(isFav?'已收藏':'收藏')+'</button><button class="btn btn-sm '+(isBlk?'btn-dark':'btn-outline-dark')+'" onclick="addToBlacklist('+d.id+')"'+(isBlk?' disabled':'')+'><i class="bi bi-x-circle'+(isBlk?'-fill':'')+'"></i> '+(isBlk?'已拉黑':'拉黑')+'</button><button class="btn btn-sm btn-outline-warning ms-2" onclick="openStarFeedback(currentRecommendations['+i+'])" style="border-color:#f1c40f;color:#f39c12;"><i class="bi bi-star"></i> 评分</button></div></div><div class="dish-score text-center ms-3">'+(d.type==='盲盒尝鲜'&&d.blindMode==='random'?'<div class="badge badge-blind rounded-pill mb-2">🎁</div><div class="text-muted small" style="font-size:0.7rem;">试试手气</div>':'<div class="badge bg-danger rounded-pill mb-2">'+matchRatePct+'%</div><div class="text-muted small">匹配度</div>')+'</div></div></div>';
 });
 loading.classList.add('d-none');result.classList.remove('d-none');
}


// ═══════════════ 评分反馈 ═══════════════
