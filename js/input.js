/* =========================================================================
 * input.js —— 键盘 / 鼠标输入（带输入缓冲，保证“按了就一定吃到”）
 *
 * 设计要点（针对“有时候按了没反应”）：
 *  1. 动作边沿不按渲染帧清空，而是存成“有效若干 tick”的缓冲，
 *     只有在被逻辑真正消费（wasPressed 返回 true）后才消失。
 *     → 高刷新率屏幕上某些渲染帧不跑固定步长时，按键也不会丢。
 *  2. 缓冲有寿命（PRESS_LIFE 个 tick），过期自动丢弃，
 *     避免停顿时攒下一堆按键在恢复后突然连发。
 *  3. 攻击同时支持 鼠标左键（按住可连续挥砍）与 J 键。
 * ========================================================================= */
(function (global) {
  'use strict';

  var G = global.GameData;

  var ACTION_KEYS = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    jump: ['Space', 'KeyW', 'ArrowUp'],
    attack: ['KeyJ'],
    dash: ['KeyK', 'ShiftLeft', 'ShiftRight'],
    pause: ['Escape', 'KeyP'],
    confirm: ['Enter'],
    mute: ['KeyM']
  };

  // 需要阻止默认行为的键（空格/方向键滚动页面、Shift 框选等）
  var PREVENT = {
    Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
    Tab: 1, Backspace: 1
  };

  var PRESS_LIFE = 10;   // 一次按键的“保质期”（tick），约 160ms

  var held = {};         // code -> true（物理按住）
  var press = {};        // action -> 剩余有效 tick
  // 虚拟键位（触屏）：action -> true（按住中）。
  // 与键盘分开存，这样手指按住鼠标区域时也不会互相干扰。
  var virtual = {};
  // heldIgnored: 鼠标在“菜单/暂停”里按下并一直没松开时，
  // 不让这次按压被当成游戏里的攻击（否则点“开始”会白挥一刀）
  var mouse = { x: 0, y: 0, down: false, clicked: false, right: false, heldIgnored: false };
  var canvasEl = null;
  var listenersOn = false;
  var actionNames = Object.keys(ACTION_KEYS);

  function setPress(action) {
    press[action] = PRESS_LIFE;
  }

  /* ---- 虚拟键位（触屏）----
   * down=true 时：进入"按住"状态，并且只在"从松到按"的瞬间送一次边沿。
   * 这样连点/长按都走在同一套缓冲上，和键盘行为完全一致。 */
  function setVirtual(action, down) {
    if (!action || !ACTION_KEYS[action]) return;
    var was = virtual[action] === true;
    virtual[action] = !!down;
    if (down && !was) setPress(action);
  }

  function clearVirtual() {
    for (var a in virtual) {
      if (Object.prototype.hasOwnProperty.call(virtual, a)) virtual[a] = false;
    }
  }

  function pressActionForCode(code) {
    for (var i = 0; i < actionNames.length; i++) {
      var a = actionNames[i];
      var list = ACTION_KEYS[a];
      for (var j = 0; j < list.length; j++) {
        if (list[j] === code) setPress(a);
      }
    }
  }

  function isDown(action) {
    if (virtual[action]) return true;                                           // 触屏虚拟键按住
    if (action === 'attack' && mouse.down && !mouse.heldIgnored) return true;   // 鼠标左键 = 攻击
    var codes = ACTION_KEYS[action] || [];
    for (var i = 0; i < codes.length; i++) {
      if (held[codes[i]]) return true;
    }
    return false;
  }

  /* 消费式边沿：返回 true 后清空，不会被重复触发 */
  function wasPressed(action) {
    if (press[action] > 0) {
      press[action] = 0;
      return true;
    }
    return false;
  }

  function onKeyDown(e) {
    var code = e.code;
    if (!code) return;
    if (PREVENT[code]) {
      try { e.preventDefault(); } catch (err) { /* ignore */ }
    }
    // 长按重复：只维持按住状态，不产生新的边沿
    if (e.repeat) {
      held[code] = true;
      return;
    }
    if (!held[code]) pressActionForCode(code);
    held[code] = true;
  }

  function onKeyUp(e) {
    if (!e.code) return;
    held[e.code] = false;
    if (PREVENT[e.code]) {
      try { e.preventDefault(); } catch (err) { /* ignore */ }
    }
  }

  function updateMousePos(e) {
    if (!canvasEl) return;
    try {
      var r = canvasEl.getBoundingClientRect();
      if (!r.width || !r.height) return;
      mouse.x = (e.clientX - r.left) * (G.VIEW_W / r.width);
      mouse.y = (e.clientY - r.top) * (G.VIEW_H / r.height);
    } catch (err) { /* ignore */ }
  }

  function onMouseMove(e) { updateMousePos(e); }

  function onMouseDown(e) {
    if (onTouchUI(e)) return;       // 点虚拟键位不触发攻击
    updateMousePos(e);
    var btn = (e.button === undefined) ? 0 : e.button;
    if (btn === 2) { mouse.right = true; return; }
    if (btn !== 0) return;
    mouse.heldIgnored = false;      // 重新按下 = 新的按压，恢复正常
    mouse.down = true;
    mouse.clicked = true;
    setPress('attack');            // 点击也进缓冲：冷却中点击不会白按
    try { e.preventDefault(); } catch (err) { /* ignore */ }
  }

  function onMouseUp(e) {
    var btn = (e.button === undefined) ? 0 : e.button;
    if (btn === 2) { mouse.right = false; return; }
    mouse.down = false;
    mouse.heldIgnored = false;
  }

  /* 指针离开页面 / 触摸结束：避免“按住状态”卡死 */
  function releaseAll() {
    mouse.down = false;
    mouse.right = false;
    mouse.heldIgnored = false;
  }

  function onBlur() {
    held = {};
    press = {};
    clearVirtual();
    releaseAll();
    mouse.clicked = false;
  }

  /* 触摸点落在虚拟键位 / 竖屏提示上时，不要把它当成"点画面攻击" */
  function onTouchUI(e) {
    var t = e.target;
    if (!t || !t.closest) return false;
    return !!t.closest('#touch-layer, #rotate-hint');
  }

  function onTouchStart(e) {
    if (onTouchUI(e)) return;
    if (!e.touches || e.touches.length === 0) return;
    var t = e.touches[0];
    updateMousePos({ clientX: t.clientX, clientY: t.clientY });
    mouse.down = true;
    mouse.clicked = true;
    setPress('attack');
    try { e.preventDefault(); } catch (err) { /* ignore */ }
  }

  function onTouchEnd() { releaseAll(); }

  function init(canvas) {
    canvasEl = canvas;
    if (listenersOn) return;
    listenersOn = true;
    global.addEventListener('keydown', onKeyDown, false);
    global.addEventListener('keyup', onKeyUp, false);
    global.addEventListener('blur', onBlur, false);
    global.addEventListener('mousemove', onMouseMove, false);
    global.addEventListener('mousedown', onMouseDown, false);
    global.addEventListener('mouseup', onMouseUp, false);
    global.addEventListener('touchstart', onTouchStart, false);
    global.addEventListener('touchend', onTouchEnd, false);
    global.addEventListener('touchcancel', onTouchEnd, false);
    global.addEventListener('contextmenu', function (e) {
      try { e.preventDefault(); } catch (err) { /* ignore */ }
    }, false);
    global.addEventListener('dragstart', function (e) {
      try { e.preventDefault(); } catch (err) { /* ignore */ }
    }, false);
  }

  /* 每个逻辑 tick 调用一次：缓冲寿命递减（过期即丢弃，不会无限堆积） */
  function endTick() {
    for (var i = 0; i < actionNames.length; i++) {
      var a = actionNames[i];
      if (press[a] > 0) press[a]--;
    }
  }

  /* 每个渲染帧调用一次：只清鼠标“本帧点击”（用于 UI 按钮） */
  function endFrame() {
    mouse.clicked = false;
  }

  /* 状态切换时清空缓冲，避免菜单里的按键漏到游戏里 */
  function clearPresses() {
    press = {};
    mouse.clicked = false;
    // 关键：切换瞬间仍按着左键时，忽略这次按压，直到玩家松手再按
    mouse.heldIgnored = mouse.down;
  }

  function anyInputThisFrame() {
    return mouse.clicked || mouse.down;
  }

  global.Input = {
    init: init,
    isDown: isDown,
    wasPressed: wasPressed,
    setVirtual: setVirtual,
    clearVirtual: clearVirtual,
    endTick: endTick,
    endFrame: endFrame,
    clearPresses: clearPresses,
    anyInputThisFrame: anyInputThisFrame,
    mouse: mouse
  };
})(window);
