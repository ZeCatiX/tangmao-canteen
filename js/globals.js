
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
function escapeAttr(str){return esc(String(str)).replace(/&quot;/g,'&#34;').replace(/&#39;/g,'&#x27;');}
// 价格格式化：数字 → "88元"，null/undefined → "未知"
function formatPrice(p){if(p===null||p===undefined||p==='')return'未知';return parseFloat(p).toFixed(0)+'元';}
// 获取用户认证头
function authHeaders(){const t=localStorage.getItem('userToken');return t?{'Authorization':'Bearer '+t}:{};}

// ═══════════════ 购物车功能 ═══════════════
function getCart(){try{return JSON.parse(localStorage.getItem('cart')||'[]')}catch(e){return[]}}
function saveCart(c){try{localStorage.setItem('cart',JSON.stringify(c))}catch(e){}}
function addToCart(dish,qty){
 const cart=getCart();const i=cart.findIndex(x=>x.id===dish.id);
 const q=typeof qty==='number'&&qty>0?qty:1;
 if(i>=0){cart[i].qty=(cart[i].qty||1)+q}else{cart.push({id:dish.id,name:dish.name,price:dish.price,qty:q,image:dish.image_url||''})}
 saveCart(cart);updateCartBadge();showMessage('已加入购物车','「'+dish.name+'」已加入购物车');
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
}


