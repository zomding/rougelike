/* =========================================================================
 * audio.js —— WebAudio 程序化音效（无任何外部音频文件）
 * 必须在用户点击 / 按键之后才能初始化 AudioContext（浏览器策略），
 * 所以这里只提供 init()，由 main.js 在第一次交互时调用。
 * 全部操作包在 try/catch 中：没有声卡、被拦截、被禁用都不能让游戏崩。
 * ========================================================================= */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var ready = false;
  var muted = false;
  var noiseBuf = null;

  function init() {
    if (ready) {
      if (ctx && ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e) { /* ignore */ }
      }
      return ready;
    }
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { ready = false; return false; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.30;
      master.connect(ctx.destination);
      ready = true;
      if (ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e2) { /* ignore */ }
      }
    } catch (e3) {
      ready = false;
      ctx = null;
    }
    return ready;
  }

  function tone(f0, f1, dur, type, vol, delay) {
    if (!ready || muted) return;
    try {
      var t0 = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type || 'square';
      var a = Math.max(20, f0);
      var b = Math.max(20, f1 || f0);
      osc.frequency.setValueAtTime(a, t0);
      if (b !== a) osc.frequency.exponentialRampToValueAtTime(b, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    } catch (e) { /* ignore */ }
  }

  function noise(dur, vol, filterHz, delay) {
    if (!ready || muted) return;
    try {
      if (!noiseBuf) {
        var len = Math.floor(ctx.sampleRate * 0.4);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        var data = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      var t0 = ctx.currentTime + (delay || 0);
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = filterHz || 1200;
      bp.Q.value = 0.9;
      var g = ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  var SOUNDS = {
    jump: function () {
      tone(300, 560, 0.11, 'square', 0.10);
      noise(0.05, 0.05, 900);
    },
    jump2: function () {
      tone(520, 880, 0.10, 'triangle', 0.09);
      tone(780, 1200, 0.08, 'square', 0.05, 0.03);
      noise(0.07, 0.04, 2200);
    },
    attack: function () {
      noise(0.07, 0.10, 2000);
      tone(190, 90, 0.09, 'sawtooth', 0.09);
    },
    hit: function () {
      noise(0.06, 0.16, 800);
      tone(430, 150, 0.08, 'square', 0.09);
    },
    crit: function () {
      noise(0.07, 0.18, 1600);
      tone(900, 320, 0.14, 'square', 0.10);
    },
    hurt: function () {
      tone(330, 100, 0.24, 'sawtooth', 0.16);
      noise(0.10, 0.10, 500);
    },
    dash: function () {
      noise(0.12, 0.09, 2600);
      tone(700, 300, 0.10, 'triangle', 0.06);
    },
    pickup: function () {
      tone(680, 680, 0.06, 'square', 0.10);
      tone(1020, 1020, 0.09, 'square', 0.09, 0.06);
    },
    coin: function () {
      tone(1240, 1660, 0.05, 'square', 0.06);
    },
    heal: function () {
      tone(520, 780, 0.10, 'triangle', 0.10);
      tone(780, 1040, 0.12, 'triangle', 0.09, 0.09);
    },
    door: function () {
      tone(150, 150, 0.10, 'square', 0.11);
      tone(220, 220, 0.14, 'square', 0.10, 0.10);
      noise(0.18, 0.06, 400, 0.02);
    },
    death: function () {
      tone(320, 60, 0.65, 'sawtooth', 0.18);
      noise(0.4, 0.08, 300);
    },
    win: function () {
      tone(523, 523, 0.12, 'square', 0.11);
      tone(659, 659, 0.12, 'square', 0.11, 0.12);
      tone(784, 784, 0.12, 'square', 0.11, 0.24);
      tone(1046, 1046, 0.30, 'square', 0.12, 0.36);
    },
    ui: function () {
      tone(520, 640, 0.04, 'square', 0.07);
    },
    boss: function () {
      tone(90, 58, 0.55, 'sawtooth', 0.20);
      noise(0.4, 0.08, 200);
    },
    bossShoot: function () {
      tone(240, 120, 0.14, 'sawtooth', 0.09);
    },
    arrow: function () {
      noise(0.08, 0.05, 3200);
      tone(880, 420, 0.07, 'triangle', 0.05);
    },
    charge: function () {
      noise(0.3, 0.08, 600);
      tone(120, 220, 0.3, 'triangle', 0.06);
    }
  };

  function play(name) {
    if (!ready) return;
    var fn = SOUNDS[name];
    if (fn) {
      try { fn(); } catch (e) { /* ignore */ }
    }
  }

  function setMuted(v) {
    muted = !!v;
  }

  function isMuted() { return muted; }

  function isReady() { return ready; }

  global.SFX = {
    init: init,
    play: play,
    setMuted: setMuted,
    isMuted: isMuted,
    isReady: isReady
  };
})(window);
