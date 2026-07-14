/**
 * THE MINTED SCARF, v2 — the on-chain asset's real artwork (replaces the placeholder
 * gradient in services/stands/src/mint/cover.ts for the claim-mint path).
 *
 * One pure function, zero deps: fixture facts in → a self-contained SVG out.
 * v2 (owner slip, 14 Jul: "iterate first"):
 *   · the product's own type rides inside the SVG — Anybody 900 (display) and
 *     Young Serif (the intimate register) as data-URI @font-face, from the same
 *     woff2 subsets the site ships. Degrades to the Arial Black stack in contexts
 *     that refuse fonts in <img>-loaded SVGs (see SPEC.md — the v1 look, not a break).
 *   · the cloth is EVENT-WOVEN: goals land as gold-ringed medallions at their
 *     minute along the cloth, the minute printed beneath (the printed number keeps
 *     the mark honest even where layout nudges it off the cartouche); cards are
 *     satin ticks at the top selvage in their real colour. Empty events → plain
 *     cloth, still honest. Never a mark for an event that didn't happen.
 *
 * Composition per design/PAPER-AND-CLOTH.md, mirroring the CSS keepsake scarf and
 * the loom's sealed poster: CLOTH (team-ink halves, ribs, fringe, gold FT seal)
 * MOUNTED ON PAPER (cream grain, plate frame, hallmark row). No FIFA marks.
 *
 * Coordinator wiring (SPEC.md beside this file):
 *   scarfSvg({home:{tri,color}, away:{tri,color}, score:{h,a}, dateISO, serial,
 *             events:[{kind:'goal'|'yellow'|'red', minute, side:'home'|'away'}]})
 *   → Buffer.from(svg) uploaded as image/svg+xml where makeCoverPng was used.
 */
import { ANYBODY9, YOUNGSERIF } from './scarf-fonts.mjs';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** Darken a #rrggbb toward ink so pale team colours stay legible on cream. */
function ink(hex, floor = 0.55) {
  const h = String(hex || '#8C8467').replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2) || '8c', 16));
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum <= floor) return '#' + h;
  const k = floor / lum;
  const c = (n) => Math.round(n * k).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

export function scarfSvg(o) {
  const W = 1024, H = 1024;
  const home = { tri: esc(o.home.tri), color: ink(o.home.color) };
  const away = { tri: esc(o.away.tri), color: ink(o.away.color) };
  const score = `${o.score.h}–${o.score.a}`;
  const d = new Date(o.dateISO || Date.now());
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateLine = `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const serial = esc(o.serial || '—');

  // scarf geometry: horizontal cloth across a square paper mount
  const sy = 352, sh = 320;            // scarf top + height
  const fx = 84;                        // fringe width each end
  const sx = fx + 26, sw = W - 2 * (fx + 26);
  const cartW = 258;                    // cream score cartouche
  const cartX = W / 2 - cartW / 2;
  const halfW = cartX - sx;

  const fringe = (x0, dir) => {
    let s = '';
    for (let i = 0; i < 14; i++) {
      const y = sy + 8 + i * ((sh - 16) / 13);
      s += `<path d="M ${x0} ${y} q ${dir * (fx * 0.5)} ${i % 2 ? 5 : -5} ${dir * (fx * 0.92)} ${i % 3 ? 2 : -3}" stroke="#3E3A31" stroke-width="5" fill="none" stroke-linecap="round" opacity="${i % 2 ? 0.8 : 1}"/>`;
    }
    return s;
  };

  const FONT_DISP = `'Anybody','Arial Black','Arial Bold',Arial,sans-serif`;
  const FONT_SERIF = `'Young Serif',Charter,Georgia,serif`;

  // ---- the event weave ----------------------------------------------------
  // minute → x along the cloth (0'..95'+ spans the weave); marks are nudged off
  // the cartouche and apart from each other — the printed minute stays true.
  const CLEAR = 30;
  const minuteX = (min) => {
    const t = Math.max(0, Math.min(120, +min || 0)) / 95;
    let x = sx + 16 + Math.min(1, t) * (sw - 32);
    if (x > cartX - CLEAR && x < cartX + cartW + CLEAR)
      x = (x < W / 2) ? cartX - CLEAR : cartX + cartW + CLEAR;
    return x;
  };
  const events = Array.isArray(o.events) ? o.events.slice() : [];
  const goals = events.filter((e) => e && e.kind === 'goal')
    .map((e) => ({ x: minuteX(e.minute), min: Math.round(+e.minute || 0), color: (e.side === 'away' ? away : home).color }))
    .sort((a, b) => a.x - b.x);
  for (let i = 1; i < goals.length; i++)                     // spread same-minute neighbours
    if (goals[i].x - goals[i - 1].x < 40) goals[i].x = goals[i - 1].x + 40;
  const gy = sy + sh - 46;
  const goalMarks = goals.map((g) =>
    `<circle cx="${g.x}" cy="${gy}" r="15" fill="#F2EBDB" stroke="#B08D2F" stroke-width="4.5"/>` +
    `<circle cx="${g.x}" cy="${gy}" r="7.5" fill="${g.color}" stroke="#1A1815" stroke-width="1.5"/>` +
    `<text x="${g.x}" y="${gy + 34}" font-family="${FONT_DISP}" font-weight="900" font-size="15" text-anchor="middle" fill="#F2EBDB" opacity="0.95">${g.min}′</text>`
  ).join('');
  const cardMarks = events.filter((e) => e && (e.kind === 'yellow' || e.kind === 'red'))
    .map((e) => {
      const x = minuteX(e.minute), col = e.kind === 'red' ? '#C8202A' : '#E8B10A';
      return `<rect x="${x - 4.5}" y="${sy - 3}" width="9" height="20" fill="${col}" stroke="#1A1815" stroke-width="1.5"/>`;
    }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      @font-face{font-family:'Anybody';src:url(data:font/woff2;base64,${ANYBODY9}) format('woff2');font-weight:900}
      @font-face{font-family:'Young Serif';src:url(data:font/woff2;base64,${YOUNGSERIF}) format('woff2');font-weight:400}
    </style>
    <!-- paper grain: sparse benday dots, print physics not filters -->
    <pattern id="grain" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="3.5" cy="3.5" r="1.15" fill="#1A1815" opacity="0.055"/>
      <circle cx="10.5" cy="10.5" r="1.15" fill="#1A1815" opacity="0.04"/>
    </pattern>
    <!-- the weave: horizontal ribs + a soft warp beat -->
    <pattern id="ribs" width="10" height="8" patternUnits="userSpaceOnUse">
      <rect width="10" height="8" fill="rgba(0,0,0,0)"/>
      <rect y="0" width="10" height="3.4" fill="#1A1815" opacity="0.16"/>
      <rect y="5.4" width="10" height="1.2" fill="#FFFFFF" opacity="0.10"/>
    </pattern>
    <pattern id="warp" width="7" height="10" patternUnits="userSpaceOnUse">
      <rect x="0" width="3.4" height="10" fill="#1A1815" opacity="0.05"/>
    </pattern>
  </defs>

  <!-- PAPER: the mount -->
  <rect width="${W}" height="${H}" fill="#EDE6D6"/>
  <rect width="${W}" height="${H}" fill="url(#grain)"/>
  <rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="#1A1815" stroke-width="3"/>

  <!-- masthead, the programme voice -->
  <text x="${W / 2}" y="200" font-family="${FONT_DISP}" font-weight="900" font-size="44" letter-spacing="18" text-anchor="middle" fill="#1A1815">ROOOT</text>
  <text x="${W / 2}" y="248" font-family="${FONT_DISP}" font-weight="900" font-size="20" letter-spacing="7" text-anchor="middle" fill="#6B654F">FULL TIME · THE SCARF IS YOURS</text>

  <!-- CLOTH: fringe, two team fields, woven ribs, the match's own marks -->
  ${fringe(sx, -1)}
  ${fringe(sx + sw, 1)}
  <g>
    <rect x="${sx}" y="${sy}" width="${halfW}" height="${sh}" fill="${home.color}"/>
    <rect x="${cartX + cartW}" y="${sy}" width="${halfW}" height="${sh}" fill="${away.color}"/>
    <rect x="${cartX}" y="${sy}" width="${cartW}" height="${sh}" fill="#F2EBDB"/>
    <rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="url(#ribs)"/>
    <rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="url(#warp)"/>
    <!-- selvages; the gold line is the FT seal — gold only for the exceptional -->
    <rect x="${sx}" y="${sy - 7}" width="${sw}" height="7" fill="#1A1815"/>
    <rect x="${sx}" y="${sy + sh}" width="${sw}" height="7" fill="#1A1815"/>
    <rect x="${sx}" y="${sy + sh + 7}" width="${sw}" height="5" fill="#B08D2F"/>
    <!-- team letters woven into each field -->
    <text x="${sx + halfW / 2}" y="${sy + sh / 2 + 24}" font-family="${FONT_DISP}" font-weight="900" font-size="96" letter-spacing="8" text-anchor="middle" fill="#F2EBDB" opacity="0.92">${home.tri}</text>
    <text x="${cartX + cartW + halfW / 2}" y="${sy + sh / 2 + 24}" font-family="${FONT_DISP}" font-weight="900" font-size="96" letter-spacing="8" text-anchor="middle" fill="#F2EBDB" opacity="0.92">${away.tri}</text>
    <!-- the score cartouche: the only victory representation -->
    <rect x="${cartX + 14}" y="${sy + 14}" width="${cartW - 28}" height="${sh - 28}" fill="none" stroke="#1A1815" stroke-width="3"/>
    <text x="${W / 2}" y="${sy + sh / 2 + 40}" font-family="${FONT_DISP}" font-weight="900" font-size="110" text-anchor="middle" fill="#1A1815">${score}</text>
    <text x="${W / 2}" y="${sy + 56}" font-family="${FONT_DISP}" font-weight="900" font-size="13" letter-spacing="2.5" text-anchor="middle" fill="#6B654F">THE TOURNAMENT</text>
    <!-- the match, woven in: cards at the top selvage, goals as gold-ringed medallions at their minute -->
    ${cardMarks}
    ${goalMarks}
  </g>

  <!-- HALLMARK ROW: provenance whisper, punched on the mount -->
  <text x="${W / 2}" y="790" font-family="${FONT_DISP}" font-weight="900" font-size="27" letter-spacing="9" text-anchor="middle" fill="#1A1815">${home.tri} ${score} ${away.tri}</text>
  <text x="${W / 2}" y="838" font-family="${FONT_SERIF}" font-size="22" letter-spacing="1.5" text-anchor="middle" fill="#6B654F">${dateLine} · Nº ${serial}</text>
  <text x="${W / 2}" y="948" font-family="${FONT_SERIF}" font-size="17" letter-spacing="1" text-anchor="middle" fill="#8A8268">woven from the match · yours for good</text>
</svg>`;
  return svg;
}

// CLI sample rendering:  node scarf-svg.mjs  → writes sample SVGs beside this file
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL('.', import.meta.url).pathname;
  writeFileSync(dir + 'sample-fra-esp.svg', scarfSvg({
    home: { tri: 'FRA', color: '#0055A4' }, away: { tri: 'ESP', color: '#AA151B' },
    score: { h: 2, a: 1 }, dateISO: '2026-07-14', serial: '001',
    events: [
      { kind: 'goal', minute: 23, side: 'home' },
      { kind: 'goal', minute: 51, side: 'away' },
      { kind: 'yellow', minute: 64, side: 'away' },
      { kind: 'goal', minute: 78, side: 'home' },
    ],
  }));
  writeFileSync(dir + 'sample-sui-col.svg', scarfSvg({
    home: { tri: 'SUI', color: '#D52B1E' }, away: { tri: 'COL', color: '#E8B10A' },
    score: { h: 1, a: 2 }, dateISO: '2026-07-06', serial: '018',
    events: [
      { kind: 'goal', minute: 30, side: 'home' },
      { kind: 'goal', minute: 55, side: 'away' },
      { kind: 'goal', minute: 88, side: 'away' },
      { kind: 'red', minute: 90, side: 'away' },
    ],
  }));
  console.log('samples written');
}
