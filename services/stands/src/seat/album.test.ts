import assert from 'node:assert';
import { shapeAlbum } from './album';

const assets = [
  { id: 'A1', content: { json_uri: 'ar://x', links: { image: 'ar://img' },
    metadata: { name: 'ROOOT · FRA v MAR',
      attributes: [{ trait_type: 'matchId', value: '18209181' }, { trait_type: 'side', value: 'home' },
                   { trait_type: 'call', value: '2-1' }] } } },
  { id: 'BAD', content: { metadata: {}, json_uri: '' } }, // malformed → dropped
];
const out = shapeAlbum(assets as any);
assert.equal(out.length, 1, 'malformed asset dropped, not faked');
assert.deepEqual(out[0], { asset: 'A1', name: 'ROOOT · FRA v MAR', matchId: '18209181', side: 'home', call: { home: 2, away: 1 }, image: 'ar://img' });
console.log('OK shapes valid scarves, drops malformed');
