/**
 * ROOOT crowd seam — the wire protocol between apps/web and services/stands.
 *
 * FROZEN: only the coordinator changes this file. Lanes on either side build
 * against it; if you need a new field, ask the coordinator — do not fork shapes.
 *
 * Honesty rules encoded here:
 *  - Crowd signals are COUNTS of real taps/reacts. They are never converted
 *    into probabilities and never blended with market data (see match.ts).
 *  - Cheers are rate-decayed per user server-side: the roar measures crowd
 *    breadth, not one thumb with a macro.
 */

export type Side = 'home' | 'away';
export type ReactKind = 'belief' | 'nerves' | 'rage';

/**
 * REACT / the Pulse (docs/MECHANISMS.md §4) — the DRAMA KINDS that open a react
 * window. The server detects each from the real wire (a goal/red/VAR off the
 * ledger, full-time off the status, a lurch off the odds); nothing is ever
 * synthesized to manufacture a moment.
 */
export type MomentKind =
  | 'goal'
  | 'possible' // the held breath before a goal/VAR is confirmed
  | 'var'
  | 'red'
  | 'penalty'
  | 'near-miss' // a shot off the woodwork — the "OOOH" without a goal
  | 'swing' // the market lurched with no single event to pin it on
  | 'full-time';

/**
 * The feeling vocabulary per moment kind — STABLE TOKENS, not glyphs. The set
 * is deliberately AMBIGUOUS / multi-context (never literal to the event): the
 * same six feelings are offered to BOTH ends, and the split between how each
 * end felt is the content ("their 💀 vs your 🚀"). Design maps tokens → glyphs
 * in the surface (its vocabulary); the record stores tokens so a re-skin never
 * breaks the data. Honesty: a feeling is NEVER scored for correctness — this is
 * expression, not a guess (the mechanic the owner killed twice; do not re-add).
 */
export const FEELING_PALETTES: Record<MomentKind, readonly string[]> = {
  goal: ['euphoria', 'relief', 'disbelief', 'anguish', 'tension', 'pride'],
  possible: ['hope', 'dread', 'held-breath', 'disbelief', 'nerves', 'faith'],
  var: ['injustice', 'vindication', 'confusion', 'impatience', 'dread', 'hope'],
  red: ['justice', 'outrage', 'shock', 'fear', 'glee', 'disbelief'],
  penalty: ['nerve', 'terror', 'hope', 'dread', 'faith', 'disbelief'],
  'near-miss': ['agony', 'relief', 'so-close', 'phew', 'awe', 'frustration'],
  swing: ['momentum', 'worry', 'belief', 'doubt', 'surge', 'slipping'],
  'full-time': ['elation', 'heartbreak', 'pride', 'emptiness', 'relief', 'disbelief'],
};

/* ── client → stands ──────────────────────────────────────────────── */

/** First message on connect (and on side-pick / room-join changes). */
export interface HelloMsg {
  type: 'hello';
  matchId: string;
  /** anonymous local id (localStorage); wallet linking happens later, at "keep" */
  anonId: string;
  /** display name, only used inside rows */
  name?: string;
  side?: Side;
  roomId?: string;
}

/** One tap. The server decays repeats; clients may batch bursts. */
export interface CheerMsg {
  type: 'cheer';
  matchId: string;
  side: Side;
  /** client tap count in this batch (server clamps + decays) */
  n: number;
  atMs: number;
}

export interface ReactMsg {
  type: 'react';
  matchId: string;
  side: Side;
  kind: ReactKind;
  atMs: number;
}

/**
 * REACT — one feeling at a DRAMA MOMENT (docs/MECHANISMS.md §4, the Pulse).
 * One per fan per moment: a re-react replaces the prior until the window closes
 * (last-write-wins). `token` MUST be one of FEELING_PALETTES for the open
 * moment's kind — the server validates and drops anything else. `side` is the
 * reacting fan's rooted end (the split axis of the reveal). This is distinct
 * from the ambient `ReactMsg` pulse: windowed, one-shot, and it crystallizes
 * into the match's sentiment record (contracts/sentiment.ts MomentFeeling).
 */
export interface MomentReactMsg {
  type: 'momentReact';
  matchId: string;
  momentId: string;
  anonId: string;
  side: Side;
  token: string;
  atMs: number;
}

/**
 * A call — the rare, deliberate act. The stands service relays it on-chain
 * (walletless path) and answers with CallReceiptMsg. marketP is stamped by the
 * CLIENT from the live feed at press time and re-verified server-side against
 * the same feed window before relaying.
 */
export interface CallMsg {
  type: 'call';
  matchId: string;
  anonId: string;
  side: Side;
  /** short structured claim, e.g. "comeback", "next-goal-us", "final-2-1" */
  claim: string;
  minute: number | null;
  marketP: { home: number; draw: number; away: number };
  atMs: number;
}

/**
 * PREDICT — the universal entry claim (docs/MECHANISMS.md §2, the retention
 * spine). One per fan; editable until kickoff, then LOCKED server-side (a claim
 * on the future locks when the future starts). `marketAtPredict` is the client-
 * stamped de-vigged triple at predict time — "were you braver than the market?"
 * Scores are clamped 0..MAX server-side; a re-predict from the same anonId
 * replaces the prior (until lock).
 */
export interface PredictMsg {
  type: 'predict';
  matchId: string;
  anonId: string;
  home: number;
  away: number;
  marketAtPredict?: { home: number; draw: number; away: number };
  atMs: number;
}

/** IN-GAME: a fan's next-goal call — which end scores next, or none (no more
 * goals this match). One live call per fan: a new call REPLACES the fan's open
 * one until resolution. The server stamps the live de-vigged market at receipt
 * (the courage weight — calling a side at 16% is not calling it at 60%).
 * Resolves when the next goal CONFIRMS on the wire (typically ~1-2 minutes
 * after the ball crosses the line; a goal that never confirms — disallowed —
 * never resolves), converted IN-PLAY penalties included; shootout kicks never
 * resolve the book. 'none' resolves correct at FULL_TIME if no further goal
 * confirmed. Honest: never scored against anything but the wire; aggregates
 * always carry n. */
export interface NextGoalCallMsg {
  type: 'nextGoalCall';
  matchId: string;
  anonId: string;
  call: 'home' | 'away' | 'none';
  atMs: number;
}

/**
 * SEAT — request a one-time claim token over the live WebSocket (the same
 * session trust anchor cheer/predict already use). The server grants ONLY for
 * the connection's own adopted identity: matchId must equal the session's
 * seated match and anonId must equal the session's adopted anonId (state
 * set by HelloMsg) — a mismatch is silently dropped, exactly like a cheer for
 * the wrong match. This is what makes POST /seat/claim unforgeable: the HTTP
 * body carries only { token, pubkey, method }, and the server derives the
 * anonId/matchId being claimed FROM THE TOKEN, never from the body — so a
 * stranger's pubkey can never harvest another fan's side/call/verdict/serial
 * with a bare POST (review fix, seat-reconcile).
 */
export interface SeatTokenMsg {
  type: 'seatToken';
  matchId: string;
  anonId: string;
}

export type ClientMsg = HelloMsg | CheerMsg | ReactMsg | MomentReactMsg | CallMsg | PredictMsg | NextGoalCallMsg | SeatTokenMsg;

/* ── stands → clients ─────────────────────────────────────────────── */

/** Broadcast ~4 Hz: the whole stands in one small frame. */
export interface StandsStateMsg {
  type: 'stands';
  matchId: string;
  ts: number;
  /** fans rooted per side (the counter) */
  counts: { home: number; away: number };
  /** decayed cheers/sec per side (the roar) */
  roar: { home: number; away: number };
  /** rolling react counts per side (the pulse) */
  pulse: { home: Record<ReactKind, number>; away: Record<ReactKind, number> };
  /** watching right now, total */
  presence: number;
}

/** Sent to the caller once the relayer lands the memo on-chain. */
export interface CallReceiptMsg {
  type: 'callReceipt';
  matchId: string;
  anonId: string;
  claim: string;
  minute: number | null;
  marketP: { home: number; draw: number; away: number };
  /** devnet tx signature — the receipt's anchor */
  txSig: string;
  atMs: number;
}

/** Row presence + marks for members of a room. */
export interface RoomStateMsg {
  type: 'room';
  roomId: string;
  members: Array<{ anonId: string; name: string; side: Side; present: boolean }>;
}

/**
 * One cohort's predictions (all fans, or fans rooted to one end). The crowd's
 * belief — the THIRD signal beside market and result (docs/MECHANISMS.md §2).
 * Means are decimal goals; `outcome` fractions sum to ~1; `modal` is the single
 * most-predicted exact scoreline. Never blended with market data.
 */
export interface PredictGroup {
  n: number;
  mean: { home: number; away: number };
  /** fraction predicting each result — home win / draw / away win */
  outcome: { homeWin: number; draw: number; awayWin: number };
  /** the single most common exact scoreline in this cohort */
  modal: { home: number; away: number; pct: number };
}

/**
 * The crowd's predicted scoreline, whole + sliced. `all` = everyone; `byRoot`
 * = the honest cuts ("ARG fans say…", "the doubters among them" =
 * byRoot.home.outcome.{draw+awayWin}). `locked` flips true at kickoff.
 */
export interface ConsensusMsg {
  type: 'consensus';
  matchId: string;
  ts: number;
  locked: boolean;
  all: PredictGroup;
  byRoot: { home: PredictGroup; away: PredictGroup; neutral: PredictGroup };
}

/** A fan's prediction resolved at full time (docs/MECHANISMS.md §2 → FORESIGHT). */
export interface PredictVerdictMsg {
  type: 'predictVerdict';
  matchId: string;
  anonId: string;
  predicted: { home: number; away: number };
  final: { home: number; away: number };
  /** exact score · right outcome (W/D/L) but wrong score · wrong outcome */
  verdict: 'exact' | 'outcome' | 'wrong';
}

/** Broadcast on every accepted call + on resolution: the crowd's LIVE next-goal
 * belief. counts are real fans with an open call; market is the latest triple. */
export interface NextGoalStateMsg {
  type: 'nextGoalState';
  matchId: string;
  ts: number;
  open: { n: number; home: number; away: number; none: number };
  marketAtTs: { home: number; draw: number; away: number } | null;
}

/** Per-fan resolution, personal delivery + replay like predictVerdict. */
export interface NextGoalVerdictMsg {
  type: 'nextGoalVerdict';
  matchId: string;
  anonId: string;
  call: 'home' | 'away' | 'none';
  outcome: 'correct' | 'wrong';
  /** what actually happened: the scoring side, or 'none' (FT with no further goal) */
  happened: 'home' | 'away' | 'none';
  /** the de-vigged market stamped when the call was made */
  marketAtCall: { home: number; draw: number; away: number } | null;
  atMs: number;
}

/**
 * REACT — a drama window OPENING (docs/MECHANISMS.md §4). Fans have until
 * `closesAtMs` to pick ONE feeling. `side` is the end the moment favours (the
 * scorer on a goal), or null where there's no clear beneficiary (a red card,
 * VAR, full-time). `palette` is the token set for this kind (FEELING_PALETTES) —
 * design renders the glyphs. `minute` is the match minute where known.
 */
export interface MomentOpenMsg {
  type: 'moment';
  matchId: string;
  momentId: string;
  kind: MomentKind;
  side: Side | null;
  minute: number | null;
  opensAtMs: number;
  closesAtMs: number;
  palette: readonly string[];
}

/** One end's aggregated feeling at a moment: the top token, its share (0..1),
 * the full histogram, and how many fans reacted. Empty ('' / 0 / {} / 0) when
 * that end was silent — never synthesized. */
export interface MomentEndHist {
  top: string;
  pct: number;
  hist: Record<string, number>;
  n: number;
}

/**
 * REACT — the REVEAL at window close (docs/MECHANISMS.md §4): each end's feeling,
 * split ("their 💀 vs your 🚀"). The server aggregates real reactions only; an
 * end with no reactors reveals honestly empty. Maps directly to the record's
 * MomentFeeling (contracts/sentiment.ts) — the mood-quilt's data.
 */
export interface MomentResultMsg {
  type: 'momentResult';
  matchId: string;
  momentId: string;
  kind: MomentKind;
  minute: number | null;
  byEnd: { home: MomentEndHist; away: MomentEndHist };
  closedAtMs: number;
}

/** One accepted cheer, fanned out discretely so a single fan's tap is visible
 * within one tick (post-mortem: low-volume roar smoothed to invisible). Honest:
 * emitted 1:1 with server-ACCEPTED cheer messages (post-throttle), carries no
 * count, and is capped — the roar rate remains the volume signal. */
export interface CheerEchoMsg {
  type: 'cheerEcho';
  matchId: string;
  side: Side;
  atMs: number;
}

/** Sent on every side-carrying hello: the fan's global first-come serial
 * ("Nº 001 = the first fan through the door"). Minted once at the first
 * side-carrying hello ever seen for this anonId; the same number is resent
 * on every reconnect, forever. Side-less hellos (diagnostics, canary smoke)
 * never mint and never receive it. */
export interface WelcomeMsg {
  type: 'welcome';
  matchId: string;
  anonId: string;
  fanNo: number;
}

/**
 * SEAT — the answer to SeatTokenMsg, sent ONLY to the requesting socket (never
 * broadcast — the token is a credential). Single-use: redeemed (or expired past
 * `expiresAtMs`, ~2 min) it is dead; a re-claim requests a fresh one. matchId/
 * anonId echo the SESSION's adopted identity (the values the token is bound
 * to server-side), not whatever the request claimed.
 */
export interface SeatTokenGrantMsg {
  type: 'seatTokenGrant';
  matchId: string;
  anonId: string;
  token: string;
  expiresAtMs: number;
}

export type ServerMsg =
  | StandsStateMsg
  | CallReceiptMsg
  | RoomStateMsg
  | ConsensusMsg
  | PredictVerdictMsg
  | MomentOpenMsg
  | MomentResultMsg
  | CheerEchoMsg
  | WelcomeMsg
  | NextGoalStateMsg
  | NextGoalVerdictMsg
  | SeatTokenGrantMsg;
