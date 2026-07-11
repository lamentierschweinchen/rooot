/**
 * The rig's own timeline watcher: ONE raw WebSocket into the stands service,
 * seated read-only into the match room by `?matchId=` (services/stands
 * src/server.ts seats feed-only sockets from the URL -- watching a match is
 * public; no hello, no crowd identity, no presence claim).
 *
 * READ-ONLY BY CONSTRUCTION: this module contains no `send` call of any kind
 * -- grep it. It cannot write to production because the code to do so does
 * not exist here (the same posture as the canary's `openObserver` with
 * `hello: false`, scripts/canary/lib/rawWs.mjs).
 *
 * Reconnect discipline mirrors the app's own adapters (single-flight, 1s->30s
 * backoff that only resets after a connection stayed open >=5s, plus a
 * never-opened watchdog) so the watcher survives a full unattended match.
 */
import WebSocket from 'ws';

export function startWatcher({ wsBase, matchId, onMsg, onLifecycle = () => {} }) {
  const sep = wsBase.includes('?') ? '&' : '?';
  const url = `${wsBase}${sep}matchId=${encodeURIComponent(matchId)}`;

  let closed = false;
  let sock = null;
  let backoff = 1000;
  let openedAtMs = 0;
  let reconnectTimer = null;
  let openWatchdog = null;

  function scheduleReconnect() {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, backoff);
  }

  function connect() {
    if (closed) return;
    try {
      sock = new WebSocket(url);
    } catch (err) {
      onLifecycle('error', { err: String((err && err.message) || err) });
      backoff = Math.min(backoff * 2, 30_000);
      scheduleReconnect();
      return;
    }
    // never-opens watchdog: a socket can sit forever without firing open OR
    // close on a flaky network; terminate() forces the close path below.
    openWatchdog = setTimeout(() => {
      openWatchdog = null;
      try { sock.terminate(); } catch { /* already dead */ }
    }, 15_000);

    sock.on('open', () => {
      if (openWatchdog) { clearTimeout(openWatchdog); openWatchdog = null; }
      openedAtMs = Date.now();
      onLifecycle('open', { url });
    });
    sock.on('message', (data) => {
      let parsed = null;
      try { parsed = JSON.parse(data.toString()); } catch { return; } // non-JSON frame: not ours to guess at
      onMsg(parsed);
    });
    sock.on('close', (code) => {
      if (openWatchdog) { clearTimeout(openWatchdog); openWatchdog = null; }
      if (closed) return;
      const stayedOpen = openedAtMs > 0 && Date.now() - openedAtMs >= 5000;
      backoff = stayedOpen ? 1000 : Math.min(backoff * 2, 30_000);
      openedAtMs = 0;
      onLifecycle('closed', { code, retryInMs: backoff });
      scheduleReconnect();
    });
    sock.on('error', (err) => {
      onLifecycle('error', { err: String((err && err.message) || err) });
      try { sock.close(); } catch { /* close path handles the rest */ }
    });
  }

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (openWatchdog) { clearTimeout(openWatchdog); openWatchdog = null; }
      try { if (sock) sock.close(); } catch { /* already closed */ }
    },
  };
}
