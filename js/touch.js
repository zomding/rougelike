/* =========================================================================
 * touch.js —— 手机 / 触摸屏适配
 *
 *  职责：
 *   1. 识别"真正的触摸设备"（粗指针 + 触摸点），给 <body> 加 touch-mode
 *   2. 把屏幕上的虚拟键位（#touch-layer 里的 .tbtn）映射成 Input 的虚拟动作
 *      —— 走 Input.setVirtual()，与键盘共用同一套缓冲逻辑
 *   3. 竖屏时弹"请横屏"提示；全屏 + 锁定横屏（支持的浏览器上）
 *   4. 每帧同步一次状态（标题/游戏中），游戏中才显示战斗键位
 *
 *  依赖：Input（js/input.js），必须在它之后加载。
 *  设计：键盘玩家完全不受影响 —— 非触摸设备上这里几乎全部空转。
 * ========================================================================= */
(function (global) {
  'use strict';

  var doc = global.document;
  var Input = global.Input;

  var touchCapable = false;     // 是否启用触摸模式（初始化时判定一次）
  var portrait = false;         // 当前是否竖屏
  var hintDismissed = false;    // 玩家选择"继续竖屏玩"
  var inGame = null;            // 上一帧的 in-game 状态（避免每帧写 DOM）
  var byPointer = {};           // pointerId -> { btn, action }（多点触控必须按 id 记）
  var layer = null;
  var hint = null;
  var ready = false;

  /* ------------------------------------------------------------------ *
   * 设备判定
   * ------------------------------------------------------------------ */
  function isTouchDevice() {
    // 手动强制：index.html?touch=1（方便在电脑上用触摸模拟器调试）
    try {
      if (global.location && /[?&]touch=1/.test(global.location.search)) return true;
    } catch (e) { /* ignore */ }

    var nav = global.navigator || {};
    var maxTouch = nav.maxTouchPoints || 0;
    var coarse = false;
    try {
      coarse = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
    } catch (e2) { coarse = false; }

    // 粗指针 + 有触摸点 = 手机 / 平板
    if (coarse && maxTouch > 0) return true;
    // 触屏但指针被判为 fine 的（部分安卓机）：再用屏幕尺寸兜底，排除带触摸屏的笔记本
    if (maxTouch > 0) {
      var s = global.screen || {};
      var w = s.width || 9999;
      var h = s.height || 9999;
      if (Math.min(w, h) <= 820) return true;
    }
    return false;
  }

  function isPortrait() {
    var w = global.innerWidth || 0;
    var h = global.innerHeight || 0;
    return h > w;
  }

  /* ------------------------------------------------------------------ *
   * 虚拟键位：pointer 事件优先，老浏览器退回 touch 事件
   * ------------------------------------------------------------------ */
  function btnFromEvent(e) {
    var t = e.target;
    if (!t || !t.closest) return null;
    return t.closest('#touch-layer .tbtn');
  }

  function pressStart(rec, e) {
    var btn = rec.btn;
    var action = rec.action;
    btn.classList.add('on');
    if (Input && Input.setVirtual) Input.setVirtual(action, true);
    if (e) {
      try { e.preventDefault(); } catch (err) { /* ignore */ }
      try { e.stopPropagation(); } catch (err2) { /* ignore */ }
    }
  }

  function pressEnd(rec) {
    if (!rec) return;
    rec.btn.classList.remove('on');
    if (Input && Input.setVirtual) Input.setVirtual(rec.action, false);
  }

  /* 把正在按住的虚拟键全部松开（切后台 / 失焦 / 转屏） */
  function releaseAllVirtual() {
    for (var id in byPointer) {
      if (Object.prototype.hasOwnProperty.call(byPointer, id)) {
        pressEnd(byPointer[id]);
      }
    }
    byPointer = {};
    if (Input && Input.clearVirtual) Input.clearVirtual();
    var on = doc.querySelectorAll('#touch-layer .tbtn.on');
    for (var i = 0; i < on.length; i++) on[i].classList.remove('on');
  }

  function onPointerDown(e) {
    // 竖屏提示挡在前面时，交给提示层自己处理
    if (hint && !hint.hidden && hint.contains(e.target)) return;

    var btn = btnFromEvent(e);
    if (!btn) return;                       // 点在游戏画面上 → 不拦截，让 input.js 当攻击

    // 全屏按钮是"一次点击"，不需要按住状态
    if (btn.hasAttribute('data-full')) {
      try { e.preventDefault(); } catch (err) { /* ignore */ }
      try { e.stopPropagation(); } catch (err2) { /* ignore */ }
      enterFullscreen();
      return;
    }

    var action = btn.getAttribute('data-action');
    if (!action) return;
    if (byPointer[e.pointerId]) return;     // 同一根手指重复按下

    byPointer[e.pointerId] = { btn: btn, action: action };
    try { btn.setPointerCapture(e.pointerId); } catch (err3) { /* 部分浏览器不支持，忽略 */ }
    pressStart(byPointer[e.pointerId], e);
  }

  function onPointerUp(e) {
    var rec = byPointer[e.pointerId];
    if (!rec) return;
    delete byPointer[e.pointerId];
    pressEnd(rec);
  }

  /* 老浏览器（无 PointerEvent）的 touch 兜底 */
  function onTouchDown(e) {
    if (hint && !hint.hidden && hint.contains(e.target)) return;
    var btn = btnFromEvent(e);
    if (!btn) return;

    if (btn.hasAttribute('data-full')) {
      try { e.preventDefault(); } catch (err) { /* ignore */ }
      enterFullscreen();
      return;
    }

    var action = btn.getAttribute('data-action');
    if (!action) return;

    var touches = e.changedTouches || [];
    for (var i = 0; i < touches.length; i++) {
      var id = 't' + touches[i].identifier;
      if (byPointer[id]) continue;
      byPointer[id] = { btn: btn, action: action };
      pressStart(byPointer[id], e);
    }
  }

  function onTouchUp(e) {
    var touches = e.changedTouches || [];
    for (var i = 0; i < touches.length; i++) {
      var id = 't' + touches[i].identifier;
      var rec = byPointer[id];
      if (!rec) continue;
      delete byPointer[id];
      pressEnd(rec);
    }
  }

  /* ------------------------------------------------------------------ *
   * 全屏 + 锁定横屏
   * ------------------------------------------------------------------ */
  function supportsFullscreen() {
    var el = doc.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
  }

  function lockLandscape() {
    try {
      var so = global.screen && global.screen.orientation;
      if (so && typeof so.lock === 'function') {
        var p = so.lock('landscape');
        if (p && typeof p.catch === 'function') p.catch(function () { /* 不支持就算了 */ });
      }
    } catch (e) { /* ignore */ }
  }

  function enterFullscreen() {
    var el = doc.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    var after = function () {
      lockLandscape();
      // 全屏后浏览器会改视口，主动抖动一次布局
      refreshLayout();
    };

    try {
      if (!req) { lockLandscape(); return; }
      var ret = req.call(el);
      if (ret && typeof ret.then === 'function') ret.then(after, after);
      else after();
    } catch (e) {
      after();
    }
  }

  /* ------------------------------------------------------------------ *
   * 布局 / 提示同步
   * ------------------------------------------------------------------ */
  function refreshLayout() {
    if (!doc.body) return;

    portrait = isPortrait();

    doc.body.classList.toggle('touch-mode', touchCapable);
    doc.body.classList.toggle('portrait', portrait);

    if (hint) {
      // 横屏就自动收起；竖屏且玩家没点"继续竖屏玩"时出现
      hint.hidden = !(touchCapable && portrait && !hintDismissed);
    }
  }

  /* 主循环每帧调用：只有真正打游戏时才显示战斗键位 */
  function sync(state) {
    if (!touchCapable || !doc.body) return;
    var playing = (state === 'PLAYING');
    if (playing === inGame) return;
    inGame = playing;
    doc.body.classList.toggle('in-game', playing);
  }

  function isTouch() {
    return touchCapable;
  }

  /* ------------------------------------------------------------------ *
   * 初始化
   * ------------------------------------------------------------------ */
  function init() {
    if (ready) return;
    ready = true;

    touchCapable = isTouchDevice();

    layer = doc.getElementById('touch-layer');
    hint = doc.getElementById('rotate-hint');

    if (!touchCapable) {
      // 键盘 / 鼠标环境：什么都不做，保持原样
      if (hint) hint.hidden = true;
      var stale = doc.getElementById('touch-layer');
      if (stale) stale.style.display = 'none';
      return;
    }

    // 绑定输入
    if (global.PointerEvent) {
      global.addEventListener('pointerdown', onPointerDown, { capture: true, passive: false });
      global.addEventListener('pointerup', onPointerUp, true);
      global.addEventListener('pointercancel', onPointerUp, true);
    } else {
      global.addEventListener('touchstart', onTouchDown, { capture: true, passive: false });
      global.addEventListener('touchend', onTouchUp, true);
      global.addEventListener('touchcancel', onTouchUp, true);
    }

    // 竖屏提示里的两个按钮
    var rhFull = doc.getElementById('rh-full');
    var rhSkip = doc.getElementById('rh-skip');

    if (rhFull) {
      if (!supportsFullscreen()) {
        rhFull.hidden = true;
      } else {
        rhFull.addEventListener('click', function (e) {
          try { e.preventDefault(); } catch (err) { /* ignore */ }
          enterFullscreen();
        }, false);
      }
    }

    if (rhSkip) {
      rhSkip.addEventListener('click', function (e) {
        try { e.preventDefault(); } catch (err) { /* ignore */ }
        hintDismissed = true;
        refreshLayout();
      }, false);
    }

    // 失焦 / 切后台：松开所有虚拟键，避免"卡按住"一直跑或一直砍
    global.addEventListener('blur', releaseAllVirtual, false);
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) releaseAllVirtual();
    }, false);

    // 视口变化（转屏、地址栏收起、全屏切换）
    global.addEventListener('resize', refreshLayout, false);
    global.addEventListener('orientationchange', function () {
      refreshLayout();
    }, false);
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', refreshLayout, false);
    }

    // 双击缩放兜底（部分安卓浏览器无视 user-scalable=no）
    var lastTouchEnd = 0;
    doc.addEventListener('touchend', function (e) {
      var now = Date.now();
      if (now - lastTouchEnd < 300) {
        try { e.preventDefault(); } catch (err) { /* ignore */ }
      }
      lastTouchEnd = now;
    }, { passive: false });

    refreshLayout();
  }

  global.Touch = {
    init: init,
    sync: sync,
    isTouch: isTouch,
    refresh: refreshLayout,
    fullscreen: enterFullscreen,
    releaseAll: releaseAllVirtual
  };
})(window);
