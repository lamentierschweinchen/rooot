/** Small shared helpers for the footage rig. */

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Race `promise` against a timeout; on timeout resolve with `fallback`
 * instead of hanging forever (used to read the in-page tap off a possibly
 * hung page without stalling segment finalization). */
export function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, sleep(ms).then(() => fallback)]);
}

/** Wall-clock stamp that is safe in a filename: 2026-07-11T21-00-13Z. */
export function safeStamp(d = new Date()) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

/** Filesystem-safe event tag for segment filenames. */
export function sanitizeTag(tag) {
  return String(tag ?? 'seg').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'seg';
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return String(n);
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)}GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${n}B`;
}
