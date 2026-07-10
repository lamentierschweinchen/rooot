/**
 * A thin raw WebSocket observer (the `ws` package half of this canary's
 * "playwright + ws" toolkit). Used where a real browser page isn't the right
 * tool:
 *
 *  - a read-only "feed" observer opened for the whole run, watching for
 *    market ticks and the first confirmed goal without ever sending a byte
 *    (not even a hello) — decoupled from browser page navigation, which
 *    resets `window.__canary` on every goto();
 *  - the lens-switch step's second "extra socket" for fan A: a raw
 *    connection sharing A's real anonId/side, standing in for the socket
 *    ground.html's own lens iframe would spawn in production (see README
 *    "the ws override gap" for why we don't rely on the iframe itself
 *    locally).
 *
 * Every helper here is read-only by default (`hello: false`) or sends
 * exactly one explicit, deliberate hello — never used in smoke mode.
 */
import WebSocket from 'ws';

export function openObserver(wsUrl, matchId, { anonId, side, hello = false } = {}) {
  const sep = wsUrl.includes('?') ? '&' : '?';
  const url = `${wsUrl}${sep}matchId=${encodeURIComponent(matchId)}`;
  const received = [];
  const sent = [];
  const state = { openedAt: null, closedAt: null, error: null };

  const sock = new WebSocket(url);

  const openWaiters = [];
  sock.on('open', () => {
    state.openedAt = Date.now();
    if (hello) {
      const msg = { type: 'hello', matchId, anonId, side: side || undefined };
      sock.send(JSON.stringify(msg));
      sent.push({ atMs: Date.now(), msg });
    }
    for (const w of openWaiters.splice(0)) w.resolve(true);
  });
  sock.on('message', (data) => {
    let parsed = null;
    try { parsed = JSON.parse(data.toString()); } catch { /* non-JSON frame, kept as null */ }
    received.push({ atMs: Date.now(), type: parsed && parsed.type, data: parsed });
  });
  sock.on('close', () => { state.closedAt = Date.now(); });
  sock.on('error', (err) => {
    state.error = String((err && err.message) || err);
    for (const w of openWaiters.splice(0)) w.reject(err);
  });

  return {
    url,
    received,
    sent,
    state,
    send(msg) {
      sock.send(JSON.stringify(msg));
      sent.push({ atMs: Date.now(), msg });
    },
    close() {
      try { sock.close(); } catch { /* already closed */ }
    },
    waitOpen(timeoutMs = 5000) {
      if (state.openedAt) return Promise.resolve(true);
      if (state.error) return Promise.reject(new Error(state.error));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`raw ws observer did not open within ${timeoutMs}ms (${url})`)), timeoutMs);
        openWaiters.push({
          resolve: (v) => { clearTimeout(timer); resolve(v); },
          reject: (e) => { clearTimeout(timer); reject(e); },
        });
      });
    },
  };
}
