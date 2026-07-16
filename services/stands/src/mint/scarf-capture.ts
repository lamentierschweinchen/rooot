/**
 * captureScarfPng — headless re-render of the fan's SEALED loom keepsake → PNG, the on-chain
 * scarf cover's TOP tier: the actual cloth the fan watched weave, their rooted selvage + call
 * knots woven in. Adapted from design/scarf-artwork/loom-keepsake-capture.mjs (which stays the
 * design-lane reference); this is the in-service copy the Fly mint runs.
 *
 * Loads the DEPLOYED loom (`${base}/woven-loom.html?keepsake&export=1&match=<id>`) with the fan's
 * cloth record injected on `window.__loomKeepsakeRecord` BEFORE boot (addInitScript). Export mode
 * settles instantly, unclips the scroll, neutralises the seal's print animation, and sets
 * `<html data-loom="sealed">` once the cloth is drawn — the one thing to wait on. Screenshots
 * `#loomsvg` (the cloth + its seal footer) at 2x.
 *
 * Returns `null` on ANY failure, an invalid record, or a non-sealed render — the caller falls back
 * to scarf-svg → gradient, so a capture problem never mints the wrong match or a blank cloth.
 *
 * Chromium ships in the Fly image (Dockerfile: `npx playwright install --with-deps chromium`);
 * `--no-sandbox` is required to launch it as root inside the container.
 */
import { chromium, type Browser } from 'playwright';

/** The sealed cloth seed woven-loom.html's writeCloth() stores (design/scarf-artwork/CAPTURE-RECIPE.md). */
export interface ClothRecord {
  v: number;
  fx: string;
  home: { tri: string; ink: string };
  away: { tri: string; ink: string };
  score: [number, number];
  root?: 'home' | 'away' | null;
  calls?: Array<{ m: number; k: string; sub: string; hit: boolean | null; id: string }>;
  [k: string]: unknown;
}

export function validClothRecord(r: unknown): r is ClothRecord {
  const c = r as ClothRecord | null;
  return !!c && c.v === 1 && typeof c.fx === 'string' && !!c.home && !!c.away && Array.isArray(c.score);
}

export async function captureScarfPng(
  record: unknown,
  opts: { base: string; matchId: string; timeoutMs?: number },
): Promise<Buffer | null> {
  if (!validClothRecord(record)) return null;
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    // runs in the BROWSER (Playwright stringifies it); globalThis === window there, and it keeps
    // the Node service's tsconfig (no DOM lib) happy.
    await page.addInitScript((r) => {
      (globalThis as unknown as { __loomKeepsakeRecord: unknown }).__loomKeepsakeRecord = r;
    }, record);
    const url = `${opts.base.replace(/\/$/, '')}/woven-loom.html?keepsake=1&export=1&match=${encodeURIComponent(opts.matchId)}`;
    await page.goto(url, { waitUntil: 'load', timeout: opts.timeoutMs ?? 20000 });
    let state = 'timeout';
    try {
      await page.waitForSelector('html[data-loom]', { timeout: 8000 });
      state = (await page.getAttribute('html', 'data-loom')) ?? 'timeout';
    } catch {
      /* fall through — non-sealed returns null below */
    }
    if (state !== 'sealed') {
      await browser.close();
      return null; // empty / timeout — never mint a blank or wrong cloth
    }
    await page.evaluate(async () => {
      await (globalThis as unknown as { document: { fonts: { ready: Promise<unknown> } } }).document.fonts.ready;
    });
    await page.waitForTimeout(500); // weave-tile PNG patterns settle
    const svg = await page.$('#loomsvg');
    if (!svg) {
      await browser.close();
      return null;
    }
    const shot = await svg.screenshot({ type: 'png' });
    await browser.close();
    return Buffer.from(shot);
  } catch {
    try {
      if (browser) await browser.close();
    } catch {
      /* ignore close errors */
    }
    return null;
  }
}
