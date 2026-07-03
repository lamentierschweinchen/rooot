/**
 * ROOOT entry. Tonight: a placeholder mark while the data foundation lands.
 * Saturday: the stage — tide-on-pitch, ends, cheer, pulse — mounts here,
 * fed by a MatchDataSource through the seam in src/data/types.ts.
 */
import type { MatchDataSource } from './data/types';

// The seam the whole app hangs on. Assigned in the Saturday stage work:
// TxLineDataSource (live) | ReplaySource (fixtures/*.jsonl) | MockSource (dev).
let source: MatchDataSource | null = null;
void source;

console.log('[rooot] scaffold alive — the stage is being chalked.');
