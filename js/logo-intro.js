// ═══ 唐猫庭院 · 品牌动效「数据长成唐猫」═══
// 来源: radar.html 三幕动画抽取(2026-10-07 用户拍板"动画整个就是 logo 体现")。
// 12 维特征数据收拢归圆→滑到猫头解剖位→唐猫成形(花钿/笑眼/腮红/ω嘴/胡须)。
// 用法:
//   TangCatIntro.play(containerEl, { duration: 4200, loop: false, onDone: fn }) — 播放, 播完保留成形帧并回调
//   TangCatIntro.stop() — 停止并清空容器
// 纯图形无文字: 中英模式通用; prefers-reduced-motion 由调用方决定是否跳过。
'use strict';
var TangCatIntro = (function () {
  var NS = 'http://www.w3.org/2000/svg';
  var _raf = null, _host = null, _stopped = false;

  /* ═══ 数据(与 radar.html 同源: feature_importance.json 2026-09-19 加权重训) ═══ */
  var W = { '辣度': 8.0, '咸淡': 6.2, '甜酸': 4.1, '热量': 7.6, '价格': 10.4, '招牌': 0.4, '评分': 0, '用户辣度': 17.7, '用户咸淡': 9.4, '用户甜酸': 12.0, '用户价格': 14.9, '用户热量': 9.3 };
  var MAX = 17.7;
  var ORD = ['辣度', '咸淡', '甜酸', '热量', '价格', '招牌', '评分', '用户辣度', '用户咸淡', '用户甜酸', '用户价格', '用户热量'];
  var CX = 450, CY = 348, UNIT = 11.6;
  var CATPOS = {
    '用户辣度': [232, 240], '用户价格': [-52, 240], '招牌': [250, 129], '评分': [-70, 129],
    '甜酸': [-90, 121], '用户甜酸': [206, 167], '用户热量': [-26, 167], '价格': [174, 237],
    '热量': [6, 237], '咸淡': [132, 208], '用户咸淡': [48, 208], '辣度': [90, 192]
  };
  var STATE = {};
  ORD.forEach(function (n, i) { STATE[n] = { a0: (i * 30 - 90) * Math.PI / 180, r0: W[n] * UNIT }; });
  ORD.forEach(function (n) { STATE[n].a1 = CATPOS[n][0] * Math.PI / 180; STATE[n].r1 = 144 + (W[n] / MAX) * 76; STATE[n].r2 = CATPOS[n][1]; });
  var PHI = 347 * Math.PI / 180;
  function normKey(a) { a = a - PHI; return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); }
  function posAt(n, kr, ka, kc) {
    var st = STATE[n];
    var d = st.a1 - st.a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    var a = st.a0 + d * (ka === undefined ? kr : ka);
    var r = st.r0 + (st.r1 - st.r0) * kr;
    if (kc) r += (st.r2 - r) * kc;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  }
  function el(parent, tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; }
  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  /* ═══ 场景构建(纯图形, 无文字标签) ═══ */
  var g = {};
  function build(host) {
    host.innerHTML = '';
    g.svg = document.createElementNS(NS, 'svg');
    g.svg.setAttribute('xmlns', NS);
    g.svg.setAttribute('viewBox', '0 0 900 680');
    g.svg.style.cssText = 'width:100%;height:auto;display:block;margin:0 auto;';
    g.svg.setAttribute('font-family', "'Noto Serif SC','STSong',serif");
    host.appendChild(g.svg);
    ['catFrame', 'decor', 'rings', 'spokes', 'dataLayer', 'faceLayer'].forEach(function (id) { g[id] = el(g.svg, 'g', { id: id }); });

    // 猫头底框(双耳+粉内耳+圆脸)
    el(g.catFrame, 'path', { d: 'M 258 218 Q 218 70 238 38 Q 258 16 310 58 Q 370 118 408 188 Z', fill: '#faf6f0', stroke: '#c9a96e', 'stroke-width': 3, 'stroke-linejoin': 'round' });
    el(g.catFrame, 'path', { d: 'M 642 218 Q 682 70 662 38 Q 642 16 590 58 Q 530 118 492 188 Z', fill: '#faf6f0', stroke: '#c9a96e', 'stroke-width': 3, 'stroke-linejoin': 'round' });
    el(g.catFrame, 'path', { d: 'M 282 182 Q 254 90 264 60 Q 302 88 356 156 Z', fill: '#f2b8ad', opacity: 0.5 });
    el(g.catFrame, 'path', { d: 'M 618 182 Q 646 90 636 60 Q 598 88 544 156 Z', fill: '#f2b8ad', opacity: 0.5 });
    el(g.catFrame, 'circle', { cx: 450, cy: 360, r: 275, fill: '#faf6f0', stroke: '#c9a96e', 'stroke-width': 3 });

    // 瓦当边轮/连珠/乳钉/当心 + 网格
    el(g.decor, 'circle', { cx: 450, cy: 348, r: 256, fill: 'none', stroke: '#c9a96e', 'stroke-width': 5, opacity: 0.9 });
    el(g.decor, 'circle', { cx: 450, cy: 348, r: 246, fill: 'none', stroke: '#c9a96e', 'stroke-width': 1.2, opacity: 0.7 });
    for (var i = 0; i < 24; i++) { var a = i * 15 * Math.PI / 180; el(g.decor, 'circle', { cx: (450 + 238 * Math.cos(a)).toFixed(1), cy: (348 + 238 * Math.sin(a)).toFixed(1), r: 3, fill: '#c9a96e', opacity: 0.85 }); }
    [45, 135, 225, 315].forEach(function (a) { var r = a * Math.PI / 180; el(g.decor, 'circle', { cx: (450 + 243 * Math.cos(r)).toFixed(1), cy: (348 + 243 * Math.sin(r)).toFixed(1), r: 6.5, fill: '#c9a96e', stroke: '#a08b6a', 'stroke-width': 1 }); });
    el(g.decor, 'circle', { cx: 450, cy: 348, r: 11, fill: 'none', stroke: '#c9a96e', 'stroke-width': 3, opacity: 0.95 });
    [14, 21, 28, 35].forEach(function (r) { el(g.rings, 'circle', { cx: 450, cy: 348, r: (r * 1.9).toFixed(0), fill: 'none', stroke: '#c9a96e', 'stroke-width': 0.8, opacity: 0.5 }); });
    [14, 28].forEach(function (r) { el(g.rings, 'circle', { cx: 450, cy: 348, r: (r * 1.9).toFixed(0), fill: '#f0e6d0', opacity: 0.35 }); });
    el(g.rings, 'circle', { cx: 450, cy: 348, r: (42.5 * 1.9).toFixed(0), fill: 'none', stroke: '#c9a96e', 'stroke-width': 1, opacity: 0.7 });
    [[450, 116], [566, 147], [651, 232], [682, 348], [651, 464], [566, 549], [450, 580], [334, 549], [249, 464], [218, 348], [249, 232], [334, 147]].forEach(function (p) { el(g.spokes, 'line', { x1: 450, y1: 348, x2: p[0], y2: p[1], stroke: '#c9a96e', 'stroke-width': 0.7, opacity: 0.4 }); });

    // 数据层(12 顶点+多边形)
    g.vspokes = []; g.vdots = [];
    ORD.forEach(function (n, i) {
      var p = posAt(n, 0), f = [p[0].toFixed(1), p[1].toFixed(1)];
      g.vspokes.push(el(g.dataLayer, 'line', { x1: 450, y1: 348, x2: f[0], y2: f[1], stroke: '#c9a96e', 'stroke-width': 0.8, opacity: 0.5 }));
      g.vdots.push(el(g.dataLayer, 'circle', { cx: f[0], cy: f[1], r: 3.5, fill: '#c9a96e', stroke: '#b83a2a', 'stroke-width': 1 }));
    });
    g.dataPoly = el(g.dataLayer, 'polygon', { points: g.vdots.map(function (d) { return d.getAttribute('cx') + ',' + d.getAttribute('cy'); }).join(' '), fill: '#b83a2a', opacity: 0.30, stroke: '#b83a2a', 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
    g.dataLayer.insertBefore(g.dataPoly, g.vdots[0]);

    // 五官层(花钿/笑眼/腮红/ω嘴/胡须——品牌插画同款)
    g.gEar = el(g.faceLayer, 'g', { opacity: 0 });
    el(g.gEar, 'path', { d: 'M 319 190 L 371 224 L 318 248 Z', fill: '#f2b8ad', opacity: 0.85, 'stroke-linejoin': 'round' });
    el(g.gEar, 'path', { d: 'M 581 190 L 529 224 L 582 248 Z', fill: '#f2b8ad', opacity: 0.85, 'stroke-linejoin': 'round' });
    g.gP1 = el(g.faceLayer, 'g', { opacity: 0 });
    for (var hi = 0; hi < 5; hi++) {
      var ha = -Math.PI / 2 + hi * 2 * Math.PI / 5;
      el(g.gP1, 'circle', { cx: (450 + 6.5 * Math.cos(ha)).toFixed(1), cy: (284 + 6.5 * Math.sin(ha)).toFixed(1), r: 3.4, fill: '#c0392b' });
    }
    el(g.gP1, 'circle', { cx: 450, cy: 284, r: 2.6, fill: '#c9a96e' });
    el(g.gP1, 'circle', { cx: 431, cy: 291, r: 1.8, fill: '#b83a2a' });
    el(g.gP1, 'circle', { cx: 469, cy: 291, r: 1.8, fill: '#b83a2a' });
    g.gP2 = el(g.faceLayer, 'g', { opacity: 0 });
    el(g.gP2, 'path', { d: 'M 306 390 Q 346 356 386 390', fill: 'none', stroke: '#2c1810', 'stroke-width': 4.5, 'stroke-linecap': 'round' });
    el(g.gP2, 'path', { d: 'M 514 390 Q 554 356 594 390', fill: 'none', stroke: '#2c1810', 'stroke-width': 4.5, 'stroke-linecap': 'round' });
    el(g.gP2, 'ellipse', { cx: 293, cy: 416, rx: 32, ry: 19, fill: '#f5c6ba', opacity: 0.5 });
    el(g.gP2, 'ellipse', { cx: 293, cy: 416, rx: 21, ry: 12.5, fill: '#f2b8ad', opacity: 0.55 });
    el(g.gP2, 'ellipse', { cx: 607, cy: 416, rx: 32, ry: 19, fill: '#f5c6ba', opacity: 0.5 });
    el(g.gP2, 'ellipse', { cx: 607, cy: 416, rx: 21, ry: 12.5, fill: '#f2b8ad', opacity: 0.55 });
    el(g.gP2, 'path', { d: 'M 426 448 Q 430 468 446 463 Q 450 461 450 454 Q 450 461 454 463 Q 470 468 474 448', fill: 'none', stroke: '#2c1810', 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    var whiskers = el(g.gP2, 'g', { stroke: '#5a4a3a', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.9 });
    [[272, 412, 188, 398], [272, 428, 178, 428], [272, 444, 188, 458], [628, 412, 712, 398], [628, 428, 722, 428], [628, 444, 712, 458]].forEach(function (l) { el(whiskers, 'line', { x1: l[0], y1: l[1], x2: l[2], y2: l[3] }); });

    /* ═══ 标签层(2026-10-08 移植自 radar.html: 维度名+权重%,用户口味维红色加粗/菜品维墨色;EN 模式换词表) ═══ */
    g.labelLayer = el(g.svg, 'g', { id: 'labelLayer' });
    var EN = typeof menuLang !== 'undefined' && menuLang === 'en';
    var EN_NAME = { '辣度': 'Spicy', '咸淡': 'Salty', '甜酸': 'Sweet·Sour', '热量': 'Calorie', '价格': 'Price', '招牌': 'Signature', '评分': 'Rating', '用户辣度': 'Your Spicy', '用户咸淡': 'Your Salty', '用户甜酸': 'Your Sweet', '用户价格': 'Your Price', '用户热量': 'Your Calorie' };
    g.labelEls = [];
    ORD.forEach(function (n) {
      var a0 = STATE[n].a0, c = Math.cos(a0), s = Math.sin(a0);
      var lr0 = Math.max(W[n] * UNIT, 70);
      var px = CX + lr0 * Math.cos(a0), py = CY + lr0 * Math.sin(a0);
      var isUser = n.indexOf('用户') === 0;
      var t = el(g.labelLayer, 'text', { x: px.toFixed(1), y: (py + (s < -0.5 ? -2 : (s > 0.5 ? 12 : 5))).toFixed(1), 'font-size': (isUser ? 15 : 14), 'font-weight': (isUser ? 700 : 400), fill: (isUser ? '#b83a2a' : '#2c1810'), 'text-anchor': (c > 0.3 ? 'start' : (c < -0.3 ? 'end' : 'middle')) });
      t.textContent = (EN ? EN_NAME[n] : n) + ' ' + W[n].toFixed(1) + '%';
      g.labelEls.push(t);
    });
  }

  /* ═══ 动画驱动(与 radar.html 同一套三幕时序) ═══ */
  function updateData(kr, ka, kc) {
    var items = [];
    ORD.forEach(function (n, i) {
      var st = STATE[n];
      var d = st.a1 - st.a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      var a = st.a0 + d * ka;
      var r = st.r0 + (st.r1 - st.r0) * kr;
      if (kc) r += (st.r2 - r) * kc;
      var x = CX + r * Math.cos(a), y = CY + r * Math.sin(a);
      items.push({ a: normKey(a), x: x, y: y, i: i });
    });
    items.sort(function (p, q) { return p.a - q.a; });
    var ptsStr = '';
    items.forEach(function (it) {
      var f = [it.x.toFixed(1), it.y.toFixed(1)];
      g.vspokes[it.i].setAttribute('x2', f[0]); g.vspokes[it.i].setAttribute('y2', f[1]);
      g.vdots[it.i].setAttribute('cx', f[0]); g.vdots[it.i].setAttribute('cy', f[1]);
      ptsStr += f[0] + ',' + f[1] + ' ';
    });
    g.dataPoly.setAttribute('points', ptsStr.trim());
    var kc2 = kc || 0;
    var c0 = [184, 58, 42], c1 = [250, 246, 240];
    var cr = [Math.round(c0[0] + (c1[0] - c0[0]) * kc2), Math.round(c0[1] + (c1[1] - c0[1]) * kc2), Math.round(c0[2] + (c1[2] - c0[2]) * kc2)];
    g.dataPoly.setAttribute('fill', 'rgb(' + cr.join(',') + ')');
    g.dataPoly.setAttribute('fill-opacity', (0.30 + 0.70 * kc2).toFixed(2));
    g.dataPoly.setAttribute('stroke-width', (2.5 + 2.5 * kc2).toFixed(2));
    g.vdots.forEach(function (d) { d.setAttribute('r', (3.5 + 2 * kc2).toFixed(2)); });
    g.vspokes.forEach(function (l) { l.setAttribute('opacity', (0.5 * (1 - kc2)).toFixed(2)); });
    g.rings.setAttribute('opacity', (1 - 0.65 * kc2).toFixed(2));
    g.catFrame.setAttribute('opacity', (1 - 0.75 * kc2).toFixed(2));
    g.decor.setAttribute('opacity', (1 - 0.4 * kc2).toFixed(2));
    g.gEar.setAttribute('opacity', (0.85 * kc2).toFixed(2));
    /* 标签跟随顶点(成形后沿径向外移 36 离开轮廓线,radar.html 同款);近零权重维(评分/招牌)顶点在圆心,标签强制最小半径 70 防重叠。
       注意 a/r 是顶点循环内部变量,这里必须按 STATE 重算,直接引用会 ReferenceError 被 frame 的 try/catch 吞掉 */
    if (g.labelEls) ORD.forEach(function (n, i) {
      var t = g.labelEls[i]; if (!t) return;
      var st = STATE[n];
      var d = st.a1 - st.a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      var a = st.a0 + d * ka;
      var r = st.r0 + (st.r1 - st.r0) * kr;
      if (kc) r += (st.r2 - r) * kc;
      var lr = Math.max(r + 36 * kc2, 70);
      var lx = CX + lr * Math.cos(a), ly = CY + lr * Math.sin(a);
      var lc = Math.cos(a), ls = Math.sin(a);
      t.setAttribute('x', lx.toFixed(1));
      t.setAttribute('y', (ly + (ls < -0.5 ? -2 : (ls > 0.5 ? 12 : 5))).toFixed(1));
      t.setAttribute('text-anchor', (lc > 0.3 ? 'start' : (lc < -0.3 ? 'end' : 'middle')));
    });
  }
  function setFace(k1, k2) {
    g.gP1.setAttribute('opacity', k1.toFixed(2));
    g.gP2.setAttribute('opacity', k2.toFixed(2));
  }
  function frame(ms) {
    /* 标签: 变形期间淡出(画面只留轮廓飞行),猫头定格后淡回(radar.html 同款时序) */
    var lv;
    if (ms < 900) lv = 1;
    else if (ms < 1400) lv = 1 - smooth((ms - 900) / 500);
    else if (ms < 3400) lv = 0;
    else if (ms < 4100) lv = smooth((ms - 3400) / 700);
    else lv = 1;
    if (g.labelEls) g.labelEls.forEach(function (t) { t.setAttribute('opacity', lv.toFixed(2)); });
    if (ms < 2800) setFace(0, 0);
    if (ms < 900) { updateData(0, 0, 0); }
    else if (ms < 3400) {
      var p = (ms - 900) / 2500;
      updateData(smooth(p / 0.42), smooth((p - 0.30) / 0.50), smooth((p - 0.55) / 0.45));
    }
    else if (ms < 3700) { updateData(0, 1, 1); }
    else if (ms < 4800) { updateData(0, 1, 1); setFace(smooth((ms - 3700) / 1000), smooth((ms - 3700) / 1000)); }
    else { updateData(0, 1, 1); setFace(1, 1); }
  }

  /* ═══ 公共 API ═══ */
  function play(host, opts) {
    opts = opts || {};
    stop();
    _host = host; _stopped = false;
    build(host);
    var DUR = opts.duration || 5400;
    var t0 = performance.now(), lastMs = -1;
    function raf(now) {
      if (_stopped || _host !== host) return;
      var ms = Math.min(DUR, now - t0);
      if (ms === lastMs) { setTimeout(function () { requestAnimationFrame(raf); }, 16); return; }
      lastMs = ms;
      try { frame(ms); } catch (e) { /* 单帧异常不终止 */ }
      if (ms < DUR) requestAnimationFrame(raf);
      else if (opts.loop) { t0 = now; requestAnimationFrame(raf); }
      else if (opts.onDone) opts.onDone();
    }
    requestAnimationFrame(raf);
  }
  function stop() {
    _stopped = true;
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    if (_host) { try { _host.innerHTML = ''; } catch (e) { } _host = null; }
  }
  return { play: play, stop: stop };
})();
