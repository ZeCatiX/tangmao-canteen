// 推荐逻辑模块
async function fetchRecommendations(isRefresh){
 // console.group(isRefresh?'🔍刷新':'🔍推荐');
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

 const up=userProfile||{};const prefs={'辣度':up.spiciness||'','咸淡':up.saltiness||'','甜酸':up.sweetness||'','价格区间':up.price||'无','饮食_宗教':up.religion==='无'?'无特殊要求':up.religion||'无','allergies':up.allergies||[],'calorie':up.calorie||'无'};
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
// console.log('🔄本地推荐');const start=Date.now();await loadDecisionTreeModel();
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
  &&!(a.includes('鸡蛋')&&d.allergies?.egg)&&!(a.includes('大豆')&&d.allergies?.soy)&&!(a.includes('麸质')&&d.allergies?.gluten));
 if(eligible.length){const bd=eligible[Math.floor(Math.random()*eligible.length)];bd.reason='🔮 盲盒推荐：试试这个吧，说不定有惊喜！';bd.type='盲盒尝鲜';bd.matchIndex=0;bd.matchRate=0.5;top.push(bd);}
 currentRecommendations=top;top.forEach(d=>{if(!recommendedIds.includes(d.id))recommendedIds.push(d.id);});
 currentRecommendationMode='决策树模型';displayRecommendations();
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
 result.innerHTML='<div style="background-color:#fdf2e9;border:2px solid #f5cba7;border-radius:8px;padding:15px;margin-bottom:20px;text-align:center"><p style="margin:0;color:#c0392b"><strong>当前使用：</strong>'+currentRecommendationMode+' '+desc+'</p></div><div class="mb-4"><h4 class="text-danger">为您推荐</h4><div class="list-group" id="dish-list"></div></div><div class="mt-5"><h4 class="text-danger">操作</h4><div class="row g-3 mt-3"><div class="col-md-4"><button class="btn btn-outline-primary w-100 py-2" id="refresh-recommendations"><i class="bi bi-arrow-repeat me-2"></i>换一批</button></div><div class="col-md-4"><button class="btn btn-outline-success w-100 py-2" id="end-recommendation"><i class="bi bi-check-circle me-2"></i>选好了</button></div><div class="col-md-4"><button class="btn btn-outline-danger w-100 py-2" id="end-logout-btn"><i class="bi bi-box-arrow-right me-2"></i>退出</button></div></div></div>';
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
  const orderedBadge=isOrdered?'<span class="badge" style="background:#8b7a6a;color:#fff;font-size:0.7rem;">已点过</span> ':'';
  const blindBoxClass=d.type==='盲盒尝鲜'?'blind-box-card':'';
  const defaultImg='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23fdf6f0%22/%3E%3Ctext x=%2250%22 y=%2260%22 text-anchor=%22middle%22 font-size=%2236%22%3E🍜%3C/text%3E%3C/svg%3E';
  const matchRatePct=isFinite(d.matchRate)?(d.matchRate*100).toFixed(1):'0';
 dl.innerHTML+='<div class="list-group-item '+blindBoxClass+'"><div class="dish-info"><div class="dish-details flex-grow-1"><h5>'+(i+1)+'. '+tagBadges+orderedBadge+(d.type==='盲盒尝鲜'?'<span class="badge bg-info me-1">盲盒</span>':'')+esc(d.name)+'<img src="'+(d.image_url?esc(d.image_url):defaultImg)+'" style="width:80px;height:80px;border-radius:8px;object-fit:cover;margin-left:12px;vertical-align:middle;" alt="'+esc(d.name)+'" loading="lazy" onerror="this.src=\''+defaultImg+'\'">'+'</h5>'+'<p class="mb-1">'+esc(d.category)+' · '+esc(d.spiciness)+' · '+esc(formatPrice(d.price))+(tags?' · '+esc(tags):'')+'</p><p class="dish-reason">'+esc(d.reason)+'</p>'+(isFinite(d.matchIndex)?'<p class="text-muted small">匹配指数：'+d.matchIndex.toFixed(2)+'（口味'+(d.matchDetails?.taste||0)+'+招牌'+(d.matchDetails?.cuisine||0)+'+营养'+(d.matchDetails?.nutrition||0)+'+评分'+(d.matchDetails?.rating||0)+'）</p>':'')+'<div class="dish-actions mt-2"><button class="btn btn-sm btn-outline-success me-1 add-to-cart-btn" data-id="'+d.id+'" data-name="'+esc(d.name)+'" data-price="'+(d.price!==null&&d.price!==undefined?d.price:'')+'" data-image="'+esc(d.image_url||'')+'" style="border-color:#27ae60;color:#27ae60;"><i class="bi bi-cart-plus"></i> 加入</button><button class="btn btn-sm '+(isFav?'btn-success':'btn-outline-success')+' me-2" onclick="addToFavorites('+d.id+')"'+(isFav?' disabled':'')+'><i class="bi bi-heart'+(isFav?'-fill':'')+'"></i> '+(isFav?'已收藏':'收藏')+'</button><button class="btn btn-sm '+(isBlk?'btn-dark':'btn-outline-dark')+'" onclick="addToBlacklist('+d.id+')"'+(isBlk?' disabled':'')+'><i class="bi bi-x-circle'+(isBlk?'-fill':'')+'"></i> '+(isBlk?'已拉黑':'拉黑')+'</button><button class="btn btn-sm btn-outline-warning ms-2" onclick="openStarFeedback(currentRecommendations['+i+'])" style="border-color:#f1c40f;color:#f39c12;"><i class="bi bi-star"></i> 评分</button></div></div><div class="dish-score text-center ms-3">'+(d.type==='盲盒尝鲜'?'<div class="badge badge-blind rounded-pill mb-2">🎁</div><div class="text-muted small" style="font-size:0.7rem;">试试手气</div>':'<div class="badge bg-danger rounded-pill mb-2">'+matchRatePct+'%</div><div class="text-muted small">匹配度</div>')+'</div></div></div>';
 });
 loading.classList.add('d-none');result.classList.remove('d-none');
}


// ═══════════════ 评分反馈 ═══════════════
