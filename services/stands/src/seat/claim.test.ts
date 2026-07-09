import assert from 'node:assert';
import { bindClaim } from './claim';

const match = {
  matchId: '18209181',
  rooted: new Map([['anon-1', 'home']]),
  predictions: new Map([['anon-1', { home: 2, away: 1, atMs: 111 }]]),
};

const rec = bindClaim(match as any, 'anon-1', 'FanKey', 'passkey', 999);
assert.equal(rec.pubkey, 'FanKey');
assert.equal(rec.side, 'home');
assert.deepEqual(rec.call, { home: 2, away: 1 });
assert.equal(rec.matchId, '18209181');
console.log('OK binds real side + call');

// an anonymous fan who never called: no call, no side invented
const rec2 = bindClaim(match as any, 'anon-none', 'FanKey2', 'privy', 999);
assert.equal(rec2.side, null);
assert.equal(rec2.call, null);
console.log('OK never invents a call');
