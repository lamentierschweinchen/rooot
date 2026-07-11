/**
 * The write-proof discipline, ADAPTED FROM scripts/canary/lib/wsTap.mjs (the
 * canary's smoke-mode tap -- the reference implementation of "provably
 * write-free against production"). Installed via `context.addInitScript`
 * BEFORE any page script runs, in every recorded page and iframe, so it sees
 * every WebSocket the app's adapters ever open.
 *
 * Two guarantees, both enforced in code rather than by convention:
 *
 *  1. ALLOWLIST (enforceAllowlist): every outgoing `send()` is checked before
 *     the native WebSocket ever sees it. The ONLY frame a footage page may
 *     emit is a bare `{"type":"hello"}` WITHOUT a `side` -- root-less
 *     presence, indistinguishable from any real visitor loading the page
 *     (exactly the canary smoke allowlist). predict/cheer/react/momentReact/
 *     call, and hello-WITH-side, are recorded into `blockedSends` and DROPPED
 *     -- native send() is never called, the frame physically never reaches
 *     the network. The rig also never clicks or types, so in practice nothing
 *     beyond that hello is ever even attempted.
 *
 *  2. HOST PIN (wsHost): the only host a real connection may reach is the one
 *     the rig was pointed at via --ws. Anything else (e.g. an iframe that
 *     didn't inherit a ?ws= override) gets a stub that never opens a socket.
 *
 * Everything is logged into `window.__footage` so each segment's close can
 * report the tap's own accounting as evidence.
 *
 * This function is stringified into the page by Playwright -- it must stay
 * fully self-contained (no outer-scope references, only `params` + browser
 * globals).
 */
export function initScript(params) {
  var NativeWebSocket = window.WebSocket;

  var log = {
    connections: [], // every `new WebSocket(url)` attempt: {url, host, atMs, blocked}
    blockedConnections: [], // subset that got the off-target-host stub
    opens: [], // native 'open' events
    closes: [], // native 'close' events
    errors: [], // native 'error' events
    sends: [], // frames that reached the real native send() {url, host, type, raw, atMs}
    blockedSends: [], // frames the allowlist (or host stub) refused {..., reason}
    received: [], // COUNT ONLY of inbound messages (a full match is ~10k frames; footage doesn't need their bodies)
    receivedCount: 0,
  };
  window.__footage = log;

  function hostOf(u) {
    try { return new URL(u, window.location.href).host; } catch (e) { return ''; }
  }

  // Keep in sync with the canary's isAllowedFrame: hello is the only frame a
  // passive page may ever send, and only WITHOUT a `side` -- the "impossible
  // to pollute real crowd data" guarantee.
  function isAllowedFrame(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type === 'hello') return !msg.side;
    return false;
  }

  function FootageWebSocket(url, protocols) {
    var urlStr = String(url);
    var host = hostOf(urlStr);
    var offTarget = !!(params.wsHost && host && host !== params.wsHost);

    log.connections.push({ url: urlStr, host: host, atMs: Date.now(), blocked: offTarget });

    if (offTarget) {
      log.blockedConnections.push({ url: urlStr, host: host, atMs: Date.now() });
      var stub = {
        url: urlStr,
        readyState: 0,
        onopen: null, onmessage: null, onclose: null, onerror: null,
        send: function () {
          log.blockedSends.push({ url: urlStr, host: host, atMs: Date.now(), reason: 'off-target-host', raw: null, type: null });
        },
        close: function () { stub.readyState = 3; },
        addEventListener: function () {},
        removeEventListener: function () {},
      };
      setTimeout(function () {
        stub.readyState = 3;
        try { if (typeof stub.onerror === 'function') stub.onerror(new Event('error')); } catch (e) {}
        try { if (typeof stub.onclose === 'function') stub.onclose({ code: 1006, reason: 'footage: off-target host blocked', wasClean: false }); } catch (e) {}
      }, 0);
      return stub;
    }

    var real = new NativeWebSocket(url, protocols);
    real.addEventListener('open', function () { log.opens.push({ url: urlStr, host: host, atMs: Date.now() }); });
    real.addEventListener('close', function (ev) { log.closes.push({ url: urlStr, host: host, atMs: Date.now(), code: ev && ev.code }); });
    real.addEventListener('error', function () { log.errors.push({ url: urlStr, host: host, atMs: Date.now() }); });
    real.addEventListener('message', function () { log.receivedCount++; });

    // Proxy: everything forwards to the real socket except `send`, which is
    // intercepted BEFORE the native call -- a hard block, not an observation.
    return new Proxy(real, {
      get: function (target, prop) {
        if (prop === 'send') {
          return function (data) {
            var parsed = null;
            if (typeof data === 'string') { try { parsed = JSON.parse(data); } catch (e) {} }
            var rec = {
              url: urlStr,
              host: host,
              type: parsed && parsed.type,
              data: parsed,
              raw: typeof data === 'string' ? data.slice(0, 2000) : '[non-string frame]',
              atMs: Date.now(),
            };
            if (params.enforceAllowlist && !isAllowedFrame(parsed)) {
              rec.reason = 'not-in-footage-allowlist';
              log.blockedSends.push(rec);
              return undefined; // native send() is never called
            }
            log.sends.push(rec);
            return target.send(data);
          };
        }
        var val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      },
      set: function (target, prop, value) {
        target[prop] = value;
        return true;
      },
    });
  }
  FootageWebSocket.prototype = NativeWebSocket.prototype;
  FootageWebSocket.CONNECTING = 0;
  FootageWebSocket.OPEN = 1;
  FootageWebSocket.CLOSING = 2;
  FootageWebSocket.CLOSED = 3;

  try {
    Object.defineProperty(window, 'WebSocket', { value: FootageWebSocket, writable: true, configurable: true });
  } catch (e) {
    window.WebSocket = FootageWebSocket;
  }
}

/** Node-side mirror of the in-page allowlist -- used for the belt-and-
 * suspenders assertion at segment close (everything that DID reach the
 * network really was an allowed bare hello). Keep in sync with
 * `isAllowedFrame` inside initScript() above. */
export function isAllowedFrame(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.type === 'hello') return !msg.side;
  return false;
}

const EMPTY_TAP = Object.freeze({
  connections: [], blockedConnections: [], opens: [], closes: [], errors: [], sends: [], blockedSends: [], receivedCount: 0,
});

/** Read the accumulated `window.__footage` log from a page. Safe even if the
 * page crashed or never ran the init script -- returns an empty-shaped log. */
export async function readTap(page) {
  try {
    const tap = await page.evaluate(() => window.__footage);
    return tap || EMPTY_TAP;
  } catch {
    return EMPTY_TAP;
  }
}

/** Compact per-segment evidence line: how many frames went out (and of what
 * type), how many were hard-blocked, how many inbound frames were seen. */
export function summarizeTap(tap) {
  if (!tap) return { read: false, sends: 0, blockedSends: 0, blockedConnections: 0, sendTypes: {}, opens: 0, received: 0 };
  const sendTypes = {};
  for (const s of tap.sends) {
    const k = s.type || 'unparsed';
    sendTypes[k] = (sendTypes[k] || 0) + 1;
  }
  return {
    read: true,
    sends: tap.sends.length,
    blockedSends: tap.blockedSends.length,
    blockedConnections: tap.blockedConnections.length,
    sendTypes,
    opens: tap.opens.length,
    received: tap.receivedCount ?? 0,
  };
}
