#!/usr/bin/env node
/**
 * ROOOT — compose the insights dashboard into ONE self-contained page.
 *
 * docs/insights/template.html + tournament-data.json + the site's own webfonts
 *   -> docs/insights/index.html
 *
 * Self-contained on purpose: the published page runs under a strict CSP with no
 * external hosts, so the fonts ride as data URIs and the data is inlined. Nothing
 * is fetched at view time.
 *
 * Re-run after scripts/build-insights.mjs whenever a new match seals.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = path.join(ROOT, 'docs/insights/template.html');
const DATA = path.join(ROOT, 'docs/insights/tournament-data.json');
const OUT = path.join(ROOT, 'docs/insights/index.html');

/** the site's own faces (apps/web/public/plate/fonts) — same type as the surfaces */
const FONTS = [
  { family: 'Anybody', file: 'anybody.woff2', weight: '400 700' },
  { family: 'Anybody', file: 'anybody900.woff2', weight: '800 900' },
  { family: 'YoungSerif', file: 'youngserif.woff2', weight: '400' },
];

const faces = FONTS.map(({ family, file, weight }) => {
  const b64 = readFileSync(path.join(ROOT, 'apps/web/public/plate/fonts', file)).toString('base64');
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:${weight};font-style:normal;font-display:swap}`;
}).join('\n');

const data = JSON.parse(readFileSync(DATA, 'utf8'));

const html = readFileSync(TEMPLATE, 'utf8')
  .replace('/*__FONTS__*/', faces)
  // </script> inside a JSON string would close the host <script> early
  .replace('/*__DATA__*/', JSON.stringify(data).replace(/<\//g, '<\\/'));

writeFileSync(OUT, html);

const kb = (n) => (n / 1024).toFixed(0) + 'KB';
console.log(`wrote ${path.relative(ROOT, OUT)} (${kb(Buffer.byteLength(html))})`);
console.log(`  ${FONTS.length} fonts inlined · ${data.matches.length} matches · ${kb(Buffer.byteLength(JSON.stringify(data)))} of data`);
