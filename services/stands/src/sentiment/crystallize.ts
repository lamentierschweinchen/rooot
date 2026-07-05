/**
 * Crystallize SentimentRecords from the vaulted replay bundles — a real,
 * kept dataset (data/sentiment/*.json) + the tournament fingerprint fold.
 * Run:  npx tsx src/sentiment/crystallize.ts   (from services/stands)
 *
 * Crowd sections are empty (n=0) — no fans watched the captures; honest, not
 * synthesized. BET + HAPPEN are fully real. Live matches (via the service) will
 * carry real crowd sentiment; this proves the market/reality half + the fold.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseOddsMessage, parseStatusMessage, parseScoreMessage, parseLedgerMessage } from '@contracts/normalize';
import { summarizeMarket, assembleSentimentRecord, foldFingerprints, type MarketPoint } from './builder';
import type { MatchPhase } from '@contracts/match';
import type { LedgerEvent } from '@contracts/ledger';
import type { SentimentRecord } from '@contracts/sentiment';

interface MatchDef {
  fixtureId: number;
  bundle: string;
  date: string;
  home: { code: string; name: string; colors: readonly [string, string] };
  away: { code: string; name: string; colors: readonly [string, string] };
}

const MATCHES: MatchDef[] = [
  { fixtureId: 18175918, bundle: 'arg-cpv-20260703.jsonl', date: '2026-07-03', home: { code: 'ARG', name: 'Argentina', colors: ['#75AADB', '#F6B40E'] }, away: { code: 'CPV', name: 'Cape Verde', colors: ['#003893', '#CF2027'] } },
  { fixtureId: 18179549, bundle: 'col-gha-20260704.jsonl', date: '2026-07-04', home: { code: 'COL', name: 'Colombia', colors: ['#FCD116', '#003893'] }, away: { code: 'GHA', name: 'Ghana', colors: ['#006B3F', '#CE1126'] } },
  { fixtureId: 18185036, bundle: 'can-mar-20260704.jsonl', date: '2026-07-04', home: { code: 'CAN', name: 'Canada', colors: ['#FF0000', '#FFFFFF'] }, away: { code: 'MAR', name: 'Morocco', colors: ['#C1272D', '#006233'] } },
  { fixtureId: 18188721, bundle: 'par-fra-20260704.jsonl', date: '2026-07-04', home: { code: 'PAR', name: 'Paraguay', colors: ['#D52B1E', '#0038A8'] }, away: { code: 'FRA', name: 'France', colors: ['#002395', '#ED2939'] } },
];

const REPLAY_DIR = '../../apps/web/public/replay/';
const OUT_DIR = '../../data/sentiment/';

function crystallize(def: MatchDef): SentimentRecord {
  const lines = readFileSync(REPLAY_DIR + def.bundle, 'utf8').trim().split('\n');
  const pts: MarketPoint[] = [];
  const etPts: MarketPoint[] = [];
  const phaseSnaps: Array<{ phase: MatchPhase; belief: { home: number; draw: number; away: number } }> = [];
  const phasePath: MatchPhase[] = [];
  const events: LedgerEvent[] = [];
  let minute: number | null = null, lastBelief: { home: number; draw: number; away: number } | null = null;
  let fh = 0, fa = 0, fromMs = Infinity, toMs = 0;

  for (const l of lines) {
    let rec: { receivedAtMs: number; event: string; data: string };
    try { rec = JSON.parse(l) as typeof rec; } catch { continue; }
    if (typeof rec.data !== 'string') continue;
    fromMs = Math.min(fromMs, rec.receivedAtMs); toMs = Math.max(toMs, rec.receivedAtMs);
    const st = parseStatusMessage(rec.data, rec.receivedAtMs, 'replay');
    if (st && (st.raw as { FixtureId?: number })?.FixtureId === def.fixtureId) {
      if (st.minute != null) minute = st.minute;
      if (phasePath[phasePath.length - 1] !== st.phase) { phasePath.push(st.phase); if (lastBelief) phaseSnaps.push({ phase: st.phase, belief: lastBelief }); }
    }
    const sc = parseScoreMessage(rec.data, rec.receivedAtMs, 'replay');
    if (sc && (sc.raw as { FixtureId?: number })?.FixtureId === def.fixtureId) { fh = sc.home; fa = sc.away; if (sc.minute != null) minute = sc.minute; }
    const lm = parseLedgerMessage(rec.data, rec.receivedAtMs, 'replay');
    if (lm?.type === 'event' && lm.ev.id.startsWith(String(def.fixtureId))) {
      if (lm.ev.minute != null) minute = lm.ev.minute;
      if (['goal', 'yellow-card', 'red-card', 'var', 'shot', 'corner', 'penalty-kick'].includes(lm.ev.kind)) events.push(lm.ev);
    }
    try {
      const e = JSON.parse(rec.data) as { FixtureId?: number; SuperOddsType?: string; MarketPeriod?: string | null; Pct?: unknown[] };
      if (e.FixtureId === def.fixtureId && e.SuperOddsType === '1X2_PARTICIPANT_RESULT') {
        const isFull = e.MarketPeriod == null, isEt = e.MarketPeriod === 'et';
        if (isFull || isEt) {
          const bucket = isFull ? pts : etPts;
          if (!e.Pct || e.Pct.length === 0) bucket.push({ minute, triple: null });
          else {
            const t = parseOddsMessage(rec.data, rec.receivedAtMs, 'replay', true, isFull ? 'full' : 'et');
            if (t) { const b = { home: t.pHome, draw: t.pDraw, away: t.pAway }; if (isFull) lastBelief = b; bucket.push({ minute, triple: b }); }
          }
        }
      }
    } catch { /* not odds */ }
  }

  const market = summarizeMarket(pts, phaseSnaps, etPts);
  const fans = { rootedAtLock: { home: 0, away: 0 }, consensus: null, optimismGap: { home: 0, away: 0 }, doubters: { home: 0, away: 0 }, calls: { total: 0, proved: 0, failed: 0, bravestProved: null }, faith: { home: 0, away: 0 } };
  const feel = { moments: [], roar: { peak: null, total: { home: 0, away: 0 } }, volatility: 0 };
  return assembleSentimentRecord({
    matchId: String(def.fixtureId),
    fixture: { home: def.home, away: def.away, competition: 'World Cup', dateISO: def.date },
    finalScore: { home: fh, away: fa }, phasePath, market, fans, feel, events,
    edition: { serial: 1, editionSize: null, caption: `${def.home.code} · ${def.away.code} · ${def.date}` },
    capture: { fromMs, toMs }, network: 'devnet', txlineRefs: [], attendeeRoot: null,
  });
}

mkdirSync(OUT_DIR, { recursive: true });
const records: SentimentRecord[] = [];
for (const def of MATCHES) {
  const r = crystallize(def);
  writeFileSync(`${OUT_DIR}${r.matchId}.json`, JSON.stringify(r, null, 2));
  records.push(r);
  console.log(`✓ ${r.matchId}  ${r.headline}`);
  console.log(`    market: ${r.market.ticks} ticks · ${r.market.swings.length} swings · vol ${r.market.volatility.toFixed(1)} · upset ${r.divergence.upsetIndex.toFixed(2)}`);
}
const fold = foldFingerprints(records);
const fp = Object.fromEntries(fold);
writeFileSync(`${OUT_DIR}fingerprints.json`, JSON.stringify(fp, null, 2));
console.log(`\n${records.length} records → ${OUT_DIR} · ${fold.size} fanbases in the fingerprint fold`);
