/**
 * Small shared helpers: sleep + a poll-until-condition loop used throughout
 * the canary to wait for a real signal (a WS frame, a DOM class, a presence
 * count) instead of guessing a fixed delay.
 */

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `snapshotFn()` (async) every `pollMs` until `predicate(snapshot)`
 * returns a truthy value, or `timeoutMs` elapses. Returns
 * `{ ok, value, elapsedMs, last }` — `value` is whatever the predicate
 * returned (truthy), never a boolean-only signal, so callers can pull the
 * matched frame/state straight out of the wait.
 */
export async function waitFor(snapshotFn, predicate, { timeoutMs = 5000, pollMs = 150 } = {}) {
  const start = Date.now();
  let last;
  for (;;) {
    last = await snapshotFn();
    const hit = predicate(last);
    if (hit) return { ok: true, value: hit, elapsedMs: Date.now() - start, last };
    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) return { ok: false, value: null, elapsedMs: elapsed, last };
    await sleep(pollMs);
  }
}

export function short(id, n = 10) {
  return typeof id === 'string' ? id.slice(0, n) : String(id);
}
