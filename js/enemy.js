/* =========================================================================
 * enemy.js —— 敌人实体、状态机、AI、受击、死亡、敌方弹幕
 * 三种 MVP 敌人：slime（近战追击）、archer（远程射击）、bat（飞行骚扰）
 * 外加 Boss：裂隙守卫（冲锋 + 扇形弹幕 + 二阶段）
 * ========================================================================= */
(function (global) {
  'use strict';

  var G = global.GameData;
  var U = global.Util;
  var T = G.TUNING;

  function approach(v, target, step) {
    if (v < target) return Math.min(v + step, target);
    if (v > target) return Math.max(v - step, target);
    return v;
  }

  /* ------------------------------ 生成 ------------------------------ */
  function spawn(typeKey, x, feetY, opts) {
    opts = opts || {};
    var base = G.ENEMY_TYPES[typeKey];
    if (!base) return null;
    var depth = opts.depth || 0;
    var scaled = G.scaleEnemy(base, depth);

    return {
      kind: typeKey,
      base: base,
      w: base.w,
      h: base.h,
      x: x,
      y: feetY - base.h,
      vx: 0,
      vy: 0,
      facing: -1,
      onGround: false,
      hitWall: false,
      hp: scaled.hp,
      maxHp: scaled.hp,
      damage: scaled.damage,
      state: 'idle',
      stateTimer: 40,
      atkCd: U.randInt(30, 90),
      windup: 0,
      chargeLeft: 0,
      shotTimer: 0,
      flash: 0,
      hurtTimer: 0,
      dead: false,
      deathTimer: 0,
      bob: Math.random() * Math.PI * 2,
      hoverY: feetY - base.h,
      roomIndex: opts.roomIndex || 0,
      isBoss: !!base.isBoss,
      phase: 1,
      gold: base.gold,
      depth: depth
    };
  }

  /* ------------------------------ 物理 ------------------------------ */
  function physics(e, world) {
    if (e.kind === 'bat') return; // 飞行怪不吃重力
    e.vy += T.gravity;
    if (e.vy > T.maxFall) e.vy = T.maxFall;
    var res = global.Room.moveBody(e, world.room.solids);
    e.onGround = res.onGround;
    e.hitWall = res.hitWall;
    if (e.x < 0) { e.x = 0; e.hitWall = true; }
    if (e.x + e.w > G.ROOM_W) { e.x = G.ROOM_W - e.w; e.hitWall = true; }
  }

  function groundAhead(e, world) {
    var probe = {
      x: e.facing > 0 ? e.x + e.w : e.x - 2,
      y: e.y + e.h + 1,
      w: 2,
      h: 6
    };
    var solids = world.room.solids;
    for (var i = 0; i < solids.length; i++) {
      if (solids[i].oneWay) continue;
      if (U.overlap(probe, solids[i])) return true;
    }
    return false;
  }

  /* ------------------------------ AI ------------------------------ */
  function updateSlime(e, world) {
    var p = world.player;
    var dx = (p.x + p.w / 2) - (e.x + e.w / 2);
    var adx = Math.abs(dx);
    var near = adx < e.base.detect && Math.abs((p.y + p.h) - (e.y + e.h)) < 80;

    if (near) {
      e.state = 'chase';
      e.facing = dx > 0 ? 1 : -1;
      e.vx = approach(e.vx, e.facing * e.base.chaseSpeed, 0.12);
      if (e.onGround && adx > 26 && e.stateTimer % 46 === 0) {
        e.vy = e.base.jumpVel;
      }
    } else {
      e.state = 'patrol';
      e.vx = approach(e.vx, e.facing * e.base.speed, 0.1);
      if (e.onGround && (!groundAhead(e, world) || e.hitWall)) {
        e.facing *= -1;
        e.vx = 0;
      }
    }
    if (e.onGround && (!groundAhead(e, world))) e.facing *= -1;
  }

  function updateArcher(e, world) {
    var p = world.player;
    var dx = (p.x + p.w / 2) - (e.x + e.w / 2);
    var adx = Math.abs(dx);
    e.facing = dx >= 0 ? 1 : -1;

    if (e.windup > 0) {
      e.windup--;
      e.vx = approach(e.vx, 0, 0.4);
      if (e.windup === 0) {
        shootArrow(e, world);
        e.atkCd = e.base.shootCd;
      }
    } else {
      if (adx < e.base.keepDist - 24) {
        e.vx = approach(e.vx, -e.facing * e.base.speed, 0.1);
        e.state = 'retreat';
      } else if (adx > e.base.keepDist + 70) {
        e.vx = approach(e.vx, e.facing * e.base.speed, 0.1);
        e.state = 'chase';
      } else {
        e.vx = approach(e.vx, 0, 0.2);
        e.state = 'idle';
      }
      e.atkCd--;
      if (e.atkCd <= 0 && adx < e.base.detect && Math.abs((p.y + p.h / 2) - (e.y + e.h / 2)) < 150) {
        e.windup = e.base.windup;
        e.state = 'attack';
      }
      // 面向墙边就别掉下去
      if (e.onGround && !groundAhead(e, world)) e.vx = 0;
    }
  }

  function shootArrow(e, world) {
    var p = world.player;
    var sx = e.x + e.w / 2 + e.facing * 6;
    var sy = e.y + 6;
    var tx = p.x + p.w / 2;
    var ty = p.y + p.h / 2;
    var ang = Math.atan2(ty - sy, tx - sx);
    var sp = e.base.projSpeed;
    Projectiles.spawn(world, sx, sy, Math.cos(ang) * sp, Math.sin(ang) * sp,
      e.base.projDmg, '#ffb347', 5, 240);
    if (global.SFX) global.SFX.play('arrow');
  }

  function updateBat(e, world) {
    var p = world.player;
    e.bob += 0.07;
    var dx = (p.x + p.w / 2) - (e.x + e.w / 2);
    var adx = Math.abs(dx);

    if (adx < e.base.detect) {
      e.state = 'chase';
      e.facing = dx > 0 ? 1 : -1;
      e.vx = approach(e.vx, e.facing * e.base.chaseSpeed, 0.09);
      var targetY = p.y + p.h / 2 - e.h / 2 - 6 + Math.sin(e.bob) * e.base.hoverAmp;
      e.vy = approach(e.vy, U.clamp((targetY - e.y) * 0.06, -1.8, 1.8), 0.12);
    } else {
      e.state = 'patrol';
      e.vx = approach(e.vx, Math.sin(e.bob * 1.4) * e.base.speed, 0.06);
      e.vy = approach(e.vy, Math.sin(e.bob) * 0.35, 0.06);
    }
    e.x += e.vx;
    e.y += e.vy;
    e.x = U.clamp(e.x, 0, G.ROOM_W - e.w);
    e.y = U.clamp(e.y, 16, G.GROUND_Y - e.h - 2);
  }

  function updateBoss(e, world) {
    var p = world.player;
    var pcx = p.x + p.w / 2;

    if (e.phase === 1 && e.hp <= e.maxHp * 0.5) {
      e.phase = 2;
      e.flash = 16;
      world.shake = 9;
      world.floaters.push({
        x: e.x + e.w / 2, y: e.y - 8,
        text: '狂暴！', color: '#ff4d4d', life: 80, vy: -0.4, size: 12
      });
      if (global.SFX) global.SFX.play('boss');
    }

    e.facing = pcx < e.x + e.w / 2 ? -1 : 1;
    e.stateTimer--;

    if (e.stateTimer <= 0) {
      var roll = Math.random();
      if (roll < 0.42) {
        e.state = 'charge';
        e.windup = e.phase === 2 ? 20 : 28;
        e.chargeLeft = 0;
        e.vx = 0;
        e.stateTimer = 90;
        if (global.SFX) global.SFX.play('charge');
      } else if (roll < 0.78) {
        e.state = 'shoot';
        e.shotTimer = 14;
        e.stateTimer = e.phase === 2 ? 80 : 70;
        e.vx = 0;
      } else {
        e.state = 'walk';
        e.stateTimer = 70;
      }
    }

    if (e.state === 'walk') {
      e.vx = approach(e.vx, e.facing * e.base.chaseSpeed, 0.1);
    } else if (e.state === 'charge') {
      if (e.windup > 0) {
        e.windup--;
        e.vx = approach(e.vx, 0, 0.5);
        if (e.windup === 0) {
          e.vx = e.facing * e.base.chargeSpeed;
          e.chargeLeft = 26;
        }
      } else if (e.chargeLeft > 0) {
        e.chargeLeft--;
        if (e.hitWall) {
          e.chargeLeft = 0;
          e.vx = 0;
          world.shake = 7;
        }
      } else {
        e.vx = approach(e.vx, 0, 0.3);
      }
    } else if (e.state === 'shoot') {
      e.vx = approach(e.vx, 0, 0.3);
      e.shotTimer--;
      if (e.shotTimer <= 0) {
        var n = e.phase === 2 ? 5 : 3;
        var sx = e.x + e.w / 2;
        var sy = e.y + e.h * 0.35;
        var baseAng = Math.atan2((p.y + p.h / 2) - sy, pcx - sx);
        for (var i = 0; i < n; i++) {
          var a = baseAng + (i - (n - 1) / 2) * 0.30;
          Projectiles.spawn(world, sx, sy,
            Math.cos(a) * 2.4, Math.sin(a) * 2.4,
            e.base.damage, '#ff5c5c', 5, 260);
        }
        e.shotTimer = e.phase === 2 ? 20 : 30;
        if (global.SFX) global.SFX.play('bossShoot');
      }
    }
  }

  /* ------------------------------ 更新 ------------------------------ */
  function update(e, world) {
    if (e.flash > 0) e.flash--;
    if (e.hurtTimer > 0) e.hurtTimer--;
    e.stateTimer++;

    if (e.dead) {
      e.deathTimer--;
      e.vy += T.gravity * 0.6;
      e.y += e.vy;
      e.x += e.vx;
      e.vx *= 0.9;
      return;
    }

    if (e.hurtTimer > 0) {
      // 受击硬直：只吃击退，不做 AI
      physics(e, world);
      e.vx *= 0.86;
      return;
    }

    if (e.kind === 'slime') updateSlime(e, world);
    else if (e.kind === 'archer') updateArcher(e, world);
    else if (e.kind === 'bat') updateBat(e, world);
    else if (e.kind === 'boss') updateBoss(e, world);

    physics(e, world);
    if (e.kind !== 'bat') e.vx *= 0.94;

    // 掉出房间：直接消失，避免卡门
    if (e.y > G.VIEW_H + 90) {
      e.dead = true;
      e.deathTimer = 0;
      return;
    }

    // 接触伤害
    var p = world.player;
    if (p && !p.dead && U.overlap(e, p)) {
      global.Player.hurt(p, e.damage, e.x + e.w / 2, world);
    }
  }

  /* ------------------------------ 受伤 / 死亡 ------------------------------ */
  function hit(e, dmg, dirX, world, isCrit) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 7;
    e.hurtTimer = 8;
    e.vx = dirX * (e.isBoss ? 1.4 : 3.4);
    if (!e.isBoss && e.onGround) e.vy = -2.0;

    world.hitstop = Math.max(world.hitstop, T.hitstopFrames);
    world.shake = Math.max(world.shake, isCrit ? T.shakeHit * 1.6 : T.shakeHit);

    world.floaters.push({
      x: e.x + e.w / 2,
      y: e.y - 2,
      text: (isCrit ? '暴击 ' : '') + dmg,
      color: isCrit ? '#ffd166' : '#ffffff',
      life: isCrit ? 50 : 38,
      vy: -0.7,
      size: isCrit ? 11 : 9
    });
    world.emitParticles(e.x + e.w / 2, e.y + e.h / 2, isCrit ? '#ffd166' : '#ffffff', isCrit ? 10 : 5);

    if (global.SFX) global.SFX.play(isCrit ? 'crit' : 'hit');

    if (e.hp <= 0) kill(e, world);
  }

  function kill(e, world) {
    if (e.dead) return;
    e.dead = true;
    e.deathTimer = 20;
    e.vy = -2.4;
    e.vx = 0;
    world.kills++;

    world.emitParticles(e.x + e.w / 2, e.y + e.h / 2, e.base.color, e.isBoss ? 40 : 14);

    // 掉金币
    var coins = e.isBoss ? 10 : (e.gold || 1);
    for (var i = 0; i < coins; i++) {
      world.pickups.push({
        type: 'coin',
        x: e.x + e.w / 2 - 3,
        y: e.y + e.h / 2 - 3,
        w: 6, h: 6,
        vx: U.rand(-1.6, 1.6),
        vy: U.rand(-3.2, -1.2),
        life: 480,
        value: 1,
        taken: false,
        bob: Math.random() * 6.28
      });
    }

    // 击杀回血
    var p = world.player;
    if (p && p.stats.lifesteal > 0 && p.hp < p.maxHp) {
      var heal = Math.min(p.stats.lifesteal, p.maxHp - p.hp);
      p.hp += heal;
      world.floaters.push({
        x: p.x + p.w / 2, y: p.y - 4,
        text: '+' + heal, color: '#ff8ad4', life: 40, vy: -0.6, size: 9
      });
    }

    if (e.isBoss) {
      world.shake = 10;
      world.hitstop = 8;
      world.bossDead = true;
      if (global.SFX) global.SFX.play('death');
    }
  }

  /* ------------------------------ 绘制 ------------------------------ */
  function draw(ctx, e, world) {
    if (e.dead && e.deathTimer <= 0) return;

    var camX = world.camera.x;
    if (e.x + e.w < camX - 40 || e.x > camX + G.VIEW_W + 40) return;

    var x = Math.round(e.x);
    var y = Math.round(e.y);
    var white = e.flash > 0;
    var alpha = 1;
    if (e.dead) {
      alpha = Math.max(0, e.deathTimer / 20);
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    if (e.kind === 'slime') drawSlime(ctx, e, x, y, white);
    else if (e.kind === 'archer') drawArcher(ctx, e, x, y, white, world);
    else if (e.kind === 'bat') drawBat(ctx, e, x, y, white, world);
    else if (e.kind === 'boss') drawBoss(ctx, e, x, y, white, world);

    // 小血条（非 Boss）
    if (!e.isBoss && !e.dead && e.hp < e.maxHp) {
      var bw = e.w;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y - 6, bw, 3);
      ctx.fillStyle = '#ff5c5c';
      ctx.fillRect(x, y - 6, Math.max(0, Math.round(bw * (e.hp / e.maxHp))), 3);
    }

    ctx.restore();
  }

  function drawSlime(ctx, e, x, y, white) {
    var c1 = white ? '#ffffff' : e.base.color;
    var c2 = white ? '#ffffff' : e.base.color2;
    var eye = white ? '#ffffff' : e.base.eye;
    // 身体
    ctx.fillStyle = c1;
    ctx.fillRect(x + 1, y + 2, 14, 11);
    ctx.fillRect(x + 3, y, 10, 3);
    ctx.fillRect(x, y + 5, 16, 6);
    // 底部阴影
    ctx.fillStyle = c2;
    ctx.fillRect(x + 1, y + 10, 14, 3);
    // 眼睛
    ctx.fillStyle = eye;
    ctx.fillRect(x + 4, y + 5, 2, 2);
    ctx.fillRect(x + 10, y + 5, 2, 2);
    // 瞳孔高光
    if (!white) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x + 4, y + 5, 1, 1);
      ctx.fillRect(x + 10, y + 5, 1, 1);
    }
  }

  function drawArcher(ctx, e, x, y, white, world) {
    var c1 = white ? '#ffffff' : e.base.color;
    var c2 = white ? '#ffffff' : e.base.color2;
    var eye = white ? '#ffffff' : e.base.eye;
    // 斗篷
    ctx.fillStyle = c1;
    ctx.fillRect(x + 3, y + 1, 8, 7);
    ctx.fillRect(x + 2, y + 3, 10, 6);
    ctx.fillRect(x + 4, y + 9, 6, 8);
    // 阴影 / 腰带
    ctx.fillStyle = c2;
    ctx.fillRect(x + 4, y + 13, 6, 2);
    ctx.fillRect(x + 4, y + 16, 2, 4);
    ctx.fillRect(x + 8, y + 16, 2, 4);
    // 眼睛
    ctx.fillStyle = eye;
    ctx.fillRect(x + 5, y + 4, 2, 2);
    ctx.fillRect(x + 8, y + 4, 2, 2);
    // 弓
    if (e.windup > 0) {
      ctx.strokeStyle = '#f0e0b0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      var bx = e.facing > 0 ? x + 12 : x + 1;
      ctx.moveTo(bx + 1, y + 4);
      ctx.lineTo(bx + 1, y + 12);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,150,0.6)';
      ctx.beginPath();
      ctx.moveTo(bx + 1, y + 4);
      ctx.lineTo(bx + (e.facing > 0 ? 4 : -4), y + 8);
      ctx.lineTo(bx + 1, y + 12);
      ctx.stroke();
    }
  }

  function drawBat(ctx, e, x, y, white, world) {
    var c1 = white ? '#ffffff' : e.base.color;
    var c2 = white ? '#ffffff' : e.base.color2;
    var flap = Math.sin((e.bob || 0) * 3.2) > 0;
    ctx.fillStyle = c1;
    // 身体
    ctx.fillRect(x + 3, y + 3, 6, 5);
    // 耳朵
    ctx.fillRect(x + 4, y + 1, 1, 2);
    ctx.fillRect(x + 7, y + 1, 1, 2);
    // 翅膀
    ctx.fillStyle = c2;
    if (flap) {
      ctx.fillRect(x - 2, y + 1, 5, 3);
      ctx.fillRect(x + 9, y + 1, 5, 3);
      ctx.fillRect(x - 1, y + 4, 4, 2);
      ctx.fillRect(x + 9, y + 4, 4, 2);
    } else {
      ctx.fillRect(x - 2, y + 4, 5, 3);
      ctx.fillRect(x + 9, y + 4, 5, 3);
      ctx.fillRect(x - 1, y + 7, 3, 2);
      ctx.fillRect(x + 10, y + 7, 3, 2);
    }
    // 眼睛
    ctx.fillStyle = white ? '#ffffff' : '#ff5c5c';
    ctx.fillRect(x + 4, y + 4, 1, 1);
    ctx.fillRect(x + 7, y + 4, 1, 1);
  }

  function drawBoss(ctx, e, x, y, white, world) {
    var p2 = e.phase === 2;
    var c1 = white ? '#ffffff' : e.base.color;
    var c2 = white ? '#ffffff' : e.base.color2;
    var eye = white ? '#ffffff' : (p2 ? '#ffe066' : '#ff3030');

    // 狂暴光环
    if (p2 && !white) {
      ctx.fillStyle = 'rgba(255,60,60,0.12)';
      ctx.fillRect(x - 6, y - 4, e.w + 12, e.h + 6);
    }
    // 躯干
    ctx.fillStyle = c1;
    ctx.fillRect(x + 2, y + 8, e.w - 4, e.h - 8);
    ctx.fillRect(x + 5, y + 2, e.w - 10, 8);
    // 角
    ctx.fillStyle = c2;
    ctx.fillRect(x + 2, y, 5, 6);
    ctx.fillRect(x + e.w - 7, y, 5, 6);
    ctx.fillRect(x + 1, y - 3, 3, 4);
    ctx.fillRect(x + e.w - 4, y - 3, 3, 4);
    // 胸口裂痕
    ctx.fillStyle = c2;
    ctx.fillRect(x + e.w / 2 - 2, y + 14, 4, 5);
    ctx.fillRect(x + e.w / 2 - 6, y + 20, 5, 3);
    ctx.fillRect(x + e.w / 2 + 1, y + 22, 6, 3);
    // 眼睛
    ctx.fillStyle = eye;
    ctx.fillRect(x + 8, y + 8, 5, 3);
    ctx.fillRect(x + e.w - 13, y + 8, 5, 3);
    if (p2 && !white) {
      ctx.fillStyle = 'rgba(255,200,80,0.35)';
      ctx.fillRect(x + 6, y + 7, 9, 5);
      ctx.fillRect(x + e.w - 15, y + 7, 9, 5);
    }
    // 腿
    ctx.fillStyle = c2;
    ctx.fillRect(x + 5, y + e.h - 4, 7, 4);
    ctx.fillRect(x + e.w - 12, y + e.h - 4, 7, 4);

    // 冲锋预警
    if (e.state === 'charge' && e.windup > 0 && !white) {
      ctx.fillStyle = 'rgba(255,80,80,' + (0.25 + 0.2 * Math.sin(world.time * 0.6)) + ')';
      ctx.fillRect(x - 2, y - 4, e.w + 4, e.h + 8);
    }
  }

  /* ------------------------------ 敌方弹幕 ------------------------------ */
  var Projectiles = {
    spawn: function (world, x, y, vx, vy, dmg, color, size, life) {
      world.projectiles.push({
        x: x, y: y,
        w: size || 4, h: size || 4,
        vx: vx, vy: vy,
        dmg: dmg,
        color: color || '#ffb347',
        life: life || 240,
        dead: false,
        spin: 0
      });
    },

    updateAll: function (world) {
      var p = world.player;
      var solids = world.room ? world.room.solids : [];
      var list = world.projectiles;
      var i, j;

      for (i = 0; i < list.length; i++) {
        var pr = list[i];
        if (pr.dead) continue;
        pr.x += pr.vx;
        pr.y += pr.vy;
        pr.life--;
        pr.spin += 0.3;

        if (pr.life <= 0) { pr.dead = true; continue; }
        if (pr.x < -30 || pr.x > G.ROOM_W + 30 || pr.y < -30 || pr.y > G.VIEW_H + 60) {
          pr.dead = true;
          continue;
        }

        // 撞墙
        for (j = 0; j < solids.length; j++) {
          var s = solids[j];
          if (s.oneWay) continue;
          if (U.overlap(pr, s)) {
            pr.dead = true;
            world.emitParticles(pr.x + 2, pr.y + 2, pr.color, 4);
            break;
          }
        }
        if (pr.dead) continue;

        // 命中玩家
        if (p && !p.dead && U.overlap(pr, p) && p.iframes <= 0 && p.dashFrames <= 0) {
          global.Player.hurt(p, pr.dmg, pr.x, world);
          pr.dead = true;
          world.emitParticles(pr.x + 2, pr.y + 2, pr.color, 6);
        }
      }

      // 清理
      var keep = [];
      for (i = 0; i < list.length; i++) {
        if (!list[i].dead) keep.push(list[i]);
      }
      world.projectiles = keep;
    },

    drawAll: function (ctx, world) {
      var list = world.projectiles;
      var camX = world.camera.x;
      for (var i = 0; i < list.length; i++) {
        var pr = list[i];
        if (pr.x + pr.w < camX - 20 || pr.x > camX + G.VIEW_W + 20) continue;
        var x = Math.round(pr.x);
        var y = Math.round(pr.y);
        // 拖尾
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(Math.round(x - pr.vx * 1.5), Math.round(y - pr.vy * 1.5), pr.w, pr.h);
        // 本体
        ctx.fillStyle = pr.color;
        ctx.fillRect(x, y, pr.w, pr.h);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(x + 1, y + 1, Math.max(1, pr.w - 2), Math.max(1, pr.h - 2));
      }
    }
  };

  global.Enemy = {
    spawn: spawn,
    update: update,
    hit: hit,
    draw: draw,
    kill: kill
  };
  global.Projectiles = Projectiles;
})(window);
