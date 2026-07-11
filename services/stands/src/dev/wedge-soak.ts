/**
 * WEDGE SOAK (tonight-gate) — hunt the Jul 11 NOR–ENG production wedge.
 *
 * Drives the REAL server (createStandsServer → the exact broadcastToMatch
 * dispatch both TXLINE and REPLAY ingest use) with the REAL captured wire of
 * the incident night (fixture 18213979, extracted from the long-running
 * recorder's night files) at REPLAY_SPEED, optionally alongside a second
 * match (SUI–COL 18202783) to match the two-fixture TXLINE pattern, while a
 * separate client process (wedge-clients.ts) supplies stable watchers, join
 * churn, and real fan actions.
 *
 * Instrumentation printed every 2s as one JSON line (prefix `[soak]`):
 *   - event-loop delay histogram (p50/p99/max) via monitorEventLoopDelay
 *   - event-loop utilization delta via performance.eventLoopUtilization
 *   - per-window broadcast dispatch cost, bucketed BY MESSAGE TYPE
 *     (count / total µs / max µs) — if per-message cost GROWS with
 *     accumulated state, the type column says where
 *   - heapUsed / rss / external MB, ws client count
 *
 * Usage:
 *   WEDGE_ODDS_A=<tape> WEDGE_SCORES_A=<tape> [WEDGE_ODDS_B= WEDGE_SCORES_B=]
 *   WEDGE_SPEED=30 tsx src/dev/wedge-soak.ts
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const CHECK_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rooot-wedge-soak-'));
process.env.STANDS_DATA_DIR = CHECK_DATA_DIR;
process.env.PORT = process.env.WEDGE_PORT ?? '8791';

const SPEED = Number(process.env.WEDGE_SPEED ?? 30);
const FIXTURE_A = process.env.WEDGE_FIXTURE_A ?? '18213979';
const FIXTURE_B = process.env.WEDGE_FIXTURE_B ?? '18202783';
const REPORT_MS = Number(process.env.WEDGE_REPORT_MS ?? 2000);

interface TypeStat { n: number; totalUs: number; maxUs: number; }

async function main(): Promise<void> {
  const { createStandsServer } = await import('../server');
  const { startReplayIngest } = await import('../ingest/replay');

  const { httpServer, wss, broadcastToMatch } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(Number(process.env.PORT), resolve));
  console.log(`[soak] server up on :${process.env.PORT} data=${CHECK_DATA_DIR} speed=${SPEED}x`);

  /* ── instrumentation state ── */
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();
  let elu = performance.eventLoopUtilization();
  let window: Map<string, TypeStat> = new Map();
  const cumulative: Map<string, TypeStat> = new Map();
  const t0 = Date.now();

  function timeDispatch(fixtureId: string, msg: { type: string }): void {
    const a = performance.now();
    broadcastToMatch(fixtureId, msg as never);
    const us = (performance.now() - a) * 1000;
    for (const m of [window, cumulative]) {
      let s = m.get(msg.type);
      if (!s) { s = { n: 0, totalUs: 0, maxUs: 0 }; m.set(msg.type, s); }
      s.n++; s.totalUs += us; if (us > s.maxUs) s.maxUs = us;
    }
  }

  /* ── replay the real night, both streams, optionally two matches ── */
  const tapes: Array<[string, string | undefined]> = [
    [FIXTURE_A, process.env.WEDGE_ODDS_A],
    [FIXTURE_A, process.env.WEDGE_SCORES_A],
    [FIXTURE_B, process.env.WEDGE_ODDS_B],
    [FIXTURE_B, process.env.WEDGE_SCORES_B],
  ];
  let pending = 0;
  for (const [fixtureId, file] of tapes) {
    if (!file) continue;
    pending++;
    startReplayIngest({
      file,
      fixtureId,
      speed: SPEED,
      onFeedMsg: (msg) => timeDispatch(fixtureId, msg),
      onDone: () => {
        pending--;
        console.log(`[soak] tape done: ${path.basename(file)} (${pending} still playing)`);
      },
    });
    console.log(`[soak] tape armed: ${path.basename(file)} as ${fixtureId}`);
  }
  if (pending === 0) {
    console.error('[soak] no tapes given (WEDGE_ODDS_A etc.) — nothing to soak');
    process.exit(2);
  }

  /* ── the 2s report ── */
  const report = setInterval(() => {
    const eluNow = performance.eventLoopUtilization();
    const eluDelta = performance.eventLoopUtilization(eluNow, elu);
    elu = eluNow;
    const mem = process.memoryUsage();
    const types: Record<string, { n: number; avgUs: number; maxUs: number }> = {};
    for (const [t, s] of window) types[t] = { n: s.n, avgUs: Math.round(s.totalUs / s.n), maxUs: Math.round(s.maxUs) };
    const line = {
      tSec: Math.round((Date.now() - t0) / 1000),
      lagMsP50: +(loopDelay.percentile(50) / 1e6).toFixed(1),
      lagMsP99: +(loopDelay.percentile(99) / 1e6).toFixed(1),
      lagMsMax: +(loopDelay.max / 1e6).toFixed(1),
      elu: +eluDelta.utilization.toFixed(3),
      heapMB: Math.round(mem.heapUsed / 1e6),
      rssMB: Math.round(mem.rss / 1e6),
      wsClients: wss.clients.size,
      types,
    };
    console.log(`[soak] ${JSON.stringify(line)}`);
    loopDelay.reset();
    window = new Map();
    if (pending === 0) {
      clearInterval(report);
      const cum: Record<string, { n: number; avgUs: number; maxUs: number }> = {};
      for (const [t, s] of cumulative) cum[t] = { n: s.n, avgUs: Math.round(s.totalUs / s.n), maxUs: Math.round(s.maxUs) };
      console.log(`[soak] CUMULATIVE ${JSON.stringify(cum)}`);
      console.log('[soak] all tapes done — exiting in 5s');
      setTimeout(() => {
        httpServer.close();
        rmSync(CHECK_DATA_DIR, { recursive: true, force: true });
        process.exit(0);
      }, 5000);
    }
  }, REPORT_MS);
}

main().catch((err) => {
  console.error('[soak] FATAL', err);
  process.exit(1);
});
