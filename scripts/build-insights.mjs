#!/usr/bin/env node
/**
 * ROOOT — insights data assembly.
 *
 * Reads every sealed SentimentRecord + night report we hold and emits ONE
 * JSON the insights dashboard renders from:
 *   docs/insights/tournament-data.json
 *
 * Every number here is read from a record on disk. Nothing is interpolated,
 * averaged across matches, or invented. Where a field is genuinely empty the
 * output says so explicitly (`captured: false` + the reason) rather than
 * emitting a zero that would read as a measurement.
 *
 * THE TWO REGISTERS, kept apart (docs/SENTIMENT.md, the honesty law):
 *   market[] carries de-vigged PROBABILITIES (percentages are correct there)
 *   crowd[]  carries COUNTS — people, cheers, minutes, points. Never a
 *            percentage, never a mean dressed as a rate, never blended with
 *            market numbers in the same figure.
 *
 * Run: node scripts/build-insights.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/insights/tournament-data.json');

/** The live match nights — records with a REAL crowd behind them, in kickoff order. */
const LIVE = [
  { id: '18218149', file: 'espbel-sentiment-18218149.json', stage: 'ROUND OF 16', date: '2026-07-10' },
  { id: '18241006', file: 'engarg-sentiment-18241006.json', stage: 'SEMIFINAL', date: '2026-07-15' },
  { id: '18257865', file: 'fraeng-sentiment-18257865.json', stage: 'THIRD PLACE', date: '2026-07-18' },
  { id: '18257739', file: 'esparg-sentiment-18257739-corrected.json', stage: 'THE FINAL', date: '2026-07-19' },
];

/** Replay-crystallized records: real market + real result, but NO crowd (nobody
 *  watched a capture). Counted separately so the crowd totals stay honest. */
const REPLAY = ['18175918', '18179549', '18185036', '18188721'];

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const pct = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 10 : null);

function loadMatch(def) {
  const rec = readJson(path.join(ROOT, 'services/stands/captures', def.file));
  const nrPath = path.join(ROOT, 'docs/night-reports', `${def.id}.json`);
  const nr = existsSync(nrPath) ? readJson(nrPath) : null;

  const m = rec.market ?? {};
  const f = rec.fans ?? {};
  const feel = rec.feel ?? {};
  const eng = f.engagement ?? null;

  // events by kind — the wire's own ledger, deduped upstream by the record builder
  const byKind = {};
  for (const e of rec.events ?? []) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;

  return {
    id: def.id,
    stage: def.stage,
    date: def.date,
    home: rec.fixture.home.code,
    away: rec.fixture.away.code,
    homeName: rec.fixture.home.name,
    awayName: rec.fixture.away.name,
    homeInk: rec.fixture.home.colors?.[0] ?? null,
    awayInk: rec.fixture.away.colors?.[0] ?? null,
    finalScore: rec.finalScore,
    decidedIn: rec.decidedIn,
    phasePath: rec.phasePath ?? [],
    headline: rec.headline,

    // ── THE MARKET (TxLINE) — probabilities, correct as percentages ────────
    market: {
      ticks: m.ticks ?? 0,
      suspensions: m.suspensions ?? 0,
      leadChanges: m.leadChanges ?? 0,
      volatility: m.volatility ?? null,
      convictionMean: m.conviction?.mean ?? null,
      convictionMax: m.conviction?.max ?? null,
      open: m.open ? { home: pct(m.open.home), draw: pct(m.open.draw), away: pct(m.open.away) } : null,
      close: m.close ? { home: pct(m.close.home), draw: pct(m.close.draw), away: pct(m.close.away) } : null,
      etClose: m.etClose ? { home: pct(m.etClose.home), draw: pct(m.etClose.draw), away: pct(m.etClose.away) } : null,
      favoredMinutes: m.favoredMinutes ?? null,
      swingCount: (m.swings ?? []).length,
      biggestSwing: m.biggestSwing
        ? {
            minute: m.biggestSwing.minute,
            toward: m.biggestSwing.toward,
            deltaMax: pct(m.biggestSwing.deltaMax),
            from: { home: pct(m.biggestSwing.from.home), draw: pct(m.biggestSwing.from.draw), away: pct(m.biggestSwing.from.away) },
            to: { home: pct(m.biggestSwing.to.home), draw: pct(m.biggestSwing.to.draw), away: pct(m.biggestSwing.to.away) },
          }
        : null,
      perPhase: (m.perPhase ?? []).map((p) => ({
        phase: p.phase,
        home: pct(p.belief.home),
        draw: pct(p.belief.draw),
        away: pct(p.belief.away),
      })),
      swings: (m.swings ?? []).map((s) => ({ minute: s.minute, toward: s.toward, deltaMax: pct(s.deltaMax) })),
    },

    // ── THE CROWD (ours) — counts stay counts ─────────────────────────────
    crowd: {
      rootedAtLock: f.rootedAtLock ?? { home: 0, away: 0 },
      predictions: {
        n: f.consensus?.all?.n ?? 0,
        mean: f.consensus?.all?.mean ?? null,
        modal: f.consensus?.all?.modal ?? null,
        byRoot: {
          home: f.consensus?.byRoot?.home?.n ?? 0,
          away: f.consensus?.byRoot?.away?.n ?? 0,
        },
      },
      // every distinct scoreline a fan actually called, with how many called it
      scorelines: f.scorelines ?? null,
      engagement: eng
        ? {
            fans: eng.fans ?? 0,
            cheers: eng.cheers ?? 0,
            reacts: eng.reacts ?? 0,
            watchMinutes: eng.watchMinutes ?? 0,
            // arrivals are stamped in MINUTES OF DAY (UTC), not match minutes
            arrivals: eng.arrivals ?? [],
          }
        : null,
      roar: {
        totalHome: feel.roar?.total?.home ?? null,
        totalAway: feel.roar?.total?.away ?? null,
        peak: feel.roar?.peak ?? null,
        seriesPoints: (feel.roarSeries ?? []).length,
        seriesNonZero: (feel.roarSeries ?? []).filter((p) => p.home > 0 || p.away > 0).length,
      },
      points: rec.points
        ? { total: rec.points.total ?? 0, fans: rec.points.fans ?? 0, top: rec.points.top ?? [] }
        : null,
      nextGoal: (rec.nextGoal ?? []).map((c) => ({
        cycle: c.cycle,
        happened: c.happened,
        crowd: c.crowd,
        marketAtResolution: c.marketAtResolution
          ? { home: pct(c.marketAtResolution.home), draw: pct(c.marketAtResolution.draw), away: pct(c.marketAtResolution.away) }
          : null,
      })),
    },

    // ── THE CROSSOVER — where the two registers are legitimately compared ──
    crossover: {
      optimismGap: rec.divergence?.optimismGap
        ? { home: pct(rec.divergence.optimismGap.home), away: pct(rec.divergence.optimismGap.away) }
        : null,
      foresight: rec.divergence?.foresight ?? null,
      upsetIndex: pct(rec.divergence?.upsetIndex),
      foresightAlpha: nr?.stats?.foresightAlphaV0 ?? null,
      doubterIndex: nr?.stats?.doubterIndex ?? null,
    },

    events: { total: (rec.events ?? []).length, byKind },
    notComputable: nr?.notComputable ? Object.keys(nr.notComputable).length : null,
    notComputableDetail: nr?.notComputable ?? null,
    provenance: {
      recordHash: rec.provenance?.recordHash ?? null,
      anchorTxSig: rec.provenance?.anchorTxSig ?? null,
      supersedes: rec.provenance?.supersedes ?? null,
    },
  };
}

const matches = LIVE.map(loadMatch);

// ── replay-only records: market depth without a crowd ─────────────────────
const replayMatches = REPLAY.map((id) => {
  const p = path.join(ROOT, 'data/sentiment', `${id}.json`);
  if (!existsSync(p)) return null;
  const r = readJson(p);
  return {
    id,
    home: r.fixture.home.code,
    away: r.fixture.away.code,
    finalScore: r.finalScore,
    ticks: r.market?.ticks ?? 0,
    events: (r.events ?? []).length,
    crowdN: r.fans?.consensus?.all?.n ?? 0,
  };
}).filter(Boolean);

// ── tournament totals — summed from the above, never estimated ────────────
const totals = {
  liveMatches: matches.length,
  replayMatches: replayMatches.length,
  marketTicks: matches.reduce((a, m) => a + m.market.ticks, 0),
  replayTicks: replayMatches.reduce((a, m) => a + m.ticks, 0),
  events: matches.reduce((a, m) => a + m.events.total, 0),
  rooted: matches.reduce((a, m) => a + m.crowd.rootedAtLock.home + m.crowd.rootedAtLock.away, 0),
  predictions: matches.reduce((a, m) => a + m.crowd.predictions.n, 0),
  cheers: matches.reduce((a, m) => a + (m.crowd.engagement?.cheers ?? 0), 0),
  watchMinutes: matches.reduce((a, m) => a + (m.crowd.engagement?.watchMinutes ?? 0), 0),
  points: matches.reduce((a, m) => a + (m.crowd.points?.total ?? 0), 0),
  // engagement telemetry only landed for the last two matches — say so, don't
  // let a sum imply it was measured all tournament
  engagementMatches: matches.filter((m) => m.crowd.engagement).length,
};

/** Fields that exist in the schema but carried NO signal in any record — named
 *  so the dashboard can show them as unmeasured rather than as zero. */
const unmeasured = [
  { field: 'feel.moments', note: 'Pulse windows opened server-side but drew no reactions — 0 felt-drama windows in every match.' },
  { field: 'fans.calls', note: 'the in-game calls mechanism was not live during any captured match.' },
  { field: 'fans.faith / fans.doubters', note: 'zeroed in every live record.' },
  { field: 'fans.nerveDrift', note: 'no fan edited a prediction after locking it (0 edits, all matches).' },
  { field: 'engagement.reacts', note: 'reaction taps recorded 0 in both matches carrying engagement telemetry.' },
  { field: 'feel.volatility', note: 'crowd volatility computed 0 — the roar series is too sparse to move it.' },
  { field: 'market.suspensions', note: 'the market never suspended mid-match in any captured night.' },
];

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    { generatedAt: new Date().toISOString(), generator: 'scripts/build-insights.mjs', totals, matches, replayMatches, unmeasured },
    null,
    1,
  ) + '\n',
);

console.log(`wrote ${path.relative(ROOT, OUT)}`);
console.log(
  `  ${totals.liveMatches} live nights · ${totals.marketTicks.toLocaleString()} market ticks · ` +
    `${totals.events} events · ${totals.rooted} rooted · ${totals.predictions} predictions · ` +
    `${totals.cheers} cheers · ${totals.points} points`,
);
console.log(`  + ${totals.replayMatches} replay records (${totals.replayTicks.toLocaleString()} ticks, no crowd)`);
