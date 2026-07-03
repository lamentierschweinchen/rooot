/**
 * ROOOT composition root — coordinator-only (see AGENTS.md).
 *
 * Saturday: the stage mounts here, fed by a MatchDataSource through the frozen
 * seam in @contracts/match — TxLineDataSource (live) | ReplaySource (fixtures)
 * | MockSource (dev) — with the crowd bus (contracts/crowd.ts) alongside.
 */
import type { MatchDataSource } from '@contracts/match';

// Assigned during Saturday's integration.
let source: MatchDataSource | null = null;
void source;

console.log('[rooot] scaffold alive — the stage is being chalked.');
