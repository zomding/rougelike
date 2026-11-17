/* =========================================================================
 * item.js —— 道具系统：抽取、生效、叠加上限、像素图标绘制
 * 道具效果全部作用在 player.stats 上；UI 只需要读 player.items 画图标。
 * ========================================================================= */
(function (global) {
  'use strict';

  var G = global.GameData;
  var U = global.Util;

  var byId = {};
  (function () {
    for (var i = 0; i < G.ITEMS.length; i++) byId[G.ITEMS[i].id] = G.ITEMS[i];
  })();

  function get(id) { return byId[id] || null; }

  function rollRarity(depth) {
    var d = depth || 0;
    var common = G.RARITY.common.weight;
    var rare = G.RARITY.rare.weight;
    var epic = G.RARITY.epic.weight + d * 1.8;
    var total = common + rare + epic;
    var r = Math.random() * total;
    if (r < epic) return 'epic';
    if (r < epic + rare) return 'rare';
    return 'common';
  }

  // 抽取一个道具（depth 越深，稀有道具概率越高）
  function rollDrop(depth) {
    var rarity = rollRarity(depth);
    var pool = [];
    var fallback = [];
    for (var i = 0; i < G.ITEMS.length; i++) {
      fallback.push(G.ITEMS[i]);
      if (G.ITEMS[i].rarity === rarity) pool.push(G.ITEMS[i]);
    }
    if (pool.length === 0) pool = fallback;
    return U.choice(pool);
  }

  // 抽 3 个互不相同的道具（宝箱房三选一）
  function rollChoices(depth, n) {
    var out = [];
    var guard = 0;
    while (out.length < n && guard < 60) {
      guard++;
      var it = rollDrop(depth);
      var dup = false;
      for (var i = 0; i < out.length; i++) {
        if (out[i].id === it.id) { dup = true; break; }
      }
      if (!dup) out.push(it);
    }
    while (out.length < n) out.push(G.ITEMS[out.length % G.ITEMS.length]);
    return out;
  }

  function stackOf(player, itemId) {
    for (var i = 0; i < player.items.length; i++) {
      if (player.items[i].item.id === itemId) return player.items[i].stacks;
    }
    return 0;
  }

  /**
   * 应用一个道具。返回 true = 已生效，false = 已满层（转化为金币）。
   */
  function apply(player, item, world) {
    if (!item) return false;

    var entry = null;
    for (var i = 0; i < player.items.length; i++) {
      if (player.items[i].item.id === item.id) { entry = player.items[i]; break; }
    }

    if (entry && entry.stacks >= item.maxStacks) {
      // 满层：折算金币
      if (world) {
        world.gold += 12;
        world.floaters.push({
          x: player.x + player.w / 2, y: player.y - 6,
          text: '+12', color: '#ffd166', life: 45, vy: -0.55, size: 8
        });
      }
      return false;
    }

    if (entry) {
      entry.stacks++;
    } else {
      entry = { item: item, stacks: 1 };
      player.items.push(entry);
    }

    var st = player.stats;
    switch (item.effect) {
      case 'damage':
        st.damage += item.value;
        break;
      case 'attackRate':
        st.attackCd = Math.max(9, st.attackCd - item.value);
        break;
      case 'dashCooldown':
        st.dashCd = Math.max(18, st.dashCd - item.value);
        break;
      case 'lifesteal':
        st.lifesteal += item.value;
        break;
      case 'crit':
        st.crit = Math.min(0.85, st.crit + item.value);
        break;
      case 'maxHp':
        player.maxHp += item.value;
        st.maxHp = player.maxHp;
        player.hp = Math.min(player.maxHp, player.hp + item.value);
        break;
      default:
        break;
    }

    if (world) {
      world.floaters.push({
        x: player.x + player.w / 2, y: player.y - 8,
        text: item.name, color: item.color, life: 60, vy: -0.45, size: 9
      });
      world.emitParticles(player.x + player.w / 2, player.y + 6, item.color, 10);
    }
    if (global.SFX) global.SFX.play('pickup');
    return true;
  }

  /* ------------------------------ 图标绘制 ------------------------------ */
  function drawIcon(ctx, x, y, size, item, time) {
    if (!item) return;
    var u = Math.max(1, Math.round(size / 12));
    var c = item.color;
    var px = Math.round(x);
    var py = Math.round(y);
    var i;
    // 底板
    ctx.fillStyle = 'rgba(10,8,20,0.85)';
    ctx.fillRect(px, py, size, size);
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    ctx.globalAlpha = 1;

    var ox = px + Math.floor((size - 12 * u) / 2);
    var oy = py + Math.floor((size - 12 * u) / 2);

    switch (item.icon) {
      case 'claw':
        ctx.fillStyle = c;
        ctx.fillRect(ox + 2 * u, oy + 8 * u, 7 * u, 2 * u);
        ctx.fillRect(ox + 3 * u, oy + 5 * u, 6 * u, 2 * u);
        ctx.fillRect(ox + 5 * u, oy + 2 * u, 5 * u, 2 * u);
        break;
      case 'bolt':
        ctx.fillStyle = c;
        ctx.fillRect(ox + 6 * u, oy + 1 * u, 3 * u, 3 * u);
        ctx.fillRect(ox + 4 * u, oy + 4 * u, 3 * u, 3 * u);
        ctx.fillRect(ox + 2 * u, oy + 7 * u, 4 * u, 3 * u);
        ctx.fillRect(ox + 3 * u, oy + 10 * u, 3 * u, 1 * u);
        break;
      case 'boot':
        ctx.fillStyle = c;
        ctx.fillRect(ox + 3 * u, oy + 2 * u, 4 * u, 7 * u);
        ctx.fillRect(ox + 3 * u, oy + 8 * u, 8 * u, 2 * u);
        break;
      case 'fang':
        ctx.fillStyle = c;
        ctx.fillRect(ox + 4 * u, oy + 1 * u, 2 * u, 8 * u);
        ctx.fillRect(ox + 6 * u, oy + 5 * u, 2 * u, 5 * u);
        ctx.fillRect(ox + 8 * u, oy + 8 * u, 2 * u, 3 * u);
        break;
      case 'coin':
        ctx.fillStyle = c;
        ctx.fillRect(ox + 2 * u, oy + 3 * u, 8 * u, 6 * u);
        ctx.fillRect(ox + 3 * u, oy + 2 * u, 6 * u, 8 * u);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(ox + 4 * u, oy + 5 * u, 4 * u, 2 * u);
        break;
      case 'heart':
        ctx.fillStyle = c;
        ctx.fillRect(ox + 2 * u, oy + 2 * u, 8 * u, 3 * u);
        ctx.fillRect(ox + 3 * u, oy + 5 * u, 6 * u, 2 * u);
        ctx.fillRect(ox + 4 * u, oy + 7 * u, 4 * u, 2 * u);
        ctx.fillRect(ox + 5 * u, oy + 9 * u, 2 * u, 1 * u);
        break;
      default:
        ctx.fillRect(ox + 3 * u, oy + 3 * u, 6 * u, 6 * u);
        break;
    }

    // 稀有度角标
    var rc = G.RARITY[item.rarity] ? G.RARITY[item.rarity].color : '#ffffff';
    ctx.fillStyle = rc;
    ctx.fillRect(px, py, size, 1);
    ctx.fillRect(px, py, 1, size);
  }

  global.Items = {
    all: G.ITEMS,
    get: get,
    rollDrop: rollDrop,
    rollChoices: rollChoices,
    apply: apply,
    stackOf: stackOf,
    drawIcon: drawIcon
  };
})(window);
