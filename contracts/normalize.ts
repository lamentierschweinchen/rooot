/**
 * ROOOT normalize — raw TxLINE wire shapes → the honest seam (OddsTick /
 * ScoreEvent / StatusEvent from contracts/match.ts).
 *
 * SCOPED EXCEPTION (see AGENTS.md): this file is new, created by the data
 * lane, and reviewed/frozen by the coordinator once landed. It is the shared
 * truth for turning TxLINE's raw JSON into contracts/match.ts shapes — both
 * apps/web (ReplaySource, and later LiveSource's server-side twin) and
 * services/stands should normalize through here so there is exactly one
 * place that knows TxLINE's field names.
 *
 * Pure and dependency-free on purpose: no fetch, no DOM, no node builtins.
 * Every function takes a raw string (as captured verbatim in fixtures/*.jsonl
 * `data` fields, or as received live) and returns a typed seam value or null
 * (never throws — malformed/irrelevant input is filtered, not fatal, because
 * a live feed WILL send heartbeats, unrelated markets, and the occasional
 * garbled line).
 *
 * ── Taxonomy findings (from fixtures/odds-20260703.jsonl + scores-20260703.jsonl,
 *    cross-referenced against docs/txline/openapi.yaml and the live soccer-feed
 *    doc — see scripts/replay-inspect.ts output for the numbers) ──
 *
 * ODDS (`event: "message"` on the odds stream). Raw fields observed:
 *   FixtureId, MessageId, Ts, Bookmaker, BookmakerId, SuperOddsType, GameState,
 *   InRunning, MarketParameters, MarketPeriod, PriceNames, Prices, Pct.
 *
 *   - SuperOddsType values seen: "1X2_PARTICIPANT_RESULT" (match-result — THE
 *     market we key on), "OVERUNDER_PARTICIPANT_GOALS", and
 *     "ASIANHANDICAP_PARTICIPANT_GOALS". Only 1X2_PARTICIPANT_RESULT is used
 *     here; the other two are out of the honest palette (docs/DATA.md) and
 *     are filtered out, not mapped.
 *   - For 1X2 rows, PriceNames is always exactly ["part1","draw","part2"] —
 *     PARTICIPANT order, NOT home/draw/away (Participant1IsHome can be false;
 *     the side-truth is threaded into parseOddsMessage — see its doc), with
 *     the openapi Odds/OddsPayload schema's PriceNames/Prices/Pct arrays
 *     parallel by index.
 *   - Every 1X2 row in the capture carries Bookmaker "TXLineStablePriceDemargined"
 *     / BookmakerId 10021 — there is only ever one bookmaker row per tick in
 *     this feed (no multi-bookmaker fan-out to pick a "best" row from); it IS
 *     the de-vigged consensus by construction ("Demargined" in the name, and
 *     docs/DATA.md's own description of Pct as "the StablePrice probability
 *     vector"). We still defensively prefer a Bookmaker containing
 *     "StablePrice" if a future feed ever sends more than one, per the task's
 *     "prefer StablePrice/consensus rows if multiple" instruction.
 *   - Pct is the answer, not Prices: openapi.yaml's OddsPayload schema
 *     documents Pct as "Strictly formatted to 3 decimal places, or NA for
 *     quarter handicap lines" — i.e. it is TxLINE's own already-demargined
 *     percentage string, summing to ~100 (verified: mean abs deviation from
 *     100 across the capture's 1X2 rows is <0.03). Prices, by contrast, are
 *     NOT demargined decimal odds (verified: 1/(Prices[i]/10000) summed across
 *     the three legs of a 1X2 row totals ~1000%, i.e. ~10% overround/vig) —
 *     recomputing probabilities from Prices would re-introduce the vig we're
 *     required to remove. So: always read Pct, never derive from Prices.
 *     Pct can be the string "NA" (quarter-line markets only, per the schema
 *     comment) — 1X2 rows in the capture never showed NA, but the parser
 *     guards it anyway and returns null for the tick if any leg is NA/non-numeric.
 *   - MarketPeriod distinguishes the full-match line (null) from a period
 *     sub-market — "half=1" was observed for 1X2 rows in this capture (a
 *     first-half-result side market). Only MarketPeriod === null is the
 *     full-match 1X2 we want; anything else is filtered out here.
 *   - InRunning was `false` and GameState was `null` on every 1X2 row in the
 *     capture — this capture is entirely pre-match odds movement (see
 *     scripts/replay-inspect.ts summary: the whole window sits ~6.5h before
 *     ARG–CPV kickoff). Both fields are threaded through as `raw` for
 *     debugging but are NOT required to be truthy for a tick to normalize —
 *     in-running rows are expected to look the same shape once the match
 *     actually goes live.
 *   - `minute` on OddsTick: TxLINE's odds stream does not carry a match clock
 *     field on Odds/OddsPayload (no Minutes/clock field in that schema — clock
 *     lives on the SCORES side, SoccerFixtureClock). We honestly return null
 *     here always; a future live join against the scores stream's clock could
 *     backfill it, but that is not a claim this function makes.
 *
 * SCORES (`event: "message"` on the scores stream — none were captured
 *   in-window; the scores fixture is 180 heartbeats, one __meta line, and
 *   zero real Scores payloads, because the capture predates kickoff). The
 *   shapes below are built directly from docs/txline/openapi.yaml's `Scores`
 *   schema (the scores/stream response body) plus the live soccer-feed
 *   status-code table (https://txline.txodds.com/documentation/scores/soccer-feed),
 *   since no live example exists to eyeball:
 *
 *   - Scores.statusSoccerId is a SoccerFixtureStatus — a closed enum of 19
 *     phase codes (title-tagged discriminator objects in the schema; the doc
 *     page spells them out): NS=Not started, H1=First half in play,
 *     HT=Halftime, H2=Second half in play, F=Ended, WET=Waiting for extra
 *     time, ET1=Extra time first half, HTET=Extra time halftime,
 *     ET2=Extra time second half, FET=Ended after extra time, WPE=Waiting
 *     for penalties, PE=Penalty shootout in progress, FPE=Ended after
 *     penalties, I=Interrupted, A=Abandoned, C=Cancelled,
 *     TXCC=TX coverage cancelled, TXCS=TX coverage suspended, P=Postponed.
 *     mapStatusCode() below maps every one of these onto contracts/match.ts's
 *     smaller MatchPhase enum (PRE/FIRST_HALF/HALF_TIME/SECOND_HALF/
 *     EXTRA_TIME/PENALTIES/FULL_TIME) — the honest palette has no separate
 *     "interrupted/abandoned/cancelled" phase, so those fold to whichever
 *     of PRE/FULL_TIME is the closer honest read (documented per-branch below).
 *   - Score: Scores.scoreSoccer is a SoccerFixtureScore { Participant1,
 *     Participant2: SoccerTotalScore }, and SoccerTotalScore.Total is a
 *     SoccerScore { Goals, YellowCards, RedCards, Corners }. We read
 *     scoreSoccer.Participant{1,2}.Total.Goals for the running score line —
 *     everything else on SoccerScore (cards/corners) is out of the honest
 *     palette (docs/DATA.md: score + clock/state + goalscorer name+minute
 *     only) and is not read here.
 *   - Clock/minute: Scores does not carry a top-level Minutes; the schema's
 *     SoccerFixtureClock { running: boolean, seconds: int } lives on
 *     dataSoccer.New.Clock / dataSoccer.Previous.Clock (SoccerUpdateReference)
 *     and on SoccerData.Minutes directly for the specific update event. We
 *     prefer dataSoccer.Minutes when present (it's the per-event minute TxLINE
 *     itself attaches to the action), falling back to
 *     Math.floor(dataSoccer.New.Clock.seconds / 60) if only the running clock
 *     is present, else null.
 *   - Goal detection: dataSoccer.Action / dataSoccer.Goal (boolean) mark a
 *     goal event; dataSoccer.Participant (1|2) says which side. TxLINE's
 *     Scores schema has no player *name* field we could find (PlayerId is an
 *     integer id, not a name — resolving it needs a roster lookup this feed
 *     does not provide inline). We surface `scorer` only when the raw payload
 *     carries an explicit player name string (some TxOdds deployments add
 *     one under a "PlayerName"-shaped key); otherwise `scorer` is left
 *     undefined rather than guessed — the honest palette calls for
 *     "goalscorer name+minute," and a numeric id is not a name.
 *   - action values themselves ("Goal", "YellowCard", "Corner", ... per
 *     SoccerData's boolean flags) are read generically: any Scores message
 *     with scoreSoccer present is treated as a potential ScoreEvent (goals
 *     tracked via Total.Goals delta is NOT computed here — this parser is
 *     stateless per message and just reports the score line TxLINE sent;
 *     detecting *change* is the caller's job, same as OddsTick is stateless).
 *     A message with only statusSoccerId (no scoreSoccer) and no dataSoccer.Goal
 *     is parsed as a StatusEvent instead of a ScoreEvent.
 *
 * Everything here is a pure function of its string input — no I/O, no clocks
 * except what's embedded in the payload (receivedAtMs is passed in by the
 * caller, since it's a property of *when the line was captured/received*,
 * not of the payload itself).
 */

import type { MatchPhase, OddsTick, ScoreEvent, StatusEvent } from './match';

/* ── odds ──────────────────────────────────────────────────────────── */

interface RawOddsMessage {
  FixtureId: number;
  MessageId?: string;
  Ts?: number;
  Bookmaker?: string;
  BookmakerId?: number;
  SuperOddsType?: string;
  GameState?: string | null;
  InRunning?: boolean;
  MarketParameters?: string | null;
  MarketPeriod?: string | null;
  PriceNames?: string[];
  Prices?: number[];
  Pct?: Array<string | number>;
}

const MATCH_RESULT_TYPE = '1X2_PARTICIPANT_RESULT';

function toFinitePct(v: string | number | undefined): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null; // catches "NA" and any garbage
  return n;
}

/**
 * Parse one raw TxLINE odds stream message (the JSON string that arrives as
 * the `data` field of an SSE `message` event, or the `data` field of a
 * recorded fixtures/*.jsonl line) into an OddsTick, or null if the row isn't
 * a usable full-match 1X2 (match-result) row.
 *
 * Filters applied, in order:
 *   1. must parse as JSON with a FixtureId
 *   2. SuperOddsType must be "1X2_PARTICIPANT_RESULT" — the only market in
 *      the honest palette (docs/DATA.md: "de-vigged win-probabilities").
 *   3. MarketPeriod must be null/absent — full match only, not a half-time
 *      or period sub-market (both were observed in the capture; only the
 *      full-match line matches what the stage's tide-on-pitch renders).
 *   4. If more than one bookmaker row is ever present, prefer one whose
 *      Bookmaker name contains "StablePrice" (case-insensitive) — the
 *      capture only ever has one (TXLineStablePriceDemargined/10021), so
 *      this branch is defensive, not load-bearing today.
 *   5. Pct must have exactly 3 legs, all finite numbers ("NA" or malformed
 *      → null, never a fabricated probability).
 *   6. Sum sanity: the 3 legs must sum to 1 ± 0.05 (Pct is a 0–100 percentage
 *      string; we divide by 100 here) — guards against a schema drift we
 *      haven't seen, not a normal-case rejection (observed captures sum to
 *      100 ± 0.03).
 *
 * @param raw the message's `data` field, as a JSON string
 * @param receivedAtMs when this line was captured (fixture replay) or
 *   received (live) — becomes OddsTick.tMs; TxLINE's own `Ts` field is kept
 *   under `raw` for reference but is not authoritative for replay pacing
 *   (see ReplaySource, which paces off receivedAtMs deltas).
 * @param source 'live' | 'replay' — threaded straight onto the tick per the
 *   honesty rule in contracts/match.ts (never blended/relabeled downstream).
 * @param participant1IsHome side-truth for this fixture. The odds envelope
 *   itself carries NO home/away field — PriceNames is ["part1","draw","part2"],
 *   PARTICIPANT order, and the scores wire proves Participant1IsHome can be
 *   false. Callers must thread the value learned from the fixture's scores
 *   envelopes (every scores message carries it — see
 *   sniffParticipant1IsHome). Defaults to true (every fixture observed so
 *   far); when false, the part1/part2 legs are swapped so pHome is always
 *   genuinely the home side.
 */
export function parseOddsMessage(
  raw: string,
  receivedAtMs: number,
  source: 'live' | 'replay',
  participant1IsHome = true,
  /**
   * WHICH 1X2 to accept (the phase hand-off): 'full' (default) = the
   * match-result line (MarketPeriod null — settles on the 90' score);
   * 'et' = the extra-time-scoped 1X2 (MarketPeriod 'et' — the wire keeps
   * it alive through ET; observed 464 live ticks, ARG–CPV). Sources switch
   * by match phase; the returned tick carries `period` so surfaces can
   * label the market they're showing.
   */
  period: 'full' | 'et' = 'full',
): OddsTick | null {
  let msg: RawOddsMessage;
  try {
    msg = JSON.parse(raw) as RawOddsMessage;
  } catch {
    return null;
  }
  if (typeof msg.FixtureId !== 'number') return null;
  if (msg.SuperOddsType !== MATCH_RESULT_TYPE) return null;
  if (period === 'full') {
    if (msg.MarketPeriod !== null && msg.MarketPeriod !== undefined) return null;
  } else {
    if (msg.MarketPeriod !== 'et') return null;
  }

  const names = msg.PriceNames ?? [];
  const pct = msg.Pct ?? [];
  if (names.length !== 3 || pct.length !== 3) return null;
  // PriceNames is always ["part1","draw","part2"] in the capture — PARTICIPANT
  // order, NOT home/draw/away (the home mapping is applied below via the
  // threaded participant1IsHome); index-map rather than trust exact label
  // text, but sanity check the shape looks like a part1/draw/part2 triple.
  const drawIdx = names.findIndex((n) => n.toLowerCase() === 'draw');
  if (drawIdx !== 1) {
    // Every observed row has draw at index 1 ([part1, draw, part2]). If a
    // future feed ever reorders this, refuse to guess rather than mislabel
    // home/away — better a dropped tick than a silently swapped side.
    return null;
  }

  const pPart1 = toFinitePct(pct[0]);
  const pDraw = toFinitePct(pct[1]);
  const pPart2 = toFinitePct(pct[2]);
  if (pPart1 === null || pDraw === null || pPart2 === null) return null;

  // part1/part2 → home/away via the threaded side-truth (see doc comment).
  const home = (participant1IsHome ? pPart1 : pPart2) / 100;
  const draw = pDraw / 100;
  const away = (participant1IsHome ? pPart2 : pPart1) / 100;
  const sum = home + draw + away;
  if (Math.abs(sum - 1) > 0.05) return null; // sanity gate, see doc comment above

  return {
    tMs: receivedAtMs,
    minute: null, // odds stream carries no clock field — see file header
    pHome: home,
    pDraw: draw,
    pAway: away,
    source,
    period,
    raw: msg,
  };
}

/**
 * Cheap side-truth sniff for the latch pattern: every SCORES envelope carries
 * Participant1IsHome (the odds envelopes never do). Sources call this on
 * scores-shaped lines, latch the latest non-null answer per fixture, and
 * thread it into parseOddsMessage. Returns null when the field is absent or
 * the line isn't JSON — callers keep their previous latch (or the `true`
 * default) rather than guess.
 *
 * Callers may fast-path with raw.includes('"Participant1IsHome"') to skip
 * the JSON.parse on the (majority) odds lines.
 */
export function sniffParticipant1IsHome(raw: string): boolean | null {
  try {
    const msg = JSON.parse(raw) as { Participant1IsHome?: unknown };
    return typeof msg.Participant1IsHome === 'boolean' ? msg.Participant1IsHome : null;
  } catch {
    return null;
  }
}

/* ── scores ────────────────────────────────────────────────────────── */
/*
 * CHANGELOG (coordinator, Fri night — live-wire correction): the REAL scores
 * stream (validated against AUS–EGY live, fixtures/scores-night-20260703.jsonl)
 * speaks an UpperCamelCase action envelope — NOT the lowercase OpenAPI Scores
 * schema the first draft was built from (that shape appears to belong to the
 * /snapshot endpoints). Observed live anatomy:
 *   { FixtureId, GameState:"scheduled" (stale — IGNORE; the real phase is
 *     StatusId), StartTime, Participant1IsHome, Participant{1,2}Id,
 *     Action:"lineups|connected|venue|kickoff|status|goal|shot|corner|
 *     possession|attack_possession|danger_possession|..." , Id (stable per
 *     real-world event — a goal re-emits with the same Id as it upgrades
 *     unconfirmed→confirmed→confirmed+GoalType+PlayerId), Ts, Seq, Confirmed,
 *     Clock:{Running,Seconds}, Score:{Participant1:{Total:{Goals,Corners},..},
 *     Participant2:{...}}, Participant (1|2, the acting side), Data:{...} }
 * Duplicate-emission safety: consumers dedupe by score-delta (stage) — this
 * parser stays stateless and simply reports the score line each message
 * carries. Participant1IsHome:false swaps sides honestly.
 * The legacy lowercase parse paths are kept as a fallback for snapshot-shaped
 * payloads. StatusId→phase map is EMPIRICAL (observed: 1=pre, 2=first half;
 * further codes added as tonight's captures reveal them — unknown codes
 * return null rather than guess).
 */

interface RawLiveClock {
  Running?: boolean;
  Seconds?: number;
}

interface RawLiveScoreSide {
  Total?: { Goals?: number; Corners?: number };
}

interface RawLiveEnvelope {
  FixtureId?: number;
  Participant1IsHome?: boolean;
  Action?: string;
  Id?: number;
  StatusId?: number;
  Confirmed?: boolean;
  Clock?: RawLiveClock;
  Score?: { Participant1?: RawLiveScoreSide; Participant2?: RawLiveScoreSide };
  Participant?: number;
  Data?: { StatusId?: number; GoalType?: string; PlayerId?: number; Goal?: boolean };
}

/** Empirical StatusId → MatchPhase (live wire). Unknown → null, never guessed. */
/*
 * EMPIRICAL StatusId ladder — decoded from the full AUS–EGY knockout epic
 * (fixtures/scores-night-20260703.jsonl: 1–1 after 90, extra time, penalties):
 *   playing phases arrive as a `status` + paired `kickoff` (top-level StatusId,
 *   running Clock): 2=H1(0s) · 4=H2(2700s) · 7=ET1(5400s) · 9=ET2(6300s)
 *   breaks arrive as `status` only (no Clock): 3=HT · 6=end-of-90-before-ET ·
 *   8=ET break · 11=end-of-ET-before-pens
 *   12=penalty shootout · 13=final (observed after pens; expected to also be
 *   the straight-90 final — confirm vs ARG–CPV/COL–GHA tonight)
 *   5=FULL-TIME decided in 90 (COL–GHA 2–0) · 10=end-of-ET decided
 *   (ARG–CPV 3–2) — the ladder is COMPLETE, all rungs observed live. Break
 *   codes 6/8/11 return null: the stage honestly holds the prior playing
 *   phase through a break (HALF_TIME is the one break the product surfaces).
 */
function mapLiveStatusId(id: number | undefined): MatchPhase | null {
  switch (id) {
    case 1:
      return 'PRE'; // observed pre-kickoff
    case 2:
      return 'FIRST_HALF'; // observed at kickoff
    case 3:
      return 'HALF_TIME'; // CONFIRMED live (AUS–EGY 18:10Z)
    case 4:
      return 'SECOND_HALF'; // CONFIRMED live (AUS–EGY 18:27Z, Clock 2700s)
    case 7:
      return 'EXTRA_TIME'; // CONFIRMED live — ET1 kickoff (Clock 5400s)
    case 9:
      return 'EXTRA_TIME'; // CONFIRMED live — ET2 kickoff (Clock 6300s)
    case 5:
      // CONFIRMED live — full-time, DECIDED IN 90 (COL–GHA 2–0: arrived at
      // the straight-90 whistle). The ladder's last rung, caught Jul 4 ~03:2xZ.
      return 'FULL_TIME';
    case 10:
      // CONFIRMED live — end of ET, DECIDED (ARG–CPV 3–2: arrived at the ET2
      // whistle with the clock zeroed; the official seal (game_finalised)
      // follows minutes later). At MatchPhase granularity both are full-time —
      // relic crystallization should await the seal, never this phase flip.
      return 'FULL_TIME';
    case 12:
      return 'PENALTIES'; // CONFIRMED live — shootout under way
    case 13:
      return 'FULL_TIME'; // CONFIRMED live — final seal (after pens AUS–EGY; expected after 10 too)
    default:
      return null;
  }
}

function liveMinute(clock: RawLiveClock | undefined): number | null {
  if (!clock || typeof clock.Seconds !== 'number' || !Number.isFinite(clock.Seconds)) return null;
  return Math.max(0, Math.floor(clock.Seconds / 60));
}

interface RawSoccerScoreLine {
  Total?: { Goals?: number };
}

interface RawSoccerFixtureScore {
  Participant1?: RawSoccerScoreLine;
  Participant2?: RawSoccerScoreLine;
}

interface RawSoccerUpdateRef {
  Clock?: { running?: boolean; seconds?: number };
}

interface RawSoccerData {
  Action?: string;
  Goal?: boolean;
  Minutes?: number;
  Participant?: number;
  PlayerId?: number;
  PlayerName?: string; // not in the documented schema; read defensively if present
  New?: RawSoccerUpdateRef;
  Previous?: RawSoccerUpdateRef;
}

interface RawScoresMessage {
  fixtureId?: number;
  gameState?: string;
  statusSoccerId?: unknown; // discriminated union of empty {title} objects — see mapStatusCode
  scoreSoccer?: RawSoccerFixtureScore;
  dataSoccer?: RawSoccerData;
  ts?: number;
}

/**
 * Every SoccerFixtureStatus code from docs/txline/openapi.yaml (SoccerFixtureStatus
 * oneOf: A2/C2/END/ET1/ET2/F2/FET/FPE/H11/H21/HT2/HTET/I2/NS2/P/PE/TXCC2/TXCS2/WET/WPE
 * — the "2"/"1" suffixes are the schema's own duplicate-safe discriminator
 * aliases; `title` on each is the real short code) cross-referenced against
 * the plain-English table on the live soccer-feed doc
 * (https://txline.txodds.com/documentation/scores/soccer-feed):
 *   NS=Not started, H1=First half in play, HT=Halftime, H2=Second half in
 *   play, F=Ended, WET=Waiting for extra time, ET1=Extra time first half,
 *   HTET=Extra time halftime, ET2=Extra time second half, FET=Ended after
 *   extra time, WPE=Waiting for penalty shootout, PE=Penalty shootout in
 *   progress, FPE=Ended after penalty shootout, I=Interrupted, A=Abandoned,
 *   C=Cancelled, TXCC=TX coverage cancelled, TXCS=TX coverage suspended,
 *   P=Postponed.
 *
 * Folded onto contracts/match.ts's MatchPhase (which has no interrupted/
 * abandoned/cancelled/postponed/coverage-suspended phase — the honest
 * palette only names phases the stage actually renders differently):
 *   - I (interrupted) and TXCS (coverage suspended) fold to whatever the
 *     match was doing before the interruption is unknown from the code
 *     alone, so both fold to the closer of PRE (no play happened yet) or
 *     FULL_TIME (nothing more to show) — here we choose to keep them as
 *     whatever the *previous* known phase was is out of scope for a
 *     stateless per-message mapper, so I/TXCS map to PRE (never render as
 *     if the match is proceeding on data we don't trust).
 *   - A/C/P (abandoned/cancelled/postponed) fold to PRE (the match never
 *     honestly reached a further phase from the fan's perspective).
 *   - TXCC (coverage cancelled) folds to PRE for the same reason — TxLINE
 *     stopped covering it, we have nothing further to show.
 */
function mapStatusCode(code: string | null): MatchPhase | null {
  switch (code) {
    case 'NS':
      return 'PRE';
    case 'H1':
      return 'FIRST_HALF';
    case 'HT':
      return 'HALF_TIME';
    case 'H2':
      return 'SECOND_HALF';
    case 'WET':
    case 'ET1':
      return 'EXTRA_TIME';
    case 'HTET':
      return 'HALF_TIME';
    case 'ET2':
      return 'EXTRA_TIME';
    case 'WPE':
    case 'PE':
      return 'PENALTIES';
    case 'F':
    case 'FET':
    case 'FPE':
      return 'FULL_TIME';
    case 'I':
    case 'TXCS':
    case 'TXCC':
    case 'A':
    case 'C':
    case 'P':
      return 'PRE'; // see doc comment above — never claim a phase we can't trust
    default:
      return null;
  }
}

/**
 * SoccerFixtureStatus arrives as a `oneOf` of title-tagged discriminator
 * objects rather than a plain string in the OpenAPI schema, e.g.
 * `{ "title": "H1" }` or (depending on how the wire actually serializes a
 * oneOf-of-empty-objects — TxLINE's real payloads were not observed in the
 * capture, since it predates kickoff) potentially just the bare string
 * `"H1"`. This helper accepts either shape rather than assume one, because
 * we have no live example to confirm against.
 */
function extractStatusCode(status: unknown): string | null {
  if (typeof status === 'string') return status;
  if (status && typeof status === 'object') {
    const obj = status as Record<string, unknown>;
    if (typeof obj.title === 'string') return obj.title;
    // oneOf-of-empty-object shapes sometimes serialize as { "H1": {} }
    const keys = Object.keys(obj);
    if (keys.length === 1) return keys[0] ?? null;
  }
  return null;
}

/**
 * Parse one raw TxLINE scores stream message into a ScoreEvent (goal/score
 * line present) or null if it doesn't carry a score.
 *
 * NOTE: no real Scores payload was present in fixtures/scores-20260703.jsonl
 * to validate this against (the capture is 180 heartbeats + one __meta line —
 * see scripts/replay-inspect.ts and the normalize.ts file header) — this is
 * built directly from docs/txline/openapi.yaml's Scores/SoccerFixtureScore/
 * SoccerScore/SoccerData schemas. Flagged in the data lane's report as
 * unverified-against-live-example.
 */
export function parseScoreMessage(
  raw: string,
  receivedAtMs: number,
  source: 'live' | 'replay',
): ScoreEvent | null {
  let msg: (RawScoresMessage & RawLiveEnvelope) | null = null;
  try {
    msg = JSON.parse(raw) as RawScoresMessage & RawLiveEnvelope;
  } catch {
    return null;
  }

  /* ── live wire (UpperCamelCase envelope — validated vs AUS–EGY) ── */
  // A score line rides on many actions ("goal", "corner", ...). We report it
  // only from 'goal' actions: that is the moment the score CHANGED, which is
  // what ScoreEvent means on the bus (the stage's delta-guard absorbs the
  // repeated emissions of the same goal Id as it upgrades to Confirmed).
  if (typeof msg.Action === 'string') {
    if (msg.Action !== 'goal') return null;
    const p1Goals = msg.Score?.Participant1?.Total?.Goals ?? 0;
    const p2Goals = msg.Score?.Participant2?.Total?.Goals ?? 0;
    if (typeof p1Goals !== 'number' || typeof p2Goals !== 'number') return null;
    const p1IsHome = msg.Participant1IsHome !== false; // default true, observed true
    const home = p1IsHome ? p1Goals : p2Goals;
    const away = p1IsHome ? p2Goals : p1Goals;
    const actor = msg.Participant; // 1|2 = which participant scored
    const side =
      actor === 1 ? (p1IsHome ? 'home' : 'away') : actor === 2 ? (p1IsHome ? 'away' : 'home') : undefined;
    return {
      tMs: receivedAtMs,
      minute: liveMinute(msg.Clock),
      home,
      away,
      side,
      // the live wire carries only a numeric Data.PlayerId — a number is not a
      // name; scorer stays undefined per the honesty law (garnish resolves it)
      scorer: undefined,
      source,
      raw: msg,
    };
  }

  /* ── legacy/snapshot shape (lowercase OpenAPI schema) ── */
  const scoreSoccer = msg.scoreSoccer;
  if (!scoreSoccer) return null;
  const home = scoreSoccer.Participant1?.Total?.Goals;
  const away = scoreSoccer.Participant2?.Total?.Goals;
  if (typeof home !== 'number' || typeof away !== 'number') return null;

  const data = msg.dataSoccer;
  const minute = normalizeMinute(data);
  const side = data?.Participant === 1 ? 'home' : data?.Participant === 2 ? 'away' : undefined;
  const scorer = typeof data?.PlayerName === 'string' ? data.PlayerName : undefined;

  return {
    tMs: receivedAtMs,
    minute,
    home,
    away,
    side,
    scorer,
    source,
    raw: msg,
  };
}

/**
 * Parse one raw TxLINE scores stream message into a StatusEvent (phase
 * change, no score line) or null if it doesn't carry a recognizable status.
 * A message that has both a status AND a score is reported by
 * parseScoreMessage instead — callers should try parseScoreMessage first and
 * fall back to parseStatusMessage, matching the shape of contracts/match.ts's
 * MatchCallbacks (onScore vs onStatus are separate callbacks).
 */
export function parseStatusMessage(
  raw: string,
  receivedAtMs: number,
  source: 'live' | 'replay',
): StatusEvent | null {
  let msg: (RawScoresMessage & RawLiveEnvelope) | null = null;
  try {
    msg = JSON.parse(raw) as RawScoresMessage & RawLiveEnvelope;
  } catch {
    return null;
  }

  /* ── live wire: phase changes ride 'status' and 'kickoff' actions ── */
  // GameState on the envelope is stale ("scheduled" even in play) — the truth
  // is StatusId (Data.StatusId on 'status' actions, top-level elsewhere).
  if (typeof msg.Action === 'string') {
    if (msg.Action !== 'status' && msg.Action !== 'kickoff') return null;
    const id = msg.Action === 'status' ? (msg.Data?.StatusId ?? msg.StatusId) : msg.StatusId;
    const phase = mapLiveStatusId(id);
    if (!phase) return null;
    return {
      tMs: receivedAtMs,
      phase,
      minute: liveMinute(msg.Clock),
      source,
      raw: msg,
    };
  }

  /* ── legacy/snapshot shape ── */
  const code = extractStatusCode(msg.statusSoccerId);
  if (!code) return null;
  const phase = mapStatusCode(code);
  if (!phase) return null;

  return {
    tMs: receivedAtMs,
    phase,
    minute: normalizeMinute(msg.dataSoccer),
    source,
    raw: msg,
  };
}

/** dataSoccer.Minutes wins; else derive from the running clock's seconds. */
function normalizeMinute(data: RawSoccerData | undefined): number | null {
  if (!data) return null;
  if (typeof data.Minutes === 'number') return data.Minutes;
  const seconds = data.New?.Clock?.seconds ?? data.Previous?.Clock?.seconds;
  if (typeof seconds === 'number') return Math.floor(seconds / 60);
  return null;
}

/* ── the ledger (contracts/ledger.ts) — the match as a readable story ──── */
/*
 * parseLedgerMessage: one live-wire envelope → one LedgerMsg, or null for
 * actions the ledger deliberately ignores (possession ticks, throw-ins,
 * goal kicks, bookkeeping like halftime_finalised — chatter, not story).
 * Stateless like every parser here; the client-side builder owns spell
 * collapsing (consecutive danger rows), amend/discard matching, and
 * goal-row replacement by id.
 *
 * The whole mapping is EMPIRICAL — every kind below was observed live in
 * fixtures/scores-night-20260703.jsonl (AUS–EGY, the ET+pens epic), except
 * red_card which mirrors yellow_card's shape. Unknown actions return null.
 */

import type { LedgerEvent, LedgerKind, LedgerMsg } from './ledger';

interface RawLedgerEnvelope {
  FixtureId?: number;
  Action?: string;
  Id?: number;
  Ts?: number;
  Confirmed?: boolean;
  Clock?: RawLiveClock;
  Participant?: number;
  Participant1IsHome?: boolean;
  StatusId?: number;
  Score?: RawSoccerFixtureScore;
  Data?: {
    StatusId?: number;
    Goal?: boolean;
    Corner?: boolean;
    Penalty?: boolean;
    Outcome?: string;
    Participant?: number;
    Action?: string;
    New?: { Clock?: { Seconds?: number }; Outcome?: string };
    Previous?: { Clock?: { Seconds?: number }; Outcome?: string };
  };
}

/** wire action → ledger kind, for the actions that ARE story. */
const LEDGER_ACTION_KIND: Record<string, LedgerKind> = {
  players_warming_up: 'warmup',
  players_on_the_pitch: 'warmup',
  standby: 'warmup',
  kickoff: 'kickoff',
  goal: 'goal',
  possible: 'possible',
  shot: 'shot',
  corner: 'corner',
  free_kick: 'free-kick',
  yellow_card: 'yellow-card',
  red_card: 'red-card',
  substitution: 'substitution',
  injury: 'injury',
  additional_time: 'additional-time',
  danger_possession: 'danger',
  high_danger_possession: 'danger',
  penalty_outcome: 'penalty-kick',
};

const LEDGER_HEADLINE: Record<LedgerKind, string> = {
  warmup: 'In the tunnel',
  kickoff: 'Kick-off',
  goal: 'Goal',
  possible: 'Checking…',
  shot: 'Shot',
  corner: 'Corner',
  'free-kick': 'Free kick',
  'yellow-card': 'Yellow card',
  'red-card': 'Red card',
  substitution: 'Substitution',
  injury: 'Injury pause',
  'additional-time': 'Additional time',
  danger: 'Dangerous spell',
  break: 'The break',
  penalties: 'Penalty shootout',
  'penalty-kick': 'Penalty',
  'full-time': 'Full-time',
};

/** kinds that are always visible; everything else folds behind disclosure. */
const LEDGER_MAJOR = new Set<LedgerKind>([
  'kickoff',
  'goal',
  'yellow-card',
  'red-card',
  'break',
  'penalties',
  'penalty-kick',
  'full-time',
]);

/** StatusId → the break/final rows (playing-phase rows come from `kickoff`
 * envelopes instead — they carry the running clock; see the ladder note). */
const LEDGER_STATUS_ROW: Record<number, { kind: LedgerKind; headline: string }> = {
  3: { kind: 'break', headline: 'Half-time' },
  6: { kind: 'break', headline: 'End of 90 — extra time coming' },
  8: { kind: 'break', headline: 'Extra-time break' },
  11: { kind: 'break', headline: 'End of extra time' },
  12: { kind: 'penalties', headline: 'Penalty shootout' },
  13: { kind: 'full-time', headline: 'Full-time' },
};

function ledgerSide(participant: number | undefined, p1IsHome: boolean): 'home' | 'away' | null {
  if (participant !== 1 && participant !== 2) return null;
  const isP1 = participant === 1;
  return isP1 === p1IsHome ? 'home' : 'away';
}

export function parseLedgerMessage(
  raw: string,
  receivedAtMs: number,
  source: 'live' | 'replay',
): LedgerMsg | null {
  let msg: RawLedgerEnvelope;
  try {
    msg = JSON.parse(raw) as RawLedgerEnvelope;
  } catch {
    return null;
  }
  if (typeof msg.FixtureId !== 'number' || typeof msg.Action !== 'string') return null;
  const p1IsHome = msg.Participant1IsHome !== false; // envelope-carried, default true
  const fixtureKey = String(msg.FixtureId);
  const tMs = receivedAtMs;
  const minute = liveMinute(msg.Clock);
  const side = ledgerSide(msg.Participant, p1IsHome);

  /* retro-edits → patches (the builder matches by kind+clock+side) */
  if (msg.Action === 'action_amend') {
    const targetKind = LEDGER_ACTION_KIND[msg.Data?.Action ?? ''];
    if (!targetKind) return null; // amend of an action the ledger never showed
    const targetSeconds = msg.Data?.New?.Clock?.Seconds ?? msg.Data?.Previous?.Clock?.Seconds;
    return {
      type: 'amend',
      fixtureKey,
      targetKind,
      targetClockSeconds: typeof targetSeconds === 'number' ? targetSeconds : null,
      side,
      detail: msg.Data?.New?.Outcome ?? null,
      tMs,
    };
  }
  if (msg.Action === 'action_discarded') {
    return {
      type: 'discard',
      fixtureKey,
      targetClockSeconds: typeof msg.Clock?.Seconds === 'number' ? msg.Clock.Seconds : null,
      side,
      tMs,
    };
  }

  /* status envelopes → break/pens/final rows only (2/4/7/9 ride `kickoff`) */
  if (msg.Action === 'status') {
    const sid = msg.Data?.StatusId ?? msg.StatusId;
    const row = typeof sid === 'number' ? LEDGER_STATUS_ROW[sid] : undefined;
    if (!row) return null;
    return {
      type: 'event',
      ev: {
        id: `${fixtureKey}:${msg.Id ?? `s${sid ?? 'x'}`}`,
        kind: row.kind,
        major: true,
        minute,
        tMs,
        side: null,
        headline: row.headline,
        raw: msg,
      },
    };
  }

  const kind = LEDGER_ACTION_KIND[msg.Action];
  if (!kind) return null; // chatter (possession ticks, throw-ins, bookkeeping…)

  /* `possible` is only story when it's a goal/penalty being checked */
  if (kind === 'possible' && !(msg.Data?.Goal === true || msg.Data?.Penalty === true)) return null;

  const ev: LedgerEvent = {
    id: `${fixtureKey}:${msg.Id ?? `${msg.Action}-${tMs}`}`,
    kind,
    major: LEDGER_MAJOR.has(kind) || (kind === 'possible' && msg.Data?.Goal === true),
    minute,
    tMs,
    side,
    headline:
      kind === 'possible'
        ? msg.Data?.Penalty === true
          ? 'Penalty? Checking…'
          : 'Goal? Checking…'
        : LEDGER_HEADLINE[kind],
    raw: msg,
  };
  if (kind === 'goal') {
    ev.confirmed = msg.Confirmed === true;
    const p1 = msg.Score?.Participant1?.Total?.Goals;
    const p2 = msg.Score?.Participant2?.Total?.Goals;
    if (typeof p1 === 'number' && typeof p2 === 'number') {
      ev.score = p1IsHome ? { home: p1, away: p2 } : { home: p2, away: p1 };
    }
  }
  const outcome = msg.Data?.Outcome;
  if (typeof outcome === 'string' && outcome) {
    ev.detail = outcome;
    if (kind === 'penalty-kick') ev.headline = `Penalty — ${outcome}`;
  }
  return { type: 'event', ev };
}
