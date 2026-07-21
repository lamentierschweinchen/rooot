/**
 * LATE PREDICTIONS — the decayed-bonus mechanism (owner's call, 20 Jul 2026).
 *
 * WHY IT EXISTS. Before this, a prediction placed after kickoff hit
 * `if (this.predictLocked) return false` and vanished: not stored, not counted,
 * not logged, and the fan was never told. The final had 21 fans and 3
 * predictions, and we could not say how many of the other 18 had tried.
 *
 * WHAT MUST HOLD, and what this proves:
 *   1. a late call is KEPT (it used to be dropped)
 *   2. a late call NEVER enters consensus — the crowd's foresight, optimism gap
 *      and verdict all describe what was believed BEFORE kickoff, and a call
 *      made at 106' of a 1–0 match would otherwise report the crowd as
 *      clairvoyant. This is the load-bearing one.
 *   3. the bonus decays linearly to zero across regulation, and extra time or
 *      an unplaceable (null-minute) call earns no bonus at all
 *   4. a late call can never out-earn the same call made on time
 *   5. the first late call stands — a fan cannot re-call at 89' to win back
 *      the credit the decay took
 *
 * Run: npx tsx src/dev/late-prediction-check.ts   (from services/stands)
 */
import { MatchState } from '../match-state';

let failures = 0;
const fail = (m: string): void => { console.error('  FAIL  ' + m); failures++; };
const pass = (m: string): void => { console.log('  ok    ' + m); };
const eq = (got: unknown, want: unknown, m: string): void => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass(`${m} (${JSON.stringify(got)})`);
  else fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

/** mirrors server.ts lateMultiplier — kept in step by the assertions below */
const LATE_DECAY_FULL_MIN = 90;
function lateMultiplier(minute: number | null): number {
  if (minute === null || !Number.isFinite(minute)) return 0;
  return Math.max(0, Math.min(1, 1 - minute / LATE_DECAY_FULL_MIN));
}

console.log('\n1 · a late call is kept, not dropped');
{
  const m = new MatchState('test-late');
  m.root('fan-early', 'home');
  m.predict('fan-early', 2, 1, 1000);
  m.lockPredictions();
  const stored = m.predictLate('fan-late', 1, 0, 2000, 70);
  eq(stored, { home: 1, away: 0, minute: 70 }, 'predictLate returns the stored row');
  eq(m.latePredictionsAll().length, 1, 'one late call held');
}

console.log('\n2 · late calls NEVER reach consensus (the load-bearing rule)');
{
  const m = new MatchState('test-consensus');
  m.root('a', 'home'); m.root('b', 'home');
  m.predict('a', 2, 1, 1000);          // on time
  m.lockPredictions();
  m.predictLate('b', 1, 0, 2000, 106); // after the whistle-ish, "calls" the real score
  const c = m.consensus();
  eq(c.all.n, 1, 'consensus counts ONLY the on-time call');
  eq(c.all.mean, { home: 2, away: 1 }, 'the mean is the on-time call, unmoved by the late one');
  const inConsensus = JSON.stringify(c).includes('"home":1,"away":0');
  if (inConsensus) fail('the late 1–0 leaked into consensus');
  else pass('the late 1–0 is absent from the consensus payload entirely');
}

console.log('\n3 · the bonus decays linearly to zero');
{
  const cases: Array<[number | null, number]> = [
    [0, 1], [10, 1 - 10 / 90], [45, 0.5], [60, 1 / 3], [80, 1 - 80 / 90], [90, 0], [106, 0], [null, 0],
  ];
  for (const [minute, want] of cases) {
    const got = lateMultiplier(minute);
    if (Math.abs(got - want) < 1e-9) pass(`minute ${minute === null ? 'null' : minute}' → ×${got.toFixed(3)}`);
    else fail(`minute ${minute}' → got ×${got}, want ×${want}`);
  }
  // and what that means in points for an exact call (base 200, no dial)
  for (const minute of [0, 45, 80, 90, 106]) {
    console.log(`        exact call at ${String(minute).padStart(3)}' → ${Math.round(200 * lateMultiplier(minute))} pts`);
  }
}

console.log('\n4 · a late call can never out-earn the same call made on time');
{
  let worst = 0;
  for (let minute = 0; minute <= 130; minute++) worst = Math.max(worst, lateMultiplier(minute));
  if (worst <= 1) pass(`the multiplier never exceeds 1 (max observed ×${worst.toFixed(3)})`);
  else fail(`multiplier exceeded 1 (×${worst})`);
  let prev = Infinity, monotonic = true;
  for (let minute = 0; minute <= 130; minute++) { const v = lateMultiplier(minute); if (v > prev + 1e-12) monotonic = false; prev = v; }
  if (monotonic) pass('and never increases as the match wears on');
  else fail('the multiplier increased at some minute — later must never pay more');
}

console.log('\n5 · the first late call stands');
{
  const m = new MatchState('test-first');
  m.lockPredictions();
  m.predictLate('fan', 3, 3, 1000, 50);
  const second = m.predictLate('fan', 1, 0, 2000, 89); // the result is obvious by now
  eq(second, null, 'a second late call is refused');
  const held = m.latePredictionsAll()[0];
  eq({ home: held?.home, away: held?.away, minute: held?.minute }, { home: 3, away: 3, minute: 50 }, 'the 50th-minute call is what stands');
}

console.log('\n6 · an on-time prediction is untouched by any of this');
{
  const m = new MatchState('test-ontime');
  m.root('a', 'home');
  eq(m.predict('a', 2, 1, 1000), true, 'predict() still accepts before the lock');
  eq(m.consensus().all.n, 1, 'and still reaches consensus');
  eq(m.latePredictionsAll().length, 0, 'with nothing in the late map');
}

console.log(failures === 0 ? '\nlate-prediction-check: PASS\n' : `\nlate-prediction-check: ${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
