// Pixel-art progress scenes. Everything is drawn on a 128×48 canvas that CSS
// scales up with `image-rendering: pixelated`. No image files: sprites are
// string grids and the rest is procedural. Animations are stateless (derived
// from time), so the scene always matches the timer exactly.
const Scenes = (() => {
  const W = 128, H = 48;
  let ctx = null;

  // ---------- palettes ----------
  const CHAR = {
    // ginger beard: stands out against both the dark and the light tunnel
    h: '#e8b84a', l: '#fff3b0', s: '#e3ac82', e: '#2b1d16', b: '#d2783a',
    c: '#b5523b', p: '#4a5d8a', k: '#3a2a20', w: '#8a5a34',
  };
  const FIRE = ['#7a2e1c', '#c4462a', '#e8833a', '#f4b860', '#fff0b8'];
  const THEMES = {
    dark: {
      sky: ['#17141f', '#1e1928', '#272030', '#332836'],
      night: true, star: '#f1e6d2', moon: '#f3e3b5', hill: '#2c2433', tree: '#1f2a26', treeHi: '#26332d',
      grass: '#3f5a3a', grassHi: '#56744a', dirt: '#3b2c22', dirtDark: '#30241c',
      rock: '#4a3d35', rockDark: '#3d322b', rockLight: '#5a4a40', tunnel: '#241c18', tunnelDark: '#1d1714', floor: '#33271f',
      ore: '#e0b24a', gem: '#7fc6c0', metal: '#a9a9b3', metalDark: '#6d6d78',
      wall: '#3a2e28', wallStripe: '#41342d', frame: '#5c4334', curtain: '#6e3f37', curtainDark: '#5a332d',
      sill: '#6b4a33', sillHi: '#7d583e', sillDark: '#523826',
      pot: '#a85f45', potDark: '#8a4c37', potRim: '#bf7356', soil: '#3a2820',
      stem: '#5f8a4a', leaf: '#76a862', leafDark: '#5a8a4c', petal: '#e6a1b0', petalCore: '#f3cf6b',
      can: '#6f97a8', canDark: '#557a8a', water: '#8fc6e0', steam: '#d9d2c6',
      mug: '#c9b28f', book1: '#7a4a5a', book2: '#4f6a7a', book3: '#a08050',
      glow: '#f4b860',
    },
    light: {
      sky: ['#cfe0e3', '#dae4da', '#e8e4cf', '#f3e2c4'],
      night: false, sun: '#f6c86b', cloud: '#fbf7ef', hill: '#c9d3b6', tree: '#8aa678', treeHi: '#9cb889',
      grass: '#93b077', grassHi: '#a9c48c', dirt: '#a57c58', dirtDark: '#8f6948',
      rock: '#a08670', rockDark: '#8e7562', rockLight: '#b39a83', tunnel: '#6e5646', tunnelDark: '#5e4a3c', floor: '#7d6352',
      ore: '#e8b84a', gem: '#5fa8a0', metal: '#cfcfd6', metalDark: '#8d8d96',
      wall: '#ecdcc4', wallStripe: '#e5d3b8', frame: '#b88a62', curtain: '#d99a86', curtainDark: '#c78672',
      sill: '#c49668', sillHi: '#d4a878', sillDark: '#a97d55',
      pot: '#c0704f', potDark: '#a25d40', potRim: '#d48463', soil: '#6b4a36',
      stem: '#6d9a52', leaf: '#85b86d', leafDark: '#689a56', petal: '#ec9aab', petalCore: '#f6d06b',
      can: '#7fa7b8', canDark: '#5f8796', water: '#7ab8d6', steam: '#ffffff',
      mug: '#f4ead8', book1: '#b0616f', book2: '#5f8aa0', book3: '#d0a660',
      glow: '#f4b860',
    },
  };

  // ---------- primitives ----------
  const hash = (x, y, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function px(x, y, c, a = 1) {
    ctx.globalAlpha = a;
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    ctx.globalAlpha = 1;
  }
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  function line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function disk(cx, cy, r, c, a = 1) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) px(cx + x, cy + y, c, a);
  }
  // rows: array of strings; '.' = transparent; other chars looked up in pal
  function sprite(rows, pal, x, y, opts = {}) {
    rows.forEach((row, ry) => {
      const oy = opts.bobRows && ry < opts.bobRows ? (opts.bob || 0) : 0;
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        if (ch === '.') continue;
        const c = (opts.override && opts.override[ch]) || pal[ch];
        if (c) px(x + (opts.flip ? row.length - 1 - rx : rx), y + ry + oy, c);
      }
    });
  }

  // Cached static layers (backgrounds), keyed by scene+theme.
  const cache = {};
  function layer(key, draw) {
    if (!cache[key]) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const prev = ctx;
      ctx = c.getContext('2d');
      draw();
      ctx = prev;
      cache[key] = c;
    }
    return cache[key];
  }

  // ---------- shared scenery ----------
  function sky(pal, x0, y0, x1, y1) {
    const n = pal.sky.length - 1;
    for (let y = y0; y < y1; y++) {
      const f = ((y - y0) / Math.max(1, y1 - y0 - 1)) * n;
      const i = Math.min(n - 1, Math.floor(f)), frac = f - i;
      for (let x = x0; x < x1; x++) px(x, y, bayer(x, y) < frac ? pal.sky[i + 1] : pal.sky[i]);
    }
  }
  function stars(pal, t, x0, y0, x1, y1, count = 14) {
    if (!pal.night) return;
    for (let i = 0; i < count; i++) {
      const x = x0 + Math.floor(hash(i, 1, 9) * (x1 - x0));
      const y = y0 + Math.floor(hash(i, 2, 9) * (y1 - y0));
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.8 + hash(i, 3) * 1.5) + i * 2.1));
      px(x, y, pal.star, a);
    }
  }
  function sunOrMoon(pal, cx, cy, t) {
    if (pal.night) {
      disk(cx, cy, 6, pal.moon, 0.06);
      disk(cx, cy, 4, pal.moon);
      disk(cx + 2, cy - 1, 3, pal.sky[0]);
    } else {
      const pulse = Math.round(0.5 + 0.5 * Math.sin(t * 1.2));
      disk(cx, cy, 7 + pulse, pal.sun, 0.12);
      disk(cx, cy, 5, pal.sun, 0.25);
      disk(cx, cy, 4, pal.sun);
    }
  }
  function cloud(pal, x, y, clip) {
    if (pal.night) return;
    const shape = ['..####....', '.#######..', '##########'];
    shape.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] !== '#') continue;
        const X = Math.round(x + rx), Y = y + ry;
        if (!clip || (X >= clip[0] && X < clip[2] && Y >= clip[1] && Y < clip[3])) px(X, Y, pal.cloud);
      }
    });
  }
  function glow(cx, cy, r, c, flicker) {
    const f = Math.round(flicker);
    disk(cx, cy, r + 4 + f, c, 0.05);
    disk(cx, cy, r + f, c, 0.07);
    disk(cx, cy, Math.max(1, r - 4) + f, c, 0.09);
  }
  function fire(cx, baseY, h, t, w = 4) {
    for (let dx = -w; dx <= w; dx++) {
      const fall = 1 - Math.abs(dx) / (w + 1);
      const n = 0.7 + 0.3 * Math.sin(t * 9 + dx * 1.7) * Math.sin(t * 5.3 + dx * 0.9 + 1);
      const colH = Math.max(1, Math.round(h * fall * n));
      for (let k = 0; k < colH; k++) {
        const rel = k / colH;
        let c;
        if (Math.abs(dx) <= w * 0.45 && rel < 0.45) c = rel < 0.2 ? FIRE[4] : FIRE[3];
        else if (rel < 0.5) c = FIRE[2];
        else if (rel < 0.85) c = FIRE[1];
        else c = FIRE[0];
        px(cx + dx, baseY - k, c);
      }
    }
    // rising sparks
    for (let i = 0; i < 3; i++) {
      const cyc = t * 0.6 + i * 0.37;
      const ph = cyc % 1, k = Math.floor(cyc);
      const x = cx + (hash(i, k, 4) - 0.5) * w * 2 + Math.sin(t * 3 + i * 2) * 1.5;
      const y = baseY - h * 0.6 - ph * 16;
      px(x, y, FIRE[3], 1 - ph);
    }
  }

  // ---------- scene: miner ----------
  const MINER = [
    '...hhhh.....',
    '..hhhhhhl...',
    '..hhhhhhhh..',
    '..sssssess..',
    '..ssssssss..',
    '..bbbbbbb...',
    '...bbbbb....',
    '..cccccc....',
    '.cccccccc...',
    '.cpppppc....',
    '..pppppp....',
    '..pppppp....',
    '..pp..pp....',
    '..pp..pp....',
    '.kkk..kkk...',
  ];
  const MINER_SIT = [
    '...hhhh.....',
    '..hhhhhhl...',
    '..hhhhhhhh..',
    '..ssssssss..',
    '..ssssssss..',
    '..bbbbbbb...',
    '...bbbbb....',
    '..cccccc....',
    '.ccccccss...',
    '.cppppppp...',
    '.ppppppppkk.',
    '.ppppppppkk.',
  ];
  const TUN_TOP = 17, TUN_FLOOR = 40, SURFACE = 6;

  function pickaxe(pal, hx, hy, deg) {
    const a = (deg * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
    const ex = hx + dx * 9, ey = hy + dy * 9;
    line(hx - dx, hy - dy, ex, ey, CHAR.w);
    const qx = -dy, qy = dx; // perpendicular: the pick head
    for (let k = -3; k <= 3; k++) {
      const back = Math.abs(k) * 0.4;
      px(ex + qx * k - dx * back, ey + qy * k - dy * back, Math.abs(k) === 3 ? pal.metalDark : pal.metal);
    }
  }

  function minerRock(pal) {
    sky(pal, 0, 0, W, SURFACE);
    for (let x = 0; x < W; x++) {
      px(x, SURFACE, hash(x, 1) < 0.5 ? pal.grass : pal.grassHi);
      px(x, SURFACE + 1, pal.grass);
      if (hash(x, 2) < 0.15) px(x, SURFACE - 1, pal.grassHi);
    }
    // calm rock: flat base, a soft topsoil band, and scattered rounded stones
    for (let y = SURFACE + 2; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let c = pal.rock;
        if (y < SURFACE + 4 + Math.round(hash(x, 7) * 1.5)) c = pal.dirt;
        else if (hash(x, y) < 0.04) c = pal.rockDark;
        px(x, y, c);
      }
    }
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(hash(i, 1, 3) * W), y = SURFACE + 6 + Math.floor(hash(i, 2, 3) * (H - SURFACE - 7));
      const w = 2 + Math.floor(hash(i, 3, 3) * 3), h = 2;
      rect(x, y, w, h, pal.rockDark);
      rect(x, y, w - 1, 1, pal.rockLight);
    }
    // a few ore veins and gems, each a small cluster with a highlight
    for (let i = 0; i < 16; i++) {
      const x = 4 + Math.floor(hash(i, 5, 2) * (W - 8)), y = SURFACE + 7 + Math.floor(hash(i, 6, 2) * (H - SURFACE - 9));
      const gem = hash(i, 7, 2) < 0.25;
      const c = gem ? pal.gem : pal.ore;
      px(x, y, c); px(x + 1, y + 1, c); px(x - 1, y + 1, c);
      px(x, y + 1, gem ? '#c9f0ea' : '#fff0b0');
    }
  }
  function minerTunnel(pal) {
    for (let y = TUN_TOP; y <= TUN_FLOOR; y++) {
      for (let x = 0; x < W; x++) {
        // ragged ceiling
        if (y === TUN_TOP && hash(x, 11) < 0.55) continue;
        if (y === TUN_TOP + 1 && hash(x, 12) < 0.2) continue;
        const v = hash(x, y, 3);
        px(x, y, y >= TUN_FLOOR ? pal.floor : v < 0.25 ? pal.tunnelDark : pal.tunnel);
      }
    }
    // wooden supports
    for (let bx = 34; bx < W; bx += 30) {
      rect(bx, TUN_TOP + 1, 2, TUN_FLOOR - TUN_TOP - 1, CHAR.w);
      rect(bx - 3, TUN_TOP + 1, 8, 1, CHAR.w);
    }
    // rails
    for (let x = 0; x < W; x++) {
      px(x, TUN_FLOOR - 1, pal.metalDark);
      if (x % 4 === 0) px(x, TUN_FLOOR, CHAR.w);
    }
  }
  // Break: outside at the mine entrance, sitting beside a cart full of loot.
  const MG = 38; // ground line outside the mine
  const PORTAL = [12, 22, 28]; // opening x0, top y, x1
  const hillTop = (x) => (x < 32 ? 9 + Math.round(Math.sin(x * 0.3) + hash(x, 4) * 0.8) : 9 + Math.round((x - 32) * 1.7));
  function minerSurface(pal) {
    sky(pal, 0, 0, W, MG);
    // distant hills and a few pines
    for (let x = 0; x < W; x++) {
      const hy = Math.round(27 + Math.sin(x * 0.05 + 2) * 3 + Math.sin(x * 0.13) * 1.5);
      for (let y = hy; y < MG; y++) px(x, y, pal.hill);
    }
    for (const [tx, th] of [[100, 13], [110, 19], [121, 15]]) {
      for (let i = 0; i < th; i++) {
        const half = Math.floor(((i % 6) + 1) * 0.6 + i * 0.18);
        rect(tx - half, MG - th + i, half * 2 + 1, 1, pal.tree);
        if (i % 6 === 0) px(tx - half + 1, MG - th + i, pal.treeHi);
      }
    }
    // meadow
    for (let x = 0; x < W; x++) {
      px(x, MG, hash(x, 1) < 0.5 ? pal.grass : pal.grassHi);
      px(x, MG + 1, pal.grass);
      for (let y = MG + 2; y < H; y++) px(x, y, hash(x, y) < 0.3 ? pal.dirtDark : pal.dirt);
      if (hash(x, 3) < 0.12) px(x, MG - 1, pal.grassHi);
    }
    // the hillside the mine is dug into
    for (let x = 0; x < W; x++) {
      const top = hillTop(x);
      if (top >= MG) break;
      for (let y = top; y < MG; y++) {
        let c = pal.rock;
        if (y < top + 2) c = y === top ? pal.grassHi : pal.grass;
        else if (y < top + 4) c = pal.dirt;
        else if (hash(x, y, 2) < 0.05) c = pal.rockDark;
        px(x, y, c);
      }
    }
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(hash(i, 1, 8) * 44), y = 15 + Math.floor(hash(i, 2, 8) * 20);
      if (y < hillTop(x) + 5 || y > MG - 3) continue;
      rect(x, y, 3, 2, pal.rockDark); rect(x, y, 2, 1, pal.rockLight);
    }
    // the entrance: a dark opening with a timber frame
    const [x0, top, x1] = PORTAL;
    for (let y = top; y <= MG; y++) {
      for (let x = x0; x <= x1; x++) {
        const depth = Math.min(1, (y - top) / 6) * (1 - Math.abs(x - (x0 + x1) / 2) / 10);
        px(x, y, y === MG ? THEMES.dark.floor : bayer(x, y) < depth ? '#140f0c' : THEMES.dark.tunnelDark);
      }
    }
    rect(x0 - 2, top - 2, 2, MG - top + 2, CHAR.w);
    rect(x1 + 1, top - 2, 2, MG - top + 2, CHAR.w);
    rect(x0 - 4, top - 3, x1 - x0 + 9, 2, CHAR.w);
    rect(x0 - 4, top - 2, x1 - x0 + 9, 1, '#6b4a33');
    // rails out of the mine, ending in a buffer stop
    for (let x = x0 + 2; x <= 64; x++) {
      px(x, MG - 1, x < x1 ? '#3d3d46' : pal.metalDark);
      if (x % 4 === 0) px(x, MG, CHAR.w);
    }
    rect(65, MG - 3, 2, 3, CHAR.w); px(65, MG - 3, '#6b4a33');
    // a couple of little flowers in the meadow
    for (const [fx, tall] of [[20, 3], [116, 2]]) {
      const gy = Math.min(MG, hillTop(fx)); // stands on the hilltop or the meadow
      for (let k = 1; k <= tall; k++) px(fx, gy - k, pal.leafDark);
      px(fx + 1, gy - 2, pal.leaf);
      const fy = gy - tall - 1;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) px(fx + dx, fy + dy, pal.petal);
      px(fx, fy, pal.petalCore);
    }
  }
  function lootCart(pal, cx, t) {
    const by = MG - 3; // bottom of the cart body
    // heaped load: a dome of gold with gems mixed in
    for (let x = cx + 1; x <= cx + 16; x++) {
      const r = (x - (cx + 8.5)) / 8.5;
      const h = Math.round(3.5 * Math.sqrt(Math.max(0, 1 - r * r))) + (hash(x, 9) < 0.3 ? 1 : 0);
      for (let k = 0; k < h; k++) {
        const v = hash(x, k, 11);
        px(x, by - 7 - k, k === h - 1 && v < 0.5 ? '#fff0b0' : v < 0.22 ? pal.gem : v < 0.3 ? '#c9f0ea' : pal.ore);
      }
    }
    // body: a slightly tapered metal tub
    for (let r = 0; r < 7; r++) {
      const inset = r >= 5 ? 1 : 0;
      for (let x = cx + inset; x <= cx + 17 - inset; x++) {
        const edge = x === cx + inset || x === cx + 17 - inset;
        px(x, by - 6 + r, r === 0 || r === 6 || edge ? pal.metalDark : r === 3 ? pal.metalDark : pal.metal);
      }
    }
    for (const rx of [3, 8, 14]) px(cx + rx, by - 4, pal.metalDark);
    rect(cx + 3, MG - 3, 3, 2, CHAR.k); rect(cx + 12, MG - 3, 3, 2, CHAR.k);
    px(cx + 4, MG - 3, pal.metalDark); px(cx + 13, MG - 3, pal.metalDark);
    // a couple of nuggets that rolled off
    px(cx - 2, MG - 1, pal.ore); px(cx + 20, MG - 1, pal.gem); px(cx + 21, MG - 1, pal.ore);
    // twinkles on the pile
    for (let i = 0; i < 2; i++) {
      const cyc = t * 0.5 + i * 0.5, k = Math.floor(cyc), ph = cyc - k;
      const sx = cx + 3 + Math.floor(hash(k, i, 12) * 12), sy = by - 9 - Math.floor(hash(k, i, 13) * 3);
      const a = Math.sin(ph * Math.PI);
      px(sx, sy, '#ffffff', a);
      if (ph > 0.3 && ph < 0.7) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) px(sx + dx, sy + dy, '#ffffff', a * 0.6);
    }
  }
  function minerBreak(s, pal) {
    ctx.drawImage(layer(`miner-surface-${s.theme}`, () => minerSurface(pal)), 0, 0);
    stars(pal, s.t, 40, 0, W, 22, 14);
    sunOrMoon(pal, 60, 8, s.t);
    if (!pal.night) {
      cloud(pal, ((s.t * 1.0) % (W + 30)) - 15, 5);
      cloud(pal, ((s.t * 0.6 + 70) % (W + 30)) - 15, 13);
    }
    // pickaxe leaning on the entrance post
    pickaxe(pal, 5, MG - 1, 20);
    lootCart(pal, 44, s.t);
    // campfire between the cart and his seat
    const fx = 74;
    glow(fx, MG - 3, 11, pal.glow, Math.sin(s.t * 6) * 0.8);
    for (const dx of [-4, -2, 2, 4]) px(fx + dx, MG - 1, pal.rockLight);
    line(fx - 3, MG - 1, fx + 3, MG - 2, CHAR.w);
    fire(fx, MG - 2, 7, s.t, 3);
    // sitting on a crate, facing the fire and his haul
    const mx = 80, my = MG - MINER_SIT.length - 3;
    rect(82, MG - 4, 9, 4, CHAR.w); rect(82, MG - 4, 9, 1, '#a0703f'); px(86, MG - 2, '#6b4a33');
    const bob = Math.sin(s.t * 1.5) > 0.3 ? 1 : 0;
    sprite(MINER_SIT, CHAR, mx, my, { bobRows: 9, bob, flip: true });
    // z z z, drifting up and away with a clear gap between each
    for (let i = 0; i < 3; i++) {
      const ph = (s.t * 0.25 + i / 3) % 1;
      const zx = mx + 8 + ph * 9, zy = my - 3 - ph * 18;
      const a = Math.sin(ph * Math.PI);
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [3, 0], [2, 1], [1, 2], [0, 3], [1, 3], [2, 3], [3, 3]]) px(zx + dx, zy + dy, pal.steam, a);
    }
  }
  const jag = (y) => Math.round(hash(y, 9) * 3) - 1;

  function sceneMiner(s, pal) {
    ctx.drawImage(layer(`miner-rock-${s.theme}`, () => minerRock(pal)), 0, 0);
    stars(pal, s.t, 0, 0, W, SURFACE - 1, 10);
    const breakMode = s.mode === 'break';
    const X = breakMode ? W + 2 : Math.round(lerp(24, W - 3, s.progress));
    const tun = layer(`miner-tunnel-${s.theme}`, () => minerTunnel(pal));
    for (let y = TUN_TOP; y <= TUN_FLOOR; y++) {
      const wx = Math.max(0, Math.min(W, X + jag(y)));
      if (wx > 0) ctx.drawImage(tun, 0, y, wx, 1, 0, y, wx, 1);
    }
    // lanterns on the supports already dug out
    for (let bx = 34; bx < X - 2; bx += 30) {
      glow(bx + 1, TUN_TOP + 4, 7, pal.glow, Math.sin(s.t * 7 + bx) * 0.6);
      rect(bx, TUN_TOP + 2, 2, 1, pal.metalDark);
      rect(bx, TUN_TOP + 3, 2, 2, '#ffd27a');
    }

    if (breakMode) { minerBreak(s, pal); return; }

    const mx = X - 17, my = TUN_FLOOR - MINER.length;
    const hx = mx + 8, hy = my + 9;
    let angle;
    if (s.running) {
      const period = 0.8, ph = (s.t % period) / period;
      angle = ph < 0.7 ? lerp(95, -35, 1 - Math.pow(1 - ph / 0.7, 2)) : lerp(-35, 95, Math.pow((ph - 0.7) / 0.3, 2));
      // chips flying off the rock face (age = time since the last strike)
      const k = Math.floor(s.t / period), age = s.t % period;
      for (let i = 0; i < 6; i++) {
        const vx = -(10 + hash(k, i, 5) * 28), vy = -(14 + hash(k, i, 6) * 34);
        const x = X + vx * age, y = hy + vy * age + 70 * age * age;
        if (y < TUN_FLOOR - 1) px(x, y, i === 0 ? '#ffe9a0' : hash(k, i, 7) < 0.3 ? pal.ore : pal.rockLight, 1 - age / period);
      }
    } else {
      angle = 165; // resting, head on the ground
    }
    const blink = (s.t % 4) < 0.15;
    const bob = !s.running && Math.sin(s.t * 2) > 0.5 ? 1 : 0;
    sprite(MINER, CHAR, mx, my, { bobRows: 9, bob, override: blink ? { e: CHAR.s } : null });
    pickaxe(pal, hx, hy + bob, angle);
    // helmet lamp beam
    const lampA = 0.12 + 0.04 * Math.sin(s.t * 5);
    for (let i = 1; i < 8; i++) for (let j = -Math.floor(i / 3); j <= Math.floor(i / 3); j++) px(mx + 9 + i, my + 1 + bob + j, '#fff3b0', lampA);
  }

  // ---------- scene: campfire ----------
  const GROUND = 36;
  function campBackground(pal) {
    sky(pal, 0, 0, W, GROUND);
    for (let x = 0; x < W; x++) {
      const hy = Math.round(28 + Math.sin(x * 0.05) * 3 + Math.sin(x * 0.13 + 1) * 1.5);
      for (let y = hy; y < GROUND; y++) px(x, y, pal.hill);
    }
    // pines
    for (const [tx, th] of [[7, 20], [16, 15], [24, 11], [104, 12], [113, 18], [122, 22]]) {
      for (let i = 0; i < th; i++) {
        const half = Math.floor(((i % 6) + 1) * 0.6 + i * 0.18);
        const y = GROUND - th + i;
        rect(tx - half, y, half * 2 + 1, 1, pal.tree);
        if (i % 6 === 0) px(tx - half + 1, y, pal.treeHi);
      }
      rect(tx, GROUND - 1, 1, 2, CHAR.k);
    }
    for (let x = 0; x < W; x++) {
      px(x, GROUND, hash(x, 1) < 0.5 ? pal.grass : pal.grassHi);
      px(x, GROUND + 1, pal.grass);
      for (let y = GROUND + 2; y < H; y++) px(x, y, hash(x, y) < 0.3 ? pal.dirtDark : pal.dirt);
      if (hash(x, 3) < 0.12) px(x, GROUND - 1, pal.grassHi);
    }
  }
  function sceneCampfire(s, pal) {
    ctx.drawImage(layer(`camp-${s.theme}`, () => campBackground(pal)), 0, 0);
    stars(pal, s.t, 0, 0, W, 24, 16);
    sunOrMoon(pal, 96, 9, s.t);
    if (!pal.night) {
      cloud(pal, ((s.t * 1.2) % (W + 30)) - 15, 6);
      cloud(pal, ((s.t * 0.7 + 70) % (W + 30)) - 15, 14);
    }

    if (s.mode === 'break') {
      const fx = 64, base = GROUND + 1;
      glow(fx, base - 4, 14, pal.glow, Math.sin(s.t * 6) * 0.8);
      for (let dx = -6; dx <= 6; dx += 2) px(fx + dx, base, pal.rockLight);
      fire(fx, base - 1, 7, s.t, 4);
      // tripod + kettle
      line(fx - 9, base, fx, base - 20, CHAR.w);
      line(fx + 9, base, fx, base - 20, CHAR.w);
      line(fx, base - 19, fx, base - 15, pal.metalDark);
      const kx = fx - 4, ky = base - 14;
      rect(kx + 1, ky, 7, 1, pal.metalDark);
      rect(kx, ky + 1, 9, 5, pal.metal);
      rect(kx + 1, ky + 6, 7, 1, pal.metalDark);
      line(kx + 9, ky + 3, kx + 11, ky + 1, pal.metal);
      // steam
      for (let i = 0; i < 4; i++) {
        const ph = (s.t * 0.4 + i / 4) % 1;
        const x = kx + 11 + ph * 6 + Math.sin(s.t * 2 + i) * 1.5, y = ky - ph * 14;
        disk(x, y, ph < 0.5 ? 0 : 1, pal.steam, 0.55 * (1 - ph));
      }
      // a mug waiting on a log seat
      rect(86, base - 3, 14, 3, CHAR.w);
      rect(92, base - 7, 4, 4, pal.mug);
      px(96, base - 6, pal.mug);
      return;
    }

    // The fire travels left → right along the log, like the progress bar.
    const logL = 24, logR = 102, base = GROUND + 1;
    const fx = Math.round(lerp(logL + 3, logR - 4, s.progress));
    // ash trail where the log has burned away
    for (let x = logL; x <= fx - 2; x++) {
      px(x, base, hash(x, 2) < 0.5 ? '#6f6660' : '#57504b');
      if (hash(x, 3) < 0.35) px(x, base - 1, '#7a716a');
      if (hash(x, Math.floor(s.t * 2)) < 0.06) px(x, base - 1, FIRE[2]);
    }
    // remaining log
    for (let x = fx - 1; x <= logR; x++) {
      px(x, base - 4, '#6b4a33'); px(x, base - 3, '#8a5a34'); px(x, base - 2, '#7a5236'); px(x, base - 1, '#5a3d28');
      if (hash(x, 5) < 0.2) px(x, base - 3, '#6b4a33');
    }
    rect(logR + 1, base - 4, 1, 4, '#c49a6c');
    px(logR + 1, base - 3, '#a57c58'); px(logR + 1, base - 2, '#a57c58');
    rect(fx - 2, base - 4, 2, 4, '#3a2a20');
    px(fx - 2, base - 2, FIRE[2]);
    const h = s.running ? 11 : 5;
    glow(fx, base - 5, s.running ? 14 : 9, pal.glow, Math.sin(s.t * 6) * 0.8);
    fire(fx, base - 2, h, s.running ? s.t : s.t * 0.4, s.running ? 4 : 3);
  }

  // ---------- scene: plant ----------
  const WIN = [26, 3, 102, 32]; // x0, y0, x1, y1 of the window opening
  function roomBackground(pal) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, x % 8 === 0 ? pal.wallStripe : pal.wall);
    sky(pal, WIN[0], WIN[1], WIN[2], WIN[3]);
  }
  function roomForeground(pal) {
    // frame + bars
    const [x0, y0, x1, y1] = WIN;
    rect(x0 - 2, y0 - 2, x1 - x0 + 4, 2, pal.frame);
    rect(x0 - 2, y1, x1 - x0 + 4, 2, pal.frame);
    rect(x0 - 2, y0, 2, y1 - y0, pal.frame);
    rect(x1, y0, 2, y1 - y0, pal.frame);
    rect(Math.floor((x0 + x1) / 2), y0, 1, y1 - y0, pal.frame);
    rect(x0, Math.floor((y0 + y1) / 2), x1 - x0, 1, pal.frame);
    // curtains
    for (const [cx, dir] of [[x0 - 6, 1], [x1 - 2, -1]]) {
      for (let y = 0; y < 34; y++) {
        const w = 8 - Math.round(Math.sin((y / 34) * Math.PI) * 3);
        for (let i = 0; i < w; i++) {
          const x = dir > 0 ? cx + i : cx + 8 - i;
          px(x, y, i % 3 === 1 ? pal.curtainDark : pal.curtain);
        }
      }
    }
    // sill / table
    rect(0, 36, W, 1, pal.sillHi);
    rect(0, 37, W, 9, pal.sill);
    rect(0, 46, W, 2, pal.sillDark);
    for (let x = 0; x < W; x += 13) rect(x, 40 + (x % 3), 6, 1, pal.sillDark);
    // books on the left
    rect(8, 33, 16, 3, pal.book1);
    rect(10, 30, 13, 3, pal.book2);
    rect(9, 27, 12, 3, pal.book3);
    for (const y of [34, 31, 28]) rect(11, y, 9, 1, '#f1e6d2');
    // mug on the right
    rect(108, 30, 6, 6, pal.mug);
    rect(114, 31, 2, 1, pal.mug); rect(115, 32, 1, 2, pal.mug); rect(114, 34, 2, 1, pal.mug);
    rect(109, 30, 4, 1, '#6b4a33');
    // pot
    rect(56, 26, 17, 2, pal.potRim);
    rect(57, 26, 15, 1, pal.soil);
    for (let y = 28; y < 36; y++) {
      const inset = Math.floor((y - 28) / 3);
      rect(57 + inset, y, 15 - inset * 2, 1, pal.pot);
      rect(57 + inset + 12 - inset * 2, y, 3, 1, pal.potDark);
    }
  }
  const LEAF = [[1, 0], [2, -1], [3, -1], [2, 0], [4, -2], [3, -2]];
  function plant(pal, t, height, bloom) {
    const baseX = 64, baseY = 25;
    const sway = (k) => Math.round(Math.sin(t * 1.4 + k * 0.12) * (k / 22) * 1.4);
    for (let k = 0; k <= height; k++) px(baseX + sway(k), baseY - k, pal.stem);
    [4, 8, 11, 14, 17].forEach((k, i) => {
      if (height < k + 1) return;
      const n = Math.min(LEAF.length, Math.ceil(((height - k) / 3) * LEAF.length / 2));
      const side = i % 2 ? -1 : 1;
      const lx = baseX + sway(k), ly = baseY - k;
      for (let j = 0; j < n; j++) px(lx + LEAF[j][0] * side, ly + LEAF[j][1], j > 3 ? pal.leafDark : pal.leaf);
    });
    if (bloom > 0) {
      const fx = baseX + sway(height), fy = baseY - height - 1;
      if (bloom < 0.5) { px(fx, fy, pal.leafDark); px(fx, fy - 1, pal.petal); return; }
      const petals = bloom < 0.85 ? [[0, -1], [-1, 0], [1, 0]] : [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -2], [-2, 0], [2, 0]];
      for (const [dx, dy] of petals) px(fx + dx, fy - 1 + dy, pal.petal);
      px(fx, fy - 1, pal.petalCore);
    }
  }
  function scenePlant(s, pal) {
    ctx.drawImage(layer(`room-bg-${s.theme}`, () => roomBackground(pal)), 0, 0);
    const clip = WIN;
    if (pal.night) {
      for (let i = 0; i < 12; i++) {
        const x = WIN[0] + 1 + Math.floor(hash(i, 1, 4) * (WIN[2] - WIN[0] - 2));
        const y = WIN[1] + 1 + Math.floor(hash(i, 2, 4) * 18);
        px(x, y, pal.star, 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.t * (0.8 + hash(i, 3)) + i)));
      }
    } else {
      cloud(pal, WIN[0] + ((s.t * 1.5) % 90) - 12, 8, clip);
      cloud(pal, WIN[0] + ((s.t * 0.9 + 45) % 90) - 12, 17, clip);
    }
    sunOrMoon(pal, 84, 10, s.t);
    ctx.drawImage(layer(`room-fg-${s.theme}`, () => roomForeground(pal)), 0, 0);

    // mug steam
    for (let i = 0; i < 2; i++) {
      const ph = (s.t * 0.3 + i / 2) % 1;
      px(110 + i * 2 + Math.sin(s.t * 2 + i * 3) * 1, 28 - ph * 9, pal.steam, 0.5 * (1 - ph));
    }

    if (s.mode === 'break') {
      plant(pal, s.t, 20, 1);
      // watering can that tilts and pours every few seconds
      const cyc = (s.t % 4) / 4;
      const pouring = cyc > 0.25 && cyc < 0.75;
      const cx = 36, cy = 12 + (pouring ? 1 : 0);
      rect(cx, cy, 10, 7, pal.can);
      rect(cx + 7, cy, 3, 7, pal.canDark);
      line(cx + 1, cy - 1, cx + 6, cy - 1, pal.canDark); // handle
      line(cx + 1, cy - 1, cx, cy + 2, pal.canDark);
      const sx = cx + 16, sy = pouring ? cy + 6 : cy + 1;
      line(cx + 10, cy + 3, sx, sy, pal.can);
      if (pouring) {
        for (let i = 0; i < 6; i++) {
          const d = (s.t * 1.6 + i / 6) % 1;
          px(lerp(sx + 1, 60, d), sy + 1 + d * (24 - sy) + d * d * 3, pal.water);
        }
      }
      return;
    }
    const height = Math.round(1 + s.progress * 19);
    const bloom = clamp01((s.progress - 0.82) / 0.16);
    plant(pal, s.running ? s.t : s.t * 0.4, height, bloom);
  }

  // ---------- scene: mountain ----------
  // An original little climber walks up a snowy ridge toward the summit flag.
  const MTN = {
    dark: {
      sky: ['#0d0e24', '#141537', '#1c1c47', '#282654'], far: '#1f2048', farSnow: '#3a3d6e',
      rock: '#33335e', rockDark: '#2a2a50', snow: '#dfe5f7', snowShade: '#9fa8cf', flake: '#e8ecff', aurora: '#6fd3a8',
    },
    light: {
      sky: ['#a9c7e3', '#c7d8ea', '#e7dfe2', '#f5d3c4'], far: '#9cb0cc', farSnow: '#e6ecf5',
      rock: '#7a86a6', rockDark: '#6a7595', snow: '#ffffff', snowShade: '#cdd7e8', flake: '#ffffff', aurora: null,
    },
  };
  const CLIMB = { p: '#f1e6d2', h: '#3f8f6b', s: '#e3ac82', e: '#2b1d16', j: '#e0893a', b: '#7a5236', n: '#3c4466', k: '#2b2230' };
  const CLIMBER = [
    '..p....',
    '.hhh...',
    '.hhhh..',
    '.sses..',
    'bjjjj..',
    'bjjjjs.',
    'bjjj...',
    '.nnn...',
  ];
  const LEGS = [['.n.n...', 'kk.kk..'], ['..nn...', '.kkk...']];
  const CLIMBER_SIT = [
    '..p....',
    '.hhh...',
    '.hhhh..',
    '.sses..',
    'bjjjj..',
    'bjjjjs.',
    'bnnnnn.',
    '.nnnkk.',
  ];
  // The slope climbs to a small flat summit (TOP_L..TOP_R), then drops away.
  const TOP_L = 84, TOP_R = 120, PEAK = 86, FLAG = '#e86a9a';
  function slope(x) {
    const r = x / 114;
    return 45 - Math.pow(r, 1.15) * 37 + Math.sin(x * 0.35) * 0.8 * (1 - r) + Math.sin(x * 0.11 + 2) * 1.4 * (1 - r * 0.6);
  }
  function ridge(x) {
    if (x <= TOP_L) return slope(x);
    const top = Math.round(slope(TOP_L));
    if (x <= TOP_R) return top;
    return top + (x - TOP_R) * 1.6;
  }
  const ry = (x) => Math.round(ridge(x));
  function mountainBackground(theme) {
    const m = MTN[theme];
    sky({ sky: m.sky }, 0, 0, W, H);
    // far range
    for (let x = 0; x < W; x++) {
      const y = Math.round(25 + Math.sin(x * 0.09) * 4 + Math.sin(x * 0.23 + 1) * 2 - Math.abs(Math.sin(x * 0.045 + 0.5)) * 6);
      for (let yy = y; yy < H; yy++) px(x, yy, yy < y + 2 && y < 22 ? m.farSnow : m.far);
    }
    // main ridge: rock with a snow blanket that gets deeper toward the top
    for (let x = 0; x < W; x++) {
      const top = ry(x);
      const depth = 2 + (top < 24 ? 3 : top < 34 ? 1 : 0);
      for (let y = top; y < H; y++) {
        let c = hash(x, y, 6) < 0.06 ? m.rockDark : m.rock;
        if (y < top + depth) c = y === top + depth - 1 ? m.snowShade : m.snow;
        else if (hash(x, y, 8) < 0.012) { c = m.snowShade; }
        px(x, y, c);
      }
    }
  }
  function snowfall(m, t, n = 26) {
    for (let i = 0; i < n; i++) {
      const sp = 5 + hash(i, 1, 7) * 6;
      const x = (((hash(i, 2, 7) * W + t * sp * 0.4 + Math.sin(t * 0.8 + i) * 2) % W) + W) % W;
      const y = (hash(i, 3, 7) * H + t * sp) % H;
      px(x, y, m.flake, 0.45 + hash(i, 4, 7) * 0.4);
    }
  }
  function summitFlag(t) {
    const fx = PEAK, fy = ry(PEAK);
    rect(fx, fy - 9, 1, 9, CHAR.k);
    const wave = Math.floor(t * 4) % 2;
    rect(fx + 1, fy - 9, 4, 1, FLAG);
    rect(fx + 1, fy - 8, 5 - wave, 1, FLAG);
    rect(fx + 1, fy - 7, 4 - wave, 1, FLAG);
  }
  function breathPuff(x, y, t, m) {
    const ph = (t % 2.2) / 2.2;
    if (ph > 0.45) return;
    const d = ph / 0.45;
    disk(x + d * 3, y - d * 2, d > 0.5 ? 1 : 0, m.flake, 0.6 * (1 - d));
  }
  function sceneMountain(s) {
    const m = MTN[s.theme] || MTN.dark;
    const night = s.theme !== 'light';
    ctx.drawImage(layer(`mountain-${s.theme}`, () => mountainBackground(s.theme)), 0, 0);
    if (night) {
      stars({ night: true, star: '#e8ecff' }, s.t, 0, 0, W, 20, 20);
      disk(22, 8, 3, '#f3e3b5');
      disk(23, 7, 2, m.sky[0]);
    } else {
      disk(24, 10, 6, '#f6c86b', 0.15); disk(24, 10, 4, '#f6c86b');
    }
    summitFlag(s.t);

    if (s.mode === 'break') {
      // aurora over a cosy camp on a ledge
      if (m.aurora) {
        for (let x = 0; x < W; x++) {
          const y = 6 + Math.sin(x * 0.07 + s.t * 0.5) * 3 + Math.sin(x * 0.19 - s.t * 0.3) * 1.5;
          const a = 0.12 + 0.1 * Math.sin(x * 0.05 + s.t);
          for (let k = 0; k < 5; k++) px(x, y + k, m.aurora, a * (1 - k / 5));
        }
      }
      // camp on the summit: tent, the climber resting, a small fire
      const ly = ry(PEAK);
      const tx = 93;
      for (let i = 0; i < 8; i++) rect(tx + 7 - i, ly - 8 + i, 1 + i * 2, 1, i % 3 === 2 ? '#c75a86' : FLAG);
      rect(tx + 6, ly - 3, 3, 3, '#3a2a40');
      px(tx + 7, ly - 9, CHAR.k);
      sprite(CLIMBER_SIT, CLIMB, 108, ly - CLIMBER_SIT.length, { bobRows: 6, bob: Math.sin(s.t * 1.5) > 0.4 ? 1 : 0 });
      glow(117, ly - 3, 8, '#f4b860', Math.sin(s.t * 6) * 0.8);
      for (const dx of [-3, -1, 1, 3]) px(117 + dx, ly, m.rock);
      fire(117, ly - 1, 6, s.t, 2);
      snowfall(m, s.t, 16);
      return;
    }

    const cx = Math.round(lerp(4, PEAK - 6, s.progress));
    // footprints behind the climber show how far you've come
    for (let x = 2; x < cx; x += 3) px(x, ry(x + 0.5), m.snowShade);
    const foot = ry(cx + 2); // feet sink one pixel into the snow
    const step = s.running ? Math.floor(s.t / 0.3) % 2 : 0;
    const bob = s.running && step ? -1 : 0;
    const top = foot - 9 + bob;
    sprite(CLIMBER, CLIMB, cx, top);
    sprite(LEGS[step], CLIMB, cx, top + CLIMBER.length);
    // trekking pole
    line(cx + 5, top + 5, cx + 7 + (step ? 1 : 0), ry(cx + 7 + (step ? 1 : 0)) - 1, '#9aa3b5');
    breathPuff(cx + 6, top + 3, s.t, m);
    snowfall(m, s.t);
  }

  // ---------- public ----------
  const SCENES = { miner: sceneMiner, campfire: sceneCampfire, plant: scenePlant, mountain: sceneMountain };
  function render(target, state) {
    ctx = target;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    const pal = THEMES[state.theme] || THEMES.dark;
    (SCENES[state.scene] || sceneMiner)({ ...state, t: state.time }, pal);
  }
  return { render, list: Object.keys(SCENES) };
})();
