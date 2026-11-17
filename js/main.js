/* =========================================================================
 * main.js —— 入口：Canvas 自适应、固定步长主循环、状态机、房间切换、存档
 * 最终加载，负责把所有模块粘起来。
 * ========================================================================= */
(function (global) {
  'use strict';

  var G = global.GameData;
  var U = global.Util;
  var T = G.TUNING;
  var Input = global.Input;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  var FIXED_MS = 1000 / 60;

  var Game = {
    state: 'MENU',          // MENU | PLAYING | PAUSED | DEAD | WIN
    save: null,
    world: null,
    menuTime: 0,
    totalFrames: 0
  };

  /* ------------------------------ 存档 ------------------------------ */
  function defaultSave() {
    return {
      bestTime: 0,
      bestKills: 0,
      bestGold: 0,
      runs: 0,
      wins: 0,
      muted: false
    };
  }

  function loadSave() {
    var s = defaultSave();
    try {
      var raw = global.localStorage.getItem(G.SAVE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          s.bestTime = Number(o.bestTime) || 0;
          s.bestKills = Number(o.bestKills) || 0;
          s.bestGold = Number(o.bestGold) || 0;
          s.runs = Number(o.runs) || 0;
          s.wins = Number(o.wins) || 0;
          s.muted = !!o.muted;
        }
      }
    } catch (e) {
      // localStorage 被禁用 / 隐私模式 / 损坏数据 —— 一律回退到默认值
      s = defaultSave();
    }
    return s;
  }

  function persistSave() {
    try {
      global.localStorage.setItem(G.SAVE_KEY, JSON.stringify(Game.save));
    } catch (e) {
      // 忽略：不能因为存档失败影响游戏
    }
  }

  /* ------------------------------ 画布缩放 ------------------------------ */
  function viewportSize() {
    // 手机上 innerHeight 会被地址栏/刘海骗，visualViewport 更准
    var vv = global.visualViewport;
    var w = vv && vv.width ? vv.width : 0;
    var h = vv && vv.height ? vv.height : 0;
    if (!w || !h) {
      w = global.innerWidth || G.VIEW_W;
      h = global.innerHeight || G.VIEW_H;
    }
    return { w: w, h: h };
  }

  function resize() {
    var vs = viewportSize();
    var isTouch = !!(global.Touch && global.Touch.isTouch && global.Touch.isTouch());
    var scale = Math.min(vs.w / G.VIEW_W, vs.h / G.VIEW_H);

    if (isTouch) {
      // 手机：允许小数倍，把画面顶满短边（横屏时正好铺满高度），
      // 否则 844x390 这种屏幕会被取整成 1 倍，四周留一大圈黑边。
      scale = Math.max(0.25, scale);
    } else if (scale >= 1) {
      scale = Math.floor(scale);      // 台式机：整数倍放大，像素最干净
    } else {
      scale = Math.max(0.4, scale);   // 小窗口按比例缩小
    }

    canvas.style.width = Math.round(G.VIEW_W * scale) + 'px';
    canvas.style.height = Math.round(G.VIEW_H * scale) + 'px';
    ctx.imageSmoothingEnabled = false;
  }

  /* ------------------------------ 世界 ------------------------------ */
  function createWorld(run) {
    var w = {
      run: run,
      roomIndex: 0,
      room: null,
      player: null,
      enemies: [],
      projectiles: [],
      pickups: [],
      particles: [],
      floaters: [],
      camera: { x: 0, y: 0 },
      shake: 0,
      hitstop: 0,
      time: 0,
      kills: 0,
      gold: 0,
      bannerTimer: 0,
      camSnap: true,
      playerDead: false,
      deathTimer: 0,
      bossDead: false,
      fade: 0,
      fadingOut: false,
      transitionTarget: -1,
      finishHandled: false
    };

    w.emitParticles = function (x, y, color, n) {
      emitParticles(w, x, y, color, n);
    };
    return w;
  }

  function emitParticles(w, x, y, color, n) {
    for (var i = 0; i < n; i++) {
      w.particles.push({
        x: x,
        y: y,
        vx: U.rand(-2.2, 2.2),
        vy: U.rand(-2.8, 0.5),
        life: U.randInt(14, 30),
        max: 30,
        color: color || '#ffffff',
        size: Math.random() < 0.3 ? 2 : 1
      });
    }
    if (w.particles.length > 320) {
      w.particles.splice(0, w.particles.length - 320);
    }
  }

  function loadRoom(w, index) {
    w.roomIndex = index;
    w.enemies = [];
    w.projectiles = [];
    w.pickups = [];
    w.particles = [];
    w.floaters = [];
    w.hitstop = 0;
    w.shake = 0;
    w.camSnap = true;
    w.bannerTimer = 100;
    w.fade = 1;
    w.fadingOut = false;

    var entry = w.run[index];
    w.room = global.Room.build(entry.def, index, w);

    var p = w.player;
    p.x = 48;
    p.y = G.GROUND_Y - p.h;
    p.vx = 0;
    p.vy = 0;
    p.facing = 1;
    p.dashFrames = 0;
    p.attackTimer = 0;
    p.hurtTimer = 0;
    p.onGround = true;
    p.iframes = Math.max(p.iframes, 30);

    w.camera.x = 0;

    if (entry.type === 'boss' && global.SFX) {
      global.SFX.play('boss');
    }
  }

  function startRun() {
    Game.save.runs++;
    persistSave();

    var run = G.buildRun();
    var w = createWorld(run);
    w.player = global.Player.create(48, G.GROUND_Y);
    Game.world = w;
    loadRoom(w, 0);
    Game.state = 'PLAYING';
    Game.menuTime = 0;
    Input.clearPresses();
    if (global.SFX) global.SFX.play('ui');
  }

  function finishRun(isWin) {
    var w = Game.world;
    if (!w || w.finishHandled) return;
    w.finishHandled = true;

    var sec = w.time / 60;
    if (isWin) Game.save.wins++;
    if (sec > Game.save.bestTime) Game.save.bestTime = sec;
    if (w.kills > Game.save.bestKills) Game.save.bestKills = w.kills;
    if (w.gold > Game.save.bestGold) Game.save.bestGold = w.gold;
    persistSave();

    Game.state = isWin ? 'WIN' : 'DEAD';
    if (isWin && global.SFX) global.SFX.play('win');
  }

  /* ------------------------------ 每帧逻辑 ------------------------------ */
  function stepPlaying() {
    var w = Game.world;
    if (!w) return;

    w.time++;
    if (w.bannerTimer > 0) w.bannerTimer--;

    // 转场
    if (w.fadingOut) {
      w.fade = Math.min(1, w.fade + 0.09);
      if (w.fade >= 1) {
        if (w.transitionTarget >= w.run.length) {
          finishRun(true);
        } else {
          loadRoom(w, w.transitionTarget);
        }
      }
      return;
    }
    if (w.fade > 0) w.fade = Math.max(0, w.fade - 0.07);

    // 顿帧（命中瞬间冻结世界，但渲染继续）
    if (w.hitstop > 0) {
      w.hitstop--;
      return;
    }

    var p = w.player;

    global.Player.update(p, w);

    var i;
    for (i = 0; i < w.enemies.length; i++) {
      global.Enemy.update(w.enemies[i], w);
    }
    global.Projectiles.updateAll(w);
    if (w.room) global.Room.update(w.room, w);

    // 粒子、飘字
    updateParticles(w);
    updateFloaters(w);

    // 清理死亡敌人
    var alive = [];
    for (i = 0; i < w.enemies.length; i++) {
      var e = w.enemies[i];
      if (e.dead && e.deathTimer <= 0) continue;
      if (e.y > G.VIEW_H + 120) continue;
      alive.push(e);
    }
    w.enemies = alive;

    // 死亡
    if (w.playerDead) {
      w.deathTimer++;
      if (w.deathTimer >= 60) finishRun(false);
      return;
    }

    // 进门
    if (w.room && w.room.door.open && !w.fadingOut && U.overlap(p, w.room.door)) {
      w.fadingOut = true;
      w.transitionTarget = w.roomIndex + 1;
      if (global.SFX) global.SFX.play('door');
    }
  }

  function updateParticles(w) {
    var list = w.particles;
    for (var i = 0; i < list.length; i++) {
      var pt = list[i];
      pt.vy += 0.14;
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vx *= 0.98;
      pt.life--;
    }
    var keep = [];
    for (i = 0; i < list.length; i++) {
      if (list[i].life > 0) keep.push(list[i]);
    }
    w.particles = keep;
  }

  function updateFloaters(w) {
    var list = w.floaters;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      f.y += f.vy;
      f.vy *= 0.96;
      f.life--;
    }
    var keep = [];
    for (i = 0; i < list.length; i++) {
      if (list[i].life > 0) keep.push(list[i]);
    }
    w.floaters = keep;
  }

  function tick() {
    Game.totalFrames++;

    // 全局静音切换
    if (Input.wasPressed('mute')) {
      Game.save.muted = !Game.save.muted;
      global.SFX.setMuted(Game.save.muted);
      persistSave();
      if (!Game.save.muted) global.SFX.play('ui');
    }

    if (Game.state === 'MENU') {
      Game.menuTime++;
      if (Input.wasPressed('confirm')) {
        global.SFX.init();
        startRun();
      }
      return;
    }

    if (Game.state === 'PLAYING') {
      if (Input.wasPressed('pause')) {
        Game.state = 'PAUSED';
        if (global.SFX) global.SFX.play('ui');
        return;
      }
      stepPlaying();
      return;
    }

    if (Game.state === 'PAUSED') {
      if (Input.wasPressed('pause') || Input.wasPressed('confirm')) {
        Game.state = 'PLAYING';
        Input.clearPresses();
        if (global.SFX) global.SFX.play('ui');
      }
      return;
    }

    if (Game.state === 'DEAD' || Game.state === 'WIN') {
      if (Input.wasPressed('confirm')) startRun();
    }
  }

  /* ------------------------------ 渲染 ------------------------------ */
  function drawParticles(ctx, w) {
    var list = w.particles;
    for (var i = 0; i < list.length; i++) {
      var pt = list[i];
      var a = Math.max(0, pt.life / pt.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters(ctx, w) {
    var list = w.floaters;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var a = Math.min(1, f.life / 20);
      ctx.globalAlpha = a;
      ctx.font = 'bold ' + (f.size || 9) + 'px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillText(f.text, Math.round(f.x) + 1, Math.round(f.y) + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, Math.round(f.x), Math.round(f.y));
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function drawPickups(ctx, w) {
    var list = w.pickups;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.type === 'coin') {
        var bob = Math.sin(c.bob) * 1.5;
        ctx.fillStyle = 'rgba(255,209,102,0.20)';
        ctx.fillRect(Math.round(c.x) - 2, Math.round(c.y + bob) - 2, 10, 10);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(Math.round(c.x), Math.round(c.y + bob), 6, 6);
        ctx.fillStyle = '#fff2c0';
        ctx.fillRect(Math.round(c.x) + 1, Math.round(c.y + bob) + 1, 2, 2);
      } else if (c.type === 'item' && c.item) {
        global.Items.drawIcon(ctx, Math.round(c.x), Math.round(c.y), 12, c.item, w.time);
      }
    }
  }

  function drawWorld(w) {
    // 背景（不受相机平移约束，内部自己算视差）
    global.Room.drawBackground(ctx, w);

    var shakeX = 0;
    var shakeY = 0;
    if (w.shake > 0.2) {
      shakeX = U.rand(-w.shake, w.shake);
      shakeY = U.rand(-w.shake, w.shake);
    }

    ctx.save();
    ctx.translate(Math.round(-w.camera.x + shakeX), Math.round(shakeY));

    if (w.room) global.Room.draw(ctx, w.room, w);

    drawPickups(ctx, w);

    var i;
    for (i = 0; i < w.enemies.length; i++) {
      global.Enemy.draw(ctx, w.enemies[i], w);
    }
    global.Projectiles.drawAll(ctx, w);

    if (w.player) global.Player.draw(ctx, w.player, w);

    drawParticles(ctx, w);
    drawFloaters(ctx, w);

    ctx.restore();

    // UI 层
    global.UI.drawHUD(ctx, w);
    global.UI.drawRoomBanner(ctx, w);
    global.UI.drawVignette(ctx, w);

    // 转场遮罩
    if (w.fade > 0) {
      ctx.fillStyle = 'rgba(4,3,10,' + w.fade.toFixed(3) + ')';
      ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
    }

    // 受伤红闪
    if (w.player && w.player.flash > 6) {
      ctx.fillStyle = 'rgba(255,40,60,0.12)';
      ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
    }

    // 死亡淡出
    if (w.playerDead) {
      var a = Math.min(0.6, w.deathTimer / 100);
      ctx.fillStyle = 'rgba(10,4,8,' + a.toFixed(3) + ')';
      ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
    }
  }

  function render() {
    ctx.imageSmoothingEnabled = false;

    if (Game.state === 'MENU') {
      var action = global.UI.drawMenu(ctx, Game.save, Game.menuTime);
      if (action === 'start') {
        global.SFX.init();
        startRun();
      } else if (action === 'mute') {
        Game.save.muted = !Game.save.muted;
        global.SFX.setMuted(Game.save.muted);
        persistSave();
        global.SFX.play('ui');
      } else if (!action && Input.mouse.clicked &&
                 global.Touch && global.Touch.isTouch && global.Touch.isTouch()) {
        // 触屏：点标题页空白处也能开始，不用非得戳中那个按钮
        global.SFX.init();
        startRun();
      }
      return;
    }

    if (Game.world) drawWorld(Game.world);

    if (Game.state === 'PAUSED') {
      var pa = global.UI.drawPause(ctx, Game.world);
      if (pa === 'resume') {
        Game.state = 'PLAYING';
        global.SFX.play('ui');
      } else if (pa === 'restart') {
        startRun();
      } else if (pa === 'menu') {
        Game.state = 'MENU';
        Game.menuTime = 0;
        Input.clearPresses();
      }
      return;
    }

    if (Game.state === 'DEAD') {
      var da = global.UI.drawDeath(ctx, Game.world, Game.save);
      if (da === 'restart') startRun();
      else if (da === 'menu') { Game.state = 'MENU'; Game.menuTime = 0; Input.clearPresses(); }
      return;
    }

    if (Game.state === 'WIN') {
      var wa = global.UI.drawWin(ctx, Game.world, Game.save);
      if (wa === 'restart') startRun();
      else if (wa === 'menu') { Game.state = 'MENU'; Game.menuTime = 0; Input.clearPresses(); }
      return;
    }
  }

  /* ------------------------------ 主循环 ------------------------------ */
  var lastTs = 0;
  var acc = 0;

  function frame(ts) {
    global.requestAnimationFrame(frame);

    // 让触摸层知道现在是不是在游戏里（标题界面藏起战斗键位）
    if (global.Touch && global.Touch.sync) global.Touch.sync(Game.state);

    if (!lastTs) lastTs = ts;
    var dt = ts - lastTs;
    lastTs = ts;
    if (dt < 0) dt = 0;
    if (dt > 200) dt = 200;   // 切后台回来时不要一次补太多帧

    acc += dt;
    var guard = 0;
    while (acc >= FIXED_MS && guard < 5) {
      tick();
      Input.endTick();      // 输入缓冲寿命结算：保证每个按键都有机会被消费
      acc -= FIXED_MS;
      guard++;
    }
    if (guard >= 5) acc = 0;

    try {
      render();
    } catch (err) {
      // 渲染异常不应该把整局游戏打死：画个错误提示后继续
      try {
        ctx.fillStyle = '#100a18';
        ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
        ctx.fillStyle = '#ff5c6c';
        ctx.font = '10px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('渲染错误: ' + (err && err.message ? err.message : 'unknown'), 10, 20);
      } catch (e2) { /* ignore */ }
    }

    Input.endFrame();
  }

  /* ------------------------------ 启动 ------------------------------ */
  function boot() {
    Game.save = loadSave();
    global.SFX.setMuted(!!Game.save.muted);

    Input.init(canvas);
    // 触摸设备：挂上虚拟键位、横屏提示（非触摸设备里 Touch.init 直接空转）
    if (global.Touch && global.Touch.init) global.Touch.init();
    resize();
    global.addEventListener('resize', resize, false);
    global.addEventListener('orientationchange', function () {
      resize();
      if (global.Touch && global.Touch.refresh) global.Touch.refresh();
    }, false);
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', resize, false);
    }

    // 首次用户手势解锁 AudioContext
    var unlock = function () {
      global.SFX.init();
      global.removeEventListener('mousedown', unlock, false);
      global.removeEventListener('keydown', unlock, false);
      global.removeEventListener('touchstart', unlock, false);
    };
    global.addEventListener('mousedown', unlock, false);
    global.addEventListener('keydown', unlock, false);
    global.addEventListener('touchstart', unlock, false);

    // 切到后台自动暂停，避免回来被打死
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.hidden && Game.state === 'PLAYING') {
        Game.state = 'PAUSED';
      }
    }, false);

    global.requestAnimationFrame(frame);
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot, false);
  } else {
    boot();
  }

  // 暴露给调试（不影响正常游戏）
  global.Game = Game;
})(window);
