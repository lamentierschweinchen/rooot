/**
 * Crowd honesty primitives — the math behind "the roar measures crowd breadth,
 * not one thumb with a macro" (contracts/crowd.ts doc comment).
 *
 * Two decayed structures:
 *  - TokenBucket: per-anonId cheer throttle. Caps how fast one user's taps can
 *    register, so a single client can't out-cheer a whole end.
 *  - RollingCounter: per-side, per-kind windowed count (cheers/sec roar, and
 *    the 60s pulse react counts) — a ring buffer bucketed by wall-clock second.
 *
 * Both are pure and unit-testable in isolation from the WS plumbing.
 */

/** Sustained ~3 cheers/sec, burst up to 8 before the bucket empties. */
export const CHEER_BUCKET_CAPACITY = 8;
export const CHEER_REFILL_PER_SEC = 3;
/** Server clamp on a single batched cheer message. */
export const CHEER_MAX_BATCH = 10;
/** Roar = decayed cheers/sec over this rolling window. */
export const ROAR_WINDOW_MS = 3_000;
/** Pulse react counts over this rolling window. */
export const PULSE_WINDOW_MS = 60_000;
/** One react of a given kind per user per second, max. */
export const REACT_MIN_INTERVAL_MS = 1_000;

/* ── REACT / the Pulse — drama moments (docs/MECHANISMS.md §4) ─────────── */
/** How long a drama window stays open for feelings (~25s per spec). */
export const REACT_WINDOW_MS = 25_000;
/** After a window closes, SOFT triggers (swing/near-miss) are suppressed this
 * long — a goal's own swing shouldn't immediately re-open a swing moment. Hard
 * events (goal/red/VAR/full-time) ignore the cooldown and supersede. */
export const MOMENT_COOLDOWN_MS = 15_000;
/** A market lurch this large (max single-leg move, 0..1) with no event to pin
 * it on opens a standalone `swing` moment. */
export const SWING_DELTA_MIN = 0.12;
/** Swing detection compares the CURRENT tick against the OLDEST tick still
 * inside this rolling window (not the immediately-previous tick) — a
 * human-meaningful span of market movement, not an artifact of feed tick
 * rate. Folded fix (tonight-gate): a consecutive-tick comparison is invisible
 * on a high-frequency feed (79 ticks/10s observed live, Jul 10 ESP-BEL) —
 * each step is a fraction of a percent even while the market moved 60%→97%
 * over the match, so SWING_DELTA_MIN was never crossed by any single step.
 * 60–90s per spec; 75s splits the difference. */
export const SWING_WINDOW_MS = 75_000;

/**
 * Token bucket: `take(n, now)` returns how many of the requested n tokens
 * were actually available (0..n), and drains that many. Refills continuously
 * based on elapsed time, so bursty-but-honest cheering is allowed while a
 * macro'd thumb gets clamped to the sustained rate.
 */
export class TokenBucket {
  private tokens: number;
  private lastMs: number;

  constructor(
    private readonly capacity = CHEER_BUCKET_CAPACITY,
    private readonly refillPerSec = CHEER_REFILL_PER_SEC,
    nowMs = Date.now(),
  ) {
    this.tokens = capacity;
    this.lastMs = nowMs;
  }

  private refill(nowMs: number): void {
    const elapsedSec = Math.max(0, nowMs - this.lastMs) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    this.lastMs = nowMs;
  }

  /** Returns the number of tokens actually granted (0..min(n, capacity)). */
  take(n: number, nowMs = Date.now()): number {
    this.refill(nowMs);
    const granted = Math.max(0, Math.min(n, Math.floor(this.tokens)));
    this.tokens -= granted;
    return granted;
  }
}

/**
 * Rolling event counter bucketed to the second. Used for both the 3s roar
 * window (events = decayed cheer tokens) and the 60s pulse window (events =
 * accepted reacts). `add` records `count` events at `nowMs`; `rate`/`sum`
 * read back over the window, discarding buckets that have aged out.
 */
export class RollingCounter {
  private readonly buckets = new Map<number, number>();

  constructor(private readonly windowMs: number) {}

  private bucketKey(ms: number): number {
    return Math.floor(ms / 1000);
  }

  private prune(nowMs: number): void {
    const cutoff = this.bucketKey(nowMs - this.windowMs);
    for (const key of this.buckets.keys()) {
      if (key < cutoff) this.buckets.delete(key);
    }
  }

  add(count: number, nowMs = Date.now()): void {
    if (count <= 0) return;
    this.prune(nowMs);
    const key = this.bucketKey(nowMs);
    this.buckets.set(key, (this.buckets.get(key) ?? 0) + count);
  }

  /** Total events currently inside the window. */
  sum(nowMs = Date.now()): number {
    this.prune(nowMs);
    let total = 0;
    for (const v of this.buckets.values()) total += v;
    return total;
  }

  /** Events/sec averaged over the window — the "roar". */
  rate(nowMs = Date.now()): number {
    return this.sum(nowMs) / (this.windowMs / 1000);
  }

  /** True once every bucket has aged out — safe to garbage-collect. */
  isEmpty(nowMs = Date.now()): boolean {
    this.prune(nowMs);
    return this.buckets.size === 0;
  }
}
