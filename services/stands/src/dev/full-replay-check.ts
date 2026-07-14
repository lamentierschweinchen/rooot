/**
 * FULL-REPLAY CHECK (tonight-gate) — the strongest single piece of evidence
 * from the Pulse investigation, made permanent: ALL 1722 real captured
 * messages from the FRA-MAR archive capture
 * (services/stands/captures/premiere-fra-mar-18209181-919c9af.json), in their
 * original captured order, driven through the REAL dispatch path
 * (createStandsServer's broadcastToMatch — the exact function routeFeedMsg
 * calls for both TXLINE and REPLAY ingest) with a real ws fan connected,
 * asserting:
 *
 *   1. at least the KNOWN moment count opens (every distinct GENUINELY hard
 *      trigger in the capture — confirmed goal/red-card/var/penalty-kick
 *      ledger ids + the FULL_TIME status — must open exactly one window; the
 *      expected total is COMPUTED from the capture, then cross-checked
 *      against the known figure for this file, 5, so a silently-changed
 *      capture can't hollow the check out),
 *   2. each goal id that actually SETTLES (confirmed:true somewhere in the
 *      capture) opened EXACTLY once — the capture carries the wire's real
 *      re-emissions (7 goal messages, 3 distinct ids), so this also proves
 *      dedup over real re-emission shapes — and the one goal id that never
 *      settles in this capture window (still Confirmed:false when the
 *      recording ends) opened ZERO times,
 *   3. ZERO pipeline error lines (the broadcastToMatch fan-out isolation
 *      catches: rememberForJoin/feedSentiment/predictLifecycle/
 *      momentLifecycle/close-timer/crystallize) across the whole replay.
 *
 * Context (narrative, corrected per review): Jul 10 ESP-BEL was PROVEN
 * server-side Pulse silence — the volume's persisted openedTriggerIds for
 * 18218149 stayed empty through three goals with dedup persistence live. Jul
 * 9 FRA-MAR was a different, client-side failure (six windows opened
 * server-side; the client never subscribed — since fixed). This check is the
 * standing proof that the server pipeline, fed the real wire, opens the real
 * moments — if a live match ever goes silent again while this stays green,
 * the cause is environmental (and the hard-trigger breadcrumb log in
 * momentLifecycle will say exactly how far triggers got).
 *
 * Post docs/POSTMORTEM-2026-07-14-live.md (Jul 14 FRA-ESP): 'possible' — the
 * held-breath "checking…" trigger — moved from hard to SOFT (it must never
 * supersede a real hard moment; this capture alone carries 24 of them, and
 * treating every one as hard is exactly the "flood" the post-mortem names),
 * and a 'goal' trigger now requires `confirmed === true` (never celebrate a
 * goal that hasn't settled). Both changes are proven here against a SECOND
 * real capture, independent of the FRA-ESP feed the fix was diagnosed
 * against: this file's own 18209181:495 sits at Confirmed:false with no
 * later re-emission in the recorded window (the capture ends before it
 * settles either way) — exactly the shape that must open NO celebration.
 * `penalty-kick` — previously wired to nothing — now opens too; this capture
 * happens to carry one real penalty (18209181:302), so it is proof, not
 * just theory.
 *
 * Hermetic: STANDS_DATA_DIR is pointed at a fresh temp dir BEFORE the server
 * module loads (snapshot.ts resolves DATA_DIR at import time — hence the
 * dynamic import), so a stale /tmp snapshot from an earlier dev run can
 * never restore openedTriggerIds for 18209181 and dedupe this replay's
 * moments away (which would look like the very bug this file guards against).
 *
 * Usage: tsx src/dev/full-replay-check.ts (or: npm run check:full-replay)
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const CHECK_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rooot-full-replay-check-'));
process.env.STANDS_DATA_DIR = CHECK_DATA_DIR;

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ── the real capture ─────────────────────────────────────────────────── */
const CAPTURE_PATH = new URL('../../captures/premiere-fra-mar-18209181-919c9af.json', import.meta.url);
const CAPTURE_MATCH = '18209181';
interface CaptureMsg {
  type?: string;
  msg?: { type?: string; ev?: { kind?: string; id?: string } };
  ev?: { phase?: string };
}
const capture = JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as { messages: CaptureMsg[] };

/** Every distinct GENUINELY hard trigger the capture carries — computed the
 * same way detectMoment classifies them post-fix
 * (docs/POSTMORTEM-2026-07-14-live.md): red-card/var/penalty-kick ledger
 * events are unconditionally hard with sourceId = ev.id; a goal event is
 * hard ONLY if some sighting of that same wire id reaches `confirmed: true`
 * (never celebrate a goal that hasn't settled — an id that stays
 * Confirmed:false for its entire life in the capture must open NOTHING);
 * FULL_TIME status is hard with `${matchId}:ft`. 'possible' is deliberately
 * EXCLUDED here — it is soft now, so whether it opens depends on timing
 * (nothing else active + past cooldown), not a fixed per-id count; that
 * behavior is covered by services/stands/src/dev/reactions-live-check.ts
 * Scenario 3 instead. Soft triggers (near-miss/swing) were never counted
 * here either. */
const HARD_LEDGER_KINDS = new Set(['red-card', 'var', 'penalty-kick']);
const hardIds = new Set<string>();
const goalIdsAll = new Set<string>();
const goalIdsConfirmed = new Set<string>();
let sawFullTime = false;
for (const m of capture.messages) {
  if (m.type === 'ledger' && m.msg?.type === 'event' && m.msg.ev?.id && HARD_LEDGER_KINDS.has(m.msg.ev.kind ?? '')) {
    hardIds.add(m.msg.ev.id);
  }
  if (m.type === 'ledger' && m.msg?.type === 'event' && m.msg.ev?.kind === 'goal' && m.msg.ev.id) {
    goalIdsAll.add(m.msg.ev.id);
    if ((m.msg.ev as { confirmed?: boolean }).confirmed === true) goalIdsConfirmed.add(m.msg.ev.id);
  }
  if (m.type === 'status' && m.ev?.phase === 'FULL_TIME') sawFullTime = true;
}
const FT_ID = `${CAPTURE_MATCH}:ft`;
const expectedHard = hardIds.size + goalIdsConfirmed.size + (sawFullTime ? 1 : 0);
/** The known figure for THIS capture file (2 confirmed goals — a 3rd,
 * 18209181:495, stays Confirmed:false all through the capture and must NOT
 * open — + 1 var + 1 penalty-kick + 1 full-time) — cross-checked below so a
 * silently-swapped capture can't turn the whole check vacuous. */
const KNOWN_MOMENT_COUNT = 5;

/* ── pipeline error interception — console.warn is the pipeline's error
 * channel; any of these markers during the replay is a failure. ─────────── */
const PIPELINE_ERROR_MARKERS = [
  '[stands] rememberForJoin error',
  '[sentiment] feed error',
  '[predict] lifecycle error',
  '[moment] lifecycle error',
  '[moment] close error',
  '[sentiment] crystallize failed',
];
const pipelineErrors: string[] = [];
const origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const s = args.map(String).join(' ');
  if (PIPELINE_ERROR_MARKERS.some((m) => s.includes(m))) pipelineErrors.push(s);
  origWarn(...args);
};

async function main(): Promise<void> {
  console.log(`[full-replay-check] capture: ${capture.messages.length} real messages, ${goalIdsAll.size} distinct goal ids (${goalIdsConfirmed.size} settle), expected hard moments=${expectedHard}`);
  check('capture sanity: the computed hard-trigger count matches the known figure for this capture file', expectedHard === KNOWN_MOMENT_COUNT, `computed=${expectedHard} known=${KNOWN_MOMENT_COUNT}`);
  check('capture sanity: 3 distinct real goal ids (2 settling) + a FULL_TIME status present', goalIdsAll.size === 3 && goalIdsConfirmed.size === 2 && sawFullTime, `goals=${[...goalIdsAll].join(',')} confirmed=${[...goalIdsConfirmed].join(',')} ft=${sawFullTime}`);

  // dynamic import so CHECK_DATA_DIR is already in env when snapshot.ts
  // resolves DATA_DIR at module load (see the header comment).
  const { createStandsServer } = await import('../server');
  const { httpServer, broadcastToMatch } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const addr = httpServer.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  console.log(`[full-replay-check] server up on :${port}`);

  try {
    // a real fan, helloed in — mirrors the live incident condition (the
    // terrace was live-wired and connected; the failure was server-side).
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const momentOpens: Array<{ momentId: string; kind: string }> = [];
    let momentResults = 0;
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString()) as { type?: string; momentId?: string; kind?: string };
        if (m.type === 'moment' && m.momentId && m.kind) momentOpens.push({ momentId: m.momentId, kind: m.kind });
        if (m.type === 'momentResult') momentResults++;
      } catch {
        /* ignore */
      }
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({ type: 'hello', matchId: CAPTURE_MATCH, anonId: 'full-replay-fan', side: 'home' }));
    await sleep(150);

    console.log(`[full-replay-check] dispatching all ${capture.messages.length} captured messages through broadcastToMatch, in original order...`);
    let dispatched = 0;
    for (const m of capture.messages) {
      broadcastToMatch(CAPTURE_MATCH, m as never);
      dispatched++;
      // yield every 200 dispatches so the client socket can flush — the
      // counting client is in this same process/event loop.
      if (dispatched % 200 === 0) await new Promise((r) => setImmediate(r));
    }
    await sleep(500); // settle: let every queued ws delivery land
    console.log(`[full-replay-check] replay complete: ${dispatched} dispatched, ${momentOpens.length} moment opens, ${momentResults} reveals, ${pipelineErrors.length} pipeline errors`);

    check(
      `at least the known moment count (${expectedHard}) opens across the full real replay`,
      momentOpens.length >= expectedHard,
      `opens=${momentOpens.length}`,
    );
    const opensById = new Map<string, number>();
    for (const o of momentOpens) opensById.set(o.momentId, (opensById.get(o.momentId) ?? 0) + 1);
    const confirmedGoalsOpenedOnce = [...goalIdsConfirmed].every((id) => opensById.get(id) === 1);
    check(
      'every goal id that SETTLES opened EXACTLY once (the capture carries 7 goal re-emissions across 3 ids — dedup over real wire shapes)',
      confirmedGoalsOpenedOnce,
      `confirmed goals=${[...goalIdsConfirmed].map((id) => `${id}:${opensById.get(id) ?? 0}`).join(' ')}`,
    );
    const unconfirmedGoalIds = [...goalIdsAll].filter((id) => !goalIdsConfirmed.has(id));
    check(
      "the goal id that never settles in this capture (still Confirmed:false when the recording ends) opened ZERO times — honesty: never celebrate a goal that hasn't stood (docs/POSTMORTEM-2026-07-14-live.md)",
      unconfirmedGoalIds.length === 1 && (opensById.get(unconfirmedGoalIds[0]!) ?? 0) === 0,
      `unconfirmed=${unconfirmedGoalIds.map((id) => `${id}:${opensById.get(id) ?? 0}`).join(' ')}`,
    );
    check('the full-time moment opened exactly once', opensById.get(FT_ID) === 1, `ft opens=${opensById.get(FT_ID) ?? 0}`);
    check(
      'every superseded window revealed (momentResult count is opens-1 or opens — only the last window may still be open)',
      momentResults >= momentOpens.length - 1,
      `results=${momentResults} opens=${momentOpens.length}`,
    );
    check('ZERO pipeline error logs across the whole replay', pipelineErrors.length === 0, pipelineErrors.slice(0, 3).join(' | '));

    ws.close();
  } finally {
    httpServer.close();
    rmSync(CHECK_DATA_DIR, { recursive: true, force: true });
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[full-replay-check] FATAL', err);
  process.exit(1);
});
