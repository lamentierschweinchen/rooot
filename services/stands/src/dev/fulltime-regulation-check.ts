/**
 * ESP-ARG (the final, 19 Jul 2026) — the 90-minute whistle trap.
 *
 * THE INCIDENT. mapLiveStatusId folds StatusId 5, 10 and 13 onto FULL_TIME.
 * Only 10 and 13 are terminal. 5 fires at the end of REGULATION in every
 * match, including one heading for extra time. In the final the wire sent 5
 * at 21:15:47Z with the score 0-0; the service finalized and sealed 28s
 * later; extra time kicked off at 21:19:07Z and Spain won it 1-0 at 105'.
 * The verdicts, the keepsake and the on-chain anchor were all committed to a
 * goalless draw "decided in 90" that never happened.
 *
 * The envelopes below are the REAL ones off the wire that night, verbatim from
 * fixtures/live-esp-arg/scores-esparg.jsonl. That capture is gitignored, so
 * this file is the surviving evidence of the sequence.
 *
 * WHAT THIS CHECKS: the discriminator the fix rests on — that 5 and 10 both
 * map to FULL_TIME and are therefore indistinguishable by phase alone, that
 * the live StatusId is recoverable from StatusEvent.raw, and that a real
 * EXTRA_TIME phase arrives BETWEEN them. That is exactly the information
 * server.ts uses to hold a 5 and to finalize on a 10.
 *
 * NOT COVERED: the timer wiring in server.ts (grace window, cancellation) —
 * predictLifecycle is module-internal. This proves the signal, not the plumbing.
 *
 * Run: npx tsx src/dev/fulltime-regulation-check.ts   (from services/stands)
 */
import { parseStatusMessage } from '@contracts/normalize';

/** verbatim wire envelopes — ESP-ARG, fixture 18257739 */
const WIRE = [
  // StatusId 5 @ 2026-07-19T21:15:47.778Z — the 90' whistle — NOT the end
  { receivedAtMs: 1784495747778, statusId: 5, data: "{\"FixtureId\":18257739,\"GameState\":\"scheduled\",\"StartTime\":1784487900000,\"IsTeam\":true,\"FixtureGroupId\":10115676,\"CompetitionId\":72,\"CountryId\":466,\"SportId\":1,\"Participant1IsHome\":true,\"Participant2Id\":1489,\"Participant1Id\":3021,\"CoverageSecondaryData\":true,\"CoverageType\":\"TV/Stream\",\"Action\":\"status\",\"Id\":869,\"Ts\":1784495747689,\"ConnectionId\":1180,\"Seq\":975,\"StatusId\":5,\"Type\":\"Soccer\",\"Data\":{\"StatusId\":5},\"Stats\":{\"1001\":0,\"6006\":0,\"4008\":0,\"5002\":0,\"1007\":2,\"1003\":0,\"8\":1,\"1004\":1,\"4005\":0,\"3008\":1,\"1005\":0,\"7008\":0,\"5\":0,\"3004\":2,\"5005\":0,\"2007\":2,\"6002\":0,\"4001\":0,\"7004\":0,\"2002\":0,\"1\":0,\"6\":1,\"7005\":0,\"5006\":0,\"1006\":0,\"3001\":0,\"2006\":0,\"1002\":0,\"6005\":0,\"3005\":0,\"2\":0,\"4004\":0,\"2001\":0,\"6001\":0,\"3002\":0,\"7006\":0,\"7\":9,\"7001\":0,\"6004\":0,\"3006\":1,\"5007\":0,\"7002\":0,\"3\":0,\"2005\":0,\"6008\":0,\"5003\":0,\"4003\":0,\"5001\":0,\"1008\":0,\"3007\":7,\"7007\":0,\"4006\":0,\"5008\":0,\"2004\":1,\"6003\":0,\"3003\":0,\"2003\":0,\"6007\":0,\"5004\":0,\"2008\":0,\"4\":3,\"4007\":0,\"7003\":0,\"4002\":0},\"Kickoff\":{\"Team\":1},\"PossessionType\":\"SafePossession\"}" },
  // StatusId 7 @ 2026-07-19T21:19:07.895Z — extra time kicks off
  { receivedAtMs: 1784495947895, statusId: 7, data: "{\"FixtureId\":18257739,\"GameState\":\"scheduled\",\"StartTime\":1784487900000,\"IsTeam\":true,\"FixtureGroupId\":10115676,\"CompetitionId\":72,\"CountryId\":466,\"SportId\":1,\"Participant1IsHome\":true,\"Participant2Id\":1489,\"Participant1Id\":3021,\"CoverageSecondaryData\":true,\"CoverageType\":\"TV/Stream\",\"Action\":\"status\",\"Id\":877,\"Ts\":1784495947804,\"ConnectionId\":1180,\"Seq\":983,\"StatusId\":7,\"Type\":\"Soccer\",\"Clock\":{\"Running\":false,\"Seconds\":5400},\"Data\":{\"StatusId\":7},\"Stats\":{\"1001\":0,\"6006\":0,\"4008\":0,\"5002\":0,\"1007\":2,\"1003\":0,\"8\":1,\"1004\":1,\"4005\":0,\"3008\":1,\"1005\":0,\"7008\":0,\"5\":0,\"3004\":2,\"5005\":0,\"2007\":2,\"6002\":0,\"4001\":0,\"7004\":0,\"2002\":0,\"1\":0,\"6\":1,\"7005\":0,\"5006\":0,\"1006\":0,\"3001\":0,\"2006\":0,\"1002\":0,\"6005\":0,\"3005\":0,\"2\":0,\"4004\":0,\"2001\":0,\"6001\":0,\"3002\":0,\"7006\":0,\"7\":9,\"7001\":0,\"6004\":0,\"3006\":1,\"5007\":0,\"7002\":0,\"3\":0,\"2005\":0,\"6008\":0,\"5003\":0,\"4003\":0,\"5001\":0,\"1008\":0,\"3007\":7,\"7007\":0,\"4006\":0,\"5008\":0,\"2004\":1,\"6003\":0,\"3003\":0,\"2003\":0,\"6007\":0,\"5004\":0,\"2008\":0,\"4\":3,\"4007\":0,\"7003\":0,\"4002\":0},\"Kickoff\":{\"Team\":1}}" },
  // StatusId 10 @ 2026-07-19T22:02:02.419Z — end of extra time — the REAL end
  { receivedAtMs: 1784498522419, statusId: 10, data: "{\"FixtureId\":18257739,\"GameState\":\"scheduled\",\"StartTime\":1784487900000,\"IsTeam\":true,\"FixtureGroupId\":10115676,\"CompetitionId\":72,\"CountryId\":466,\"SportId\":1,\"Participant1IsHome\":true,\"Participant2Id\":1489,\"Participant1Id\":3021,\"CoverageSecondaryData\":true,\"CoverageType\":\"TV/Stream\",\"Action\":\"status\",\"Id\":1219,\"Ts\":1784498522334,\"ConnectionId\":1180,\"Seq\":1382,\"StatusId\":10,\"Type\":\"Soccer\",\"Data\":{\"StatusId\":10},\"Stats\":{\"1001\":0,\"6006\":0,\"4008\":0,\"5002\":0,\"1007\":2,\"1003\":0,\"8\":4,\"1004\":1,\"4005\":0,\"3008\":1,\"1005\":0,\"7008\":3,\"5\":0,\"3004\":2,\"5005\":0,\"2007\":2,\"6002\":0,\"4001\":0,\"7004\":1,\"2002\":0,\"1\":1,\"6\":1,\"7005\":0,\"5006\":0,\"1006\":0,\"3001\":0,\"2006\":0,\"1002\":0,\"6005\":0,\"3005\":0,\"2\":0,\"4004\":0,\"2001\":0,\"6001\":0,\"3002\":0,\"7006\":0,\"7\":9,\"7001\":1,\"6004\":0,\"3006\":1,\"5007\":0,\"7002\":0,\"3\":0,\"2005\":0,\"6008\":0,\"5003\":0,\"4003\":0,\"5001\":1,\"1008\":0,\"3007\":7,\"7007\":0,\"4006\":0,\"5008\":3,\"2004\":1,\"6003\":0,\"3003\":0,\"2003\":0,\"6007\":0,\"5004\":1,\"2008\":0,\"4\":4,\"4007\":0,\"7003\":0,\"4002\":0},\"Kickoff\":{\"Team\":1}}" },
];

let failures = 0;
const fail = (m: string): void => { console.error('  FAIL  ' + m); failures++; };
const pass = (m: string): void => { console.log('  ok    ' + m); };

const seen = WIRE.map((w) => {
  const ev = parseStatusMessage(w.data, w.receivedAtMs, 'live');
  if (!ev) { fail('StatusId ' + w.statusId + ' did not parse into a StatusEvent'); return null; }
  const raw = ev.raw as { Action?: string; StatusId?: number; Data?: { StatusId?: number } };
  const recovered = raw.Action === 'status' ? (raw.Data?.StatusId ?? raw.StatusId) : raw.StatusId;
  if (recovered !== w.statusId) fail('StatusId ' + w.statusId + ' not recoverable from ev.raw (got ' + recovered + ')');
  else pass('StatusId ' + w.statusId + ' recoverable from ev.raw -> phase ' + ev.phase);
  return { statusId: w.statusId, phase: String(ev.phase) };
}).filter(Boolean) as Array<{ statusId: number; phase: string }>;

const p5 = seen.find((s) => s.statusId === 5);
const p7 = seen.find((s) => s.statusId === 7);
const p10 = seen.find((s) => s.statusId === 10);

if (p5?.phase !== 'FULL_TIME') fail('StatusId 5 should map to FULL_TIME, got ' + p5?.phase);
else pass('StatusId 5 maps to FULL_TIME (the trap: looks terminal, is not)');

if (p10?.phase !== 'FULL_TIME') fail('StatusId 10 should map to FULL_TIME, got ' + p10?.phase);
else pass('StatusId 10 maps to FULL_TIME (genuinely terminal)');

if (p5 && p10 && p5.phase === p10.phase) pass('5 and 10 are INDISTINGUISHABLE by phase — StatusId is the only discriminator');
else fail('expected 5 and 10 to share a phase');

if (p7?.phase !== 'EXTRA_TIME') fail('StatusId 7 should map to EXTRA_TIME, got ' + p7?.phase);
else pass('StatusId 7 maps to EXTRA_TIME — the continuation that must cancel a held 5');

const i5 = seen.findIndex((s) => s.statusId === 5);
const i7 = seen.findIndex((s) => s.statusId === 7);
const i10 = seen.findIndex((s) => s.statusId === 10);
if (!(i5 < i7 && i7 < i10)) fail('expected the real order 5 -> 7 -> 10');
else pass('real order holds: 5 (90 min) -> 7 (ET) -> 10 (true end)');

const gapMs = (WIRE[1]?.receivedAtMs ?? 0) - (WIRE[0]?.receivedAtMs ?? 0);
console.log('\n  the 5 -> ET gap that night: ' + Math.round(gapMs / 1000) + 's (the grace window must exceed this)');

console.log(failures === 0 ? '\nfulltime-regulation-check: PASS' : '\nfulltime-regulation-check: ' + failures + ' FAILURE(S)');
process.exit(failures === 0 ? 0 : 1);
