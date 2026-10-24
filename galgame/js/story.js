/* 唐猫庭院 galgame —— 剧本数据
 * 命令格式见 engine.js；文本中 {name} 会被替换为玩家名。
 * 事实来源：唐猫庭院_完整菜单.md（菜品/价格/门店/承诺/荣誉）与点餐推荐系统真实功能。
 */
"use strict";

/* ---------- 菜品资料（用于菜品 CG 卡） ---------- */
const DISH_INFO = {
  guozyu: { name: "唐猫酸汤锅子鱼", price: "78 元 / 份 · 约 250 克净鱼", desc: "酸汤是这口锅的灵魂——老坛酸香吊出鱼的鲜，约二百五十克净鱼肉，嫩得筷子一碰就化。游西安必打卡榜第一名。" },
  huluji: { name: "葫芦鸡", price: "98 元 / 只", desc: "陕菜头牌功夫菜。整鸡先煮、后蒸、再炸，形如葫芦、皮酥肉烂，上桌时还是一只完整的鸡。始自唐代的古老做法。" },
  tasu: { name: "唐僧望塔酥", price: "59 元 / 份", desc: "一座可以吃的大雁塔。酥皮层层起，咬下去咔嚓一声——那是长安的声音。拍照打卡，非它莫属。" },
  feizixiao: { name: "大唐妃子笑", price: "58 元 / 份 · 6 颗", desc: "「一骑红尘妃子笑，无人知是荔枝来。」六颗冰镇，甜里带着凉意，是整桌菜最后的余韵。" },
  maobisu: { name: "大唐毛笔酥", price: "42 元 / 份 · 6 支", desc: "把点心做成一支支毛笔，笔杆可食、笔尖藏馅。陕西小吃的想象力，连文人见了都要收进笔筒。" },
  babaocha: { name: "唐猫八宝茶", price: "24 元 / 盖碗 · 68 元 / 壶", desc: "盖碗一揭，枸杞、红枣、桂圆、冰糖……八样宝贝在茶汤里浮浮沉沉。庭院的招牌茶，本地人一坐一下午。" },
};

/* ---------- 一桌菜方案（真实菜单价格，实时合计，保证不超预算） ---------- */
function planRow(item) { return '<span class="plan-pill">' + item[0] + " " + item[1] + "元</span>"; }
function planHtml(ppl, budget) {
  const rice = ["五常大米饭", 3], tea = ["酸梅汤", 8];
  const plans = [
    { name: "方案一 · 长安小聚", note: "小吃开路，酥香打底，适合边聊边吃",
      items: [["大唐毛笔酥", 42], ["葫芦鸡翅", 39], ["石锅豆腐", 36], ["凉皮", 12], ["关中浆水土豆片", 19], ["清炒时蔬", 28], ["甑糕", 15]] },
    { name: "方案二 · 不夜城之夜", note: "酸汤配葫芦鸡，招牌双主食力",
      items: [["唐猫酸汤锅子鱼", 78], ["葫芦鸡", 98], ["镇巴山笋炒腊肉", 59], ["沙葱炒鸡蛋", 36], ["回坊酸辣汤", 36], ["凉皮", 12], ["清炒时蔬", 28]] },
    { name: "方案三 · 本地头牌宴", note: "传承陕菜压轴，待客最有面子",
      items: [["褒河豆腐鱼", 198], ["葫芦鸡", 98], ["紫阳蒸盆子", 69], ["一口脆虾球", 49], ["镇巴香肠", 39], ["鱼头豆腐汤", 36], ["清炒时蔬", 28]] },
  ];
  let html = "<h2>看板猫的一桌菜</h2><p style='text-align:center;color:#d9b26a'>" + ppl + " 人 · 预算 " + budget + " 元 · 三套方案任选</p>";
  for (const p of plans) {
    let sum = 0, rows = "";
    for (const it of p.items) { sum += it[1]; rows += planRow(it); }
    sum += rice[1] * ppl + tea[1] * ppl;
    rows += planRow([rice[0] + "×" + ppl, rice[1] * ppl]) + planRow([tea[0] + "×" + ppl, tea[1] * ppl]);
    html += "<h3>" + p.name + "<span style='float:right;font-size:12px;color:#f3e6c899'>" + p.note + "</span></h3>" +
      '<div class="plan-row">' + rows + '</div><div class="plan-total">合计 ' + sum + " 元（预算内 ✔）</div>";
  }
  html += "<p style='margin-top:10px;font-size:13px;color:#f3e6c8aa'>※ 以上为点餐系统「AI 一桌菜」同款思路：忌口先过滤、结构保均衡、预算不超支，还可单道更换。</p>";
  return html;
}

/* ---------- 口味档案卡 ---------- */
function profileHtml(spice) {
  return "<h2>口味档案 · {name}</h2><div class='profile-card'><dl>" +
    "<dt>辣度</dt><dd>" + spice + "</dd>" +
    "<dt>咸淡</dt><dd>待记录</dd><dt>甜酸</dt><dd>待记录</dd>" +
    "<dt>预算</dt><dd>待记录</dd><dt>忌口</dt><dd>无 / 待记录</dd></dl></div>" +
    "<p style='margin-top:12px'>在唐猫庭院的点餐网页里，每位客人都有这样一份口味档案。系统会照着它推荐菜品，你的每次评分，都会让它更懂你。</p>";
}

/* ---------- 结局前宣传卡（两店信息 + 系统介绍） ---------- */
function promoHtml() {
  return "<h2>🏮 唐猫庭院 · 本地人的待客小宴</h2>" +
    "<p style='text-align:center;color:#d9b26a;letter-spacing:3px'>千年陕菜 · 大众点评 · 美团陕菜榜 N.1</p>" +
    "<h3>门店</h3><ul><li><b>西安 · 大唐不夜城店</b>：大雁塔南广场东南角 13 栋 1 单元（微信 19991210572）</li>" +
    "<li><b>西安 · 赛格店</b>：小寨赛格国际 12 楼（微信 19829809735）</li></ul>" +
    "<h3>四大服务承诺（挂门口七年）</h3><ul><li>上错菜品，免费赠送</li><li>菜品有问题，直接退换</li><li>超 30 分钟菜未上齐，全单享 9 折</li><li>打包菜品，免打包费</li></ul>" +
    "<h3>荣誉</h3><p>大众点评 · 美团陕菜榜 N.1 · 西安名厨精英大赛团体金奖 · CCTV 上榜品牌 · 粉丝千万级明星餐厅。七年间，十桌老顾客，八桌本地人。</p>" +
    "<h3>🖥 这个网页本身，也是一件作品</h3>" +
    "<p>你刚玩到的「口味档案」「AI 一桌菜」，是真实存在的功能——唐猫庭院点餐与菜品推荐系统：Bootstrap 5 唐风前端 + Node.js/Express + PostgreSQL，推荐引擎为 HistGradientBoosting 梯度提升模型（反馈 → 重训 → 越点越懂你）。<br>→ <a href='../' style='color:#f0d49a'>去真实的点餐页逛逛</a></p>" +
    "<p style='font-size:12.5px;color:#f3e6c888;margin-top:10px'>菜品数据、菜单与图片素材由唐猫庭院提供 · 本游戏由点餐系统项目组制作 · MIT License</p>";
}

/* ---------- 结局定义 ---------- */
const ENDINGS = {
  bad:   { seal: "🌶️", name: "扶墙而出", sub: "Bad End · 辣的教训", desc: "你试图一个人吃完菜单上所有带辣的菜。第七道时，白旗升起。唐猫递来一听酸梅汤：「下次，先从毛笔酥开始，好吗？」" },
  normal:{ seal: "🌙", name: "一面之缘", sub: "Normal End · 灯一直亮着", desc: "旅人终究要继续赶路。但庭院的灯为每一个路过的人亮着——饿了，随时回来。" },
  good:  { seal: "🏮", name: "回头客", sub: "Good End · 档案里有你", desc: "你的口味档案被郑重地存了进去。下次进店，推荐栏第一个，就是你爱吃的。" },
  true:  { seal: "🐾", name: "千年之约", sub: "True End · 看板猫的秘密", desc: "烟花升起，你看清了她的影子——七年前雨夜被掌柜抱回的那只白猫。白天是猫，晚上是店小二，一直是这家店的看板猫。唐猫庭院的唐猫，名字就是这么来的。" },
};

/* ---------- 剧本 ---------- */
const SCRIPT = [
  /* ===== 序章 ===== */
  { t: "bgm", id: "night" },
  { t: "bg", id: "street" },
  { t: "chapter", main: "序 章", sub: "长 安 夜" },
  { t: "say", who: "narr", text: "暮鼓已过，大唐不夜城的灯，一盏一盏亮了起来。" },
  { t: "say", who: "narr", text: "你来西安的第三天。兵马俑看了，城墙骑了，脚底板已经开始抗议。" },
  { t: "say", who: "narr", text: "唯一的遗憾是——晚饭还没着落。每家网红店门口，都排着看不见尽头的长队。" },
  { t: "say", who: "me", text: "（我的胃，已经开始思考人生了。）" },
  { t: "say", who: "narr", text: "就在这时，脚边传来一声极轻的、铃铛的响。" },
  { t: "show", who: "cat", pos: "center" },
  { t: "sfx", id: "bell" },
  { t: "say", who: "narr", text: "一只白猫蹲在灯笼下。脖子上系着红绳小铃铛，正歪着头看你。" },
  { t: "say", who: "白猫", text: "「喵。」" },
  { t: "say", who: "narr", text: "你与它对视三秒。它转身就走，走两步，又回头看你——像在等你。" },
  { t: "choice", prompt: "夜色渐深，你决定——", options: [
    { text: "跟上去。猫都这么有诚意了", goto: "follow_a" },
    { text: "先掏手机搜「西安今晚吃什么」", goto: "follow_b" },
  ]},

  { t: "label", id: "follow_a" },
  { t: "say", who: "me", text: "「喂，等等——你认识路吗？」" },
  { t: "say", who: "白猫", text: "「喵喵！」（尾巴竖得笔直，显然很满意）" },
  { t: "say", who: "narr", text: "白猫领着你拐进一条挂满灯笼的小巷。身后的喧嚣像退潮一样远去。" },
  { t: "jump", id: "gate" },

  { t: "label", id: "follow_b" },
  { t: "say", who: "narr", text: "手机屏幕亮起。搜到的一条本地人点评吸引了你——" },
  { t: "say", who: "narr", text: "「别排队了，来唐猫庭院吧。本地人的待客小宴，千年陕菜。」" },
  { t: "say", who: "白猫", text: "「喵。」（似乎在说：早搜啊）" },
  { t: "say", who: "narr", text: "白猫在前头带路，领着你拐进一条挂满灯笼的小巷。喧嚣像退潮一样远去。" },

  { t: "label", id: "gate" },
  { t: "say", who: "narr", text: "巷子尽头，一盏写有「唐」字的灯笼下，藏着一方安静的小院。" },
  { t: "sfx", id: "chapter" },
  { t: "say", who: "narr", text: "门楣上三个字——「唐猫庭院」。" },

  /* ===== 相遇 ===== */
  { t: "bg", id: "court" },
  { t: "bgm", id: "court" },
  { t: "hide", who: "cat" },
  { t: "say", who: "narr", text: "推门进去，暖黄的灯光混着菜香扑面而来。猫铃声在某个桌角轻轻一响——" },
  { t: "show", who: "catgirl", expr: "smile", pos: "center" },
  { t: "say", who: "？？？", text: "「呀——今晚第一位客人，是被小雪领来的呀。」" },
  { t: "say", who: "narr", text: "一个穿着齐胸襦裙的女孩从灯笼下转出来。头顶一对毛茸茸的猫耳，正随着她的动作轻轻抖动。" },
  { t: "say", who: "me", text: "（猫耳……COSPLAY？还是说……？）" },
  { t: "say", who: "？？？", expr: "happy", text: "「欢迎光临唐猫庭院——千年陕菜，本地人的待客小宴！」" },
  { t: "say", who: "？？？", text: "「我叫唐猫，这家店的看板猫。白天是猫，晚上是……嗯，勤快的店小二！」" },
  { t: "nameinput" },
  { t: "say", who: "唐猫", expr: "smile", text: "「{name}……好名字。那么 {name}，今晚，想吃点什么？」" },
  { t: "say", who: "me", text: "「等等，先确认一件事——你头上的耳朵，是真的吗？」" },
  { t: "say", who: "唐猫", expr: "shy", text: "「诶？要、要摸摸看吗……才、才不是道具呢！」" },
  { t: "say", who: "narr", text: "猫耳抖了抖，铃铛叮的一声。行吧，是真的。" },
  { t: "say", who: "me", text: "（今晚，大概会遇到很了不起的事情。）" },

  /* ===== 第一章 · 招牌 ===== */
  { t: "chapter", main: "第 一 章", sub: "招 牌" },
  { t: "label", id: "ch1" },
  { t: "say", who: "唐猫", expr: "serious", text: "「客官第一次来，本喵推荐——先从『游西安必打卡』的招牌开始！」" },
  { t: "dish", id: "guozyu" },
  { t: "say", who: "唐猫", expr: "excited", text: "「唐猫酸汤锅子鱼！酸汤是灵魂，鱼是当天现杀的，二百五十克净肉，嫩得筷子一碰就化。」" },
  { t: "dish", id: "huluji" },
  { t: "say", who: "唐猫", expr: "smile", text: "「葫芦鸡，陕菜的头牌功夫菜。先煮、后蒸、再炸，皮酥肉烂，端上桌还是一只完整的『葫芦』。」" },
  { t: "dish", id: "tasu" },
  { t: "say", who: "唐猫", expr: "wink", text: "「唐僧望塔酥——看，像不像大雁塔？酥皮一层一层，咬下去咔嚓一声，是长安的声音。」" },
  { t: "dish", id: "feizixiao" },
  { t: "say", who: "唐猫", expr: "soft", text: "「大唐妃子笑，六颗，冰镇。『一骑红尘妃子笑』，说的就是这份甜。」" },
  { t: "choice", prompt: "今晚的第一口，交给哪道菜？", options: [
    { text: "酸汤锅子鱼！听你的", aff: 2, goto: "c_fish" },
    { text: "葫芦鸡！功夫菜必须安排", aff: 2, goto: "c_chicken" },
    { text: "望塔酥！我要拍照发朋友圈", aff: 2, flag: "photo", goto: "c_pagoda" },
    { text: "妃子笑，我甜品胃先动了", aff: 2, goto: "c_lychee" },
  ]},

  { t: "label", id: "c_fish" },
  { t: "say", who: "me", text: "「酸汤锅子鱼！听你的，看板猫的排面。」" },
  { t: "say", who: "唐猫", expr: "happy", text: "「好眼光！本喵这就去催后厨——酸汤要滚，鱼要烫，一口下去眉毛都要鲜掉！」" },
  { t: "jump", id: "ch1_spice" },

  { t: "label", id: "c_chicken" },
  { t: "say", who: "me", text: "「葫芦鸡。功夫菜，是对长安最起码的尊重。」" },
  { t: "say", who: "唐猫", expr: "excited", text: "「呜哇，行家！整鸡上桌的时候，全院子的人都会看过来——那可是陕菜一千年的排面！」" },
  { t: "jump", id: "ch1_spice" },

  { t: "label", id: "c_pagoda" },
  { t: "say", who: "me", text: "「望塔酥！等等，先别动筷——让我拍完这九宫格。」" },
  { t: "say", who: "唐猫", expr: "wink", text: "「拍吧拍吧，它就是这么设计的～大雁塔同款，咔嚓一声，朋友圈的西安就齐了。」" },
  { t: "say", who: "narr", text: "（当晚，这条朋友圈收获点赞 47 个。）" },
  { t: "jump", id: "ch1_spice" },

  { t: "label", id: "c_lychee" },
  { t: "say", who: "me", text: "「妃子笑。我的甜品胃，比正餐胃先醒。」" },
  { t: "say", who: "唐猫", expr: "smug", text: "「甜口客人～放心，本喵记下了。最后的甜，要留到一桌菜的最后再开，才最惊艳哦。」" },
  { t: "jump", id: "ch1_spice" },

  { t: "label", id: "ch1_spice" },
  { t: "say", who: "唐猫", expr: "normal", text: "「对了，陕西的辣是『香辣』，不是川渝的麻辣。{name}的舌头，能接受到什么程度？」" },
  { t: "choice", prompt: "你的辣度是——", options: [
    { text: "不辣，谢谢。温和派", aff: 1, goto: "sp_none" },
    { text: "微辣，想试试看", aff: 1, goto: "sp_mild" },
    { text: "中辣！本地人水平", aff: 2, goto: "sp_mid" },
    { text: "特辣！我就是辣王", aff: 2, goto: "sp_fire" },
    { text: "（作死）把菜单上所有辣菜都点一遍！", goto: "sp_die" },
  ]},

  { t: "label", id: "sp_none" },
  { t: "say", who: "唐猫", expr: "soft", text: "「明白～那本喵给后厨打招呼，锅子鱼的酸汤给你留最温和的那一档。」" },
  { t: "card", html: "P_profile_none" },
  { t: "jump", id: "ch1_after" },

  { t: "label", id: "sp_mild" },
  { t: "say", who: "唐猫", expr: "smile", text: "「微辣好呀，香辣的『香』刚好能尝到，又不欺负人。」" },
  { t: "card", html: "P_profile_mild" },
  { t: "jump", id: "ch1_after" },

  { t: "label", id: "sp_mid" },
  { t: "say", who: "唐猫", expr: "excited", text: "「中辣！可以可以，明天你就是半个陕西人了。辣子一道一道上，别急。」" },
  { t: "card", html: "P_profile_mid" },
  { t: "jump", id: "ch1_after" },

  { t: "label", id: "sp_fire" },
  { t: "say", who: "唐猫", expr: "worried", text: "「特辣……真的吗？本喵先把酸梅汤和米饭给你备在手边，随时可以灭火。」" },
  { t: "say", who: "me", text: "「放马过来。」" },
  { t: "card", html: "P_profile_fire" },
  { t: "jump", id: "ch1_after" },

  { t: "label", id: "sp_die" },
  { t: "shake" },
  { t: "say", who: "唐猫", expr: "surprised", text: "「全部……？！等等等等！传承陕菜加热销加凉菜，带辣的三十多道，你一个人？！」" },
  { t: "choice", prompt: "唐猫的猫耳抖成了雷达，她拦在菜单前面。", options: [
    { text: "听劝。那就……先来七道？", aff: 2, flag: "saved_by_cat", goto: "sp_die_listen" },
    { text: "坚持！辣王从不回头！", goto: "end_bad_early" },
  ]},
  { t: "label", id: "sp_die_listen" },
  { t: "say", who: "唐猫", expr: "pout", text: "「七道也不少了好吗！」" },
  { t: "say", who: "唐猫", expr: "normal", text: "「……好吧。但本喵要按辣度从低到高给你排顺序，中途想停随时停，谁让看板猫管得宽呢。」" },
  { t: "dish", id: "maobisu" },
  { t: "say", who: "唐猫", expr: "wink", text: "「另外，这份毛笔酥算本喵送的缓冲带——甜咸交替，胃才熬得住。第七道之后，先从它重新认识陕西，好吗？」" },
  { t: "card", html: "P_profile_fire" },
  { t: "jump", id: "ch1_after" },

  { t: "label", id: "ch1_after" },
  { t: "say", who: "唐猫", expr: "wink", text: "「记好了哦，{name} 的口味档案——在我们店的点餐网页上，每位客人都有这样一份。」" },
  { t: "say", who: "唐猫", expr: "normal", text: "「辣度、咸淡、甜酸、预算、忌口……它都记得，比本喵的记性还好。」" },
  { t: "say", who: "me", text: "「连我的忌口它都知道？」" },
  { t: "say", who: "唐猫", expr: "smug", text: "「当然。它甚至会『学习』——你的每条评分反馈，都会让推荐更懂你一分。掌柜说那叫『梯度提升』，本喵觉得，就是一只特别勤快的电子猫。」" },

  /* ===== 第二章 · 一桌菜 ===== */
  { t: "chapter", main: "第 二 章", sub: "一 桌 菜" },
  { t: "label", id: "ch2" },
  { t: "say", who: "narr", text: "菜上到一半，你的手机忽然震个不停。" },
  { t: "say", who: "同学", text: "「兄弟！我到西安了，出差顺路！晚上聚一聚？」" },
  { t: "say", who: "同学", text: "「你不是天天晒那个唐风餐厅吗？就它了！我这边一共几个人这样，你安排！」" },
  { t: "say", who: "me", text: "（完了。带朋友下馆子这种事，我完全没有经验……）" },
  { t: "show", who: "catgirl", expr: "smile" },
  { t: "say", who: "唐猫", text: "「包在本喵身上！这个难不倒看板猫。先说——几位？」" },
  { t: "choice", prompt: "今晚一共几位？", options: [
    { text: "3 人，小聚", goto: "p3" },
    { text: "5 人，热热闹闹", goto: "p5" },
    { text: "8 人，大团圆", goto: "p8" },
  ]},
  { t: "label", id: "p3" }, { t: "set", flag: "ppl", value: 3 }, { t: "jump", id: "ch2_budget" },
  { t: "label", id: "p5" }, { t: "set", flag: "ppl", value: 5 }, { t: "jump", id: "ch2_budget" },
  { t: "label", id: "p8" }, { t: "set", flag: "ppl", value: 8 }, { t: "jump", id: "ch2_budget" },

  { t: "label", id: "ch2_budget" },
  { t: "say", who: "唐猫", expr: "normal", text: "「预算呢？放心说，本喵保证一文钱不让你超。」" },
  { t: "choice", prompt: "预算多少？", options: [
    { text: "300 左右，实惠要紧", goto: "b300" },
    { text: "600 上下，吃出排面", goto: "b600" },
    { text: "1000 管够，难得聚一次", goto: "b1000" },
  ]},
  { t: "label", id: "b300" }, { t: "set", flag: "budget", value: 300 }, { t: "jump", id: "ch2_plan" },
  { t: "label", id: "b600" }, { t: "set", flag: "budget", value: 600 }, { t: "jump", id: "ch2_plan" },
  { t: "label", id: "b1000" }, { t: "set", flag: "budget", value: 1000 }, { t: "jump", id: "ch2_plan" },

  { t: "label", id: "ch2_plan" },
  { t: "sfx", id: "bell" },
  { t: "say", who: "唐猫", expr: "excited", text: "「看好了——看板猫的拿手好戏，『一桌菜』！」" },
  { t: "card", html: "PLAN" },
  { t: "choice", prompt: "你把哪套方案发进了同学群？", options: [
    { text: "方案一 · 长安小聚（小吃开路）", aff: 2, goto: "plan_a" },
    { text: "方案二 · 不夜城之夜（招牌双主力）", aff: 2, goto: "plan_b" },
    { text: "方案三 · 本地头牌宴（硬菜压轴）", aff: 2, goto: "plan_c" },
  ]},
  { t: "label", id: "plan_a" },
  { t: "say", who: "me", text: "「就方案一，毛笔酥配凉皮，边聊边吃，不耽误叙旧。」" },
  { t: "say", who: "唐猫", expr: "happy", text: "「稳！小吃是聊天的最好伴奏，七道菜刚好够你们从大学聊到现在～」" },
  { t: "jump", id: "ch2_after" },
  { t: "label", id: "plan_b" },
  { t: "say", who: "me", text: "「方案二。锅子鱼和葫芦鸡都得上，来一趟西安，招牌不能少。」" },
  { t: "say", who: "唐猫", expr: "excited", text: "「本喵最喜欢的选择！酸汤一开，葫芦鸡一拆，这桌子的长安味就满了！」" },
  { t: "jump", id: "ch2_after" },
  { t: "label", id: "plan_c" },
  { t: "say", who: "me", text: "「方案三。褒河豆腐鱼压轴——待客嘛，就要有头牌的样子。」" },
  { t: "say", who: "唐猫", expr: "surprised", text: "「豆腐鱼都上了？！{name}，你已经是半个本地人了！这桌端上去，你朋友回酒店都要失眠的。」" },
  { t: "jump", id: "ch2_after" },

  { t: "label", id: "ch2_after" },
  { t: "say", who: "me", text: "「话说回来，刚才那三套方案，你算了多久？」" },
  { t: "say", who: "唐猫", expr: "smug", text: "「一眨眼～其实呀，这是我们点餐网页里真实的功能，就叫『AI 一桌菜』。」" },
  { t: "say", who: "唐猫", expr: "normal", text: "「输入人数、预算、口味，三套方案马上端上来；忌口的菜根本不会出现，还能单道更换。同学聚餐、家宴、约会，都镇得住。」" },
  { t: "say", who: "me", text: "「……连预算都算得一分不超？」" },
  { t: "say", who: "唐猫", expr: "wink", text: "「电子猫的看家本领——一文钱，都不让你超。」" },

  /* ===== 第三章 · 承诺 ===== */
  { t: "chapter", main: "第 三 章", sub: "承 诺" },
  { t: "label", id: "ch3" },
  { t: "say", who: "narr", text: "菜一道一道上来，庭院渐渐坐满了。你留意听——八桌里，有六桌说的是陕西话。" },
  { t: "say", who: "唐猫", expr: "soft", text: "「听见了吗？『十桌老顾客，八桌本地人』——这是掌柜最骄傲的一句话。」" },
  { t: "say", who: "唐猫", expr: "normal", text: "「七年了。从网红店，长成本地人待客、宴请、聚餐、约会的优选餐厅。」" },
  { t: "say", who: "narr", text: "忽然，邻桌一阵小小的骚动——有位客人的菜，超了三十分钟还没上齐。" },
  { t: "say", who: "掌柜", text: "「这桌的菜迟了，按规矩——全单九折。怠慢了，怠慢了。」" },
  { t: "say", who: "me", text: "「诶？不用客人提，就这么主动打折？」" },
  { t: "say", who: "唐猫", expr: "serious", text: "「庭院有四大承诺，在门口挂了七年——」" },
  { t: "say", who: "唐猫", expr: "normal", text: "「上错菜品，免费赠送；菜品有问题，直接退换；超三十分钟菜未上齐，全单九折；打包菜品，免打包费。」" },
  { t: "say", who: "唐猫", expr: "soft", text: "「千年陕菜传到今天，靠的从来不是招牌，是一桌一桌客人吃过之后的舌头。」" },
  { t: "say", who: "narr", text: "你注意到，那位迟菜桌上的老先生临走时，又预订了下周的位置。" },
  { t: "say", who: "narr", text: "酒足饭饱，灯笼盏盏渐暗。唐猫开始收拾碗筷，尾巴一晃一晃的。" },
  { t: "choice", prompt: "这一晚，你想为唐猫庭院留下点什么？", options: [
    { text: "发朋友圈安利，配九张图", aff: 2, flag: "share", goto: "h_share" },
    { text: "认真写一条长点评", aff: 1, flag: "review", goto: "h_review" },
    { text: "默默记下：下次带爸妈来", aff: 2, flag: "family", goto: "h_family" },
  ]},
  { t: "label", id: "h_share" },
  { t: "say", who: "me", text: "「九宫格已发。定位：唐猫庭院。文案——『本地人的待客小宴，此言不虚。』」" },
  { t: "say", who: "唐猫", expr: "shy", text: "「呜……{name}，你这样，本喵的耳朵都要烧起来了啦。」" },
  { t: "jump", id: "finale" },
  { t: "label", id: "h_review" },
  { t: "say", who: "me", text: "「（认真地）菜怎么好吃、承诺怎么兑现，一条一条写清楚。好店值得被写明白。」" },
  { t: "say", who: "唐猫", expr: "soft", text: "「认真的人最帅了……本喵替掌柜，谢谢你。」" },
  { t: "jump", id: "finale" },
  { t: "label", id: "h_family" },
  { t: "say", who: "me", text: "「（在心里记下：下次带爸妈来。葫芦鸡给他们，锅子鱼给妈，望塔酥给爱拍照的老爸。）」" },
  { t: "say", who: "唐猫", expr: "happy", text: "「本喵都听到了哦～家庭聚餐的话，记得提前订位，再让『一桌菜』给你排一桌爸妈口味的！」" },
  { t: "jump", id: "finale" },

  /* ===== 终章 ===== */
  { t: "chapter", main: "终 章", sub: "灯 火 阑 珊" },
  { t: "label", id: "finale" },
  { t: "bg", id: "dawn" },
  { t: "bgm", id: "end" },
  { t: "say", who: "narr", text: "夜深了。最后一桌客人也踏着灯笼的光走了。你走出庭院，回头——" },
  { t: "say", who: "narr", text: "唐猫倚在门边，猫耳在晚风里轻轻晃。" },
  { t: "say", who: "唐猫", expr: "soft", text: "「今天……吃得还满意吗，{name}？」" },
  { t: "say", who: "me", text: "「何止满意。是这趟旅途最好的一晚。」" },
  { t: "say", who: "唐猫", expr: "sad", text: "「那就好……旅人嘛，总是要继续走的。本喵见过太多太多一面之缘了。」" },
  { t: "say", who: "唐猫", expr: "normal", text: "「所以——{name}，下次，还会再来吗？」" },
  { t: "choice", prompt: "你看着她的眼睛，认真地回答——", options: [
    { text: "「会。下周就带朋友来，就用那套『一桌菜』。」", aff: 2, goto: "f1" },
    { text: "「会。但下次想一个人来，安安静静吃碗油泼面。」", aff: 1, goto: "f2" },
    { text: "「不好说……旅途还长，谁知道呢。」", aff: 0, goto: "f3" },
  ]},
  { t: "label", id: "f1" },
  { t: "say", who: "唐猫", expr: "surprised", text: "「下、下周？！这么快？！」" },
  { t: "say", who: "me", text: "「不然呢？好店是要趁热二刷的。」" },
  { t: "jump", id: "branch" },
  { t: "label", id: "f2" },
  { t: "say", who: "唐猫", expr: "soft", text: "「一个人呀……也好。油泼面 16 一份，本喵给你留靠窗的位子，能看见月亮的那种。」" },
  { t: "jump", id: "branch" },
  { t: "label", id: "f3" },
  { t: "say", who: "唐猫", expr: "sad", text: "「……嗯，旅途还长。没关系，灯笼会一直亮着的。它们等得起，本喵也等得起。」" },
  { t: "jump", id: "branch" },

  { t: "label", id: "branch" },
  { t: "if", affGte: 8, goto: "end_true" },
  { t: "if", affGte: 5, goto: "end_good" },
  { t: "jump", id: "end_normal" },

  /* ===== 结局 ===== */
  { t: "label", id: "end_bad_early" },
  { t: "bg", id: "table" },
  { t: "say", who: "narr", text: "那晚，你向唐猫庭院菜单上所有带辣的菜发起了总攻——" },
  { t: "say", who: "narr", text: "第七道上桌的时候，你扶着桌沿，缓缓举起了白旗。" },
  { t: "dish", id: "maobisu" },
  { t: "say", who: "唐猫", expr: "worried", text: "「都说了嘛……来，酸梅汤，八块一听，本喵请。」" },
  { t: "say", who: "唐猫", expr: "normal", text: "「下次，先从毛笔酥开始，好吗？」" },
  { t: "ending", id: "bad" },

  { t: "label", id: "end_normal" },
  { t: "say", who: "唐猫", expr: "soft", text: "「一路顺风，旅人。」" },
  { t: "say", who: "唐猫", expr: "smile", text: "「饿了的话，随时回来。灯，一直亮着。」" },
  { t: "say", who: "narr", text: "你点点头，走进长安的夜色里。铃铛声在身后轻轻响了一声，像是道别。" },
  { t: "ending", id: "normal" },

  { t: "label", id: "end_good" },
  { t: "say", who: "唐猫", expr: "happy", text: "「那就说定了！」" },
  { t: "say", who: "唐猫", expr: "smile", text: "「{name}的口味档案，本喵给你存好了。下次进店，推荐栏的第一个，就是你爱吃的。」" },
  { t: "say", who: "唐猫", expr: "wink", text: "「——电子猫办不到的部分，本喵亲自盯。这是看板猫的待客之道。」" },
  { t: "say", who: "narr", text: "后来的事，就像她说的那样。你成了回头客，档案越来越懂你，八宝茶也从盖碗换成了壶。" },
  { t: "dish", id: "babaocha" },
  { t: "ending", id: "good" },

  { t: "label", id: "end_true" },
  { t: "bg", id: "fire" },
  { t: "sfx", id: "end" },
  { t: "say", who: "narr", text: "你话音刚落——整条街的灯笼忽然一齐亮了。远处，大雁塔的方向，烟花升了起来。" },
  { t: "say", who: "唐猫", expr: "cry", text: "「……真的？说、说定了哦。骗猫的话，是要被铃铛追着跑一辈子的哦。」" },
  { t: "say", who: "narr", text: "她跳上门边的石凳，猫耳竖得笔直。逆着烟花的光，你第一次看清了她的影子——" },
  { t: "say", who: "narr", text: "是一只系着铃铛的白猫。" },
  { t: "show", who: "catgirl", expr: "soft" },
  { t: "say", who: "唐猫", expr: "soft", text: "「其实呀……七年前的一个雨夜，掌柜把一只湿透的小猫抱进了这个院子。」" },
  { t: "say", who: "唐猫", expr: "smile", text: "「他说：既然赖着不走，这家店以后就叫你的名字吧。所以——唐猫庭院的『唐猫』，白天是猫，晚上是店小二。」" },
  { t: "say", who: "唐猫", expr: "happy", text: "「大众点评和美团的陕菜榜第一、名厨大赛金奖、CCTV 上榜……掌柜总念叨这些。但本喵最骄傲的，还是十桌里有八桌，是每周都来的本地人。」" },
  { t: "say", who: "唐猫", expr: "wink", text: "「{name}，以后你的口味档案，本喵亲自盯着。谁让算法不懂你呢——喵。」" },
  { t: "say", who: "narr", text: "烟花落尽，灯笼长明。这一晚，你把一家餐厅的名字，记进了旅途的年轮里。" },
  { t: "dish", id: "babaocha" },
  { t: "ending", id: "true" },
];

/* 卡片解析表（engine 按需取用） */
const CARDS = {
  PLAN: { dynamic: "plan" },
  P_profile_none:  { dynamic: "profile", spice: "不辣（温和派）" },
  P_profile_mild:  { dynamic: "profile", spice: "微辣" },
  P_profile_mid:   { dynamic: "profile", spice: "中辣（本地人水平）" },
  P_profile_fire:  { dynamic: "profile", spice: "特辣（辣王认证）" },
  PROMO: { dynamic: "promo" },
};

const STORY = { SCRIPT, DISH_INFO, ENDINGS, CARDS, planHtml, profileHtml, promoHtml };
