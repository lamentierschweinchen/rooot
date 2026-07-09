import assert from 'node:assert';
import { mergeProfile } from './profile-store';

const base = { pubkey: 'K', sides: ['home'], since: 100, displayName: null };
const merged = mergeProfile(base, { sides: ['away'], since: 50, displayName: 'ro' });
assert.deepEqual(merged.sides.sort(), ['away', 'home']);
assert.equal(merged.since, 50, 'keeps earliest since');
assert.equal(merged.displayName, 'ro');
console.log('OK merge unions sides, earliest since, sets name');

const merged2 = mergeProfile(merged, { sides: ['home'], since: 999, displayName: '' });
assert.deepEqual(merged2.sides.sort(), ['away', 'home'], 'no duplicate sides');
assert.equal(merged2.displayName, 'ro', 'empty name does not clobber');
console.log('OK merge idempotent + name-safe');
