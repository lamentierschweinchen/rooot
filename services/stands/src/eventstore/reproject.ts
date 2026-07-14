/**
 * ROOOT event store — reproject.ts: CLI that re-projects a recorded capture
 * into a SentimentRecord, entirely offline.
 *
 * Deliberately thin: eventstore/load.ts + eventstore/project.ts do the real
 * work; this just wires argv → those functions → stdout/--out. NO
 * anchoring, NO minting, NO broadcasting — this module never imports
 * services/stands/src/relay.ts (directly or transitively). It only touches
 * contracts/normalize.ts (via load.ts), services/stands/src/sentiment/
 * {accumulator,builder,teams}.ts (via project.ts / fixtureInfo below), and
 * this directory's own load/project — none of which import relay.ts.
 *
 * Usage:
 *   npx tsx src/eventstore/reproject.ts --file <capture.jsonl> --fixture <id> [--out <path>]
 *   npm run reproject -- --file <capture.jsonl> --fixture <id>
 */
import { writeFileSync } from 'node:fs';
import { MatchState } from '../match-state';
import { fixtureInfo } from '../sentiment/teams';
import { loadMatchEvents } from './load';
import { projectSentiment } from './project';

interface Args {
  file: string;
  fixtureId: string;
  out: string | null;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const file = get('--file');
  const fixtureId = get('--fixture');
  if (!file || !fixtureId) {
    console.error('usage: reproject --file <capture.jsonl> --fixture <id> [--out <path>]');
    process.exit(1);
  }
  return { file, fixtureId, out: get('--out') ?? null };
}

function main(): void {
  const { file, fixtureId, out } = parseArgs();

  const fixture = fixtureInfo(fixtureId);
  if (!fixture) {
    console.error(`[reproject] unknown fixture ${fixtureId} — not in services/stands/src/sentiment/teams.ts's FIXTURE_INFO`);
    process.exit(1);
  }

  const events = loadMatchEvents(file, fixtureId);
  console.error(`[reproject] ${file} → fixture ${fixtureId}: ${events.length} events loaded`);
  if (events.length === 0) {
    console.error(`[reproject] zero events for fixture ${fixtureId} — wrong id, or a capture with no lines for it`);
    process.exit(1);
  }

  const acc = projectSentiment(events, fixtureId, fixture);
  // No fans watched this offline re-projection — but "no fans" is a REAL,
  // fan-less MatchState (services/stands/src/match-state.ts), reused exactly
  // rather than hand-rolled: consensus()/counts() on an empty MatchState are
  // what the live pipeline actually passes into crystallize() for a match
  // nobody predicted on, and their zero shape (n:0 throughout, but a
  // populated ConsensusMsg — NOT `null`) is not something this module should
  // reimplement or guess at. lockPredictions() mirrors predictLifecycle's
  // FIRST_HALF branch, which always locks before FULL_TIME ever crystallizes
  // live. No finalScoreOverride: this is exactly the "dev-check/dry-run
  // caller" case SentimentAccumulator.crystallize's own doc names — it stays
  // on the accumulator's live-tracked `this.final`, fed by the same score events.
  const crowd = new MatchState(fixtureId);
  crowd.lockPredictions();
  const record = acc.crystallize(
    { consensus: crowd.consensus(), rooted: crowd.counts() },
    { serial: 1, editionSize: null, caption: fixtureId },
  );

  const json = JSON.stringify(record, null, 2);
  if (out) {
    writeFileSync(out, json, 'utf8');
    console.error(`[reproject] wrote ${out}`);
  } else {
    console.log(json);
  }
}

main();
