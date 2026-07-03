/**
 * ROOOT replay-inspect — summarize a recorded fixtures/*.jsonl transcript.
 *
 * Two jobs:
 *   1. Whole-file summary: fixtures seen (with row counts), market
 *      (SuperOddsType) types seen, and transport event counts
 *      (message/heartbeat/__meta/__disconnect).
 *   2. `--fixture <id>` deep-dive: the full-match 1X2 series (t, pHome,
 *      pDraw, pAway) via contracts/normalize.ts's parseOddsMessage, plus
 *      the score/status timeline via parseScoreMessage/parseStatusMessage
 *      (if the fixture also appears in a scores-*.jsonl passed via
 *      --scores).
 *
 * Usage:
 *   npx tsx scripts/replay-inspect.ts fixtures/odds-20260703.jsonl
 *   npx tsx scripts/replay-inspect.ts fixtures/odds-20260703.jsonl --fixture 18175918
 *   npx tsx scripts/replay-inspect.ts fixtures/odds-20260703.jsonl --fixture 18175918 \
 *     --scores fixtures/scores-20260703.jsonl
 *   npm run inspect -- fixtures/odds-20260703.jsonl --fixture 18175918 --scores fixtures/scores-20260703.jsonl
 */
import { readFileSync } from 'node:fs';
import { parseOddsMessage, parseScoreMessage, parseStatusMessage } from '@contracts/normalize';

interface FixtureLine {
  receivedAtMs: number;
  event: string;
  data: string;
}

interface Args {
  file: string;
  fixtureId: number | null;
  scoresFile: string | null;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  let file = '';
  let fixtureId: number | null = null;
  let scoresFile: string | null = null;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v === '--fixture') fixtureId = Number(a[++i]);
    else if (v === '--scores') scoresFile = a[++i] ?? null;
    else if (v && !v.startsWith('--')) file = v;
  }
  if (!file) {
    console.error('usage: replay-inspect <fixtures/x.jsonl> [--fixture <id>] [--scores <fixtures/y.jsonl>]');
    process.exit(1);
  }
  return { file, fixtureId, scoresFile };
}

function readLines(path: string): FixtureLine[] {
  const raw = readFileSync(path, 'utf8');
  const out: FixtureLine[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as FixtureLine);
    } catch {
      console.warn(`[inspect] skipping unparseable line: ${trimmed.slice(0, 80)}...`);
    }
  }
  return out;
}

function fmtTs(ms: number): string {
  return new Date(ms).toISOString();
}

/** Loosely parse the raw `data` string just enough to pull SuperOddsType/FixtureId for the summary pass — separate from contracts/normalize.ts's strict per-market parser, since the summary wants EVERY market type, not just 1X2. */
function peekOddsFields(data: string): { fixtureId: number | null; superOddsType: string | null } {
  try {
    const d = JSON.parse(data) as { FixtureId?: number; SuperOddsType?: string };
    return { fixtureId: d.FixtureId ?? null, superOddsType: d.SuperOddsType ?? null };
  } catch {
    return { fixtureId: null, superOddsType: null };
  }
}

function summarize(path: string): void {
  const lines = readLines(path);
  const eventCounts = new Map<string, number>();
  const fixtureCounts = new Map<number, number>();
  const marketCounts = new Map<string, number>();
  let first: number | null = null;
  let last: number | null = null;

  for (const l of lines) {
    eventCounts.set(l.event, (eventCounts.get(l.event) ?? 0) + 1);
    first = first === null ? l.receivedAtMs : Math.min(first, l.receivedAtMs);
    last = last === null ? l.receivedAtMs : Math.max(last, l.receivedAtMs);
    if (l.event !== 'message') continue;
    const { fixtureId, superOddsType } = peekOddsFields(l.data);
    if (fixtureId !== null) fixtureCounts.set(fixtureId, (fixtureCounts.get(fixtureId) ?? 0) + 1);
    if (superOddsType !== null) marketCounts.set(superOddsType, (marketCounts.get(superOddsType) ?? 0) + 1);
  }

  console.log(`\n=== ${path} ===`);
  console.log(`lines: ${lines.length}`);
  if (first !== null && last !== null) {
    console.log(`window: ${fmtTs(first)} → ${fmtTs(last)} (${((last - first) / 60000).toFixed(1)} min)`);
  }

  console.log('\nevent types:');
  for (const [ev, n] of [...eventCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(6)}  ${ev}`);
  }

  if (marketCounts.size > 0) {
    console.log('\nmarket types (SuperOddsType) seen:');
    for (const [t, n] of [...marketCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(6)}  ${t}`);
    }
  }

  if (fixtureCounts.size > 0) {
    console.log('\nfixtures seen (odds rows):');
    for (const [fid, n] of [...fixtureCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(6)}  ${fid}`);
    }
  }
}

function inspectFixture(oddsPath: string, fixtureId: number, scoresPath: string | null): void {
  const lines = readLines(oddsPath);
  console.log(`\n=== fixture ${fixtureId} — 1X2 series (full-match only, via contracts/normalize.ts) ===`);
  let n = 0;
  let prevTick: { pHome: number; pDraw: number; pAway: number } | null = null;
  let biggestSwing: { deltaHome: number; tMs: number } | null = null;
  for (const l of lines) {
    if (l.event !== 'message') continue;
    const peek = peekOddsFields(l.data);
    if (peek.fixtureId !== fixtureId) continue;
    const tick = parseOddsMessage(l.data, l.receivedAtMs, 'replay');
    if (!tick) continue; // e.g. filtered: not full-match 1X2, wrong market, etc.
    n++;
    const sum = tick.pHome + tick.pDraw + tick.pAway;
    const flag = Math.abs(sum - 1) > 0.02 ? '  ⚠ sum off' : '';
    console.log(
      `  ${fmtTs(tick.tMs)}  pHome=${tick.pHome.toFixed(4)} pDraw=${tick.pDraw.toFixed(4)} pAway=${tick.pAway.toFixed(4)}  sum=${sum.toFixed(4)}${flag}`,
    );
    if (prevTick) {
      const deltaHome = Math.abs(tick.pHome - prevTick.pHome);
      if (!biggestSwing || deltaHome > biggestSwing.deltaHome) {
        biggestSwing = { deltaHome, tMs: tick.tMs };
      }
    }
    prevTick = tick;
  }
  console.log(`  (${n} full-match 1X2 ticks)`);
  if (biggestSwing) {
    console.log(
      `  biggest single-tick pHome swing: ${(biggestSwing.deltaHome * 100).toFixed(2)}pp at ${fmtTs(biggestSwing.tMs)}`,
    );
  }

  if (scoresPath) {
    const scoreLines = readLines(scoresPath);
    console.log(`\n=== fixture ${fixtureId} — score/status timeline (${scoresPath}) ===`);
    let scoreN = 0;
    let statusN = 0;
    for (const l of scoreLines) {
      if (l.event !== 'message') continue;
      const scoreEv = parseScoreMessage(l.data, l.receivedAtMs, 'replay');
      if (scoreEv) {
        scoreN++;
        console.log(
          `  ${fmtTs(scoreEv.tMs)}  SCORE ${scoreEv.home}-${scoreEv.away}${scoreEv.side ? ` (${scoreEv.side}${scoreEv.scorer ? ` — ${scoreEv.scorer}` : ''})` : ''}${scoreEv.minute !== null ? ` @ ${scoreEv.minute}'` : ''}`,
        );
        continue;
      }
      const statusEv = parseStatusMessage(l.data, l.receivedAtMs, 'replay');
      if (statusEv) {
        statusN++;
        console.log(`  ${fmtTs(statusEv.tMs)}  STATUS ${statusEv.phase}${statusEv.minute !== null ? ` @ ${statusEv.minute}'` : ''}`);
      }
    }
    console.log(`  (${scoreN} score events, ${statusN} status events, ${scoreLines.length} total lines in file)`);
    if (scoreN === 0 && statusN === 0) {
      console.log('  (no score/status payloads found — file is transport events only, e.g. all-heartbeat pre-kickoff capture)');
    }
  }
}

function main(): void {
  const { file, fixtureId, scoresFile } = parseArgs();
  summarize(file);
  if (fixtureId !== null) inspectFixture(file, fixtureId, scoresFile);
}

main();
