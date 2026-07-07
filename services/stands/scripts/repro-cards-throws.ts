/**
 * Verify cards (with names) + throw-ins end-to-end: parse a recording through the
 * REAL parser (with the lineups roster) and aggregate EXACTLY as stats-adapter.js does
 * (id-keyed upgrade for cards so a late name-carrying re-emit upgrades in place; distinct-id
 * count for throw-ins). Proves the two fields the stadium handoff asked for.
 * Run: cd services/stands && npx tsx scripts/repro-cards-throws.ts [file.jsonl]
 */
import fs from 'node:fs';
import { parseLedgerMessage, parseLineups } from '@contracts/normalize';

const fn = process.argv[2] || '../../apps/web/public/replay/par-fra-20260704.jsonl';
let roster: unknown = undefined;
const cardById: Record<string, { side: string; type: 'Yellow' | 'Red'; player: string | null; minute: number | null }> = {};
const throwById: Record<string, string> = {};
let cardEmits = 0, throwEmits = 0;

for (const line of fs.readFileSync(fn, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let outer: { data?: unknown };
  try { outer = JSON.parse(line); } catch { continue; }
  const raw = typeof outer.data === 'string' ? outer.data : line;
  if (raw.includes('"lineups"')) { const r = parseLineups(raw); if (r) roster = r; continue; }
  const lm = parseLedgerMessage(raw, Date.now(), 'replay', roster as never);
  if (!lm || lm.type !== 'event') continue;
  const e = lm.ev; const id = e.id, side = e.side;
  if ((e.kind === 'yellow-card' || e.kind === 'red-card') && side && id) {
    cardEmits++;
    const pc = cardById[id];
    cardById[id] = { side, type: e.kind === 'red-card' ? 'Red' : 'Yellow', player: (e.detail ?? (pc && pc.player) ?? null), minute: e.minute };
  }
  if (e.kind === 'throw-in' && side && id) { throwEmits++; throwById[id] = side; }
}

const cards: Record<string, { yellow: number; red: number; list: unknown[] }> = {
  home: { yellow: 0, red: 0, list: [] }, away: { yellow: 0, red: 0, list: [] },
};
for (const id in cardById) { const c = cardById[id]; const sd = cards[c.side];
  if (c.type === 'Red') sd.red++; else sd.yellow++;
  sd.list.push({ player: c.player, type: c.type, minute: c.minute }); }
const throwIns = { home: 0, away: 0 };
for (const id in throwById) throwIns[throwById[id] as 'home' | 'away']++;

console.log(fn.split('/').pop());
console.log(`  card emissions: ${cardEmits}  →  distinct cards: ${Object.keys(cardById).length}`);
console.log('  cards home:', JSON.stringify(cards.home));
console.log('  cards away:', JSON.stringify(cards.away));
const named = Object.values(cardById).filter((c) => c.player).length;
console.log(`  cards with a resolved name: ${named}/${Object.keys(cardById).length}`);
console.log(`  throw emissions: ${throwEmits}  →  distinct throw-ins: ${Object.keys(throwById).length}`);
console.log('  throwIns:', JSON.stringify(throwIns));
