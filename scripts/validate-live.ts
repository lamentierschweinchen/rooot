/**
 * Validate contracts/normalize.ts against a captured scores/odds JSONL.
 * Usage: npx tsx scripts/validate-live.ts fixtures/scores-night-20260703.jsonl [--odds fixtures/odds-....jsonl]
 * Prints: parse tallies + the honest event timeline (status/goals) it extracted.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseOddsMessage, parseScoreMessage, parseStatusMessage } from '../contracts/normalize';

async function main() {
  const scoresPath = process.argv[2];
  const oddsIdx = process.argv.indexOf('--odds');
  const oddsPath = oddsIdx > 0 ? process.argv[oddsIdx + 1] : null;
  if (!scoresPath) {
    console.error('usage: validate-live.ts <scores.jsonl> [--odds <odds.jsonl>]');
    process.exit(1);
  }

  let msgs = 0, scores = 0, statuses = 0, unparsed = 0;
  const timeline: string[] = [];
  const rl = createInterface({ input: createReadStream(scoresPath) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const o = JSON.parse(line) as { receivedAtMs: number; event: string; data: string };
    if (o.event !== 'message') continue;
    msgs++;
    const s = parseScoreMessage(o.data, o.receivedAtMs, 'replay');
    if (s) {
      scores++;
      timeline.push(
        `  ${s.minute ?? '?'}'  GOAL  ${s.home}–${s.away}  (${s.side ?? '?'} scored)${s.scorer ? ' ' + s.scorer : ''}`,
      );
      continue;
    }
    const st = parseStatusMessage(o.data, o.receivedAtMs, 'replay');
    if (st) {
      statuses++;
      timeline.push(`  ${st.minute ?? '?'}'  PHASE → ${st.phase}`);
      continue;
    }
    unparsed++; // expected: possession/shots/corners etc. — outside ScoreEvent/StatusEvent
  }
  console.log(`scores file: ${msgs} messages → ${scores} ScoreEvents, ${statuses} StatusEvents, ${unparsed} other actions (expected)`);
  console.log('timeline:');
  for (const t of timeline) console.log(t);

  if (oddsPath) {
    let oddsMsgs = 0, ticks = 0, inRun = 0, bad = 0;
    let first: string | null = null, last: string | null = null;
    const rl2 = createInterface({ input: createReadStream(oddsPath) });
    for await (const line of rl2) {
      if (!line.trim()) continue;
      const o = JSON.parse(line) as { receivedAtMs: number; event: string; data: string };
      if (o.event !== 'message') continue;
      oddsMsgs++;
      const t = parseOddsMessage(o.data, o.receivedAtMs, 'replay');
      if (!t) continue;
      ticks++;
      const r = t.raw as { InRunning?: boolean } | undefined;
      if (r?.InRunning) inRun++;
      const sum = t.pHome + t.pDraw + t.pAway;
      if (Math.abs(sum - 1) > 0.02) bad++;
      const fmt = `${(t.pHome * 100).toFixed(1)}/${(t.pDraw * 100).toFixed(1)}/${(t.pAway * 100).toFixed(1)}`;
      if (!first) first = fmt;
      last = fmt;
    }
    console.log(`\nodds file: ${oddsMsgs} messages → ${ticks} 1X2 ticks (${inRun} in-running), ${bad} sum-violations`);
    console.log(`  first ${first}  →  last ${last}`);
  }
}

main();
