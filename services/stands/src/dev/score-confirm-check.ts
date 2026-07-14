/**
 * SCORE-CONFIRM CHECK (honesty law #1 — never render a goal that didn't stand).
 *
 * The Jul 14 FRA–ESP incident: the app showed France 0–3 Spain when Spain's 3rd
 * goal was disallowed for offside — the true score was 0–2. Root cause: the
 * score channel is STATELESS (contracts/normalize.ts parseScoreMessage reports
 * whatever Total.Goals a message carries, ignoring Confirmed), so the app
 * latched the PROVISIONAL 0–3 (seq638 goal/Confirmed:false) and never applied
 * the correction (seq642 action_discarded/0–2, which parseScoreMessage didn't
 * even parse).
 *
 * This drives the REAL captured wire (the seq617–642 region of
 * fixtures/live-fra-esp/scores-fraesp.jsonl, fixture 18237038, inlined verbatim
 * below — the file is gitignored) through the REAL path:
 *   normalize (parseScoreMessage/parseStatusMessage/parseLedgerMessage — the
 *   same functions ingest/replay.ts calls) → dispatch (createStandsServer's
 *   broadcastToMatch — the exact function routeFeedMsg calls for live+replay)
 *   → match-state (services/stands/src/match-state.ts SettledScore, the
 *   per-match settled-scoreline reducer broadcastToMatch runs the score channel
 *   through) → a REAL ws fan, whose received scoreline is the displayed truth.
 *
 * Asserts (from the trace of what the fan is actually shown):
 *   · a PROVISIONAL goal never becomes the settled scoreline (seq617/seq638),
 *   · a CONFIRMED goal DOES advance it (seq618) — real goals aren't broken,
 *   · the disallowed 0–3 is NEVER shown, at any point,
 *   · after the action_discarded correction (seq642) the score is 0–2,
 *   · a late joiner's join-snapshot score (rememberForJoin → snap.score, the
 *     same value predictLifecycle grades the FINAL score from) is 0–2,
 *   · a FULL replay of the whole capture ends at the true final 0–2 (run only
 *     when the gitignored file is present; env FRAESP_CAPTURE overrides).
 *
 * RED on main (parseScoreMessage ignores Confirmed + never parses
 * action_discarded, and broadcastToMatch has no reducer): the fan is shown 0–3
 * and stays stuck there. GREEN with the fix: 0–2 throughout, 0–3 never shown.
 *
 * Hermetic: STANDS_DATA_DIR → fresh temp dir BEFORE the server module loads
 * (snapshot.ts resolves DATA_DIR at import time — hence the dynamic import),
 * mirroring full-replay-check.ts.
 *
 * Usage: tsx src/dev/score-confirm-check.ts (or: npm run check:score-confirm)
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { parseLedgerMessage, parseScoreMessage, parseStatusMessage, sniffParticipant1IsHome } from '@contracts/normalize';
import type { FeedMsg } from '@contracts/feed';

const CHECK_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rooot-score-confirm-check-'));
process.env.STANDS_DATA_DIR = CHECK_DATA_DIR;

const FIXTURE = 18237038; // FRA–ESP, Jul 14 — Participant1=France(home), Participant2=Spain(away)

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function flush(): Promise<void> {
  return new Promise((r) => setImmediate(() => setTimeout(r, 8)));
}

interface ScoreLine {
  home: number;
  away: number;
}
const eq = (a: ScoreLine | null, h: number, w: number): boolean => a !== null && a.home === h && a.away === w;
const fmt = (a: ScoreLine | null): string => (a === null ? '—' : `${a.home}–${a.away}`);

/* ── the REAL captured wire, seq617–642, inlined verbatim (data = the exact
 * bytes of each line's `data` field in scores-fraesp.jsonl). The intervening
 * possession/kickoff chatter (seq619–637, etc.) carries no goal/score and is
 * elided; every message that touches the scoreline is here. ─────────────────
 *   seq617 goal    Confirmed:false  Score P2.Total.Goals=2   (provisional 2nd)
 *   seq618 goal    Confirmed:true   Score P2.Total.Goals=2   (SETTLED 2nd)
 *   seq620 goal    Confirmed:true   Score P2.Total.Goals=2   (re-emit — dedup)
 *   seq638 goal    Confirmed:false  Score P2.Total.Goals=3   (provisional 3rd — OFFSIDE)
 *   seq641 var_end Confirmed:true   Score P2.Total.Goals=3   (VAR overturned; still floats 0–3)
 *   seq642 action_discarded         Score P2.Total.Goals=2   (the CORRECTION)  */
const REGION: Array<{ receivedAtMs: number; data: string }> = [
  // seq 617 — goal (Confirmed:false)
  { receivedAtMs: 1784060376126, data: "{\"FixtureId\":18237038,\"GameState\":\"scheduled\",\"StartTime\":1784055600000,\"IsTeam\":true,\"FixtureGroupId\":10115573,\"CompetitionId\":72,\"CountryId\":466,\"SportId\":1,\"Participant1IsHome\":true,\"Participant2Id\":3021,\"Participant1Id\":1999,\"CoverageSecondaryData\":true,\"CoverageType\":\"TV/Stream\",\"Action\":\"goal\",\"Id\":551,\"Ts\":1784060376027,\"ConnectionId\":1111,\"Seq\":617,\"StatusId\":4,\"Type\":\"Soccer\",\"Confirmed\":false,\"Clock\":{\"Running\":true,\"Seconds\":3455},\"Score\":{\"Participant1\":{\"H1\":{\"YellowCards\":1,\"Corners\":3},\"HT\":{\"YellowCards\":1,\"Corners\":3},\"Total\":{\"YellowCards\":1,\"Corners\":3}},\"Participant2\":{\"H1\":{\"Goals\":1,\"YellowCards\":1,\"Corners\":1},\"HT\":{\"Goals\":1,\"YellowCards\":1,\"Corners\":1},\"H2\":{\"Goals\":1},\"Total\":{\"Goals\":2,\"YellowCards\":1,\"Corners\":1}}},\"Data\":{},\"Stats\":{\"1001\":0,\"6006\":0,\"4008\":0,\"5002\":0,\"1007\":3,\"1003\":1,\"8\":1,\"1004\":1,\"4005\":0,\"3008\":0,\"1005\":0,\"7008\":0,\"5\":0,\"3004\":0,\"5005\":0,\"2007\":3,\"6002\":0,\"4001\":0,\"7004\":0,\"2002\":1,\"1\":0,\"6\":0,\"7005\":0,\"5006\":0,\"1006\":0,\"3001\":0,\"2006\":0,\"1002\":1,\"6005\":0,\"3005\":0,\"2\":1,\"4004\":0,\"2001\":0,\"6001\":0,\"3002\":0,\"7006\":0,\"7\":3,\"7001\":0,\"6004\":0,\"3006\":0,\"5007\":0,\"7002\":0,\"3\":1,\"2005\":0,\"6008\":0,\"5003\":0,\"4003\":0,\"5001\":0,\"1008\":1,\"3007\":0,\"7007\":0,\"4006\":0,\"5008\":0,\"2004\":1,\"6003\":0,\"3003\":0,\"2003\":1,\"6007\":0,\"5004\":0,\"2008\":1,\"4\":1,\"4007\":0,\"7003\":0,\"4002\":0},\"Participant\":2,\"Kickoff\":{\"Team\":1},\"Parti1State\":{},\"Parti2State\":{\"PossibleEvent\":{\"Goal\":true}}}" },
  // seq 618 — goal (Confirmed:true)
  { receivedAtMs: 1784060478403, data: "{\"FixtureId\":18237038,\"GameState\":\"scheduled\",\"StartTime\":1784055600000,\"IsTeam\":true,\"FixtureGroupId\":10115573,\"CompetitionId\":72,\"CountryId\":466,\"SportId\":1,\"Participant1IsHome\":true,\"Participant2Id\":3021,\"Participant1Id\":1999,\"CoverageSecondaryData\":true,\"CoverageType\":\"TV/Stream\",\"Action\":\"goal\",\"Id\":551,\"Ts\":1784060478302,\"ConnectionId\":1111,\"Seq\":618,\"StatusId\":4,\"Type\":\"Soccer\",\"Confirmed\":true,\"Clock\":{\"Running\":true,\"Seconds\":3455},\"Score\":{\"Participant1\":{\"H1\":{\"YellowCards\":1,\"Corners\":3},\"HT\":{\"YellowCards\":1,\"Corners\":3},\"Total\":{\"YellowCards\":1,\"Corners\":3}},\"Participant2\":{\"H1\":{\"Goals\":1,\"YellowCards\":1,\"Corners\":1},\"HT\":{\"Goals\":1,\"YellowCards\":1,\"Corners\":1},\"H2\":{\"Goals\":1},\"Total\":{\"Goals\":2,\"YellowCards\":1,\"Corners\":1}}},\"Data\":{\"GoalType\":\"Shot\"},\"Stats\":{\"1001\":0,\"6006\":0,\"4008\":0,\"5002\":0,\"1007\":3,\"1003\":1,\"8\":1,\"1004\":1,\"4005\":0,\"3008\":0,\"1005\":0,\"7008\":0,\"5\":0,\"3004\":0,\"5005\":0,\"2007\":3,\"6002\":0,\"4001\":0,\"7004\":0,\"2002\":1,\"1\":0,\"6\":0,\"7005\":0,\"5006\":0,\"1006\":0,\"3001\":0,\"2006\":0,\"1002\":1,\"6005\":0,\"3005\":0,\"2\":2,\"4004\":0,\"2001\":0,\"6001\":0,\"3002\":1,\"7006\":0,\"7\":3,\"7001\":0,\"6004\":0,\"3006\":0,\"5007\":0,\"7002\":0,\"3\":1,\"2005\":0,\"6008\":0,\"5003\":0,\"4003\":0,\"5001\":0,\"1008\":1,\"3007\":0,\"7007\":0,\"4006\":0,\"5008\":0,\"2004\":1,\"6003\":0,\"3003\":0,\"2003\":1,\"6007\":0,\"5004\":0,\"2008\":1,\"4\":1,\"4007\":0,\"7003\":0,\"4002\":0},\"Participant\":2,\"Kickoff\":{\"Team\":1},\"Possession\":1,\"PossessionType\":\"SafePossession\",\"Parti1State\":{},\"Parti2State\":{}}" },
  // seq 620 — goal (Confirmed:true) — re-emission, carries PlayerId
  { receivedAtMs: 1784060481244, data: "{\"FixtureId\":18237038,\"GameState\":\"scheduled\",\"StartTime\":1784055600000,\"IsTeam\":true,\"FixtureGroupId\":10115573,\"CompetitionId\":72,\"CountryId\":466,\"SportId\":1,\"Participant1IsHome\":true,\"Participant2Id\":3021,\"Participant1Id\":1999,\"CoverageSecondaryData\":true,\"CoverageType\":\"TV/Stream\",\"Action\":\"goal\",\"Id\":551,\"Ts\":1784060481148,\"ConnectionId\":1111,\"Seq\":620,\"StatusId\":4,\"Type\":\"Soccer\",\"Confirmed\":true,\"Clock\":{\"Running\":true,\"Seconds\":3455},\"Score\":{\"Participant1\":{\"H1\":{\"YellowCards\":1,\"Corners\":3},\"HT\":{\"YellowCards\":1,\"Corners\":3},\"Total\":{\"YellowCards\":1,\"Corners\":3}},\"Participant2\":{\"H1\":{\"Goals\":1,\"YellowCards\":1,\"Corners\":1},\"HT\":{\"Goals\":1,\"YellowCards\":1,\"Corners\":1},\"H2\":{\"Goals\":1},\"Total\":{\"Goals\":2,\"YellowCards\":1,\"Corners\":1}}},\"Data\":{\"GoalType\":\"Shot\",\"PlayerId\":907005},\"Stats\":{\"1001\":0,\"6006\":0,\"4008\":0,\"5002\":0,\"1007\":3,\"1003\":1,\"8\":1,\"1004\":1,\"4005\":0,\"3008\":0,\"1005\":0,\"7008\":0,\"5\":0,\"3004\":0,\"5005\":0,\"2007\":3,\"6002\":0,\"4001\":0,\"7004\":0,\"2002\":1,\"1\":0,\"6\":0,\"7005\":0,\"5006\":0,\"1006\":0,\"3001\":0,\"2006\":0,\"1002\":1,\"6005\":0,\"3005\":0,\"2\":2,\"4004\":0,\"2001\":0,\"6001\":0,\"3002\":1,\"7006\":0,\"7\":3,\"7001\":0,\"6004\":0,\"3006\":0,\"5007\":0,\"7002\":0,\"3\":1,\"2005\":0,\"6008\":0,\"5003\":0,\"4003\":0,\"5001\":0,\"1008\":1,\"3007\":0,\"7007\":0,\"4006\":0,\"5008\":0,\"2004\":1,\"6003\":0,\"3003\":0,\"2003\":1,\"6007\":0,\"5004\":0,\"2008\":1,\"4\":1,\"4007\":0,\"7003\":0,\"4002\":0},\"Participant\":2,\"Kickoff\":{\"Team\":1},\"Parti1State\":{},\"Parti2State\":{}}" },
  // seq 638 — goal (Confirmed:false) — the OFFSIDE goal, provisional 0–3
  { receivedAtMs: 1784060550057, data: "{\"FixtureId\":18237038,\"GameState\":\"scheduled\",\"StartTime\":1784055600000,\"IsTeam\":true,\"FixtureGroupId\":10115573,\"CompetitionId\":72,\"CountryId\":466,\"SportId\":1,\"Participant1IsHome\":true,\"Participant2Id\":3021,\"Participant1Id\":1999,\"CoverageSecondaryData\":true,\"CoverageType\":\"TV/Stream\",\"Action\":\"goal\",\"Id\":570,\"Ts\":1784060549958,\"ConnectionId\":1111,\"Seq\":638,\"StatusId\":4,\"Type\":\"Soccer\",\"Confirmed\":false,\"Clock\":{\"Running\":true,\"Seconds\":3629},\"Score\":{\"Participant1\":{\"H1\":{\"YellowCards\":1,\"Corners\":3},\"HT\":{\"YellowCards\":1,\"Corners\":3},\"Total\":{\"YellowCards\":1,\"Corners\":3}},\"Participant2\":{\"H1\":{\"Goals\":1,\"YellowCards\":1,\"Corners\":1},\"HT\":{\"Goals\":1,\"YellowCards\":1,\"Corners\":1},\"H2\":{\"Goals\":2},\"Total\":{\"Goals\":3,\"YellowCards\":1,\"Corners\":1}}},\"Data\":{},\"Stats\":{\"1001\":0,\"6006\":0,\"4008\":0,\"5002\":0,\"1007\":3,\"1003\":1,\"8\":1,\"1004\":1,\"4005\":0,\"3008\":0,\"1005\":0,\"7008\":0,\"5\":0,\"3004\":0,\"5005\":0,\"2007\":3,\"6002\":0,\"4001\":0,\"7004\":0,\"2002\":1,\"1\":0,\"6\":0,\"7005\":0,\"5006\":0,\"1006\":0,\"3001\":0,\"2006\":0,\"1002\":1,\"6005\":0,\"3005\":0,\"2\":2,\"4004\":0,\"2001\":0,\"6001\":0,\"3002\":1,\"7006\":0,\"7\":3,\"7001\":0,\"6004\":0,\"3006\":0,\"5007\":0,\"7002\":0,\"3\":1,\"2005\":0,\"6008\":0,\"5003\":0,\"4003\":0,\"5001\":0,\"1008\":1,\"3007\":0,\"7007\":0,\"4006\":0,\"5008\":0,\"2004\":1,\"6003\":0,\"3003\":0,\"2003\":1,\"6007\":0,\"5004\":0,\"2008\":1,\"4\":1,\"4007\":0,\"7003\":0,\"4002\":0},\"Participant\":2,\"Kickoff\":{\"Team\":1},\"Parti1State\":{},\"Parti2State\":{\"PossibleEvent\":{\"Goal\":true}}}" },
  // seq 641 — var_end (Confirmed:true) — overturned; STILL floats Score 0–3
  { receivedAtMs: 1784060573835, data: "{\"FixtureId\":18237038,\"GameState\":\"scheduled\",\"StartTime\":1784055600000,\"IsTeam\":true,\"FixtureGroupId\":10115573,\"CompetitionId\":72,\"CountryId\":466,\"SportId\":1,\"Participant1IsHome\":true,\"Participant2Id\":3021,\"Participant1Id\":1999,\"CoverageSecondaryData\":true,\"CoverageType\":\"TV/Stream\",\"Action\":\"var_end\",\"Id\":571,\"Ts\":1784060573720,\"ConnectionId\":1111,\"Seq\":641,\"StatusId\":4,\"Type\":\"Soccer\",\"Confirmed\":true,\"Clock\":{\"Running\":true,\"Seconds\":3653},\"Score\":{\"Participant1\":{\"H1\":{\"YellowCards\":1,\"Corners\":3},\"HT\":{\"YellowCards\":1,\"Corners\":3},\"Total\":{\"YellowCards\":1,\"Corners\":3}},\"Participant2\":{\"H1\":{\"Goals\":1,\"YellowCards\":1,\"Corners\":1},\"HT\":{\"Goals\":1,\"YellowCards\":1,\"Corners\":1},\"H2\":{\"Goals\":2},\"Total\":{\"Goals\":3,\"YellowCards\":1,\"Corners\":1}}},\"Data\":{\"Outcome\":\"Overturned\"},\"Stats\":{\"1001\":0,\"6006\":0,\"4008\":0,\"5002\":0,\"1007\":3,\"1003\":1,\"8\":1,\"1004\":1,\"4005\":0,\"3008\":0,\"1005\":0,\"7008\":0,\"5\":0,\"3004\":0,\"5005\":0,\"2007\":3,\"6002\":0,\"4001\":0,\"7004\":0,\"2002\":1,\"1\":0,\"6\":0,\"7005\":0,\"5006\":0,\"1006\":0,\"3001\":0,\"2006\":0,\"1002\":1,\"6005\":0,\"3005\":0,\"2\":3,\"4004\":0,\"2001\":0,\"6001\":0,\"3002\":2,\"7006\":0,\"7\":3,\"7001\":0,\"6004\":0,\"3006\":0,\"5007\":0,\"7002\":0,\"3\":1,\"2005\":0,\"6008\":0,\"5003\":0,\"4003\":0,\"5001\":0,\"1008\":1,\"3007\":0,\"7007\":0,\"4006\":0,\"5008\":0,\"2004\":1,\"6003\":0,\"3003\":0,\"2003\":1,\"6007\":0,\"5004\":0,\"2008\":1,\"4\":1,\"4007\":0,\"7003\":0,\"4002\":0}}" },
  // seq 642 — action_discarded — the CORRECTION back to 0–2 (Confirmed absent)
  { receivedAtMs: 1784060575710, data: "{\"FixtureId\":18237038,\"GameState\":\"scheduled\",\"StartTime\":1784055600000,\"IsTeam\":true,\"FixtureGroupId\":10115573,\"CompetitionId\":72,\"CountryId\":466,\"SportId\":1,\"Participant1IsHome\":true,\"Participant2Id\":3021,\"Participant1Id\":1999,\"CoverageSecondaryData\":true,\"CoverageType\":\"TV/Stream\",\"Action\":\"action_discarded\",\"Id\":570,\"Ts\":1784060575609,\"ConnectionId\":1111,\"Seq\":642,\"Score\":{\"Participant1\":{\"H1\":{\"YellowCards\":1,\"Corners\":3},\"HT\":{\"YellowCards\":1,\"Corners\":3},\"Total\":{\"YellowCards\":1,\"Corners\":3}},\"Participant2\":{\"H1\":{\"Goals\":1,\"YellowCards\":1,\"Corners\":1},\"HT\":{\"Goals\":1,\"YellowCards\":1,\"Corners\":1},\"H2\":{\"Goals\":1},\"Total\":{\"Goals\":2,\"YellowCards\":1,\"Corners\":1}}},\"Data\":{},\"Stats\":{\"1001\":0,\"6006\":0,\"4008\":0,\"5002\":0,\"1007\":3,\"1003\":1,\"8\":1,\"1004\":1,\"4005\":0,\"3008\":0,\"1005\":0,\"7008\":0,\"5\":0,\"3004\":0,\"5005\":0,\"2007\":3,\"6002\":0,\"4001\":0,\"7004\":0,\"2002\":1,\"1\":0,\"6\":0,\"7005\":0,\"5006\":0,\"1006\":0,\"3001\":0,\"2006\":0,\"1002\":1,\"6005\":0,\"3005\":0,\"2\":3,\"4004\":0,\"2001\":0,\"6001\":0,\"3002\":2,\"7006\":0,\"7\":3,\"7001\":0,\"6004\":0,\"3006\":0,\"5007\":0,\"7002\":0,\"3\":1,\"2005\":0,\"6008\":0,\"5003\":0,\"4003\":0,\"5001\":0,\"1008\":1,\"3007\":0,\"7007\":0,\"4006\":0,\"5008\":0,\"2004\":1,\"6003\":0,\"3003\":0,\"2003\":1,\"6007\":0,\"5004\":0,\"2008\":1,\"4\":1,\"4007\":0,\"7003\":0,\"4002\":0},\"Possession\":2,\"PossessionType\":\"HighDangerPossession\",\"Parti1State\":{},\"Parti2State\":{\"PossibleEvent\":{\"Goal\":true}},\"PossibleEvent\":{}}" },
];

function rawFixtureId(data: string): number | null {
  try {
    const f = (JSON.parse(data) as { FixtureId?: unknown }).FixtureId;
    return typeof f === 'number' ? f : null;
  } catch {
    return null;
  }
}
function rawField(data: string, key: string): unknown {
  try {
    return (JSON.parse(data) as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/**
 * Route one raw wire `data` line through the REAL normalize dispatch, exactly
 * as ingest/replay.ts's emit() does for the score-determining channels: the
 * ledger is a parallel channel; a scores line is either a score change or a
 * status change (score first, status fallback). p1IsHome is latched from the
 * envelope (default true) — every FRA–ESP line carries Participant1IsHome:true.
 * Filtered to the target fixture, then dispatched to broadcastToMatch.
 */
function routeRawLine(
  matchId: string,
  data: string,
  receivedAtMs: number,
  p1IsHomeRef: { v: boolean },
  dispatch: (msg: FeedMsg) => void,
): void {
  if (rawFixtureId(data) !== FIXTURE) return;
  const p1h = sniffParticipant1IsHome(data);
  if (p1h !== null) p1IsHomeRef.v = p1h;

  const ledger = parseLedgerMessage(data, receivedAtMs, 'replay');
  if (ledger) dispatch({ type: 'ledger', msg: ledger } as FeedMsg);

  const score = parseScoreMessage(data, receivedAtMs, 'replay');
  if (score) {
    dispatch({ type: 'score', ev: score } as FeedMsg);
    return;
  }
  const status = parseStatusMessage(data, receivedAtMs, 'replay');
  if (status) dispatch({ type: 'status', ev: status } as FeedMsg);
}

interface Fan {
  ws: WebSocket;
  scores: ScoreLine[]; // every scoreline this fan was shown, in order
}
async function connectFan(port: number, matchId: string, anonId: string): Promise<Fan> {
  // Connect the way a real client does — matchId in the URL — so the server
  // seats the room AND replays the join snapshot (replaySnapshot → snap.score)
  // on connect; the hello below then binds anonId/side for presence.
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?matchId=${encodeURIComponent(matchId)}`);
  const scores: ScoreLine[] = [];
  ws.on('message', (raw) => {
    try {
      const m = JSON.parse(raw.toString()) as { type?: string; ev?: { home?: unknown; away?: unknown } };
      if (m.type === 'score' && typeof m.ev?.home === 'number' && typeof m.ev?.away === 'number') {
        scores.push({ home: m.ev.home, away: m.ev.away });
      }
    } catch {
      /* ignore */
    }
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'hello', matchId, anonId, side: 'home' }));
  await sleep(150);
  return { ws, scores };
}

async function main(): Promise<void> {
  const { createStandsServer } = await import('../server');
  const { httpServer, broadcastToMatch } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const addr = httpServer.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;

  try {
    /* ══ PHASE A — the inlined seq617–642 region, step by step ══════════════ */
    console.log('\n[score-confirm-check] PHASE A — real seq617–642 region through normalize + match-state + dispatch\n');
    const matchA = 'fraesp-region';
    const fanA = await connectFan(port, matchA, 'region-fan');
    const p1 = { v: true };
    const dispatchA = (msg: FeedMsg): void => broadcastToMatch(matchA, msg as never);

    const trace: Array<{ seq: number; action: string; shown: ScoreLine | null }> = [];
    for (const line of REGION) {
      routeRawLine(matchA, line.data, line.receivedAtMs, p1, dispatchA);
      await flush();
      trace.push({
        seq: Number(rawField(line.data, 'Seq')),
        action: String(rawField(line.data, 'Action')),
        shown: fanA.scores.length ? fanA.scores[fanA.scores.length - 1]! : null,
      });
    }
    await sleep(200);
    for (const t of trace) console.log(`    after seq${t.seq} ${t.action.padEnd(17)} → fan shows ${fmt(t.shown)}`);

    const at = (seq: number): ScoreLine | null => trace.find((t) => t.seq === seq)?.shown ?? null;
    check('provisional 2nd goal (seq617 Confirmed:false) does NOT settle the scoreline', !eq(at(617), 0, 2) && !eq(at(617), 0, 3), `shown=${fmt(at(617))}`);
    check('CONFIRMED goal (seq618 Confirmed:true) advances the score to 0–2 (real goals still work)', eq(at(618), 0, 2), `shown=${fmt(at(618))}`);
    check('disallowed goal (seq638 Confirmed:false, offside) is HELD — fan still shows 0–2, never 0–3', eq(at(638), 0, 2), `shown=${fmt(at(638))}`);
    check('after the correction (seq642 action_discarded) the score is 0–2', eq(at(642), 0, 2), `shown=${fmt(at(642))}`);
    const everShown03 = fanA.scores.some((s) => s.home === 0 && s.away === 3);
    check('the provisional 0–3 is NEVER shown to the fan, at any point', !everShown03, `scores shown: ${fanA.scores.map(fmt).join(' → ') || '—'}`);
    const finalA = fanA.scores.length ? fanA.scores[fanA.scores.length - 1]! : null;
    check('settled score after the region is 0–2 (two confirmed goals)', eq(finalA, 0, 2), `final=${fmt(finalA)}`);

    // a LATE joiner reads the join snapshot (rememberForJoin → snap.score, the
    // SAME value predictLifecycle grades the FINAL score / scarf from).
    const joiner = await connectFan(port, matchA, 'late-joiner');
    const joinScore = joiner.scores.length ? joiner.scores[0]! : null;
    check('a late joiner’s join-snapshot score is 0–2 (the value the FINAL score is graded from)', eq(joinScore, 0, 2), `join score=${fmt(joinScore)}`);
    fanA.ws.close();
    joiner.ws.close();

    /* ══ PHASE B — a full replay of the whole capture ends at the true final ══ */
    console.log('\n[score-confirm-check] PHASE B — full replay of the whole capture\n');
    const CAPTURE = process.env.FRAESP_CAPTURE ?? path.resolve(import.meta.dirname, '../../../../fixtures/live-fra-esp/scores-fraesp.jsonl');
    if (!existsSync(CAPTURE)) {
      console.log(`    SKIP — gitignored capture not present at ${CAPTURE}`);
      console.log('    (set FRAESP_CAPTURE=/abs/path/scores-fraesp.jsonl to run the full-file assertion)');
    } else {
      const matchB = 'fraesp-full';
      const fanB = await connectFan(port, matchB, 'full-fan');
      const p1b = { v: true };
      const dispatchB = (msg: FeedMsg): void => broadcastToMatch(matchB, msg as never);
      const lines = readFileSync(CAPTURE, 'utf8').split('\n').filter(Boolean);
      let dispatched = 0;
      for (const raw of lines) {
        let outer: { receivedAtMs?: number; event?: string; data?: unknown };
        try {
          outer = JSON.parse(raw) as typeof outer;
        } catch {
          continue;
        }
        if (typeof outer.data !== 'string' || outer.event !== 'message') continue;
        routeRawLine(matchB, outer.data, outer.receivedAtMs ?? Date.now(), p1b, dispatchB);
        if (++dispatched % 200 === 0) await new Promise((r) => setImmediate(r));
      }
      await sleep(400);
      const finalB = fanB.scores.length ? fanB.scores[fanB.scores.length - 1]! : null;
      const everShown03B = fanB.scores.some((s) => s.home === 0 && s.away === 3);
      console.log(`    full replay: ${dispatched} messages, ${fanB.scores.length} scoreline updates, final ${fmt(finalB)}`);
      check('full replay of the real capture ends at the TRUE final score 0–2', eq(finalB, 0, 2), `final=${fmt(finalB)}`);
      check('across the WHOLE match the fan is never shown 0–3', !everShown03B, `updates: ${fanB.scores.map(fmt).join(' → ')}`);
      fanB.ws.close();
    }
  } finally {
    httpServer.close();
    rmSync(CHECK_DATA_DIR, { recursive: true, force: true });
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[score-confirm-check] FATAL', err);
  process.exit(1);
});
