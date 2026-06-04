/* ============================================================
   COPA DRAFT — lib/rng.js
   Tiny seeded PRNG (mulberry32) so the pure engine is
   reproducible: same squads + config + seed => same match log.
   ============================================================ */
(function () {
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Build an RNG object with convenience helpers around a float stream.
  function makeRng(seed) {
    const next = mulberry32(seed);
    const r = {
      next,                                   // [0,1)
      range: (min, max) => min + next() * (max - min),
      int: (min, max) => Math.floor(min + next() * (max - min + 1)),
      chance: (p) => next() < p,              // bernoulli
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      // weighted pick: items [{item, w}] -> item
      weighted: (items) => {
        const total = items.reduce((s, x) => s + x.w, 0);
        let t = next() * total;
        for (const x of items) { t -= x.w; if (t <= 0) return x.item; }
        return items[items.length - 1].item;
      },
    };
    return r;
  }

  // deterministic-ish seed from any string (for "draw" reproducibility)
  function seedFrom(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  window.RNG = { makeRng, seedFrom };
})();
