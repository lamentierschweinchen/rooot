/**
 * ROOOT relics — DEV HARNESS entry (owned by the relics lane).
 *
 * Renders all four print generators onto the page at fit-to-screen size, each with a
 * ⤓ PNG download button (full-resolution). On a Newsprint page. NOT the product UI —
 * a deliberately utilitarian bench for verifying the relics against their canon.
 *
 * Data: the REAL AUS–EGY market arc (aus-egy.arc.json — buildMatchArc's cached output,
 * parsed through contracts/normalize) + the SYNTHETIC dev-specimen fan/crowd layered on
 * by buildRelicData. Every caption carries "SPECIMEN"; provenance is DEV-SPECIMEN.
 *
 * These are STATIC renders: each canvas is painted ONCE on load (no RAF). If a canvas
 * ever captured blank in a hidden tab, we still report toDataURL length + a drawn-pixel
 * probe so the render is verifiable without a visible paint.
 */

import {
  buildMatchRelicDataFromArc,
  buildCardDataFromMatch,
  buildStubDataFromMatch,
  buildPosterEdition,
  type MatchArc,
} from './buildRelicData';
import { renderCard, CARD_SIZE } from './renderCard';
import { renderStub, STUB_SIZE } from './renderStub';
import { renderPoster, POSTER_SIZE } from './renderPoster';
import { renderScarfStrip, SCARF_SIZE } from './renderScarfStrip';
import { ensureRelicFonts } from './paint';
import arcJson from './aus-egy.arc.json';

interface RelicSpec {
  key: string;
  title: string;
  subtitle: string;
  size: { w: number; h: number };
  render: () => HTMLCanvasElement;
}

/** A non-blank probe: count non-transparent, non-uniform pixels via a downscale. */
function drawnPixelProbe(canvas: HTMLCanvasElement): { nonEmpty: number; sampled: number; distinctColors: number } {
  const s = document.createElement('canvas');
  s.width = 64;
  s.height = 64;
  const sctx = s.getContext('2d');
  if (!sctx) return { nonEmpty: 0, sampled: 0, distinctColors: 0 };
  sctx.drawImage(canvas, 0, 0, 64, 64);
  const data = sctx.getImageData(0, 0, 64, 64).data;
  let nonEmpty = 0;
  const colors = new Set<number>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a > 8) nonEmpty++;
    const key = (data[i]! >> 4) << 8 | (data[i + 1]! >> 4) << 4 | (data[i + 2]! >> 4);
    colors.add(key);
  }
  return { nonEmpty, sampled: 64 * 64, distinctColors: colors.size };
}

export function boot(root: HTMLElement): void {
  const arc = arcJson as unknown as MatchArc;
  const match = buildMatchRelicDataFromArc(arc);
  const card = buildCardDataFromMatch(match);
  const stub = buildStubDataFromMatch(match);

  const specs: RelicSpec[] = [
    {
      key: 'card',
      title: 'THE CARD',
      subtitle: `renderCard · 5:7 · ${CARD_SIZE.w}×${CARD_SIZE.h} · the fan's match`,
      size: CARD_SIZE,
      render: () => renderCard(card),
    },
    {
      key: 'stub',
      title: 'THE STUB',
      subtitle: `renderStub · 2:1 · ${STUB_SIZE.w}×${STUB_SIZE.h} · the call receipt (PROVED)`,
      size: STUB_SIZE,
      render: () => renderStub(stub),
    },
    {
      key: 'poster',
      title: 'THE POSTER',
      subtitle: `renderPoster · 2:3 · ${POSTER_SIZE.w}×${POSTER_SIZE.h} · the match as a print`,
      size: POSTER_SIZE,
      render: () => renderPoster(match, buildPosterEdition(match)),
    },
    {
      key: 'scarf',
      title: 'THE SCARF SEGMENT',
      subtitle: `renderScarfStrip · knit spike · ${SCARF_SIZE.w}×${SCARF_SIZE.h} · [stretch]`,
      size: SCARF_SIZE,
      render: () => renderScarfStrip(match),
    },
  ];

  // header
  const header = document.createElement('div');
  header.className = 'relic-header';
  header.innerHTML = `
    <div class="relic-badge">ROOOT · RELIC BENCH — DEV SPECIMEN (not a real relic)</div>
    <div class="relic-meta">AUS–EGY · final 1–1 · Egypt 12' · Australia 54' (OG) · ${arc.tickCount} market ticks · ${arc.oddsPath.length} path points · market REAL, fan SYNTHETIC</div>
  `;
  root.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'relic-grid';
  root.appendChild(grid);

  const report: string[] = [];

  ensureRelicFonts().then(() => {
    for (const spec of specs) {
      const cell = document.createElement('figure');
      cell.className = 'relic-cell';

      const t0 = performance.now();
      let canvas: HTMLCanvasElement;
      try {
        canvas = spec.render();
      } catch (err) {
        const errBox = document.createElement('div');
        errBox.className = 'relic-error';
        errBox.textContent = `${spec.key} render threw: ${String(err)}`;
        cell.appendChild(errBox);
        grid.appendChild(cell);
        report.push(`${spec.key}: THREW ${String(err)}`);
        continue;
      }
      const ms = performance.now() - t0;

      // fit-to-screen display (canvas is full-res; CSS scales it down)
      canvas.className = 'relic-canvas';
      canvas.style.aspectRatio = `${spec.size.w} / ${spec.size.h}`;

      const cap = document.createElement('figcaption');
      cap.className = 'relic-cap';
      const probe = drawnPixelProbe(canvas);
      const url = canvas.toDataURL('image/png');
      cap.innerHTML = `
        <div class="relic-title">${spec.title}</div>
        <div class="relic-sub">${spec.subtitle}</div>
        <div class="relic-stats">render ${ms.toFixed(1)} ms · png ${(url.length / 1024).toFixed(0)} KB · probe ${probe.nonEmpty}/${probe.sampled} inked · ${probe.distinctColors} colours</div>
      `;

      const dl = document.createElement('button');
      dl.className = 'relic-dl';
      dl.textContent = '⤓ PNG';
      dl.title = `download ${spec.key} at ${spec.size.w}×${spec.size.h}`;
      dl.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `rooot-${spec.key}-aus-egy-specimen.png`;
        a.click();
      });

      const canvasWrap = document.createElement('div');
      canvasWrap.className = 'relic-canvas-wrap';
      canvasWrap.appendChild(canvas);
      canvasWrap.appendChild(dl);

      cell.appendChild(canvasWrap);
      cell.appendChild(cap);
      grid.appendChild(cell);

      report.push(
        `${spec.key}: ${ms.toFixed(1)}ms, png ${(url.length / 1024).toFixed(0)}KB, probe ${probe.nonEmpty}/${probe.sampled} inked, ${probe.distinctColors} colours`,
      );
    }

    // machine-readable report block (for headless verification)
    const pre = document.createElement('pre');
    pre.id = 'relic-report';
    pre.className = 'relic-report';
    pre.textContent = report.join('\n');
    root.appendChild(pre);
    (window as unknown as Record<string, unknown>)['__relicReport'] = report;
    console.log('[relics] rendered', report.length, 'relics\n' + report.join('\n'));
  });
}
