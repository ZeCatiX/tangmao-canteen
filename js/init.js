// 页面初始化模块
document.addEventListener('DOMContentLoaded',function(){
 if(_initialized)return;_initialized=true;
 // 从localStorage恢复登录状态
 const savedUser=localStorage.getItem('currentUser');
 if(savedUser&&getUserData(savedUser))currentUser=savedUser;
 // 恢复登录态 UI：导航"我的"显示/登录入口隐藏 + 首页登录/注册按钮隐藏（此前只覆盖登录动作瞬间，刷新后按钮复活）
 if(currentUser&&savedUser){
  const pi=document.getElementById('nav-profile-item'),nu=document.getElementById('nav-user');
  if(pi)pi.classList.remove('d-none');if(nu)nu.classList.add('d-none');
  const hlb=document.getElementById('login-btn'),hrb=document.getElementById('register-btn');
  if(hlb)hlb.classList.add('d-none');if(hrb)hrb.classList.add('d-none');
 }
 showSection('home-section');
 // 恢复购物车徽标（刷新后保持显示）
 if(typeof updateCartBadge==='function')updateCartBadge();
 // 恢复语言按钮文字（中英切换记忆）
 (function(){const t=document.getElementById('lang-toggle-text');if(t&&typeof menuLang!=='undefined')t.textContent=menuLang==='en'?'中':'EN';})();
 // 按存储语言应用 UI 骨架（导航/首页按钮/页头）——刷新后英文模式不回退中文
 if (typeof applyUiLang === 'function') applyUiLang();
 // 动态渲染补翻译：任何 DOM 更新(菜单重绘/购物车/弹窗)后 en 模式自动补翻，防自触发
 // 品牌启动动画「数据长成唐猫」：每会话首访播放一次(纯图形中英通用); reduced-motion 用户与已播会话跳过; 点击任意处跳过
 (function(){
   var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
   if (reduce || sessionStorage.getItem('logoIntroShown') || typeof TangCatIntro === 'undefined') return;
   var ov = document.getElementById('logo-intro-overlay'), stage = document.getElementById('logo-intro-stage');
   if (!ov || !stage) return;
   sessionStorage.setItem('logoIntroShown', '1');
   ov.style.display = 'flex';
   var done = false;
   function close(){ if (done) return; done = true; TangCatIntro.stop(); ov.style.transition = 'opacity .5s'; ov.style.opacity = '0'; setTimeout(function(){ ov.style.display = 'none'; }, 520); }
   ov.addEventListener('click', close);
   TangCatIntro.play(stage, { duration: 4200, onDone: function(){ setTimeout(close, 900); } });
 })();
 // 区块切换兜底：切页后延迟补翻一次(部分 section 的动态渲染不触发 childList)
 if (typeof showSection === 'function' && typeof applyUiLangGuarded === 'function') {
   const _origShowSection = showSection;
   showSection = function () { const r = _origShowSection.apply(this, arguments); if (menuLang === 'en') setTimeout(applyUiLangGuarded, 120); return r; };
 }
 if (typeof MutationObserver === 'function' && typeof applyUiLangGuarded === 'function' && typeof menuLang !== 'undefined') {
   new MutationObserver(function(){ if (menuLang === 'en') applyUiLangGuarded(); })
     .observe(document.body, { childList: true, subtree: true });
 }
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
 click('goto-register',e=>{e.preventDefault();showSection('register-section');});
 click('goto-login',e=>{e.preventDefault();showSection('login-section');});
 click('guest-btn',()=>{if(!currentUser)currentUser='guest';if(!ssGet('lockedTable')){openTablePicker('menu');return;}showDataset();});
 click('ai-recommend-btn',()=>{if(!ssGet('lockedTable')){openTablePicker('ai');return;}
  openAIRecommend();
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
  if(!e.target.classList.contains('cart-qty-input'))return;
  const id=parseInt(e.target.dataset.id);const val=parseInt(e.target.value);
  if(!isNaN(val)&&val>0)updateCartQty(id,val);else updateCartQty(id,1);
  showCart();
 });
 // 菜品要求备注：input+change 双事件实时写车（change 是失焦兜底，input 保住移动端逐字输入/自动填充）
 document.addEventListener('input',function(e){
  if(!e.target.classList||!e.target.classList.contains('cart-note-input'))return;
  const id=parseInt(e.target.dataset.id);const cart=getCart();
  const it=cart.find(c=>c.id===id);
  if(it){it.note=e.target.value.trim().slice(0,30);saveCart(cart);}
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

