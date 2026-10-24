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

  function catGirl(exprKey) {
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

  /* ================= 场景背景 ================= */
  function lantern(x, y, s, hue) {
    const c = hue || "#e0503c";
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<circle r="46" fill="' + c + '" opacity=".16"/>' +
      '<line x1="0" y1="-40" x2="0" y2="-28" stroke="#caa14e" stroke-width="3"/>' +
      '<ellipse rx="22" ry="27" fill="' + c + '"/>' +
      '<ellipse rx="22" ry="27" fill="none" stroke="#f5c96a" stroke-width="2" opacity=".7"/>' +
      '<path d="M-22 0 h44 M-14 -20 q14 -5 28 0 M-14 20 q14 5 28 0" stroke="#a13626" stroke-width="2" fill="none" opacity=".7"/>' +
      '<ellipse rx="16" ry="20" fill="#ffb35c" opacity=".45"/>' +
      '<line x1="0" y1="27" x2="0" y2="40" stroke="#caa14e" stroke-width="3"/>' +
      '</g>';
  }

  function pagoda(x, baseY, s, fill) {
    let g = '<g transform="translate(' + x + ',' + baseY + ') scale(' + s + ')">';
    const tiers = [[-46, 0, 92, 54], [-38, 54, 76, 50], [-31, 104, 62, 46], [-24, 150, 48, 42], [-17, 192, 34, 38], [-11, 230, 22, 30]];
    g += '<rect x="-52" y="-14" width="104" height="18" fill="' + fill + '"/>';
    for (const t of tiers) {
      g += '<path d="M' + (t[0] - 8) + ' ' + t[1] + ' h' + (t[2] + 16) + ' l-8 -10 h-' + t[2] + 'z" fill="' + fill + '"/>' +
        '<rect x="' + t[0] + '" y="' + t[1] + '" width="' + t[2] + '" height="' + t[3] + '" fill="' + fill + '"/>';
    }
    g += '<rect x="-14" y="260" width="28" height="60" fill="' + fill + '"/><circle cx="0" cy="252" r="12" fill="' + fill + '"/>' +
      '<path d="M0 192 v-40 M-8 168 h16" stroke="' + fill + '" stroke-width="6"/>' +
      '<circle cx="0" cy="330" r="7" fill="' + fill + '"/></g>';
    return g;
  }

  function stars() {
    let s = "";
    const pts = [[80,120],[190,70],[300,150],[420,90],[520,200],[640,110],[710,240],[140,260],[560,320],[680,380],[60,420],[750,140]];
    for (let i = 0; i < pts.length; i++) {
      const o = 0.35 + (i % 4) * 0.15;
      s += '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="' + (1.6 + (i % 3)) + '" fill="#fff" opacity="' + o + '"/>';
    }
    return s;
  }

  function sky(id, top, mid, bottom) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + top + '"/><stop offset="0.55" stop-color="' + mid + '"/><stop offset="1" stop-color="' + bottom + '"/></linearGradient>';
  }

  function bgStreet(dawn) {
    const d = !!dawn;
    return '<svg viewBox="0 0 800 1200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' + sky("stSky", d ? "#2b2340" : "#0d0b1e", d ? "#5a3a52" : "#241735", d ? "#a06a5c" : "#452038") +
      '<radialGradient id="stMoon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6dc" stop-opacity=".9"/><stop offset=".35" stop-color="#ffe9b0" stop-opacity=".35"/><stop offset="1" stop-color="#ffe9b0" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="800" height="1200" fill="url(#stSky)"/>' + stars() +
      (d ? "" : '<circle cx="600" cy="190" r="130" fill="url(#stMoon)"/><circle cx="600" cy="190" r="52" fill="#fdf3d7"/>') +
      '<rect x="0" y="700" width="800" height="500" fill="' + (d ? "#3d2a3a" : "#160d20") + '" opacity=".9"/>' +
      /* 远处城楼与塔 */
      pagoda(180, 560, 0.9, d ? "#241826" : "#120a1a") +
      '<path d="M420 720 h360 v-90 l-40 -30 -60 20 -40 -40 -80 30 -60 -20 -40 40 -40 -10z" fill="' + (d ? "#241826" : "#120a1a") + '"/>' +
      /* 灯笼串 */
      '<path d="M0 340 q200 90 400 0 t400 60" stroke="#5a4030" stroke-width="3" fill="none" opacity=".8"/>' +
      lantern(70, 420, 1.1) + lantern(190, 470, 0.85) + lantern(310, 428, 1) + lantern(430, 480, 0.8) + lantern(560, 430, 1.05) + lantern(690, 480, 0.9) +
      /* 地面 */
      '<rect x="0" y="880" width="800" height="320" fill="' + (d ? "#2e2028" : "#0f0a14") + '"/>' +
      '<path d="M0 880 q400 -60 800 0 v40 q-400 -60 -800 0z" fill="' + (d ? "#3a2830" : "#1a1122") + '"/>' +
      /* 人群波光 */
      '<g opacity=".55">' + bokeh() + '</g>' +
      /* 前景大灯笼 */
      lantern(700, 780, 2.2) + lantern(60, 820, 1.7, "#d98f5a") +
      '</svg>';
  }
  function bokeh() {
    let s = "";
    const cs = ["#ffb35c", "#e0503c", "#f5c96a", "#d98f5a", "#f4a7b8"];
    for (let i = 0; i < 26; i++) {
      const x = (i * 137 + 40) % 780 + 10, y = 900 + (i * 53 % 260), r = 3 + (i % 4) * 2;
      s += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + cs[i % 5] + '" opacity=".5"/>';
    }
    return s;
  }

  function bgCourt() {
    return '<svg viewBox="0 0 800 1200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' + sky("ctWall", "#4d141c", "#6d1a22", "#3a0f16") +
      '<radialGradient id="ctLamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffcf7e" stop-opacity=".55"/><stop offset="1" stop-color="#ffcf7e" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="800" height="1200" fill="url(#ctWall)"/>' +
      /* 木柱 */
      '<rect x="40" y="0" width="42" height="980" fill="#2b1410"/><rect x="718" y="0" width="42" height="980" fill="#2b1410"/>' +
      '<rect x="40" y="0" width="42" height="980" fill="#00000022"/>' +
      /* 花格窗与月 */
      '<g><circle cx="612" cy="220" r="54" fill="#fdf3d7" opacity=".95"/>' +
      '<rect x="512" y="110" width="200" height="240" fill="#00000000" stroke="#8a5416" stroke-width="7"/>' +
      '<path d="M512 150 h200 M512 190 h200 M512 230 h200 M512 270 h200 M512 310 h200 M562 110 v240 M662 110 v240" stroke="#8a5416" stroke-width="5" opacity=".8"/></g>' +
      '<rect x="88" y="110" width="200" height="240" fill="#00000030" stroke="#8a5416" stroke-width="7"/>' +
      '<path d="M88 150 h200 M88 190 h200 M88 230 h200 M88 270 h200 M88 310 h200 M138 110 v240 M238 110 v240" stroke="#8a5416" stroke-width="5" opacity=".55"/>' +
      /* 檐 */
      '<rect x="0" y="0" width="800" height="60" fill="#1d0d0a"/>' +
      '<path d="M0 60 h800 v18 h-800z" fill="#8a5416" opacity=".8"/>' +
      /* 吊灯 */
      lantern(280, 200, 1.5) + lantern(520, 160, 1.2) +
      '<circle cx="280" cy="235" r="150" fill="url(#ctLamp)"/>' +
      /* 桌与菜 */
      tableSet(230, 880, 1.1) + tableSet(560, 1010, 1.35) +
      /* 地面 */
      '<rect x="0" y="980" width="800" height="220" fill="#200c0e"/>' +
      '<path d="M0 980 q400 -40 800 0 v30 q-400 -36 -800 0z" fill="#2e1114"/>' +
      /* 梅枝 */
      '<path d="M-10 90 q120 30 150 130 q14 46 60 66" stroke="#3a2028" stroke-width="10" fill="none"/>' +
      '<path d="M60 140 q40 -20 66 4 M96 190 q44 -14 64 16" stroke="#3a2028" stroke-width="6" fill="none"/>' +
      blossoms() +
      '</svg>';
  }
  function blossoms() {
    let s = "";
    const pts = [[36,120],[92,150],[60,196],[150,220],[176,182],[128,262],[196,268],[214,214],[248,300],[168,300]];
    for (const p of pts) {
      s += '<g transform="translate(' + p[0] + ',' + p[1] + ')">' +
        '<circle r="5" cx="-6" cy="0" fill="#f4a7b8"/><circle r="5" cx="6" cy="0" fill="#f4a7b8"/><circle r="5" cx="0" cy="-6" fill="#f7c0cc"/><circle r="5" cx="0" cy="6" fill="#f4a7b8"/><circle r="3.4" fill="#e8b64c"/></g>';
    }
    return s;
  }
  function tableSet(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<ellipse rx="150" ry="34" cx="0" cy="10" fill="#1a0d08"/>' +
      '<ellipse rx="150" ry="34" fill="#4a2818"/>' +
      '<ellipse rx="150" ry="34" fill="none" stroke="#6b3a22" stroke-width="6"/>' +
      '<rect x="-20" y="30" width="40" height="120" fill="#331c10"/>' +
      '<ellipse cx="-80" cy="-4" rx="34" ry="10" fill="#efe7db"/><circle cx="-92" cy="-6" r="6" fill="#b04747"/><circle cx="-78" cy="-2" r="5" fill="#c9862e"/>' +
      '<ellipse cx="-10" cy="-8" rx="40" ry="12" fill="#efe7db"/><path d="M-40 -12 q30 -14 60 0 q-30 8 -60 0z" fill="#d9772e"/><circle cx="-22" cy="-14" r="4" fill="#8a5416"/><circle cx="0" cy="-12" r="4" fill="#8a5416"/>' +
      '<ellipse cx="70" cy="-4" rx="28" ry="9" fill="#efe7db"/><circle cx="62" cy="-8" r="6" fill="#4d8f4d"/><circle cx="78" cy="-6" r="5" fill="#e0503c"/>' +
      '<path d="M-10 -24 q-8 -26 4 -44 M-6 -26 q10 -22 24 -30" stroke="#ffffff55" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '</g>';
  }

  function bgTable() {
    return '<svg viewBox="0 0 800 1200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' + sky("tbSky", "#170a10", "#241019", "#31161a") +
      '<radialGradient id="tbCandle" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffcf7e" stop-opacity=".7"/><stop offset="1" stop-color="#ffcf7e" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="800" height="1200" fill="url(#tbSky)"/>' +
      '<rect x="0" y="520" width="800" height="680" fill="#3a2014"/>' +
      '<path d="M0 520 q400 -30 800 0 v30 q-400 -26 -800 0z" fill="#54321e"/>' +
      '<path d="M0 640 h800 M0 820 h800 M0 1040 h800" stroke="#00000030" stroke-width="4"/>' +
      '<path d="M120 560 l560 40 M0 900 l800 -60" stroke="#00000026" stroke-width="6"/>' +
      '<circle cx="140" cy="480" r="150" fill="url(#tbCandle)"/>' +
      '<rect x="128" y="470" width="24" height="40" fill="#e8e0d0"/>' +
      '<ellipse cx="140" cy="466" rx="8" ry="16" fill="#ffcf5e"/><ellipse cx="140" cy="470" rx="4.4" ry="10" fill="#fff3c0"/>' +
      /* 八宝茶盖碗 */
      '<g transform="translate(400,620)">' +
      '<ellipse cx="0" cy="86" rx="98" ry="22" fill="#220f10"/>' +
      '<ellipse rx="96" ry="20" cy="76" fill="#cfd8dc"/>' +
      '<path d="M-72 -18 q0 66 72 66 q72 0 72 -66z" fill="#efe7db"/>' +
      '<path d="M-72 -18 q72 26 144 0" stroke="#c22b37" stroke-width="7" fill="none"/>' +
      '<circle cx="-46" cy="16" r="7" fill="#e0503c"/><circle cx="-20" cy="26" r="6" fill="#d9772e"/><circle cx="18" cy="24" r="6" fill="#8a5416"/>' +
      '<path d="M-80 -34 q80 -30 148 6 l-12 16 q-66 -30 -128 -4z" fill="#efe7db" stroke="#cfd8dc" stroke-width="3"/>' +
      '<path d="M-8 -46 q14 -40 6 -70 M18 -44 q26 -30 34 -64" stroke="#ffffff44" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '</g>' +
      /* 小菜碟 */
      '<g transform="translate(630,760)"><ellipse rx="72" ry="20" fill="#220f10"/><ellipse rx="70" ry="18" fill="#efe7db"/><circle cx="-30" cy="-4" r="10" fill="#b04747"/><circle cx="-6" cy="0" r="9" fill="#c9862e"/><circle cx="20" cy="-4" r="8" fill="#4d8f4d"/></g>' +
      '<g transform="translate(190,800)"><ellipse rx="60" ry="17" fill="#220f10"/><ellipse rx="58" ry="15" fill="#efe7db"/><path d="M-40 -4 q40 -20 80 0 q-40 12 -80 0z" fill="#e8b64c"/></g>' +
      '</svg>';
  }

  function bgFire() {
    let fw = "";
    const bursts = [[180, 220, "#f5c96a"], [560, 160, "#e0503c"], [400, 320, "#7ec8c0"], [660, 300, "#f4a7b8"], [120, 420, "#f5c96a"], [520, 460, "#7ec8c0"]];
    for (const b of bursts) {
      fw += '<g opacity=".9"><circle cx="' + b[0] + '" cy="' + b[1] + '" r="7" fill="' + b[2] + '"/>';
      for (let a = 0; a < 12; a++) {
        const ang = a * Math.PI / 6, r1 = 22, r2 = 44 + (a % 3) * 12;
        fw += '<line x1="' + (b[0] + Math.cos(ang) * r1) + '" y1="' + (b[1] + Math.sin(ang) * r1) + '" x2="' + (b[0] + Math.cos(ang) * r2) + '" y2="' + (b[1] + Math.sin(ang) * r2) + '" stroke="' + b[2] + '" stroke-width="3" opacity=".7" stroke-linecap="round"/>';
      }
      fw += '</g>';
    }
    return '<svg viewBox="0 0 800 1200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' + sky("fwSky", "#0d0b1e", "#1c1230", "#3a1c38") + '</defs>' +
      '<rect width="800" height="1200" fill="url(#fwSky)"/>' + stars() + fw +
      '<rect x="0" y="700" width="800" height="500" fill="#120a1a" opacity=".9"/>' +
      pagoda(400, 560, 1.1, "#120a1a") +
      '<rect x="0" y="880" width="800" height="320" fill="#0f0a14"/>' +
      '<path d="M0 880 q400 -60 800 0 v40 q-400 -60 -800 0z" fill="#1a1122"/>' +
      '<g opacity=".4">' + bokeh() + '</g>' +
      lantern(90, 800, 1.6) + lantern(710, 790, 1.8) +
      '</svg>';
  }

  const BGS = {
    street: () => bgStreet(false),
    dawn: () => bgStreet(true),
    court: bgCourt,
    table: bgTable,
    fire: bgFire,
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
  };
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

  /* ================= 标题背景 ================= */
  function titleBg() {
    return bgStreet(false).replace("</svg>",
      '<g transform="translate(560,880) scale(1.9)" opacity=".92">' +
      '<g transform="translate(-120,-100)">' + cat().replace("<svg ", "<svg width=\"240\" height=\"200\" ") + '</g></g></svg>');
  }

  return { catGirl, cat, BGS, DISHES, titleBg };
})();
