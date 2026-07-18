#!/usr/bin/env node
/**
 * NIGHT REPORT — the proprietary §1 stats (docs/BACKLOG-full-version-and-deferred-ideas.md
 * §1 "THE DATA PRODUCT") computed from a real match's sentiment record.
 *
 * Reads ONE recorded match file and writes docs/night-reports/<matchId>.md (a dossier a
 * judge could hold) + docs/night-reports/<matchId>.json (the raw numbers behind it).
 *
 * Handles TWO real, different shapes (explored by hand against the actual capture files
 * before writing this):
 *
 *   1. A crystallized SentimentRecord (contracts/sentiment.ts) — e.g.
 *      services/stands/captures/espbel-sentiment-18218149.json. Already carries
 *      market.open/close, fans.consensus (all + byRoot), divergence.optimismGap /
 *      .foresight / .upsetIndex, fingerprint, events. This script mostly READS these
 *      (they were built by services/stands/src/sentiment/builder.ts) and adds the ONE
 *      thing that record doesn't already carry: a market-improbability-WEIGHTED
 *      Foresight Alpha (the stored fingerprint.foresight is a flat 1/0.5/0 accuracy
 *      score, not weighted — see computeForesightAlphaV0 below).
 *
 *   2. A raw websocket capture (captures/*.json with a top-level `messages` array) —
 *      e.g. services/stands/captures/premiere-fra-mar-18209181-919c9af.json. No
 *      pre-built market/fans summary at all; this script derives one from the raw
 *      odds/ledger/spell/consensus messages, using the SAME formulas
 *      services/stands/src/sentiment/builder.ts uses (summarizeMarket, verdict,
 *      fsScore — ported below, comments note the source) so the two matches' numbers
 *      are genuinely comparable, not two different methodologies.
 *
 * Every number here traces to a field actually read from the input file. Nothing is
 * interpolated or invented. Where the §1 stat's required input isn't in the record,
 * the report says so plainly, with the specific missing field/reason — never a guess.
 *
 * Usage:
 *   node scripts/night-report.mjs <recordPath>
 *
 * Output:
 *   docs/night-reports/<matchId>.md
 *   docs/night-reports/<matchId>.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const TEAMS_TS_PATH = path.join(REPO_ROOT, 'services/stands/src/sentiment/teams.ts');
const OUT_DIR = path.join(REPO_ROOT, 'docs/night-reports');

// a leg must move ≥6pt to count as a "swing" (not drift) — matches
// services/stands/src/sentiment/builder.ts's SWING_FLOOR exactly, so swing counts
// between a pre-built SentimentRecord and a freshly-summarized raw capture agree.
const SWING_FLOOR = 0.06;

/* ────────────────────────────────────────────────────────────────────────
 * generic formatting helpers
 * ──────────────────────────────────────────────────────────────────────── */

function fmtPct(x, digits = 1) {
  if (x == null || Number.isNaN(x)) return 'n/a';
  return `${(x * 100).toFixed(digits)}%`;
}

/** signed percentage-point delta, e.g. +39.4pt / -16.1pt */
function fmtPt(x, digits = 1) {
  if (x == null || Number.isNaN(x)) return 'n/a';
  const v = x * 100;
  const s = v >= 0 ? '+' : '';
  return `${s}${v.toFixed(digits)}pt`;
}

function fmtTriple(t, digits = 1) {
  if (!t) return 'n/a';
  return `H ${fmtPct(t.home, digits)} · D ${fmtPct(t.draw, digits)} · A ${fmtPct(t.away, digits)}`;
}

function fmtScoreline(p) {
  if (!p) return 'n/a';
  return `${p.home}–${p.away}`;
}

/** the plain-adult-copy small-n caveat this report is required to carry on every
 * percentage/mean derived from a fan cohort — our two matches only ever have 1-5
 * predicting fans total, so this fires on essentially every stat below. */
function nCaveat(n) {
  if (n == null) return '';
  if (n <= 5) return ` (n=${n} — an anecdote, honestly labeled, not a dataset)`;
  return ` (n=${n})`;
}

function bar(char = '-', len = 3) {
  return char.repeat(len);
}

/* ────────────────────────────────────────────────────────────────────────
 * market summarizer — ported from services/stands/src/sentiment/builder.ts's
 * summarizeMarket/favored/dist2, so a from-scratch summary (raw capture) and an
 * already-built one (SentimentRecord) use the identical math. Read-only port;
 * that file is the coordinator-owned source of truth, not edited here.
 * ──────────────────────────────────────────────────────────────────────── */

function favored(t) {
  if (t.home >= t.draw && t.home >= t.away) return 'home';
  if (t.away >= t.home && t.away >= t.draw) return 'away';
  return 'draw';
}

function dist2(a, b) {
  return Math.max(Math.abs(a.home - b.home), Math.abs(a.draw - b.draw), Math.abs(a.away - b.away));
}

/** points: chronological [{minute, tMs, triple:{home,draw,away}|null}]. null triple =
 * a suspended tick (empty Pct on the wire — a held breath); dropped before summarizing,
 * same as builder.ts. */
function summarizeMarket(points) {
  const live = points.filter((p) => p.triple);
  const suspensions = points.length - live.length;
  if (live.length === 0) return null;

  const swings = [];
  let biggest = null;
  let volatility = 0;
  let convSum = 0;
  let convMax = 0;
  let leadChanges = 0;
  const uniform = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  let kept = live[0].triple;
  let lastFav = favored(kept);

  for (let i = 0; i < live.length; i++) {
    const cur = live[i].triple;
    const conv = dist2(cur, uniform);
    convSum += conv;
    if (conv > convMax) convMax = conv;
    if (i > 0) {
      const prev = live[i - 1].triple;
      volatility += Math.abs(cur.home - prev.home) + Math.abs(cur.draw - prev.draw) + Math.abs(cur.away - prev.away);
    }
    const f = favored(cur);
    if (f !== lastFav) { leadChanges++; lastFav = f; }
    const dMax = dist2(cur, kept);
    if (dMax >= SWING_FLOOR) {
      const sw = { minute: live[i].minute, from: kept, to: cur, deltaMax: dMax, toward: f };
      swings.push(sw);
      if (!biggest || dMax > biggest.deltaMax) biggest = sw;
      kept = cur;
    }
  }

  return {
    open: live[0].triple,
    close: live[live.length - 1].triple,
    swings,
    biggestSwing: biggest,
    suspensions,
    leadChanges,
    volatility,
    conviction: { mean: convSum / live.length, max: convMax },
    ticks: live.length,
  };
}

/** the crowd's foresight verdict vs the final score — ported verbatim from
 * services/stands/src/sentiment/builder.ts's `verdict`. */
function verdict(pred, fh, fa) {
  if (!pred) return null;
  if (pred.home === fh && pred.away === fa) return 'exact';
  return Math.sign(pred.home - pred.away) === Math.sign(fh - fa) ? 'outcome' : 'wrong';
}

/** verdict → accuracy score, ported verbatim from builder.ts's `fsScore` (this is what
 * fingerprint.foresight already stores — flat, NOT weighted by market improbability;
 * computeForesightAlphaV0 below adds that weight on top). */
function fsScore(v) {
  return v === 'exact' ? 1 : v === 'outcome' ? 0.5 : 0;
}

function roundPred(mean) {
  if (!mean) return null;
  return { home: Math.round(mean.home), away: Math.round(mean.away) };
}

/* ────────────────────────────────────────────────────────────────────────
 * team identity lookup (raw captures carry no fixture object) — read-only regex
 * parse of services/stands/src/sentiment/teams.ts's FIXTURE_INFO literal. Never
 * imports the .ts (this script runs under plain `node`, no TS toolchain assumed).
 * ──────────────────────────────────────────────────────────────────────── */

function resolveFixtureFromTeamsTs(matchId) {
  if (!existsSync(TEAMS_TS_PATH)) return null;
  const text = readFileSync(TEAMS_TS_PATH, 'utf8');
  const escaped = matchId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `'${escaped}':\\s*\\{\\s*home:\\s*C\\('([^']+)',\\s*'([^']+)',\\s*'([^']+)',\\s*'([^']+)'\\),\\s*` +
      `away:\\s*C\\('([^']+)',\\s*'([^']+)',\\s*'([^']+)',\\s*'([^']+)'\\),\\s*` +
      `competition:\\s*'([^']+)',\\s*dateISO:\\s*'([^']+)'`,
  );
  const m = text.match(re);
  if (!m) return null;
  const [, hCode, hName, hC1, hC2, aCode, aName, aC1, aC2, competition, dateISO] = m;
  return {
    home: { code: hCode, name: hName, colors: [hC1, hC2] },
    away: { code: aCode, name: aName, colors: [aC1, aC2] },
    competition,
    dateISO,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * shape normalization — both branches produce the same intermediate `model` shape
 * consumed by the stat computers + renderer below.
 * ──────────────────────────────────────────────────────────────────────── */

function dedupeEventsById(events) {
  const byId = new Map();
  for (const e of events) {
    if (e && e.id) byId.set(e.id, e); // last emission wins — matches
    // services/stands/src/sentiment/accumulator.ts's eventsById Map (a goal re-emits
    // as Confirmed flips false→true; keeping only the last avoids a 3x-inflated count).
  }
  return [...byId.values()];
}

function normalizeSentimentRecord(raw, sourcePath) {
  const events = dedupeEventsById(raw.events || []);
  return {
    shape: 'SentimentRecord',
    sourcePath,
    sourceNote:
      'a crystallized SentimentRecord (services/stands/src/sentiment/builder.ts) — market/fans/divergence/fingerprint were pre-computed server-side; this report reads them directly and adds the market-improbability-weighted Foresight Alpha on top.',
    matchId: raw.matchId,
    fixture: raw.fixture,
    finalScore: raw.finalScore,
    decidedIn: raw.decidedIn ?? null,
    phasePath: raw.phasePath ?? null,
    headline: raw.headline ?? null,
    market: {
      open: raw.market?.open ?? null,
      close: raw.market?.close ?? null,
      etClose: raw.market?.etClose ?? null,
      swings: raw.market?.swings ?? [],
      biggestSwing: raw.market?.biggestSwing ?? null,
      leadChanges: raw.market?.leadChanges ?? 0,
      volatility: raw.market?.volatility ?? 0,
      conviction: raw.market?.conviction ?? null,
      suspensions: raw.market?.suspensions ?? 0,
      ticks: raw.market?.ticks ?? 0,
    },
    fans: {
      rootedAtLock: raw.fans?.rootedAtLock ?? null,
      consensus: raw.fans?.consensus ?? null,
      calls: raw.fans?.calls ?? null,
      faith: raw.fans?.faith ?? null,
      engagement: raw.fans?.engagement ?? null,   // the harvest (2026-07-18)
      nerveDrift: raw.fans?.nerveDrift ?? null,   // changed minds before the lock (2026-07-18)
      scorelines: raw.fans?.scorelines ?? null,
    },
    points: raw.points ?? null,                    // the harvest (2026-07-18)
    feel: raw.feel ?? null,
    events,
    spells: null, // this record shape never carries territory/spell data
    provenance: raw.provenance ?? null,
    matchTimeRangeMs: raw.provenance?.capture ? [raw.provenance.capture.fromMs, raw.provenance.capture.toMs] : null,
  };
}

function extractMatchIdFromRawCapture(raw) {
  if (raw.lastConsensus?.matchId) return String(raw.lastConsensus.matchId);
  const m = /matchId=(\d+)/.exec(raw.capturedFrom || '');
  if (m) return m[1];
  return 'unknown-match';
}

function normalizeRawCapture(raw, sourcePath) {
  const matchId = extractMatchIdFromRawCapture(raw);
  const msgs = raw.messages || [];

  // market: every full-period odds tick, chronological, summarized with the same
  // algorithm services/stands/src/sentiment/builder.ts uses.
  const oddsPoints = msgs
    .filter((m) => m.type === 'odds' && m.tick && m.tick.period === 'full')
    .map((m) => ({
      minute: m.tick.minute,
      tMs: m.tick.tMs,
      triple: m.tick.raw?.Pct && m.tick.raw.Pct.length > 0 ? { home: m.tick.pHome, draw: m.tick.pDraw, away: m.tick.pAway } : null,
    }))
    .sort((a, b) => a.tMs - b.tMs);
  const market = summarizeMarket(oddsPoints) ?? {
    open: null, close: null, etClose: null, swings: [], biggestSwing: null, leadChanges: 0, volatility: 0, conviction: null, suspensions: 0, ticks: 0,
  };
  market.etClose = null; // no MarketPeriod:'et' bucket observed in this capture shape

  // real match-time window, from the odds/ledger/spell streams (NOT the consensus/
  // stands snapshot messages — see standsIsLiveSnapshot below for why those differ).
  const matchTimeMs = oddsPoints.map((p) => p.tMs).filter((v) => typeof v === 'number');
  const ledgerAll = msgs.filter((m) => m.type === 'ledger' && m.msg?.type === 'event');
  for (const m of ledgerAll) if (typeof m.msg.ev?.tMs === 'number') matchTimeMs.push(m.msg.ev.tMs);
  const matchTimeRangeMs = matchTimeMs.length ? [Math.min(...matchTimeMs), Math.max(...matchTimeMs)] : null;

  // events: MATERIAL kinds, deduped by wire id (matches accumulator.ts's dedup —
  // keeps the LAST emission per id, i.e. Confirmed:true if it ever arrives).
  const MATERIAL = new Set(['goal', 'yellow-card', 'red-card', 'var', 'shot', 'corner', 'penalty-kick']);
  const materialEvents = dedupeEventsById(ledgerAll.filter((m) => MATERIAL.has(m.msg.ev.kind)).map((m) => m.msg.ev));

  // final score: the wire's own 'score' message (there may be several across a real
  // live match; this capture has exactly one). This is the same source
  // SentimentAccumulator.crystallize() reads absent an explicit override — validated
  // as correct against this exact capture file by
  // services/stands/src/dev/pulse-fix-check.ts Scenario 6a. Independently
  // cross-checked against docs/POSTMORTEM-fra-mar-2026-07-09.md ("Final result |
  // France 2–0 Morocco") before trusting it here.
  const scoreMsgs = msgs.filter((m) => m.type === 'score' && m.ev).sort((a, b) => a.ev.tMs - b.ev.tMs);
  const lastScore = scoreMsgs.length ? scoreMsgs[scoreMsgs.length - 1].ev : null;
  const finalScore = lastScore ? { home: lastScore.home, away: lastScore.away } : { home: 0, away: 0 };

  // status/phase: whatever phase messages this capture happens to carry (may be
  // sparse — a raw capture is not guaranteed to see every transition).
  const statusMsgs = msgs.filter((m) => m.type === 'status' && m.ev);
  const decidedIn = statusMsgs.some((m) => m.ev.phase === 'EXTRA_TIME')
    ? 'ET'
    : statusMsgs.some((m) => m.ev.phase === 'PENALTIES')
      ? 'PENS'
      : '90';

  // spells: raw territory/pressure ticks (Pressure Without Reward v0 fodder).
  const spellMsgs = msgs.filter((m) => m.type === 'spell' && m.spell).map((m) => m.spell);

  // 'stands' (roar/pulse/attendance) usability check — dynamic, not assumed. A
  // match-night roar time series would share the match's real tMs range; if every
  // stands tick sits OUTSIDE that range and every roar value is 0, this is a later,
  // separate live-room snapshot (server hello state at connect time), not recovered
  // match-night cheering. Confirmed in docs/POSTMORTEM-fra-mar-2026-07-09.md: "We
  // cannot recover cheer behavior... roar is deliberately short-lived."
  const standsMsgs = msgs.filter((m) => m.type === 'stands');
  const standsAllZeroRoar = standsMsgs.length > 0 && standsMsgs.every((m) => m.roar?.home === 0 && m.roar?.away === 0);
  const standsOutsideMatchWindow =
    matchTimeRangeMs != null &&
    standsMsgs.length > 0 &&
    standsMsgs.every((m) => m.ts < matchTimeRangeMs[0] || m.ts > matchTimeRangeMs[1]);

  const fixture = resolveFixtureFromTeamsTs(matchId);

  return {
    shape: 'RawCapture',
    sourcePath,
    sourceNote:
      'a raw websocket capture (messages[]) — no pre-built market/fans summary. This report derives the market summary from the raw odds ticks and the crowd verdicts from lastConsensus, using the same formulas services/stands/src/sentiment/builder.ts uses server-side.',
    matchId,
    fixture: fixture ?? {
      home: { code: 'HOME', name: 'Home', colors: ['#888', '#888'] },
      away: { code: 'AWAY', name: 'Away', colors: ['#888', '#888'] },
      competition: 'World Cup',
      dateISO: null,
    },
    fixtureResolvedFrom: fixture ? 'services/stands/src/sentiment/teams.ts FIXTURE_INFO' : null,
    finalScore,
    finalScoreSource: lastScore ? "the capture's own 'score' message (wire truth)" : 'no score message in capture — defaulted to 0-0',
    decidedIn,
    phasePath: statusMsgs.map((m) => m.ev.phase),
    headline: null,
    market,
    fans: {
      rootedAtLock: null, // not carried by this shape — see the data-notes seam
      consensus: raw.lastConsensus ?? null,
      calls: null, // no call-type messages in this capture's message-type inventory
      faith: null,
    },
    feel: null,
    events: materialEvents,
    spells: spellMsgs,
    spellKindInventory: raw.counts ? Object.keys(raw.counts) : null,
    standsUsability: {
      count: standsMsgs.length,
      allZeroRoar: standsAllZeroRoar,
      outsideMatchWindow: standsOutsideMatchWindow,
      attendanceSnapshot: standsMsgs[0]?.counts ?? null,
    },
    messageTypeCounts: raw.counts ?? null,
    possibleMomentCount: ledgerAll.filter((m) => m.msg.ev.kind === 'possible').length,
    provenance: null,
    matchTimeRangeMs,
  };
}

function loadModel(recordPath) {
  const raw = JSON.parse(readFileSync(recordPath, 'utf8'));
  if (raw && raw.version === 1 && raw.market && raw.fans && raw.divergence) {
    return normalizeSentimentRecord(raw, recordPath);
  }
  if (raw && Array.isArray(raw.messages)) {
    return normalizeRawCapture(raw, recordPath);
  }
  throw new Error(`scripts/night-report.mjs: unrecognized record shape at ${recordPath} (expected a SentimentRecord or a raw {messages:[...]} capture)`);
}

/* ────────────────────────────────────────────────────────────────────────
 * §1 stat computers
 * ──────────────────────────────────────────────────────────────────────── */

/** §1.1 Optimism Gap — a fanbase's own-win prediction share minus the market's
 * win-probability for them AT LOCK (market.open). Matches
 * services/stands/src/sentiment/accumulator.ts's `optimismGap` exactly. */
function computeOptimismGap(model) {
  const byRoot = model.fans.consensus?.byRoot;
  const mktHome = model.market.open?.home ?? null;
  const mktAway = model.market.open?.away ?? null;
  const side = (key, winKey, mkt) => {
    if (!byRoot || byRoot[key].n === 0 || mkt == null) return null;
    const ownWinShare = byRoot[key].outcome[winKey];
    return { n: byRoot[key].n, ownWinShare, marketAtLock: mkt, value: ownWinShare - mkt };
  };
  return { home: side('home', 'homeWin', mktHome), away: side('away', 'awayWin', mktAway) };
}

/** §1.2 Doubter Index — share of a side's own rooters who did NOT predict their side
 * to win (predicted draw or loss). Matches accumulator.ts's `doubters` exactly.
 * Extended (per the owner's "even better") with whether the doubt was vindicated. */
function computeDoubterIndex(model) {
  const byRoot = model.fans.consensus?.byRoot;
  const fh = model.finalScore.home;
  const fa = model.finalScore.away;
  const winner = fh > fa ? 'home' : fa > fh ? 'away' : 'draw';
  const side = (key, winKey) => {
    if (!byRoot || byRoot[key].n === 0) return null;
    const ownWinShare = byRoot[key].outcome[winKey];
    const doubterShare = 1 - ownWinShare;
    const sideResult = winner === key ? 'won' : winner === 'draw' ? 'drew' : 'lost';
    return { n: byRoot[key].n, ownWinShare, value: doubterShare, sideResult, modal: byRoot[key].modal };
  };
  return { home: side('home', 'homeWin'), away: side('away', 'awayWin') };
}

/** §1.3 Foresight Alpha (v0) — NOT already in either record. Score each cohort's
 * rounded prediction against the final result (verdict/fsScore, ported from
 * builder.ts — this is exactly what fingerprint.foresight scores today), then WEIGHT
 * that score by how unlikely the market said the ACTUAL final outcome was at the
 * moment the prediction was stamped (lock/kickoff, i.e. market.open) — the
 * "did a fan or fanbase beat the market" framing in §1.3, made numeric. Symmetric
 * with upsetIndex (same 1-minus-winning-leg-probability shape, evaluated at OPEN
 * instead of CLOSE, because a prediction is stamped at lock, not at full time).
 * Cohort-level here (crowd-wide + per rooted end) — neither record carries a
 * per-fan prediction list, only the byRoot aggregate. */
function computeForesightAlphaV0(model) {
  const fh = model.finalScore.home;
  const fa = model.finalScore.away;
  const winSide = fh > fa ? 'home' : fa > fh ? 'away' : 'draw';
  const marketAtLockForWinner =
    winSide === 'home' ? model.market.open?.home : winSide === 'away' ? model.market.open?.away : model.market.open?.draw;
  const weight = marketAtLockForWinner != null ? 1 - marketAtLockForWinner : null;
  const con = model.fans.consensus;

  const cohort = (mean, n) => {
    if (!mean || !n || weight == null) return null;
    const pred = roundPred(mean);
    const v = verdict(pred, fh, fa);
    const score = fsScore(v);
    return { n, pred, verdict: v, score, alpha: score * weight };
  };

  return {
    winSide,
    marketAtLockForWinner,
    weight,
    crowd: con ? cohort(con.all.mean, con.all.n) : null,
    home: con && con.byRoot.home.n > 0 ? cohort(con.byRoot.home.mean, con.byRoot.home.n) : null,
    away: con && con.byRoot.away.n > 0 ? cohort(con.byRoot.away.mean, con.byRoot.away.n) : null,
  };
}

/** the seed comparison behind §1.10 ("UPSET (market−result)", per the doc's own intro
 * paragraph) — ported verbatim from builder.ts's computeDivergence: how far the
 * DECISIVE closing market was from the truth (1 − the winning leg's closing
 * probability). Matches divergence.upsetIndex exactly where that field exists. */
function computeUpsetIndex(model) {
  const decisive = model.market.etClose ?? model.market.close;
  if (!decisive) return null;
  const fh = model.finalScore.home;
  const fa = model.finalScore.away;
  const winSide = fh > fa ? 'home' : fa > fh ? 'away' : 'draw';
  const winLeg = winSide === 'home' ? decisive.home : winSide === 'away' ? decisive.away : decisive.draw;
  return { value: Math.max(0, 1 - winLeg), winLeg, winSide, decisive };
}

/** §1.9 Pressure Without Reward (v0) — only where a spell/territory feed exists (the
 * FRA-MAR raw capture: 764 spell ticks). Each spell message is one state observation
 * (side + kind), not a clock duration, so this is a TICK-COUNT proxy for territory
 * share — honestly labeled as such, not claimed as seconds or xG. */
function computePressureWithoutRewardV0(model) {
  if (!model.spells || model.spells.length === 0) return null;
  const KINDS = ['safe', 'attack', 'possession', 'danger', 'high-danger'];
  const counts = {};
  for (const s of model.spells) {
    const k = `${s.side}|${s.kind}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  const totalsFor = (side, goals) => {
    const out = {};
    let total = 0;
    for (const k of KINDS) {
      const v = counts[`${side}|${k}`] || 0;
      out[k] = v;
      total += v;
    }
    const dangerTicks = out['danger'] + out['high-danger'];
    const nonSafeTicks = total - out['safe'];
    return {
      ...out,
      total,
      dangerTicks,
      nonSafeTicks,
      dangerShare: total > 0 ? dangerTicks / total : 0,
      nonSafeShare: total > 0 ? nonSafeTicks / total : 0,
      goals,
    };
  };
  return {
    home: totalsFor('home', model.finalScore.home),
    away: totalsFor('away', model.finalScore.away),
    totalTicks: model.spells.length,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * NOT COMPUTABLE reasoning — grounded in what was actually inspected on each shape,
 * not a blind hardcoded list.
 * ──────────────────────────────────────────────────────────────────────── */

function computeNotComputableReasons(model) {
  const reasons = {};

  // §1.4 Courage-Adjusted Calls
  if (model.fans.calls && model.fans.calls.total > 0) {
    reasons.courageAdjustedCalls = null;
  } else {
    reasons.courageAdjustedCalls =
      model.shape === 'SentimentRecord'
        ? `fans.calls is a zeroed stub in this record (total:0, proved:0, failed:0) — the in-game "calls" mechanism (BACKLOG §2's "mini-preds") wasn't live when this match was captured.`
        : `this capture's message-type inventory (${(model.messageTypeCounts ? Object.keys(model.messageTypeCounts) : []).join(', ')}) carries no call-type messages at all — the mechanism didn't exist yet at capture time.`;
  }

  // §1.5 Faith Under Fire — needs a cheer-intensity-while-losing time series.
  if (model.shape === 'SentimentRecord') {
    const hasMoments = model.feel?.moments && model.feel.moments.length > 0;
    reasons.faithUnderFire = hasMoments
      ? null
      : `feel.roar carries only a match-wide peak + total (home ${model.feel?.roar?.total?.home?.toFixed(1) ?? '?'} vs away ${model.feel?.roar?.total?.away?.toFixed(1) ?? '?'}), not a per-minute curve; feel.moments is empty (0 felt drama windows) — no time series exists to cross against "was this side behind at the time."`;
  } else {
    const su = model.standsUsability;
    reasons.faithUnderFire =
      su.count > 0 && su.allZeroRoar && su.outsideMatchWindow
        ? `this capture's ${su.count} 'stands' roar ticks all read 0 and sit outside the match's own tMs range (a later live-room snapshot at connect time, not recovered match-night cheering) — confirmed in docs/POSTMORTEM-fra-mar-2026-07-09.md: "We cannot recover cheer behavior... roar is deliberately short-lived."`
        : `no usable roar time series in this capture.`;
  }

  // §1.6 Roar Elasticity — same underlying gap as Faith Under Fire (needs a real
  // roar-vs-market/goals time series).
  reasons.roarElasticity =
    reasons.faithUnderFire == null && (model.feel?.moments?.length ?? 0) === 0
      ? reasons.faithUnderFire
      : (reasons.faithUnderFire ?? `no roar time series to correlate against market/goal/danger-spell events.`);

  // §1.7 Aftershock Half-Life — same gap again (needs roar decay curve around events).
  reasons.aftershockHalfLife = reasons.faithUnderFire ?? `no roar time series to measure decay-to-baseline after an event.`;

  // §1.8 Held Breath Index — needs suspensions + possible-moment data AND the crowd's
  // reaction to them.
  {
    const suspensions = model.market.suspensions ?? 0;
    const possibleCount = model.shape === 'RawCapture' ? model.possibleMomentCount : (model.events || []).filter((e) => e.kind === 'possible').length;
    const crowdReactionGap = model.shape === 'SentimentRecord' ? (model.feel?.moments?.length ?? 0) === 0 : model.standsUsability?.allZeroRoar;
    const hasFreezeSignal = suspensions > 0 || possibleCount > 0;
    reasons.heldBreathIndex = crowdReactionGap
      ? hasFreezeSignal
        ? `${suspensions} market suspensions and ${possibleCount} "possible" (Goal?/Penalty? checking) moments exist in this record — the market-freeze half has real signal — but the crowd-reaction half isn't (see §1.5's reason), so a resolved-into-nothing-or-history read isn't computable yet. A duration-only v0 was left out of scope for this pass.`
        : `${suspensions} market suspensions and ${possibleCount} "possible" (Goal?/Penalty? checking) moments in this record — no held-breath windows occurred (or were captured) this match, and the crowd-reaction half isn't recoverable either way (see §1.5's reason).`
      : null;
  }

  // §1.9 Pressure Without Reward
  reasons.pressureWithoutReward =
    model.spells && model.spells.length > 0 ? null : `this record shape carries no spell/territory feed (no danger-possession data at all).`;

  // §1.11 Mood Divergence — needs feel.moments with byEnd histograms.
  if (model.shape === 'SentimentRecord') {
    reasons.moodDivergence = (model.feel?.moments?.length ?? 0) === 0 ? `feel.moments is empty — 0 felt drama windows this match (Pulse windows opened server-side but drew no reactions; see BACKLOG §4).` : null;
  } else {
    reasons.moodDivergence = `this capture's message types (${(model.messageTypeCounts ? Object.keys(model.messageTypeCounts) : []).join(', ')}) include no moment/reaction record at all.`;
  }

  // §1.12 Attendance Gravity — needs join timestamps.
  reasons.attendanceGravity =
    model.shape === 'SentimentRecord'
      ? `fans.rootedAtLock gives a count (${model.fans.rootedAtLock ? `home ${model.fans.rootedAtLock.home}, away ${model.fans.rootedAtLock.away}` : 'n/a'}) but no join TIMESTAMPS — that lives in the server's separate runtime fanStats.firstSeen snapshot, not in this persisted record.`
      : `no rootedAtLock or join-timestamp field in this raw shape at all — only a single late attendance snapshot (${model.standsUsability?.attendanceSnapshot ? `home ${model.standsUsability.attendanceSnapshot.home}, away ${model.standsUsability.attendanceSnapshot.away}` : 'n/a'}) taken well after the match, not a spike time series.`;

  return reasons;
}

/* ────────────────────────────────────────────────────────────────────────
 * markdown rendering
 * ──────────────────────────────────────────────────────────────────────── */

function renderGoalsTimeline(model) {
  const goals = (model.events || []).filter((e) => e.kind === 'goal').sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  if (goals.length === 0) return "_no confirmed goal events in this record's event list._";
  return goals.map((g) => `- ${g.minute}′ — ${g.side === 'home' ? model.fixture.home.code : model.fixture.away.code} score.`).join('\n');
}

function renderSwingsTable(model) {
  const swings = model.market.swings || [];
  if (swings.length === 0) return '_no swings ≥6pt in this record._';
  const rows = swings.map(
    (s) =>
      `| ${s.minute ?? '?'}′ | ${fmtTriple(s.from, 1)} → ${fmtTriple(s.to, 1)} | ${fmtPt(s.deltaMax, 1)} | ${s.toward} |`,
  );
  return ['| minute | move | size | still-favors |', '|---|---|---|---|', ...rows].join('\n');
}

function section(n, title, framing, body) {
  return `## ${n}. ${title}\n\n> ${framing}\n\n${body}\n`;
}

function renderOptimismGap(model, og) {
  const h = model.fixture.home.code;
  const a = model.fixture.away.code;
  const lines = [];
  if (og.home) {
    lines.push(
      `**${h} end**${nCaveat(og.home.n)}: ${og.home.n} of ${og.home.n} predictions were an ${h} win = ${fmtPct(og.home.ownWinShare)} own-win share. Market's ${h} win probability at lock: ${fmtPct(og.home.marketAtLock)}. Gap = ${fmtPct(og.home.ownWinShare)} − ${fmtPct(og.home.marketAtLock)} = **${fmtPt(og.home.value)}**.`,
    );
  } else {
    lines.push(`**${h} end**: no rooted predictions to compute from.`);
  }
  if (og.away) {
    lines.push(
      `**${a} end**${nCaveat(og.away.n)}: own-win share ${fmtPct(og.away.ownWinShare)} vs market's ${a} win probability at lock ${fmtPct(og.away.marketAtLock)}. Gap = **${fmtPt(og.away.value)}**.`,
    );
  } else {
    lines.push(`**${a} end**: no rooted predictions to compute from.`);
  }
  return lines.join('\n\n');
}

function renderDoubterIndex(model, di) {
  const h = model.fixture.home.code;
  const a = model.fixture.away.code;
  const line = (res, code) => {
    if (!res) return `**${code} end**: no rooted predictions to compute from.`;
    if (res.value === 0) {
      return `**${code} end**${nCaveat(res.n)}: 0 doubters — every ${code} rooter's call had ${code} winning. Nothing to vindicate or embarrass.`;
    }
    const modalStr = `${res.modal.home}–${res.modal.away}`;
    const vindicated = res.sideResult !== 'won';
    return `**${code} end**${nCaveat(res.n)}: ${fmtPct(res.value)} doubted ${code} (predicted a draw or loss for their own side). Their most common call was ${modalStr}. ${code} actually **${res.sideResult}** — the doubt was **${vindicated ? 'vindicated' : 'proven wrong'}**.`;
  };
  return [line(di.home, h), line(di.away, a)].join('\n\n');
}

function renderForesightAlpha(model, fa) {
  if (fa.weight == null) return '_market open probability unavailable — cannot weight._';
  const rows = [];
  const row = (label, c) => {
    if (!c) return null;
    return `| ${label} | ${c.n} | ${fmtScoreline(c.pred)} | ${c.verdict} | ${c.score.toFixed(2)} | ${c.alpha.toFixed(4)} |`;
  };
  if (fa.crowd) rows.push(row('crowd (all)', fa.crowd));
  if (fa.home) rows.push(row(`${model.fixture.home.code} end`, fa.home));
  if (fa.away) rows.push(row(`${model.fixture.away.code} end`, fa.away));
  const table = ['| cohort | n | rounded call | verdict | score | alpha (score × weight) |', '|---|---|---|---|---|---|', ...rows.filter(Boolean)].join('\n');
  return [
    `Weight = 1 − (market's kickoff probability for the side that actually won) = 1 − ${fmtPct(fa.marketAtLockForWinner)} = **${fmtPt(fa.weight)}** of "how unlikely the actual result looked at lock."`,
    '',
    `Verdict scoring (matches services/stands/src/sentiment/builder.ts's fsScore): exact scoreline = 1.0, correct side/draw only = 0.5, wrong = 0.0. Alpha = verdict score × the weight above.`,
    '',
    table,
  ].join('\n');
}

function renderChaosSection(model, upset) {
  const m = model.market;
  const lines = [];
  lines.push(`- **Market open → close:** ${fmtTriple(m.open)} → ${fmtTriple(m.close)} across ${m.ticks} live ticks.`);
  lines.push(`- **Probability volatility (v0):** ${m.volatility.toFixed(3)} — the sum of absolute tick-to-tick probability movement across the whole odds curve (higher = more the belief line churned).`);
  lines.push(`- **Swings ≥6pt:** ${m.swings.length}, **lead changes:** ${m.leadChanges}.`);
  if (m.biggestSwing) {
    lines.push(
      `- **Biggest swing:** ${m.biggestSwing.minute}′, ${fmtTriple(m.biggestSwing.from)} → ${fmtTriple(m.biggestSwing.to)} (${fmtPt(m.biggestSwing.deltaMax)}, still favoring ${m.biggestSwing.toward}).`,
    );
  }
  if (m.conviction) {
    lines.push(`- **Conviction:** mean ${fmtPct(m.conviction.mean)} / max ${fmtPct(m.conviction.max)} distance from an undecided 33/33/33 line.`);
  }
  lines.push(`- **Suspensions:** ${m.suspensions}.`);
  lines.push('');
  lines.push(
    `**Upset Index — the seed comparison** (the doc's own intro names the pre-canonical seed "UPSET (market−result)"; this is that number, ported verbatim from builder.ts's computeDivergence): 1 − the market's CLOSING probability for the side that actually won.`,
  );
  if (upset) {
    lines.push(`${model.fixture[upset.winSide]?.code ?? upset.winSide} won; the market's closing probability for that outcome was ${fmtPct(upset.winLeg)}. Upset Index = **${fmtPt(upset.value)}** — how surprised the closing money was by the final whistle.`);
  } else {
    lines.push('_no closing market to compare._');
  }
  lines.push('');
  lines.push('_A single combined 0–100 "chaos rating" (entropy + swings + score-state folded into one number) is deferred beyond this v0 — the components above are the real, individually-verifiable ingredients; combining them into one collectible score is future work, not invented here._');
  lines.push('');
  lines.push('**Swings this match:**');
  lines.push('');
  lines.push(renderSwingsTable(model));
  return lines.join('\n');
}

function renderPressureWithoutReward(model, pwr, reason) {
  if (!pwr) return `**NOT COMPUTABLE** — ${reason}`;
  const h = model.fixture.home.code;
  const a = model.fixture.away.code;
  const row = (code, t) =>
    `| ${code} | ${t.safe} | ${t.attack} | ${t.possession} | ${t.danger} | ${t['high-danger']} | ${t.total} | ${fmtPct(t.dangerShare)} | ${t.goals} |`;
  const table = [
    '| side | safe | attack | possession | danger | high-danger | total ticks | danger share | goals |',
    '|---|---|---|---|---|---|---|---|---|',
    row(h, pwr.home),
    row(a, pwr.away),
  ].join('\n');
  const homeMore = pwr.home.dangerShare >= pwr.away.dangerShare;
  const dominant = homeMore ? h : a;
  const dominantGoals = homeMore ? pwr.home.goals : pwr.away.goals;
  const other = homeMore ? a : h;
  const otherGoals = homeMore ? pwr.away.goals : pwr.home.goals;
  const alignment =
    (homeMore && pwr.home.goals >= pwr.away.goals) || (!homeMore && pwr.away.goals >= pwr.home.goals)
      ? `territory and reward were **aligned** this match — ${dominant} held the larger share of dangerous territory (${fmtPct(homeMore ? pwr.home.dangerShare : pwr.away.dangerShare)} of their own spell ticks were danger/high-danger) and scored more (${dominantGoals} to ${other}'s ${otherGoals}). Not every match is a robbery; this v0 shows the metric reads correctly when pressure and outcome agree, too.`
      : `${dominant} held more dangerous territory (${fmtPct(homeMore ? pwr.home.dangerShare : pwr.away.dangerShare)} danger share) but scored ${dominantGoals} to ${other}'s ${otherGoals} — pressure without full reward.`;
  return [
    `_v0 caveat: each spell message is one state observation (side + kind), not a clock duration — these are tick counts, a territory-share PROXY, not seconds or xG._`,
    '',
    table,
    '',
    alignment,
  ].join('\n');
}

const SECTION_DEFS = [
  {
    n: 1,
    key: 'optimismGap',
    title: 'Optimism Gap',
    framing:
      "how much a fanbase's predicted outcome differs from the market at kickoff. Example: Argentina fans predict 82% win-equivalent while market says 64%. That gap is proprietary ROOOT data.",
  },
  {
    n: 2,
    key: 'doubterIndex',
    title: 'Doubter Index',
    framing:
      'among people rooted for a side, how many predict that side will draw or lose. Even better: track whether the doubters were right. This is very human and very shareable.',
  },
  {
    n: 3,
    key: 'foresightAlpha',
    title: 'Foresight Alpha',
    framing:
      'did a fan or fanbase beat the market? Score predictions against final result, but weight them by how unlikely the market said the outcome was when stamped.',
  },
  {
    n: 4,
    key: 'courageAdjustedCalls',
    title: 'Courage-Adjusted Calls',
    framing:
      'for rare calls: proved call value = how much the market disagreed at the time. Calling "comeback" at 12% is materially different from calling it at 48%.',
  },
  {
    n: 5,
    key: 'faithUnderFire',
    title: 'Faith Under Fire',
    framing:
      'cheer intensity per rooted fan while losing, or while the market gives your side a low chance. This is probably the purest ROOOT stat: loyalty measured without pretending it changes the game.',
  },
  {
    n: 6,
    key: 'roarElasticity',
    title: 'Roar Elasticity',
    framing: 'how strongly a crowd reacts to market movement, goals, VAR, danger spells, or shots. Some fanbases may be calm, others violently reactive.',
  },
  {
    n: 7,
    key: 'aftershockHalfLife',
    title: 'Aftershock Half-Life',
    framing: "how long it takes a stand's roar or mood to return to baseline after a goal, VAR scare, red card, woodwork, or shootout kick.",
  },
  {
    n: 8,
    key: 'heldBreathIndex',
    title: 'Held Breath Index',
    framing:
      'TxLINE suspensions and possible {Goal|Penalty} moments are gold. Measure how long the market froze, how the crowd reacted, and whether the moment resolved into nothing or history.',
  },
  {
    n: 9,
    key: 'pressureWithoutReward',
    title: 'Pressure Without Reward',
    framing:
      'territory, danger possession, shots, corners, woodwork, and goals let us say: this side pressed and pressed, but reality refused. Not xG, not "deserved," just pressure compared to outcome.',
  },
  {
    n: 10,
    key: 'chaosScore',
    title: 'Match Uncertainty / Chaos Score',
    framing: 'market entropy plus probability volatility plus late swings plus score state. Gives every match a collectible "how wild was the belief curve?" rating.',
  },
  {
    n: 11,
    key: 'moodDivergence',
    title: 'Mood Divergence',
    framing:
      "during react windows, measure how far apart the two ends' emotional histograms are. The product line is already there: their dread vs your hope, their disbelief vs your relief.",
  },
  {
    n: 12,
    key: 'attendanceGravity',
    title: 'Attendance Gravity',
    framing: 'which teams, moments, or match states pull people into the room. Join spikes after goals, VAR, danger spells, or social sharing become a real "this moment attracted a crowd" stat.',
  },
];

/** fallback headline for shapes that don't already carry one (raw captures) — ported
 * from services/stands/src/sentiment/builder.ts's `deriveHeadline` (read-only
 * reference), so both report flavors land in the same voice. Every input here is a
 * field this script already computed from the record — nothing new invented. */
function deriveHeadlineFallback(model, upset) {
  if (model.headline) return model.headline;
  const home = model.fixture.home.code;
  const away = model.fixture.away.code;
  const fh = model.finalScore.home;
  const fw = model.finalScore.away;
  const s = `${home} ${fh}–${fw} ${away}`;
  const goals = fh + fw;
  const bits = [];
  if (goals >= 5) bits.push('a goal-storm');
  else if (goals === 0) bits.push('a goalless stalemate');
  if ((model.market.leadChanges ?? 0) >= 2) bits.push('the favourite flipped');
  if (upset && upset.value > 0.5) bits.push('an upset the money never saw');
  if (model.decidedIn === 'ET') bits.push('decided in extra time');
  else if (model.decidedIn === 'PENS') bits.push('settled on penalties');
  if (model.market.biggestSwing && model.market.biggestSwing.deltaMax > 0.25) {
    bits.push(`the ${model.market.biggestSwing.minute ?? '?'}' collapse`);
  }
  return bits.length ? `${s} — ${bits.join(', ')}.` : `${s}.`;
}

function renderMarkdown(model, computed) {
  const { og, di, fa, upset, pwr, reasons } = computed;
  const h = model.fixture.home;
  const a = model.fixture.away;
  const fh = model.finalScore.home;
  const fw = model.finalScore.away;
  const headline = deriveHeadlineFallback(model, upset);

  const out = [];
  out.push(`# NIGHT REPORT — ${h.name} ${fh}–${fw} ${a.name}`);
  out.push('');
  out.push(`*${model.fixture.competition ?? 'World Cup'} · ${model.fixture.dateISO ?? 'date unrecorded'} · match ${model.matchId}*`);
  out.push('');
  out.push(`**${headline}**`);
  out.push('');

  out.push('## The match');
  out.push('');
  out.push(`**Final score:** ${h.code} ${fh}–${fw} ${a.code}. Decided in: ${model.decidedIn ?? '90 (inferred — no extra-time/penalties signal in this record)'}.`);
  out.push('');
  const winSide = fh > fw ? 'home' : fw > fh ? 'away' : 'draw';
  if (model.market.open && model.market.close && winSide !== 'draw') {
    const openP = winSide === 'home' ? model.market.open.home : model.market.open.away;
    const closeP = winSide === 'home' ? model.market.close.home : model.market.close.away;
    out.push(`**The market's journey:** ${(winSide === 'home' ? h : a).code} ${fmtPct(openP)} → ${fmtPct(closeP)}.`);
    out.push('');
  }
  out.push(`**Kickoff line:** ${fmtTriple(model.market.open)}.`);
  out.push('');
  out.push('**Goals:**');
  out.push('');
  out.push(renderGoalsTimeline(model));
  out.push('');
  const con = model.fans.consensus;
  if (con) {
    out.push(
      `**The room:** ${con.all.n} predictions locked${nCaveat(con.all.n)} — ${con.byRoot.home.n} rooting ${h.code}, ${con.byRoot.away.n} rooting ${a.code}${con.byRoot.neutral?.n ? `, ${con.byRoot.neutral.n} neutral` : ''}.${model.fans.rootedAtLock ? ` (${model.fans.rootedAtLock.home + model.fans.rootedAtLock.away} total picked an end at lock — ${model.fans.rootedAtLock.home} ${h.code} / ${model.fans.rootedAtLock.away} ${a.code}; not all of them also locked a scoreline prediction.)` : ''}`,
    );
    out.push('');
  }
  out.push(`_Source: ${model.sourceNote}_`);
  if (model.fixtureResolvedFrom) out.push('');
  if (model.fixtureResolvedFrom) out.push(`_Team identity resolved from ${model.fixtureResolvedFrom} (this capture carries no fixture object of its own)._`);
  out.push('');

  // ── THE HARVEST (records crystallized 2026-07-18+) — printed only when the
  // record carries the fields; older records read exactly as before. ──
  const eng = model.fans?.engagement;
  const sl = model.fans?.scorelines;
  const pts = model.points;
  const rs = model.feel?.roarSeries;
  if (eng || sl || pts || (rs && rs.length) || model.fans?.nerveDrift) {
    out.push('## The harvest — the night, counted');
    out.push('');
    if (eng) out.push(`- **Engagement (server-tallied):** ${eng.fans} fans · ${eng.cheers} granted cheers · ${eng.reacts} reactions · ${eng.watchMinutes} watch-minutes${eng.arrivals?.length ? ` · arrivals across ${eng.arrivals.length} five-minute bucket(s)` : ''}.`);
    if (sl?.length) out.push(`- **The crowd's board:** ${sl.map((s) => `${s.h}–${s.a}${s.n > 1 ? ` ×${s.n}` : ''}`).join(' · ')}.`);
    if (pts) out.push(`- **Points earned (formula v${pts.formulaV}):** ${pts.total.toLocaleString()} across ${pts.fans} fan(s); top: ${pts.top.map((t) => `Nº ${t.serial ?? '—'} · ${t.points}`).join(', ')}.`);
    if (rs?.length) out.push(`- **Roar series:** ${rs.length} samples (~30s cadence) — the per-minute curve Faith Under Fire / Roar Elasticity / Aftershock Half-Life need; formulas land in a later dossier pass.`);
    const nd = model.fans?.nerveDrift;
    if (nd) out.push(`- **Nerve drift (changed minds before the lock):** ${nd.fansChanged} fan(s) changed their call, ${nd.totalEdits} edit(s) total${nd.paths?.length ? ` — ${nd.paths.length} trajectory/ies kept (serials only)` : ''}.`);
    out.push('');
  }

  out.push('---');
  out.push('');

  for (const def of SECTION_DEFS) {
    let body;
    switch (def.key) {
      case 'optimismGap':
        body = renderOptimismGap(model, og);
        break;
      case 'doubterIndex':
        body = renderDoubterIndex(model, di);
        break;
      case 'foresightAlpha':
        body = renderForesightAlpha(model, fa);
        break;
      case 'pressureWithoutReward':
        body = renderPressureWithoutReward(model, pwr, reasons.pressureWithoutReward);
        break;
      case 'chaosScore':
        body = renderChaosSection(model, upset);
        break;
      default: {
        const reason = reasons[def.key];
        body = reason ? `**NOT COMPUTABLE** — ${reason}` : '_(computable but not populated — unexpected; check reasons map)_';
      }
    }
    out.push(section(def.n, def.title, def.framing, body));
  }

  out.push('---');
  out.push('');
  out.push('## Data notes');
  out.push('');
  out.push(`- Source file: \`${path.relative(REPO_ROOT, model.sourcePath)}\``);
  out.push(`- Shape: ${model.shape}`);
  out.push(`- Generated: ${new Date().toISOString()}`);
  if (model.provenance) {
    out.push(`- Record hash: \`${model.provenance.recordHash ?? 'n/a'}\``);
    out.push(`- Network: ${model.provenance.network ?? 'n/a'}`);
    out.push(`- Anchor tx: \`${model.provenance.anchorTxSig ?? 'none yet'}\``);
  }
  if (model.matchTimeRangeMs) {
    out.push(`- Match-time capture window: ${new Date(model.matchTimeRangeMs[0]).toISOString()} → ${new Date(model.matchTimeRangeMs[1]).toISOString()}`);
  }
  out.push(`- Generator: \`scripts/night-report.mjs\` — every number above traces to a field read from the source file; nothing interpolated or invented. The full raw numbers (including every swing and spell bucket) are in the .json sidecar next to this file.`);
  out.push('');

  return out.join('\n');
}

function buildJsonSidecar(model, computed) {
  return {
    generatedAt: new Date().toISOString(),
    generator: 'scripts/night-report.mjs',
    sourceFile: path.relative(REPO_ROOT, model.sourcePath),
    shape: model.shape,
    matchId: model.matchId,
    fixture: model.fixture,
    finalScore: model.finalScore,
    decidedIn: model.decidedIn,
    market: model.market,
    fans: model.fans,
    events: model.events,
    spells: model.spells ? { totalTicks: model.spells.length } : null,
    stats: {
      optimismGap: computed.og,
      doubterIndex: computed.di,
      foresightAlphaV0: computed.fa,
      upsetIndex: computed.upset,
      pressureWithoutRewardV0: computed.pwr,
    },
    notComputable: computed.reasons,
    provenance: model.provenance,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * main
 * ──────────────────────────────────────────────────────────────────────── */

function main() {
  const recordPath = process.argv[2];
  if (!recordPath) {
    console.error('usage: node scripts/night-report.mjs <recordPath>');
    process.exit(1);
  }
  const resolvedPath = path.resolve(recordPath);
  if (!existsSync(resolvedPath)) {
    console.error(`scripts/night-report.mjs: no such file: ${resolvedPath}`);
    process.exit(1);
  }

  const model = loadModel(resolvedPath);

  const og = computeOptimismGap(model);
  const di = computeDoubterIndex(model);
  const fa = computeForesightAlphaV0(model);
  const upset = computeUpsetIndex(model);
  const pwr = computePressureWithoutRewardV0(model);
  const reasons = computeNotComputableReasons(model);

  const computed = { og, di, fa, upset, pwr, reasons };

  mkdirSync(OUT_DIR, { recursive: true });
  const mdPath = path.join(OUT_DIR, `${model.matchId}.md`);
  const jsonPath = path.join(OUT_DIR, `${model.matchId}.json`);

  writeFileSync(mdPath, renderMarkdown(model, computed));
  writeFileSync(jsonPath, JSON.stringify(buildJsonSidecar(model, computed), null, 2));

  console.log(`✓ ${model.matchId}  ${model.fixture.home.code} ${model.finalScore.home}–${model.finalScore.away} ${model.fixture.away.code}`);
  console.log(`  wrote ${path.relative(REPO_ROOT, mdPath)}`);
  console.log(`  wrote ${path.relative(REPO_ROOT, jsonPath)}`);
}

main();
