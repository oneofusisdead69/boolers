// Storm the Keep: the level generator. Each level is made from a seed, so every screen (the server,
// the TV, the art sheet) builds the same level from the same number and only the seed has to travel.
//
// A level is a grid of tiles, `w` columns by `h` rows, row 0 at the top. Four zones, from the siege
// lines outside the walls in to the keep itself; each has its own ground, pits and buildings. The
// hero spawn is flat, then the ground walks up and down (never more than 2 tiles at a step, so every
// rise can be jumped), with pits no wider than 3. The level ends in a flat boss arena behind a
// raised portcullis. Everything solid can be smashed except BEDROCK (the floor under the ground, the
// two end walls and the arena floor), so heroes can dig through walls but never fall out of the world.
//
// Plain JS with no Node APIs: it runs in the browser too (as window.SiegeLevels).
(function (root) {
  const T = {
    EMPTY: 0,
    GROUND: 1, // earth (zones 1–2) or stone (zones 3–4); its top row is drawn as grass, cobbles…
    BRICK: 2, // castle masonry
    PLANK: 3, // a wooden platform: jump up through it, stand on it, drop down through it
    CRATE: 4,
    LADDER: 5,
    SPIKES: 6,
    WATER: 7, // the moat
    CAGE: 8, // a prisoner: break it open for a life back
    HAY: 9,
    TIMBER: 10, // palisades and house walls
    MERLON: 11, // battlements
    CARPET: 12, // the keep's floating floors (one-way, like planks)
    PILLAR: 13,
    GATE: 14, // the portcullis in front of the boss arena (drawn raised)
    BEDROCK: 15,
  };
  // Tiles you stand on but can jump up through.
  const ONE_WAY = new Set([T.PLANK, T.CARPET]);
  // Tiles that stop you.
  const SOLID = new Set([T.GROUND, T.BRICK, T.CRATE, T.CAGE, T.HAY, T.TIMBER, T.MERLON, T.PILLAR, T.BEDROCK]);
  // Tiles a hit can break, and how many hits they take.
  const TOUGH = { [T.GROUND]: 3, [T.BRICK]: 4, [T.PLANK]: 1, [T.CRATE]: 1, [T.CAGE]: 2, [T.HAY]: 1, [T.TIMBER]: 2, [T.MERLON]: 3, [T.CARPET]: 1, [T.PILLAR]: 5 };

  const ZONES = [
    { id: 'siegeLines', name: 'The Siege Lines', ground: T.GROUND, pit: T.WATER, enemies: ['footman', 'archer'], boss: 'gatekeeper', ceiling: false },
    { id: 'bailey', name: 'The Outer Bailey', ground: T.GROUND, pit: T.SPIKES, enemies: ['hound', 'crossbow'], boss: 'marshal', ceiling: false },
    { id: 'ramparts', name: 'The Ramparts', ground: T.BRICK, pit: T.SPIKES, enemies: ['shield', 'oiler'], boss: 'gargoyle', ceiling: false },
    { id: 'keep', name: 'The Keep', ground: T.BRICK, pit: T.SPIKES, enemies: ['guard', 'mage'], boss: 'king', ceiling: true },
  ];

  const H = 14;
  const ARENA = 26;
  const START = 10;

  // mulberry32: a small seeded random number generator, the same on every screen.
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)); // lo..hi inclusive
    next.chance = (p) => next() < p;
    next.pick = (list) => list[Math.floor(next() * list.length)];
    return next;
  }

  function generate(zoneIndex, seed) {
    const zone = ZONES[zoneIndex];
    const r = rng((seed * 4 + zoneIndex + 1) >>> 0);
    const w = 150 + zoneIndex * 12;
    const tiles = new Uint8Array(w * H);
    const at = (x, y) => (x < 0 || x >= w || y < 0 || y >= H ? T.BEDROCK : tiles[y * w + x]);
    const set = (x, y, t) => { if (x >= 0 && x < w && y >= 0 && y < H) tiles[y * w + x] = t; };
    const heights = new Array(w).fill(0); // solid rows from the bottom, per column (0 = a pit)
    const decor = []; // { x, y, kind }: torches, banners, tents… (drawn, never solid)
    const spawns = []; // { x, y, kind }: enemies, standing on the tile above (x, y)
    const cages = [];
    const top = zoneIndex === 3 ? 2 : 0; // the keep has a ceiling two rows deep

    // ---- The ground ----
    const column = (x, g) => {
      heights[x] = g;
      for (let y = H - g; y < H; y++) set(x, y, y === H - 1 ? T.BEDROCK : zone.ground);
    };
    let x = 0;
    let g = 3;
    for (; x < START; x++) column(x, g);
    const end = w - ARENA;
    const segments = []; // [from, to, g]: flat stretches, for buildings and enemies
    let pitBefore = false;
    while (x < end) {
      if (!pitBefore && x > START + 4 && r.chance(0.16) && x + 4 < end) {
        pitBefore = true;
        const width = r.int(2, 3);
        for (let i = 0; i < width; i++, x++) {
          heights[x] = 0;
          set(x, H - 1, zone.pit);
          if (zone.pit === T.WATER) set(x, H - 2, T.WATER);
        }
        continue;
      }
      pitBefore = false;
      g = Math.max(2, Math.min(7, g + r.int(-2, 2)));
      const len = Math.min(end - x, r.int(4, 9));
      segments.push([x, x + len, g]);
      for (let i = 0; i < len; i++, x++) column(x, g);
    }
    // The arena: flat and unbreakable underfoot.
    const arenaG = 3;
    for (; x < w; x++) {
      heights[x] = arenaG;
      for (let y = H - arenaG; y < H; y++) set(x, y, T.BEDROCK);
    }
    // A step up or down into the arena is at most two tiles, like everywhere else.
    const lastG = heights[end - 1] || arenaG;
    if (Math.abs(lastG - arenaG) > 2) {
      for (let i = end - 3; i < end; i++) column(i, arenaG + Math.sign(lastG - arenaG) * 2);
    }

    const surface = (cx) => H - heights[cx]; // the first solid row of a column
    const free = (cx, cy) => at(cx, cy) === T.EMPTY;

    // ---- Buildings, one zone at a time ----
    const crates = (cx, s) => {
      const n = r.int(1, 3);
      for (let i = 0; i < n; i++) set(cx + i, s - 1, r.chance(0.3) && zoneIndex === 1 ? T.HAY : T.CRATE);
      if (n === 3 && r.chance(0.6)) set(cx + 1, s - 2, T.CRATE);
    };
    for (const [a, b, sg] of segments) {
      const len = b - a;
      const s = H - sg;
      if (len < 5 || a < START + 3) continue;
      const roll = r();
      if (zoneIndex === 0) {
        if (roll < 0.35 && len >= 6) {
          // A palisade: two logs thick, a ladder on our side.
          const px = a + r.int(2, len - 3);
          const ht = r.int(3, 4);
          for (let y = s - ht; y < s; y++) { set(px, y, T.TIMBER); set(px + 1, y, T.TIMBER); set(px - 1, y, T.LADDER); }
          set(px - 1, s - ht - 1, T.LADDER);
        } else if (roll < 0.65) {
          crates(a + r.int(1, len - 4), s);
        } else if (len >= 7) {
          decor.push({ x: a + 2, y: s - 1, kind: 'tent' });
        }
      } else if (zoneIndex === 1) {
        if (roll < 0.5 && len >= 8) {
          // A timber house: walls with a doorway at the bottom, a roof to stand on, hay inside.
          const hw = Math.min(len - 1, r.int(6, 8));
          const hx = a + Math.floor((len - hw) / 2);
          for (let y = s - 4; y < s - 2; y++) { set(hx, y, T.TIMBER); set(hx + hw - 1, y, T.TIMBER); }
          for (let i = hx; i < hx + hw; i++) set(i, s - 5, T.TIMBER);
          set(hx + 2, s - 1, T.HAY);
          if (r.chance(0.5)) set(hx + 3, s - 1, T.HAY);
          decor.push({ x: hx, y: s - 5, kind: 'house', w: hw });
        } else if (roll < 0.8) {
          crates(a + r.int(1, len - 4), s);
        } else {
          decor.push({ x: a + 1, y: s - 1, kind: 'well' });
        }
      } else if (zoneIndex === 2) {
        if (roll < 0.45 && len >= 6) {
          // A tower: three wide, a ladder up the side, battlements on top, a torch.
          const tx = a + r.int(2, len - 4);
          const ht = r.int(4, 6);
          for (let y = s - ht; y < s; y++) for (let i = 0; i < 3; i++) set(tx + i, y, T.BRICK);
          for (let y = s - ht - 1; y < s; y++) set(tx - 1, y, T.LADDER);
          set(tx, s - ht - 1, T.MERLON);
          set(tx + 2, s - ht - 1, T.MERLON);
          decor.push({ x: tx + 1, y: s - 2, kind: 'slit' });
          decor.push({ x: tx - 2, y: s - 3, kind: 'torch' });
        } else {
          // Battlements along the wall walk.
          for (let i = a + 1; i < b - 1; i += 2) set(i, s - 1, T.MERLON);
          decor.push({ x: a + 2, y: s - 3, kind: 'torch' });
        }
      } else {
        if (roll < 0.4 && len >= 6) {
          // A pillar down from the ceiling, ending in an arch you walk under.
          const cx = a + r.int(2, len - 3);
          for (let y = top; y < s - 4; y++) set(cx, y, T.PILLAR);
          decor.push({ x: cx, y: s - 4, kind: 'arch' });
          decor.push({ x: cx - 1, y: s - 4, kind: 'banner' });
          decor.push({ x: cx + 1, y: s - 4, kind: 'banner' });
        } else if (roll < 0.7) {
          decor.push({ x: a + Math.floor(len / 2), y: top, kind: 'chandelier' });
          decor.push({ x: a + 1, y: s - 5, kind: 'window' });
        } else {
          crates(a + r.int(1, len - 4), s);
        }
      }
      // A floating platform above, now and then.
      if (len >= 6 && r.chance(zoneIndex === 3 ? 0.6 : 0.35)) {
        const py = s - r.int(3, 4);
        const pw = r.int(3, 5);
        const px = a + r.int(0, Math.max(0, len - pw));
        if (py > top + 1) for (let i = px; i < px + pw; i++) if (free(i, py)) set(i, py, zoneIndex === 3 ? T.CARPET : T.PLANK);
      }
    }

    // The keep's ceiling.
    if (zone.ceiling) for (let i = 0; i < w; i++) for (let y = 0; y < top; y++) set(i, y, y === 0 ? T.BEDROCK : T.BRICK);
    // The end walls.
    for (let y = 0; y < H; y++) { set(0, y, T.BEDROCK); set(w - 1, y, T.BEDROCK); }

    // ---- Enemies and cages, on anything you can stand on, away from the spawn ----
    const standing = [];
    for (let cx = START + 4; cx < end; cx++) {
      for (let cy = top + 1; cy < H; cy++) {
        const t = at(cx, cy);
        if ((SOLID.has(t) || ONE_WAY.has(t)) && free(cx, cy - 1) && free(cx, cy - 2) && t !== T.CAGE) { standing.push([cx, cy]); break; }
      }
    }
    const want = 14 + zoneIndex * 4;
    let lastX = -10;
    for (const [cx, cy] of standing) {
      if (spawns.length >= want) break;
      if (cx - lastX < 4 || !r.chance(0.45)) continue;
      spawns.push({ x: cx, y: cy - 1, kind: r.chance(0.6) ? zone.enemies[0] : zone.enemies[1] });
      lastX = cx;
    }
    const cageCount = r.int(1, 3);
    for (let i = 0; i < cageCount; i++) {
      const [cx, cy] = standing[Math.floor(((i + 0.5 + r() * 0.4) / cageCount) * standing.length)] || [];
      if (cx == null || !free(cx, cy - 1)) continue;
      set(cx, cy - 1, T.CAGE);
      cages.push({ x: cx, y: cy - 1 });
    }

    // ---- The boss arena ----
    const gateX = end + 1;
    for (let y = top; y < H - arenaG; y++) if (y < H - arenaG - 4) set(gateX, y, T.GATE);
    decor.push({ x: gateX, y: H - arenaG - 4, kind: 'gate' });
    decor.push({ x: w - 3, y: H - arenaG - 1, kind: 'flag' });
    if (zoneIndex >= 2) { decor.push({ x: end + 6, y: H - arenaG - 4, kind: 'torch' }); decor.push({ x: w - 7, y: H - arenaG - 4, kind: 'torch' }); }
    if (zoneIndex === 3) decor.push({ x: w - 12, y: H - arenaG - 1, kind: 'throne' });

    return {
      zone: zoneIndex, seed, w, h: H, tiles, heights, decor, spawns, cages,
      start: { x: 3, y: H - heights[3] - 1 },
      boss: { x: end + Math.floor(ARENA / 2) + 2, y: H - arenaG - 1, kind: zone.boss },
      arena: { from: end, to: w },
      at,
    };
  }

  const api = { T, ONE_WAY, SOLID, TOUGH, ZONES, H, generate, rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SiegeLevels = api;
})(typeof window !== 'undefined' ? window : this);
