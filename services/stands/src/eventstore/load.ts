/**
 * ROOOT event store — load.ts: THE canonical offline reader for a recorded
 * capture (fixtures/*.jsonl or apps/web/public/replay/*.jsonl — same line
 * shape, docs/DATA.md: one line per SSE message, `{ receivedAtMs, event,
 * data }`, data as the raw JSON string).
 *
 * Scoped by tonight's research (scratchpad/research-event-sourcing.md §3):
 * this try-each-parser loop over contracts/normalize.ts already exists,
 * independently, four times —
 *   1. services/stands/src/ingest/replay.ts        (startReplayIngest)
 *   2. scripts/bake-demo.ts                        (bakeFile)
 *   3. scripts/_tofeed.mjs                         (toFeed)
 *   4. scripts/replay-inspect.ts                   (inline in inspectFixture)
 * — none of them named or shared. This is that loop, extracted once, as a
 * synchronous batch read (no real-time pacing — that's replay.ts's job when
 * *playing* a match; this module's job is turning a file into data).
 *
 * Where the four disagree, this follows replay.ts — it feeds the real
 * service, so its semantics are the honest default. Divergences found:
 *
 *   · META/TRANSPORT LINES — replay.ts keeps ONLY `event === 'message'`
 *     lines (dropping `heartbeat`, `__meta`, `__disconnect` outright).
 *     bake-demo.ts and _tofeed.mjs instead drop ONLY `event === 'heartbeat'`,
 *     leaving `__meta`/`__disconnect` lines to fall through into
 *     `JSON.parse(data)` and fail every parser's own shape guard — a no-op
 *     in every capture inspected (arg-cpv-20260703.jsonl's four `__meta` +
 *     two `__disconnect` lines carry `{connectedAt,url,status}`-shaped data,
 *     matching no parser), but not the same filter. This module uses
 *     replay.ts's `event === 'message'` filter.
 *   · PER-FIXTURE FILTERING — replay.ts filters AFTER parsing, per message
 *     type, by re-reading the FixtureId the parser itself attached to
 *     `.raw` (odds/score/status) or by reconstructing it from the ledger
 *     event id / a fresh peek (ledger/spell). bake-demo.ts and
 *     replay-inspect.ts's odds path instead pre-filter every line by a
 *     peeked FixtureId BEFORE calling any parser; _tofeed.mjs does not
 *     filter by fixture AT ALL (silently mixes every fixture in the file);
 *     replay-inspect.ts's `--scores` path filters by `event==='message'`
 *     but never checks FixtureId, so a multi-fixture scores file would
 *     print another match's score/status rows under the wrong fixture's
 *     summary. This module filters exactly where/how replay.ts does.
 *   · RECEIVEDATMS ORDERING — replay.ts trusts file order (a capture is
 *     appended by the recorder in receipt order, docs/DATA.md); it does
 *     NOT sort. bake-demo.ts explicitly sorts its merged output, but only
 *     because IT merges TWO separate files (an odds capture + a scores
 *     capture) that need interleaving — a concern this module doesn't have
 *     (one file in, like replay.ts/_tofeed.mjs/replay-inspect.ts). This
 *     module trusts file order too — verified monotonic (non-decreasing
 *     receivedAtMs) for apps/web/public/replay/arg-cpv-20260703.jsonl.
 *   · ROSTER THREADING — replay.ts (and this module) latch the fixture's
 *     roster off the `lineups` envelope and thread it into
 *     parseScoreMessage/parseLedgerMessage so goals/cards/subs/injuries
 *     carry real names. bake-demo.ts and _tofeed.mjs call those two parsers
 *     with NO roster argument — scorer/card/sub names are silently never
 *     attached via either script, even though both parse the same
 *     `lineups` envelope (bake-demo.ts uses it only to emit a `lineup`
 *     FeedMsg, never captures it back into a roster for reuse). Not a bug
 *     in normalize.ts — a gap in three of the four callers.
 *   · MARKET PERIOD (full ↔ et) — replay.ts hands the odds parser off to
 *     the ET-scoped 1X2 once a status tick reports EXTRA_TIME/PENALTIES
 *     (the wire keeps a separate market alive through ET — contracts/
 *     normalize.ts's parseOddsMessage `period` param). bake-demo.ts,
 *     _tofeed.mjs and replay-inspect.ts all call parseOddsMessage with its
 *     default `'full'` only — an ET-decided match (arg-cpv-20260703.jsonl
 *     is exactly that: decidedIn "ET") silently loses its ET market belief
 *     in all three. This module carries the same full→et hand-off
 *     replay.ts does.
 *
 * Pure I/O boundary: this is the only impure function in eventstore/ (a
 * synchronous file read) — project.ts's projections are pure folds over its
 * output.
 */
import { readFileSync } from 'node:fs';
import type { FeedMsg } from '@contracts/feed';
import type { LedgerMsg } from '@contracts/ledger';
import type { FixtureRoster } from '@contracts/normalize';
import {
  parseLedgerMessage,
  parseLineups,
  parseSpell,
  parseOddsMessage,
  parseScoreMessage,
  parseStatusMessage,
  sniffParticipant1IsHome,
} from '@contracts/normalize';

/** One projected event, ordered by capture time (the event store's atom). */
export interface TimedEvent {
  atMs: number;
  msg: FeedMsg;
}

interface FixtureLine {
  receivedAtMs: number;
  event: string;
  data: string;
}

/** FixtureId off an already-parsed envelope (odds/score/status carry it on `.raw`). */
function fixtureIdOf(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = obj.FixtureId ?? obj.fixtureId;
  return typeof id === 'number' ? String(id) : null;
}

/** FixtureId peeked straight off a raw line's `data` string (spells carry no `.raw` of their own — contracts/texture.ts's Spell has none, feed.ts routes spells by a separately-tagged fixtureId). */
function peekFixtureId(data: string): string | null {
  try {
    return fixtureIdOf(JSON.parse(data));
  } catch {
    return null;
  }
}

/** The fixtureKey a LedgerMsg belongs to (event: the id's `${fixtureKey}:` prefix; amend/discard: fixtureKey) — mirrors replay.ts's ledgerFixtureId exactly. */
function ledgerFixtureId(msg: LedgerMsg): string | null {
  if (msg.type === 'event') {
    const sep = msg.ev.id.indexOf(':');
    return sep > 0 ? msg.ev.id.slice(0, sep) : null;
  }
  return msg.fixtureKey || null;
}

/**
 * Load one recorded capture file into an ordered, typed TimedEvent stream —
 * the SAME contracts/normalize.ts projection the live service uses (see file
 * header for exactly how the four existing re-implementations disagree, and
 * which reading this follows at each point).
 *
 * A single input line can legitimately produce MORE THAN ONE TimedEvent
 * (ledger and spell are parallel channels alongside odds/score/status/lineup
 * — e.g. one live 'goal' envelope yields both a `ledger` event AND a `score`
 * event) — this mirrors replay.ts's `emit()`, which calls its callback
 * multiple times per line for exactly the same reason.
 *
 * Never throws on a malformed line or a normalize.ts parse error — a bad
 * line is dropped, not fatal (matches every reader here; a capture file must
 * never crash offline tooling any more than it may crash the live service).
 */
export function loadMatchEvents(file: string, fixtureId: string): TimedEvent[] {
  const events: TimedEvent[] = [];
  const text = readFileSync(file, 'utf8');

  // per-fixture latch state, threaded across lines exactly as replay.ts does.
  let p1IsHome = true;
  let oddsPeriod: 'full' | 'et' = 'full';
  let roster: FixtureRoster | undefined;

  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let line: FixtureLine;
    try {
      line = JSON.parse(trimmed) as FixtureLine;
    } catch {
      continue; // malformed line — never fatal
    }
    if (line.event !== 'message') continue; // see file header: replay.ts's filter, not bake-demo/_tofeed's
    const { data, receivedAtMs: atMs } = line;

    try {
      if (!roster && data.includes('"lineups"')) {
        const r = parseLineups(data);
        if (r && String(r.fixtureId) === fixtureId) {
          roster = r;
          if (r.lineup) events.push({ atMs, msg: { type: 'lineup', fixtureId, lineup: r.lineup } });
        }
      }
      if (data.includes('"Participant1IsHome"')) {
        const p1h = sniffParticipant1IsHome(data);
        if (p1h !== null) p1IsHome = p1h;
      }

      // ledger + spell are parallel channels — always attempted, independent
      // of the odds/score/status early-exit chain below (see doc comment).
      const ledger = parseLedgerMessage(data, atMs, 'replay', roster);
      if (ledger && ledgerFixtureId(ledger) === fixtureId) {
        events.push({ atMs, msg: { type: 'ledger', msg: ledger } });
      }
      const spell = parseSpell(data, atMs, 'replay', p1IsHome);
      if (spell && peekFixtureId(data) === fixtureId) {
        events.push({ atMs, msg: { type: 'spell', fixtureId, spell } });
      }

      // odds/score/status: mutually exclusive per line, first-match-wins,
      // matching replay.ts's early-return chain (a line that parses as one
      // of these never legitimately parses as another — they're disjoint
      // wire shapes; the exit-after-first-match is a harmless mirror of
      // replay.ts, not a behavior this depends on).
      const tick = parseOddsMessage(data, atMs, 'replay', p1IsHome, oddsPeriod);
      if (tick) {
        if (fixtureIdOf(tick.raw) === fixtureId) events.push({ atMs, msg: { type: 'odds', tick } });
        continue;
      }
      const score = parseScoreMessage(data, atMs, 'replay', roster);
      if (score) {
        if (fixtureIdOf(score.raw) === fixtureId) events.push({ atMs, msg: { type: 'score', ev: score } });
        continue;
      }
      const status = parseStatusMessage(data, atMs, 'replay');
      if (status) {
        if (fixtureIdOf(status.raw) === fixtureId) {
          events.push({ atMs, msg: { type: 'status', ev: status } });
          // phase hand-off (contracts/normalize.ts parseOddsMessage doc): once
          // ET/PENALTIES starts, the ET-scoped 1X2 carries belief instead.
          if (status.phase === 'EXTRA_TIME' || status.phase === 'PENALTIES') oddsPeriod = 'et';
        }
      }
    } catch (err) {
      console.warn(`[eventstore/load] normalize error on a line (dropping): ${String(err)}`);
    }
  }

  // No sort: file order is trusted, matching replay.ts (see file header).
  return events;
}
