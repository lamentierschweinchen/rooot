/**
 * Verify the new stat families end-to-end: parse a recording through the REAL
 * parser (with the lineups roster) and aggregate exactly as stats-adapter.js does.
 * Run: cd services/stands && npx tsx scripts/repro-families.ts [file.jsonl]
 */
import fs from 'node:fs';
import { parseLedgerMessage, parseLineups } from '@contracts/normalize';

const fn = process.argv[2] || '../../apps/web/public/replay/arg-cpv-20260703.jsonl';
let roster: unknown = undefined;
const subById: Record<string, { side: string; detail: string | null }> = {};
const injById: Record<string, { side: string; player: string | null; outcome: unknown }> = {};
const penById: Record<string, { side: string; outcome: string | null }> = {};
const scById: Record<string, { side: string; name: string | null; type: unknown }> = {};
const varById: Record<string, { kind: string; type?: unknown; outcome?: unknown }> = {};

for (const line of fs.readFileSync(fn, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let outer: { data?: unknown };
  try { outer = JSON.parse(line); } catch { continue; }
  const raw = typeof outer.data === 'string' ? outer.data : line;
  if (raw.includes('"lineups"')) { const r = parseLineups(raw); if (r) roster = r; continue; }
  const lm = parseLedgerMessage(raw, Date.now(), 'replay', roster as never);
  if (!lm || lm.type !== 'event') continue;
  const e = lm.ev; const id = e.id, side = e.side;
  const D = ((e.raw as { Data?: Record<string, unknown> } | undefined)?.Data) || {};
  if (e.kind === 'substitution' && side && id) subById[id] = { side, detail: e.detail ?? null };
  if (e.kind === 'injury' && side && id) injById[id] = { side, player: e.detail ?? null, outcome: D.Outcome };
  if (e.kind === 'penalty-kick' && side && id) penById[id] = { side, outcome: e.detail ?? null };
  if (e.kind === 'goal' && side && id && e.confirmed) scById[id] = { side, name: e.detail ?? null, type: (e as { goalKind?: unknown }).goalKind };
  if (e.kind === 'var' && id) varById[id] = D.Outcome ? { kind: 'end', outcome: D.Outcome } : { kind: 'open', type: D.Type };
}

const sub = { home: 0, away: 0 }, inj = { home: 0, away: 0 };
const pen: Record<string, Record<string, number>> = { home: {}, away: {} };
const sc: Record<string, unknown[]> = { home: [], away: [] };
for (const id in subById) sub[subById[id].side as 'home' | 'away']++;
for (const id in injById) inj[injById[id].side as 'home' | 'away']++;
for (const id in penById) { const p = penById[id]; const o = (p.outcome || '?').toLowerCase(); pen[p.side][o] = (pen[p.side][o] || 0) + 1; }
for (const id in scById) sc[scById[id].side].push({ name: scById[id].name, type: scById[id].type });
const opens: unknown[] = [], ends: unknown[] = [];
for (const id in varById) (varById[id].kind === 'end' ? ends : opens).push(varById[id]);

console.log(fn.split('/').pop());
console.log('  subs:', sub);
console.log('  injuries:', inj);
console.log('  penalties:', JSON.stringify(pen));
console.log('  scorers home:', JSON.stringify(sc.home), '  away:', JSON.stringify(sc.away));
console.log('  VAR opens:', JSON.stringify(opens), '  ends:', JSON.stringify(ends));
