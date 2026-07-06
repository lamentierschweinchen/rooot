/**
 * Backtest the live-stats derivation through the REAL parser (contracts/normalize):
 * feeds recorded score streams through parseSpell + parseLedgerMessage (with the
 * FreeKickType change) and aggregates exactly as stats-adapter.js will, so we can
 * confirm possession % / offsides / shot-outcomes match ground truth BEFORE the
 * normalize change is deployed to the live ingest. Run:
 *   npx tsx scripts/backtest-stats.ts ../../apps/web/public/replay/*.jsonl
 */
import fs from 'node:fs';
import { parseLedgerMessage, parseSpell } from '@contracts/normalize';

function inner(o: any): any { return o && typeof o.data === 'string' ? JSON.parse(o.data) : o; }
function bucket(d: string): string | null {
  if (d === 'ontarget' || d === 'scored') return 'onTarget';
  if (d === 'offtarget' || d === 'missed') return 'offTarget';
  if (d === 'blocked') return 'blocked';
  if (d === 'woodwork' || d.indexOf('post') >= 0 || d.indexOf('bar') >= 0) return 'woodwork';
  return null;
}

for (const fn of process.argv.slice(2)) {
  let p1home = true, possLast: any = null;
  const possTime: any = { home: 0, away: 0 };
  const shotById: any = {}, fkById: any = {};
  for (const line of fs.readFileSync(fn, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let raw: any; try { raw = inner(JSON.parse(line)); } catch { continue; }
    if (raw && typeof raw === 'object') {
      if (typeof raw.Participant1IsHome === 'boolean') p1home = raw.Participant1IsHome;
      else raw.Participant1IsHome = p1home; // give the ledger parser the side truth
    }
    const s = JSON.stringify(raw);
    const sp = parseSpell(s, Date.now(), 'replay', p1home);
    if (sp && typeof sp.clockSeconds === 'number') {
      if (possLast) { const dd = sp.clockSeconds - possLast.c; if (dd > 0 && dd < 120) possTime[possLast.side] += dd; }
      possLast = { side: sp.side, c: sp.clockSeconds };
    }
    const lm = parseLedgerMessage(s, Date.now(), 'replay');
    if (lm && lm.type === 'event') {
      const ev = lm.ev, k = ev.kind, side = ev.side, id = ev.id, d = (ev.detail || '').toLowerCase();
      if (k === 'shot' && side) shotById[id] = { side, oc: bucket(d) };
      if (k === 'free-kick' && side) fkById[id] = { side, type: d };
    }
  }
  const tot = possTime.home + possTime.away || 1;
  const off: any = { home: 0, away: 0 };
  const sh: any = { home: { total: 0, onTarget: 0, offTarget: 0, blocked: 0, woodwork: 0 }, away: { total: 0, onTarget: 0, offTarget: 0, blocked: 0, woodwork: 0 } };
  for (const id in fkById) if (fkById[id].type === 'offside') off[fkById[id].side]++;
  for (const id in shotById) { const x = shotById[id]; sh[x.side].total++; if (x.oc) sh[x.side][x.oc]++; }
  console.log(`\n${fn.split('/').pop()}`);
  console.log(`  possession: home ${Math.round(100 * possTime.home / tot)}%  away ${Math.round(100 * possTime.away / tot)}%`);
  console.log(`  offsides:   home ${off.home}  away ${off.away}  (total ${off.home + off.away})`);
  console.log(`  shots home: ${JSON.stringify(sh.home)}`);
  console.log(`  shots away: ${JSON.stringify(sh.away)}`);
}
