/* UI: tabs, rendering and event handling. */
(function (CT) {
  const S = CT.store;
  const esc = CT.charts.esc;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const pct = (v) => (v == null ? '–' : Math.round(v * 100) + '%');
  const fmt1 = (v) => (v == null ? '–' : v.toFixed(1));
  const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

  let state = S.load();
  const ui = { tab: 'dashboard', sort: { key: 'name', dir: 1 }, eventId: null, eventFilter: 'recent', plan: null, openPlayer: null };
  try { ui.tab = localStorage.getItem('coachkit.tab') || 'dashboard'; } catch (e) { /* ignore */ }

  function commit() {
    if (!S.save(state)) toast('Could not save. Browser storage is unavailable, so use Export to keep a copy.');
    render();
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toast.h);
    toast.h = setTimeout(() => { t.style.display = 'none'; }, 2600);
  }
  const player = (id) => state.players.find((p) => p.id === id);
  const deltaHtml = (d, digits) => {
    if (d == null) return '<span class="delta-flat">–</span>';
    const v = d.toFixed(digits == null ? 1 : digits);
    if (Math.abs(d) < 0.05) return `<span class="delta-flat">± 0</span>`;
    return d > 0 ? `<span class="delta-up">▲ ${v}</span>` : `<span class="delta-down">▼ ${v.replace('-', '')}</span>`;
  };

  // ======================================================================
  // DASHBOARD
  // ======================================================================
  function squadRows() {
    const since = CT.addDays(CT.today(), -56);
    return state.players.map((p) => {
      const dev = S.development(state, p.id);
      const att = S.attendanceFor(state, p.id, { since });
      return { p, dev, att };
    });
  }

  function cycleAverages() {
    // Bucket reviews by month so one review "cycle" is one point on the trend.
    const buckets = {};
    state.reviews.forEach((r) => {
      const k = r.date.slice(0, 7);
      (buckets[k] = buckets[k] || []).push(r);
    });
    const keys = Object.keys(buckets).sort();
    return keys.map((k) => {
      const rs = buckets[k];
      const out = { key: k, date: rs.map((r) => r.date).sort()[0], n: rs.length };
      CT.CORNERS.forEach((c) => {
        const v = rs.map((r) => r.scores[c.id]).filter((x) => typeof x === 'number');
        out[c.id] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
      });
      return out;
    });
  }

  function insights(rows) {
    const out = [];
    const withDelta = rows.filter((r) => r.dev.overallDelta != null && r.att.rate != null);
    const hi = withDelta.filter((r) => r.att.rate >= 0.85);
    const lo = withDelta.filter((r) => r.att.rate < 0.75);
    const mean = (a) => a.reduce((s, r) => s + r.dev.overallDelta, 0) / a.length;
    if (hi.length && lo.length) {
      out.push(`Players attending 85%+ of sessions improved by <b>${mean(hi).toFixed(2)}</b> on average since their last review, compared with <b>${mean(lo).toFixed(2)}</b> for those under 75% (${hi.length} vs ${lo.length} players).`);
    }
    const cyc = cycleAverages();
    if (cyc.length >= 2) {
      const a = cyc[cyc.length - 2], b = cyc[cyc.length - 1];
      const changes = CT.CORNERS.map((c) => ({ c, d: (b[c.id] || 0) - (a[c.id] || 0) })).sort((x, y) => y.d - x.d);
      out.push(`Biggest squad-wide gain this cycle: <b>${esc(changes[0].c.label)}</b> (${changes[0].d >= 0 ? '+' : ''}${changes[0].d.toFixed(2)}). Weakest: <b>${esc(changes[3].c.label)}</b> (${changes[3].d >= 0 ? '+' : ''}${changes[3].d.toFixed(2)}). That points to the focus for the next block of sessions.`);
    }
    const reviewed = rows.filter((r) => r.dev.latest && r.dev.latest.date >= CT.addDays(CT.today(), -42)).length;
    if (rows.length) out.push(`<b>${reviewed} of ${rows.length}</b> players have an individual review from the last six weeks, each with written targets.`);
    return out;
  }

  function watchList(rows) {
    const items = [];
    const next = S.nextEvent(state);
    rows.forEach(({ p, dev, att }) => {
      if (next && next.availability[p.id] === 'injured') items.push({ p, level: 'serious', icon: '✚', text: 'Injured, unavailable for the next session' });
      if (att.rate != null && att.rate < 0.7) items.push({ p, level: 'warning', icon: '!', text: `Attendance ${pct(att.rate)} over the last 8 weeks` });
      if (dev.overallDelta != null && dev.overallDelta <= -0.3) items.push({ p, level: 'critical', icon: '▼', text: `Overall rating down ${Math.abs(dev.overallDelta).toFixed(1)} since last review` });
      if (!dev.latest || dev.latest.date < CT.addDays(CT.today(), -56)) items.push({ p, level: 'warning', icon: '◷', text: dev.latest ? 'Review overdue (more than 8 weeks)' : 'No review yet' });
    });
    return items;
  }

  function heatColor(v) {
    if (v == null) return ['transparent', 'var(--muted)'];
    const i = Math.max(0, Math.min(5, Math.round(((v - 1) / 4) * 5)));
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    // Light ramp runs light->dark (dark text on the pale steps); the dark ramp runs dark->light.
    const ink = dark ? (i <= 4 ? '#f0efec' : '#0b0b0b') : (i >= 3 ? '#ffffff' : '#0b0b0b');
    return [`var(--seq-${i + 1})`, ink];
  }

  function renderDashboard(root) {
    const rows = squadRows();
    const since4 = CT.addDays(CT.today(), -28), since8 = CT.addDays(CT.today(), -56);
    const turn = S.turnoutByEvent(state);
    const recent = turn.filter((t) => t.date >= since4), prior = turn.filter((t) => t.date >= since8 && t.date < since4);
    const avgRate = (a) => (a.length ? a.reduce((s, t) => s + t.rate, 0) / a.length : null);
    const latestOverall = rows.map((r) => r.dev.overall).filter((v) => v != null);
    const prevOverall = rows.map((r) => (r.dev.prev ? S.avg(r.dev.prev.scores) : null)).filter((v) => v != null);
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const next = S.nextEvent(state);
    const nextAvail = next ? state.players.filter((p) => next.availability[p.id] === 'available').length : null;
    const nextNoReply = next ? state.players.filter((p) => !next.availability[p.id]).length : null;
    const watch = watchList(rows);

    // sorting
    const k = ui.sort.key, dir = ui.sort.dir;
    const val = (r) => {
      if (k === 'name') return r.p.name.toLowerCase();
      if (k === 'pos') return CT.POSITIONS.indexOf(r.p.position);
      if (k === 'overall') return r.dev.overall == null ? -1 : r.dev.overall;
      if (k === 'delta') return r.dev.overallDelta == null ? -99 : r.dev.overallDelta;
      if (k === 'att') return r.att.rate == null ? -1 : r.att.rate;
      return r.dev.latest ? r.dev.latest.scores[k] : -1;
    };
    rows.sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0));
    const th = (key, label, cls) => `<th class="${cls || ''}"><button class="ghost small" data-action="sort" data-key="${key}" style="padding:0;font-weight:600;color:inherit;text-transform:inherit;letter-spacing:inherit">${label}${ui.sort.key === key ? (dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;

    root.innerHTML = `
      <div class="section-head">
        <div><h2>Player development dashboard</h2><p class="muted">${esc(state.team.name)} · ${state.players.length} players · data to ${CT.fmtDate(CT.today())}</p></div>
        <div class="spacer"></div>
        <button class="no-print" onclick="window.print()">Print / PDF</button>
      </div>
      ${state.demo ? `<div class="warn no-print">You're looking at <b>demo data</b>. Use <b>Squad → Start fresh</b> to clear it and add your own players.</div>` : ''}
      <div class="grid tiles">
        <div class="card tile"><div class="label">Avg development score</div><div class="value num">${fmt1(mean(latestOverall))}<span class="small muted"> / 5</span></div><div class="note">${deltaHtml(mean(latestOverall) != null && mean(prevOverall) != null ? mean(latestOverall) - mean(prevOverall) : null, 2)} vs previous review cycle</div></div>
        <div class="card tile"><div class="label">Attendance, last 4 weeks</div><div class="value num">${pct(avgRate(recent))}</div><div class="note">${deltaHtml(avgRate(recent) != null && avgRate(prior) != null ? (avgRate(recent) - avgRate(prior)) * 100 : null, 0)} pts vs prior 4 weeks</div></div>
        <div class="card tile"><div class="label">Reviews up to date</div><div class="value num">${rows.filter((r) => r.dev.latest && r.dev.latest.date >= CT.addDays(CT.today(), -42)).length}<span class="small muted"> / ${rows.length}</span></div><div class="note">reviewed in the last 6 weeks</div></div>
        <div class="card tile"><div class="label">Next: ${next ? esc(next.type === 'match' ? 'match' : 'training') + ' ' + CT.fmtDate(next.date) : 'nothing scheduled'}</div><div class="value num">${next ? nextAvail : '–'}<span class="small muted"> available</span></div><div class="note">${next ? nextNoReply + ' yet to reply' : 'Add one in Attendance'}</div></div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Squad overview: latest Four Corner ratings</h3>
        <div class="sub">FA Four Corner Model, scored 1–5 at each review. ▲▼ = change since the previous review. Click a player for their profile and to add a review.</div>
        <div class="table-wrap"><table class="heat">
          <thead><tr>${th('name', 'Player')}${th('pos', 'Pos')}${CT.CORNERS.map((c) => th(c.id, c.short, 'n')).join('')}${th('overall', 'Overall', 'n')}${th('delta', 'Change', 'n')}${th('att', 'Attend. 8 wk', 'n')}</tr></thead>
          <tbody>${rows.map(({ p, dev, att }) => `
            <tr class="clickable" data-action="open-player" data-id="${p.id}">
              <td><b>${esc(p.name)}</b></td>
              <td><span class="badge pos">${esc(p.position)}</span></td>
              ${CT.CORNERS.map((c) => {
                const v = dev.latest ? dev.latest.scores[c.id] : null;
                const [bg, fg] = heatColor(v);
                const d = dev.delta[c.id];
                const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '';
                return `<td class="cell" style="background:${bg};color:${fg}" title="${esc(c.label)}: ${v == null ? 'not rated' : v}${d ? ' (' + (d > 0 ? '+' : '') + d + ')' : ''}">${v == null ? '–' : v.toFixed(1)}${arrow ? `<span class="arrow">${arrow}</span>` : ''}</td>`;
              }).join('')}
              <td class="n"><b>${fmt1(dev.overall)}</b></td>
              <td class="n">${deltaHtml(dev.overallDelta, 2)}</td>
              <td class="n">${pct(att.rate)}</td>
            </tr>`).join('') || `<tr><td colspan="9" class="empty">No players yet. Add them in the Squad tab.</td></tr>`}
          </tbody></table></div>
        <div class="legend-seq">Rating: ${[1, 2, 3, 4, 5].map((v) => `<span class="sw" style="background:${heatColor(v)[0]}"></span>${v}`).join(' ')}</div>
      </div>

      <div class="grid two" style="margin-top:16px">
        <div class="card"><h3>Squad development trend</h3><div class="sub">Average rating per corner, per review cycle</div><div id="trend"></div></div>
        <div class="card"><h3>Squad turnout per session</h3><div class="sub">Share of the squad present (incl. late), last 12 weeks</div><div id="turnout"></div></div>
      </div>

      <div class="grid two" style="margin-top:16px">
        <div class="card"><h3>Talking points</h3><div class="sub">Generated from your data: useful for parent meetings, club reports or a DoF interview</div>
          <ul style="margin:0;padding-left:18px">${insights(rows).map((t) => `<li style="margin-bottom:8px">${t}</li>`).join('') || '<li>Add reviews and attendance to generate insights.</li>'}</ul>
        </div>
        <div class="card"><h3>Watch list</h3><div class="sub">Players who may need a conversation</div>
          ${watch.length ? `<table><tbody>${watch.map((w) => `<tr class="clickable" data-action="open-player" data-id="${w.p.id}"><td><span class="status"><span class="dot" style="background:var(--${w.level})"></span><span aria-hidden="true">${w.icon}</span></span></td><td><b>${esc(w.p.name)}</b></td><td class="muted small">${esc(w.text)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing flagged. 👍</p>'}
        </div>
      </div>`;

    const cyc = cycleAverages();
    if (cyc.length) {
      const vals = cyc.flatMap((c) => CT.CORNERS.map((k) => c[k.id])).filter((v) => v != null);
      const lo = Math.max(1, Math.floor((Math.min(...vals) - 0.25) * 2) / 2), hi = Math.min(5, Math.ceil((Math.max(...vals) + 0.25) * 2) / 2);
      const ticks = [];
      for (let t = lo; t <= hi + 1e-9; t += 0.5) ticks.push(t);
      CT.charts.lineChart($('#trend'), cyc.map((c) => c.date), CT.CORNERS.map((c, i) => ({ id: c.id, label: c.label, short: c.short, color: SERIES[i], values: cyc.map((x) => x[c.id]) })), {
        // Zoom to the data (half-point padding) so squad-level movement is visible.
        yMin: lo, yMax: hi, yTicks: ticks, tickFormat: (t) => t.toFixed(1), label: 'Squad average rating per corner over review cycles',
        titleFor: (i) => `Reviews ${CT.fmtDate(cyc[i].date)} (${cyc[i].n})`, format: (v) => v.toFixed(2),
      });
    } else $('#trend').innerHTML = '<p class="empty">No reviews yet.</p>';
    if (turn.length) CT.charts.turnoutChart($('#turnout'), turn.slice(-36));
    else $('#turnout').innerHTML = '<p class="empty">No past sessions recorded yet.</p>';
  }

  // ======================================================================
  // PLAYER PROFILE (dialog)
  // ======================================================================
  function openPlayer(id) {
    ui.openPlayer = id;
    const dlg = $('#player-dlg');
    renderPlayer();
    if (!dlg.open) dlg.showModal();
  }
  function renderPlayer() {
    const p = player(ui.openPlayer);
    const dlg = $('#player-dlg');
    if (!p) { if (dlg.open) dlg.close(); return; }
    const dev = S.development(state, p.id);
    const att = S.attendanceFor(state, p.id);
    const attM = S.attendanceFor(state, p.id, { type: 'match' });
    const last = dev.latest;
    dlg.innerHTML = `
      <div class="dlg-head"><div><h2>${esc(p.name)}</h2><div class="muted small">#${esc(p.shirt || '')} · ${esc(p.position)}${p.dob ? ' · born ' + esc(p.dob) : ''}</div></div><div class="spacer"></div>
        <button class="no-print" onclick="window.print()">Print</button><button data-action="close-dlg" aria-label="Close">✕</button></div>
      <div class="dlg-body stack">
        <div class="grid tiles">
          <div class="card tile"><div class="label">Overall</div><div class="value num">${fmt1(dev.overall)}</div><div class="note">${deltaHtml(dev.overallDelta, 2)} since last review</div></div>
          <div class="card tile"><div class="label">Attendance (season)</div><div class="value num">${pct(att.rate)}</div><div class="note">${att.present + att.late}/${att.counted} sessions · ${att.excused} excused</div></div>
          <div class="card tile"><div class="label">Match attendance</div><div class="value num">${pct(attM.rate)}</div><div class="note">${attM.present + attM.late}/${attM.counted} matches</div></div>
          <div class="card tile"><div class="label">Reviews</div><div class="value num">${dev.reviews.length}</div><div class="note">${last ? 'last ' + CT.fmtDate(last.date) : 'none yet'}</div></div>
        </div>
        <div class="card"><h3>Four Corner progress</h3><div class="sub">Rating at each review (1–5)</div><div id="p-trend"></div></div>
        ${last ? `<div class="grid two"><div class="card"><h3>Strengths</h3><p>${esc(last.strengths || '–')}</p></div><div class="card"><h3>Current targets (IDP)</h3><p>${esc(last.targets || '–')}</p></div></div>` : ''}
        <div class="card no-print">
          <h3>Add a review</h3><div class="sub">Score each corner 1–5. Half points are allowed.</div>
          <form id="review-form" class="stack">
            <div class="row"><label class="field">Date<input type="date" name="date" value="${CT.today()}" required></label><label class="field">Reviewer<input name="reviewer" value="${esc((last && last.reviewer) || '')}" placeholder="Coach name"></label></div>
            <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
              ${CT.CORNERS.map((c) => `<label class="field">${esc(c.label)}<input type="number" name="${c.id}" min="1" max="5" step="0.5" value="${last ? last.scores[c.id] : 3}" required></label>`).join('')}
            </div>
            <label class="field">Strengths<textarea name="strengths" placeholder="What are they doing well?"></textarea></label>
            <label class="field">Targets for the next block<textarea name="targets" placeholder="One to three specific, observable targets"></textarea></label>
            <div><button class="primary" type="submit">Save review</button></div>
          </form>
        </div>
        <div class="card"><h3>Review history</h3>
          ${dev.reviews.slice().reverse().map((r) => `<div class="review"><div class="row" style="align-items:center"><b>${CT.fmtDate(r.date)}</b><span class="muted small">${esc(r.reviewer || '')}</span><span class="small">${CT.CORNERS.map((c) => `${esc(c.short)} <b class="num">${r.scores[c.id]}</b>`).join(' · ')}</span><span class="spacer"></span><button class="ghost danger small no-print" data-action="del-review" data-id="${r.id}">Delete</button></div>
            ${r.strengths ? `<div class="small"><b>Strengths:</b> ${esc(r.strengths)}</div>` : ''}${r.targets ? `<div class="small"><b>Targets:</b> ${esc(r.targets)}</div>` : ''}</div>`).join('') || '<p class="muted">No reviews yet.</p>'}
        </div>
      </div>`;
    if (dev.reviews.length) {
      CT.charts.lineChart($('#p-trend', dlg), dev.reviews.map((r) => r.date), CT.CORNERS.map((c, i) => ({ id: c.id, label: c.label, short: c.short, color: SERIES[i], values: dev.reviews.map((r) => r.scores[c.id]) })), { yMin: 1, yMax: 5, label: `${p.name} rating per corner over time` });
    } else $('#p-trend', dlg).innerHTML = '<p class="empty">Add a first review below to start tracking progress.</p>';

    $('#review-form', dlg).addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const scores = {};
      CT.CORNERS.forEach((c) => { scores[c.id] = Math.max(1, Math.min(5, parseFloat(f.get(c.id)))); });
      state.reviews.push({ id: CT.uid(), playerId: p.id, date: f.get('date'), scores, strengths: f.get('strengths').trim(), targets: f.get('targets').trim(), reviewer: f.get('reviewer').trim() });
      commit();
      toast('Review saved');
    });
  }

  // ======================================================================
  // SQUAD
  // ======================================================================
  function renderSquad(root) {
    const editing = ui.editPlayer ? player(ui.editPlayer) : null;
    root.innerHTML = `
      <div class="section-head"><div><h2>Squad</h2><p class="muted">One roster shared by the dashboard, the attendance tracker and the session planner.</p></div></div>
      <div class="grid two">
        <div class="card">
          <h3>Team</h3>
          <form id="team-form" class="row" style="margin-top:8px">
            <label class="field" style="flex:1">Team name<input name="name" value="${esc(state.team.name)}"></label>
            <label class="field">Age group<select name="ageGroup">${CT.AGE_GROUPS.map((g) => `<option ${g.id === state.team.ageGroup ? 'selected' : ''}>${g.id}</option>`).join('')}</select></label>
            <button type="submit">Save</button>
          </form>
        </div>
        <div class="card">
          <h3>${editing ? 'Edit player' : 'Add player'}</h3>
          <form id="player-form" class="row" style="margin-top:8px">
            <label class="field" style="flex:1;min-width:160px">Name<input name="name" required value="${esc(editing ? editing.name : '')}"></label>
            <label class="field">Position<select name="position">${CT.POSITIONS.map((x) => `<option ${editing && editing.position === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
            <label class="field" style="width:80px">Shirt<input name="shirt" type="number" min="1" max="99" value="${esc(editing ? editing.shirt || '' : '')}"></label>
            <button class="primary" type="submit">${editing ? 'Update' : 'Add'}</button>
            ${editing ? '<button type="button" data-action="cancel-edit">Cancel</button>' : ''}
          </form>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="table-wrap"><table>
          <thead><tr><th class="n">#</th><th>Name</th><th>Pos</th><th class="n">Attendance</th><th class="n">Reviews</th><th></th></tr></thead>
          <tbody>${state.players.slice().sort((a, b) => (a.shirt || 99) - (b.shirt || 99)).map((p) => {
            const a = S.attendanceFor(state, p.id);
            return `<tr><td class="n">${esc(p.shirt || '')}</td><td><a href="#" data-action="open-player" data-id="${p.id}">${esc(p.name)}</a></td><td><span class="badge pos">${esc(p.position)}</span></td><td class="n">${pct(a.rate)}</td><td class="n">${S.reviewsFor(state, p.id).length}</td>
              <td style="text-align:right;white-space:nowrap"><button class="ghost small" data-action="edit-player" data-id="${p.id}">Edit</button><button class="ghost small danger" data-action="del-player" data-id="${p.id}">Remove</button></td></tr>`;
          }).join('') || '<tr><td colspan="6" class="empty">No players yet. Add your first one above.</td></tr>'}</tbody>
        </table></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h3>Data</h3>
        <div class="sub">Everything is stored in this browser only. Export a backup regularly, or to move to another device.</div>
        <div class="row">
          <button data-action="export">Export backup (JSON)</button>
          <label class="btn" style="display:inline-flex;align-items:center">Import backup<input type="file" accept="application/json" id="import-file" hidden></label>
          <button data-action="export-csv">Export attendance (CSV)</button>
          <span class="spacer"></span>
          <button data-action="load-demo">Load demo data</button>
          <button class="danger" data-action="reset">Start fresh</button>
        </div>
      </div>`;

    $('#team-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      state.team = { name: f.get('name').trim() || 'My Team', ageGroup: f.get('ageGroup') };
      commit(); toast('Team saved');
    });
    $('#player-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const data = { name: f.get('name').trim(), position: f.get('position'), shirt: f.get('shirt') ? parseInt(f.get('shirt'), 10) : '' };
      if (!data.name) return;
      if (editing) Object.assign(editing, data);
      else state.players.push(Object.assign({ id: CT.uid(), notes: '' }, data));
      ui.editPlayer = null;
      commit(); toast(editing ? 'Player updated' : 'Player added');
    });
    $('#import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then((txt) => {
        try {
          const s = JSON.parse(txt);
          if (!s || !Array.isArray(s.players) || !Array.isArray(s.events)) throw new Error('bad');
          state = Object.assign(S.emptyState(), s);
          commit(); toast('Backup imported');
        } catch (err) { toast('That file is not a Coaching Toolkit backup.'); }
      });
    });
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function attendanceCsv() {
    const evs = state.events.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).filter((e) => e.date < CT.today());
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const head = ['Player', 'Position', ...evs.map((e) => `${e.date} ${e.type}`), 'Rate'];
    const lines = state.players.map((p) => [p.name, p.position, ...evs.map((e) => e.attendance[p.id] || ''), pct(S.attendanceFor(state, p.id).rate)]);
    return [head, ...lines].map((r) => r.map(q).join(',')).join('\n');
  }

  // ======================================================================
  // ATTENDANCE & AVAILABILITY
  // ======================================================================
  function renderAttendance(root) {
    const today = CT.today();
    const sorted = state.events.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    let list;
    if (ui.eventFilter === 'upcoming') list = sorted.filter((e) => e.date >= today);
    else if (ui.eventFilter === 'recent') list = sorted.filter((e) => e.date >= CT.addDays(today, -21));
    else list = sorted;
    if (!ui.eventId || !state.events.find((e) => e.id === ui.eventId)) {
      const nxt = S.nextEvent(state) || sorted[sorted.length - 1];
      ui.eventId = nxt ? nxt.id : null;
    }
    const ev = state.events.find((e) => e.id === ui.eventId);
    const plan = ev && ev.planId ? state.plans.find((p) => p.id === ev.planId) : null;
    const counts = (key, vals) => vals.map((v) => ev ? state.players.filter((p) => ev[key][p.id] === v).length : 0);
    const [aAv, aUn, aIn] = counts('availability', CT.AVAILABILITY);
    const noReply = ev ? state.players.filter((p) => !ev.availability[p.id]).length : 0;
    const [tP, tL, tA, tE] = counts('attendance', CT.ATTENDANCE);
    const label = { available: 'Available', unavailable: 'Unavailable', injured: 'Injured' };
    const posCount = (pos) => ev ? state.players.filter((p) => p.position === pos && ev.availability[p.id] === 'available').length : 0;

    root.innerHTML = `
      <div class="section-head"><div><h2>Availability & attendance</h2><p class="muted">Collect availability before a session, then take the register on the day.</p></div></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));align-items:start">
        <div class="card">
          <div class="row" style="align-items:center;margin-bottom:10px"><h3>Sessions</h3><span class="spacer"></span>
            <span class="seg">${['upcoming', 'recent', 'all'].map((f) => `<button data-action="ev-filter" data-f="${f}" aria-pressed="${ui.eventFilter === f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</span></div>
          <div style="max-height:420px;overflow:auto">
          <table><tbody>${list.slice().reverse().map((e) => {
            const done = Object.keys(e.attendance).length;
            return `<tr class="clickable" data-action="pick-event" data-id="${e.id}" style="${e.id === ui.eventId ? 'background:var(--surface-2)' : ''}"><td class="num" style="white-space:nowrap">${CT.fmtDate(e.date)}</td><td><b>${esc(e.title)}</b><div class="small muted">${e.type === 'match' ? 'Match' : 'Training'}${e.planId ? ' · plan attached' : ''}</div></td><td class="small muted n">${e.date < today ? (done ? done + '/' + state.players.length : 'no register') : 'upcoming'}</td></tr>`;
          }).join('') || '<tr><td class="empty">No sessions in this view.</td></tr>'}</tbody></table></div>
          <form id="event-form" class="stack" style="margin-top:14px;border-top:1px solid var(--grid);padding-top:14px">
            <h3>Add a session</h3>
            <div class="row">
              <label class="field">Date<input type="date" name="date" value="${today}" required></label>
              <label class="field">Type<select name="type"><option value="training">Training</option><option value="match">Match</option></select></label>
            </div>
            <label class="field">Title<input name="title" placeholder="e.g. Training or vs Rovers (H)"></label>
            <label class="field"><span><input type="checkbox" name="repeat"> Repeat weekly for 8 weeks</span></label>
            <div><button class="primary" type="submit">Add</button></div>
          </form>
        </div>

        <div class="card">${ev ? `
          <div class="row" style="align-items:flex-start">
            <div><h3>${esc(ev.title)}</h3><div class="muted small">${new Date(ev.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · ${ev.type === 'match' ? 'Match' : 'Training'}</div></div>
            <span class="spacer"></span>
            ${ev.type === 'training' ? `<button data-action="plan-for-event" data-id="${ev.id}">${plan ? 'View session plan' : 'Plan this session'}</button>` : ''}
            <button class="ghost danger small" data-action="del-event" data-id="${ev.id}">Delete</button>
          </div>
          <div class="grid tiles" style="margin:12px 0;grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
            <div class="card tile"><div class="label">Available</div><div class="value num">${aAv}</div><div class="note">GK ${posCount('GK')} · DEF ${posCount('DEF')} · MID ${posCount('MID')} · FWD ${posCount('FWD')}</div></div>
            <div class="card tile"><div class="label">Out</div><div class="value num">${aUn + aIn}</div><div class="note">${aIn} injured</div></div>
            <div class="card tile"><div class="label">No reply</div><div class="value num">${noReply}</div><div class="note"><a href="#" data-action="copy-chasers">Copy names</a></div></div>
            <div class="card tile"><div class="label">Attended</div><div class="value num">${tP + tL}</div><div class="note">${tL} late · ${tA} absent · ${tE} excused</div></div>
          </div>
          <div class="row no-print" style="margin-bottom:8px"><button class="small" data-action="all-available">Mark all unanswered available</button><button class="small" data-action="register-from-avail">Fill register from availability</button></div>
          <div class="table-wrap"><table class="att-grid">
            <thead><tr><th>Player</th><th>Availability</th><th>Register</th></tr></thead>
            <tbody>${state.players.map((p) => `<tr><td><span class="badge pos">${esc(p.position)}</span> ${esc(p.name)}</td>
              <td class="mark"><span class="seg">${CT.AVAILABILITY.map((v) => `<button data-action="set-avail" data-p="${p.id}" data-v="${v}" aria-pressed="${ev.availability[p.id] === v}" title="${label[v]}">${v === 'available' ? '✓' : v === 'injured' ? '✚' : '✕'}<span class="hide-sm"> ${label[v]}</span></button>`).join('')}</span></td>
              <td class="mark"><select data-action="set-att" data-p="${p.id}" aria-label="Register for ${esc(p.name)}"><option value="">–</option>${CT.ATTENDANCE.map((v) => `<option value="${v}" ${ev.attendance[p.id] === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></td></tr>`).join('')}
            </tbody></table></div>` : '<p class="empty">Add a session to start tracking.</p>'}
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Season attendance by player</h3><div class="sub">Rate = (present + late) ÷ (present + late + absent). Excused absences don't count against a player.</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Player</th><th class="n">Present</th><th class="n">Late</th><th class="n">Absent</th><th class="n">Excused</th><th class="n">Rate</th><th class="n hide-sm">Last 4 wks</th></tr></thead>
          <tbody>${state.players.map((p) => ({ p, a: S.attendanceFor(state, p.id), r: S.attendanceFor(state, p.id, { since: CT.addDays(today, -28) }) })).sort((x, y) => (y.a.rate || 0) - (x.a.rate || 0)).map(({ p, a, r }) => `
            <tr class="clickable" data-action="open-player" data-id="${p.id}"><td>${esc(p.name)}</td><td class="n">${a.present}</td><td class="n">${a.late}</td><td class="n">${a.absent}</td><td class="n">${a.excused}</td><td class="n"><b>${pct(a.rate)}</b></td><td class="n hide-sm">${pct(r.rate)}</td></tr>`).join('')}
          </tbody></table></div>
      </div>`;

    $('#event-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const type = f.get('type');
      const title = f.get('title').trim() || (type === 'match' ? 'Match' : 'Training');
      const n = f.get('repeat') ? 8 : 1;
      let firstId = null;
      for (let i = 0; i < n; i++) {
        const ev2 = { id: CT.uid(), date: CT.addDays(f.get('date'), i * 7), type, title, availability: {}, attendance: {}, planId: null };
        firstId = firstId || ev2.id;
        state.events.push(ev2);
      }
      ui.eventId = firstId;
      commit(); toast(n > 1 ? `${n} sessions added` : 'Session added');
    });
  }

  // ======================================================================
  // SESSION PLANNER
  // ======================================================================
  const drill = (id) => CT.DRILLS.find((d) => d.id === id);
  const clock = (mins) => `${Math.floor(mins / 60) ? Math.floor(mins / 60) + 'h ' : ''}${mins % 60}m`;

  function renderPlanner(root) {
    const next = S.nextEvent(state);
    const defaultPlayers = next ? state.players.filter((p) => next.availability[p.id] === 'available').length || state.players.length : state.players.length || 12;
    const f = ui.planForm || { theme: 'passing', ageGroup: state.team.ageGroup, duration: 75, players: defaultPlayers, date: next && next.type === 'training' ? next.date : CT.today(), coach: '' };
    ui.planForm = f;
    const plan = ui.plan;
    const phaseColor = { warmup: 'var(--seq-2)', technical: 'var(--seq-3)', opposed: 'var(--seq-4)', game: 'var(--seq-5)', cooldown: 'var(--seq-1)' };

    root.innerHTML = `
      <div class="section-head no-print"><div><h2>Session plan generator</h2><p class="muted">Pick a theme and constraints to get a full, timed session from the drill library. Re-roll any block you don't like.</p></div></div>
      <div class="card no-print">
        <form id="plan-form" class="row">
          <label class="field" style="flex:1;min-width:200px">Theme<select name="theme">${CT.THEMES.map((t) => `<option value="${t.id}" ${f.theme === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
          <label class="field">Age group<select name="ageGroup">${CT.AGE_GROUPS.map((g) => `<option ${f.ageGroup === g.id ? 'selected' : ''}>${g.id}</option>`).join('')}</select></label>
          <label class="field" style="width:110px">Minutes<input type="number" name="duration" min="30" max="150" step="5" value="${f.duration}"></label>
          <label class="field" style="width:100px">Players<input type="number" name="players" min="1" max="40" value="${f.players}"></label>
          <label class="field">Date<input type="date" name="date" value="${f.date}"></label>
          <button class="primary" type="submit">Generate plan</button>
        </form>
        ${next && next.type === 'training' ? `<p class="small muted" style="margin:8px 0 0">Player count defaults to the ${defaultPlayers} marked available for ${esc(next.title)} on ${CT.fmtDate(next.date)}.</p>` : ''}
      </div>

      ${plan ? `
      <div class="card" style="margin-top:16px">
        <div class="row" style="align-items:flex-start">
          <div>
            <div class="small muted">${esc(state.team.name)} · ${plan.ageGroup} (${esc(plan.format)}) · ${plan.players} players · ${plan.date ? new Date(plan.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : ''}</div>
            <h2 style="margin-top:2px">${esc((CT.THEMES.find((t) => t.id === plan.theme) || {}).label || plan.theme)}</h2>
            <div class="muted">${plan.duration} minutes</div>
          </div>
          <span class="spacer"></span>
          <div class="row no-print"><button data-action="regen">Shuffle all</button><button onclick="window.print()">Print</button><button class="primary" data-action="save-plan">${plan.id ? 'Update saved plan' : 'Save & add to calendar'}</button></div>
        </div>
        <div class="timeline" aria-hidden="true">${plan.blocks.map((b) => `<span style="flex:${b.minutes};background:${phaseColor[b.phase]}" title="${esc(b.label)} ${b.minutes}m"></span>`).join('')}</div>
        <div class="small muted" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px">${plan.blocks.map((b) => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${phaseColor[b.phase]};margin-right:4px;vertical-align:-1px"></i>${esc(b.label)} ${b.minutes}m</span>`).join('')}</div>
        ${plan.warnings.map((w) => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}
        <label class="field no-print" style="margin:8px 0">Session objective / notes<textarea id="plan-notes" placeholder="e.g. Focus on receiving on the half-turn: link to Saturday's issues playing through midfield">${esc(plan.notes || '')}</textarea></label>
        ${plan.notes ? `<p class="print-only">${esc(plan.notes)}</p>` : ''}
        <div>${plan.blocks.map((b, i) => {
          const d = drill(b.drillId);
          return `<div class="plan-block">
            <div class="plan-time"><div class="mins">${b.minutes}′</div><div class="clock">${clock(b.start)} – ${clock(b.start + b.minutes)}</div>
              <button class="small no-print" style="margin-top:6px" data-action="reroll" data-i="${i}">↻ Swap</button></div>
            <div><div class="phase">${esc(b.label)}</div><h4>${esc(d.name)}</h4>
              <div class="small muted">Area: ${esc(d.area)} · min. ${d.minPlayers} players</div>
              <p style="margin-top:6px">${esc(d.setup)}</p>
              <b class="small">Coaching points</b><ul class="small">${d.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
              ${d.progression ? `<div class="small"><b>Progression:</b> ${esc(d.progression)}</div>` : ''}
            </div></div>`;
        }).join('')}</div>
      </div>` : ''}

      <div class="card no-print" style="margin-top:16px">
        <h3>Saved plans</h3>
        ${state.plans.length ? `<table><tbody>${state.plans.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((p) => `<tr class="clickable" data-action="load-plan" data-id="${p.id}"><td class="num">${p.date ? CT.fmtDate(p.date) : ''}</td><td><b>${esc((CT.THEMES.find((t) => t.id === p.theme) || {}).label || p.theme)}</b></td><td class="small muted">${p.ageGroup} · ${p.duration}m · ${p.players} players</td><td style="text-align:right"><button class="ghost small danger" data-action="del-plan" data-id="${p.id}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Plans you save appear here and are attached to that day\'s training in Attendance.</p>'}
      </div>`;

    $('#plan-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      ui.planForm = { theme: fd.get('theme'), ageGroup: fd.get('ageGroup'), duration: parseInt(fd.get('duration'), 10) || 60, players: parseInt(fd.get('players'), 10) || 12, date: fd.get('date') };
      ui.plan = Object.assign(CT.generator.generatePlan(ui.planForm), { date: ui.planForm.date });
      render();
    });
    const notes = $('#plan-notes');
    if (notes) notes.addEventListener('input', () => { ui.plan.notes = notes.value; });
  }

  function savePlan() {
    const plan = ui.plan;
    if (!plan.id) plan.id = CT.uid();
    const copy = JSON.parse(JSON.stringify(plan));
    const i = state.plans.findIndex((p) => p.id === plan.id);
    if (i >= 0) state.plans[i] = copy; else state.plans.push(copy);
    if (plan.date) {
      let ev = state.events.find((e) => e.planId === plan.id) || state.events.find((e) => e.date === plan.date && e.type === 'training' && !e.planId);
      if (!ev) {
        ev = { id: CT.uid(), date: plan.date, type: 'training', title: 'Training', availability: {}, attendance: {}, planId: null };
        state.events.push(ev);
      }
      state.events.forEach((e) => { if (e.planId === plan.id && e !== ev) e.planId = null; });
      ev.planId = plan.id;
    }
    commit();
    toast('Plan saved and attached to training on ' + CT.fmtDate(plan.date));
  }

  // ======================================================================
  // ROUTING & EVENTS
  // ======================================================================
  const TABS = [
    { id: 'dashboard', label: 'Development', render: renderDashboard },
    { id: 'attendance', label: 'Attendance', render: renderAttendance },
    { id: 'planner', label: 'Session planner', render: renderPlanner },
    { id: 'squad', label: 'Squad', render: renderSquad },
  ];

  function render() {
    $('#team-name').textContent = state.team.name;
    $('#team-meta').textContent = `${state.team.ageGroup} · ${state.players.length} players`;
    $('#tabs').innerHTML = TABS.map((t) => `<button role="tab" aria-selected="${ui.tab === t.id}" data-action="tab" data-tab="${t.id}">${t.label}</button>`).join('');
    const tab = TABS.find((t) => t.id === ui.tab) || TABS[0];
    tab.render($('#view'));
    if ($('#player-dlg').open) renderPlayer();
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action;
    const ev = state.events.find((x) => x.id === ui.eventId);
    switch (a) {
      case 'tab':
        ui.tab = t.dataset.tab;
        try { localStorage.setItem('coachkit.tab', ui.tab); } catch (err) { /* ignore */ }
        render(); window.scrollTo(0, 0); break;
      case 'sort':
        ui.sort = { key: t.dataset.key, dir: ui.sort.key === t.dataset.key ? -ui.sort.dir : (t.dataset.key === 'name' || t.dataset.key === 'pos' ? 1 : -1) };
        render(); break;
      case 'open-player': e.preventDefault(); openPlayer(t.dataset.id); break;
      case 'close-dlg': $('#player-dlg').close(); break;
      case 'del-review':
        if (confirm('Delete this review?')) { state.reviews = state.reviews.filter((r) => r.id !== t.dataset.id); commit(); }
        break;
      case 'edit-player': ui.editPlayer = t.dataset.id; render(); break;
      case 'cancel-edit': ui.editPlayer = null; render(); break;
      case 'del-player': {
        const p = player(t.dataset.id);
        if (p && confirm(`Remove ${p.name}? Their reviews and attendance records will also be removed.`)) {
          state.players = state.players.filter((x) => x.id !== p.id);
          state.reviews = state.reviews.filter((r) => r.playerId !== p.id);
          state.events.forEach((x) => { delete x.availability[p.id]; delete x.attendance[p.id]; });
          commit();
        }
        break;
      }
      case 'export': download(`coaching-toolkit-${CT.today()}.json`, JSON.stringify(state, null, 2), 'application/json'); break;
      case 'export-csv': download(`attendance-${CT.today()}.csv`, attendanceCsv(), 'text/csv'); break;
      case 'load-demo':
        if (confirm('Replace your current data with demo data? Export a backup first if you want to keep it.')) { state = S.demoState(); ui.eventId = null; ui.plan = null; commit(); }
        break;
      case 'reset':
        if (confirm('Delete all players, sessions, reviews and plans? This cannot be undone.')) { state = S.emptyState(); state.team.name = 'My Team'; ui.eventId = null; ui.plan = null; commit(); toast('Cleared. Add your squad to get started.'); }
        break;
      case 'ev-filter': ui.eventFilter = t.dataset.f; render(); break;
      case 'pick-event': ui.eventId = t.dataset.id; render(); break;
      case 'del-event':
        if (confirm('Delete this session and its register?')) { state.events = state.events.filter((x) => x.id !== t.dataset.id); ui.eventId = null; commit(); }
        break;
      case 'set-avail':
        if (ev) { const p = t.dataset.p; if (ev.availability[p] === t.dataset.v) delete ev.availability[p]; else ev.availability[p] = t.dataset.v; commit(); }
        break;
      case 'all-available':
        if (ev) { state.players.forEach((p) => { if (!ev.availability[p.id]) ev.availability[p.id] = 'available'; }); commit(); }
        break;
      case 'register-from-avail':
        if (ev) {
          state.players.forEach((p) => {
            if (ev.attendance[p.id]) return;
            const av = ev.availability[p.id];
            ev.attendance[p.id] = av === 'available' ? 'present' : av ? 'excused' : 'absent';
          });
          commit(); toast('Register filled. Adjust anyone who was late or missing.');
        }
        break;
      case 'copy-chasers':
        e.preventDefault();
        if (ev) {
          const names = state.players.filter((p) => !ev.availability[p.id]).map((p) => p.name).join(', ');
          const text = `Still need availability for ${ev.title} (${CT.fmtDate(ev.date)}): ${names || 'nobody, everyone has replied'}`;
          (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Copied, ready to paste into the team chat'), () => prompt('Copy this message:', text));
        }
        break;
      case 'plan-for-event': {
        const evx = state.events.find((x) => x.id === t.dataset.id);
        const existing = evx && evx.planId && state.plans.find((p) => p.id === evx.planId);
        if (existing) ui.plan = JSON.parse(JSON.stringify(existing));
        else {
          const avail = state.players.filter((p) => evx.availability[p.id] === 'available').length || state.players.length;
          ui.planForm = Object.assign({}, ui.planForm || { theme: 'passing', duration: 75 }, { ageGroup: state.team.ageGroup, players: avail, date: evx.date });
          ui.plan = null;
        }
        ui.tab = 'planner'; render(); window.scrollTo(0, 0);
        break;
      }
      case 'regen': {
        const keep = { id: ui.plan.id, notes: ui.plan.notes, date: ui.plan.date };
        ui.plan = Object.assign(CT.generator.generatePlan(Object.assign({}, ui.plan, { seed: null })), keep);
        render(); break;
      }
      case 'reroll': ui.plan = CT.generator.rerollBlock(ui.plan, parseInt(t.dataset.i, 10)); render(); break;
      case 'save-plan': savePlan(); break;
      case 'load-plan': if (!e.target.closest('[data-action="del-plan"]')) { ui.plan = JSON.parse(JSON.stringify(state.plans.find((p) => p.id === t.dataset.id))); render(); window.scrollTo(0, 0); } break;
      case 'del-plan':
        e.stopPropagation();
        if (confirm('Delete this saved plan?')) {
          state.plans = state.plans.filter((p) => p.id !== t.dataset.id);
          state.events.forEach((x) => { if (x.planId === t.dataset.id) x.planId = null; });
          if (ui.plan && ui.plan.id === t.dataset.id) ui.plan = null;
          commit();
        }
        break;
      case 'theme': {
        const root = document.documentElement;
        const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        root.dataset.theme = dark ? 'light' : 'dark';
        try { localStorage.setItem('coachkit.theme', root.dataset.theme); } catch (err) { /* ignore */ }
        render(); break;
      }
      default: break;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.action === 'set-att') {
      const ev = state.events.find((x) => x.id === ui.eventId);
      if (!ev) return;
      if (t.value) ev.attendance[t.dataset.p] = t.value; else delete ev.attendance[t.dataset.p];
      S.save(state);
      render();
    }
  });

  try { const th = localStorage.getItem('coachkit.theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) { /* ignore */ }
  if (state.demo) S.save(state);
  render();
})(window.CT = window.CT || {});
