/* =========================================================================
 * player.js —— 玩家：移动 / 跳跃 / 土狼时间 / 跳跃缓冲 / 可变跳跃高度 /
 *              地面与空中攻击 / 冲刺无敌 / 受击无敌帧 + 击退 + 闪白
 * ========================================================================= */
(function (global) {
  'use strict';

  var G = global.GameData;
  var U = global.Util;
  var T = G.TUNING;

  function create(x, feetY) {
    var p = {
      x: x,
      y: feetY - T.playerH,
      w: T.playerW,
      h: T.playerH,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: false,
      hp: T.playerMaxHp,
      maxHp: T.playerMaxHp,
      iframes: 0,
      flash: 0,
      hurtTimer: 0,
      coyote: 0,
      jumpBuffer: 0,
      jumpCut: false,
      airJumps: T.airJumps,
      airJumpsUsed: 0,
      jumpFx: 0,
      dashFrames: 0,
      dashDir: 1,
      dashCd: 0,
      attackTimer: 0,
      attackCd: 0,
      attackBuffer: 0,
      attackHits: [],
      anim: 0,
      dead: false,
      deadTimer: 0,
      items: [],
      stats: {
        damage: T.attackDamage,
        attackCd: T.attackCooldown,
        dashCd: T.dashCooldown,
        crit: T.critChance,
        lifesteal: 0,
        maxHp: T.playerMaxHp
      }
    };
    return p;
  }

  function attackBox(p) {
    return {
      x: p.facing > 0 ? p.x + p.w - 2 : p.x - T.attackRange + 2,
      y: p.y + 1,
      w: T.attackRange,
      h: T.attackHeight
    };
  }

  function update(p, world) {
    p.anim++;
    if (p.dead) {
      p.deadTimer++;
      p.vy += T.gravity;
      p.y += p.vy;
      return;
    }

    // ------------------------- 计时器 -------------------------
    if (p.iframes > 0) p.iframes--;
    if (p.flash > 0) p.flash--;
    if (p.hurtTimer > 0) p.hurtTimer--;
    if (p.dashCd > 0) p.dashCd--;
    if (p.attackCd > 0) p.attackCd--;
    if (p.jumpBuffer > 0) p.jumpBuffer--;
    if (p.jumpFx > 0) p.jumpFx--;
    if (p.attackBuffer > 0) p.attackBuffer--;

    // ------------------------- 冲刺 -------------------------
    if (global.Input.wasPressed('dash') && p.dashCd <= 0 && p.dashFrames <= 0 && p.hurtTimer <= 0) {
      p.dashFrames = T.dashFrames;
      p.dashCd = p.stats.dashCd;
      p.dashDir = p.facing;
      p.iframes = Math.max(p.iframes, T.dashInvulnFrames);
      p.attackTimer = 0;
      if (global.SFX) global.SFX.play('dash');
      world.emitParticles(p.x + p.w / 2, p.y + p.h - 4, '#9fd0ff', 6);
    }

    // ------------------------- 水平移动 -------------------------
    if (p.dashFrames > 0) {
      p.dashFrames--;
      p.vx = p.dashDir * T.dashSpeed;
      p.vy *= 0.15;
      if (p.dashFrames % 2 === 0) {
        world.emitParticles(p.x + p.w / 2, p.y + p.h / 2, '#6ea8ff', 2);
      }
      p.facing = p.dashDir;
    } else if (p.hurtTimer <= 0) {
      var left = global.Input.isDown('left');
      var right = global.Input.isDown('right');
      var dir = (right ? 1 : 0) - (left ? 1 : 0);
      var speed = T.moveSpeed;
      var accel = p.onGround ? T.accelGround : T.accelAir;
      var fric = p.onGround ? T.frictionGround : T.frictionAir;

      if (dir !== 0) {
        p.vx += dir * accel;
        if (p.vx > speed) p.vx = speed;
        if (p.vx < -speed) p.vx = -speed;
        p.facing = dir;
      } else {
        if (p.vx > 0) p.vx = Math.max(0, p.vx - fric);
        else if (p.vx < 0) p.vx = Math.min(0, p.vx + fric);
      }
      // 轻微空中阻尼，避免过飘
      if (!p.onGround) p.vx *= 0.995;
    } else {
      p.vx *= 0.9;
    }

    // ------------------------- 跳跃 / 二段跳 -------------------------
    if (global.Input.wasPressed('jump')) {
      p.jumpBuffer = T.jumpBufferFrames;
      p.jumpCut = false;
    }
    var groundJump = (p.onGround || p.coyote > 0);
    var airJump = !groundJump && p.airJumpsUsed < p.airJumps;
    if (p.jumpBuffer > 0 && (groundJump || airJump) && p.hurtTimer <= 0 && p.dashFrames <= 0) {
      if (groundJump) {
        p.coyote = 0;
        if (global.SFX) global.SFX.play('jump');
        world.emitParticles(p.x + p.w / 2, p.y + p.h, '#c0c8ff', 4);
      } else {
        // 二段跳：羽落般的青色气环
        p.airJumpsUsed++;
        p.jumpFx = 10;
        if (global.SFX) global.SFX.play('jump2');
        world.emitParticles(p.x + p.w / 2, p.y + p.h - 2, '#5fe3ff', 7);
        world.emitParticles(p.x + p.w / 2, p.y + p.h - 2, '#dffaff', 3);
      }
      p.vy = groundJump ? T.jumpVel : T.jumpVel * 1.1;
      p.onGround = false;
      p.jumpBuffer = 0;
      p.jumpCut = false;
    }
    // 可变跳跃高度：提前松手则削减上升速度（只削一次）
    if (!global.Input.isDown('jump') && p.vy < 0 && !p.jumpCut && p.dashFrames <= 0 && p.hurtTimer <= 0) {
      p.vy *= T.jumpCutMul;
      p.jumpCut = true;
    }

    // ------------------------- 重力 -------------------------
    if (p.dashFrames <= 0) {
      p.vy += T.gravity;
      if (p.vy > T.maxFall) p.vy = T.maxFall;
    }

    // ------------------------- 碰撞 -------------------------
    var wasGround = p.onGround;
    var res = global.Room.moveBody(p, world.room.solids);
    p.onGround = res.onGround;

    if (p.onGround) {
      p.coyote = T.coyoteFrames;
      p.jumpCut = false;
      p.airJumpsUsed = 0;
      if (!wasGround && p.vy >= 0) {
        world.emitParticles(p.x + p.w / 2, p.y + p.h, '#a0a0d0', 3);
      }
    } else if (p.coyote > 0) {
      p.coyote--;
    }

    // 房间左右边界
    if (p.x < 0) { p.x = 0; if (p.vx < 0) p.vx = 0; }
    if (p.x + p.w > G.ROOM_W) {
      p.x = G.ROOM_W - p.w;
      if (p.vx > 0) p.vx = 0;
    }

    // ------------------------- 攻击 -------------------------
    // 鼠标左键按住 = 连续挥砍；单击也会进 9 tick 缓冲，冷却一结束立刻补上
    if (global.Input.wasPressed('attack')) p.attackBuffer = 9;
    var wantAttack = global.Input.isDown('attack') || p.attackBuffer > 0;
    if (wantAttack && p.attackCd <= 0 && p.dashFrames <= 0 && p.hurtTimer <= 0) {
      p.attackBuffer = 0;
      p.attackTimer = T.attackFrames;
      p.attackCd = p.stats.attackCd;
      p.attackHits = [];
      if (global.SFX) global.SFX.play('attack');
      // 地面挥砍带一点前冲，手感更利落
      if (p.onGround) p.vx += p.facing * 0.9;
      // 空中挥砍略微悬停，方便空中连击
      else p.vy = Math.min(p.vy, 0.6);
    }

    if (p.attackTimer > 0) {
      var frame = T.attackFrames - p.attackTimer;
      if (frame >= T.attackActiveFrom && frame <= T.attackActiveTo) {
        var box = attackBox(p);
        var isCrit = Math.random() < p.stats.crit;
        var dmg = p.stats.damage * (isCrit ? T.critMul : 1);
        for (var i = 0; i < world.enemies.length; i++) {
          var e = world.enemies[i];
          if (e.dead) continue;
          if (p.attackHits.indexOf(e) >= 0) continue;
          if (!U.overlap(box, e)) continue;
          p.attackHits.push(e);
          global.Enemy.hit(e, dmg, p.facing, world, isCrit);
        }
      }
      p.attackTimer--;
    }
  }

  function hurt(p, dmg, fromX, world) {
    if (!p || p.dead) return;
    if (p.iframes > 0 || p.dashFrames > 0) return;

    p.hp -= dmg;
    p.iframes = T.iframes;
    p.flash = 10;
    p.hurtTimer = 12;
    var dir = (p.x + p.w / 2) < fromX ? -1 : 1;
    p.vx = dir * T.hurtKnockX;
    p.vy = T.hurtKnockY;
    p.onGround = false;

    world.hitstop = Math.max(world.hitstop, T.hitstopHurtFrames);
    world.shake = Math.max(world.shake, T.shakeHurt);
    world.emitParticles(p.x + p.w / 2, p.y + p.h / 2, '#ff6b6b', 10);
    world.floaters.push({
      x: p.x + p.w / 2, y: p.y - 4,
      text: '-' + dmg, color: '#ff6b6b', life: 40, vy: -0.7, size: 10
    });
    if (global.SFX) global.SFX.play('hurt');

    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      world.playerDead = true;
      world.shake = 10;
      world.hitstop = 10;
      if (global.SFX) global.SFX.play('death');
    }
  }

  function applyItem(p, item, world) {
    return global.Items.apply(p, item, world);
  }

  /* ------------------------------ 绘制 ------------------------------ */
  function draw(ctx, p, world) {
    // 二段跳气环（世界坐标，逐帧扩散）
    if (p.jumpFx > 0) {
      var kk = (10 - p.jumpFx) / 10;
      var ccx = Math.round(p.x + p.w / 2);
      var ccy = Math.round(p.y + p.h - 1);
      var ww = Math.round(3 + kk * 9);
      ctx.globalAlpha = (1 - kk) * 0.9;
      ctx.fillStyle = '#c8f7ff';
      ctx.fillRect(ccx - ww - 2, ccy, 3, 1);
      ctx.fillRect(ccx + ww - 1, ccy, 3, 1);
      ctx.fillStyle = '#5fe3ff';
      ctx.fillRect(ccx - ww - 1, ccy + 1, 2, 1);
      ctx.fillRect(ccx + ww, ccy + 1, 2, 1);
      ctx.fillRect(ccx - 1, ccy, 2, 1);
      ctx.globalAlpha = 1;
    }

    var blink = p.iframes > 0 && Math.floor(p.iframes / 4) % 2 === 0;
    var white = p.flash > 0;
    var alpha = blink ? 0.35 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(p.x + p.w / 2), Math.round(p.y));
    if (p.facing < 0) ctx.scale(-1, 1);

    var cSkin = white ? '#ffffff' : '#f0c090';
    var cArmor = white ? '#ffffff' : '#4a76e0';
    var cArmor2 = white ? '#ffffff' : '#2c4ba8';
    var cHelm = white ? '#ffffff' : '#d8e0ff';
    var cBoot = white ? '#ffffff' : '#3a3054';

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-5, p.h - 1, 10, 2);

    // 披风
    ctx.fillStyle = white ? '#ffffff' : '#8b1f4a';
    ctx.fillRect(-6, 8, 3, 9);
    ctx.fillRect(-7, 11, 2, 5);

    // 腿
    var moving = Math.abs(p.vx) > 0.4 && p.onGround;
    var swing = moving ? (Math.floor(p.anim / 5) % 2) : 0;
    ctx.fillStyle = cArmor2;
    if (swing === 0) {
      ctx.fillRect(-4, 15, 3, 4);
      ctx.fillRect(1, 15, 3, 5);
    } else {
      ctx.fillRect(-4, 15, 3, 5);
      ctx.fillRect(1, 15, 3, 4);
    }
    ctx.fillStyle = cBoot;
    ctx.fillRect(-4, 19, 4, 1);
    ctx.fillRect(1, 19, 4, 1);

    // 身体
    ctx.fillStyle = cArmor;
    ctx.fillRect(-4, 8, 8, 7);
    ctx.fillStyle = cArmor2;
    ctx.fillRect(-4, 13, 8, 2);

    // 头
    ctx.fillStyle = cHelm;
    ctx.fillRect(-4, 1, 8, 7);
    ctx.fillStyle = white ? '#ffffff' : '#7a86b8';
    ctx.fillRect(-4, 7, 8, 1);
    // 脸
    ctx.fillStyle = cSkin;
    ctx.fillRect(-3, 4, 6, 3);
    // 眼
    ctx.fillStyle = white ? '#ffffff' : '#1a1030';
    ctx.fillRect(0, 4, 1, 2);
    ctx.fillRect(2, 4, 1, 2);
    // 头盔羽饰
    ctx.fillStyle = white ? '#ffffff' : '#ff4d6d';
    ctx.fillRect(-2, 0, 2, 2);
    ctx.fillRect(-3, -1, 2, 2);

    // 手
    ctx.fillStyle = cSkin;
    ctx.fillRect(3, 10, 2, 3);

    // 剑 / 挥击
    if (p.attackTimer > 0) {
      var prog = 1 - (p.attackTimer / T.attackFrames);
      var ang = -1.0 + prog * 2.0;
      ctx.save();
      ctx.translate(3, 9);
      ctx.rotate(ang);
      ctx.fillStyle = white ? '#ffffff' : '#c9d4ff';
      ctx.fillRect(0, -1, 15, 2);
      ctx.fillStyle = white ? '#ffffff' : '#ffffff';
      ctx.fillRect(14, -1, 4, 2);
      ctx.fillStyle = white ? '#ffffff' : '#8a6a3a';
      ctx.fillRect(-3, -1, 4, 4);
      ctx.restore();

      // 挥击残影
      if (prog < 0.75) {
        ctx.fillStyle = 'rgba(200,220,255,' + (0.35 * (1 - prog)) + ')';
        ctx.fillRect(6, 2, 14, 14);
      }
    } else {
      // 待机时剑在背后
      ctx.fillStyle = white ? '#ffffff' : '#b8c4f0';
      ctx.fillRect(-7, 3, 2, 11);
    }

    ctx.restore();
  }

  global.Player = {
    create: create,
    update: update,
    draw: draw,
    hurt: hurt,
    applyItem: applyItem,
    attackBox: attackBox
  };
})(window);
