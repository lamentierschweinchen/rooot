// Live feed monitor — watches the ARG-EGY wire through the SAME public WS the site uses.
// Heartbeats to a log; EXITS (re-invoking the agent) on a notable event: kickoff,
// a goal, a status change, or a feed stall. Reconnects through transient WS drops.
import WebSocket from 'ws';

const MATCH = process.argv[2] || '18202701';
const WS = 'wss://rooot-stands.fly.dev/?matchId=' + MATCH;
const MAX_MS = 15 * 60 * 1000;   // re-arm window: exit after 15 min so the agent re-checks
const STALL_MS = 100 * 1000;     // no feed msgs (odds/ledger/score/status) for 100s -> alert

const t0 = Date.now();
let ws, lastFeedMs = Date.now(), reconnects = 0;
let score = null, minute = null, statusPhase = null;
let counts = {}, ledgerKinds = {}, kicked = false;
let hbTimer, stallTimer;

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
  ws.on('open', () => { console.log(`[+${((Date.now()-t0)/1000).toFixed(0)}s] WS open -> ${MATCH}`); });
  ws.on('message', (d) => {
    let m; try { m = JSON.parse(d); } catch { return; }
    // 'stands' = crowd pings (not feed health); everything else is feed
    if (m.type !== 'stands') lastFeedMs = Date.now();
    counts[m.type] = (counts[m.type] || 0) + 1;
    if (m.type === 'score' && m.ev) {
      const ns = [m.ev.home, m.ev.away];
      if (score && (ns[0] !== score[0] || ns[1] !== score[1])) { score = ns; bye(`GOAL — score now ${ns[0]}-${ns[1]} at ${minute}'`); }
      score = ns;
    }
    if (m.ev && typeof m.ev.minute === 'number') {
      minute = m.ev.minute;
      if (!kicked && minute > 0) { kicked = true; bye(`KICKOFF — clock started (min ${minute})`); }
    }
    if (m.type === 'status' && m.ev) {
      const p = m.ev.phase || m.ev.statusId;
      if (p && p !== statusPhase) { statusPhase = p; bye(`STATUS CHANGE -> ${p}`); }
    }
    if (m.type === 'ledger' && m.msg && m.msg.ev) {
      const k = m.msg.ev.kind; ledgerKinds[k] = (ledgerKinds[k] || 0) + 1;
      if (['goal','yellow-card','red-card','penalty-kick','var','substitution'].includes(k)) bye(`LEDGER: ${k} @ ${m.msg.ev.minute}'`);
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
