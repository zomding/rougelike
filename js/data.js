/* =========================================================================
 * data.js —— 全部游戏数据：分辨率常量、手感参数、敌人、道具、房间池、工具函数
 * 本文件不含游戏流程逻辑，只有配置 + 纯函数，方便后续单独调数值。
 * ========================================================================= */
(function (global) {
  'use strict';

  /* ------------------------------ 基础工具 ------------------------------ */
  var U = {
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    sign: function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); },
    rand: function (a, b) { return a + Math.random() * (b - a); },
    randInt: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    chance: function (p) { return Math.random() < p; },
    choice: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    dist: function (ax, ay, bx, by) {
      var dx = ax - bx, dy = ay - by;
      return Math.sqrt(dx * dx + dy * dy);
    },
    overlap: function (a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    },
    // 简单洗牌（就地）
    shuffle: function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
  };

  /* ------------------------------ 分辨率 ------------------------------ */
  var VIEW_W = 480;
  var VIEW_H = 270;
  var ROOM_W = 960;      // 单个房间宽度 = 两屏，相机跟随
  var GROUND_Y = 238;    // 地面顶部 Y（脚下高度）
  var TILE = 16;

  /* ------------------------------ 手感参数 ------------------------------ */
  var TUNING = {
    // 移动
    moveSpeed: 2.35,
    accelGround: 0.62,
    accelAir: 0.38,
    frictionGround: 0.55,
    frictionAir: 0.10,
    gravity: 0.62,
    maxFall: 12,

    // 跳跃
    jumpVel: -8.8,
    jumpCutMul: 0.42,      // 松开跳跃键时上升速度的衰减（可变跳跃高度）
    coyoteFrames: 7,       // 土狼时间
    jumpBufferFrames: 8,   // 跳跃缓冲
    airJumps: 1,           // 空中可再跳次数（二段跳）

    // 冲刺
    dashSpeed: 6.6,
    dashFrames: 11,
    dashInvulnFrames: 14,
    dashCooldown: 52,

    // 攻击
    attackFrames: 10,      // 一次挥击持续帧
    attackActiveFrom: 2,   // 判定开启帧
    attackActiveTo: 6,     // 判定关闭帧
    attackCooldown: 18,    // 攻击间隔（帧）
    attackDamage: 3,
    attackRange: 26,
    attackHeight: 26,
    critChance: 0.06,
    critMul: 2,

    // 玩家生命
    playerMaxHp: 6,
    playerW: 12,
    playerH: 20,
    iframes: 60,
    hurtKnockX: 3.2,
    hurtKnockY: -3.0,

    // 反馈
    hitstopFrames: 3,
    hitstopHurtFrames: 5,
    shakeHit: 3.5,
    shakeHurt: 6,
    shakeDecay: 0.78,

    // 经济 / 难度
    goldPerKill: 1,
    hpScalePerRoom: 0.16,   // 每深入一个房间生命倍率 +16%
    extraEnemyEvery: 2      // 每 2 个房间多刷 1 只敌人
  };

  /* ------------------------------ 敌人配置 ------------------------------ */
  var ENEMY_TYPES = {
    slime: {
      key: 'slime',
      name: '裂地兽',
      w: 16, h: 14,
      hp: 7,
      damage: 1,
      speed: 0.55,        // 巡逻速度
      chaseSpeed: 1.15,
      detect: 170,        // 发现玩家的水平距离
      jumpVel: -6.2,      // 追击时的小跳
      gold: 1,
      color: '#5ee06a',
      color2: '#2f8b3c',
      eye: '#0d2010'
    },
    archer: {
      key: 'archer',
      name: '骨弓手',
      w: 14, h: 20,
      hp: 6,
      damage: 1,
      speed: 0.45,
      detect: 260,
      keepDist: 120,      // 保持的射击距离
      shootCd: 96,        // 射击间隔（帧）
      windup: 22,         // 抬手预警帧
      projSpeed: 2.5,
      projDmg: 1,
      gold: 2,
      color: '#e0a33a',
      color2: '#7a4f16',
      eye: '#2a1606'
    },
    bat: {
      key: 'bat',
      name: '幽翼蝠',
      w: 12, h: 10,
      hp: 5,
      damage: 1,
      speed: 0.9,
      chaseSpeed: 1.65,
      detect: 220,
      hoverAmp: 10,       // 上下摆动幅度
      gold: 1,
      color: '#b06ce0',
      color2: '#5a2e80',
      eye: '#1a0a26'
    },
    boss: {
      key: 'boss',
      name: '裂隙守卫',
      w: 34, h: 40,
      hp: 70,
      damage: 2,
      speed: 0.8,
      chaseSpeed: 1.25,
      detect: 9999,
      chargeSpeed: 3.3,
      gold: 30,
      color: '#e04a4a',
      color2: '#6b1414',
      eye: '#2a0606',
      isBoss: true
    }
  };

  /* ------------------------------ 道具配置 ------------------------------ */
  var ITEMS = [
    {
      id: 'atk_up',
      name: '锋利之爪',
      rarity: 'common',
      effect: 'damage',
      value: 1,
      maxStacks: 4,
      color: '#ff6b6b',
      icon: 'claw',
      desc: '攻击力 +1'
    },
    {
      id: 'atk_speed',
      name: '疾风符文',
      rarity: 'common',
      effect: 'attackRate',
      value: 2,
      maxStacks: 4,
      color: '#7fd8ff',
      icon: 'bolt',
      desc: '攻击间隔 -2 帧'
    },
    {
      id: 'dash_cd',
      name: '轻身之靴',
      rarity: 'rare',
      effect: 'dashCooldown',
      value: 7,
      maxStacks: 3,
      color: '#9dff8a',
      icon: 'boot',
      desc: '冲刺冷却 -7 帧'
    },
    {
      id: 'lifesteal',
      name: '吸血獠牙',
      rarity: 'rare',
      effect: 'lifesteal',
      value: 1,
      maxStacks: 2,
      color: '#ff8ad4',
      icon: 'fang',
      desc: '击杀回复 1 点生命'
    },
    {
      id: 'crit',
      name: '幸运残币',
      rarity: 'rare',
      effect: 'crit',
      value: 0.08,
      maxStacks: 4,
      color: '#ffd166',
      icon: 'coin',
      desc: '暴击率 +8%'
    },
    {
      id: 'max_hp',
      name: '生命结晶',
      rarity: 'epic',
      effect: 'maxHp',
      value: 2,
      maxStacks: 3,
      color: '#ff4d6d',
      icon: 'heart',
      desc: '最大生命 +2 并回满 2 点'
    }
  ];

  var RARITY = {
    common: { name: '普通', color: '#9fb4d8', weight: 60 },
    rare: { name: '稀有', color: '#6ee0ff', weight: 30 },
    epic: { name: '史诗', color: '#ffb347', weight: 10 }
  };

  /* ------------------------------ 房间池 ------------------------------ *
   * 坐标单位为像素；(x,y) 为平台左上角，w/h 为宽高。
   * 敌人 spawn 的 y 表示"脚底"所在高度（站在平台上时 = 平台 y）。
   * 地面 y = GROUND_Y 由系统统一添加。
   * -------------------------------------------------------------------- */
  var ROOM_POOL = [
    {
      id: 'battle_ruin',
      type: 'battle',
      name: '断壁回廊',
      platforms: [
        { x: 96, y: 190, w: 112, h: 10 },
        { x: 288, y: 158, w: 96, h: 10 },
        { x: 512, y: 190, w: 128, h: 10 },
        { x: 720, y: 150, w: 112, h: 10 }
      ],
      spawns: [
        { type: 'slime', x: 250, y: 238 },
        { type: 'archer', x: 330, y: 158 },
        { type: 'bat', x: 620, y: 150 }
      ]
    },
    {
      id: 'battle_stairs',
      type: 'battle',
      name: '碎裂阶梯',
      platforms: [
        { x: 160, y: 206, w: 96, h: 32 },
        { x: 256, y: 174, w: 80, h: 64 },
        { x: 336, y: 142, w: 80, h: 96 },
        { x: 560, y: 190, w: 96, h: 10 },
        { x: 712, y: 154, w: 96, h: 10 }
      ],
      spawns: [
        { type: 'archer', x: 376, y: 142 },
        { type: 'slime', x: 620, y: 238 },
        { type: 'slime', x: 850, y: 238 }
      ]
    },
    {
      id: 'battle_bridge',
      type: 'battle',
      name: '浮石悬桥',
      platforms: [
        { x: 128, y: 200, w: 64, h: 10 },
        { x: 240, y: 168, w: 64, h: 10 },
        { x: 352, y: 200, w: 64, h: 10 },
        { x: 464, y: 168, w: 64, h: 10 },
        { x: 576, y: 200, w: 64, h: 10 },
        { x: 688, y: 168, w: 64, h: 10 },
        { x: 800, y: 200, w: 64, h: 10 }
      ],
      spawns: [
        { type: 'bat', x: 300, y: 130 },
        { type: 'bat', x: 520, y: 140 },
        { type: 'slime', x: 740, y: 238 }
      ]
    },
    {
      id: 'battle_tower',
      type: 'battle',
      name: '双子高台',
      platforms: [
        { x: 220, y: 190, w: 48, h: 48 },
        { x: 220, y: 120, w: 80, h: 10 },
        { x: 640, y: 190, w: 48, h: 48 },
        { x: 620, y: 120, w: 80, h: 10 }
      ],
      spawns: [
        { type: 'bat', x: 480, y: 110 },
        { type: 'slime', x: 480, y: 238 },
        { type: 'archer', x: 660, y: 120 }
      ]
    },
    {
      id: 'battle_hall',
      type: 'battle',
      name: '长厅',
      platforms: [
        { x: 180, y: 200, w: 96, h: 10 },
        { x: 380, y: 168, w: 96, h: 10 },
        { x: 580, y: 200, w: 96, h: 10 },
        { x: 780, y: 168, w: 96, h: 10 }
      ],
      spawns: [
        { type: 'slime', x: 260, y: 238 },
        { type: 'slime', x: 500, y: 238 },
        { type: 'archer', x: 828, y: 168 },
        { type: 'bat', x: 700, y: 140 }
      ]
    },
    {
      id: 'battle_wreck',
      type: 'battle',
      name: '倾塌之厅',
      platforms: [
        { x: 120, y: 196, w: 64, h: 10 },
        { x: 320, y: 196, w: 64, h: 10 },
        { x: 520, y: 196, w: 64, h: 10 },
        { x: 720, y: 196, w: 64, h: 10 },
        { x: 240, y: 130, w: 64, h: 10 },
        { x: 640, y: 130, w: 64, h: 10 }
      ],
      spawns: [
        { type: 'archer', x: 352, y: 196 },
        { type: 'bat', x: 560, y: 100 },
        { type: 'slime', x: 800, y: 238 }
      ]
    },
    {
      id: 'battle_pillar',
      type: 'battle',
      name: '石柱回廊',
      platforms: [
        { x: 160, y: 170, w: 40, h: 68 },
        { x: 760, y: 170, w: 40, h: 68 },
        { x: 320, y: 160, w: 96, h: 10 },
        { x: 560, y: 160, w: 96, h: 10 }
      ],
      spawns: [
        { type: 'slime', x: 420, y: 238 },
        { type: 'slime', x: 520, y: 238 },
        { type: 'archer', x: 880, y: 238 }
      ]
    },
    {
      id: 'battle_arena',
      type: 'battle',
      name: '血战之厅',
      platforms: [
        { x: 60, y: 196, w: 80, h: 10 },
        { x: 240, y: 150, w: 80, h: 10 },
        { x: 400, y: 196, w: 80, h: 10 },
        { x: 560, y: 150, w: 80, h: 10 },
        { x: 720, y: 196, w: 80, h: 10 },
        { x: 860, y: 150, w: 80, h: 10 }
      ],
      spawns: [
        { type: 'slime', x: 320, y: 238 },
        { type: 'slime', x: 640, y: 238 },
        { type: 'bat', x: 480, y: 120 },
        { type: 'archer', x: 900, y: 150 }
      ]
    },
    {
      id: 'treasure_a',
      type: 'treasure',
      name: '遗物室',
      platforms: [
        { x: 240, y: 196, w: 96, h: 10 },
        { x: 384, y: 160, w: 96, h: 10 },
        { x: 528, y: 124, w: 96, h: 10 }
      ],
      spawns: [],
      pedestals: true
    },
    {
      id: 'treasure_b',
      type: 'treasure',
      name: '尘封宝库',
      platforms: [
        { x: 300, y: 200, w: 96, h: 10 },
        { x: 444, y: 164, w: 96, h: 10 },
        { x: 588, y: 128, w: 96, h: 10 }
      ],
      spawns: [],
      pedestals: true
    },
    {
      id: 'rest_a',
      type: 'rest',
      name: '篝火休息处',
      platforms: [
        { x: 380, y: 190, w: 200, h: 10 }
      ],
      spawns: [],
      shrine: true
    },
    {
      id: 'rest_b',
      type: 'rest',
      name: '静默神龛',
      platforms: [
        { x: 340, y: 196, w: 280, h: 10 }
      ],
      spawns: [],
      shrine: true
    },
    {
      id: 'boss_lair',
      type: 'boss',
      name: '裂隙深处',
      platforms: [
        { x: 120, y: 190, w: 96, h: 10 },
        { x: 744, y: 190, w: 96, h: 10 },
        { x: 430, y: 140, w: 100, h: 10 }
      ],
      spawns: [
        { type: 'boss', x: 720, y: 238 }
      ]
    }
  ];

  /* --------------------------- 单局关卡生成 --------------------------- */
  function pickRoomDef(type, usedIds) {
    var pool = [];
    for (var i = 0; i < ROOM_POOL.length; i++) {
      var d = ROOM_POOL[i];
      if (d.type !== type) continue;
      if (usedIds[d.id]) continue;
      pool.push(d);
    }
    if (pool.length === 0) {
      // 全部用过了就允许重复
      for (var j = 0; j < ROOM_POOL.length; j++) {
        if (ROOM_POOL[j].type === type) pool.push(ROOM_POOL[j]);
      }
    }
    return U.choice(pool);
  }

  // 生成一局的房间序列：battle × N + 至少 1 个 treasure + 1 个 rest + boss 收尾
  function buildRun() {
    var count = U.randInt(5, 8);
    var middle = count - 2;               // 去掉首战与 Boss
    var slots = ['battle'];
    var types = [];
    var i;
    for (i = 0; i < middle; i++) types.push('battle');

    if (middle >= 2) {
      var idx = [];
      for (i = 0; i < middle; i++) idx.push(i);
      U.shuffle(idx);
      types[idx[0]] = 'treasure';
      types[idx[1]] = 'rest';
      // 再随机塞一个宝箱房（30%），让中段更丰富
      if (middle >= 3 && U.chance(0.3)) {
        types[idx[2]] = 'treasure';
      }
    } else if (middle === 1) {
      types[0] = U.chance(0.5) ? 'treasure' : 'rest';
    }
    for (i = 0; i < middle; i++) slots.push(types[i]);
    slots.push('boss');

    var used = {};
    var run = [];
    for (i = 0; i < slots.length; i++) {
      var def = pickRoomDef(slots[i], used);
      used[def.id] = true;
      run.push({
        def: def,
        type: slots[i],
        index: i,
        difficulty: i,
        name: def.name
      });
    }
    return run;
  }

  // 按房间序号刷新敌人属性
  function scaleEnemy(base, depth) {
    var hp = Math.round(base.hp * (1 + TUNING.hpScalePerRoom * depth));
    var dmg = base.damage + (depth >= 4 ? 1 : 0);
    return { hp: hp, damage: dmg };
  }

  global.GameData = {
    VERSION: '1.0.0',
    SAVE_KEY: 'pixelRift.save.v1',
    VIEW_W: VIEW_W,
    VIEW_H: VIEW_H,
    ROOM_W: ROOM_W,
    GROUND_Y: GROUND_Y,
    TILE: TILE,
    TUNING: TUNING,
    ENEMY_TYPES: ENEMY_TYPES,
    ITEMS: ITEMS,
    RARITY: RARITY,
    ROOM_POOL: ROOM_POOL,
    buildRun: buildRun,
    scaleEnemy: scaleEnemy
  };

  global.Util = U;
})(window);
