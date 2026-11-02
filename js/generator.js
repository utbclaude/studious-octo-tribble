/* Session-plan generator. Pure logic with no DOM access, so it can be unit-tested. */
(function (CT) {
  // Small deterministic PRNG (mulberry32) so a plan can be regenerated from its seed.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function ageOf(ageGroupId) {
    const g = CT.AGE_GROUPS.find((x) => x.id === ageGroupId);
    return g ? g.age : 21;
  }

  /** Split the duration across phases in 5-minute blocks, summing exactly to the total. */
  function allocateMinutes(duration) {
    const raw = CT.PHASES.map((p) => Math.max(5, Math.round((duration * p.share) / 5) * 5));
    let diff = duration - raw.reduce((a, b) => a + b, 0);
    // Absorb rounding error in the game block first, then in technical/opposed.
    const order = [3, 2, 1, 0, 4];
    let i = 0;
    while (diff !== 0 && i < 50) {
      const idx = order[i % order.length];
      const step = diff > 0 ? 5 : -5;
      if (raw[idx] + step >= 5) {
        raw[idx] += step;
        diff -= step;
      }
      i++;
    }
    return raw;
  }

  /** Candidate drills for a phase, best match first (theme-specific before general). */
  function candidates(phase, theme, age, players) {
    const inPhase = CT.DRILLS.filter((d) => d.phase === phase);
    const fits = (d) => d.minAge <= age && d.minPlayers <= players;
    const specific = inPhase.filter((d) => d.themes.includes(theme) && fits(d));
    if (specific.length) return { list: specific, compromise: null };
    const general = inPhase.filter((d) => d.themes.includes('general') && fits(d));
    if (general.length) return { list: general, compromise: null };
    const anyAge = inPhase.filter((d) => d.themes.includes(theme) || d.themes.includes('general'));
    if (anyAge.length) return { list: anyAge, compromise: 'needs more players or an older group than you have' };
    return { list: inPhase, compromise: 'no exact match for this theme' };
  }

  function pick(list, rand, exclude) {
    const pool = list.filter((d) => !exclude || d.id !== exclude);
    const from = pool.length ? pool : list;
    return from[Math.floor(rand() * from.length)];
  }

  /**
   * @param {{theme:string, ageGroup:string, duration:number, players:number, seed?:number}} opts
   */
  function generatePlan(opts) {
    const duration = Math.max(30, Math.min(150, Math.round((opts.duration || 60) / 5) * 5));
    const players = Math.max(1, opts.players || 12);
    const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9);
    const rand = rng(seed);
    const age = ageOf(opts.ageGroup);
    const minutes = allocateMinutes(duration);
    const warnings = [];
    let clock = 0;

    const blocks = CT.PHASES.map((phase, i) => {
      const { list, compromise } = candidates(phase.id, opts.theme, age, players);
      const drill = pick(list, rand);
      if (compromise) warnings.push(`${phase.label}: "${drill.name}" ${compromise}.`);
      const block = { phase: phase.id, label: phase.label, start: clock, minutes: minutes[i], drillId: drill.id };
      clock += minutes[i];
      return block;
    });

    if (age <= 9 && duration > 75) warnings.push('Sessions over 75 minutes are long for this age group. Consider more drinks breaks.');
    if (players < 8) warnings.push('With fewer than 8 players, small-sided games work best as 3v3 or 4v4 with the coach as a neutral.');

    return {
      theme: opts.theme,
      ageGroup: opts.ageGroup,
      duration,
      players,
      seed,
      blocks,
      warnings,
      format: (CT.AGE_GROUPS.find((g) => g.id === opts.ageGroup) || {}).format || '',
    };
  }

  /** Swap one block's drill for a different candidate. */
  function rerollBlock(plan, index, seed) {
    const block = plan.blocks[index];
    const { list } = candidates(block.phase, plan.theme, ageOf(plan.ageGroup), plan.players);
    const drill = pick(list, rng(seed != null ? seed : Date.now()), block.drillId);
    const blocks = plan.blocks.slice();
    blocks[index] = Object.assign({}, block, { drillId: drill.id });
    return Object.assign({}, plan, { blocks });
  }

  CT.generator = { generatePlan, rerollBlock, allocateMinutes, candidates, rng };
})(typeof window !== 'undefined' ? (window.CT = window.CT || {}) : (globalThis.CT = globalThis.CT || {}));
