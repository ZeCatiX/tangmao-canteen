/* 唐猫庭院 galgame —— 视觉小说引擎 */
"use strict";

(() => {
  const $ = (s) => document.querySelector(s);
  const SAVE_KEY = "tmgal_save_v1", END_KEY = "tmgal_endings_v1";

  const SCRIPT = STORY.SCRIPT;
  const LABELS = {};
  SCRIPT.forEach((c, i) => { if (c.t === "label") LABELS[c.id] = i; });

  const state = {
    i: 0, aff: 0, flags: {}, name: "远客", chapter: "序章",
    typing: false, typeTimer: null, autoTimer: null, blockTimer: null,
    auto: false, skip: false, playing: false,
    log: [],
  };
  let bgFront = "A";

  /* ---------- 工具 ---------- */
  function fmt(text) { return String(text).replace(/{name}/g, state.name); }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ i: state.i, aff: state.aff, flags: state.flags, name: state.name, chapter: state.chapter })); } catch (e) { /* 隐身模式无 localStorage */ }
  }
  function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  function getEndings() { try { return JSON.parse(localStorage.getItem(END_KEY)) || []; } catch (e) { return []; } }
  function addEnding(id) {
    const e = getEndings();
    if (!e.includes(id)) { e.push(id); try { localStorage.setItem(END_KEY, JSON.stringify(e)); } catch (err) {} }
  }

  /* ---------- 背景与立绘 ---------- */
  function setBg(id) {
    const back = bgFront === "A" ? "bgB" : "bgA", front = bgFront === "A" ? "bgA" : "bgB";
    const backEl = $("#" + back), frontEl = $("#" + front);
    backEl.innerHTML = ART.BGS[id] ? ART.BGS[id]() : "";
    backEl.classList.add("on"); frontEl.classList.remove("on");
    bgFront = bgFront === "A" ? "B" : "A";
    AudioSys.rain(id === "rain");
  }
  function showSprite(who, expr, pos) {
    let el = document.getElementById("spr-" + who);
    if (!el) {
      el = document.createElement("div");
      el.id = "spr-" + who;
      el.className = "sprite pos-center breathe";
      $("#sprites").appendChild(el);
    }
    if (who === "catgirl") el.innerHTML = ART.catGirl(expr || "normal");
    else el.innerHTML = '<img class="chara-img" src="images/cat_mascot.webp?v=251025s" alt="唐猫（白猫）" draggable="false">';
    el.style.width = "clamp(220px, 60vmin, 400px)";
    requestAnimationFrame(() => { el.className = "sprite pos-" + (pos || "center") + " breathe"; });
  }
  function hideSprite(who) {
    const el = document.getElementById("spr-" + who);
    if (el) { el.style.opacity = "0"; setTimeout(() => el.remove(), 500); }
  }

  /* ---------- 对白 ---------- */
  function say(cmd) {
    const who = cmd.who;
    const namebox = $("#namebox");
    let displayName = "";
    if (who === "narr") { namebox.classList.add("hidden"); namebox.classList.add("narr"); }
    else {
      namebox.classList.remove("hidden"); namebox.classList.remove("narr");
      displayName = who === "me" ? state.name : who;
    }
    namebox.textContent = displayName;
    if (who === "唐猫" && cmd.expr) showSprite("catgirl", cmd.expr, cmd.pos || "center");
    const text = fmt(cmd.text);
    typewriter(text);
    state.log.push({ n: displayName || "　", t: text });
    if (state.log.length > 200) state.log.shift();
    if (cmd.shake) { $("#text").classList.add("shake"); setTimeout(() => $("#text").classList.remove("shake"), 450); }
  }
  function typewriter(text) {
    clearTimeout(state.typeTimer); clearTimeout(state.autoTimer);
    state.typing = true;
    state.curText = text;
    $("#next-indicator").classList.remove("on");
    const el = $("#text");
    if (state.skip) { el.textContent = text; state.typing = false; $("#next-indicator").classList.add("on"); queueAdvance(60); return; }
    let i = 0;
    const speed = 30;
    const step = () => {
      if (i >= text.length) { state.typing = false; $("#next-indicator").classList.add("on"); if (state.auto) queueAdvance(1100 + text.length * 22); return; }
      const ch = text[i++];
      el.textContent += ch;
      let d = speed;
      if ("。！？…；".includes(ch)) d = speed * 6; else if ("，、：".includes(ch)) d = speed * 3;
      state.typeTimer = setTimeout(step, d);
    };
    el.textContent = "";
    step();
  }
  function completeTyping() {
    clearTimeout(state.typeTimer);
    state.typing = false;
    if (state.curText != null) $("#text").textContent = state.curText;
    $("#next-indicator").classList.add("on");
    if (state.auto) queueAdvance(1100);
  }

  /* ---------- 推进 ---------- */
  function next() {
    if (!state.playing) return;
    clearTimeout(state.blockTimer);
    const cmd = SCRIPT[state.i];
    if (!cmd) return;
    state.i++;
    run(cmd);
  }
  function queueAdvance(ms) {
    clearTimeout(state.autoTimer);
    state.autoTimer = setTimeout(() => { if (state.typing) return; next(); }, ms);
  }
  function run(cmd) {
    switch (cmd.t) {
      case "label": save(); next(); break;
      case "bg": setBg(cmd.id); next(); break;
      case "bgm": AudioSys.playBgm(cmd.id); next(); break;
      case "sfx": AudioSys.sfx(cmd.id); next(); break;
      case "show": showSprite(cmd.who, cmd.expr, cmd.pos); next(); break;
      case "hide": hideSprite(cmd.who); next(); break;
      case "say": say(cmd); break;
      case "shake": $("#app").classList.add("shake"); setTimeout(() => $("#app").classList.remove("shake"), 520); next(); break;
      case "set":
        if (cmd.aff) state.aff += cmd.aff;
        if (cmd.flag) state.flags[cmd.flag] = cmd.value === undefined ? true : cmd.value;
        next(); break;
      case "jump": state.i = LABELS[cmd.id] + 1; next(); break;
      case "if":
        if (cmd.flagHas) { if (state.flags[cmd.flagHas]) state.i = LABELS[cmd.goto] + 1; }
        else if (state.aff >= cmd.affGte) state.i = LABELS[cmd.goto] + 1;
        next(); break;
      case "chapter": showChapter(cmd); break;
      case "dish": showDish(cmd.id); break;
      case "card": showCard(cmd.html); break;
      case "nameinput": showNameInput(); break;
      case "quiz": showQuiz(cmd.id); break;
      case "budget": showBudget(); break;
      case "dim": $("#stage").classList.toggle("spotlight", !!cmd.on); next(); break;
      case "cg": showCg(cmd); break;
      case "choice": stopSkip(); showChoices(cmd); break;
      case "ending": doEnding(cmd.id); break;
      default: next();
    }
  }
  function stopSkip() {
    if (state.skip) { state.skip = false; $("#btn-skip").classList.remove("active"); }
  }

  /* ---------- 章节大字 ---------- */
  function showChapter(cmd) {
    state.chapter = cmd.main.replace(/\s/g, "") + " · " + cmd.sub.replace(/\s/g, "");
    $("#chapter-name").textContent = state.chapter;
    AudioSys.sfx("chapter");
    const el = $("#chapter-title");
    el.querySelector(".ct-main").textContent = cmd.main;
    el.querySelector(".ct-sub").textContent = cmd.sub;
    el.classList.remove("hidden");
    el.style.opacity = "1";
    state.blockTimer = setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.classList.add("hidden"), 1200); next(); }, 2400);
  }

  /* ---------- 覆盖层 ---------- */
  function openOverlay(html, onClose) {
    const ov = $("#overlay"), card = $("#overlay-card");
    card.innerHTML = html;
    ov.classList.remove("hidden");
    // 标题屏在 DOM 中位于 overlay 之后会盖住弹层：打开时隐藏，关闭时恢复
    const ts = $("#title-screen");
    if (!ts.classList.contains("hidden")) ts.classList.add("hidden");
    ov.onclick = (e) => { if (e.target === ov) closeOverlay(onClose); };
    card.querySelectorAll(".oc-close").forEach((b) => b.addEventListener("click", () => { AudioSys.sfx("click"); closeOverlay(onClose); }));
  }
  function closeOverlay(onClose) {
    $("#overlay").classList.add("hidden");
    $("#overlay").classList.remove("ending");
    // 未进入游戏时（标题上下文的弹层关闭），恢复标题屏
    if (!state.playing) $("#title-screen").classList.remove("hidden");
    if (onClose) onClose();
  }

  /* ---------- 菜品 CG ---------- */
  function showDish(id) {
    stopSkip();
    const d = STORY.DISH_INFO[id];
    openOverlay(
      '<div class="dish-card">' + ART.DISHES[id]() +
      '<div class="dc-name">' + esc(d.name) + '</div><div class="dc-price">' + esc(d.price) + '</div>' +
      '<div class="dc-desc">' + esc(fmt(d.desc)) + '</div>' +
      '<button class="oc-close">收下这道菜</button></div>',
      () => next()
    );
  }

  /* ---------- 通用卡片 ---------- */
  function showCard(key) {
    stopSkip();
    const spec = STORY.CARDS[key];
    let html = "";
    if (!spec) html = "<h2>？</h2>";
    else if (spec.dynamic === "plan") html = STORY.planHtml(state.flags.ppl || 4, state.flags.budget || 500);
    else if (spec.dynamic === "profile") html = STORY.profileHtml(spec.spice);
    else if (spec.dynamic === "promo") html = STORY.promoHtml();
    else html = spec.html || "";
    html = fmt(html);
    openOverlay(html + '<button class="oc-close">继续</button>', () => next());
  }

  /* ---------- 名字输入 ---------- */
  function showNameInput() {
    stopSkip();
    openOverlay(
      "<h2>你的名字</h2><p style='text-align:center'>看板猫的档案本已经翻开了一页——</p>" +
      '<div class="name-input"><input id="name-field" maxlength="8" placeholder="远客" value=""><button id="name-ok">就这个</button></div>',
      null
    );
    const field = $("#name-field");
    setTimeout(() => field.focus(), 100);
    $("#name-ok").addEventListener("click", () => {
      const v = field.value.trim();
      state.name = v || "远客";
      AudioSys.sfx("select");
      closeOverlay(() => next());
    });
    field.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#name-ok").click(); });
  }

  /* ---------- 好感浮动提示 ---------- */
  function affFloat(n) {
    if (!n) return;
    const el = document.createElement("div");
    el.className = "aff-float" + (n < 0 ? " neg" : "");
    el.textContent = (n > 0 ? "+♥" : "-♥") + (Math.abs(n) > 1 ? "×" + Math.abs(n) : "");
    $("#app").appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  /* ---------- 猜菜名小游戏 ---------- */
  function showQuiz(id) {
    stopSkip();
    const q = STORY.QUIZZES[id];
    if (!q) { next(); return; }
    let idx = 0, score = 0;
    const grade = () => {
      const total = q.questions.length;
      state.aff += score;
      const tiers = q.results || {};
      const tier = score === total ? tiers.perfect : score >= Math.ceil(total / 2) ? tiers.good : tiers.poor;
      AudioSys.sfx(score === total ? "end" : "bell");
      affFloat(score);
      openOverlay(
        '<div class="quiz-card"><h2>成绩 · ' + score + " / " + total + '</h2>' +
        '<p style="text-align:center;color:#f0d49a;letter-spacing:2px;margin:10px 0">' + (tier ? tier.title : "") + '</p>' +
        '<p>' + (tier ? fmt(tier.text) : "") + '</p>' +
        '<button class="oc-close">继续</button></div>',
        () => next()
      );
    };
    const feedback = (item, chosen, ok) => {
      const card = $("#overlay-card");
      const d = item.dish ? STORY.DISH_INFO[item.dish] : null;
      card.innerHTML =
        '<div class="quiz-card">' +
        (d ? '<div class="quiz-dish">' + ART.DISHES[item.dish]() + '</div>' : "") +
        '<div class="quiz-verdict ' + (ok ? "ok" : "no") + '">' + (ok ? "✓ 答对了" : "✗ 是「" + item.options[item.answer] + "」") + '</div>' +
        '<p class="quiz-explain">' + esc(fmt(item.explain || "")) + '</p>' +
        '<p class="quiz-cat">' + esc(fmt(ok ? (item.praise || "「好眼力！」" ) : (item.tease || "「唔……再尝几道就懂了～」"))) + '</p>' +
        '<button class="oc-close">' + (idx + 1 >= q.questions.length ? "看成绩" : "下一题") + '</button></div>';
      card.querySelectorAll(".oc-close").forEach((b) => b.addEventListener("click", () => {
        AudioSys.sfx("click");
        idx++;
        if (idx >= q.questions.length) { grade(); } else { renderQ(); }
      }));
    };
    const renderQ = () => {
      const item = q.questions[idx];
      const d = item.dish ? STORY.DISH_INFO[item.dish] : null;
      openOverlay(
        '<div class="quiz-card">' +
        '<h2>' + esc(q.title) + '</h2><div class="quiz-no">第 ' + (idx + 1) + " / " + q.questions.length + ' 题</div>' +
        (d ? '<div class="quiz-dish">' + ART.DISHES[item.dish]() + '</div>' : "") +
        '<p class="quiz-q">' + esc(fmt(item.question)) + '</p>' +
        item.options.map((o, i) => '<button class="quiz-opt" data-i="' + i + '">' + esc(fmt(o)) + '</button>').join("") +
        '</div>', null
      );
      $("#overlay").onclick = null;
      document.querySelectorAll(".quiz-opt").forEach((btn) => btn.addEventListener("click", () => {
        const i = +btn.dataset.i, ok = i === item.answer;
        if (ok) score++;
        AudioSys.sfx(ok ? "select" : "click");
        feedback(item, i, ok);
      }));
    };
    renderQ();
  }

  /* ---------- 预算挑战小游戏 ---------- */
  function showBudget() {
    stopSkip();
    const G = STORY.BUDGET_GAME;
    const sel = [];
    const sum = () => sel.reduce((a, b) => a + b.price, 0);
    const tagsOk = () => G.need.every((n) => sel.filter((s) => s.tag === n.tag).length >= n.min);
    const render = () => {
      const used = sum();
      const over = used > G.limit;
      const enough = sel.length >= G.minCount;
      const pillBtn = (c) => {
        const on = sel.includes(c);
        return '<button class="bg-item' + (on ? " on" : "") + '" data-n="' + esc(c.name) + '">' +
          '<span class="bg-name">' + esc(c.name) + '</span><span class="bg-tag">' + esc(c.tag) + '</span><span class="bg-price">' + c.price + "元</span></button>";
      };
      openOverlay(
        '<div class="budget-card"><h2>' + esc(G.title) + '</h2>' +
        '<p class="bg-intro">' + esc(fmt(G.intro)) + '</p>' +
        '<div class="bg-meter' + (over ? " over" : "") + '"><span>预算 ' + G.limit + ' 元</span><b class="' + (over ? "red" : "gold") + '">已选 ' + used + " 元</b></div>" +
        (over ? '<p class="bg-warn">⚠ 超出预算了——先去掉一道吧！</p>' : "") +
        '<h3>候选菜品（点选加入 / 再点移除）</h3><div class="bg-list">' + G.candidates.map(pillBtn).join("") + '</div>' +
        '<h3>本桌 · ' + sel.length + ' 道' + (G.need.length ? '（还差：' + G.need.filter((n) => sel.filter((s) => s.tag === n.tag).length < n.min).map((n) => n.tag + "×" + (n.min - sel.filter((s) => s.tag === n.tag).length)).join("、") + "）" : "") + '</h3>' +
        '<div class="bg-list">' + (sel.length ? sel.map(pillBtn).join("") : '<span class="bg-empty">（还没选菜）</span>') + '</div>' +
        '<div class="bg-actions"><button class="oc-close bg-reset">全部重选</button>' +
        '<button class="oc-close bg-done"' + (!enough || over ? " disabled" : "") + '>就这一桌了</button></div></div>',
        null
      );
      $("#overlay").onclick = null;
      document.querySelectorAll(".bg-item").forEach((b) => b.addEventListener("click", () => {
        const name = b.dataset.n;
        const c = G.candidates.find((x) => x.name === name);
        const i = sel.indexOf(c);
        if (i >= 0) sel.splice(i, 1);
        else {
          if (sum() + c.price > G.limit) { AudioSys.sfx("click"); render(); return; }
          sel.push(c);
        }
        AudioSys.sfx("select");
        render();
      }));
      const rst = $("#overlay-card .bg-reset");
      if (rst) rst.addEventListener("click", () => { sel.length = 0; AudioSys.sfx("click"); render(); });
      const done = $("#overlay-card .bg-done");
      if (done) done.addEventListener("click", () => {
        const perfect = tagsOk();
        const gain = perfect ? 3 : 1;
        state.aff += gain;
        affFloat(gain);
        AudioSys.sfx(perfect ? "end" : "bell");
        const tier = perfect ? G.reviews.perfect : G.reviews.ok;
        openOverlay(
          '<div class="budget-card"><h2>配桌结算 · ' + sum() + " 元 / " + G.limit + ' 元</h2>' +
          '<p style="text-align:center;color:#f0d49a;letter-spacing:2px;margin:8px 0">' + tier.title + '</p>' +
          '<div class="plan-row">' + sel.map((s) => '<span class="plan-pill">' + esc(s.name) + " " + s.price + "元</span>").join("") + '</div>' +
          '<p style="margin-top:10px">' + esc(fmt(tier.text)) + '</p>' +
          '<button class="oc-close">继续</button></div>',
          () => next()
        );
      });
    };
    render();
  }

  /* ---------- 全屏 CG（插画特写） ---------- */
  function showCg(cmd) {
    stopSkip();
    openOverlay(
      '<div class="cg-view">' +
      '<img src="' + esc(cmd.src) + '" alt="">' +
      (cmd.caption ? '<div class="cg-caption">' + esc(fmt(cmd.caption)) + '</div>' : "") +
      '<button class="oc-close">继续</button></div>',
      () => next()
    );
  }

  /* ---------- 选项 ---------- */
  function showChoices(cmd) {
    const box = $("#choices");
    box.innerHTML = "";
    if (cmd.prompt) {
      const p = document.createElement("div");
      p.className = "choice-prompt"; p.textContent = fmt(cmd.prompt);
      box.appendChild(p);
    }
    cmd.options.forEach((op) => {
      const b = document.createElement("button");
      b.textContent = fmt(op.text);
      b.addEventListener("click", () => {
        AudioSys.sfx("select");
        if (op.aff) { state.aff += op.aff; affFloat(op.aff); }
        if (op.flag) state.flags[op.flag] = true;
        box.classList.add("hidden");
        state.i = LABELS[op.goto] + 1;
        save();
        next();
      });
      box.appendChild(b);
    });
    box.classList.remove("hidden");
  }

  /* ---------- 结局 ---------- */
  const END_BG = { bad: "table", silence: "rain", normal: "dawn", good: "court", true: "fire", zhiji: "day", bell: "fire" };
  function doEnding(id) {
    stopSkip(); state.playing = false; clearSave();
    addEnding(id);
    AudioSys.sfx("end");
    if (END_BG[id]) setBg(END_BG[id]);
    const e = STORY.ENDINGS[id];
    const collected = getEndings().length;
    $("#overlay").classList.add("ending");
    openOverlay(
      '<div class="ending-screen">' +
      '<div class="es-seal">' + e.seal + '</div><h2>' + e.name + '</h2><div class="es-sub">' + e.sub + '</div>' +
      '<p>' + esc(fmt(e.desc)) + '</p>' +
      '<p style="text-align:center;color:#d9b26a;margin-top:12px">已收集结局 ' + collected + " / " + Object.keys(STORY.ENDINGS).length + '</p></div>' +
      '<div style="border-top:1px dashed rgba(217,178,106,.4);margin-top:8px"></div>' + STORY.promoHtml() +
      '<button class="oc-close">回到标题</button>',
      () => toTitle()
    );
    $("#overlay").onclick = null; // 结局页不允许点空白关闭
    refreshTitle();
  }

  /* ---------- 记录 / 关于 / 结局收集 ---------- */
  function showLog() {
    const rows = state.log.map((l) => "<p><b style='color:#d9b26a'>" + esc(l.n) + "：</b>" + esc(l.t) + "</p>").join("");
    openOverlay("<h2>对话记录</h2>" + (rows || "<p style='text-align:center;color:#888'>（还没有对话）</p>") + '<button class="oc-close">合上</button>', null);
  }
  function showAbout() {
    openOverlay(
      "<h2>关于 · 唐猫庭院</h2>" +
      "<p>《唐猫庭院 · 千年陕菜谭》是一款网页视觉小说（galgame），为唐猫庭院餐厅与其点餐推荐系统而作。</p>" +
      "<h3>怎么玩</h3><ul><li>点击画面推进对话；选项会影响看板猫对你的好感——有些话，说错了会伤到她</li><li>七种结局（含两个隐藏），收集全部结局有彩蛋</li><li>支持自动播放 / 快进 / 对话记录；进度自动保存</li></ul>" +
      "<h3>运行方式</h3><p>零依赖纯前端：直接打开 index.html，或经由点餐系统访问 <code>/galgame/</code>。</p>" +
      "<h3>制作</h3><p>剧本 / 立绘 / 场景 / 音乐全部代码生成（SVG + WebAudio），无外部素材。菜品数据、菜单与图片素材由唐猫庭院提供。MIT License。</p>" +
      '<button class="oc-close">回到标题</button>', null
    );
  }
  function showEndings() {
    const got = getEndings();
    const order = Object.keys(STORY.ENDINGS);
    const cells = order.map((id) => {
      const e = STORY.ENDINGS[id], on = got.includes(id);
      return '<div class="ending-cell ' + (on ? "unlocked" : "locked") + '"><div class="e-seal">' + (on ? e.seal : "？") + '</div><div class="e-name">' + (on ? e.name : "？？？") + '</div><div class="e-sub">' + (on ? e.sub : "尚未达成") + '</div></div>';
    }).join("");
    const bonus = got.length >= order.length ? '<p style="text-align:center;color:#f0d49a;margin-top:14px">🐾 全结局达成！看板猫说：改天进店，报上名字，八宝茶给你多添一颗桂圆。</p>' : "";
    openOverlay("<h2>结局收集</h2><div class='endings-grid'>" + cells + "</div>" + bonus + '<button class="oc-close">回到标题</button>', null);
  }

  /* ---------- 画廊 ---------- */
  const GALLERY = {
    cg: [
      { src: "images/cg_rain.jpg", cap: "雨夜 · 檐下的她" },
      { src: "images/cg_bell.jpg", cap: "铃铛 · 系上手腕" },
      { src: "images/cg_fire.jpg", cap: "烟花 · 告别之夜" },
    ],
    chara: [
      { src: "images/cat_mascot.webp", cap: "白猫 · 庭院看板猫" },
      { src: "images/chara_smile.webp", cap: "唐猫 · 微笑" },
      { src: "images/chara_soft.webp", cap: "唐猫 · 温柔" },
      { src: "images/chara_excited.webp", cap: "唐猫 · 兴奋" },
      { src: "images/chara_surprised.webp", cap: "唐猫 · 惊讶" },
      { src: "images/chara_shy.webp", cap: "唐猫 · 害羞" },
      { src: "images/chara_smug.webp", cap: "唐猫 · 得意" },
      { src: "images/chara_sad.webp", cap: "唐猫 · 难过" },
      { src: "images/chara_worried.webp", cap: "唐猫 · 担心" },
      { src: "images/chara_cry.webp", cap: "唐猫 · 哭泣" },
      { src: "images/chara_normal.webp", cap: "唐猫 · 平静" },
      { src: "images/chara_happy.webp", cap: "唐猫 · 开心" },
      { src: "images/chara_wink.webp", cap: "唐猫 · 眨眼" },
      { src: "images/chara_sleepy.webp", cap: "唐猫 · 困倦" },
      { src: "images/chara_serious.webp", cap: "唐猫 · 认真" },
      { src: "images/chara_pout.webp", cap: "唐猫 · 哼" },
    ],
    bg: [
      { src: "images/bg_avenue.jpg", cap: "不夜城华灯" },
      { src: "images/bg_street.jpg", cap: "灯笼小巷" },
      { src: "images/bg_court.jpg", cap: "庭院夜话" },
      { src: "images/bg_table.jpg", cap: "一桌好菜" },
      { src: "images/bg_kitchen.jpg", cap: "后厨烟火" },
      { src: "images/bg_rain.jpg", cap: "雨夜巷口" },
      { src: "images/bg_fire.jpg", cap: "烟花之夜" },
      { src: "images/bg_day.jpg", cap: "晌午窗边" },
      { src: "images/bg_dawn.jpg", cap: "黎明告别" },
      { src: "images/bg_title.jpg", cap: "庭院的门" },
    ],
  };
  function galGrid(items) {
    return '<div class="gal-grid">' + items.map(g =>
      '<figure class="gal-item" data-src="' + g.src + '?v=251025s" data-cap="' + g.cap + '">' +
      '<img src="' + g.src + '?v=251025s" alt="" loading="lazy"><figcaption>' + g.cap + '</figcaption></figure>'
    ).join("") + '</div>';
  }
  function showGallery() {
    openOverlay(
      '<h2>画 廊</h2><p class="gal-hint">庭院纪念册 · 点击图片放大赏玩</p>' +
      '<h3 class="gal-sec">剧情时刻</h3>' + galGrid(GALLERY.cg) +
      '<h3 class="gal-sec">看板猫 · 唐猫</h3>' + galGrid(GALLERY.chara) +
      '<h3 class="gal-sec">庭院风景</h3>' + galGrid(GALLERY.bg) +
      '<button class="oc-close">回到标题</button>', null);
    $("#overlay-card").querySelectorAll(".gal-item").forEach(f =>
      f.addEventListener("click", () => { AudioSys.sfx("click"); galView(f.dataset.src, f.dataset.cap); }));
  }
  function galView(src, cap) {
    openOverlay('<div class="cg-view"><img src="' + src + '" alt=""><div class="cg-caption">' + cap + '</div>' +
      '<div class="bg-actions"><button class="oc-back">◀ 回画廊</button><button class="oc-close">关闭</button></div></div>', null);
    const back = $("#overlay-card").querySelector(".oc-back");
    if (back) back.addEventListener("click", () => { AudioSys.sfx("click"); showGallery(); });
  }

  /* ---------- 游戏开始 / 继续 ---------- */
  function startGame(fromSave) {
    const sv = fromSave ? loadSave() : null;
    if (sv) {
      state.i = sv.i; state.aff = sv.aff; state.flags = sv.flags || {};
      state.name = sv.name || "远客"; state.chapter = sv.chapter || "";
    } else {
      state.i = 0; state.aff = 0; state.flags = {}; state.name = "远客"; state.log = [];
    }
    $("#chapter-name").textContent = state.chapter || "序章";
    $("#title-screen").classList.add("hidden");
    $("#topbar").classList.remove("hidden");
    $("#dialog").classList.remove("hidden");
    $("#sprites").innerHTML = "";
    state.playing = true;
    AudioSys.unlock();
    next();
  }
  function toTitle() {
    state.playing = false;
    clearTimeout(state.autoTimer); clearTimeout(state.typeTimer); clearTimeout(state.blockTimer);
    $("#dialog").classList.add("hidden");
    $("#topbar").classList.add("hidden");
    $("#choices").classList.add("hidden");
    $("#overlay").classList.add("hidden");
    $("#title-screen").classList.remove("hidden");
    AudioSys.playBgm("title");
    refreshTitle();
  }
  function refreshTitle() {
    $("#t-continue").disabled = !loadSave();
    const got = getEndings().length;
    $("#t-endings").textContent = "结局收集 " + got + "/" + Object.keys(STORY.ENDINGS).length;
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    // 任意点击推进（对话框/舞台），覆盖层与选项打开时不推进
    $("#app").addEventListener("click", (e) => {
      if (!state.playing) return;
      if (!$("#overlay").classList.contains("hidden")) return;
      if (!$("#choices").classList.contains("hidden")) return;
      if (!$("#chapter-title").classList.contains("hidden")) { // 跳过章节大字
        clearTimeout(state.blockTimer);
        $("#chapter-title").style.opacity = "0";
        setTimeout(() => $("#chapter-title").classList.add("hidden"), 400);
        next(); return;
      }
      if (e.target.closest("#topbar")) return;
      if (state.typing) { completeTyping(); return; }
      next();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== " " && e.key !== "Enter") return;
      if (!state.playing || !$("#overlay").classList.contains("hidden") || !$("#choices").classList.contains("hidden")) return;
      e.preventDefault();
      if (state.typing) completeTyping(); else next();
    });

    $("#t-start").addEventListener("click", () => { AudioSys.unlock(); AudioSys.sfx("select"); startGame(false); });
    $("#t-continue").addEventListener("click", () => { AudioSys.unlock(); AudioSys.sfx("select"); startGame(true); });
    $("#t-endings").addEventListener("click", () => { AudioSys.unlock(); AudioSys.sfx("click"); showEndings(); });
    $("#t-gallery").addEventListener("click", () => { AudioSys.unlock(); AudioSys.sfx("click"); showGallery(); });
    $("#t-about").addEventListener("click", () => { AudioSys.unlock(); AudioSys.sfx("click"); showAbout(); });

    $("#btn-auto").addEventListener("click", (e) => {
      e.stopPropagation();
      state.auto = !state.auto;
      e.currentTarget.classList.toggle("active", state.auto);
      AudioSys.sfx("click");
      if (state.auto && !state.typing && state.playing) queueAdvance(600);
    });
    $("#btn-skip").addEventListener("click", (e) => {
      e.stopPropagation();
      state.skip = !state.skip;
      e.currentTarget.classList.toggle("active", state.skip);
      AudioSys.sfx("click");
      if (state.skip && state.playing) { if (state.typing) completeTyping(); queueAdvance(60); }
    });
    $("#btn-log").addEventListener("click", (e) => { e.stopPropagation(); AudioSys.sfx("click"); showLog(); });
    $("#btn-sound").addEventListener("click", (e) => {
      e.stopPropagation();
      const on = AudioSys.toggle();
      e.currentTarget.textContent = on ? "♪" : "✕";
      e.currentTarget.classList.toggle("active", !on);
    });
  }

  /* ---------- 启动 ---------- */
  function boot() {
    window.__GALGAME_VER = "251025s";
    $("#title-bg").innerHTML = ART.titleBg();
    bind();
    refreshTitle();
    // 标题画面任意首次交互后开 BGM
    const kick = () => { AudioSys.unlock(); AudioSys.playBgm("title"); document.removeEventListener("pointerdown", kick); };
    document.addEventListener("pointerdown", kick);
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
