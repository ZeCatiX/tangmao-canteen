
// ═══════════════ 全局变量与工具函数 ═══════════════
// 唐猫庭院 - 菜品推荐系统 v2.0
var currentUser=null,userProfile=null,currentRecommendations=[],recommendedIds=[];
var currentRecommendationMode='本地计算'; var featureImportanceChart=null;
var decisionTreeModel=null,decisionTreeLoaded=false,decisionTreeLoading=false;
var apiAvailabilityCache=null,apiCacheTimestamp=0;
var dishData=[];  // 菜品数据，从API加载
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
 const onEnd=document.getElementById('end-section')?.classList.contains('active');
 const onCart=document.getElementById('cart-section')?.classList.contains('active');
 if(c>0&&!onEnd&&!onCart){bar.style.display='flex';document.getElementById('float-cart-count').textContent=c;document.getElementById('float-cart-total').textContent=getCartTotal();}
 else bar.style.display='none';
}


