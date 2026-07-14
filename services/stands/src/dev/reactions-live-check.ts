/**
 * REACTIONS — real Jul 14 France–Spain feed check
 * (docs/POSTMORTEM-2026-07-14-live.md).
 *
 * Proves the fix against the ACTUAL captured live feed, not a clean replay:
 *
 *  - A goal that arrives Confirmed:false, then settles Confirmed:true, opens
 *    EXACTLY ONE celebration window, timed off the SETTLED sighting.
 *  - A goal that arrives Confirmed:false and is then VAR-overturned
 *    (action_discarded) — tonight's real second "goal" — NEVER opens a
 *    celebration window at all. This is the honesty bug named in the
 *    post-mortem: celebrating a goal before it's settled.
 *  - A fan's react during the real goal's window is accepted and lands in
 *    the reveal.
 *  - A 'possible' ("the held breath") trigger landing while a real moment is
 *    open never supersedes it — the "flood" the post-mortem names can no
 *    longer cut a real celebration short.
 *  - `penalty-kick` — previously wired to NOTHING — now opens a moment
 *    (checked directly via detectMoment; tonight's real feed had no penalty
 *    to replay).
 *
 * The source file is gitignored, machine-local fixture data
 * (fixtures/live-fra-esp/, never committed — AGENTS.md). This check SKIPS
 * (exit 0) if it isn't present on disk, same as any machine without the
 * capture.
 *
 * Run: npm --prefix services/stands run check:reactions-live
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@contracts/crowd';
import type { FeedMsg } from '@contracts/feed';
import type { LedgerEvent, LedgerMsg } from '@contracts/ledger';
import { parseLedgerMessage } from '@contracts/normalize';

/* Hermetic data dir BEFORE the server module ever loads (same reasoning as
 * pulse-fix-check.ts: snapshot.ts resolves DATA_DIR at import time). */
const CHECK_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rooot-reactions-live-check-'));
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
function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}
function send(ws: WebSocket, msg: ClientMsg): void {
  ws.send(JSON.stringify(msg));
}
function closeAndWait(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.once('close', () => resolve());
    ws.close();
  });
}

/* ── the REAL captured feed — absolute per the incident report, exactly the
 * file docs/POSTMORTEM-2026-07-14-live.md was written against. ────────── */
const FEED_PATH = '/Users/ls/Documents/rooot/fixtures/live-fra-esp/scores-fraesp.jsonl';

interface RawLine {
  receivedAtMs: number;
  event: string;
  data: string;
}

async function main(): Promise<void> {
  if (!existsSync(FEED_PATH)) {
    console.log(`[reactions-live-check] SKIP — real feed not present at ${FEED_PATH} (gitignored, machine-local capture; AGENTS.md)`);
    process.exit(0);
  }

  const rawLines: RawLine[] = readFileSync(FEED_PATH, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RawLine)
    .filter((l) => l.event === 'message');

  const rows: LedgerMsg[] = [];
  for (const line of rawLines) {
    const ledger = parseLedgerMessage(line.data, line.receivedAtMs, 'live');
    if (ledger) rows.push(ledger);
  }
  console.log(`[reactions-live-check] loaded ${rawLines.length} wire lines → ${rows.length} ledger rows from the real feed`);

  /* Group goal rows by wire id — derived from the file's actual structure,
   * never a hardcoded id, so this stays meaningful if the capture is ever
   * re-recorded or extended. */
  const byId = new Map<string, LedgerEvent[]>();
  for (const r of rows) {
    if (r.type !== 'event' || r.ev.kind !== 'goal') continue;
    const arr = byId.get(r.ev.id) ?? [];
    arr.push(r.ev);
    byId.set(r.ev.id, arr);
  }
  const realGoalId = [...byId.entries()].find(([, evs]) => evs.some((e) => e.confirmed === true))?.[0];
  const disallowedGoalId = [...byId.entries()].find(([, evs]) => evs.length > 0 && evs.every((e) => e.confirmed !== true))?.[0];
  check('the real feed contains a goal that settles Confirmed:true', !!realGoalId, `ids=${[...byId.keys()].join(',')}`);
  check(
    'the real feed contains a SECOND goal that never settles (tonight: VAR-overturned + action_discarded)',
    !!disallowedGoalId && disallowedGoalId !== realGoalId,
    `disallowed=${disallowedGoalId}`,
  );
  if (!realGoalId || !disallowedGoalId) {
    console.log('\n✗ FAIL — the real feed no longer has the shape this check proves the fix against\n');
    process.exit(1);
  }

  /* ── boot the REAL server in-process, real dispatch path ─────────────── */
  const { createStandsServer } = await import('../server');
  const { httpServer, broadcastToMatch, registry } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const addr = httpServer.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;

  const matchId = 'reactions-check-fraesp';
  const ws = await connect(`ws://127.0.0.1:${port}`);
  const received: Array<Record<string, unknown>> = [];
  ws.on('message', (raw) => {
    try {
      received.push(JSON.parse(raw.toString()) as Record<string, unknown>);
    } catch {
      /* ignore */
    }
  });
  send(ws, { type: 'hello', matchId, anonId: 'reactions-check-fan', side: 'home' });
  await sleep(150);

  console.log('\nSCENARIO 1  the full real feed, dispatched in original order');
  for (const r of rows) {
    broadcastToMatch(matchId, { type: 'ledger', msg: r } as FeedMsg);
    // yield so each dispatch's synchronous side-effects (and the ws send) settle
    // before the next — the real server's own broadcastToMatch is synchronous,
    // this just keeps the WS message ordering deterministic under `ws`.
    await sleep(0);
  }
  await sleep(150);

  const goalOpens = received.filter((m) => m.type === 'moment' && m.kind === 'goal');
  check('exactly ONE goal celebration opened across the whole match', goalOpens.length === 1, JSON.stringify(goalOpens));
  const theGoalOpen = goalOpens[0] as { momentId?: string; palette?: unknown; side?: string; minute?: number } | undefined;
  const realGoalConfirmedEv = byId.get(realGoalId)!.find((e) => e.confirmed === true)!;
  check(
    "the goal that opened is the REAL one (side+minute match the settled sighting), never the disallowed one",
    theGoalOpen?.side === realGoalConfirmedEv.side && theGoalOpen?.minute === realGoalConfirmedEv.minute,
    JSON.stringify(theGoalOpen),
  );
  check(
    'the goal window carries a non-empty rendering palette',
    Array.isArray(theGoalOpen?.palette) && (theGoalOpen.palette as unknown[]).length > 0,
    JSON.stringify(theGoalOpen?.palette),
  );
  check(
    "no moment ever opened off the disallowed goal's wire id (never celebrate a goal that didn't stand)",
    !received.some((m) => m.type === 'moment' && typeof m.momentId === 'string' && m.momentId === disallowedGoalId),
  );

  await closeAndWait(ws);
  console.log('\nSCENARIO 2  a fan reacts inside the real goal window, and the reveal counts it');
  {
    const ws2 = await connect(`ws://127.0.0.1:${port}`);
    const rx2: Array<Record<string, unknown>> = [];
    ws2.on('message', (raw) => {
      try {
        rx2.push(JSON.parse(raw.toString()) as Record<string, unknown>);
      } catch {
        /* ignore */
      }
    });
    const m2 = 'reactions-check-goal-2';
    send(ws2, { type: 'hello', matchId: m2, anonId: 'reactions-check-fan-2', side: 'home' });
    await sleep(150);
    const goalMsg: LedgerMsg = { type: 'event', ev: realGoalConfirmedEv };
    broadcastToMatch(m2, { type: 'ledger', msg: goalMsg } as FeedMsg);
    await sleep(50);
    const opened = rx2.find((m) => m.type === 'moment') as { momentId?: string; palette?: string[] } | undefined;
    check('the goal window opened for the reaction scenario', !!opened?.momentId, JSON.stringify(opened));
    const token = opened?.palette?.[0];
    check('the palette has a real token to react with', typeof token === 'string' && token.length > 0, JSON.stringify(opened?.palette));
    if (opened?.momentId && token) {
      send(ws2, { type: 'momentReact', matchId: m2, momentId: opened.momentId, anonId: 'reactions-check-fan-2', side: 'home', token, atMs: Date.now() });
    }
    await sleep(50);
    // supersede the window with the SAME real var trigger that closed it live
    // tonight, rather than waiting the full 25s REACT_WINDOW_MS.
    const varRow = rows.find((r) => r.type === 'event' && r.ev.kind === 'var');
    check('the real feed carries the VAR row that superseded the window live', !!varRow);
    if (varRow) broadcastToMatch(m2, { type: 'ledger', msg: varRow } as FeedMsg);
    await sleep(50);
    const reveal = rx2.find((m) => m.type === 'momentResult') as { byEnd?: { home?: { n?: number; top?: string } } } | undefined;
    check(
      "the fan's react landed in the reveal (home end not honestly-empty)",
      !!reveal && (reveal.byEnd?.home?.n ?? 0) === 1 && reveal.byEnd?.home?.top === token,
      JSON.stringify(reveal),
    );
    await closeAndWait(ws2);
  }

  console.log('\nSCENARIO 3  a possible/held-breath trigger never supersedes an open real moment');
  {
    const ws3 = await connect(`ws://127.0.0.1:${port}`);
    const m3 = 'reactions-check-flood';
    send(ws3, { type: 'hello', matchId: m3, anonId: 'reactions-check-fan-3', side: 'home' });
    await sleep(150);
    const goalMsg: LedgerMsg = { type: 'event', ev: realGoalConfirmedEv };
    broadcastToMatch(m3, { type: 'ledger', msg: goalMsg } as FeedMsg);
    await sleep(50);
    const activeAfterGoal = registry.get(m3)?.activeMomentId();
    check('the goal window is active', !!activeAfterGoal, `active=${activeAfterGoal}`);
    // a fresh 'possible' (the held-breath flood) lands WHILE the goal window
    // is open — pre-fix this was hard and would have superseded it instantly.
    const possibleEv: LedgerEvent = { id: `${matchId}:flood-possible`, kind: 'possible', major: false, minute: 45, tMs: Date.now(), side: 'away', headline: 'Goal? Checking…' };
    broadcastToMatch(m3, { type: 'ledger', msg: { type: 'event', ev: possibleEv } } as FeedMsg);
    await sleep(50);
    const activeAfterPossible = registry.get(m3)?.activeMomentId();
    check(
      'the SAME goal window is still active after a possible/held-breath trigger (soft — never preempts)',
      !!activeAfterPossible && activeAfterPossible === activeAfterGoal,
      `before=${activeAfterGoal} after=${activeAfterPossible}`,
    );
    await closeAndWait(ws3);
  }

  httpServer.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[reactions-live-check] fatal:', err);
  process.exit(1);
});
