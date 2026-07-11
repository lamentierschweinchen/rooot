/**
 * The one mechanism nearly everything else in this canary is built on: a
 * WebSocket-wrapping init script installed via `context.addInitScript` BEFORE
 * any page script runs (so it sees every connection stands-adapter.js /
 * loom-adapter.js ever open, from the very first frame).
 *
 * It gives us two things, both required by task-5-brief.md:
 *
 *  1. VISIBILITY: every page (gate/ground/terrace/woven-loom/cabinet) only
 *     exposes a narrow, curated `window.__stands` view (no `presence` field,
 *     no raw ledger/status/odds). The lens-switch / late-join / full-time /
 *     market assertions all need fields the adapters never surface, so we
 *     read the RAW frames instead of trusting each surface's own callback
 *     API. Logged into `window.__canary.{sends,received,opens,closes,...}`.
 *
 *  2. ENFORCEMENT (binding constraint, not convention): in smoke mode,
 *     `enforceAllowlist` makes every outgoing `send()` check the frame's
 *     `type` before the native WebSocket ever sees it — a disallowed frame
 *     (predict/cheer/react/momentReact/call, or hello WITH a side) is
 *     recorded and DROPPED, never reaching the network. And in both modes,
 *     `wsHost` pins the only host a real connection may reach — anything
 *     else (e.g. a page whose own script forgot to forward `?ws=`, see
 *     README "the ws override gap") gets a stub that never opens a socket.
 *
 * This function is passed to Playwright's `context.addInitScript(fn, arg)`,
 * which stringifies it and evaluates it in the page BEFORE any other script.
 * It must therefore be fully self-contained: no references to anything in
 * this module's outer scope, only to `params` and browser globals.
 */
export function initScript(params) {
  var NativeWebSocket = window.WebSocket;

  var log = {
    connections: [], // every `new WebSocket(url)` attempt: {url, host, atMs, blocked}
    blockedConnections: [], // subset of the above that got the off-target-host stub
    opens: [], // native 'open' events {url, host, atMs}
    closes: [], // native 'close' events {url, host, atMs, code}
    errors: [], // native 'error' events {url, host, atMs}
    sends: [], // frames that reached the real native send() {url, host, type, raw, atMs}
    blockedSends: [], // frames the allowlist (or the host stub) refused {..., reason}
    received: [], // every parsed inbound message {url, host, type, data, atMs}
  };
  window.__canary = log;

  // every REAL (non-stubbed) native socket this page ever opened, kept for the
  // reconnect-storm check (scripts/canary/reconnect-check.mjs) — additive, unused by
  // full/smoke mode. Lets a test force a real close (simulating "the socket dies under
  // backpressure") and read live concurrency, without touching any adapter's own code.
  var liveHandles = [];
  window.__canary.killLive = function (hostFilter) {
    var n = 0;
    for (var i = 0; i < liveHandles.length; i++) {
      var h = liveHandles[i];
      if (h.real.readyState === 1 && (!hostFilter || h.host === hostFilter)) {
        try { h.real.close(); } catch (e) {}
        n++;
      }
    }
    return n;
  };
  window.__canary.liveCount = function (hostFilter) {
    var n = 0;
    for (var i = 0; i < liveHandles.length; i++) {
      var h = liveHandles[i], rs = h.real.readyState;
      if ((rs === 0 || rs === 1) && (!hostFilter || h.host === hostFilter)) n++;
    }
    return n;
  };

  function hostOf(u) {
    try { return new URL(u, window.location.href).host; } catch (e) { return ''; }
  }

  // Mirrors task-5-brief.md point 3 exactly: hello is the only frame a
  // passive page may ever send, and only without a `side` (root-less
  // presence, indistinguishable from any real visitor loading the page).
  // predict/cheer/react/momentReact/call, and hello-WITH-side, are never
  // allowed — this is the "impossible to pollute real crowd data" guarantee.
  function isAllowedFrame(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type === 'hello') return !msg.side;
    return false;
  }

  function CanaryWebSocket(url, protocols) {
    var urlStr = String(url);
    var host = hostOf(urlStr);
    var offTarget = !!(params.wsHost && host && host !== params.wsHost);

    log.connections.push({ url: urlStr, host: host, atMs: Date.now(), blocked: offTarget });

    if (offTarget) {
      // A page tried to reach a host other than the one we pinned via --ws.
      // This is the safety net for the documented ws-override gap (README):
      // never let a stray connection actually leave the browser.
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
        try { if (typeof stub.onclose === 'function') stub.onclose({ code: 1006, reason: 'canary: off-target host blocked', wasClean: false }); } catch (e) {}
      }, 0);
      return stub;
    }

    var real = new NativeWebSocket(url, protocols);
    liveHandles.push({ real: real, url: urlStr, host: host });
    real.addEventListener('open', function () { log.opens.push({ url: urlStr, host: host, atMs: Date.now() }); });
    real.addEventListener('close', function (ev) { log.closes.push({ url: urlStr, host: host, atMs: Date.now(), code: ev && ev.code }); });
    real.addEventListener('error', function () { log.errors.push({ url: urlStr, host: host, atMs: Date.now() }); });
    real.addEventListener('message', function (ev) {
      var parsed = null;
      try { parsed = JSON.parse(ev.data); } catch (e) { /* non-JSON frame: logged as null data */ }
      log.received.push({ url: urlStr, host: host, type: parsed && parsed.type, data: parsed, atMs: Date.now() });
    });

    // A Proxy so every property/method (readyState, onopen=, .close(), ...)
    // transparently forwards to the real socket except `send`, which we
    // intercept to log + (in smoke mode) enforce the allowlist BEFORE the
    // native call. This is a hard block, not an after-the-fact observation:
    // a disallowed frame's `target.send(data)` is simply never reached.
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
              raw: typeof data === 'string' ? data.slice(0, 4000) : '[non-string frame]',
              atMs: Date.now(),
            };
            if (params.enforceAllowlist && !isAllowedFrame(parsed)) {
              rec.reason = 'not-in-smoke-allowlist';
              log.blockedSends.push(rec);
              return undefined; // hard block: native send() is never called
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
  CanaryWebSocket.prototype = NativeWebSocket.prototype;
  CanaryWebSocket.CONNECTING = 0;
  CanaryWebSocket.OPEN = 1;
  CanaryWebSocket.CLOSING = 2;
  CanaryWebSocket.CLOSED = 3;

  try {
    Object.defineProperty(window, 'WebSocket', { value: CanaryWebSocket, writable: true, configurable: true });
  } catch (e) {
    window.WebSocket = CanaryWebSocket;
  }
}

/** Node-side mirror of the browser allowlist, used only for our own
 * post-hoc sanity assertion in smoke mode (belt-and-suspenders check that
 * everything which DID reach the network — `log.sends` — really was
 * allowed; the in-page guard above is the actual enforcement). Keep in sync
 * with `isAllowedFrame` inside initScript(). */
export function isAllowedFrame(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.type === 'hello') return !msg.side;
  return false;
}

const EMPTY_LOG = Object.freeze({
  connections: [], blockedConnections: [], opens: [], closes: [], errors: [], sends: [], blockedSends: [], received: [],
});

/** Read the accumulated `window.__canary` log from a page. Safe to call even
 * if the page never loaded our init script (e.g. it crashed/never navigated
 * anywhere) -- returns an empty-shaped log rather than throwing. */
export async function readLog(page) {
  try {
    return await page.evaluate(() => window.__canary);
  } catch {
    return EMPTY_LOG;
  }
}

export function lastOfType(log, type) {
  for (let i = log.received.length - 1; i >= 0; i--) {
    if (log.received[i].type === type) return log.received[i];
  }
  return null;
}
