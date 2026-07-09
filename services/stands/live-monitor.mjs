// Live feed monitor — watches a match wire through the SAME public WS the site uses.
// Pass the fixture id as argv (e.g. `node live-monitor.mjs 18209181`). Heartbeats to a
// log; EXITS (re-invoking the agent) on a notable event: kickoff, a score change, a
// status change, a dramatic ledger event (red/pen/VAR), or a feed stall. Reconnects
// through transient WS drops; ignores the join-snapshot's replayed events on connect.
import WebSocket from 'ws';

const MATCH = process.argv[2] || '18209181';
const WS = 'wss://rooot-stands.fly.dev/?matchId=' + MATCH;
const MAX_MS = 15 * 60 * 1000;   // re-arm window: exit after 15 min so the agent re-checks
const STALL_MS = 100 * 1000;     // no feed msgs (odds/ledger/score/status) for 100s -> alert

const t0 = Date.now();
let ws, lastFeedMs = Date.now(), reconnects = 0;
let score = null, minute = null, statusPhase = null;
let counts = {}, ledgerKinds = {}, kicked = false;
let hbTimer, stallTimer, openedAt = Date.now(); // the join-snapshot replays recent events on connect — ignore ledger alerts in that first burst

function fmt() {
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  return `[+${el}s] score=${JSON.stringify(score)} min=${minute} status=${statusPhase} `
    + `counts=${JSON.stringify(counts)} ledger=${JSON.stringify(ledgerKinds)} reconnects=${reconnects}`;
}
function bye(reason) {
  clearInterval(hbTimer); clearInterval(stallTimer);
  try { ws && ws.close(); } catch {}
  console.log(`\n=== MONITOR EXIT: ${reason} ===`);
  console.log(fmt());
  process.exit(0);
}

function connect() {
  ws = new WebSocket(WS);
  ws.on('open', () => { openedAt = Date.now(); console.log(`[+${((Date.now()-t0)/1000).toFixed(0)}s] WS open -> ${MATCH}`); });
  ws.on('message', (d) => {
    let m; try { m = JSON.parse(d); } catch { return; }
    // 'stands' = crowd pings (not feed health); everything else is feed
    if (m.type !== 'stands') lastFeedMs = Date.now();
    counts[m.type] = (counts[m.type] || 0) + 1;
    if (m.type === 'score' && m.ev) {
      const ns = [m.ev.home, m.ev.away];
      // seed the join score silently; only alert on a real CHANGE afterward (goal / chalk-off)
      if (score !== null && (ns[0] !== score[0] || ns[1] !== score[1])) { const p = score; score = ns; bye(`SCORE CHANGE ${p[0]}-${p[1]} -> ${ns[0]}-${ns[1]} at ${minute}'`); }
      score = ns;
    }
    if (m.ev && typeof m.ev.minute === 'number') {
      minute = m.ev.minute;
      // only a REAL fresh kickoff is notable; joining an in-progress match at min N is not
      if (!kicked && minute > 0) { kicked = true; if (minute < 3) bye(`KICKOFF — clock started (min ${minute})`); }
    }
    if (m.type === 'status' && m.ev) {
      const p = m.ev.phase || m.ev.statusId;
      // seed the join-snapshot status silently; only alert on a REAL later change (HT/FT/ET)
      if (p && p !== statusPhase) { const seed = statusPhase === null; statusPhase = p; if (!seed) bye(`STATUS CHANGE -> ${p}`); }
    }
    if (m.type === 'ledger' && m.msg && m.msg.ev) {
      const k = m.msg.ev.kind; ledgerKinds[k] = (ledgerKinds[k] || 0) + 1;
      // alert only on the dramatic ones — not every sub/yellow/possession (too noisy for a live watch),
      // and never on the seed burst (the join-snapshot replays the latest var/goal on every connect)
      if (Date.now() - openedAt > 3000 && ['red-card','penalty-kick','var'].includes(k)) bye(`LEDGER: ${k} @ ${m.msg.ev.minute}'`);
    }
  });
  ws.on('close', () => { reconnects++; setTimeout(connect, 1500); });
  ws.on('error', (e) => { console.log(`[+${((Date.now()-t0)/1000).toFixed(0)}s] WS error: ${e.message}`); });
}

connect();
hbTimer = setInterval(() => console.log(fmt()), 30000);
stallTimer = setInterval(() => {
  if (Date.now() - lastFeedMs > STALL_MS) bye(`FEED STALL — no feed msg for ${((Date.now()-lastFeedMs)/1000).toFixed(0)}s (last score=${JSON.stringify(score)})`);
  if (Date.now() - t0 > MAX_MS) bye('re-arm window elapsed (15 min) — feed healthy, re-check');
}, 5000);
