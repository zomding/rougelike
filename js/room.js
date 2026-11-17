/* =========================================================================
 * room.js —— 房间：碰撞体、平台、门、宝箱/神龛、清房判定、相机、视差背景
 * 房间宽度固定 960（两屏），高度与逻辑分辨率一致 270。
 * ========================================================================= */
(function (global) {
  'use strict';

  var G = global.GameData;
  var U = global.Util;
  var T = G.TUNING;

  /* ------------------------------ 构建房间 ------------------------------ */
  function build(def, index, world) {
    var room = {
      def: def,
      index: index,
      type: def.type,
      name: def.name,
      solids: [],
      door: {
        x: G.ROOM_W - 48,
        y: G.GROUND_Y - 56,
        w: 24,
        h: 56,
        open: false
      },
      pedestals: [],
      shrine: null,
      cleared: false,
      clearedTimer: 0,
      bgSeed: index * 37 + 11,
      time: 0
    };

    // 地面
    room.solids.push({
      x: 0, y: G.GROUND_Y, w: G.ROOM_W, h: G.VIEW_H - G.GROUND_Y,
      oneWay: false, ground: true
    });

    // 平台 / 柱子
    var plats = def.platforms || [];
    for (var i = 0; i < plats.length; i++) {
      var p = plats[i];
      room.solids.push({
        x: p.x, y: p.y, w: p.w, h: p.h,
        oneWay: p.h <= 12,
        ground: false
      });
    }

    // 生成敌人
    var spawns = [];
    var baseSpawns = def.spawns || [];
    for (i = 0; i < baseSpawns.length; i++) spawns.push(baseSpawns[i]);

    if (index > 0 && (def.type === 'battle')) {
      var extra = Math.floor(index / T.extraEnemyEvery);
      for (i = 0; i < extra; i++) {
        var pick = U.choice(baseSpawns);
        spawns.push({
          type: pick.type,
          x: U.clamp(pick.x + U.rand(-70, 70), 90, G.ROOM_W - 110),
          y: pick.y
        });
      }
    }

    for (i = 0; i < spawns.length; i++) {
      var s = spawns[i];
      var enemy = global.Enemy.spawn(s.type, s.x, s.y, {
        depth: index,
        roomIndex: index
      });
      if (enemy) {
        // 让敌人水平居中到出生点
        enemy.x = s.x - enemy.w / 2;
        world.enemies.push(enemy);
      }
    }

    // 宝箱房：三个悬浮道具，碰到哪个拿哪个，其余消失
    if (def.type === 'treasure') {
      var choices = global.Items.rollChoices(index, 3);
      var spots = [];
      var pp = def.platforms || [];
      for (i = 0; i < pp.length && spots.length < 3; i++) {
        spots.push({ x: pp[i].x + pp[i].w / 2, y: pp[i].y });
      }
      while (spots.length < 3) {
        spots.push({ x: 300 + spots.length * 160, y: G.GROUND_Y });
      }
      for (i = 0; i < 3; i++) {
        room.pedestals.push({
          x: spots[i].x - 10,
          y: spots[i].y - 34,
          w: 20,
          h: 22,
          item: choices[i],
          taken: false,
          bob: i * 2.1
        });
      }
    }

    // 休息房：篝火神龛
    if (def.type === 'rest') {
      room.shrine = {
        x: G.ROOM_W / 2 - 3,
        y: G.GROUND_Y - 26,
        w: 18,
        h: 26,
        used: false,
        heal: 4
      };
    }

    // 非战斗房直接算清空（门立刻可以开）
    if (def.type !== 'battle' && def.type !== 'boss') {
      room.cleared = true;
      room.clearedTimer = 1;
    }

    return room;
  }

  /* ------------------------------ 碰撞 ------------------------------ */
  // 逐轴分离的 AABB 移动；返回落地 / 撞墙 / 撞头信息
  function moveBody(b, solids) {
    var res = { onGround: false, hitWall: false, hitCeil: false };
    var i, s;

    b.x += b.vx;
    for (i = 0; i < solids.length; i++) {
      s = solids[i];
      if (s.oneWay) continue;
      if (!U.overlap(b, s)) continue;
      if (b.vx > 0) b.x = s.x - b.w;
      else if (b.vx < 0) b.x = s.x + s.w;
      b.vx = 0;
      res.hitWall = true;
    }

    b.y += b.vy;
    for (i = 0; i < solids.length; i++) {
      s = solids[i];
      if (!U.overlap(b, s)) continue;
      if (s.oneWay) {
        if (b.vy < 0) continue;                       // 从下往上穿
        var prevBottom = b.y + b.h - b.vy;
        if (prevBottom > s.y + 3) continue;           // 已经在平台内部/侧面
      }
      if (b.vy > 0) {
        b.y = s.y - b.h;
        b.vy = 0;
        res.onGround = true;
      } else if (b.vy < 0) {
        b.y = s.y + s.h;
        b.vy = 0;
        res.hitCeil = true;
      }
    }
    return res;
  }

  /* ------------------------------ 更新 ------------------------------ */
  function update(room, world) {
    room.time++;
    var p = world.player;

    // 清房判定
    if (!room.cleared) {
      if (room.type === 'battle' || room.type === 'boss') {
        var alive = 0;
        for (var i = 0; i < world.enemies.length; i++) {
          if (!world.enemies[i].dead) alive++;
        }
        if (alive === 0) {
          room.cleared = true;
          room.clearedTimer = 26;
          world.floaters.push({
            x: p.x + p.w / 2, y: p.y - 16,
            text: '房间已清空', color: '#9dff8a', life: 60, vy: -0.4, size: 10
          });
          // 战斗房清空后有小概率掉一个道具
          if (room.type === 'battle' && U.chance(0.35)) {
            var drop = global.Items.rollDrop(room.index);
            world.pickups.push({
              type: 'item',
              item: drop,
              x: G.ROOM_W / 2 - 6,
              y: 140,
              w: 12, h: 12,
              vx: 0, vy: 0,
              life: 900,
              taken: false,
              bob: 0
            });
          }
        }
      }
    }

    // 开门动画（延迟一拍，给玩家反应时间）
    if (room.cleared && !room.door.open) {
      if (room.clearedTimer > 0) {
        room.clearedTimer--;
        if (room.clearedTimer === 0) {
          room.door.open = true;
          world.shake = Math.max(world.shake, 2.5);
          if (global.SFX) global.SFX.play('door');
          world.emitParticles(room.door.x + 12, room.door.y + 20, '#9dff8a', 14);
        }
      }
    }

    // 宝箱房三选一
    for (i = 0; i < room.pedestals.length; i++) {
      var pd = room.pedestals[i];
      if (pd.taken) continue;
      pd.bob += 0.06;
      if (p && !p.dead && U.overlap(p, pd)) {
        global.Items.apply(p, pd.item, world);
        pd.taken = true;
        for (var k = 0; k < room.pedestals.length; k++) {
          if (k !== i) room.pedestals[k].taken = true;
        }
        world.emitParticles(pd.x + 10, pd.y + 10, pd.item.color, 16);
        break;
      }
    }

    // 休息房神龛
    if (room.shrine && !room.shrine.used) {
      var sh = room.shrine;
      if (p && !p.dead && U.overlap(p, sh)) {
        sh.used = true;
        var heal = Math.min(sh.heal, p.maxHp - p.hp);
        p.hp = Math.min(p.maxHp, p.hp + sh.heal);
        world.floaters.push({
          x: p.x + p.w / 2, y: p.y - 10,
          text: '+' + sh.heal + ' 生命', color: '#9dff8a', life: 60, vy: -0.5, size: 10
        });
        world.emitParticles(sh.x + 9, sh.y + 6, '#ffb347', 18);
        if (global.SFX) global.SFX.play('heal');
      }
    }

    // 金币 / 掉落物
    updatePickups(world);

    // 相机
    updateCamera(world);
  }

  function updatePickups(world) {
    var p = world.player;
    var solids = world.room ? world.room.solids : [];
    var list = world.pickups;
    var i, j;

    for (i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.taken) continue;
      c.life--;
      if (c.life <= 0) { c.taken = true; continue; }
      c.bob += 0.15;

      // 吸附
      if (p && !p.dead) {
        var dx = (p.x + p.w / 2) - (c.x + c.w / 2);
        var dy = (p.y + p.h / 2) - (c.y + c.h / 2);
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 70) {
          c.vx += (dx / (d || 1)) * 0.65;
          c.vy += (dy / (d || 1)) * 0.65;
          c.magnet = true;
          if (d < 16) {
            if (c.type === 'coin') {
              world.gold += c.value;
              if (global.SFX) global.SFX.play('coin');
            } else if (c.type === 'item' && c.item) {
              global.Items.apply(p, c.item, world);
            }
            c.taken = true;
            world.emitParticles(c.x, c.y, c.type === 'coin' ? '#ffd166' : '#ffffff', 5);
            continue;
          }
        }
      }

      if (!c.magnet) {
        c.vy += 0.45;
        if (c.vy > 8) c.vy = 8;
      }
      c.x += c.vx;
      c.y += c.vy;

      // 简单落地
      var foot = { x: c.x, y: c.y, w: c.w, h: c.h };
      for (j = 0; j < solids.length; j++) {
        var s = solids[j];
        if (!U.overlap(foot, s)) continue;
        if (s.oneWay) {
          if (c.vy < 0) continue;
          if (c.y + c.h - c.vy > s.y + 3) continue;
        }
        if (c.vy > 0) {
          c.y = s.y - c.h;
          c.vy = 0;
          c.vx *= 0.7;
        }
      }
      if (c.x < 0) { c.x = 0; c.vx = Math.abs(c.vx) * 0.6; }
      if (c.x > G.ROOM_W - c.w) { c.x = G.ROOM_W - c.w; c.vx = -Math.abs(c.vx) * 0.6; }
    }

    var keep = [];
    for (i = 0; i < list.length; i++) {
      if (!list[i].taken) keep.push(list[i]);
    }
    world.pickups = keep;
  }

  function updateCamera(world) {
    var p = world.player;
    var cam = world.camera;
    if (!p) return;
    var target = p.x + p.w / 2 - G.VIEW_W / 2 + p.facing * 26;
    target = U.clamp(target, 0, G.ROOM_W - G.VIEW_W);
    if (world.camSnap) {
      cam.x = target;
      world.camSnap = false;
    } else {
      cam.x = U.lerp(cam.x, target, 0.12);
    }
    if (world.shake > 0) {
      world.shake *= T.shakeDecay;
      if (world.shake < 0.25) world.shake = 0;
    }
  }

  /* ------------------------------ 绘制 ------------------------------ */
  function drawBackground(ctx, world) {
    var cam = world.camera.x;
    var t = world.time || 0;
    var room = world.room;
    var type = room ? room.type : 'battle';
    var i, x;

    // 天空渐变（顶部近黑 → 中段暗紫 → 地面附近更深）
    var sky = ctx.createLinearGradient(0, 0, 0, G.VIEW_H);
    sky.addColorStop(0, '#090613');
    sky.addColorStop(0.40, '#171029');
    sky.addColorStop(0.70, '#221733');
    sky.addColorStop(1, '#0c0918');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);

    // 顶部裂隙光晕
    var glow = ctx.createRadialGradient(G.VIEW_W / 2, -30, 8, G.VIEW_W / 2, -30, 260);
    glow.addColorStop(0, 'rgba(150,96,255,0.34)');
    glow.addColorStop(0.45, 'rgba(96,52,190,0.14)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);

    // 星空（最远层，视差 0.08）
    var so = (cam * 0.08) % 240;
    ctx.fillStyle = 'rgba(200,190,255,0.55)';
    for (i = 0; i < 44; i++) {
      x = Math.round((i * 137 - so) % 240 + Math.floor((i * 137 - so) / 240) * 240);
      var sy = (i * 71) % 150 + 6;
      var tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.02 + i));
      ctx.globalAlpha = tw * 0.75;
      var sz = (i % 7 === 0) ? 2 : 1;
      for (var k = -1; k < 4; k++) {
        var sx2 = ((i * 137 - so) % 240 + k * 240 + 2400) % 2400 - 60;
        if (sx2 > -6 && sx2 < G.VIEW_W + 6) ctx.fillRect(Math.round(sx2), sy, sz, sz);
      }
    }
    ctx.globalAlpha = 1;

    // 远层：巨柱（视差 0.22）
    var off1 = (cam * 0.22) % 168;
    for (i = -1; i < 5; i++) {
      x = Math.round(i * 168 - off1);
      // 柱身
      ctx.fillStyle = '#1e1735';
      ctx.fillRect(x, 26, 58, 250);
      // 柱身左受光
      ctx.fillStyle = '#2b2148';
      ctx.fillRect(x + 2, 26, 6, 250);
      // 柱头 / 柱础
      ctx.fillStyle = '#2a2044';
      ctx.fillRect(x - 4, 16, 66, 12);
      ctx.fillRect(x - 2, 28, 4, 4);
      ctx.fillStyle = '#372a58';
      ctx.fillRect(x - 4, 16, 66, 2);
      // 柱身竖纹
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (var vx = x + 16; vx < x + 54; vx += 12) ctx.fillRect(vx, 30, 1, 240);
      // 柱身发光符文
      ctx.fillStyle = 'rgba(150,110,255,' + (0.10 + 0.05 * Math.sin(t * 0.03 + i)) + ')';
      ctx.fillRect(x + 24, 70, 8, 3);
      ctx.fillRect(x + 24, 84, 8, 3);
      ctx.fillRect(x + 24, 98, 8, 3);
    }

    // 中层：拱门（视差 0.45）
    var off2 = (cam * 0.45) % 208;
    for (i = -1; i < 5; i++) {
      x = Math.round(i * 208 - off2);
      // 拱内暗影（先画）
      ctx.fillStyle = '#0d0919';
      ctx.fillRect(x + 16, 100, 132, 176);
      // 柱子
      ctx.fillStyle = '#251c40';
      ctx.fillRect(x, 96, 16, 180);
      ctx.fillRect(x + 148, 96, 16, 180);
      // 柱受光边
      ctx.fillStyle = '#352854';
      ctx.fillRect(x + 1, 96, 3, 180);
      ctx.fillRect(x + 149, 96, 3, 180);
      // 拱顶
      ctx.fillStyle = '#2b2148';
      ctx.fillRect(x, 82, 164, 16);
      ctx.fillStyle = '#3b2e60';
      ctx.fillRect(x, 82, 164, 2);
      ctx.fillStyle = '#150f28';
      ctx.fillRect(x + 16, 96, 132, 6);
      // 拱顶刻纹
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      for (var ax2 = x + 20; ax2 < x + 148; ax2 += 16) ctx.fillRect(ax2, 84, 6, 12);
    }

    // 远景窗户微光
    var off3 = (cam * 0.45) % 208;
    for (i = -1; i < 5; i++) {
      x = Math.round(i * 208 - off3);
      var fl = 0.5 + 0.5 * Math.sin(t * 0.03 + i * 1.7);
      ctx.fillStyle = 'rgba(140,96,255,' + (0.10 + 0.06 * fl) + ')';
      ctx.fillRect(x + 52, 118, 60, 66);
      ctx.fillStyle = 'rgba(180,140,255,' + (0.06 + 0.05 * fl) + ')';
      ctx.fillRect(x + 58, 124, 48, 54);
      ctx.fillStyle = 'rgba(120,90,200,0.22)';
      ctx.fillRect(x + 80, 118, 2, 66);
      ctx.fillRect(x + 52, 150, 60, 2);
    }

    // 房间类型色调（极淡）
    var tint = { battle: 'rgba(120,80,220,0.05)', treasure: 'rgba(255,190,80,0.06)',
      rest: 'rgba(110,255,150,0.05)', boss: 'rgba(255,70,90,0.07)' }[type];
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
    }

    // 接触地面的雾
    var fog = ctx.createLinearGradient(0, 150, 0, G.GROUND_Y);
    fog.addColorStop(0, 'rgba(16,11,30,0)');
    fog.addColorStop(1, 'rgba(14,9,26,0.75)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 150, G.VIEW_W, G.GROUND_Y - 150);

    // 尘埃
    ctx.fillStyle = 'rgba(190,165,255,0.28)';
    for (i = 0; i < 26; i++) {
      var px = (i * 97 + t * 0.25 + cam * 0.1) % G.VIEW_W;
      var py = (i * 53 + Math.sin(t * 0.02 + i) * 12 + 40) % 210;
      ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
  }

  function drawGround(ctx, room, world) {
    var cam = world.camera.x;
    var y = G.GROUND_Y;
    var h = G.VIEW_H - y;

    // 地面主体
    ctx.fillStyle = '#221a38';
    ctx.fillRect(0, y, G.VIEW_W, h);

    // 顶层草地般的碎石带
    ctx.fillStyle = '#4a3a78';
    ctx.fillRect(0, y, G.VIEW_W, 3);
    ctx.fillStyle = '#6b57a8';
    ctx.fillRect(0, y, G.VIEW_W, 1);
    ctx.fillStyle = '#352a58';
    ctx.fillRect(0, y + 3, G.VIEW_W, 4);

    // 砖块（跟随相机，错缝）
    var start = Math.floor(cam / 24) * 24;
    for (var row = 0; row < 3; row++) {
      var ry = y + 7 + row * 10;
      if (ry > G.VIEW_H) break;
      var offset = (row % 2) ? 12 : 0;
      for (var x = -24; x < G.VIEW_W + 24; x += 24) {
        var gx = Math.round(x + (start - cam) + offset);
        // 砖块顶面高光
        ctx.fillStyle = 'rgba(140,120,210,0.10)';
        ctx.fillRect(gx + 1, ry, 22, 1);
        // 竖缝
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        ctx.fillRect(gx, ry, 1, 10);
      }
      // 横缝
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.fillRect(0, ry + 9, G.VIEW_W, 1);
    }

    // 地面碎石点
    ctx.fillStyle = 'rgba(160,140,230,0.16)';
    for (var r = 0; r < 18; r++) {
      var rx = Math.round((r * 89 + (start - cam) * 0.5) % G.VIEW_W);
      var ry2 = y + 5 + (r * 13) % (h - 8);
      ctx.fillRect(rx, ry2, 2, 1);
    }
  }

  function drawPlatform(ctx, s, cam) {
    if (s.ground) return;
    if (s.x + s.w < cam - 20 || s.x > cam + G.VIEW_W + 20) return;
    var x = Math.round(s.x);
    var y = Math.round(s.y);

    // 投影
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 2, y + s.h, s.w, 2);

    // 主体
    ctx.fillStyle = '#2c2348';
    ctx.fillRect(x, y, s.w, s.h);
    // 顶面（亮）
    ctx.fillStyle = '#5a4a88';
    ctx.fillRect(x, y, s.w, 2);
    ctx.fillStyle = 'rgba(190,170,255,0.35)';
    ctx.fillRect(x, y, s.w, 1);
    // 上沿过渡
    ctx.fillStyle = '#3b3060';
    ctx.fillRect(x, y + 2, s.w, 2);
    // 外描边
    ctx.fillStyle = '#151025';
    ctx.fillRect(x, y, 1, s.h);
    ctx.fillRect(x + s.w - 1, y, 1, s.h);
    // 底部暗
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 1, y + s.h - 2, s.w - 2, 2);
    // 砖缝
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (var xx = x + 16; xx < x + s.w - 1; xx += 16) {
      ctx.fillRect(xx, y + 4, 1, s.h - 6);
    }
    if (s.h > 20) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (var yy = y + 16; yy < y + s.h - 4; yy += 16) {
        ctx.fillRect(x + 1, yy, s.w - 2, 1);
      }
    }
    // 顶面装饰钉
    ctx.fillStyle = 'rgba(255,230,180,0.20)';
    for (var nx = x + 6; nx < x + s.w - 4; nx += 16) ctx.fillRect(nx, y + 4, 2, 1);
  }

  function drawDoor(ctx, room, world) {
    var d = room.door;
    if (d.x > world.camera.x + G.VIEW_W + 30) return;
    var x = Math.round(d.x);
    var y = Math.round(d.y);

    // 门框
    ctx.fillStyle = '#141020';
    ctx.fillRect(x - 4, y - 6, d.w + 8, d.h + 6);
    ctx.fillStyle = '#2a2244';
    ctx.fillRect(x - 3, y - 5, d.w + 6, 3);
    ctx.fillRect(x - 3, y - 5, 3, d.h + 5);
    ctx.fillRect(x + d.w, y - 5, 3, d.h + 5);

    if (d.open) {
      // 开启：发光的裂口
      var pulse = 0.55 + 0.25 * Math.sin((world.time || 0) * 0.12);
      ctx.fillStyle = 'rgba(120,255,190,' + (0.22 * pulse) + ')';
      ctx.fillRect(x - 2, y - 2, d.w + 4, d.h + 2);
      ctx.fillStyle = '#0a1a16';
      ctx.fillRect(x, y, d.w, d.h);
      ctx.fillStyle = 'rgba(120,255,190,' + (0.55 * pulse) + ')';
      ctx.fillRect(x + 3, y + 4, d.w - 6, d.h - 8);
      ctx.fillStyle = 'rgba(220,255,240,0.85)';
      ctx.fillRect(x + 8, y + 8, d.w - 16, d.h - 16);
      // 箭头提示
      var ax = x + d.w / 2 + Math.sin((world.time || 0) * 0.15) * 3;
      ctx.fillStyle = '#9dffcf';
      ctx.fillRect(Math.round(ax) - 1, y + d.h / 2 - 4, 3, 8);
      ctx.fillRect(Math.round(ax) - 4, y + d.h / 2 - 1, 9, 2);
    } else {
      // 关闭：铁栅
      ctx.fillStyle = '#0f0c1c';
      ctx.fillRect(x, y, d.w, d.h);
      ctx.fillStyle = '#40345f';
      for (var i = 0; i < 3; i++) {
        ctx.fillRect(x + 4 + i * 8, y + 3, 3, d.h - 6);
      }
      ctx.fillRect(x + 2, y + 14, d.w - 4, 3);
      // 锁
      ctx.fillStyle = room.cleared ? '#9dff8a' : '#ff6b6b';
      ctx.fillRect(x + d.w / 2 - 3, y + d.h / 2 - 2, 6, 5);
    }
  }

  function drawProps(ctx, room, world) {
    var i;
    var cam = world.camera.x;

    // 宝箱房悬浮道具
    for (i = 0; i < room.pedestals.length; i++) {
      var pd = room.pedestals[i];
      if (pd.taken) continue;
      if (pd.x < cam - 40 || pd.x > cam + G.VIEW_W + 40) continue;
      var bobY = Math.round(pd.y + Math.sin(pd.bob) * 3);

      // 光柱
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(Math.round(pd.x) + 2, bobY, 16, 60);
      // 底座
      ctx.fillStyle = '#2a2246';
      ctx.fillRect(Math.round(pd.x), pd.y + 30, 20, 6);
      ctx.fillStyle = '#453a72';
      ctx.fillRect(Math.round(pd.x), pd.y + 30, 20, 2);

      // 道具图标
      global.Items.drawIcon(ctx, pd.x, bobY, 16, pd.item, world.time);
      // 名称牌（像素描边，避免小字糊在背景上）
      if (global.UI) {
        ctx.fillStyle = 'rgba(6,5,12,0.72)';
        ctx.fillRect(Math.round(pd.x) - 6, bobY - 18, 32, 12);
        global.UI.text(ctx, pd.item.name, Math.round(pd.x + 10), bobY - 17, 8, pd.item.color, 'center', 0);
      }
    }

    // 休息房神龛
    if (room.shrine) {
      var sh = room.shrine;
      var sx = Math.round(sh.x);
      var sy = Math.round(sh.y);
      // 石座
      ctx.fillStyle = '#2a2246';
      ctx.fillRect(sx - 6, sy + 18, 30, 8);
      ctx.fillStyle = '#453a72';
      ctx.fillRect(sx - 6, sy + 18, 30, 2);
      // 火焰
      var ft = (world.time || 0) * 0.3;
      var flick = Math.sin(ft) * 2;
      if (!sh.used) {
        ctx.fillStyle = 'rgba(255,180,60,0.18)';
        ctx.fillRect(sx - 12, sy - 18, 42, 46);
        ctx.fillStyle = '#ff7a2a';
        ctx.fillRect(sx + 4, sy + 2 + Math.round(flick * 0.5), 10, 16);
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(sx + 6, sy + 6 + Math.round(flick), 6, 12);
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(sx + 8, sy + 10, 3, 7);
      } else {
        ctx.fillStyle = '#3a3054';
        ctx.fillRect(sx + 4, sy + 8, 10, 10);
        ctx.fillStyle = '#4a3f68';
        ctx.fillRect(sx + 6, sy + 12, 6, 6);
      }
    }
  }

  function draw(ctx, room, world) {
    var cam = world.camera.x;
    drawGround(ctx, room, world);
    for (var i = 0; i < room.solids.length; i++) {
      drawPlatform(ctx, room.solids[i], cam);
    }
    drawDoor(ctx, room, world);
    drawProps(ctx, room, world);

    // 房间入口标识（左侧）
    ctx.fillStyle = 'rgba(120,100,200,0.25)';
    ctx.fillRect(0, G.GROUND_Y - 56, 3, 56);
  }

  global.Room = {
    build: build,
    update: update,
    draw: draw,
    drawBackground: drawBackground,
    moveBody: moveBody,
    updateCamera: updateCamera
  };
})(window);
