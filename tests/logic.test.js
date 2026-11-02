// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
require('../js/drills.js');
require('../js/generator.js');
require('../js/store.js');
const CT = globalThis.CT;

test('allocateMinutes always sums to the duration in 5-minute blocks', () => {
  for (let d = 30; d <= 150; d += 5) {
    const m = CT.generator.allocateMinutes(d);
    assert.strictEqual(m.reduce((a, b) => a + b, 0), d, `duration ${d}`);
    m.forEach((x) => { assert.ok(x >= 5 && x % 5 === 0, `block ${x} for ${d}`); });
  }
});

test('generatePlan is deterministic for a seed and covers every phase', () => {
  const a = CT.generator.generatePlan({ theme: 'pressing', ageGroup: 'U13', duration: 75, players: 14, seed: 42 });
  const b = CT.generator.generatePlan({ theme: 'pressing', ageGroup: 'U13', duration: 75, players: 14, seed: 42 });
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(a.blocks.map((x) => x.phase), CT.PHASES.map((p) => p.id));
  assert.strictEqual(a.blocks.reduce((s, x) => s + x.minutes, 0), 75);
});

test('generatePlan respects age and player constraints when it can', () => {
  for (const theme of CT.THEMES.map((t) => t.id)) {
    for (let seed = 0; seed < 20; seed++) {
      const plan = CT.generator.generatePlan({ theme, ageGroup: 'U13', duration: 60, players: 16, seed });
      plan.blocks.forEach((b) => {
        const d = CT.DRILLS.find((x) => x.id === b.drillId);
        assert.ok(d.minAge <= 13 && d.minPlayers <= 16, `${d.name} for ${theme}`);
        assert.ok(d.themes.includes(theme) || d.themes.includes('general'), `${d.name} off-theme for ${theme}`);
      });
    }
  }
});

test('generatePlan warns instead of failing for tiny squads', () => {
  const plan = CT.generator.generatePlan({ theme: 'build', ageGroup: 'U7', duration: 45, players: 3, seed: 1 });
  assert.strictEqual(plan.blocks.length, CT.PHASES.length);
  assert.ok(plan.warnings.length > 0);
});

test('rerollBlock changes only the chosen block', () => {
  const plan = CT.generator.generatePlan({ theme: 'possession', ageGroup: 'U15', duration: 90, players: 16, seed: 3 });
  const next = CT.generator.rerollBlock(plan, 2, 99);
  assert.notStrictEqual(next.blocks[2].drillId, plan.blocks[2].drillId);
  [0, 1, 3, 4].forEach((i) => assert.strictEqual(next.blocks[i].drillId, plan.blocks[i].drillId));
});

test('attendance rate excludes excused absences and future events', () => {
  const s = CT.store.emptyState();
  s.players = [{ id: 'a', name: 'A', position: 'MID' }];
  const mk = (date, v) => ({ id: date, date, type: 'training', title: 'T', availability: {}, attendance: { a: v } });
  s.events = [mk('2026-01-01', 'present'), mk('2026-01-02', 'late'), mk('2026-01-03', 'absent'), mk('2026-01-04', 'excused'), mk('2099-01-01', 'absent')];
  const r = CT.store.attendanceFor(s, 'a', { today: '2026-06-01' });
  assert.strictEqual(r.counted, 3);
  assert.strictEqual(r.excused, 1);
  assert.ok(Math.abs(r.rate - 2 / 3) < 1e-9);
});

test('development returns per-corner deltas between the last two reviews', () => {
  const s = CT.store.emptyState();
  const sc = (v) => ({ technical: v, physical: v, psychological: v, social: v });
  s.reviews = [
    { id: 1, playerId: 'a', date: '2026-01-01', scores: sc(2) },
    { id: 3, playerId: 'a', date: '2026-03-01', scores: sc(3.5) },
    { id: 2, playerId: 'a', date: '2026-02-01', scores: sc(3) },
  ];
  const d = CT.store.development(s, 'a');
  assert.strictEqual(d.latest.id, 3);
  assert.strictEqual(d.delta.technical, 0.5);
  assert.strictEqual(d.overallDelta, 0.5);
});

test('demo data is internally consistent', () => {
  const s = CT.store.demoState('2026-11-02');
  assert.strictEqual(s.players.length, 16);
  assert.strictEqual(s.reviews.length, 48);
  s.reviews.forEach((r) => CT.CORNERS.forEach((c) => assert.ok(r.scores[c.id] >= 1 && r.scores[c.id] <= 5)));
  assert.ok(s.events.some((e) => e.date >= '2026-11-02'), 'has upcoming sessions');
});
