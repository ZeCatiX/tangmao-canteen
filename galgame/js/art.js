/* 唐猫庭院 galgame —— 手绘 SVG 美术资源（零外部素材，全部矢量生成） */
"use strict";

const ART = (() => {

  /* ================= 猫娘立绘「唐猫」 ================= */
  // 表情预设：eyes × brows × mouth × blush × extra
  const FACES = {
    normal:  { eyes: "normal",  brows: "normal",  mouth: "smile",      blush: 0 },
    smile:   { eyes: "normal",  brows: "normal",  mouth: "smileOpen",  blush: 0.25 },
    happy:   { eyes: "happy",   brows: "raised",  mouth: "grin",       blush: 0.35 },
    shy:     { eyes: "shy",     brows: "normal",  mouth: "pout",       blush: 0.9 },
    surprised:{eyes: "wide",    brows: "raised",  mouth: "gasp",       blush: 0.1 },
    soft:    { eyes: "soft",    brows: "normal",  mouth: "smile",      blush: 0.2 },
    wink:    { eyes: "wink",    brows: "raised",  mouth: "grin",       blush: 0.3 },
    smug:    { eyes: "soft",    brows: "normal",  mouth: "smug",       blush: 0 },
    sad:     { eyes: "sad",     brows: "worried", mouth: "wavy",       blush: 0 },
    worried: { eyes: "normal",  brows: "worried", mouth: "wavy",       blush: 0 },
    excited: { eyes: "star",    brows: "raised",  mouth: "smileOpen",  blush: 0.4 },
    sleepy:  { eyes: "soft",    brows: "normal",  mouth: "pout",       blush: 0.3, extra: "note" },
    serious: { eyes: "normal",  brows: "worried", mouth: "flat",       blush: 0 },
    cry:     { eyes: "cry",     brows: "worried", mouth: "wavy",       blush: 0.6 },
    pout:    { eyes: "soft",    brows: "worried", mouth: "pout",       blush: 0.5 },
  };

  const HAIR = "#3b2433", HAIR_D = "#2a1723", SKIN = "#ffdfc9", SKIN_S = "#f5c8ab";

  function eyes(kind) {
    const gold = "#c9862e", goldD = "#8a5416";
    if (kind === "happy")  return '<path d="M170 174 q12 -11 24 0" class="ln"/><path d="M226 174 q12 -11 24 0" class="ln"/>';
    if (kind === "shy")    return '<path d="M170 172 q12 10 24 0" class="ln"/><path d="M226 172 q12 10 24 0" class="ln"/>';
    if (kind === "soft")   return '<path d="M170 176 q12 -6 24 0" class="ln"/><path d="M170 176 q12 12 24 0" fill="#fff6ec" opacity=".9"/><path d="M226 176 q12 -6 24 0" class="ln"/><path d="M226 176 q12 12 24 0" fill="#fff6ec" opacity=".9"/>';
    if (kind === "wide")   return '<circle cx="182" cy="174" r="13" fill="#fdf3e3"/><circle cx="238" cy="174" r="13" fill="#fdf3e3"/><ellipse cx="182" cy="174" rx="5" ry="7" fill="' + HAIR_D + '"/><ellipse cx="238" cy="174" rx="5" ry="7" fill="' + HAIR_D + '"/><circle cx="184" cy="170" r="2" fill="#fff"/><circle cx="240" cy="170" r="2" fill="#fff"/>';
    if (kind === "wink")   return '<g>' + eyeOne(182) + '</g><path d="M226 174 q12 -11 24 0" class="ln"/>';
    if (kind === "sad")    return eyeSad(182) + eyeSad(238);
    if (kind === "star")   return eyeStar(182) + eyeStar(238);
    if (kind === "cry")    return eyeOne(182) + eyeOne(238) + '<path d="M176 188 q-4 10 2 16" stroke="#9fd4ef" stroke-width="4" fill="none" stroke-linecap="round" opacity=".9"/><path d="M232 188 q-4 10 2 16" stroke="#9fd4ef" stroke-width="4" fill="none" stroke-linecap="round" opacity=".9"/>';
    return eyeOne(182) + eyeOne(238); // normal
  }
  function eyeOne(cx) {
    return '<ellipse cx="' + cx + '" cy="174" rx="9.5" ry="12" fill="#fdf3e3" stroke="' + HAIR_D + '" stroke-width="1.6"/>' +
      '<ellipse cx="' + cx + '" cy="174" rx="7" ry="10" fill="#c9862e"/>' +
      '<ellipse cx="' + cx + '" cy="175" rx="3.4" ry="8" fill="' + HAIR_D + '"/>' +
      '<circle cx="' + (cx + 2.4) + '" cy="169" r="2.6" fill="#fff"/><circle cx="' + (cx - 2) + '" cy="179" r="1.3" fill="#fff" opacity=".8"/>' +
      '<path d="M' + (cx - 12) + ' 163 q12 -7 24 0" stroke="' + HAIR_D + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
  }
  function eyeSad(cx) {
    return '<ellipse cx="' + cx + '" cy="175" rx="9" ry="11" fill="#fdf3e3" stroke="' + HAIR_D + '" stroke-width="1.6"/>' +
      '<ellipse cx="' + cx + '" cy="177" rx="6.4" ry="8" fill="#c9862e"/>' +
      '<ellipse cx="' + cx + '" cy="178" rx="3" ry="6.4" fill="' + HAIR_D + '"/>' +
      '<circle cx="' + (cx + 2) + '" cy="172" r="2" fill="#fff"/>' +
      '<path d="M' + (cx - 11) + ' 165 q8 -5 17 -2" stroke="' + HAIR_D + '" stroke-width="3.2" fill="none" stroke-linecap="round"/>';
  }
  function eyeStar(cx) {
    return '<ellipse cx="' + cx + '" cy="174" rx="10" ry="12" fill="#fdf3e3" stroke="' + HAIR_D + '" stroke-width="1.6"/>' +
      '<path d="M' + cx + ' 165 l2.6 6 6.4.6 -4.8 4.2 1.4 6.2 -5.6 -3.2 -5.6 3.2 1.4 -6.2 -4.8 -4.2 6.4 -.6 z" fill="#e8a33d"/>';
  }

  function brows(kind) {
    const c = HAIR_D, w = 'stroke-width="3" stroke-linecap="round" fill="none"';
    if (kind === "raised") return '<path d="M168 154 q14 -8 27 -3" stroke="' + c + '" ' + w + '/><path d="M225 151 q13 -5 27 3" stroke="' + c + '" ' + w + '/>';
    if (kind === "worried") return '<path d="M168 152 q14 4 26 6" stroke="' + c + '" ' + w + '/><path d="M226 158 q12 -2 26 -6" stroke="' + c + '" ' + w + '/>';
    return '<path d="M168 155 q14 -4 26 0" stroke="' + c + '" ' + w + '/><path d="M226 155 q12 -4 26 0" stroke="' + c + '" ' + w + '/>';
  }

  function mouth(kind) {
    const c = "#a33a3a";
    if (kind === "smileOpen") return '<path d="M199 208 q11 12 22 0 q-11 5 -22 0z" fill="#b04747"/><path d="M199 208 q11 3 22 0" stroke="#7c2d2d" stroke-width="1.6" fill="none"/>';
    if (kind === "grin")      return '<path d="M197 206 q13 15 26 0 z" fill="#b04747"/><path d="M197 206 q13 4 26 0" stroke="#7c2d2d" stroke-width="1.6" fill="none"/><path d="M203 216 l1.6 4 1.6 -4z M216 216 l1.6 4 1.6 -4z" fill="#fff"/>';
    if (kind === "pout")      return '<path d="M201 209 q4.5 5 9 0 q4.5 5 9 0" stroke="' + c + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
    if (kind === "gasp")      return '<ellipse cx="210" cy="211" rx="6" ry="8" fill="#b04747"/>';
    if (kind === "smug")      return '<path d="M200 208 q12 9 22 -2" stroke="' + c + '" stroke-width="2.8" fill="none" stroke-linecap="round"/>';
    if (kind === "wavy")      return '<path d="M201 210 q4 -4 8 0 q4 4 8 0" stroke="' + c + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
    if (kind === "flat")      return '<path d="M202 210 h16" stroke="' + c + '" stroke-width="2.6" stroke-linecap="round"/>';
    return '<path d="M203 207 q7 7 14 0" stroke="' + c + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>'; // smile
  }

  function extras(kind) {
    if (kind === "sweat") return '<path d="M281 136 q7 10 0 15 q-7 -5 0 -15z" fill="#9fd4ef" opacity=".92"/>';
    if (kind === "sparkle") return '<path d="M292 128 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#ffe9a8"/><path d="M132 118 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" fill="#ffe9a8" opacity=".8"/>';
    if (kind === "note") return '<text x="288" y="150" font-size="24" fill="#f0d49a">♪</text>';
    if (kind === "vein") return '<path d="M283 130 l10 10 m0 -10 l-10 10 m5 -14 v4 m-4 3 h-8" stroke="#e06666" stroke-width="3" stroke-linecap="round"/>';
    return "";
  }

  /* ================= 猫娘立绘（AI 差分图：8 张覆盖 15 表情，映射见 CHARA_MAP） ================= */
  const CHARA_MAP = {
    normal: "smile", smile: "smile", happy: "excited", excited: "excited", wink: "excited",
    shy: "shy", surprised: "surprised", soft: "soft", sleepy: "soft", serious: "soft",
    smug: "smug", pout: "smug", sad: "sad", worried: "sad", cry: "cry",
  };
  function catGirl(exprKey) {
    const img = CHARA_MAP[exprKey] || "smile";
    return '<img class="chara-img" src="images/chara_' + img + '.webp" alt="唐猫" draggable="false">';
  }
  /* 预加载全部差分，避免表情切换时闪白 */
  ["smile", "surprised", "sad", "soft", "cry", "excited", "shy", "smug"].forEach(n => {
    const im = new Image();
    im.src = "images/chara_" + n + ".webp";
  });

  /* 旧 SVG 组合式立绘（AI 化前实现，保留备用；如需回退把 catGirl 改回调用此函数） */
  function catGirlSVG(exprKey) {
    const f = Object.assign({}, FACES[exprKey] || FACES.normal);
    const blushO = f.blush;
    return '<svg viewBox="0 0 420 640" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<linearGradient id="cgDress" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8232f"/><stop offset="1" stop-color="#6d121c"/></linearGradient>' +
      '<linearGradient id="cgTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c22b37"/><stop offset="1" stop-color="#96202a"/></linearGradient>' +
      '<linearGradient id="cgPibo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0d49a" stop-opacity=".95"/><stop offset="1" stop-color="#d98f5a" stop-opacity=".55"/></linearGradient>' +
      '<radialGradient id="cgGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffdfc9" stop-opacity=".18"/><stop offset="1" stop-color="#ffdfc9" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<ellipse cx="210" cy="330" rx="180" ry="310" fill="url(#cgGlow)"/>' +
      /* 尾巴 */
      '<g class="tail"><path d="M118 452 q-58 -28 -60 -96 q-1 -38 26 -54" stroke="' + HAIR + '" stroke-width="24" fill="none" stroke-linecap="round"/>' +
      '<path d="M92 318 q-9 -12 -8 -24" stroke="#e9b96a" stroke-width="10" fill="none" stroke-linecap="round" opacity=".9"/></g>' +
      /* 后发 */
      '<path d="M138 120 q-42 88 -34 220 q6 100 -8 190 h228 q-14 -96 -6 -196 q8 -130 -36 -214 q-56 -30 -144 0z" fill="' + HAIR + '"/>' +
      '<path d="M148 320 q-16 90 -12 210 h30 q-10 -110 -6 -210z" fill="' + HAIR_D + '" opacity=".6"/>' +
      '<path d="M272 320 q16 90 12 210 h-30 q10 -110 6 -210z" fill="' + HAIR_D + '" opacity=".6"/>' +
      /* 裙（齐胸襦裙） */
      '<path d="M150 318 q60 -22 120 0 q26 96 76 322 h-272 q50 -226 76 -322z" fill="url(#cgDress)"/>' +
      '<path d="M168 336 q42 14 84 0 l6 22 q-48 16 -96 0z" fill="#d9b26a" opacity=".92"/>' +
      '<path d="M186 352 v288 M210 356 v284 M234 352 v288" stroke="#00000033" stroke-width="3" fill="none"/>' +
      '<path d="M162 358 l-52 282 M258 358 l52 282" stroke="#d9b26a" stroke-width="7" opacity=".55" fill="none"/>' +
      /* 上襦与袖 */
      '<path d="M150 262 q60 -18 120 0 l14 62 q-74 -22 -148 0z" fill="url(#cgTop)"/>' +
      '<path d="M150 262 q-34 14 -46 78 l30 46 q26 -46 42 -60z" fill="url(#cgTop)"/>' +
      '<path d="M270 262 q34 14 46 78 l-30 46 q-26 -46 -42 -60z" fill="url(#cgTop)"/>' +
      '<path d="M104 340 q-10 22 6 44 q22 6 34 -8 q-22 -6 -40 -36z" fill="' + SKIN + '"/>' +
      '<path d="M316 340 q10 22 -6 44 q-22 6 -34 -8 q22 -6 40 -36z" fill="' + SKIN + '"/>' +
      '<path d="M156 268 q54 -16 108 0" stroke="#d9b26a" stroke-width="4" fill="none" opacity=".8"/>' +
      /* 交领 */
      '<path d="M186 258 l24 40 24 -40" stroke="#f0d49a" stroke-width="6" fill="none" stroke-linejoin="round"/>' +
      '<path d="M186 258 l24 40 24 -40" stroke="' + HAIR_D + '" stroke-width="2" fill="none" stroke-linejoin="round" opacity=".35"/>' +
      /* 披帛 */
      '<g class="pibo"><path d="M296 236 q-66 24 -128 8 q-46 -10 -78 22 q40 -4 74 10 q60 22 118 -6 q20 -10 14 -34z" fill="url(#cgPibo)"/>' +
      '<path d="M292 242 q-62 20 -120 6" stroke="#fff" stroke-width="2" opacity=".35" fill="none"/></g>' +
      /* 脖子与铃铛红绳 */
      '<path d="M192 232 h36 v26 h-36z" fill="' + SKIN_S + '"/>' +
      '<path d="M176 252 q34 18 68 0" stroke="#c22b37" stroke-width="9" fill="none"/>' +
      '<circle cx="210" cy="266" r="11" fill="#e8b64c" stroke="#9a6d1e" stroke-width="2"/>' +
      '<path d="M210 257 v6 M210 272 v4 M203 266 h14" stroke="#9a6d1e" stroke-width="1.8"/>' +
      /* 头部 */
      '<ellipse cx="210" cy="176" rx="63" ry="67" fill="' + SKIN + '"/>' +
      '<ellipse cx="210" cy="188" rx="52" ry="52" fill="' + SKIN + '"/>' +
      '<ellipse cx="152" cy="192" rx="12" ry="16" fill="' + SKIN + '"/><ellipse cx="268" cy="192" rx="12" ry="16" fill="' + SKIN + '"/>' +
      /* 腮红 */
      '<ellipse cx="162" cy="198" rx="14" ry="7" fill="#ff9d9d" opacity="' + blushO + '"/><ellipse cx="258" cy="198" rx="14" ry="7" fill="#ff9d9d" opacity="' + blushO + '"/>' +
      eyes(f.eyes) + brows(f.brows) + mouth(f.mouth) + extras(f.extra || (exprKey === "worried" || exprKey === "sad" ? "sweat" : "")) +
      /* 花钿 */
      '<path d="M210 131 l3.4 7 7.6 1 -5.6 5.2 1.5 7.4 -6.9 -3.9 -6.9 3.9 1.5 -7.4 -5.6 -5.2 7.6 -1z" fill="#c22b37"/>' +
      /* 前发 */
      '<path d="M148 148 q10 -52 62 -56 q52 4 62 56 q-14 -26 -34 -30 q4 16 -2 26 q-10 -24 -30 -28 q2 14 -4 22 q-12 -22 -32 -20 q-14 2 -20 30z" fill="' + HAIR + '"/>' +
      /* 发髻 + 红绳 + 金饰 */
      '<circle cx="146" cy="92" r="25" fill="' + HAIR + '"/><circle cx="274" cy="92" r="25" fill="' + HAIR + '"/>' +
      '<path d="M136 108 q10 8 20 0 M264 108 q10 8 20 0" stroke="#c22b37" stroke-width="7" fill="none"/>' +
      '<circle cx="146" cy="76" r="5.5" fill="#e8b64c"/><circle cx="274" cy="76" r="5.5" fill="#e8b64c"/>' +
      '<path d="M146 66 q-8 -14 6 -22 M274 66 q8 -14 -6 -22" stroke="#e8b64c" stroke-width="3" fill="none"/>' +
      /* 猫耳 */
      '<g class="ear-l"><path d="M162 84 q-16 -52 6 -66 q22 12 30 52z" fill="' + HAIR + '"/><path d="M170 74 q-8 -32 6 -42 q12 10 17 36z" fill="#f4a7b8"/></g>' +
      '<g class="ear-r"><path d="M258 84 q16 -52 -6 -66 q-22 12 -30 52z" fill="' + HAIR + '"/><path d="M250 74 q8 -32 -6 -42 q-12 10 -17 36z" fill="#f4a7b8"/></g>' +
      '</svg>';
  }

  /* ================= 白猫（序章/彩蛋形态） ================= */
  function cat() {
    return '<svg viewBox="0 0 240 200" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><radialGradient id="catGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff8ea" stop-opacity=".5"/><stop offset="1" stop-color="#fff8ea" stop-opacity="0"/></radialGradient></defs>' +
      '<ellipse cx="120" cy="120" rx="110" ry="86" fill="url(#catGlow)"/>' +
      '<g class="cat-tail"><path d="M168 148 q44 -6 42 -52" stroke="#efe7db" stroke-width="16" fill="none" stroke-linecap="round"/>' +
      '<path d="M204 100 q6 -10 6 -16" stroke="#e8a33d" stroke-width="9" fill="none" stroke-linecap="round"/></g>' +
      '<ellipse cx="118" cy="138" rx="58" ry="46" fill="#f4ede2"/>' +
      '<ellipse cx="100" cy="130" rx="16" ry="20" fill="#e7dccb"/>' +
      '<circle cx="112" cy="82" r="38" fill="#f7f1e7"/>' +
      '<path d="M84 58 q-10 -26 8 -32 q14 10 16 30z" fill="#f7f1e7"/><path d="M140 58 q10 -26 -8 -32 q-14 10 -16 30z" fill="#f7f1e7"/>' +
      '<path d="M89 44 q-3 -12 6 -15 q7 6 8 16z" fill="#f4a7b8"/><path d="M135 44 q3 -12 -6 -15 q-7 6 -8 16z" fill="#f4a7b8"/>' +
      '<path d="M96 80 q6 -5 12 0" stroke="#4a3a30" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M116 80 q6 -5 12 0" stroke="#4a3a30" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M106 94 q6 5 12 0" stroke="#c76b6b" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<path d="M112 90 l-6 6 M112 90 l6 6 M124 90 l-6 6 M124 90 l6 6" stroke="#bfae97" stroke-width="1.6"/>' +
      '<path d="M88 96 q-26 6 -40 2 M136 96 q26 6 40 2" stroke="#d9cbb4" stroke-width="2" fill="none"/>' +
      '<path d="M86 112 q26 10 52 0" stroke="#c22b37" stroke-width="7" fill="none"/>' +
      '<circle cx="112" cy="120" r="7.5" fill="#e8b64c" stroke="#9a6d1e" stroke-width="1.6"/>' +
      '<path d="M112 114 v4 M112 125 v3 M106 120 h12" stroke="#9a6d1e" stroke-width="1.4"/>' +
      '</svg>';
  }

  /* ================= 场景背景（AI 厚涂竖版图包装为 svg，900x1600 与 9:16 生成图精确匹配） ================= */
  function photoBg(src, extra) {
    return '<svg viewBox="0 0 900 1600" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<image href="images/' + src + '" width="900" height="1600"/>' + (extra || "") +
      '</svg>';
  }

  function bgStreet(dawn) {
    return photoBg(dawn ? "bg_dawn.jpg" : "bg_street.jpg");
  }

  function bgCourt() {
    return photoBg("bg_court.jpg");
  }
  function bgTable() {
    return photoBg("bg_table.jpg");
  }
  function bgFire() {
    return photoBg("bg_fire.jpg");
  }

  /* 雨夜巷口：屋檐、雨丝、地面倒影 */
  function rainLines(op) {
    let s = "";
    for (let i = 0; i < 34; i++) {
      const x = (i * 53 + 20) % 800, y = (i * 97) % 900, len = 26 + (i % 4) * 9;
      s += '<line x1="' + x + '" y1="' + y + '" x2="' + (x - 7) + '" y2="' + (y + len) + '" stroke="#aebfd8" stroke-width="' + (1 + (i % 3) * 0.7) + '" opacity="' + (op * (0.3 + (i % 5) * 0.1)).toFixed(2) + '"/>';
    }
    return s;
  }
  /* 雨夜巷口：AI 图 + CSS 动画雨丝两层叠加增强动态 */
  function rainLines(op) {
    let s = "";
    for (let i = 0; i < 40; i++) {
      const x = (i * 61 + 20) % 900, y = (i * 137) % 1450, len = 26 + (i % 4) * 9;
      s += '<line x1="' + x + '" y1="' + y + '" x2="' + (x - 8) + '" y2="' + (y + len) + '" stroke="#aebfd8" stroke-width="' + (1 + (i % 3) * 0.7) + '" opacity="' + (op * (0.3 + (i % 5) * 0.1)).toFixed(2) + '"/>';
    }
    return s;
  }
  function bgRain() {
    return photoBg("bg_rain.jpg",
      '<g class="rain-a">' + rainLines(0.5) + '</g>' +
      '<g class="rain-b">' + rainLines(0.85) + '</g>');
  }

  /* 白天庭院：室内望向窗外，窗台白猫打盹（AI 图自带） */
  function bgDay() {
    return photoBg("bg_day.jpg");
  }

  /* 后厨：灶火、蒸笼、蒸汽（AI 图自带） */
  function bgKitchen() {
    return photoBg("bg_kitchen.jpg");
  }

  const BGS = {
    street: () => bgStreet(false),
    dawn: () => bgStreet(true),
    court: bgCourt,
    table: bgTable,
    fire: bgFire,
    rain: bgRain,
    day: bgDay,
    kitchen: bgKitchen,
  };

  /* ================= 菜品 CG ================= */
  const dishFrame = (inner) =>
    '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><radialGradient id="dGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffcf7e" stop-opacity=".28"/><stop offset="1" stop-color="#ffcf7e" stop-opacity="0"/></radialGradient></defs>' +
    '<rect width="400" height="300" fill="#160b10"/>' +
    '<circle cx="200" cy="150" r="140" fill="url(#dGlow)"/>' + inner + '</svg>';

  const steam = (paths) => '<g stroke="#ffffff66" stroke-width="7" fill="none" stroke-linecap="round">' + paths + '</g>';

  const DISHES = {
    guozyu: () => dishFrame(
      '<ellipse cx="200" cy="238" rx="150" ry="26" fill="#0d0608"/>' +
      '<rect x="120" y="222" width="160" height="18" rx="6" fill="#3a2014"/>' +
      '<path d="M92 130 q108 -44 216 0 q10 78 -108 92 q-118 -14 -108 -92z" fill="#8a5416"/>' +
      '<path d="M92 130 q108 -44 216 0 q4 26 -18 46 q-90 24 -180 0 q-22 -20 -18 -46z" fill="#b8742a"/>' +
      '<ellipse cx="200" cy="138" rx="100" ry="26" fill="#e8933c"/>' +
      '<ellipse cx="200" cy="136" rx="88" ry="21" fill="#f4a44e"/>' +
      '<path d="M136 136 q34 -18 128 -4 q-40 22 -128 4z" fill="#fdf3e3"/>' +
      '<path d="M150 132 q22 -10 44 -2 M196 130 q26 -2 48 6" stroke="#c9c2b2" stroke-width="4" fill="none"/>' +
      '<circle cx="154" cy="142" r="6" fill="#c22b37"/><circle cx="248" cy="140" r="5.5" fill="#c22b37"/><circle cx="224" cy="148" r="4" fill="#c22b37"/>' +
      '<path d="M176 146 q10 4 20 0 M212 144 q10 4 18 -2" stroke="#4d8f4d" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      steam('<path d="M164 108 q-14 -30 4 -56 M204 100 q12 -32 -4 -60 M244 108 q16 -26 0 -54"/>') +
      '<path d="M96 132 q104 -40 208 0" stroke="#5d8aa0" stroke-width="8" fill="none" opacity=".9"/>' +
      '<rect x="168" y="96" width="64" height="12" rx="6" fill="#4a2818"/>' +
      '<circle cx="200" cy="88" r="10" fill="#c22b37"/><circle cx="200" cy="88" r="4" fill="#f0d49a"/>'
    ),
    huluji: () => dishFrame(
      '<ellipse cx="200" cy="240" rx="150" ry="26" fill="#0d0608"/>' +
      '<ellipse cx="200" cy="226" rx="136" ry="24" fill="#1d1418"/>' +
      '<ellipse cx="200" cy="220" rx="130" ry="21" fill="#efe7db"/>' +
      '<ellipse cx="200" cy="217" rx="112" ry="16" fill="#d9d0c0"/>' +
      '<path d="M138 190 q-6 -70 62 -70 q68 0 62 70 q12 34 -62 34 q-74 0 -62 -34z" fill="#d98f2e"/>' +
      '<path d="M152 176 q-4 -52 48 -52 q52 0 48 52 q4 26 -48 26 q-52 0 -48 -26z" fill="#eab54a"/>' +
      '<path d="M172 148 q10 -22 34 -20" stroke="#ffe9a8" stroke-width="8" fill="none" stroke-linecap="round" opacity=".85"/>' +
      '<path d="M150 176 q-34 6 -44 34 q26 8 44 -8z" fill="#d98f2e"/><path d="M250 176 q34 6 44 34 q-26 8 -44 -8z" fill="#d98f2e"/>' +
      '<path d="M108 208 q-16 4 -20 18 q14 4 24 -6z" fill="#eab54a"/><path d="M292 208 q16 4 20 18 q-14 4 -24 -6z" fill="#eab54a"/>' +
      '<path d="M200 118 q-8 -14 0 -22 q8 8 0 22z" fill="#eab54a"/>' +
      '<path d="M154 232 q46 14 92 0" stroke="#4d8f4d" stroke-width="6" fill="none" opacity=".8"/>' +
      '<circle cx="140" cy="228" r="6" fill="#c22b37"/><circle cx="258" cy="226" r="6" fill="#c22b37"/>' +
      steam('<path d="M180 96 q-12 -26 2 -48 M222 94 q14 -24 2 -50"/>')
    ),
    tasu: () => dishFrame(
      '<ellipse cx="200" cy="244" rx="130" ry="22" fill="#0d0608"/>' +
      '<ellipse cx="200" cy="232" rx="118" ry="19" fill="#efe7db"/>' +
      '<ellipse cx="200" cy="228" rx="100" ry="14" fill="#dccfb4"/>' +
      '<rect x="160" y="196" width="80" height="14" rx="4" fill="#caa14e"/>' +
      '<path d="M148 196 h104 l-10 -12 h-84z" fill="#dcb268"/>' +
      '<rect x="156" y="162" width="88" height="22" rx="4" fill="#eab54a"/>' +
      '<path d="M144 162 h112 l-12 -13 h-88z" fill="#f0c878"/>' +
      '<rect x="166" y="126" width="68" height="23" rx="4" fill="#eab54a"/>' +
      '<path d="M154 126 h92 l-12 -12 h-68z" fill="#f0c878"/>' +
      '<rect x="178" y="92" width="44" height="22" rx="4" fill="#eab54a"/>' +
      '<path d="M168 92 h64 l-10 -11 h-44z" fill="#f0c878"/>' +
      '<rect x="188" y="62" width="24" height="19" rx="4" fill="#eab54a"/>' +
      '<circle cx="200" cy="54" r="8" fill="#caa14e"/>' +
      '<path d="M166 152 q8 4 16 0 M222 150 q8 4 14 0 M176 116 q8 4 14 0 M216 116 q8 4 14 0" stroke="#b8862e" stroke-width="3" fill="none" opacity=".7"/>' +
      '<circle cx="146" cy="216" r="4" fill="#caa14e"/><circle cx="256" cy="212" r="4" fill="#caa14e"/><circle cx="240" cy="220" r="3" fill="#caa14e"/>'
    ),
    feizixiao: () => dishFrame(
      '<ellipse cx="200" cy="244" rx="130" ry="22" fill="#0d0608"/>' +
      '<ellipse cx="200" cy="230" rx="118" ry="19" fill="#2e2a33"/>' +
      '<path d="M110 226 l24 -14 30 10 26 -12 32 12 28 -10 30 14 -20 12 h-130z" fill="#e8eef2" opacity=".9"/>' +
      '<path d="M132 226 l18 -8 22 6 M232 226 l20 -8 18 8" stroke="#c8d4dc" stroke-width="4" fill="none"/>' +
      lychee(140, 190) + lychee(200, 178) + lychee(258, 190) + lychee(168, 206) + lychee(230, 208) + lychee(200, 196) +
      '<path d="M200 168 q6 -22 24 -26" stroke="#4d8f4d" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="228" cy="140" rx="12" ry="6" fill="#4d8f4d" transform="rotate(-24 228 140)"/>' +
      '<path d="M120 150 q30 -18 64 -12 M280 150 q-30 -18 -64 -12" stroke="#bfe3ea" stroke-width="4" fill="none" opacity=".5" stroke-linecap="round"/>'
    ),
    maobisu: () => dishFrame(
      '<ellipse cx="200" cy="244" rx="120" ry="20" fill="#0d0608"/>' +
      '<path d="M150 150 h100 l-14 84 h-72z" fill="#2e3a4a"/>' +
      '<ellipse cx="200" cy="150" rx="50" ry="13" fill="#425270"/>' +
      '<ellipse cx="200" cy="148" rx="42" ry="10" fill="#54658a"/>' +
      brush(158, 130, -14) + brush(242, 130, 14) + brush(178, 120, -8) + brush(222, 120, 8) + brush(200, 112, -2) + brush(200, 126, 3) +
      '<ellipse cx="200" cy="236" rx="88" ry="15" fill="#1d1418"/>' +
      '<ellipse cx="200" cy="231" rx="80" ry="12" fill="#33262c"/>' +
      '<ellipse cx="200" cy="228" rx="64" ry="9" fill="#221a20"/>' +
      '<circle cx="184" cy="224" r="8" fill="#3d2e36"/><circle cx="212" cy="226" r="6" fill="#3d2e36"/>'
    ),
    babaocha: () => dishFrame(
      '<ellipse cx="200" cy="248" rx="120" ry="20" fill="#0d0608"/>' +
      '<ellipse cx="200" cy="236" rx="104" ry="16" fill="#cfd8dc"/>' +
      '<ellipse cx="200" cy="232" rx="96" ry="13" fill="#e8eef2"/>' +
      '<path d="M132 176 q0 56 68 56 q68 0 68 -56z" fill="#efe7db"/>' +
      '<path d="M132 176 q68 24 136 0" stroke="#c22b37" stroke-width="6" fill="none"/>' +
      '<circle cx="166" cy="208" r="7" fill="#e0503c"/><circle cx="196" cy="216" r="6" fill="#d9772e"/><circle cx="228" cy="210" r="6" fill="#8a5416"/><circle cx="212" cy="200" r="4" fill="#4d8f4d"/>' +
      '<path d="M120 158 q80 -30 152 8 l-12 16 q-68 -32 -130 -2z" fill="#efe7db" stroke="#cfd8dc" stroke-width="3"/>' +
      '<circle cx="200" cy="142" r="9" fill="#caa14e"/>' +
      steam('<path d="M172 132 q-12 -30 4 -56 M216 130 q14 -28 2 -56"/>')
    ),
    youmian: () => dishFrame(
      '<ellipse cx="200" cy="244" rx="128" ry="22" fill="#0d0608"/>' +
      '<path d="M92 168 q108 -36 216 0 q10 52 -108 66 q-118 -14 -108 -66z" fill="#2e3a4a"/>' +
      '<ellipse cx="200" cy="170" rx="102" ry="26" fill="#f2ead8"/>' +
      '<path d="M118 168 q28 -14 52 -6 M150 176 q30 -10 58 0 M176 166 q28 -8 54 2 M120 178 q24 6 44 12 M196 178 q30 -4 56 -8" stroke="#e2cfa8" stroke-width="7" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="200" cy="172" rx="42" ry="12" fill="#c22b37" opacity=".92"/>' +
      '<ellipse cx="200" cy="170" rx="36" ry="9" fill="#e0503c"/>' +
      '<path d="M182 166 q10 -6 22 0 M206 168 q10 -4 20 -2" stroke="#4d8f4d" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<circle cx="188" cy="166" r="2.4" fill="#8a5416"/><circle cx="212" cy="168" r="2.4" fill="#8a5416"/><circle cx="200" cy="163" r="2.4" fill="#8a5416"/>' +
      '<path d="M160 158 q-4 -10 4 -16 M244 158 q4 -10 -4 -16" stroke="#ffcf5e" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>' +
      steam('<path d="M170 146 q-12 -26 2 -48 M228 144 q12 -24 2 -48"/>')
    ),
    choujiu: () => dishFrame(
      '<ellipse cx="200" cy="250" rx="110" ry="18" fill="#0d0608"/>' +
      '<path d="M164 120 h72 l10 118 q-46 14 -92 0z" fill="#f2ead8" stroke="#d9c9a8" stroke-width="3"/>' +
      '<rect x="160" y="108" width="80" height="14" rx="4" fill="#e2d4b2"/>' +
      '<path d="M172 140 q28 8 56 0 l4 90 q-32 10 -64 0z" fill="#fdf6e8" opacity=".9"/>' +
      '<circle cx="188" cy="168" r="3" fill="#e8c86a" opacity=".7"/><circle cx="212" cy="190" r="2.6" fill="#e8c86a" opacity=".7"/><circle cx="196" cy="210" r="2.2" fill="#e8c86a" opacity=".7"/>' +
      '<path d="M258 190 q26 -6 30 -30 M262 196 q22 2 34 -14" stroke="#f4a7b8" stroke-width="3" fill="none" opacity=".85"/>' +
      '<ellipse cx="296" cy="222" rx="34" ry="12" fill="#f2ead8"/>' +
      '<path d="M270 218 q26 -12 52 0" stroke="#e2d4b2" stroke-width="4" fill="none"/>' +
      '<text x="188" y="86" font-size="15" fill="#d9b26a" letter-spacing="4">黄桂稠酒</text>'
    ),
    guihua: () => dishFrame(
      '<ellipse cx="200" cy="250" rx="110" ry="18" fill="#0d0608"/>' +
      '<path d="M150 100 h60 l8 140 q-38 14 -76 0z" fill="#8a5416"/>' +
      '<path d="M156 110 h48 l7 128 q-31 12 -62 0z" fill="#d98f2e" opacity=".92"/>' +
      '<rect x="146" y="88" width="68" height="14" rx="4" fill="#6b3a16"/>' +
      '<circle cx="180" cy="150" r="5" fill="#f4c96a"/><circle cx="186" cy="178" r="4" fill="#f4c96a"/>' +
      '<circle cx="266" cy="212" r="26" fill="#cfd8dc"/><path d="M240 212 h52 M266 186 v52" stroke="#aebac0" stroke-width="3"/>' +
      '<circle cx="266" cy="198" r="9" fill="#e8b64c" opacity=".8"/>' +
      '<circle cx="316" cy="230" r="20" fill="#cfd8dc"/><circle cx="316" cy="222" r="7" fill="#e8b64c" opacity=".8"/>' +
      '<g><circle cx="120" cy="120" r="3.4" fill="#f4c96a"/><circle cx="136" cy="140" r="2.6" fill="#f4c96a"/><circle cx="112" cy="152" r="2.2" fill="#f4c96a" opacity=".8"/></g>' +
      '<path d="M132 108 q-8 -12 2 -20 M140 122 q6 -10 16 -10" stroke="#4d8f4d" stroke-width="3" fill="none" opacity=".8"/>'
    ),
    qianlong: () => dishFrame(
      '<ellipse cx="200" cy="248" rx="120" ry="20" fill="#0d0608"/>' +
      '<path d="M96 150 q104 -34 208 0 q12 62 -104 80 q-116 -18 -104 -80z" fill="#1d1418"/>' +
      '<ellipse cx="200" cy="152" rx="98" ry="24" fill="#2e2228"/>' +
      leafBites() +
      '<ellipse cx="200" cy="150" rx="40" ry="11" fill="#c9a86a" opacity=".9"/>'
    ),
    haizhe: () => dishFrame(
      '<ellipse cx="200" cy="248" rx="120" ry="20" fill="#0d0608"/>' +
      '<ellipse cx="200" cy="232" rx="108" ry="17" fill="#efe7db"/>' +
      jelly() +
      '<circle cx="164" cy="216" r="7" fill="#e0503c"/><circle cx="238" cy="218" r="6" fill="#e0503c"/>' +
      '<path d="M150 204 q8 -10 18 -6 M240 202 q10 -4 18 4" stroke="#4d8f4d" stroke-width="4" fill="none" stroke-linecap="round"/>'
    ),
    ziyang: () => dishFrame(
      '<ellipse cx="200" cy="250" rx="130" ry="22" fill="#0d0608"/>' +
      '<path d="M88 150 q112 -34 224 0 q12 66 -112 84 q-124 -18 -112 -84z" fill="#8a5416"/>' +
      '<ellipse cx="200" cy="152" rx="104" ry="26" fill="#d9a05a"/>' +
      '<path d="M132 148 q34 -26 72 -18 q40 6 64 22 q-52 16 -136 -4z" fill="#e8c07a"/>' +
      '<ellipse cx="176" cy="140" rx="26" ry="14" fill="#f2d9a8"/>' +
      '<path d="M160 138 q16 -10 32 -2" stroke="#c9862e" stroke-width="3" fill="none"/>' +
      '<circle cx="238" cy="144" r="10" fill="#e8933c"/><circle cx="254" cy="152" r="9" fill="#e8933c"/><circle cx="224" cy="154" r="8" fill="#e8933c"/>' +
      '<path d="M150 158 q40 14 100 4" stroke="#ffffff55" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      steam('<path d="M166 128 q-10 -26 2 -48 M232 126 q12 -24 2 -48"/>')
    ),
    wulongxia: () => dishFrame(
      '<ellipse cx="200" cy="248" rx="120" ry="20" fill="#0d0608"/>' +
      '<ellipse cx="200" cy="232" rx="106" ry="17" fill="#efe7db"/>' +
      shrimpBall(158, 208) + shrimpBall(206, 198) + shrimpBall(248, 212) + shrimpBall(184, 222) + shrimpBall(228, 228) +
      '<path d="M140 196 q10 -14 24 -10 M250 200 q12 -8 24 0" stroke="#2e5236" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="176" cy="190" rx="11" ry="5" fill="#3d6b46" transform="rotate(-20 176 190)"/>' +
      '<ellipse cx="222" cy="184" rx="10" ry="4.6" fill="#3d6b46" transform="rotate(15 222 184)"/>' +
      steam('<path d="M200 168 q-10 -24 2 -46"/>')
    ),
  };
  function leafBites() {
    let s = "";
    const ps = [[150, 150, -30], [180, 138, 10], [212, 142, -15], [244, 152, 25], [196, 158, 40], [164, 160, 65]];
    for (const p of ps) {
      s += '<g transform="translate(' + p[0] + ',' + p[1] + ') rotate(' + p[2] + ')">' +
        '<path d="M-26 0 q26 -20 52 0 q-26 20 -52 0z" fill="#dcefc8"/>' +
        '<path d="M-22 0 h44" stroke="#b8d49a" stroke-width="3"/>' +
        '<ellipse rx="24" ry="9" fill="#c9a86a" opacity=".65"/></g>';
    }
    return s;
  }
  function jelly() {
    let s = "";
    for (let i = 0; i < 9; i++) {
      const x = 128 + (i * 68) % 150, y = 200 + (i * 37) % 34;
      s += '<path d="M' + x + " " + y + " q6 -12 12 0 q-6 12 -12 0z\" fill=\"#e8e2d4\" opacity=\".9\" stroke=\"#c9c2b2\" stroke-width=\"1\"/>";
    }
    return s;
  }
  function shrimpBall(x, y) {
    return '<g><circle cx="' + x + '" cy="' + y + '" r="15" fill="#e8933c"/><circle cx="' + (x - 4) + '" cy="' + (y - 4) + '" r="6" fill="#f4b26a"/><path d="M' + (x - 9) + " " + (y + 2) + " q4 8 12 8 M" + (x + 2) + " " + (y + 9) + " q7 0 11 -6\" stroke=\"#c96f22\" stroke-width=\"2.6\" fill=\"none\"/></g>";
  }
  function lychee(x, y) {
    let d = "";
    for (let i = 0; i < 5; i++) {
      const a = i * 1.7;
      d += '<circle cx="' + (x + Math.cos(a) * 8) + '" cy="' + (y + Math.sin(a) * 8) + '" r="1.6" fill="#a53030"/>';
    }
    return '<g><circle cx="' + x + '" cy="' + y + '" r="17" fill="#d44848"/><circle cx="' + (x - 4) + '" cy="' + (y - 5) + '" r="6" fill="#e87a7a" opacity=".8"/>' + d + '</g>';
  }
  function brush(x, y, tilt) {
    return '<g transform="translate(' + x + ',' + y + ') rotate(' + tilt + ')">' +
      '<rect x="-6" y="-6" width="12" height="56" rx="4" fill="#e2b56a"/>' +
      '<rect x="-6" y="-6" width="5" height="56" fill="#f0cd8c" rx="2"/>' +
      '<rect x="-7" y="10" width="14" height="7" fill="#c22b37"/>' +
      '<path d="M-5 50 q5 22 10 0 q-2 -8 -10 0z" fill="#5a4030"/>' +
      '</g>';
  }

  /* ================= 标题背景（竖版主视觉：白猫坐石阶回望+灯笼庭院+大雁塔，上部深色天空留给标题文字） ================= */
  function titleBg() {
    return photoBg("bg_title.jpg");
  }

  return { catGirl, cat, BGS, DISHES, titleBg };
})();
