import assert from 'node:assert';
import { shapeAlbum } from './album';

const assets = [
  { id: 'A1', content: { json_uri: 'ar://x', links: { image: 'ar://img' },
    metadata: { name: 'ROOOT · SUI–COL',
      attributes: [
        { trait_type: 'matchId', value: '18202783' },
        { trait_type: 'home', value: 'SUI' },
        { trait_type: 'away', value: 'COL' },
        { trait_type: 'score', value: '1–1' },
        { trait_type: 'comp', value: 'WORLD CUP' },
        { trait_type: 'date', value: "07 JUL '26" },
        { trait_type: 'serial', value: '009' },
        { trait_type: 'call', value: 'SUI 2–1' },
        { trait_type: 'result', value: 'wrong' },
      ] } } },
  // a real seat with no locked prediction: call/result genuinely absent — must NOT be dropped
  { id: 'A2', content: { json_uri: 'ar://y', links: { image: null },
    metadata: { name: 'ROOOT · ARG–CPV',
      attributes: [
        { trait_type: 'matchId', value: '18175918' },
        { trait_type: 'home', value: 'ARG' },
        { trait_type: 'away', value: 'CPV' },
        { trait_type: 'score', value: '3–2' },
        { trait_type: 'comp', value: 'WORLD CUP' },
        { trait_type: 'date', value: "03 JUL '26" },
        { trait_type: 'serial', value: '001' },
      ] } } },
  { id: 'NO-NAME', content: { metadata: {}, json_uri: '' } }, // no name at all → dropped
  { id: 'NO-SCORE', content: { metadata: { name: 'ROOOT · X–Y', attributes: [
      { trait_type: 'matchId', value: '1' }, { trait_type: 'home', value: 'X' }, { trait_type: 'away', value: 'Y' },
      { trait_type: 'comp', value: 'WORLD CUP' }, { trait_type: 'date', value: "01 JAN '26" }, { trait_type: 'serial', value: '002' },
    ] }, json_uri: '' } }, // missing a structural fact (score) → dropped, not half-rendered
];
const out = shapeAlbum(assets as any);
assert.equal(out.length, 2, 'only the two well-formed scarves survive; NO-NAME + NO-SCORE dropped, not faked');

assert.deepEqual(out[0], {
  asset: 'A1', home: 'SUI', away: 'COL', score: '1–1', call: 'SUI 2–1', result: 'wrong',
  comp: 'WORLD CUP', date: "07 JUL '26", serial: '009', matchId: '18202783', image: 'ar://img',
});
console.log('OK shapes a full scarf record (home/away/score/call/result/comp/date/serial/matchId/image)');

assert.deepEqual(out[1], {
  asset: 'A2', home: 'ARG', away: 'CPV', score: '3–2', call: null, result: null,
  comp: 'WORLD CUP', date: "03 JUL '26", serial: '001', matchId: '18175918', image: null,
});
console.log('OK a seat with no locked prediction: call/result null, never invented — scarf still kept');

// a bad `result` value (not one of the 3 states) is treated as absent, never passed through raw
const badResultAssets = [
  { id: 'B1', content: { json_uri: '', metadata: { name: 'ROOOT · X', attributes: [
    { trait_type: 'matchId', value: '1' }, { trait_type: 'home', value: 'X' }, { trait_type: 'away', value: 'Y' },
    { trait_type: 'score', value: '1–0' }, { trait_type: 'comp', value: 'WORLD CUP' }, { trait_type: 'date', value: "01 JAN '26" },
    { trait_type: 'serial', value: '003' }, { trait_type: 'result', value: 'bogus' },
  ] } } },
];
const badResult = shapeAlbum(badResultAssets as any);
assert.equal(badResult[0]!.result, null, 'an unrecognized result value normalizes to null, not passed through');
console.log('OK malformed result trait normalizes to null');
