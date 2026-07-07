/**
 * Repro: run POR-ESP's snapshot envelopes through the REAL parsers to see what
 * the loom actually receives (phase / score / goal events). If these are correct
 * (0-1, SECOND_HALF/FULL_TIME) the bug is downstream in the loom, not normalize.
 * Run: cd services/stands && npx tsx scripts/repro-pores.ts
 */
import fs from 'node:fs';
import { parseStatusMessage, parseScoreMessage, parseLedgerMessage } from '@contracts/normalize';

const tok = JSON.parse(fs.readFileSync('../../.secrets/txline-token.json', 'utf8'));
const H = { Authorization: 'Bearer ' + tok.jwt, 'X-Api-Token': tok.apiToken, Accept: 'application/json' };

const r = await fetch('https://txline-dev.txodds.com/api/scores/snapshot/18198205', { headers: H });
const arr = JSON.parse(await r.text()) as unknown[];
console.log('envelopes:', arr.length);

for (const e of arr) {
  const raw = e && typeof (e as { data?: unknown }).data === 'string' ? (e as { data: string }).data : JSON.stringify(e);
  let env: Record<string, unknown>; try { env = JSON.parse(raw); } catch { continue; }
  const st = parseStatusMessage(raw, Date.now(), 'live');
  const sc = parseScoreMessage(raw, Date.now(), 'live') as { home?: number; away?: number; minute?: number | null } | null;
  const lm = parseLedgerMessage(raw, Date.now(), 'live');
  const out: string[] = [];
  if (st) out.push('STATUS phase=' + st.phase + ' min=' + st.minute);
  if (sc) out.push('SCORE ' + JSON.stringify({ home: sc.home, away: sc.away, min: sc.minute }));
  if (lm && lm.type === 'event' && (lm.ev.kind === 'goal' || lm.ev.kind === 'possible' || lm.ev.kind === 'var'))
    out.push('EVENT ' + lm.ev.kind + (lm.ev.kind === 'goal' ? ' score=' + JSON.stringify(lm.ev.score) + ' conf=' + lm.ev.confirmed : ''));
  const D = env.Data as { StatusId?: number } | undefined;
  if (out.length) console.log('[' + (env.Action ?? '?') + ' St' + (D?.StatusId ?? env.StatusId ?? '-') + '] ' + out.join('  |  '));
}
