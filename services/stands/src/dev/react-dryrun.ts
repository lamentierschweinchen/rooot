/**
 * REACT dry-run (docs/MECHANISMS.md §4) — proves the drama-moment mechanism
 * end-to-end WITHOUT the network: the real MatchState window logic and the real
 * SentimentAccumulator, fed realistic reactions.
 *
 * Proves: the per-end split aggregation; the honesty rules (a token outside the
 * palette is rejected, one-react-per-fan is last-write-wins, an end with no
 * reactors reveals honestly empty); one-window-at-a-time + the soft cooldown;
 * and that the reveals crystallize into feel.moments with a real volatility.
 *
 * Run: npm --prefix services/stands run dryrun:react
 */
import { MatchState } from '../match-state';
import { SentimentAccumulator } from '../sentiment/accumulator';
import { detectMoment } from '../server';
import { MOMENT_COOLDOWN_MS } from '../decay';
import type { MomentResultMsg } from '@contracts/crowd';
import type { SentimentRecord } from '@contracts/sentiment';

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}
function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps;
}

const MATCH = 'dryrun-usa-bel';
const m = new MatchState(MATCH);

// five fans take their ends.
const homeFans = ['h1', 'h2', 'h3'];
const awayFans = ['a1', 'a2'];
for (const id of homeFans) m.root(id, 'home');
for (const id of awayFans) m.root(id, 'away');

let t = 1_000_000; // deterministic clock (ms), advanced explicitly

/* ── MOMENT A — a home goal at 23'. The split: their anguish vs your euphoria ── */
console.log('\nMOMENT A  goal @23′  (home scores)');
const palA = m.beginMoment(`${MATCH}:g23`, 'goal', 'home', 23, t);
check('window opens with the goal palette', !!palA && palA.includes('euphoria'), palA?.join('/'));
check('a second window cannot open while one is live', m.beginMoment(`${MATCH}:x`, 'swing', 'home', 23, t) === null);

// home fans react (h1 changes their mind: tension → euphoria = last-write-wins).
check('h1 reacts tension', m.momentReact('h1', `${MATCH}:g23`, 'home', 'tension', t + 1));
check('h1 changes to euphoria (last-write-wins)', m.momentReact('h1', `${MATCH}:g23`, 'home', 'euphoria', t + 2));
check('h2 reacts euphoria', m.momentReact('h2', `${MATCH}:g23`, 'home', 'euphoria', t + 3));
check('h3 reacts relief', m.momentReact('h3', `${MATCH}:g23`, 'home', 'relief', t + 4));
// away fans, gutted.
check('a1 reacts anguish', m.momentReact('a1', `${MATCH}:g23`, 'away', 'anguish', t + 5));
check('a2 reacts anguish', m.momentReact('a2', `${MATCH}:g23`, 'away', 'anguish', t + 6));
// honesty: a token outside the palette is dropped, and a stale momentId is dropped.
check('a token outside the palette is rejected', m.momentReact('h2', `${MATCH}:g23`, 'home', 'banana', t + 7) === false);
check('a react to a stale momentId is rejected', m.momentReact('h2', `${MATCH}:stale`, 'home', 'euphoria', t + 8) === false);

t += 30_000;
const A = m.endMoment(`${MATCH}:g23`, t);
if (!A) {
  console.log('  ✗ FAIL — moment A did not close');
  process.exit(1);
}
check('home top feeling is euphoria', A.byEnd.home.top === 'euphoria', `top=${A.byEnd.home.top}`);
check('home reactor count is 3 (last-write-wins, not 4)', A.byEnd.home.n === 3, `n=${A.byEnd.home.n}`);
check('home euphoria share is 2/3', approx(A.byEnd.home.pct, 2 / 3), `pct=${A.byEnd.home.pct.toFixed(3)}`);
check('away top feeling is anguish at 100%', A.byEnd.away.top === 'anguish' && approx(A.byEnd.away.pct, 1), `${A.byEnd.away.top} ${A.byEnd.away.pct}`);
check('side favoured is home (the scorer)', A.side === 'home');

// the cooldown holds off a SOFT trigger right after a close, then clears.
check('a soft trigger is on cooldown immediately after close', m.canOpenSoft(t) === false);
check('the cooldown clears after MOMENT_COOLDOWN_MS', m.canOpenSoft(t + MOMENT_COOLDOWN_MS) === true);

/* ── MOMENT B — a near-miss at 61'. Different feelings → the mood swings ── */
console.log('\nMOMENT B  near-miss @61′  (away hits the bar)');
t += MOMENT_COOLDOWN_MS;
const palB = m.beginMoment(`${MATCH}:s61`, 'near-miss', 'away', 61, t);
check('window opens with the near-miss palette', !!palB && palB.includes('agony'));
m.momentReact('h1', `${MATCH}:s61`, 'home', 'agony', t + 1);
m.momentReact('h2', `${MATCH}:s61`, 'home', 'agony', t + 2);
m.momentReact('h3', `${MATCH}:s61`, 'home', 'frustration', t + 3);
m.momentReact('a1', `${MATCH}:s61`, 'away', 'relief', t + 4);
m.momentReact('a2', `${MATCH}:s61`, 'away', 'relief', t + 5);
t += 30_000;
const B = m.endMoment(`${MATCH}:s61`, t);
check('near-miss closed with home top = agony', !!B && B.byEnd.home.top === 'agony');

/* ── MOMENT C — a VAR check only the home end reacts to (empty-end honesty) ── */
console.log('\nMOMENT C  VAR @78′  (only the home end reacts)');
t += MOMENT_COOLDOWN_MS;
m.beginMoment(`${MATCH}:v78`, 'var', null, 78, t);
m.momentReact('h1', `${MATCH}:v78`, 'home', 'hope', t + 1);
t += 30_000;
const C = m.endMoment(`${MATCH}:v78`, t);
check('the silent away end is honestly empty (top "", n 0, {})', !!C && C.byEnd.away.top === '' && C.byEnd.away.n === 0 && Object.keys(C.byEnd.away.hist).length === 0);
check('the home end that reacted is not empty', !!C && C.byEnd.home.n === 1 && C.byEnd.home.top === 'hope');

/* ── DETECTION — real wire shapes map to the right triggers ── */
console.log('\nDETECTION  wire shapes → drama triggers');
type Wire = Parameters<typeof detectMoment>[1];
const wire = (o: unknown): Wire => o as Wire;
const goalTrig = detectMoment('det', wire({ type: 'ledger', msg: { type: 'event', ev: { id: 'det:1', kind: 'goal', side: 'home', minute: 23 } } }));
check('a goal ledger event → a hard goal moment on the scoring side', goalTrig?.kind === 'goal' && goalTrig.hard === true && goalTrig.side === 'home' && goalTrig.sourceId === 'det:1');
const ftTrig = detectMoment('det', wire({ type: 'status', ev: { phase: 'FULL_TIME', minute: 94 } }));
check('a FULL_TIME status → a hard full-time moment', ftTrig?.kind === 'full-time' && ftTrig.hard === true);
const woodTrig = detectMoment('det', wire({ type: 'ledger', msg: { type: 'event', ev: { id: 'det:2', kind: 'shot', side: 'away', minute: 61, detail: 'Woodwork' } } }));
check('a shot off the woodwork → a soft near-miss', woodTrig?.kind === 'near-miss' && woodTrig.hard === false);
const plainShot = detectMoment('det', wire({ type: 'ledger', msg: { type: 'event', ev: { id: 'det:3', kind: 'shot', side: 'away', minute: 62, detail: 'OnTarget' } } }));
check('an ordinary shot → no moment (not every shot is drama)', plainShot === null);
const swingMatch = 'det-swing';
check('the first odds tick only sets a baseline (no moment)', detectMoment(swingMatch, wire({ type: 'odds', tick: { pHome: 0.4, pDraw: 0.3, pAway: 0.3, period: 'full', tMs: 0 } })) === null);
const swingTrig = detectMoment(swingMatch, wire({ type: 'odds', tick: { pHome: 0.6, pDraw: 0.2, pAway: 0.2, period: 'full', tMs: 1 } }));
check('a 0.20 market lurch → a soft swing toward home', swingTrig?.kind === 'swing' && swingTrig.hard === false && swingTrig.side === 'home');
const smallMove = detectMoment(swingMatch, wire({ type: 'odds', tick: { pHome: 0.61, pDraw: 0.2, pAway: 0.19, period: 'full', tMs: 2 } }));
check('a 0.01 market wiggle → no moment (below the noise floor)', smallMove === null);

/* ── the reveals crystallize into the sentiment record's feel.moments ── */
console.log('\nCRYSTALLIZE  the reveals → feel.moments');
const fixture: SentimentRecord['fixture'] = {
  home: { code: 'USA', name: 'United States', colors: ['#1a1a6c', '#bf0a30'] },
  away: { code: 'BEL', name: 'Belgium', colors: ['#c8102e', '#ffd100'] },
  competition: 'FIFA World Cup',
  dateISO: '2026-07-07',
};
const acc = new SentimentAccumulator(MATCH, fixture);
// a touch of market + result so the record assembles like the live path.
acc.onFeed({ type: 'status', ev: { phase: 'FIRST_HALF', minute: 1 } } as never);
acc.onFeed({ type: 'odds', tick: { pHome: 0.45, pDraw: 0.3, pAway: 0.25, tMs: t, period: 'full' } } as never);
acc.onFeed({ type: 'score', ev: { home: 1, away: 0, minute: 90 } } as never);
// feed the three reveals exactly as the server would broadcast them.
const asMsg = (r: NonNullable<ReturnType<MatchState['endMoment']>>, momentId: string): MomentResultMsg => ({
  type: 'momentResult',
  matchId: MATCH,
  momentId,
  kind: r.kind,
  minute: r.minute,
  byEnd: r.byEnd,
  closedAtMs: t,
});
acc.onFeed(asMsg(A, `${MATCH}:g23`));
if (B) acc.onFeed(asMsg(B, `${MATCH}:s61`));
if (C) acc.onFeed(asMsg(C, `${MATCH}:v78`));

// roar capture off the 4 Hz stands tick: two ticks a second apart, away loudest.
const pulse0 = { belief: 0, nerves: 0, rage: 0 };
acc.onFeed({ type: 'stands', matchId: MATCH, ts: t, counts: { home: 3, away: 2 }, roar: { home: 2, away: 5 }, pulse: { home: pulse0, away: pulse0 }, presence: 5 } as never);
acc.onFeed({ type: 'stands', matchId: MATCH, ts: t + 1000, counts: { home: 3, away: 2 }, roar: { home: 3, away: 1 }, pulse: { home: pulse0, away: pulse0 }, presence: 5 } as never);

const record = acc.crystallize(
  { consensus: null, rooted: { home: 3, away: 2 } },
  { serial: 1, editionSize: null, caption: MATCH },
);
check('all three felt moments are in the record', record.feel.moments.length === 3, `moments=${record.feel.moments.length}`);
check('the first moment kept its goal identity + split', record.feel.moments[0]?.kind === 'goal' && record.feel.moments[0]?.byEnd.home.top === 'euphoria');
check('feel.volatility is a real, non-zero swing (0..1)', record.feel.volatility > 0 && record.feel.volatility <= 1, `volatility=${record.feel.volatility.toFixed(3)}`);
check('the record still hashes + carries its headline', typeof record.provenance.recordHash === 'string' && record.provenance.recordHash.length > 0, record.headline);
check('roar peak captured — the loudest instant (away, 5)', record.feel.roar.peak?.side === 'away' && record.feel.roar.peak?.value === 5, `peak=${JSON.stringify(record.feel.roar.peak)}`);
check('roar total integrated off the ticks (no longer a hardcoded 0)', record.feel.roar.total.home > 0, `total=${JSON.stringify(record.feel.roar.total)}`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
