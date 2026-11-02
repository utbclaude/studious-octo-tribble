/* Minimal SVG charts: a multi-series line chart with crosshair tooltip, and a turnout column chart. */
(function (CT) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  CT.fmtDate = fmtDate;

  function placeTooltip(tip, host, x, y) {
    tip.style.display = 'block';
    const hw = host.clientWidth;
    const tw = tip.offsetWidth;
    let left = x + 12;
    if (left + tw > hw) left = x - tw - 12;
    tip.style.left = Math.max(0, left) + 'px';
    tip.style.top = Math.max(0, y - 10) + 'px';
  }

  /**
   * series: [{ id, label, color, values: [number|null] }], xs: [isoDate]
   * opts: { yMin, yMax, yTicks, height, format }
   */
  function lineChart(host, xs, series, opts) {
    const o = Object.assign({ yMin: 1, yMax: 5, yTicks: [1, 2, 3, 4, 5], height: 220, format: (v) => v.toFixed(1) }, opts);
    host.innerHTML = '';
    host.classList.add('chart');
    if (series.length > 1) {
      const lg = document.createElement('div');
      lg.className = 'legend';
      lg.innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('');
      host.appendChild(lg);
    }
    const W = 640, H = o.height, m = { t: 10, r: series.length > 1 && series.length <= 4 ? 78 : 16, b: 26, l: 30 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts && opts.label ? opts.label : 'Line chart' }, host);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = (i) => m.l + (xs.length === 1 ? iw / 2 : (i * iw) / (xs.length - 1));
    const y = (v) => m.t + ih - ((v - o.yMin) / (o.yMax - o.yMin)) * ih;

    o.yTicks.forEach((t) => {
      el('line', { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), class: t === o.yMin ? 'baseline' : 'gridline' }, svg);
      el('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = o.tickFormat ? o.tickFormat(t) : t;
    });
    const step = Math.ceil(xs.length / 8);
    xs.forEach((d, i) => {
      if (i % step !== 0 && i !== xs.length - 1) return;
      el('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = fmtDate(d);
    });

    series.forEach((s) => {
      let dpath = '';
      s.values.forEach((v, i) => { if (v == null) return; dpath += (dpath ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); });
      el('path', { d: dpath, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      if (xs.length <= 12) {
        s.values.forEach((v, i) => { if (v != null) el('circle', { cx: x(i), cy: y(v), r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg); });
      }
    });

    // Direct labels at the line ends, nudged apart so they don't collide.
    if (series.length > 1 && series.length <= 4) {
      const ends = series.map((s) => {
        let i = s.values.length - 1;
        while (i >= 0 && s.values[i] == null) i--;
        return { s, i, yy: i >= 0 ? y(s.values[i]) : null };
      }).filter((e) => e.yy != null).sort((a, b) => a.yy - b.yy);
      for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 14) ends[k].yy = ends[k - 1].yy + 14;
      ends.forEach((e) => {
        el('text', { x: m.l + iw + 8, y: e.yy + 4, class: 'dlabel' }, svg).textContent = e.s.short || e.s.label;
      });
    }

    // Hover layer: crosshair + tooltip listing every series at that x.
    const hair = el('line', { y1: m.t, y2: m.t + ih, class: 'hair', visibility: 'hidden' }, svg);
    const hit = el('rect', { x: m.l - 10, y: 0, width: iw + 20, height: H, fill: 'transparent' }, svg);
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    host.appendChild(tip);
    const move = (evt) => {
      const r = svg.getBoundingClientRect();
      const px = ((evt.clientX - r.left) / r.width) * W;
      const i = xs.length === 1 ? 0 : Math.max(0, Math.min(xs.length - 1, Math.round(((px - m.l) / iw) * (xs.length - 1))));
      hair.setAttribute('x1', x(i)); hair.setAttribute('x2', x(i)); hair.setAttribute('visibility', 'visible');
      const rows = series.map((s) => `<div class="t-row"><span><i style="background:${s.color}"></i>${esc(s.label)}</span><b class="num">${s.values[i] == null ? '–' : o.format(s.values[i])}</b></div>`).join('');
      tip.innerHTML = `<div class="t-title">${esc(o.titleFor ? o.titleFor(i) : fmtDate(xs[i]))}</div>${rows}`;
      const hr = host.getBoundingClientRect();
      placeTooltip(tip, host, (x(i) / W) * r.width + (r.left - hr.left), evt.clientY - hr.top);
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerleave', () => { tip.style.display = 'none'; hair.setAttribute('visibility', 'hidden'); });
  }

  /** Column chart of squad turnout per event; matches and training use different fills, with the legend naming both. */
  function turnoutChart(host, rows) {
    host.innerHTML = '';
    host.classList.add('chart');
    const lg = document.createElement('div');
    lg.className = 'legend';
    lg.innerHTML = '<span><i style="background:var(--s1);height:10px"></i>Training</span><span><i style="background:var(--s2);height:10px"></i>Match</span>';
    host.appendChild(lg);
    const W = 640, H = 200, m = { t: 10, r: 8, b: 26, l: 36 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Squad turnout per session' }, host);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = Math.max(rows.length, 1);
    const band = iw / n, gap = 2, bw = Math.max(2, band - gap);
    const y = (v) => m.t + ih - v * ih;
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      el('line', { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), class: t === 0 ? 'baseline' : 'gridline' }, svg);
      el('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = Math.round(t * 100) + '%';
    });
    const step = Math.ceil(rows.length / 8);
    rows.forEach((r, i) => {
      const x0 = m.l + i * band + gap / 2;
      const h = Math.max(0, ih * r.rate);
      const top = y(r.rate);
      const rad = Math.min(4, bw / 2, h);
      // Rounded top, square base.
      const d = `M${x0},${y(0)} V${top + rad} Q${x0},${top} ${x0 + rad},${top} H${x0 + bw - rad} Q${x0 + bw},${top} ${x0 + bw},${top + rad} V${y(0)} Z`;
      el('path', { d, fill: r.type === 'match' ? 'var(--s2)' : 'var(--s1)' }, svg);
      if (i % step === 0) el('text', { x: x0 + bw / 2, y: H - 6, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = fmtDate(r.date);
    });
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    host.appendChild(tip);
    const hit = el('rect', { x: m.l, y: 0, width: iw, height: H, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', (evt) => {
      const r = svg.getBoundingClientRect();
      const px = ((evt.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(rows.length - 1, Math.floor((px - m.l) / band)));
      const row = rows[i];
      if (!row) return;
      tip.innerHTML = `<div class="t-title">${esc(row.title)}</div><div class="t-row"><span>${fmtDate(row.date)}</span><b class="num">${row.attended}/${row.squad} · ${Math.round(row.rate * 100)}%</b></div>`;
      const hr = host.getBoundingClientRect();
      placeTooltip(tip, host, evt.clientX - hr.left, evt.clientY - hr.top);
    });
    hit.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
  }

  CT.charts = { lineChart, turnoutChart, esc };
})(window.CT = window.CT || {});
