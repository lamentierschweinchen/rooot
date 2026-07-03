/**
 * ROOOT stands service — L2 lane builds this.
 *
 * Job: hold the live stands for each match — rooted counts per side, decayed
 * cheer roar, pulse react counts, presence, rooms — and fan state out to all
 * clients at ~4 Hz. Also: the call relayer (walletless receipts via devnet
 * memo txs, fee-paid by the service wallet; see contracts/crowd.ts CallMsg).
 *
 * Rules (from AGENTS.md): crowd counts are honest counts (rate-decay per
 * anonId, clamp bursts); no probabilities are ever derived from crowd data;
 * secrets only via env / .secrets — never committed; every input rate-limited;
 * kill-switch env flags for pulse/rooms.
 *
 * Weekend scale = demo scale: in-memory state + periodic JSON snapshots is
 * fine. Scale path (Redis) is documented in docs/ARCHITECTURE.md, not built.
 */
import type { ClientMsg, ServerMsg } from '@contracts/crowd';

// placeholder types-touch so the contract stays wired while L2 lands
const _wired: (m: ClientMsg | ServerMsg) => string = (m) => m.type;
void _wired;

console.log('[stands] skeleton alive — L2 lane builds here.');
