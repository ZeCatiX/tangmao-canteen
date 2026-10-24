/* 唐猫庭院 galgame —— WebAudio 合成古风 BGM 与音效（无音频文件，全部实时合成） */
"use strict";

const AudioSys = (() => {
  let ctx = null, master = null, bgmGain = null;
  let timer = null, current = null, step = 0;
  let enabled = true, volume = 0.4;

  // 音阶（五声宫调，以 C 为宫）
  const N = {
    C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.0, A3: 220.0,
    C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0,
  };

  /* 曲目：每步 = [音(或null), 节拍数]；pad 为低音持续层 */
  const TRACKS = {
    title: { bpm: 52, pad: [N.C3, N.G3], seq: [
      [N.E4, 2], [N.G4, 1], [N.A4, 2], [N.G4, 1], [N.E4, 2], [N.D4, 1], [N.C4, 3], [null, 1],
      [N.G4, 2], [N.A4, 1], [N.C5, 2], [N.A4, 1], [N.G4, 2], [N.E4, 1], [N.D4, 3], [null, 1],
      [N.E5, 2], [N.D5, 1], [N.C5, 2], [N.A4, 1], [N.G4, 2], [N.E4, 1], [N.D4, 2], [N.C4, 2],
    ]},
    night: { bpm: 46, pad: [N.A3, N.E3], seq: [
      [N.A4, 3], [N.E4, 1], [N.C5, 2], [N.A4, 2], [N.G4, 3], [N.E4, 1], [N.D4, 4],
      [N.E4, 3], [N.G4, 1], [N.A4, 2], [N.C5, 2], [N.D5, 3], [N.C5, 1], [N.A4, 4],
      [N.G4, 2], [N.E4, 2], [N.D4, 2], [N.C4, 4],
    ]},
    court: { bpm: 66, pad: [N.C3, N.A3], seq: [
      [N.C5, 1], [N.A4, 1], [N.G4, 1], [N.E4, 1], [N.G4, 2], [N.A4, 2], [N.C5, 2], [N.A4, 1], [N.G4, 1],
      [N.E4, 1], [N.G4, 1], [N.A4, 2], [N.C5, 2], [N.D5, 2], [N.C5, 1], [N.A4, 1], [N.G4, 2],
      [N.E5, 1], [N.D5, 1], [N.C5, 1], [N.A4, 1], [N.G4, 2], [N.A4, 1], [N.C5, 1], [N.A4, 2], [N.G4, 2],
    ]},
    feast: { bpm: 84, pad: [N.D3, N.A3], seq: [
      [N.D4, 1], [N.E4, 1], [N.G4, 1], [N.A4, 1], [N.C5, 2], [N.A4, 1], [N.G4, 1],
      [N.A4, 1], [N.C5, 1], [N.D5, 1], [N.E5, 2], [N.D5, 1], [N.C5, 1], [N.A4, 2],
      [N.G4, 1], [N.A4, 1], [N.C5, 1], [N.D5, 1], [N.E5, 2], [N.G5, 1], [N.E5, 1], [N.D5, 2], [N.C5, 2],
    ]},
    end: { bpm: 40, pad: [N.C3, N.G3, N.E4], seq: [
      [N.C5, 4], [N.G4, 2], [N.A4, 4], [N.E4, 2],
      [N.G4, 4], [N.D5, 2], [N.C5, 6], [null, 2],
      [N.E5, 4], [N.C5, 2], [N.A4, 4], [N.G4, 2], [N.C5, 8],
    ]},
  };

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = 1;
      bgmGain.connect(master);
    }
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  /* 古筝式拨弦：三角波 + 快衰减 + 轻微失谐泛音 */
  function pluck(freq, t, dur, vel) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bgmGain);
    const o1 = ctx.createOscillator(); o1.type = "triangle"; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 2.01;
    const g2 = ctx.createGain(); g2.gain.value = 0.28;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  function padNote(freq, t, dur) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(bgmGain);
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 1.005;
    o.connect(g); o2.connect(g);
    o.start(t); o2.start(t);
    o.stop(t + dur); o2.stop(t + dur);
  }

  function schedule() {
    if (!current || !ctx) return;
    const tr = TRACKS[current];
    const beat = 60 / tr.bpm;
    const ev = tr.seq[step % tr.seq.length];
    const t = ctx.currentTime + 0.06;
    if (ev[0]) pluck(ev[0], t, Math.min(beat * ev[1] * 1.2, 2.6), 0.16);
    if (step % 8 === 0) {
      const dur = beat * 8;
      padNote(tr.pad[0], t, dur);
      if (tr.pad[1]) padNote(tr.pad[1], t, dur);
    }
    step++;
    timer = setTimeout(schedule, beat * ev[1] * 1000);
  }

  function playBgm(name) {
    if (!enabled) { current = name; return; }
    if (!ensure()) return;
    if (current === name && timer) return;
    current = name; step = 0;
    clearTimeout(timer);
    bgmGain.gain.cancelScheduledValues(ctx.currentTime);
    bgmGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    bgmGain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.2);
    schedule();
  }
  function stopBgm() {
    clearTimeout(timer); timer = null;
    if (ctx && bgmGain) {
      bgmGain.gain.cancelScheduledValues(ctx.currentTime);
      bgmGain.gain.setValueAtTime(bgmGain.gain.value, ctx.currentTime);
      bgmGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    }
    current = null;
  }

  /* 音效（直连 master，不受 BGM 淡入淡出影响） */
  function sfx(name) {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime;
    if (name === "click") {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(330, t + 0.06);
      g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.08);
    } else if (name === "bell") {
      [523.25, 1046.5, 1568].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f * (1 + i * 0.002);
        g.gain.setValueAtTime(0.11 / (i + 1.3), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.6);
      });
    } else if (name === "select") {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle"; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.09);
      g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
    } else if (name === "chapter") {
      [392, 523.25, 659.25].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0, t + i * 0.12);
        g.gain.linearRampToValueAtTime(0.07, t + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 1.1);
        o.connect(g); g.connect(master); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 1.2);
      });
    } else if (name === "end") {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0, t + i * 0.22);
        g.gain.linearRampToValueAtTime(0.09, t + i * 0.22 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 1.8);
        o.connect(g); g.connect(master); o.start(t + i * 0.22); o.stop(t + i * 0.22 + 2);
      });
    }
  }

  function toggle() {
    enabled = !enabled;
    if (!enabled) stopBgm();
    else if (current) { const c = current; playBgm(c); }
    return enabled;
  }
  function setVolume(v) { volume = v; if (master) master.gain.value = v; }
  function isOn() { return enabled; }
  function unlock() { ensure(); }

  return { playBgm, stopBgm, sfx, toggle, setVolume, isOn, unlock };
})();
