/* =========================================================================
 * ui.js —— 全部界面：开始菜单 / 游戏内 HUD / 暂停 / 死亡 / 通关 / 房间横幅
 *
 * 视觉方案：
 *  · 自带 5x7 像素点阵字模（数字 / 英文 / 符号）→ 真正锐利的像素字，
 *    不再依赖系统等宽字体，避免 Courier New 与中文混排难看。
 *  · 中文用系统黑体粗体 + 1px 硬阴影，字号放大到 9~22px 保证可读。
 *  · 统一配色 + 三层面板（外描边 / 内高光 / 左侧强调条）+ 角铁装饰。
 *  · 按钮有 hover / 按下 / 惯性位移，键位说明用键帽框绘制。
 * ========================================================================= */
(function (global) {
  'use strict';

  var G = global.GameData;

  /* ------------------------------ 配色 ------------------------------ */
  var C = {
    ink: '#06050c',
    bgTop: '#07060f',
    bgMid: '#181033',
    bgHorizon: '#33204a',
    panelTop: '#1c1543',
    panelBot: '#120d2b',
    panelHead: '#2a1f5c',
    edge: '#4b3d86',
    edgeHi: '#9a86ff',
    cyan: '#5fe3ff',
    cyanDim: '#2a6f88',
    amber: '#ffc857',
    amberDim: '#6d4f18',
    green: '#8ef58a',
    red: '#ff5566',
    purple: '#b48cff',
    text: '#f2eeff',
    dim: '#9a92c4',
    dim2: '#6b6591'
  };

  /* ------------------------------ 5x7 点阵字模 ------------------------------ */
  /* 每个字符 7 行，每行 5 bit（0x1F 为满行），写成 14 位十六进制 */
  var FONT = {
    '0': '0E11131519110E', '1': '040C040404040E', '2': '0E11010204081F',
    '3': '1F02040201110E', '4': '02060A121F0202', '5': '1F101E0101110E',
    '6': '0608101E11110E', '7': '1F010204080808', '8': '0E11110E11110E',
    '9': '0E11110F01020C',
    'A': '0E11111F111111', 'B': '1E11111E11111E', 'C': '0E11101010110E',
    'D': '1E11111111111E', 'E': '1F10101E10101F', 'F': '1F10101E101010',
    'G': '0E11101711110F', 'H': '1111111F111111', 'I': '0E04040404040E',
    'J': '0702020202120C', 'K': '11121418141211', 'L': '1010101010101F',
    'M': '111B1515111111', 'N': '11191513111111', 'O': '0E11111111110E',
    'P': '1E11111E101010', 'Q': '0E11111115120D', 'R': '1E11111E141211',
    'S': '0F10100E01011E', 'T': '1F040404040404', 'U': '1111111111110E',
    'V': '11111111110A04', 'W': '11111115151B11', 'X': '11110A040A1111',
    'Y': '11110A04040404', 'Z': '1F01020408101F',
    ' ': '00000000000000', ':': '00040400040400', '.': '00000000000404',
    '/': '01020204080810', '-': '0000001F000000', '+': '0004041F040400',
    '%': '191A0204080B13', 'x': '0000110A040A11', '!': '04040404040004',
    '?': '0E110102040004', '(': '02040808080402', ')': '08040202020408',
    '>': '10080402040810', '<': '01020408040201', '#': '0A0A1F0A1F0A0A',
    '*': '000A041F040A00', ',': '0000000006060C', '=': '00001F001F0000',
    "'": '04040400000000', '"': '0A0A0A00000000'
  };

  function glyph(ch) {
    var g = FONT[ch];
    if (!g) g = FONT[ch.toUpperCase()];
    if (!g) g = FONT['?'];
    return g;
  }

  function ptextWidth(str, s) {
    if (!str.length) return 0;
    return str.length * (5 * s + s) - s;
  }

  function ptext(ctx, str, x, y, s, color, align, shadow) {
    str = String(str);
    var w = ptextWidth(str, s);
    var px = Math.round(x);
    if (align === 'center') px = Math.round(x - w / 2);
    else if (align === 'right') px = Math.round(x - w);
    var py = Math.round(y);

    if (shadow !== false) {
      ctx.fillStyle = typeof shadow === 'string' ? shadow : 'rgba(0,0,0,0.72)';
      drawGlyphs(ctx, str, px + Math.max(1, s), py + Math.max(1, s), s);
    }
    ctx.fillStyle = color;
    drawGlyphs(ctx, str, px, py, s);
    return w;
  }

  function drawGlyphs(ctx, str, x, y, s) {
    for (var i = 0; i < str.length; i++) {
      var hex = glyph(str[i]);
      var ox = x + i * (6 * s);
      for (var r = 0; r < 7; r++) {
        var bits = parseInt(hex.substr(r * 2, 2), 16);
        if (!bits) continue;
        for (var c = 0; c < 5; c++) {
          if (bits & (0x10 >> c)) {
            ctx.fillRect(ox + c * s, y + r * s, s, s);
          }
        }
      }
    }
  }

  /* ------------------------------ 中文文字 ------------------------------ */
  var CJK_STACK = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", ' +
    '"Noto Sans SC", "Source Han Sans SC", "SimHei", sans-serif';

  function cjkFont(ctx, size, bold) {
    ctx.font = (bold === false ? '' : 'bold ') + size + 'px ' + CJK_STACK;
  }

  function cjkWidth(ctx, str, size, spacing, bold) {
    cjkFont(ctx, size, bold);
    var w = 0;
    for (var i = 0; i < str.length; i++) {
      w += ctx.measureText(str[i]).width;
      if (i < str.length - 1) w += spacing || 0;
    }
    return w;
  }

  function cjk(ctx, str, x, y, size, color, align, spacing, shadowColor) {
    str = String(str);
    spacing = spacing || 0;
    cjkFont(ctx, size, true);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    var w = cjkWidth(ctx, str, size, spacing, true);
    var px = x;
    if (align === 'center') px = x - w / 2;
    else if (align === 'right') px = x - w;
    px = Math.round(px);
    y = Math.round(y);

    // 硬阴影（像素风用 1px 位移而非模糊）
    ctx.fillStyle = shadowColor || 'rgba(0,0,0,0.82)';
    var i, cx = px;
    for (i = 0; i < str.length; i++) {
      ctx.fillText(str[i], cx + 1, y + 1);
      cx += ctx.measureText(str[i]).width + spacing;
    }
    ctx.fillStyle = color;
    cx = px;
    for (i = 0; i < str.length; i++) {
      ctx.fillText(str[i], cx, y);
      cx += ctx.measureText(str[i]).width + spacing;
    }
    return w;
  }

  /* ------------------------------ 图形构件 ------------------------------ */

  // 面板：外描边 + 双色底 + 顶高光 + 左侧强调条 + 角铁
  function plate(ctx, x, y, w, h, opts) {
    opts = opts || {};
    var accent = opts.accent || C.cyan;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w < 6 || h < 6) return;

    // 投影
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + 2, y + 3, w, h);

    // 外描边
    ctx.fillStyle = C.ink;
    ctx.fillRect(x, y, w, h);

    // 主体双色
    ctx.fillStyle = C.panelTop;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = C.panelBot;
    ctx.fillRect(x + 1, y + Math.floor(h * 0.45), w - 2, h - 1 - Math.floor(h * 0.45));

    // 内描边
    ctx.fillStyle = C.edge;
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
    ctx.fillRect(x + 1, y + 1, 1, h - 2);
    ctx.fillRect(x + w - 2, y + 1, 1, h - 2);

    // 顶部高光
    ctx.fillStyle = 'rgba(154,134,255,0.35)';
    ctx.fillRect(x + 2, y + 2, w - 4, 1);

    // 左侧强调条
    if (opts.accentBar !== false) {
      ctx.fillStyle = accent;
      ctx.fillRect(x + 1, y + 2, 2, h - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + 1, y + 2, 1, Math.floor((h - 4) * 0.4));
    }

    // 四角角铁
    if (opts.corners !== false) {
      ctx.fillStyle = accent;
      ctx.fillRect(x, y, 4, 1);
      ctx.fillRect(x, y, 1, 4);
      ctx.fillRect(x + w - 4, y, 4, 1);
      ctx.fillRect(x + w - 1, y, 1, 4);
      ctx.fillRect(x, y + h - 1, 4, 1);
      ctx.fillRect(x, y + h - 4, 1, 4);
      ctx.fillRect(x + w - 4, y + h - 1, 4, 1);
      ctx.fillRect(x + w - 1, y + h - 4, 1, 4);
    }
  }

  // 带标题条的面板
  function panelBox(ctx, x, y, w, h, title, opts) {
    plate(ctx, x, y, w, h, opts);
    if (!title) return;
    ctx.fillStyle = C.panelHead;
    ctx.fillRect(x + 2, y + 2, w - 4, 14);
    ctx.fillStyle = (opts && opts.accent) || C.cyan;
    ctx.fillRect(x + 2, y + 2, w - 4, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 2, y + 16, w - 4, 1);
    cjk(ctx, title, x + w / 2, y + 4, 9, C.text, 'center', 2);
  }

  function hr(ctx, x, y, w, color) {
    ctx.fillStyle = color || 'rgba(154,134,255,0.28)';
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 1);
  }

  /* ------------------------------ 按钮 ------------------------------ */
  var buttons = [];

  function mouseIn(b) {
    var m = global.Input.mouse;
    return m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h;
  }

  function button(ctx, x, y, w, h, label, id, opts) {
    opts = opts || {};
    var b = { x: x, y: y, w: w, h: h, id: id, label: label };
    var hover = mouseIn(b);
    var down = hover && global.Input.mouse.down;
    var accent = opts.accent || C.cyan;
    var oy = down ? 1 : 0;

    // 投影 / 底
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x + 1, y + 2, w, h);

    ctx.fillStyle = C.ink;
    ctx.fillRect(x, y + oy, w, h);

    var top = opts.primary
      ? (hover ? '#4a2f9c' : '#38227a')
      : (hover ? '#2b2258' : '#1d1740');
    var bot = opts.primary
      ? (hover ? '#2a1a5e' : '#221452')
      : (hover ? '#1a1440' : '#141031');

    ctx.fillStyle = top;
    ctx.fillRect(x + 1, y + 1 + oy, w - 2, Math.floor(h / 2));
    ctx.fillStyle = bot;
    ctx.fillRect(x + 1, y + 1 + oy + Math.floor(h / 2), w - 2, h - 2 - Math.floor(h / 2));

    // 顶部高光线
    ctx.fillStyle = hover ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.22)';
    ctx.fillRect(x + 2, y + 2 + oy, w - 4, 1);

    // 边框
    ctx.fillStyle = hover ? C.edgeHi : accent;
    ctx.fillRect(x, y + oy, w, 1);
    ctx.fillRect(x, y + h - 1 + oy, w, 1);
    ctx.fillRect(x, y + oy, 1, h);
    ctx.fillRect(x + w - 1, y + oy, 1, h);

    // 提示键帽（右侧，独立小方块，不与标题挤在一起）
    var kw = opts.hint ? ptextWidth(opts.hint, 1) + 8 : 0;

    var labelColor = hover ? '#ffffff' : (opts.primary ? C.text : C.dim);
    var labelCx = opts.hint ? x + Math.floor((w - kw) / 2) : x + w / 2;
    cjk(ctx, label, labelCx, y + Math.floor((h - 11) / 2) + 1 + oy, 11, labelColor, 'center', 2);

    if (hover) {
      var blink = 0.55 + 0.45 * Math.sin(Date.now() / 160);
      ctx.globalAlpha = blink;
      ctx.fillStyle = C.amber;
      var ay2 = y + Math.floor(h / 2) + oy - 1;
      ctx.fillRect(x + 5, ay2, 3, 3);
      ctx.fillRect(x + w - (kw ? kw + 13 : 8), ay2, 3, 3);
      ctx.globalAlpha = 1;
    }

    if (opts.hint) {
      var kh = 11;
      var kx = x + w - kw - 4;
      var ky = y + Math.floor((h - kh) / 2) + oy;
      ctx.fillStyle = 'rgba(5,4,12,0.92)';
      ctx.fillRect(kx, ky, kw, kh);
      ctx.fillStyle = hover ? C.amber : 'rgba(154,134,255,0.40)';
      ctx.fillRect(kx, ky, kw, 1);
      ctx.fillRect(kx, ky + kh - 1, kw, 1);
      ctx.fillRect(kx, ky, 1, kh);
      ctx.fillRect(kx + kw - 1, ky, 1, kh);
      ptext(ctx, opts.hint, kx + Math.floor(kw / 2), ky + 3, 1, hover ? C.amber : C.dim, 'center', false);
    }

    buttons.push(b);
    return b;
  }

  // 方形图标按钮
  function iconButton(ctx, x, y, w, h, id, drawFn) {
    var b = { x: x, y: y, w: w, h: h, id: id };
    var hover = mouseIn(b);
    var down = hover && global.Input.mouse.down;
    var oy = down ? 1 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x + 1, y + 2, w, h);
    ctx.fillStyle = C.ink;
    ctx.fillRect(x, y + oy, w, h);
    ctx.fillStyle = hover ? '#2b2258' : '#1b1540';
    ctx.fillRect(x + 1, y + 1 + oy, w - 2, h - 2);
    ctx.fillStyle = hover ? C.edgeHi : C.edge;
    ctx.fillRect(x, y + oy, w, 1);
    ctx.fillRect(x, y + h - 1 + oy, w, 1);
    ctx.fillRect(x, y + oy, 1, h);
    ctx.fillRect(x + w - 1, y + oy, 1, h);
    drawFn(ctx, x + Math.floor(w / 2), y + Math.floor(h / 2) + oy, hover);
    buttons.push(b);
  }

  function takeClick() {
    var m = global.Input.mouse;
    if (!m.clicked) return null;
    for (var i = buttons.length - 1; i >= 0; i--) {
      if (mouseIn(buttons[i])) return buttons[i].id;
    }
    return null;
  }

  /* ------------------------------ 图标 ------------------------------ */
  function iconHeart(ctx, x, y, u, filled) {
    var body = filled ? '#ff3f63' : '#3a1f33';
    var hi = filled ? '#ff9db0' : '#4d2b42';
    ctx.fillStyle = body;
    ctx.fillRect(x + u, y, 2 * u, u);
    ctx.fillRect(x + 4 * u, y, 2 * u, u);
    ctx.fillRect(x, y + u, 7 * u, 2 * u);
    ctx.fillRect(x + u, y + 3 * u, 5 * u, u);
    ctx.fillRect(x + 2 * u, y + 4 * u, 3 * u, u);
    ctx.fillStyle = hi;
    if (filled) {
      ctx.fillRect(x + u, y + u, u, u);
      ctx.fillRect(x + 2 * u, y + u, u, u);
    } else {
      ctx.fillRect(x + u, y + u, u, u);
    }
  }

  function iconCoin(ctx, x, y, u) {
    ctx.fillStyle = '#8a6417';
    ctx.fillRect(x, y, 6 * u, 7 * u);
    ctx.fillStyle = '#ffc857';
    ctx.fillRect(x + u, y, 4 * u, 7 * u);
    ctx.fillRect(x, y + u, 6 * u, 5 * u);
    ctx.fillStyle = '#fff0bb';
    ctx.fillRect(x + 2 * u, y + u, u, u);
    ctx.fillRect(x + 3 * u, y + 2 * u, u, 2 * u);
    ctx.fillStyle = '#8a6417';
    ctx.fillRect(x + 2 * u, y + 4 * u, 2 * u, u);
  }

  function iconClock(ctx, x, y, u) {
    ctx.fillStyle = '#7d76a8';
    ctx.fillRect(x + 2 * u, y, 3 * u, u);
    ctx.fillRect(x, y + 2 * u, 7 * u, 3 * u);
    ctx.fillRect(x + 2 * u, y + 5 * u, 3 * u, u);
    ctx.fillStyle = '#c9c3ee';
    ctx.fillRect(x + 3 * u, y + 2 * u, u, 2 * u);
    ctx.fillRect(x + 3 * u, y + 4 * u, 2 * u, u);
  }

  function iconSword(ctx, x, y, u) {
    ctx.fillStyle = '#cfd8ff';
    for (var i = 0; i < 4; i++) ctx.fillRect(x + (4 - i) * u, y + i * u, u, u * 2);
    ctx.fillStyle = '#8a7fb8';
    ctx.fillRect(x + 3 * u, y + 4 * u, u, u);
    ctx.fillRect(x + 2 * u, y + 5 * u, 3 * u, u);
    ctx.fillStyle = '#c08a3a';
    ctx.fillRect(x + u, y + 5 * u, 2 * u, u);
  }

  function iconSkull(ctx, x, y, u) {
    ctx.fillStyle = '#e8e4f6';
    ctx.fillRect(x + u, y, 5 * u, u);
    ctx.fillRect(x, y + u, 7 * u, 4 * u);
    ctx.fillRect(x + u, y + 5 * u, 5 * u, u);
    ctx.fillStyle = '#1a1030';
    ctx.fillRect(x + u, y + 2 * u, 2 * u, 2 * u);
    ctx.fillRect(x + 4 * u, y + 2 * u, 2 * u, 2 * u);
    ctx.fillRect(x + 3 * u, y + 4 * u, u, u);
  }

  function iconChest(ctx, x, y, u) {
    ctx.fillStyle = '#b07a2c';
    ctx.fillRect(x, y + 2 * u, 8 * u, 5 * u);
    ctx.fillStyle = '#e0a33a';
    ctx.fillRect(x + u, y + 3 * u, 6 * u, 3 * u);
    ctx.fillStyle = '#7a4f18';
    ctx.fillRect(x, y + 2 * u, 8 * u, u);
    ctx.fillRect(x + 3 * u, y + 4 * u, 2 * u, 2 * u);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x + 3 * u, y + 5 * u, 2 * u, u);
  }

  function iconFlame(ctx, x, y, u) {
    ctx.fillStyle = '#ff8a3d';
    ctx.fillRect(x + 2 * u, y + 2 * u, 3 * u, u);
    ctx.fillRect(x + u, y + 3 * u, 5 * u, 3 * u);
    ctx.fillRect(x + 2 * u, y + 6 * u, 3 * u, u);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x + 3 * u, y + 4 * u, u, 2 * u);
  }

  function iconBoot(ctx, x, y, u) {
    ctx.fillStyle = '#8ef58a';
    ctx.fillRect(x + u, y, 2 * u, 4 * u);
    ctx.fillRect(x, y + 4 * u, 6 * u, 2 * u);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(x + 4 * u, y + 3 * u, 2 * u, u);
  }

  function iconSound(ctx, cx, cy, muted) {
    ctx.fillStyle = muted ? '#6b6591' : '#c9c3ee';
    ctx.fillRect(cx - 4, cy - 2, 2, 5);
    ctx.fillRect(cx - 2, cy - 3, 2, 7);
    if (muted) {
      ctx.fillStyle = C.red;
      ctx.fillRect(cx + 2, cy - 3, 2, 1);
      ctx.fillRect(cx + 3, cy - 2, 1, 1);
      ctx.fillRect(cx + 4, cy - 1, 1, 2);
      ctx.fillRect(cx + 3, cy + 1, 1, 1);
      ctx.fillRect(cx + 2, cy + 2, 2, 1);
    } else {
      ctx.fillStyle = C.cyan;
      ctx.fillRect(cx + 1, cy - 3, 1, 1);
      ctx.fillRect(cx + 2, cy - 1, 1, 3);
      ctx.fillRect(cx + 1, cy + 2, 1, 1);
    }
  }

  /* ------------------------------ 键帽 ------------------------------ */
  function keycap(ctx, x, y, label) {
    var isAscii = /^[\x20-\x7E]+$/.test(label);
    var lw = isAscii ? ptextWidth(label, 1) : cjkWidth(ctx, label, 8, 0, true);
    var w = Math.round(lw + 8);
    var h = 11;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x + 1, y + 2, w, h);
    ctx.fillStyle = '#2a2358';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillStyle = C.edge;
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x + w - 1, y, 1, h);
    if (isAscii) {
      ptext(ctx, label, x + w / 2, y + 2, 1, C.text, 'center', false);
    } else {
      cjk(ctx, label, x + w / 2, y + 1, 8, C.text, 'center', 0);
    }
    return w;
  }

  // 键帽 + 说明文字，返回总宽度
  function legend(ctx, x, y, keyLabel, desc) {
    var kw = keycap(ctx, x, y, keyLabel);
    cjk(ctx, desc, x + kw + 4, y + 1, 9, C.dim, 'left', 0);
    return kw + 4 + cjkWidth(ctx, desc, 9, 0, true);
  }

  /* ------------------------------ 背景 ------------------------------ */
  function seeded(n) {
    var v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  }

  function menuBackground(ctx, time) {
    // 天空渐变
    var sky = ctx.createLinearGradient(0, 0, 0, G.VIEW_H);
    sky.addColorStop(0, C.bgTop);
    sky.addColorStop(0.5, C.bgMid);
    sky.addColorStop(0.82, C.bgHorizon);
    sky.addColorStop(1, '#120c22');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);

    // 星点
    var i;
    for (i = 0; i < 70; i++) {
      var sx = Math.floor(seeded(i * 3.1) * G.VIEW_W);
      var sy = Math.floor(seeded(i * 7.7) * 150);
      var tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 0.03 + i));
      ctx.fillStyle = 'rgba(210,220,255,' + (tw * 0.8).toFixed(2) + ')';
      var big = seeded(i * 11.3) > 0.85;
      ctx.fillRect(sx, sy, 1, big ? 2 : 1);
    }

    // 天空裂隙（主题元素）：一道发光裂痕 + 外溢出光
    var rx = 400;
    var flow = Math.sin(time * 0.02) * 1.2;
    for (i = 0; i < 13; i++) {
      var yy = 6 + i * 6;
      var off = Math.sin(i * 0.9 + time * 0.015) * 4 + flow;
      var wdt = (i % 3 === 0) ? 2 : 1;
      ctx.fillStyle = 'rgba(95,227,255,0.06)';
      ctx.fillRect(Math.round(rx + off - 3), yy, wdt + 6, 6);
      ctx.fillStyle = 'rgba(95,227,255,' + (0.14 + (i % 4) * 0.05).toFixed(2) + ')';
      ctx.fillRect(Math.round(rx + off - 1), yy, wdt + 2, 6);
      ctx.fillStyle = 'rgba(214,238,255,' + (0.28 + (i % 3) * 0.11).toFixed(2) + ')';
      ctx.fillRect(Math.round(rx + off), yy + 1, wdt, 4);
    }

    // 远山（三层视差）
    drawRidge(ctx, 118, '#161030', 0.0, 1.0);
    drawRidge(ctx, 146, '#1d1540', 0.35, 1.3);
    drawRidge(ctx, 172, '#251a4d', 0.7, 1.6);

    // 地面
    ctx.fillStyle = '#0d0920';
    ctx.fillRect(0, G.VIEW_H - 24, G.VIEW_W, 24);
    ctx.fillStyle = '#241a45';
    ctx.fillRect(0, G.VIEW_H - 24, G.VIEW_W, 2);
    ctx.fillStyle = 'rgba(154,134,255,0.22)';
    for (i = 0; i < 24; i++) {
      var gx = Math.floor(seeded(i * 5.3) * G.VIEW_W);
      ctx.fillRect(gx, G.VIEW_H - 22 + Math.floor(seeded(i * 2.2) * 3), 2, 1);
    }

    // 上升余烬
    for (i = 0; i < 26; i++) {
      var px = (seeded(i * 9.1) * G.VIEW_W + time * (0.25 + seeded(i) * 0.5)) % G.VIEW_W;
      var py = G.VIEW_H - ((seeded(i * 4.4) * 200 + time * (0.4 + seeded(i * 2) * 0.6)) % 210);
      var a = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(time * 0.05 + i));
      ctx.fillStyle = 'rgba(255,150,90,' + a.toFixed(2) + ')';
      ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
  }

  function drawRidge(ctx, baseY, color, parallax, freq) {
    ctx.fillStyle = color;
    var step = 8;
    for (var x = 0; x < G.VIEW_W; x += step) {
      var h = 16 + 22 * Math.abs(Math.sin((x * 0.021 * freq) + parallax * 3)) +
        9 * Math.abs(Math.sin(x * 0.047 * freq + 1.2));
      ctx.fillRect(x, G.VIEW_H - 24 - h, step, h + 24);
    }
  }

  function screenShade(ctx, alpha) {
    ctx.fillStyle = 'rgba(5,4,12,' + alpha + ')';
    ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
  }

  /* 暗角 + 扫描线：让整体更像 CRT 像素游戏 */
  function drawVignette(ctx) {
    var vg = ctx.createRadialGradient(
      G.VIEW_W / 2, G.VIEW_H / 2, 110,
      G.VIEW_W / 2, G.VIEW_H / 2, 320
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);

    ctx.fillStyle = 'rgba(0,0,0,0.055)';
    for (var y = 0; y < G.VIEW_H; y += 3) {
      ctx.fillRect(0, y, G.VIEW_W, 1);
    }
  }

  /* ------------------------------ 开始菜单 ------------------------------ */
  /* 触摸设备上，键位说明要换成"屏幕按钮"的说法 */
  function isTouchUI() {
    return !!(global.Touch && global.Touch.isTouch && global.Touch.isTouch());
  }

  function drawMenu(ctx, save, time) {
    buttons = [];
    menuBackground(ctx, time);
    drawVignette(ctx);

    var cx = G.VIEW_W / 2;
    var touchUI = isTouchUI();

    // 标题：像素点阵 + 红色错位投影
    var tw = ptextWidth('PIXEL RIFT', 3);
    var tx = cx - tw / 2;
    ptext(ctx, 'PIXEL RIFT', tx + 2, 20, 3, '#8c1b3a', 'left', false);
    ptext(ctx, 'PIXEL RIFT', tx, 18, 3, 'rgba(0,0,0,0.9)', 'left', false);
    ptext(ctx, 'PIXEL RIFT', tx, 18, 3, C.text, 'left', false);
    // 标题下的青色高光条
    ctx.fillStyle = 'rgba(95,227,255,0.5)';
    ctx.fillRect(tx, 44, tw, 1);

    cjk(ctx, '像素裂隙', cx, 50, 15, C.cyan, 'center', 4);
    cjk(ctx, '横版 · 肉鸽 · 清房间闯关', cx, 70, 9, C.dim, 'center', 1);

    // 开始按钮 + 音效开关
    button(ctx, cx - 78, 88, 130, 24, '开 始 游 戏', 'start', { primary: true, hint: touchUI ? 'TAP' : 'ENTER' });
    iconButton(ctx, cx + 58, 88, 24, 24, 'mute', function (c, mx, my, hover) {
      iconSound(c, mx, my, !!save.muted);
      if (hover) {
        c.fillStyle = C.edgeHi;
        c.fillRect(mx - 8, my + 8, 16, 1);
      }
    });

    // 操作说明面板
    var px = 48;
    var pyy = 124;
    panelBox(ctx, px, pyy, G.VIEW_W - px * 2, 66, '操  作');
    var rowY = pyy + 18;
    var lx = px + 12;
    var colW = 118;
    var c1 = lx, c2 = lx + colW, c3 = lx + colW * 2;

    // 第一行：移动 / 跳跃 / 攻击
    if (touchUI) {
      cjk(ctx, '屏幕左下角：控制左右移动', lx, rowY, 9, C.dim, 'left', 0);
    } else {
      legend(ctx, c1, rowY, 'A/D', '移动');
      legend(ctx, c2, rowY, 'SPACE', '跳跃');
      legend(ctx, c3, rowY, 'LMB', '攻击');
    }

    // 第二行：冲刺 / 暂停 / 静音
    var row2 = rowY + 17;
    if (touchUI) {
      cjk(ctx, '屏幕右下角：砍 攻击 · 跳 跳跃 · 冲 冲刺', lx, row2, 9, C.dim, 'left', 0);
    } else {
      legend(ctx, c1, row2, 'K', '冲刺');
      legend(ctx, c2, row2, 'ESC', '暂停');
      legend(ctx, c3, row2, 'M', '静音');
    }

    // 第三行：补充说明 + 确认键
    var row3 = row2 + 17;
    if (touchUI) {
      cjk(ctx, '右上角：暂停 · 全屏（横屏体验更佳）', lx, row3, 9, C.dim2, 'left', 0);
    } else {
      cjk(ctx, '左键攻击 · 空中还能再跳一次', lx, row3, 9, C.dim2, 'left', 0);
      legend(ctx, c3, row3, 'ENTER', '确认');
    }

    // 记录
    cjk(ctx, '最佳记录', cx, 198, 9, C.dim2, 'center', 1);
    var statsY = 210;
    var s1 = 'TIME ' + fmtTime(save.bestTime);
    var w1 = ptextWidth(s1, 1);
    var gap = 14;
    var s2 = 'KILL ' + save.bestKills;
    var w2 = ptextWidth(s2, 1);
    var s3 = 'WIN ' + save.wins + '/' + save.runs;
    var w3 = ptextWidth(s3, 1);
    var totalW = w1 + w2 + w3 + gap * 2;
    var sx0 = cx - totalW / 2;
    ptext(ctx, s1, sx0, statsY, 1, C.amber, 'left');
    ptext(ctx, s2, sx0 + w1 + gap, statsY, 1, C.text, 'left');
    ptext(ctx, s3, sx0 + w1 + gap + w2 + gap, statsY, 1, C.cyan, 'left');

    // 闪烁提示
    var blink = 0.45 + 0.55 * Math.abs(Math.sin(time * 0.045));
    ctx.globalAlpha = blink;
    if (touchUI) {
      cjk(ctx, '轻触屏幕开始游戏', cx, 238, 9, C.dim, 'center', 1);
    } else {
      ptext(ctx, 'PRESS ENTER TO BEGIN', cx, 240, 1, C.dim, 'center');
    }
    ctx.globalAlpha = 1;
    cjk(ctx, 'v1.1 · 断网可玩 · 无需安装任何环境', cx, 254, 8, C.dim2, 'center', 1);

    return takeClick();
  }

  /* ------------------------------ 游戏内 HUD ------------------------------ */
  function drawHUD(ctx, world) {
    var p = world.player;
    if (!p) return;
    var i;

    /* ---- 左上：生命 + 冲刺 ---- */
    var hearts = p.maxHp;
    var perRow = 7;
    var rows = Math.ceil(hearts / perRow);
    var plateW = 14 + Math.min(hearts, perRow) * 9;
    var plateH = 6 + rows * 8 + 5;
    plate(ctx, 6, 6, plateW, plateH, { accent: C.red, corners: false, accentBar: true });

    for (i = 0; i < hearts; i++) {
      var row = Math.floor(i / perRow);
      var col = i % perRow;
      iconHeart(ctx, 12 + col * 9, 11 + row * 8, 1, i < p.hp);
    }

    // 冲刺冷却（分段条）
    var segs = 6;
    var cdMax = p.stats.dashCd || 1;
    var ratio = 1 - Math.max(0, p.dashCd) / cdMax;
    var filled = Math.round(segs * ratio);
    var bx = 12;
    var by = 6 + plateH + 3;
    for (i = 0; i < segs; i++) {
      ctx.fillStyle = i < filled ? C.cyan : 'rgba(95,227,255,0.16)';
      ctx.fillRect(bx + i * 7, by, 6, 2);
    }

    /* ---- 右上：金币 / 时间 / 击杀 ---- */
    var rightX = G.VIEW_W - 8;
    var kills = String(world.kills);
    var kw = ptextWidth(kills, 1);
    ptext(ctx, kills, rightX, 22, 1, C.dim, 'right');
    iconSkull(ctx, rightX - kw - 11, 21, 1);

    var gstr = String(world.gold);
    var gw = ptextWidth(gstr, 1);
    ptext(ctx, gstr, rightX, 9, 1, C.amber, 'right');
    iconCoin(ctx, rightX - gw - 10, 9, 1);

    var tstr = fmtTime(world.time / 60);
    ptext(ctx, tstr, rightX, 34, 1, C.dim2, 'right');

    /* ---- 顶部中央：房间进度链 ---- */
    var total = world.run.length;
    var nodeW = 8;
    var nodeH = 7;
    var gapN = 6;
    var chainW = total * nodeW + (total - 1) * gapN;
    var chainX = Math.round(G.VIEW_W / 2 - chainW / 2);
    var chainY = 10;
    var nodeMidY = chainY + Math.floor(nodeH / 2);

    // 底衬，避免压在场景上看不清
    plate(ctx, chainX - 10, chainY - 5, chainW + 20, nodeH + 10,
      { accent: C.cyan, corners: false, accentBar: false });

    // 连接线
    ctx.fillStyle = 'rgba(154,134,255,0.30)';
    ctx.fillRect(chainX + nodeW, nodeMidY, chainW - nodeW * 2, 1);

    for (i = 0; i < total; i++) {
      var nx = chainX + i * (nodeW + gapN);
      var type = world.run[i].type;
      var done = i < world.roomIndex;
      var current = i === world.roomIndex;
      var col = type === 'boss' ? C.red : (type === 'treasure' ? C.amber : (type === 'rest' ? C.green : C.purple));

      if (done) {
        // 已通过：实心暗色 + 对勾感
        ctx.fillStyle = 'rgba(154,134,255,0.35)';
        ctx.fillRect(nx, chainY, nodeW, nodeH);
        ctx.fillStyle = 'rgba(6,5,12,0.75)';
        ctx.fillRect(nx + 2, chainY + 3, 4, 1);
      } else if (current) {
        // 当前房间：亮框 + 脉动
        var pulse = 0.55 + 0.45 * Math.sin(world.time * 0.16);
        ctx.fillStyle = C.ink;
        ctx.fillRect(nx - 2, chainY - 2, nodeW + 4, nodeH + 4);
        ctx.fillStyle = col;
        ctx.fillRect(nx - 1, chainY - 1, nodeW + 2, nodeH + 2);
        ctx.fillStyle = 'rgba(6,5,12,0.55)';
        ctx.fillRect(nx, chainY, nodeW, nodeH);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(nx + 3, chainY + 2, 2, 3);
        ctx.globalAlpha = 1;
        // 上方指示三角
        ctx.fillStyle = C.ink;
        ctx.fillRect(nx + 1, chainY - 5, 6, 1);
        ctx.fillStyle = col;
        ctx.fillRect(nx + 2, chainY - 4, 4, 1);
        ctx.fillRect(nx + 3, chainY - 3, 2, 1);
      } else {
        // 未到达：空心
        ctx.fillStyle = 'rgba(6,5,12,0.55)';
        ctx.fillRect(nx, chainY, nodeW, nodeH);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(nx, chainY, nodeW, 1);
        ctx.fillRect(nx, chainY + nodeH - 1, nodeW, 1);
        ctx.fillRect(nx, chainY, 1, nodeH);
        ctx.fillRect(nx + nodeW - 1, chainY, 1, nodeH);
        ctx.globalAlpha = 1;
      }
    }

    /* ---- 底部：道具栏 ----
     * 键盘时贴左下角；触屏时挪到底部居中 —— 左下角正好是左右移动键，
     * 不挪的话 6 个格子会被两个大拇指盖住。 */
    var slots = 6;
    var slotSize = 17;
    var barY = G.VIEW_H - slotSize - 6;
    var barW = slots * (slotSize + 2) - 2 + 8;
    var barX = isTouchUI() ? Math.round((G.VIEW_W - barW) / 2) : 4;
    plate(ctx, barX, barY - 4, barW, slotSize + 8, { accent: C.purple, corners: false, accentBar: false });
    var items = p.items;
    for (i = 0; i < slots; i++) {
      var sx = barX + 2 + i * (slotSize + 2);
      var owned = i < items.length;
      var rare = owned ? G.RARITY[items[i].item.rarity] : null;
      var borderCol = owned ? (rare ? rare.color : C.edge) : 'rgba(255,255,255,0.10)';

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx + 1, barY + 2, slotSize, slotSize);
      ctx.fillStyle = owned ? '#1a1440' : 'rgba(10,8,20,0.5)';
      ctx.fillRect(sx, barY, slotSize, slotSize);
      ctx.fillStyle = borderCol;
      if (owned) {
        ctx.fillRect(sx, barY, slotSize, 1);
        ctx.fillRect(sx, barY + slotSize - 1, slotSize, 1);
        ctx.fillRect(sx, barY, 1, slotSize);
        ctx.fillRect(sx + slotSize - 1, barY, 1, slotSize);
      } else {
        ctx.fillRect(sx + 4, barY + 4, slotSize - 8, 1);
        ctx.fillRect(sx + 4, barY + slotSize - 5, slotSize - 8, 1);
        ctx.fillRect(sx + 4, barY + 4, 1, slotSize - 8);
        ctx.fillRect(sx + slotSize - 5, barY + 4, 1, slotSize - 8);
      }

      if (owned && global.Items) {
        global.Items.drawIcon(ctx, sx + 3, barY + 3, 11, items[i].item, world.time);
        if (items[i].stacks > 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.78)';
          ctx.fillRect(sx + slotSize - 8, barY + slotSize - 8, 7, 7);
          ptext(ctx, String(items[i].stacks), sx + slotSize - 4, barY + slotSize - 8, 1, C.amber, 'right', false);
        }
      }
    }

    /* ---- Boss 血条 ---- */
    for (i = 0; i < world.enemies.length; i++) {
      var e = world.enemies[i];
      if (e.isBoss && !e.dead) {
        var bw = 208;
        var bx2 = Math.round(G.VIEW_W / 2 - bw / 2);
        var by2 = G.VIEW_H - 34;
        plate(ctx, bx2 - 4, by2 - 12, bw + 8, 22, { accent: C.red, corners: false, accentBar: false });
        cjk(ctx, e.phase === 2 ? '裂隙守卫 · 狂暴' : '裂隙守卫', G.VIEW_W / 2, by2 - 10, 9,
          e.phase === 2 ? '#ff8080' : C.text, 'center', 1);

        ctx.fillStyle = '#2a0d18';
        ctx.fillRect(bx2, by2, bw, 6);
        var hpr = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = e.phase === 2 ? '#ff3030' : '#e04a4a';
        ctx.fillRect(bx2, by2, Math.round(bw * hpr), 6);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(bx2, by2, Math.round(bw * hpr), 1);
        // 分段刻度
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        for (var t = 1; t < 10; t++) {
          ctx.fillRect(bx2 + Math.round(bw * t / 10), by2, 1, 6);
        }
        break;
      }
    }

    /* ---- 清房提示：门在屏幕右侧外时给个箭头 ---- */
    if (world.room && world.room.door && world.room.door.open && world.camera) {
      var doorScreenX = world.room.door.x - world.camera.x;
      if (doorScreenX > G.VIEW_W - 20) {
        var pulse2 = 0.55 + 0.45 * Math.sin(world.time * 0.15);
        ctx.globalAlpha = pulse2;
        ctx.fillStyle = C.cyan;
        var ax = G.VIEW_W - 22;
        var ay = Math.round(G.VIEW_H / 2 - 10);
        for (i = 0; i < 4; i++) {
          ctx.fillRect(ax + i * 3, ay + i * 2, 3, 2);
          ctx.fillRect(ax + i * 3, ay + 16 - i * 2, 3, 2);
        }
        ctx.fillRect(ax + 10, ay + 6, 4, 6);
        ctx.globalAlpha = 1;
        cjk(ctx, '门已开启', ax - 6, ay + 26, 8, C.cyan, 'right', 0);
      }
    }

    /* ---- 低血量红色脉冲边框 ---- */
    if (p.hp <= 2) {
      var pl = 0.16 + 0.14 * Math.sin(world.time * 0.22);
      ctx.fillStyle = 'rgba(255,60,80,' + pl.toFixed(3) + ')';
      ctx.fillRect(0, 0, G.VIEW_W, 3);
      ctx.fillRect(0, G.VIEW_H - 3, G.VIEW_W, 3);
      ctx.fillRect(0, 0, 3, G.VIEW_H);
      ctx.fillRect(G.VIEW_W - 3, 0, 3, G.VIEW_H);
    }
  }

  /* ------------------------------ 暂停 ------------------------------ */
  function drawPause(ctx, world) {
    buttons = [];
    screenShade(ctx, 0.66);
    drawVignette(ctx);

    var pw = 220;
    var ph = 190;
    var px = Math.round((G.VIEW_W - pw) / 2);
    var py = 40;
    panelBox(ctx, px, py, pw, ph, '暂  停', { accent: C.cyan });

    ptext(ctx, 'PAUSED', G.VIEW_W / 2, py + 22, 2, C.text, 'center');
    cjk(ctx, '已暂停 · 喝口水再战', G.VIEW_W / 2, py + 42, 9, C.dim, 'center', 1);

    var bw = 152;
    var bx = Math.round((G.VIEW_W - bw) / 2);
    button(ctx, bx, py + 62, bw, 22, '继 续 游 戏', 'resume', { primary: true, hint: isTouchUI() ? '' : 'ESC' });
    button(ctx, bx, py + 90, bw, 20, '重 新 开 始', 'restart', {});
    button(ctx, bx, py + 114, bw, 20, '返 回 标 题', 'menu', {});

    hr(ctx, px + 12, py + 142, pw - 24);
    cjk(ctx, '房间 ' + (world.roomIndex + 1) + ' / ' + world.run.length, px + 20, py + 150, 9, C.dim, 'left', 0);
    cjk(ctx, '击杀 ' + world.kills, G.VIEW_W / 2, py + 150, 9, C.dim, 'center', 0);
    cjk(ctx, '金币 ' + world.gold, px + pw - 20, py + 150, 9, C.amber, 'right', 0);
    cjk(ctx, '道具 ' + world.player.items.length + ' 件', G.VIEW_W / 2, py + 166, 9, C.dim2, 'center', 0);

    return takeClick();
  }

  /* ------------------------------ 结算面板（死亡 / 通关共用） ------------------------------ */
  function statRow(ctx, iconFn, label, value, y, valueColor) {
    var px = 120;
    var pw = 240;
    iconFn(ctx, px + 12, y, 1);
    cjk(ctx, label, px + 26, y + 1, 9, C.dim, 'left', 0);
    ptext(ctx, value, px + pw - 12, y, 1, valueColor || C.text, 'right');
  }

  function resultPanel(ctx, world, save, opts) {
    buttons = [];
    screenShade(ctx, 0.76);

    // 结局色调
    ctx.fillStyle = opts.tint;
    ctx.globalAlpha = 0.10;
    ctx.fillRect(0, 0, G.VIEW_W, G.VIEW_H);
    ctx.globalAlpha = 1;
    drawVignette(ctx);

    var pw = 272;
    var ph = 208;
    var px = Math.round((G.VIEW_W - pw) / 2);
    var py = 30;
    panelBox(ctx, px, py, pw, ph, opts.headTitle, { accent: opts.accent });

    ptext(ctx, opts.title, G.VIEW_W / 2, py + 22, 2, opts.accent, 'center', 'rgba(0,0,0,0.9)');
    cjk(ctx, opts.subtitle, G.VIEW_W / 2, py + 44, 9, C.dim, 'center', 1);
    hr(ctx, px + 14, py + 60, pw - 28, opts.accent === C.red ? 'rgba(255,85,102,0.35)' : 'rgba(142,245,138,0.35)');

    statRow(ctx, iconClock, '存活时间', fmtTime(world.time / 60), py + 68);
    statRow(ctx, iconSword, '击杀数', String(world.kills), py + 84);
    statRow(ctx, iconCoin, '金币', String(world.gold), py + 100, C.amber);
    statRow(ctx, iconChest, '到达房间', (world.roomIndex + 1) + ' / ' + world.run.length, py + 116);
    statRow(ctx, iconBoot, '最终道具', String(world.player.items.length), py + 132, C.purple);

    var bw = 176;
    var bx = Math.round((G.VIEW_W - bw) / 2);
    button(ctx, bx, py + 146, bw, 22, '重 新 挑 战', 'restart', { primary: true, hint: isTouchUI() ? '' : 'ENTER' });
    button(ctx, bx, py + 172, bw, 18, '返 回 标 题', 'menu', {});

    ptext(ctx, 'BEST ' + fmtTime(save.bestTime), px + 14, py + ph - 9, 1, C.dim2, 'left', false);
    ptext(ctx, 'WIN ' + save.wins + '/' + save.runs, px + pw - 14, py + ph - 9, 1, C.dim2, 'right', false);

    return takeClick();
  }

  function drawDeath(ctx, world, save) {
    return resultPanel(ctx, world, save, {
      title: 'YOU DIED',
      headTitle: '结  算',
      subtitle: '裂隙吞没了你的光',
      accent: C.red,
      tint: '#ff3344'
    });
  }

  function drawWin(ctx, world, save) {
    return resultPanel(ctx, world, save, {
      title: 'VICTORY',
      headTitle: '通  关',
      subtitle: '裂隙守卫被击碎，你走出来了',
      accent: C.green,
      tint: '#66ff88'
    });
  }

  /* ------------------------------ 房间过渡横幅 ------------------------------ */
  function drawRoomBanner(ctx, world) {
    if (!world.room || world.bannerTimer <= 0) return;
    var a = Math.min(1, world.bannerTimer / 22);
    var typeName = {
      battle: '战斗房', treasure: '宝箱房', rest: '休息房', boss: 'BOSS 房'
    }[world.room.type] || '';
    var typeColor = {
      battle: C.purple, treasure: C.amber, rest: C.green, boss: C.red
    }[world.room.type] || C.text;

    ctx.globalAlpha = a;
    var bw = 182;
    var bh = 44;
    var bx = Math.round(G.VIEW_W / 2 - bw / 2);
    var by = 56;
    plate(ctx, bx, by, bw, bh, { accent: typeColor, corners: false, accentBar: false });

    cjk(ctx, '第 ' + (world.roomIndex + 1) + ' 层 · ' + typeName, G.VIEW_W / 2, by + 7, 11, typeColor, 'center', 1);
    hr(ctx, bx + 12, by + 24, bw - 24, 'rgba(0,0,0,0.40)');
    cjk(ctx, world.room.name, G.VIEW_W / 2, by + 27, 9, C.dim, 'center', 2);

    // 两侧装饰
    ctx.fillStyle = typeColor;
    var dy2 = by + 12;
    for (var bi = 0; bi < 4; bi++) {
      ctx.fillRect(bx - 12 + bi * 2, dy2 + bi, 2, 1);
      ctx.fillRect(bx + bw + 10 - bi * 2, dy2 + bi, 2, 1);
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------ 工具 ------------------------------ */
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var s = Math.floor(sec);
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  global.UI = {
    drawMenu: drawMenu,
    drawHUD: drawHUD,
    drawPause: drawPause,
    drawDeath: drawDeath,
    drawWin: drawWin,
    drawRoomBanner: drawRoomBanner,
    drawVignette: drawVignette,
    panel: panelBox,
    plate: plate,
    text: cjk,
    ptext: ptext,
    fmtTime: fmtTime,
    COLORS: C
  };
})(window);
