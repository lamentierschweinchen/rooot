import assert from 'node:assert';
import { bindClaim } from './claim';

// Mirror MatchState's read-only accessors (getRootedSide / getPrediction) so a
// real MatchState and this mock bind identically — no private-map access.
const rooted = new Map<string, 'home' | 'away'>([['anon-1', 'home']]);
const predictions = new Map([['anon-1', { home: 2, away: 1, atMs: 111 }]]);
const match = {
  matchId: '18209181',
  getRootedSide: (anonId: string) => rooted.get(anonId),
  getPrediction: (anonId: string) => predictions.get(anonId),
};

const rec = bindClaim(match, 'anon-1', 'FanKey', 'passkey', 999);
assert.equal(rec.pubkey, 'FanKey');
assert.equal(rec.side, 'home');
assert.deepEqual(rec.call, { home: 2, away: 1 });
assert.equal(rec.matchId, '18209181');
console.log('OK binds real side + call');

// an anonymous fan who never called: no call, no side invented
const rec2 = bindClaim(match, 'anon-none', 'FanKey2', 'privy', 999);
assert.strictEqual(rec2.side, null);
assert.strictEqual(rec2.call, null);
console.log('OK never invents a call');
