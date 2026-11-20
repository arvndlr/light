// Tiny inline-SVG chart kit (no libraries, works offline, scales to any width).
import { clamp, round1, esc, fmtDate, today } from './util.js';

export function ring(pct, color, size = 64, stroke = 7, inner = '', label = '') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - clamp(pct || 0) / 100);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--bg2)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})" class="ring-arc"/>
    ${inner !== '' ? `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="var(--text)" font-size="${size / 4.2}" font-weight="700">${inner}</text>` : ''}
  </svg>`;
}

export function lineChart(pts, { color = 'var(--accent)', max = 100, min = 0, h = 150, ticks = [0, 50, 100], label = 'Line chart' } = {}) {
  const W = 600, padL = 26, padB = 20, padT = 8, iw = W - padL - 6, ih = h - padB - padT;
  const x = (i) => padL + (pts.length < 2 ? iw / 2 : (i / (pts.length - 1)) * iw);
  const y = (v) => padT + ih - ((v - min) / (max - min)) * ih;
  let path = '', open = false;
  pts.forEach((p, i) => { if (p.v == null) { open = false; return; } path += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)} `; open = true; });
  const every = Math.ceil(pts.length / 8);
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">
    ${ticks.map((t) => `<line x1="${padL}" x2="${W - 6}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="0" y="${y(t) + 3}">${t}</text>`).join('')}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => (p.v == null ? '' : `<circle cx="${x(i)}" cy="${y(p.v)}" r="3.5" fill="${color}"><title>${esc(p.label)}: ${round1(p.v)}</title></circle>`)).join('')}
    ${pts.map((p, i) => (i % every === 0 || i === pts.length - 1 ? `<text x="${x(i)}" y="${h - 4}" text-anchor="middle">${esc(p.label)}</text>` : '')).join('')}
  </svg>`;
}

/** Filled line chart with an automatic range (handles negatives). pts = [{ label, v, tip }]. */
export function areaChart(pts, { color = 'var(--accent)', h = 170, fmt = (v) => v, label = 'Area chart', id = 'area' } = {}) {
  const W = 600, padL = 46, padR = 10, padB = 20, padT = 12, iw = W - padL - padR, ih = h - padB - padT;
  const vs = pts.map((p) => p.v);
  let lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.08; hi += pad; if (lo < 0) lo -= pad;
  const x = (i) => padL + (pts.length < 2 ? iw / 2 : (i / (pts.length - 1)) * iw);
  const y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const base = y(Math.max(lo, 0));
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${base.toFixed(1)} L${x(0).toFixed(1)},${base.toFixed(1)} Z`;
  const ticks = [...new Set([lo < 0 ? lo + pad : null, 0, (hi - pad) / 2, hi - pad].filter((t) => t != null && t <= hi && t >= lo))];
  const every = Math.ceil(pts.length / 6), last = pts.length - 1;
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">
    <defs><linearGradient id="${id}-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".32"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 && lo < 0 ? 'var(--muted)' : 'var(--line)'}" stroke-dasharray="3 4"/><text x="${padL - 6}" y="${y(t) + 3}" text-anchor="end">${esc(fmt(t))}</text>`).join('')}
    <path d="${area}" fill="url(#${id}-g)"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<rect x="${x(i) - iw / pts.length / 2}" y="${padT}" width="${iw / pts.length}" height="${ih}" fill="transparent"><title>${esc(p.tip || p.label)}</title></rect>`).join('')}
    <circle cx="${x(last)}" cy="${y(pts[last].v)}" r="4.5" fill="${color}" stroke="var(--surface)" stroke-width="2"/>
    ${pts.map((p, i) => ((i % every === 0 && last - i >= every / 2) || i === last ? `<text x="${x(i)}" y="${h - 4}" text-anchor="${i === last ? 'end' : i === 0 ? 'start' : 'middle'}">${esc(p.label)}</text>` : '')).join('')}
  </svg>`;
}

export function barChart(pts, { color = 'var(--accent)', target = null, max = null, h = 150, fmt = (v) => v, label = 'Bar chart' } = {}) {
  const W = 600, padB = 20, padT = 14, ih = h - padB - padT;
  const mx = max || Math.max(1, target || 0, ...pts.map((p) => p.v)) * 1.1;
  const bw = W / pts.length;
  const y = (v) => padT + ih - (Math.min(v, mx) / mx) * ih;
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">
    ${pts.map((p, i) => `<rect x="${i * bw + bw * 0.18}" y="${y(p.v)}" width="${bw * 0.64}" height="${Math.max(0, padT + ih - y(p.v))}" rx="4" fill="${color}" opacity="${p.v ? 1 : 0.25}"><title>${esc(p.label)}: ${esc(fmt(round1(p.v)))}</title></rect>
      <text x="${i * bw + bw / 2}" y="${h - 4}" text-anchor="middle">${esc(p.label)}</text>`).join('')}
    ${target ? `<line x1="0" x2="${W}" y1="${y(target)}" y2="${y(target)}" stroke="var(--accent)" stroke-dasharray="5 5" stroke-width="1.5"/>` : ''}
  </svg>`;
}

/** GitHub-style calendar heatmap. grid = weeks × 7 day keys; valueOf(k) → 0..100 or null. */
export function heatmap(grid, valueOf) {
  const cell = 13, gap = 3, padT = 16, padL = 22;
  const W = padL + grid.length * (cell + gap), H = padT + 7 * (cell + gap);
  const t = today();
  const color = (v) => (v == null ? 'var(--heat-0)' : v >= 80 ? 'var(--heat-5)' : v >= 65 ? 'var(--heat-4)' : v >= 50 ? 'var(--heat-3)' : v >= 35 ? 'var(--heat-2)' : 'var(--heat-1)');
  const labels = [];
  grid.forEach((wk, w) => { const m = wk[6].slice(0, 7); if (!labels.length || labels[labels.length - 1].m !== m) labels.push({ m, w, k: wk[6] }); });
  if (labels.length > 1 && labels[1].w - labels[0].w < 3) labels.shift(); // a sliver of a month at the left edge gets no label
  const months = labels.map((l) => `<text x="${padL + l.w * (cell + gap)}" y="10">${fmtDate(l.k, { month: 'short' })}</text>`).join('');
  const cells = grid.map((wk, w) => wk.map((k, d) => {
    if (k > t) return '';
    const v = valueOf(k);
    return `<rect x="${padL + w * (cell + gap)}" y="${padT + d * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${color(v)}" ${k === t ? 'stroke="var(--text)" stroke-width="1.5"' : ''}><title>${fmtDate(k)}: ${v == null ? 'no check-in' : 'score ' + v}</title></rect>`;
  }).join('')).join('');
  const dl = ['M', '', 'W', '', 'F', '', ''].map((l, i) => (l ? `<text x="0" y="${padT + i * (cell + gap) + 10}">${l}</text>` : '')).join('');
  return `<div class="heat-wrap"><svg class="chart heat" viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 520)}px" role="img" aria-label="Daily life score calendar">${months}${dl}${cells}</svg></div>`;
}
