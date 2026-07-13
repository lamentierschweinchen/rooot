/**
 * THE MINTED SCARF — the on-chain asset's real artwork (replaces the placeholder
 * gradient in services/stands/src/mint/cover.ts for the claim-mint path).
 *
 * One pure, dependency-free function: fixture facts in → a self-contained SVG out.
 * SVG is the right medium here: tiny (~6KB), crisp at any size, zero libraries —
 * and Irys/Metaplex metadata serves image/svg+xml directly. Rasterize later only
 * if some surface demands PNG.
 *
 * The composition follows design/PAPER-AND-CLOTH.md and mirrors the CSS keepsake
 * scarf (terrace/cabinet): CLOTH (two team-ink halves, woven ribs, fringe, gold
 * FT seal at the selvage) MOUNTED ON PAPER (cream ground, hallmark row). Honest:
 * only fixture facts render — score, teams, date, edition Nº. No FIFA marks.
 *
 * Coordinator wiring (see SPEC.md beside this file):
 *   scarfSvg({home:{tri,color}, away:{tri,color}, score:{h,a}, dateISO, serial})
 *   → Buffer.from(svg) uploaded as image/svg+xml where makeCoverPng was used.
 */

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
  const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
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

  const FONT = `'Arial Black','Arial Bold',Arial,sans-serif`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
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
  <text x="${W / 2}" y="200" font-family="${FONT}" font-weight="900" font-size="44" letter-spacing="18" text-anchor="middle" fill="#1A1815">ROOOT</text>
  <text x="${W / 2}" y="248" font-family="${FONT}" font-weight="700" font-size="21" letter-spacing="7" text-anchor="middle" fill="#6B654F">FULL TIME · THE SCARF IS YOURS</text>

  <!-- CLOTH: fringe, two team fields, woven ribs over everything -->
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
    <text x="${sx + halfW / 2}" y="${sy + sh / 2 + 34}" font-family="${FONT}" font-weight="900" font-size="104" letter-spacing="10" text-anchor="middle" fill="#F2EBDB" opacity="0.92">${home.tri}</text>
    <text x="${cartX + cartW + halfW / 2}" y="${sy + sh / 2 + 34}" font-family="${FONT}" font-weight="900" font-size="104" letter-spacing="10" text-anchor="middle" fill="#F2EBDB" opacity="0.92">${away.tri}</text>
    <!-- the score cartouche: the only victory representation -->
    <rect x="${cartX + 14}" y="${sy + 14}" width="${cartW - 28}" height="${sh - 28}" fill="none" stroke="#1A1815" stroke-width="3"/>
    <text x="${W / 2}" y="${sy + sh / 2 + 42}" font-family="${FONT}" font-weight="900" font-size="118" text-anchor="middle" fill="#1A1815">${score}</text>
    <text x="${W / 2}" y="${sy + 54}" font-family="${FONT}" font-weight="700" font-size="13" letter-spacing="2.5" text-anchor="middle" fill="#6B654F">THE TOURNAMENT</text>
  </g>

  <!-- HALLMARK ROW: provenance whisper, punched on the mount -->
  <text x="${W / 2}" y="790" font-family="${FONT}" font-weight="800" font-size="27" letter-spacing="9" text-anchor="middle" fill="#1A1815">${home.tri} ${score} ${away.tri}</text>
  <text x="${W / 2}" y="836" font-family="${FONT}" font-weight="700" font-size="20" letter-spacing="6" text-anchor="middle" fill="#6B654F">${dateLine} · Nº ${serial}</text>
  <text x="${W / 2}" y="948" font-family="${FONT}" font-weight="700" font-size="16" letter-spacing="5" text-anchor="middle" fill="#8A8268">WOVEN FROM THE MATCH · YOURS FOR GOOD</text>
</svg>`;
}

// CLI sample rendering:  node scarf-svg.mjs  → writes sample SVGs beside this file
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL('.', import.meta.url).pathname;
  writeFileSync(dir + 'sample-sui-col.svg', scarfSvg({
    home: { tri: 'SUI', color: '#D52B1E' }, away: { tri: 'COL', color: '#E8B10A' },
    score: { h: 1, a: 2 }, dateISO: '2026-07-06', serial: '018',
  }));
  writeFileSync(dir + 'sample-fra-esp.svg', scarfSvg({
    home: { tri: 'FRA', color: '#0055A4' }, away: { tri: 'ESP', color: '#AA151B' },
    score: { h: 2, a: 1 }, dateISO: '2026-07-14', serial: '001',
  }));
  console.log('samples written');
}
