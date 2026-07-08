import fs from 'node:fs';
import { parseScoreMessage, parseStatusMessage, parseLedgerMessage, parseOddsMessage } from '../contracts/normalize.ts';
export function toFeed(file) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim(); if (!t) continue;
    let o; try { o = JSON.parse(t); } catch { continue; }
    if (o.event === 'heartbeat') continue;
    const raw = typeof o.data === 'string' ? o.data : JSON.stringify(o.data);
    const at = o.receivedAtMs || 0;
    const sc = parseScoreMessage(raw, at, 'replay'); if (sc) out.push({ type: 'score', ev: sc });
    const stt = parseStatusMessage(raw, at, 'replay'); if (stt) out.push({ type: 'status', ev: stt });
    const led = parseLedgerMessage(raw, at, 'replay'); if (led) out.push({ type: 'ledger', msg: led });
    const od = parseOddsMessage(raw, at, 'replay'); if (od) out.push({ type: 'odds', tick: od });
  }
  return out;
}
