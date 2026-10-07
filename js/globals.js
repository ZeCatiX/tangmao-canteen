
// ═══════════════ 全局变量与工具函数 ═══════════════
// 唐猫庭院 - 菜品推荐系统 v2.0
var currentUser=null,userProfile=null,currentRecommendations=[],recommendedIds=[];
var currentRecommendationMode='本地计算'; var featureImportanceChart=null;
var decisionTreeModel=null,decisionTreeLoaded=false,decisionTreeLoading=false;
var apiAvailabilityCache=null,apiCacheTimestamp=0;
var dishData=[];  // 菜品数据，从API加载
// 客户端菜品准入：下架的与名称含「测试」的脏数据一律不进 dishData（防测试菜露出到菜单/推荐/盲盒）
function filterVisibleDishes(list){return (list||[]).filter(x=>x.is_active!==false&&!(x.name||'').includes('测试'));}
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
// 价格格式化：数字 → "88元"，null/undefined → "未知"；英文模式 ¥88 / bowl
var UNIT_EN = { '/碗':'/bowl','/份':'/portion','/只':'/whole','/瓶':'/bottle','/听':'/can','/杯':'/cup','/个':'/pc','/盒':'/box','/壶':'/pot','/盖碗':'/gaiwan','/6只':'/6 pcs','/6块':'/6 pcs','/3碗':'/3 bowls','/4个':'/4 pcs','/支':'/stick','/颗':'/pc','/块':'/pc','/笼':'/steamer' };
function formatPrice(d){const p=(d&&typeof d==='object')?d.price:d;if(p===null||p===undefined||p==='')return'未知';const unit=(d&&d.price_unit)||'';return parseFloat(p).toFixed(0)+(menuLang==='en'?'¥':'元')+(unit?(menuLang==='en'?(UNIT_EN[unit]||unit):unit):'');}
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
function saveCart(c){try{localStorage.setItem('cart',JSON.stringify(c))}catch(e){};if(typeof updateCartBadge==='function')updateCartBadge();}
function minQtyOf(dish){
 if(!dish)return 1;
 // 起售备注可能在 serving 或 description 字段（历史数据不一致）；量词不限于"个"——后台自建菜可能写 2盒起/3杯起
 const src=((dish.serving||'')+' '+(dish.description||''));
 const m=src.match(/(\d+)\s*[个盒杯碗瓶只块份包袋听支罐]?起/);
 return m?Math.max(1,parseInt(m[1],10)):1;
}
function addToCart(dish,qty){
 const cart=getCart();const i=cart.findIndex(x=>x.id===dish.id);
 const min=minQtyOf(dish);
 const q=typeof qty==='number'&&qty>0?qty:1;
 // 一席成宴选饮品模式：饮品自动挂到当前席面（先记录，再入车，保证浮窗/横幅读到最新）
 const inDrinksMode=typeof tableDrinksMode!=='undefined'&&tableDrinksMode!==null&&window.tableSets&&window.tableSets[tableDrinksMode]&&dish.category==='飲品与酒水';
 if(inDrinksMode){
  const s=window.tableSets[tableDrinksMode];
  s.chosenDrinkIds=s.chosenDrinkIds||[];
  if(!s.chosenDrinkIds.includes(dish.id))s.chosenDrinkIds.push(dish.id);
 }
 if(i>=0){cart[i].qty=(cart[i].qty||1)+q;saveCart(cart);updateCartBadge();}
 else{
  // 起售数量：首次加入按最小起售量（如核桃包3个起、迷你肉夹馍2个起）
  const add=Math.max(q,min);
  cart.push({id:dish.id,name:dish.name,price:dish.price,qty:add,image:dish.image_url||''});
  saveCart(cart);updateCartBadge();
  if(add>q)showMessage('已加入购物车','「'+dish.name+'」'+min+'个起售，已加 '+add+' 个',null,2500);
  else showMessage('已加入购物车','「'+dish.name+'」已加入购物车',null,2500);
 }
 if(inDrinksMode){
  const s=window.tableSets[tableDrinksMode];
  if(typeof recalcTableSetTotals==='function')recalcTableSetTotals(s);
  if(typeof renderDrinksModeBanner==='function')renderDrinksModeBanner();
 }
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
 if(i<0)return;
 if(qty<=0){cart.splice(i,1);saveCart(cart);updateCartBadge();return;}
 // 起售数量保护：减到低于最小起售量时拦截（整件移除走 ✕ 删除按钮）
 const dish=dishData.find(d=>d.id===id);
 const min=minQtyOf(dish);
 if(qty<min){showMessage('起售数量','「'+(cart[i].name||'该菜品')+'」'+min+'个起售，数量不能低于 '+min+' 个');return;}
 cart[i].qty=qty;saveCart(cart);updateCartBadge();
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
 const onMenu=document.getElementById('dataset-section')?.classList.contains('active');
 if(c>0&&!onEnd&&!onCart){
  bar.style.display='flex';
  document.getElementById('float-cart-count').textContent=c;
  document.getElementById('float-cart-total').textContent=getCartTotal();
  // 一席成宴选饮品模式：仅在菜单页可见时（选饮品现场）显示提示与返回席面按钮
  const drinksBack=document.getElementById('float-drinks-back');
  const dsEl=document.getElementById('dataset-section');
  const onMenu=dsEl?getComputedStyle(dsEl).display!=='none':false;
  let hint=document.getElementById('float-drinks-hint');
  if(drinksBack){
   const active=onMenu&&typeof tableDrinksMode!=='undefined'&&tableDrinksMode!==null&&window.tableSets&&window.tableSets[tableDrinksMode];
   drinksBack.style.display=active?'inline-block':'none';
   if(active){
    const s=window.tableSets[tableDrinksMode];
    const chosen=(s.chosenDrinkIds||[]).map(function(id){return getCart().find(function(x){return x.id===id;});}).filter(Boolean);
    if(!hint){hint=document.createElement('div');hint.id='float-drinks-hint';hint.style.cssText='font-size:0.85rem;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';bar.insertBefore(hint,bar.firstChild.nextSibling);}
    hint.style.display=active?'block':'none';
    hint.textContent='🍹 正在为「'+s.style+'」选饮品 · 已选 '+chosen.length+' 件';
   } else if(hint) hint.style.display='none';
  }
 } else bar.style.display='none';
}



// ═══ 中英双语（C11）：菜名/分类/描述按语言显示，切换记忆在 localStorage ═══
var menuLang = localStorage.getItem('menuLang') || 'zh';
var CAT_EN = { '主食': 'Staples', '招牌与游西安必打卡': 'Must-Try Signatures', '热销菜品': 'Best Sellers', '传承陕菜': 'Heritage Shaanxi', '江湖海鲜': 'Jianghu Seafood', '田园时蔬·汤羹': 'Greens & Soups', '特色凉菜': 'Signature Cold Dishes', '陕西小吃': 'Shaanxi Snacks', '飲品与酒水': 'Drinks & Wines', '凉菜凉拌': 'Cold Dishes', '汤粥糖水': 'Soups & Desserts', '主食小吃': 'Staples & Snacks', '甜品饮品': 'Desserts & Drinks', '海鲜水产': 'Seafood', '清爽素食': 'Light Vegetarian' };
function dishNameOf(d) {
  if (menuLang === 'en' && d) { if (d.name_en) return d.name_en; const m = String(d.name || '').match(/^(.+)\(([^()]+)\)$/); if (m && d.name_en) return d.name_en; }
  return (d && d.name) || '';
}
function catNameOf(c) { return menuLang === 'en' && CAT_EN[c] ? CAT_EN[c] : c; }
// ═══ UI 骨架 i18n（2026-10-07 用户反馈：切英文后首页/导航毫无变化，观感"没有用"）═══
// 覆盖导航/首页主按钮/桌号卡/菜单页头/弹窗标题；菜品数据面（菜名/描述/分类）原有逻辑不变
var UI_STR = {
  nav_home: ['首页', 'Home'], nav_about: ['关于本店', 'About Us'], nav_menu: ['全部菜单', 'Full Menu'],
  nav_privacy: ['隐私政策', 'Privacy'], nav_mine: ['我的', 'My'], nav_cart: ['我的购物车', 'My Cart'],
  home_start: ['开始点餐', 'Start Ordering'], home_ai: ['不知道吃什么？猫掌柜 AI 帮你选', 'Not sure? Ask the AI Butler'],
  home_table: ['人多点啥？一席成宴', 'Group? AI Table Feast'], home_continue: ['继续上次推荐', 'Continue Last Recommendations'],
  home_last: ['查看上次推荐', 'View Last Recommendations'], login: ['登录', 'Sign In'], register: ['注册', 'Register'],
  table_none: ['未选择桌号', 'No table yet'], table_pick: ['选择桌号', 'Pick a Table'], table_change: ['更换', 'Change'],
  menu_title: ['全部菜单', 'Full Menu'], back: ['返回', 'Back'], table_pick_title: ['请选择桌号', 'Pick a Table']
};
var TAB_EN = { '主食': 'Staples', '招牌': 'Signature', '热销': 'Hot', '陕菜': 'Shaanxi', '海鲜': 'Seafood', '蔬羹': 'Greens', '凉菜': 'Cold', '小吃': 'Snacks', '饮品': 'Drinks' };
var SPICE_EN = { '不辣': 'Mild', '微辣': 'Mildly spicy', '中辣': 'Medium spicy', '重辣': 'Extra spicy' };
// 轮次标签是存进 sessionStorage 的中文数据，渲染时按语言转写（数据不动）
function roundLabelLang(s) {
  if (menuLang !== 'en' || !s) return s;
  return s.replace(/^第(\d+)轮点餐$/, 'Round $1').replace(/^第(\d+)轮加菜$/, 'Round $1 · added')
          .replace(/^赠给 (\S+) 号桌$/, 'Gifted to Table $1');
}
// 服务端推荐理由模板 → 英文（reasonFor/table_recommend.js 与单菜推荐），尾缀"AI 匹配度 X%"保留数字
var REASON_EN = {
  '猫掌柜的招牌，来唐猫庭院必打卡': "The butler's check-in special at Tang Cat Courtyard",
  '猫掌柜的看家推荐，撑得住场面的招牌菜': "The butler's signature pick — a true centerpiece",
  '餐后甜口，席面收得漂亮': 'A sweet finish to close the feast',
  '主食收口，管饱又实惠': 'A filling staple, great value',
  '主食收口，分量正合适': 'A staple to round it off, just right',
  '陕味小吃，席面的烟火气': "Shaanxi snack — the feast's street-food soul",
  '时蔬汤羹，一桌荤素平衡全靠它': 'Greens & soup that balance the whole table',
  '开胃凉菜，清爽解腻': 'Appetizing cold dish, light and refreshing',
  '硬菜撑场，宴请倍儿有面子': 'A showstopper that honors the banquet',
  '一道硬菜，镇桌之选': 'A hearty dish, the anchor of the table',
  '猫掌柜点名的人气菜，闭眼点不踩雷': "Butler-approved favorite — you can't go wrong",
  '猫掌柜依你的口味挑的家常热菜': 'Home-style hot dish picked for your taste',
  '本店人气招牌，最近大家都在点': 'House signature, trending lately',
  '根据你的口味偏好为你推荐': 'Picked to match your taste profile',
  '你的口味档案专属推荐': 'Chosen from your taste profile'
};
function reasonZhToEn(s) {
  if (!s) return s;
  if (REASON_EN[s]) return REASON_EN[s];
  // 带辣度拼接的模板：开胃凉菜，X爽口解腻 / 风味热菜，X过瘾下饭；及"模板，AI 匹配度 N%"尾缀
  const m = s.match(/^(开胃凉菜，|风味热菜，)(.+)(爽口解腻|过瘾下饭)$/);
  if (m) return (m[1] === '开胃凉菜，' ? 'Appetizing cold dish, ' : 'Flavorful hot dish, ') + (SPICE_EN[m[2]] || m[2]) + (m[3] === '爽口解腻' ? ' and refreshing' : ' — great with rice');
  const tail = s.match(/^(.*)，AI 匹配度 (\d+)%$/);
  if (tail && REASON_EN[tail[1]]) return REASON_EN[tail[1]] + ', AI match ' + tail[2] + '%';
  return s;
}
function uiText(key) { const v = UI_STR[key]; return v ? (menuLang === 'en' ? v[1] : v[0]) : ''; }
// ═══ 遍历式 UI 翻译：精确匹配文本节点（trim 后），en 替换并记忆原文，zh 还原 ═══
// 背景：data-i18n 只盖了骨架，筛选下拉/表单选项/按钮/动态渲染仍残留中文——用户实测"切了没变化"
var ZH_EN = {
  // 导航/通用
  '首页':'Home','关于本店':'About Us','全部菜单':'Full Menu','隐私政策':'Privacy','我的':'My','我的购物车':'My Cart','登录':'Sign In','注册':'Register','返回':'Back','关闭':'Close','确定':'OK','取消':'Cancel','加载中...':'Loading...','展开导航菜单':'Menu',
  // 桌号弹窗
  '请选择桌号':'Pick a Table','确认':'Confirm','🥡 打包带走':'🥡 Takeaway',
  // 菜单页
  '浏览本店全部菜品，共':'Browse our full menu —','道。':'dishes.','重置':'Reset','＋ 加入':'+ Add','加入':'Add','查看详情':'View details','售罄':'Sold out','补货':'Restock',
  '全部分类':'All categories','全部辣度':'All spice levels','全部价格':'All prices','默认排序':'Default order','按人气':'By popularity','按评分':'By rating','价格从低到高':'Price: low to high','价格从高到低':'Price: high to low',
  '不辣':'Mild','微辣':'Mildly spicy','中辣':'Medium spicy','重辣':'Extra spicy',
  '20元以下':'Under ¥20','20-40元':'¥20–40','40-60元':'¥40–60','60元以上':'Over ¥60',
  '主食':'Staples','招牌与游西安必打卡':'Must-Try Signatures','热销菜品':'Best Sellers','传承陕菜':'Heritage Shaanxi','江湖海鲜':'Jianghu Seafood','田园时蔬·汤羹':'Greens & Soups','特色凉菜':'Signature Cold Dishes','陕西小吃':'Shaanxi Snacks','飲品与酒水':'Drinks & Wines',
  // 一席成宴表单
  '猫掌柜 · 一席成宴':'Butler AI · Table Feast','壹用餐人数':'1. Party size','贰人均预算 ':'2. Budget per guest ','（含每人一碗米饭）':'(incl. a bowl of rice)','叁辣度偏好':'3. Spice','肆咸淡偏好':'4. Saltiness','伍甜酸偏好':'5. Sweet & sour','陆热量偏好':'6. Calories','柒饮食要求':'7. Dietary','捌忌口（过敏源）':'8. Allergies',
  '无所谓':'No preference','清淡':'Light','适中':'Just right','偏咸':'Saltier','无味':'Neither','甜味':'Sweet','酸味':'Sour','酸甜':'Sweet & sour','不限':'Any','低卡':'Light','高能量':'Hearty','无特殊要求':'No restrictions','素食':'Vegetarian','清真':'Halal','无':'None','海鲜':'Seafood','花生':'Peanuts','鸡蛋':'Eggs','大豆':'Soy','麸质':'Gluten',
  '避开最近吃过的菜（7 天内点过的不再推荐）':'Avoid dishes I ordered recently (within 7 days)','生成席面 · 三套方案':'Generate · 3 Set Menus','返回首页':'Back to Home',
  '1 人':'1 guest','2 人':'2 guests','3 人':'3 guests','4 人':'4 guests','5 人':'5 guests','6 人':'6 guests','7 人':'7 guests','8 人':'8 guests','9 人':'9 guests','10 人':'10 guests','11 人':'11 guests','12 人':'12 guests','13 人':'13 guests','14 人':'14 guests','15 人':'15 guests','16 人':'16 guests','17 人':'17 guests','18 人':'18 guests','19 人':'19 guests','20 人':'20 guests',
  '20-29 元':'¥20–29','30-39 元':'¥30–39','40-49 元':'¥40–49','50-59 元':'¥50–59','60-69 元':'¥60–69','70-79 元':'¥70–79','80-89 元':'¥80–89','90-99 元':'¥90–99','100-109 元':'¥100–109','110-119 元':'¥110–119','120-129 元':'¥120–129','130-139 元':'¥130–139','140-149 元':'¥140–149','150 元以上':'¥150+',
  // 三套卡与理由（server 模板，渲染后经遍历器命中）
  '家常版':'Home-style','宴请版':'Banquet','打卡版':'Check-in','去选饮品':'Drinks','生成分享图':'Share Image','整体加购':'Add All','换一道':'Swap','单点加购':'Add','减少':'−','增加':'+',
  '猫掌柜的招牌，来唐猫庭院必打卡':"The butler's check-in special",'猫掌柜的看家推荐，撑得住场面的招牌菜':"The butler's signature pick — a true centerpiece",'餐后甜口，席面收得漂亮':'A sweet finish to close the feast','主食收口，管饱又实惠':'A filling staple, great value','主食收口，分量正合适':'A staple to round it off, just right','陕味小吃，席面的烟火气':'Shaanxi snack — the soul of the feast','时蔬汤羹，一桌荤素平衡全靠它':'Greens & soup that balance the whole table','开胃凉菜，清爽解腻':'Appetizing cold dish, light and refreshing','硬菜撑场，宴请倍儿有面子':'A showstopper that honors the banquet','一道硬菜，镇桌之选':'A hearty dish, the anchor of the table','猫掌柜点名的人气菜，闭眼点不踩雷':"Butler-approved favorite — you can't go wrong",'猫掌柜依你的口味挑的家常热菜':'Home-style hot dish picked for your taste',
  // 推荐页
  '为您推荐':'Recommended for You','换一批':'Refresh','选好了':'Done','退出':'Exit','加一碗米饭':'Add a bowl of rice','饮料酒水':'Drinks','搭配更尽兴':'Better together','操作':'Actions','收藏':'Favorite','已收藏':'Favorited','拉黑':'Block','已拉黑':'Blocked','评分':'Rate','匹配度':'Match','试试手气':'Try your luck','盲盒':'Blind box','本店人气招牌，最近大家都在点':'House signature, trending lately','去补全 →':'Complete them →','换口味':'Change taste',
  // 购物车
  '菜品':'Dish','数量':'Qty','单价':'Price','小计':'Subtotal','去结算':'Checkout','清空':'Clear','合计：':'Total:','购物车是空的':'Your cart is empty','去推荐菜品页面添加你喜欢的菜吧':'Open recommendations to add dishes','待加菜':'To add','查看订单':'View order','已结算':'Settled','✕ 关闭':'✕ Close',
  // 完成页
  '点餐完成':'Order Placed','菜品已记录，厨房正在为您准备':'Recorded — the kitchen is on it','本次点餐':'This order','下单成功':'Placed','当前轮':'current','本轮推荐':'This round','本轮未启用 AI — 普通点餐，无推荐分析':'AI off this round — plain order, no match stats','模型评估':'Model quality','决定系数':'R² score','均方误差':'MSE','均方根误差':'RMSE','平均绝对误差':'MAE','对这次推荐满意吗？':'How were the picks?','点击选择满意度':'Tap to rate','提交评价':'Submit','影响推荐的关键因素':'What shaped this','加菜 / 继续点餐':'Add more','重新点餐':'Start over','结束用餐，退出':'Finish & exit',
  // 个人中心
  '最后登录：':'Last sign-in:','最近推荐记录':'Recent recommendations','还没有推荐记录':'No recommendations yet','收藏菜品':'Favorites','还没有收藏的菜品':'No favorites yet','取消收藏':'Unfavorite','拉黑的菜品':'Blocked dishes','还没有拉黑的菜品':'No blocked dishes','退出登录':'Sign out','注销账号':'Delete account','再来一单':'Reorder',
  // 登录/注册
  '用户名':'Username','密码':'Password','确认密码':'Confirm password','显示密码':'Show','隐藏密码':'Hide','还没有账号？':'No account yet?','去注册':'Register','已有账号？':'Have an account?','去登录':'Sign in','我已阅读并同意':'I have read and agreed to the','《隐私政策》':'Privacy Policy'
};
var PH_EN = { '搜索菜品名称...':'Search dishes...', '搜索菜品名称':'Search dishes', '选择桌号':'Pick a table', '桌号':'Table No.', '备注：少辣/不要香菜…':'e.g. less spicy / no cilantro…' };
function applyUiLang() {
  // ① data-i18n 声明式（骨架）
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = UI_STR[el.getAttribute('data-i18n')];
    if (!v) return;
    const target = menuLang === 'en' ? v[1] : v[0];
    let replaced = false;
    el.childNodes.forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) { n.textContent = target; replaced = true; } });
    if (!replaced && !el.children.length) el.textContent = target;
  });
  const t = document.getElementById('lang-toggle-text'); if (t) t.textContent = menuLang === 'zh' ? 'EN' : '中';
  if (typeof updateTableStatusCard === 'function') updateTableStatusCard();
  // ② 遍历式：全页面文本节点精确匹配
  if (typeof document.createTreeWalker !== 'function') return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    const raw = n.textContent;
    if (!raw || !raw.trim()) return;
    const parent = n.parentElement;
    if (!parent) return;
    if (menuLang === 'en') {
      if (parent.dataset && parent.dataset.zhOrig !== undefined) return; // 已翻译
      const key = raw.trim();
      if (ZH_EN[key]) {
        parent.setAttribute('data-zh-orig', raw);
        n.textContent = raw.replace(key, ZH_EN[key]);
      }
    } else {
      if (parent.dataset && parent.dataset.zhOrig !== undefined) {
        n.textContent = parent.dataset.zhOrig;
        parent.removeAttribute('data-zh-orig');
      }
    }
  });
  // ③ placeholder
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    if (menuLang === 'en') {
      if (PH_EN[el.placeholder]) { if (el.dataset.zhPh === undefined) el.setAttribute('data-zh-ph', el.placeholder); el.placeholder = PH_EN[el.placeholder]; }
    } else if (el.dataset && el.dataset.zhPh !== undefined) { el.placeholder = el.dataset.zhPh; el.removeAttribute('data-zh-ph'); }
  });
}
var _uiLangApplying = false;
function applyUiLangGuarded() { if (_uiLangApplying) return; _uiLangApplying = true; try { applyUiLang(); } finally { setTimeout(() => { _uiLangApplying = false; }, 60); } }
function toggleMenuLang() {
  menuLang = menuLang === 'zh' ? 'en' : 'zh';
  localStorage.setItem('menuLang', menuLang);
  applyUiLang();
  const sec = document.querySelector('.section.active');
  if (!sec) return;
  if (sec.id === 'dataset-section') { const tb = document.getElementById('category-tabs'); if (tb) delete tb.dataset.cats; if (typeof buildCategoryUI === 'function') buildCategoryUI(); renderMenuTable(); }
  else if (sec.id === 'recommendation-section') { if (typeof displayRecommendations === 'function') displayRecommendations(); }
  else if (sec.id === 'table-result-section') { if (typeof renderTableSets === 'function') renderTableSets(); }
  else if (sec.id === 'cart-section') { if (typeof showCart === 'function') showCart(); }
  else if (sec.id === 'profile-section') { if (typeof showProfile === 'function') showProfile(); }
  else if (sec.id === 'home-section') showSection('home-section');
}
