/**
 * ROOOT relics — REAL-MATCH DATA BUILDER (NEW; owned by the relics lane).
 *
 * Constructs a MatchRelicData (contracts/relic.ts) from the COMPLETED
 * AUS–EGY capture (FixtureId 18176123) in fixtures/{scores,odds}-night-20260703.jsonl,
 * normalized through contracts/normalize.ts — the ONE place that knows TxLINE's
 * wire shapes. Everything the renderers consume that comes from the FEED is REAL:
 * the odds path, the goal minutes, the final score, the capture window.
 *
 * HONESTY BOUNDARY (the law, AGENTS.md §1):
 *  · Market data (the odds path, goal minutes, final score) is REAL — parsed from
 *    the feed, never synthesized.
 *  · CROWD data is NOT in this capture (no stands service ran during AUS–EGY), so
 *    the crowd timeline + verdict + the personal fan (myRoar / faithBuckets /
 *    receipts / ratings) are SYNTHETIC DEV SPECIMENS, generated deterministically
 *    for RENDER VERIFICATION ONLY and LOUDLY LABELLED: every EditionInfo caption's
 *    frameName carries "SPECIMEN", provenance.attendeeRoot === 'DEV-SPECIMEN', and
 *    the ratings are derived by DOCUMENTED formulas (below), never hand-tuned.
 *  · The renderers themselves are pure and real-data-ready: swap this builder's
 *    synthetic blocks for real stands aggregates and nothing in the renderers changes.
 *
 * This module is NOT pure (it reads text), but it does no drawing and holds no
 * state. In the browser harness the two JSONL files are fetched over HTTP from the
 * repo root (Vite serves them in dev); a caller may also pass the raw text in.
 */

import { parseOddsMessage, parseScoreMessage, parseStatusMessage } from '@contracts/normalize';
import type { OddsTick, ScoreEvent, StatusEvent, Fixture, TeamRef } from '@contracts/match';
import type { Side } from '@contracts/crowd';
import type {
  MatchRelicData,
  OddsPathPoint,
  GoalMark,
  CrowdTimeline,
  StandsVerdict,
  ProvenanceRefs,
  CardData,
  StubData,
  EditionInfo,
  RatingsBlock,
  Receipt,
} from '@contracts/relic';

/* =========================================================================
 * FIXTURE META — AUS–EGY, honest labels.
 *
 * Observed in the capture (see the file header + scripts): Participant1IsHome === true,
 * Participant1Id 1519, Participant2Id 1867 → AUS is HOME (participant1), EGY is AWAY
 * (participant2). Team colours are the REAL national-team pairs (documented), used ONLY
 * in the four legal team-colour slots (territory / flagBlock / scoreChip / relicEnd):
 *   · Australia (the Socceroos): gold + green — ['#FFCD00','#1F6F40'].
 *     Real kit colours; the green matches the theme's `grass` benday green closely.
 *   · Egypt (the Pharaohs): red + black — ['#CE1126','#1A1A18'].
 *     Real flag/kit red; the black matches Press-Black ink.
 * The loud GROUND is chosen by neither-team-owns (§1) at render time (Poppy default),
 * so a team colour is never the ground even when a team wears a near-loud hue.
 * ===================================================================== */

export const AUS: TeamRef = {
  code: 'AUS',
  name: 'Australia',
  colors: ['#FFCD00', '#1F6F40'], // gold, green (Socceroos) — real
  flag: '🇦🇺',
};

export const EGY: TeamRef = {
  code: 'EGY',
  name: 'Egypt',
  colors: ['#CE1126', '#1A1A18'], // red, black (Pharaohs) — real
  flag: '🇪🇬',
};

export const AUS_EGY_FIXTURE_ID = 18176123;
/** kickoff epoch ms observed on the scores stream (StartTime) */
export const AUS_EGY_KICKOFF_MS = 1783101600000;

const FIXTURE: Fixture = {
  id: String(AUS_EGY_FIXTURE_ID),
  home: AUS,
  away: EGY,
  kickoffISO: new Date(AUS_EGY_KICKOFF_MS).toISOString(),
  venue: undefined,
};

/* =========================================================================
 * JSONL parsing — pull the fixture's lines, normalize through the contract.
 * ===================================================================== */

interface RawLine {
  receivedAtMs: number;
  event: string;
  data: string;
}

function parseJsonlLines(text: string): RawLine[] {
  const out: RawLine[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const o = JSON.parse(line) as RawLine;
      if (o && typeof o.receivedAtMs === 'number' && typeof o.event === 'string') out.push(o);
    } catch {
      /* skip garbled */
    }
  }
  return out;
}

/** Does this raw `data` string belong to our fixture? (cheap substring pre-filter). */
function isFixtureLine(data: string): boolean {
  return data.includes(String(AUS_EGY_FIXTURE_ID));
}

export interface ParsedFeed {
  odds: OddsTick[];
  scores: ScoreEvent[];
  statuses: StatusEvent[];
  windowFromMs: number;
  windowToMs: number;
  tickCount: number;
}

/**
 * Parse the two raw JSONL texts into normalized, fixture-filtered seam values.
 * Odds: only full-match 1X2 ticks survive parseOddsMessage. Scores: only 'goal'
 * actions become ScoreEvents. Statuses: 'status'/'kickoff' actions.
 */
export function parseFeed(scoresText: string, oddsText: string): ParsedFeed {
  const odds: OddsTick[] = [];
  const scores: ScoreEvent[] = [];
  const statuses: StatusEvent[] = [];
  let fromMs = Number.POSITIVE_INFINITY;
  let toMs = Number.NEGATIVE_INFINITY;

  for (const line of parseJsonlLines(oddsText)) {
    if (line.event !== 'message') continue;
    if (!isFixtureLine(line.data)) continue;
    const tick = parseOddsMessage(line.data, line.receivedAtMs, 'replay');
    if (!tick) continue;
    odds.push(tick);
    fromMs = Math.min(fromMs, line.receivedAtMs);
    toMs = Math.max(toMs, line.receivedAtMs);
  }

  for (const line of parseJsonlLines(scoresText)) {
    if (line.event !== 'message') continue;
    if (!isFixtureLine(line.data)) continue;
    const sc = parseScoreMessage(line.data, line.receivedAtMs, 'replay');
    if (sc) {
      scores.push(sc);
      fromMs = Math.min(fromMs, line.receivedAtMs);
      toMs = Math.max(toMs, line.receivedAtMs);
      continue;
    }
    const st = parseStatusMessage(line.data, line.receivedAtMs, 'replay');
    if (st) statuses.push(st);
  }

  odds.sort((a, b) => a.tMs - b.tMs);
  scores.sort((a, b) => a.tMs - b.tMs);
  statuses.sort((a, b) => a.tMs - b.tMs);

  return {
    odds,
    scores,
    statuses,
    windowFromMs: Number.isFinite(fromMs) ? fromMs : AUS_EGY_KICKOFF_MS,
    windowToMs: Number.isFinite(toMs) ? toMs : AUS_EGY_KICKOFF_MS,
    tickCount: odds.length,
  };
}

/* =========================================================================
 * DOWNSAMPLE — the odds stream has ~3000 ticks; the tide history wants
 * ≈1 point per 15–30s (OddsPathPoint). We bucket by wall-clock time and keep
 * the LAST tick in each bucket (the freshest belief for that window), and we
 * attach the honest MATCH MINUTE by joining against the scores clock (the odds
 * stream carries no clock — see normalize.ts). Pre-kickoff points get minute null.
 * ===================================================================== */

const DOWNSAMPLE_BUCKET_MS = 20_000; // ~20s per point

/** Build a (wall-ms → match-minute) lookup from the scores stream's clocked events. */
function buildClockJoin(feed: ParsedFeed): Array<{ tMs: number; minute: number }> {
  const anchors: Array<{ tMs: number; minute: number }> = [];
  for (const s of feed.scores) if (s.minute !== null) anchors.push({ tMs: s.tMs, minute: s.minute });
  for (const s of feed.statuses) if (s.minute !== null) anchors.push({ tMs: s.tMs, minute: s.minute });
  anchors.sort((a, b) => a.tMs - b.tMs);
  return anchors;
}

/** Nearest clocked anchor's minute for a wall-clock ms, or null if pre-kickoff. */
function minuteAt(anchors: Array<{ tMs: number; minute: number }>, tMs: number): number | null {
  const first = anchors[0];
  if (!first) return null;
  if (tMs < first.tMs - 60_000) return null; // clearly pre-match
  // find the last anchor at or before tMs
  let best: { tMs: number; minute: number } | null = null;
  for (const a of anchors) {
    if (a.tMs <= tMs) best = a;
    else break;
  }
  if (!best) return null;
  // extrapolate forward from the anchor by the wall-clock delta (clock runs ~real-time)
  const extra = Math.floor((tMs - best.tMs) / 60_000);
  return best.minute + Math.max(0, extra);
}

export function downsampleOdds(feed: ParsedFeed): OddsPathPoint[] {
  const anchors = buildClockJoin(feed);
  const buckets = new Map<number, OddsTick>();
  for (const t of feed.odds) {
    const key = Math.floor(t.tMs / DOWNSAMPLE_BUCKET_MS);
    buckets.set(key, t); // last write wins = freshest in the bucket
  }
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  return keys.map((k) => {
    const t = buckets.get(k)!;
    return {
      tMs: t.tMs,
      minute: minuteAt(anchors, t.tMs),
      pHome: t.pHome,
      pDraw: t.pDraw,
      pAway: t.pAway,
    };
  });
}

/* =========================================================================
 * GOALS — from CONFIRMED goal events. A real-world goal re-emits with the same
 * Id as it upgrades unconfirmed→confirmed (see normalize.ts). We dedupe on the
 * (side, score-total) transition and take the match MINUTE from the clock.
 * ===================================================================== */

export function extractGoals(feed: ParsedFeed): GoalMark[] {
  const goals: GoalMark[] = [];
  let lastHome = 0;
  let lastAway = 0;
  for (const s of feed.scores) {
    const homeUp = s.home > lastHome;
    const awayUp = s.away > lastAway;
    if (!homeUp && !awayUp) continue; // duplicate emission of the same score line
    const side: Side = homeUp ? 'home' : 'away';
    goals.push({ minute: s.minute, side, scorer: s.scorer });
    lastHome = s.home;
    lastAway = s.away;
  }
  return goals;
}

/** The final score = the last score line the feed carried. */
export function finalScoreOf(feed: ParsedFeed): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const s of feed.scores) {
    home = s.home;
    away = s.away;
  }
  return { home, away };
}

/* =========================================================================
 * SYNTHETIC CROWD SPECIMEN — clearly labelled, deterministic, render-only.
 *
 * There is NO crowd capture for AUS–EGY, so we FABRICATE a plausible-shaped
 * crowd timeline + one specimen fan so the generators have honest-shaped inputs
 * to draw. NONE of this is real; it exists to verify the renders. The shapes are
 * driven off the REAL arc (louder when the fan's side is behind, spikes at goals)
 * so the picture reads truthfully even though the numbers are invented.
 *
 * The specimen fan is an AUS (home) supporter in "END AUS", ROW LUKAS, SEAT 7.
 * ===================================================================== */

const SPECIMEN_SIDE: Side = 'home'; // the specimen fan roots for Australia
const SPECIMEN_BUCKETS = 28; // one myRoar/faith bucket per skyline bar (COMPONENTS.skyline.bars)

/**
 * Build the specimen fan's per-bucket roar + faith arrays off the real odds arc.
 * `myRoar[i]` — synthetic tap intensity 0..1 for time-bucket i (louder near goals
 * and when Australia trails). `faithBuckets[i]` — synthetic "cheered while behind"
 * intensity 0..1 (nonzero only in buckets where the fan's side was losing).
 */
function buildSpecimenFan(path: OddsPathPoint[], goals: GoalMark[]): {
  myRoar: number[];
  faithBuckets: number[];
} {
  const n = SPECIMEN_BUCKETS;
  const myRoar: number[] = [];
  const faithBuckets: number[] = [];
  const rnd = mulberry(0x2007); // stable specimen seed
  // Real tap data is BURSTY — long lulls punctuated by hard bursts (a chance, a chant, a
  // goal). The specimen mimics that shape so the roar-bars skyline reads like the canon's
  // equalizer (tall spikes over quiet valleys), not a flat slab. Still synthetic, still
  // labelled; only the SHAPE is made realistic.
  for (let i = 0; i < n; i++) {
    const p = path[Math.min(path.length - 1, Math.floor((i / n) * path.length))] ?? {
      pHome: 1 / 3,
      pDraw: 1 / 3,
      pAway: 1 / 3,
      minute: null,
      tMs: 0,
    };
    // "behind-ness" for the home fan = away prob minus home prob, clamped to [0,1]
    const behind = Math.max(0, p.pAway - p.pHome);
    const excitement = 1 - Math.abs(p.pHome - p.pAway); // near-even = loud terraces
    // quiet floor + modest swell…
    let roar = 0.1 + 0.22 * excitement + 0.18 * behind;
    // …plus BURSTS: a chant wave every few buckets + sporadic surges (chances, near-misses)
    const chant = Math.max(0, Math.sin(i * 1.7 + 0.9)) ** 3;
    const surge = rnd() < 0.22 ? 0.35 + 0.45 * rnd() : 0;
    roar += 0.3 * chant + surge;
    // goal spikes: any bucket whose minute brackets a goal minute goes to full scream
    for (const g of goals) {
      if (g.minute === null || p.minute === null) continue;
      if (Math.abs(g.minute - p.minute) <= 3) roar = Math.max(roar, 0.92 + 0.08 * rnd());
    }
    // deepen the valleys so the skyline carries real dynamic range (spikes over lulls)
    roar = Math.pow(Math.max(0.04, Math.min(1, roar)), 1.35);
    myRoar.push(roar);
    // faith = cheering while your side is behind → only counts when behind > 0
    faithBuckets.push(behind > 0.05 ? Math.min(1, behind * (0.6 + 0.5 * roar)) : 0);
  }
  return { myRoar, faithBuckets };
}

/* tiny local mulberry (self-contained; the paint module's twin) */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * SYNTHETIC crowd timeline (StandsVerdict + CrowdTimeline) for the poster/collective.
 * Deterministic, render-only, off the real arc. Rooted counts + roar arrays are
 * invented; they are never presented as real in any caption.
 */
function buildSpecimenCrowd(path: OddsPathPoint[], goals: GoalMark[]): {
  crowd: CrowdTimeline;
  verdict: StandsVerdict;
  rootedHome: number;
  rootedAway: number;
} {
  const n = SPECIMEN_BUCKETS;
  const homeRoar: number[] = [];
  const awayRoar: number[] = [];
  const zeros = (): number[] => new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const p = path[Math.min(path.length - 1, Math.floor((i / n) * path.length))];
    const ph = p ? p.pHome : 1 / 3;
    const pa = p ? p.pAway : 1 / 3;
    // each end roars louder when THEY are behind (the honest faith bias) + on goals
    let hr = 0.3 + 0.5 * Math.max(0, pa - ph);
    let ar = 0.3 + 0.5 * Math.max(0, ph - pa);
    for (const g of goals) {
      if (g.minute === null || !p || p.minute === null) continue;
      if (Math.abs(g.minute - p.minute) <= 3) {
        if (g.side === 'home') hr += 0.5;
        else ar += 0.5;
      }
    }
    homeRoar.push(Math.min(1, hr));
    awayRoar.push(Math.min(1, ar));
  }
  const crowd: CrowdTimeline = {
    bucketSec: 300,
    roar: { home: homeRoar, away: awayRoar },
    pulse: {
      home: { belief: zeros(), nerves: zeros(), rage: zeros() },
      away: { belief: zeros(), nerves: zeros(), rage: zeros() },
    },
  };
  // synthetic verdict scores 0..99 (render-only). Home slightly edges it (louder, more faith
  // — they trailed most of the match). These are NOT real aggregates.
  const verdict: StandsVerdict = {
    scores: {
      home: { loudness: 87, faith: 92, presence: 78, foresight: 64 },
      away: { loudness: 81, faith: 70, presence: 74, foresight: 69 },
    },
    winner: 'home',
  };
  return { crowd, verdict, rootedHome: 12431, rootedAway: 8207 };
}

/* =========================================================================
 * RATINGS DERIVATION (the four card stats, 0–99). DOCUMENTED FORMULAS — the
 * task lets the relic lane CHOOSE the derivation; these are ours, written so a
 * reviewer can audit each number. Applied to the specimen fan's synthetic
 * aggregates; identical maths will apply to real aggregates later, unchanged.
 *
 *  · LOU (loudness)  = mean(myRoar) mapped 0..99. "How loud were you, on average."
 *  · FTH (faith)     = mean(faithBuckets) mapped 0..99, but BEHIND-WEIGHTED: faith
 *                      only accrues in buckets where your side trailed (built into
 *                      faithBuckets), and we take the mean over the ROOT of coverage
 *                      so a fan who kept the faith through a long deficit scores high.
 *                      FTH = 99 * mean(faithBuckets) ^ 0.7   (the <1 exponent rewards
 *                      sustained faith rather than one spike).
 *  · FOR (foresight) = how well the fan's PROVED calls beat the market. For each
 *                      proved receipt, edge = (1 - marketP_of_the_side_they_called);
 *                      calling a 12% outcome that came true = 0.88 edge. FOR = 99 *
 *                      mean(edge over proved receipts); 0 proved calls → a floor of 40
 *                      ("unproven", not "bad"). Rewards rare, against-the-grain calls.
 *  · PRE (presence)  = fraction of the match's time-buckets in which the fan made ANY
 *                      roar above a presence threshold (0.15). "Were you actually here
 *                      the whole time." PRE = 99 * (buckets_present / total_buckets).
 *
 * All four clamp to [0,99] and round. The formulas are intentionally simple and
 * legible; tuning them is a product decision, not a rendering one.
 * ===================================================================== */

export function deriveRatings(
  myRoar: number[],
  faithBuckets: number[],
  receipts: Receipt[],
  side: Side,
): RatingsBlock {
  const mean = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const clamp99 = (v: number): number => Math.max(0, Math.min(99, Math.round(v)));

  const LOU = clamp99(99 * mean(myRoar));
  const FTH = clamp99(99 * Math.pow(mean(faithBuckets), 0.7));

  const proved = receipts.filter((r) => r.proved === true);
  let FOR: number;
  if (proved.length === 0) {
    FOR = 40; // unproven floor
  } else {
    const edges = proved.map((r) => {
      const p = side === 'home' ? r.marketP.home : side === 'away' ? r.marketP.away : r.marketP.draw;
      return Math.max(0, 1 - p); // beating a long-shot market = big edge
    });
    FOR = clamp99(99 * mean(edges));
  }

  const presenceThreshold = 0.15;
  const present = myRoar.filter((v) => v >= presenceThreshold).length;
  const PRE = clamp99(99 * (present / Math.max(1, myRoar.length)));

  return { LOU, FTH, FOR, PRE };
}

/* =========================================================================
 * ASSEMBLY — the public builders.
 * ===================================================================== */

/**
 * MatchArc — the SMALL, serializable REAL-DATA core of the AUS–EGY match:
 * the downsampled odds path, the goals, the final score, the capture window, and
 * the raw tick count. This is the honest extract that survives after the (huge,
 * gitignored) raw fixtures are gone — the dev prep script writes it to a compact
 * JSON asset, and the harness feeds it straight in. Building from a MatchArc and
 * building from raw JSONL produce identical relics; the arc is just the parsed
 * result cached. (This is the seam a real stands/TxLINE hookup replaces.)
 */
export interface MatchArc {
  oddsPath: OddsPathPoint[];
  goals: GoalMark[];
  finalScore: { home: number; away: number };
  windowFromMs: number;
  windowToMs: number;
  tickCount: number;
}

/** Parse raw JSONL → the compact real-data MatchArc (the prep script's output). */
export function buildMatchArc(scoresText: string, oddsText: string): MatchArc {
  const feed = parseFeed(scoresText, oddsText);
  return {
    oddsPath: downsampleOdds(feed),
    goals: extractGoals(feed),
    finalScore: finalScoreOf(feed),
    windowFromMs: feed.windowFromMs,
    windowToMs: feed.windowToMs,
    tickCount: feed.tickCount,
  };
}

/** Provenance with TODO real anchors (§ the task): txlineRefs empty, dev attendee root. */
function specimenProvenance(arc: MatchArc): ProvenanceRefs {
  return {
    txlineRefs: [], // TODO real anchors — TxLINE Merkle refs for this odds/scores window
    attendeeRoot: 'DEV-SPECIMEN', // NOT a real attendee Merkle root
    fromMs: arc.windowFromMs,
    toMs: arc.windowToMs,
    network: 'devnet',
  };
}

/** The communal artifact from a compact arc — REAL market arc + SYNTHETIC crowd (labelled). */
export function buildMatchRelicDataFromArc(arc: MatchArc): MatchRelicData {
  const { crowd, verdict } = buildSpecimenCrowd(arc.oddsPath, arc.goals);
  return {
    fixture: FIXTURE,
    finalScore: arc.finalScore,
    oddsPath: arc.oddsPath,
    goals: arc.goals,
    crowd,
    verdict,
    provenance: specimenProvenance(arc),
  };
}

/** The communal artifact from raw JSONL — REAL market arc + SYNTHETIC crowd (labelled). */
export function buildMatchRelicData(scoresText: string, oddsText: string): {
  match: MatchRelicData;
  arc: MatchArc;
} {
  const arc = buildMatchArc(scoresText, oddsText);
  return { match: buildMatchRelicDataFromArc(arc), arc };
}

const EDITION_SIZE = 5000;
const SPECIMEN_SERIAL = 120;

function edition(fixtureCode: string, dateISO: string, frameName: string, serial: number): EditionInfo {
  return {
    serial,
    editionSize: EDITION_SIZE,
    caption: { fixture: fixtureCode, dateISO, frameName: `${frameName} · SPECIMEN` },
  };
}

/**
 * The one PROVED receipt for the specimen fan: he called "comeback" for Australia at
 * minute 40 (while trailing 0–1), when the market gave Australia ~9%. Australia equalised
 * at 54' (an own goal) → the call PROVED. This drives FOR via deriveRatings. SYNTHETIC.
 */
function specimenReceipt(match: MatchRelicData): Receipt {
  return {
    claim: 'comeback',
    minute: 40,
    side: SPECIMEN_SIDE,
    marketP: { home: 0.09, draw: 0.25, away: 0.66 }, // ~the real market when he called it
    txSig: 'DEVSPECIMENtxSigComeback000000000000000000000000000000000000000000',
    atMs: match.oddsPath[0]?.tMs ?? AUS_EGY_KICKOFF_MS,
    proved: true,
  };
}

/** The personal card from a built match — REAL match summary + SYNTHETIC fan + ratings. */
export function buildCardDataFromMatch(match: MatchRelicData): CardData {
  const { myRoar, faithBuckets } = buildSpecimenFan(match.oddsPath, match.goals);
  const dateISO = match.fixture.kickoffISO.slice(0, 10);
  const receipts: Receipt[] = [specimenReceipt(match)];
  const ratings = deriveRatings(myRoar, faithBuckets, receipts, SPECIMEN_SIDE);
  return {
    matchRelic: {
      fixture: match.fixture,
      finalScore: match.finalScore,
      goals: match.goals,
      verdict: match.verdict,
    },
    side: SPECIMEN_SIDE,
    myRoar,
    faithBuckets,
    receipts,
    rowNames: ['LUKAS'],
    ratings,
    edition: edition('AUS-EGY', dateISO, 'THE STANDS', SPECIMEN_SERIAL),
  };
}

/** The per-call stub from a built match — REAL fixture + the SYNTHETIC proved receipt. */
export function buildStubDataFromMatch(match: MatchRelicData): StubData {
  const receipt = specimenReceipt(match);
  const dateISO = match.fixture.kickoffISO.slice(0, 10);
  return {
    receipt,
    fixture: match.fixture,
    end: 'AUS', // the fan's end
    row: 'LUKAS',
    seat: 7,
    proved: receipt.proved ?? null,
    edition: edition('AUS-EGY', dateISO, 'CALLED IT', SPECIMEN_SERIAL),
  };
}

/** The poster's own edition (frame name THE MATCH — never borrows the card's). */
export function buildPosterEdition(match: MatchRelicData): EditionInfo {
  const dateISO = match.fixture.kickoffISO.slice(0, 10);
  return edition('AUS-EGY', dateISO, 'THE MATCH', SPECIMEN_SERIAL);
}

/** The personal card from raw JSONL. */
export function buildCardData(scoresText: string, oddsText: string): { card: CardData; match: MatchRelicData } {
  const { match } = buildMatchRelicData(scoresText, oddsText);
  return { card: buildCardDataFromMatch(match), match };
}

/** The per-call stub from raw JSONL. */
export function buildStubData(scoresText: string, oddsText: string): { stub: StubData; match: MatchRelicData } {
  const { match } = buildMatchRelicData(scoresText, oddsText);
  return { stub: buildStubDataFromMatch(match), match };
}
