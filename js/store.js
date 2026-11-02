/* Data model, persistence, demo data and derived metrics. */
(function (CT) {
  const KEY = 'coachkit.v1';

  // The FA Four Corner Model, the usual framework for youth player-development reviews in England.
  CT.CORNERS = [
    { id: 'technical', label: 'Technical / Tactical', short: 'Tech/Tac' },
    { id: 'physical', label: 'Physical', short: 'Physical' },
    { id: 'psychological', label: 'Psychological', short: 'Psych' },
    { id: 'social', label: 'Social', short: 'Social' },
  ];
  CT.POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
  CT.AVAILABILITY = ['available', 'unavailable', 'injured'];
  CT.ATTENDANCE = ['present', 'late', 'absent', 'excused'];

  const uid = () => Math.random().toString(36).slice(2, 10);
  CT.uid = uid;

  // ---------- dates ----------
  const iso = (d) => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  };
  CT.iso = iso;
  CT.today = () => iso(new Date());
  CT.addDays = (isoDate, n) => {
    const d = new Date(isoDate + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return iso(d);
  };

  function emptyState() {
    return { version: 1, team: { name: 'My Team', ageGroup: 'U13' }, players: [], events: [], reviews: [], plans: [] };
  }

  // ---------- demo data ----------
  function demoState(todayIso) {
    const today = todayIso || CT.today();
    const rand = (CT.generator ? CT.generator.rng : (s) => () => ((s = (s * 9301 + 49297) % 233280) / 233280))(20261102);
    const names = [
      ['Alfie Barnes', 'GK'], ['Noah Okafor', 'DEF'], ['Leo Whitfield', 'DEF'], ['Mason Clarke', 'DEF'],
      ['Ethan Patel', 'DEF'], ['Oscar Hughes', 'MID'], ['Jayden Mensah', 'MID'], ['Harry Doyle', 'MID'],
      ['Archie Lowe', 'MID'], ['Isaac Romero', 'MID'], ['Freddie Shaw', 'FWD'], ['Kai Thompson', 'FWD'],
      ['Reuben Ali', 'FWD'], ['Theo Brennan', 'DEF'], ['Louis Kowalski', 'GK'], ['Ollie Grant', 'FWD'],
    ];
    const players = names.map(([name, position], i) => ({ id: 'p' + (i + 1), name, position, shirt: i + 1, notes: '' }));
    // Each player gets a reliability (attendance probability) and a growth trend per corner.
    const profile = {};
    players.forEach((p, i) => {
      profile[p.id] = {
        reliability: 0.62 + rand() * 0.36,
        base: CT.CORNERS.map(() => 2 + Math.round(rand() * 4) / 2),
        growth: CT.CORNERS.map(() => -0.25 + rand() * 0.75),
      };
    });
    // Make a couple of storylines obvious in the demo.
    profile.p7.reliability = 0.97; profile.p7.growth = [0.6, 0.4, 0.5, 0.3];
    profile.p12.reliability = 0.55; profile.p12.growth = [-0.2, 0, -0.4, -0.3];

    // 12 weeks of history: Tuesday and Thursday training plus a Saturday match. Plus next week, unrecorded.
    const events = [];
    const start = CT.addDays(today, -7 * 12);
    const startDow = new Date(start + 'T12:00:00').getDay();
    const firstMonday = CT.addDays(start, (8 - startDow) % 7);
    for (let w = 0; w < 13; w++) {
      [[1, 'training', 'Training'], [3, 'training', 'Training'], [5, 'match', 'League match']].forEach(([off, type, title]) => {
        const date = CT.addDays(firstMonday, w * 7 + off);
        const ev = { id: uid(), date, type, title: type === 'match' ? `${title} vs ${['Rovers', 'Athletic', 'United', 'Town', 'Wanderers', 'City'][w % 6]}` : title, availability: {}, attendance: {}, planId: null };
        const past = date < today;
        players.forEach((p) => {
          const r = rand();
          const injured = p.id === 'p4' && w >= 5 && w <= 7;
          if (injured) ev.availability[p.id] = 'injured';
          else if (r > profile[p.id].reliability + 0.08) ev.availability[p.id] = 'unavailable';
          else ev.availability[p.id] = 'available';
          if (past) {
            if (injured) ev.attendance[p.id] = 'excused';
            else if (ev.availability[p.id] === 'unavailable') ev.attendance[p.id] = rand() > 0.5 ? 'excused' : 'absent';
            else ev.attendance[p.id] = rand() > 0.92 ? 'late' : rand() > 0.95 ? 'absent' : 'present';
          }
        });
        if (!past) {
          // Upcoming: some replies not in yet.
          players.forEach((p) => { if (rand() > 0.7) delete ev.availability[p.id]; });
        }
        events.push(ev);
      });
    }

    // Reviews every 6 weeks: three per player.
    const reviews = [];
    const clamp = (v) => Math.max(1, Math.min(5, Math.round(v * 2) / 2));
    const reviewTexts = {
      strengths: ['Excellent first touch under pressure', 'Reads danger early', 'Brave in possession', 'Great communicator', 'Strong in 1v1 duels', 'Works hard off the ball'],
      targets: ['Scan before receiving: check shoulders twice', 'Use the weaker foot in games', 'Stay composed after mistakes', 'Lead the warm-up once a fortnight', 'Improve recovery-run speed', 'Play forward passes when on'],
    };
    [-84, -42, -3].forEach((offset, k) => {
      const date = CT.addDays(today, offset);
      players.forEach((p, i) => {
        const pr = profile[p.id];
        const scores = {};
        CT.CORNERS.forEach((c, ci) => { scores[c.id] = clamp(pr.base[ci] + pr.growth[ci] * k + (rand() - 0.5) * 0.4); });
        reviews.push({
          id: uid(), playerId: p.id, date, scores,
          strengths: reviewTexts.strengths[(i + k) % 6],
          targets: reviewTexts.targets[(i + k * 2) % 6],
          reviewer: 'Head Coach',
        });
      });
    });

    return { version: 1, team: { name: 'Riverside Juniors U13s', ageGroup: 'U13' }, players, events, reviews, plans: [], demo: true };
  }

  // ---------- persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.version === 1) return Object.assign(emptyState(), s);
      }
    } catch (e) { /* storage unavailable: fall through */ }
    return demoState();
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }

  // ---------- metrics ----------
  const pastEvents = (state, today) => state.events.filter((e) => e.date < (today || CT.today()));

  /** Attendance rate = (present + late) / (present + late + absent). Excused absences are not counted against the player. */
  function attendanceFor(state, playerId, opts) {
    const o = opts || {};
    let present = 0, late = 0, absent = 0, excused = 0;
    pastEvents(state, o.today).forEach((e) => {
      if (o.since && e.date < o.since) return;
      if (o.type && e.type !== o.type) return;
      const a = e.attendance[playerId];
      if (a === 'present') present++;
      else if (a === 'late') late++;
      else if (a === 'absent') absent++;
      else if (a === 'excused') excused++;
    });
    const counted = present + late + absent;
    return { present, late, absent, excused, counted, rate: counted ? (present + late) / counted : null };
  }

  /** Squad turnout per past event: share of the squad present or late. */
  function turnoutByEvent(state, opts) {
    const o = opts || {};
    return pastEvents(state, o.today)
      .filter((e) => !o.type || e.type === o.type)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((e) => {
        const vals = Object.values(e.attendance);
        const attended = vals.filter((v) => v === 'present' || v === 'late').length;
        return { id: e.id, date: e.date, type: e.type, title: e.title, attended, squad: state.players.length, rate: state.players.length ? attended / state.players.length : 0 };
      });
  }

  function reviewsFor(state, playerId) {
    return state.reviews.filter((r) => r.playerId === playerId).sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  const avg = (scores) => {
    const v = CT.CORNERS.map((c) => scores[c.id]).filter((x) => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  /** Latest review, previous review and per-corner change for one player. */
  function development(state, playerId) {
    const rs = reviewsFor(state, playerId);
    const latest = rs[rs.length - 1] || null;
    const prev = rs[rs.length - 2] || null;
    const delta = {};
    if (latest && prev) CT.CORNERS.forEach((c) => { delta[c.id] = latest.scores[c.id] - prev.scores[c.id]; });
    return {
      reviews: rs, latest, prev, delta,
      overall: latest ? avg(latest.scores) : null,
      overallDelta: latest && prev ? avg(latest.scores) - avg(prev.scores) : null,
    };
  }

  function nextEvent(state, today) {
    const t = today || CT.today();
    return state.events.filter((e) => e.date >= t).sort((a, b) => (a.date < b.date ? -1 : 1))[0] || null;
  }

  CT.store = { KEY, load, save, emptyState, demoState, attendanceFor, turnoutByEvent, reviewsFor, development, nextEvent, avg };
})(typeof window !== 'undefined' ? (window.CT = window.CT || {}) : (globalThis.CT = globalThis.CT || {}));
