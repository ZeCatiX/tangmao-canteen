// 页面初始化模块
document.addEventListener('DOMContentLoaded',function(){
 if(_initialized)return;_initialized=true;
 // 从localStorage恢复登录状态
 const savedUser=localStorage.getItem('currentUser');
 if(savedUser&&getUserData(savedUser))currentUser=savedUser;
 showSection('home-section');
 // 从API加载菜品数据
 Promise.race([fetch('/api/dishes'),new Promise((_,r)=>setTimeout(()=>r(new Error('超时')),10000))]).then(r=>r.json()).then(d=>{if(d.success&&d.dishes.length)dishData=d.dishes;}).catch(()=>console.warn('菜品数据加载超时/失败'));
 setTimeout(()=>checkApiAvailability().then(a=>console.log(a?'API可用':'API不可用,使用本地推荐')),100);
 const $=id=>document.getElementById(id);
 const click=(id,fn)=>{const el=$(id);if(el)el.addEventListener('click',fn);};
 const submit=(id,fn)=>{const el=$(id);if(el)el.addEventListener('submit',e=>{e.preventDefault();fn();});};

// ═══════════════ 页面切换与弹窗 ═══════════════
 click('nav-home',e=>{e.preventDefault();showSection('home-section');});
 click('nav-about',e=>{e.preventDefault();showSection('about-section');});
 click('nav-dataset',e=>{e.preventDefault();showDataset();});
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
 click('continue-btn',()=>{if(currentUser&&currentUser!=='guest'){const u=getUserData(currentUser);if(u&&u.preferences)loadUserPreferences(u.preferences);}showSection('preference-section');});
 click('back-to-home',()=>showSection('home-section'));
 click('back-to-home-from-register',()=>showSection('home-section'));
 click('back-from-about',()=>showSection('home-section'));
 click('back-from-dataset',()=>showSection('home-section'));
 submit('login-form',login);submit('register-form',register);
 const an=$('allergy-none'),ac=document.querySelectorAll('input[name="allergy"]');
 if(an){an.addEventListener('change',function(){ac.forEach(cb=>{cb.checked=false;cb.disabled=this.checked;});if(!this.checked)ac.forEach(cb=>cb.disabled=false);});ac.forEach(cb=>cb.addEventListener('change',function(){if(this.checked){an.checked=false;an.disabled=false;}}));}
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
 click('cart-close-btn',()=>showSection('recommendation-section'));
 click('cart-clear-btn',()=>{if(confirm('确定清空购物车？')){clearCart();showCart();}});
 click('cart-checkout-btn',()=>{checkoutCart();});
 // 购物车数量修改事件委托
 document.addEventListener('click',function(e){
  const target=e.target.closest('.cart-qty-plus,.cart-qty-minus,.cart-remove-btn,.add-to-cart-btn');
  if(!target)return;
  const id=parseInt(target.dataset.id);
  if(target.classList.contains('add-to-cart-btn')){
   const dish=dishData.find(d=>d.id===id);
   if(dish){addToCart(dish,1);}else{showMessage('提示','菜品数据未加载');}
   return;
  }
  if(target.classList.contains('cart-qty-plus')){const cart=getCart();const x=cart.find(c=>c.id===id);if(x)updateCartQty(id,(x.qty||1)+1);showCart();}
  else if(target.classList.contains('cart-qty-minus')){const cart=getCart();const x=cart.find(c=>c.id===id);if(x)updateCartQty(id,(x.qty||1)-1);showCart();}
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
 const closeModal=()=>{const m=bootstrap.Modal.getInstance(me);if(!m)return;if(document.activeElement)document.activeElement&&document.activeElement.blur();me.inert=true;m.hide();setTimeout(()=>me.setAttribute('aria-hidden','true'),100);};
 if(cb)cb.addEventListener('click',e=>{e.preventDefault();closeModal();});
 if(cf)cf.addEventListener('click',e=>{e.preventDefault();closeModal();});
 me.addEventListener('hidden.bs.modal',()=>{me.inert=true;me.setAttribute('aria-hidden','true');if(me.contains(document.activeElement))document.activeElement&&document.activeElement.blur();});
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
 // 初始化已点过列表
 if(!localStorage.getItem('orderedDishes'))localStorage.setItem('orderedDishes','[]');
 // 触控滑动支持（左滑拉黑，右滑收藏）
 let touchStartX=0,touchStartY=0,touchEl=null;
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
});

