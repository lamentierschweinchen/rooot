/**
 * ROOOT ledger — THE BUILDER (pure, testable, DOM-free).
 *
 * Consumes the two honest streams (onLedger → LedgerMsg, onOdds → OddsTick) and
 * publishes an ordered, readable row list (contracts/ledger.ts is the law):
 *
 *   · REPLACE BY WIRE ID — goals re-emit the same id as they upgrade from
 *     provisional → confirmed; newest envelope for an id wins (never a dup row).
 *   · COLLAPSE DANGER SPELLS — consecutive same-side `danger` events within 90s
 *     fold into ONE row carrying a minute-span label; a break in side or a >90s
 *     gap starts a fresh spell.
 *   · AMEND / DISCARD MATCHING — the wire has no id pointer for retro-edits, so
 *     we match on (kind, original Clock.Seconds, side), newest-wins, exactly as
 *     contracts/ledger.ts documents. An amend re-describes in place; a discard
 *     marks the row struck (it is NEVER removed — the ledger is a record).
 *   · SWING CORRELATION — for each story row we look for the market's move
 *     around its moment: before = the last tick at-or-before the event tMs,
 *     after = the first tick at-or-after tMs + SETTLE_MS. Both are REAL observed
 *     ticks; the swing is absent (undefined) until the settled read exists, and
 *     absent forever if the market never spoke in the window. Devnet StablePrice
 *     lags the scores wire ~60s, so the settle window is generous (150s) — the
 *     pair we publish is still two real ticks, the lag is documented, nothing is
 *     interpolated or shifted.
 *
 * The builder holds a raw event map (id → newest LedgerEvent), a pending
 * amend/discard patch list keyed by the match triple, and a bounded ring of
 * odds ticks. On any input it rebuilds the published snapshot (cheap — the
 * fixtures we target are hundreds of events, not millions) and notifies
 * subscribers if the list changed.
 */

import type { LedgerEvent, LedgerKind, LedgerMsg, OddsRead, OddsSwing } from '@contracts/ledger';
import type { OddsTick } from '@contracts/match';
import type { Side } from '@contracts/crowd';
import type {
  EventRow,
  FoldRow,
  FoldSummary,
  LedgerBuilder,
  LedgerRow,
  LedgerSnapshot,
  Unsubscribe,
} from './types';

/** consecutive same-side danger rows within this gap collapse into one spell. */
const DANGER_SPELL_MS = 90_000;
/** the settle window after a moment before we read the market's "after" tick.
 * Devnet StablePrice runs ~60s behind the scores wire; 150s clears the lag and a
 * couple of ticks of settle. Documented in contracts/ledger.ts. */
const SETTLE_MS = 150_000;
/** keep at most this many odds ticks in the correlation ring (ample for one match). */
const MAX_TICKS = 20_000;
/**
 * A swing chip means "the market moved BECAUSE of this moment" — so the biggest of
 * the three probability deltas must clear a noise floor. Below this, the market only
 * drifted (ambient 1–2pt wander, common deep in a decided game where every event
 * would otherwise stamp the same tiny move); the row renders WITHOUT a chip, honestly
 * silent. Two real ticks still, just not called a swing. (~4 points.)
 */
const MIN_SWING_DELTA = 0.04;

/** kinds a wire discard may strike — field actions only. Phase facts
 * (kickoff/break/penalties/full-time) can never be "retracted". */
const DISCARDABLE = new Set<LedgerKind>([
  'goal',
  'possible',
  'shot',
  'corner',
  'free-kick',
  'yellow-card',
  'red-card',
  'substitution',
  'injury',
  'additional-time',
  'danger',
  'penalty-kick',
]);

/** one row per playing-phase start: the wire RE-EMITS `kickoff` mid-half
 * (observed: StatusId 2 again at 13'42", StatusId 7 again at 93'+) — the
 * first kickoff per StatusId is the phase start, the rest are refreshes.
 * Same family: the tunnel beats (warmup) collapse to ONE row per match. */
function kickoffSid(ev: LedgerEvent): number | null {
  const sid = (ev.raw as { StatusId?: unknown } | undefined)?.StatusId;
  return typeof sid === 'number' ? sid : null;
}

/** which raw kinds are always visible even outside a fold. */
const MAJOR_KINDS = new Set<LedgerKind>([
  'kickoff',
  'goal',
  'yellow-card',
  'red-card',
  'break',
  'penalties',
  'penalty-kick',
  'full-time',
]);

interface Patch {
  kind: 'amend' | 'discard';
  targetKind?: LedgerKind; // amend only
  targetClockSeconds: number | null;
  side: Side | null;
  detail?: string | null; // amend only
  tMs: number;
}

/** the match triple → a stable string key (kind|seconds|side). */
function tripleKey(kind: LedgerKind, seconds: number | null, side: Side | null): string {
  return `${kind}|${seconds ?? 'x'}|${side ?? 'n'}`;
}

/** a raw event's own triple (for amend/discard matching). Clock.Seconds lives on raw. */
function eventClockSeconds(ev: LedgerEvent): number | null {
  const raw = ev.raw as { Clock?: { Seconds?: number } } | undefined;
  const s = raw?.Clock?.Seconds;
  return typeof s === 'number' ? s : null;
}

function toRead(t: OddsTick): OddsRead {
  return { pHome: t.pHome, pDraw: t.pDraw, pAway: t.pAway, tMs: t.tMs };
}

export function createLedgerBuilder(): LedgerBuilder {
  /** id → newest event envelope for that id (goal upgrades REPLACE). */
  const events = new Map<string, LedgerEvent>();
  /** insertion order of ids so equal-tMs rows keep arrival order, newest last. */
  let seq = 0;
  const order = new Map<string, number>();
  /** retro-edit patches, newest-wins per triple. */
  const patches = new Map<string, Patch>();
  /** bounded, time-sorted-on-read ring of odds reads. */
  const ticks: OddsRead[] = [];

  const subs = new Set<(s: LedgerSnapshot) => void>();
  let published: LedgerSnapshot = { rows: [], headId: null, version: 0 };
  let version = 0;

  /** first kickoff row seen per StatusId (phase starts; re-emits dropped). */
  const kickoffSeen = new Set<number>();
  /** the single tunnel row's id, once one exists. */
  let warmupId: string | null = null;

  function push(msg: LedgerMsg): void {
    if (msg.type === 'event') {
      const ev = msg.ev;
      // kickoff re-emission dedupe: one row per playing phase (see kickoffSid doc)
      if (ev.kind === 'kickoff') {
        const sid = kickoffSid(ev);
        if (sid !== null) {
          if (kickoffSeen.has(sid) && !events.has(ev.id)) return; // refresh, not a new phase
          kickoffSeen.add(sid);
        }
      }
      // the tunnel is one beat, not three: collapse warmup rows into the first
      if (ev.kind === 'warmup') {
        if (warmupId !== null && warmupId !== ev.id) return;
        warmupId = ev.id;
      }
      if (!events.has(ev.id)) order.set(ev.id, seq++);
      // newest envelope for an id wins (goal provisional → confirmed upgrade)
      events.set(ev.id, ev);
    } else if (msg.type === 'amend') {
      const key = tripleKey(msg.targetKind, msg.targetClockSeconds, msg.side);
      const prev = patches.get(key);
      // newest-wins; a discard already recorded for this triple is not overwritten
      // by an older amend (guard by tMs), but a discard + amend can coexist only as
      // the newest single patch — the wire sends one truth at a time per triple.
      if (!prev || msg.tMs >= prev.tMs) {
        patches.set(key, {
          kind: 'amend',
          targetKind: msg.targetKind,
          targetClockSeconds: msg.targetClockSeconds,
          side: msg.side,
          detail: msg.detail,
          tMs: msg.tMs,
        });
      }
    } else {
      // discard: we don't know the kind, so we record a side+seconds patch and
      // apply it to any event matching (seconds, side) regardless of kind.
      const key = discardKey(msg.targetClockSeconds, msg.side);
      const prev = patches.get(key);
      if (!prev || msg.tMs >= prev.tMs) {
        patches.set(key, {
          kind: 'discard',
          targetClockSeconds: msg.targetClockSeconds,
          side: msg.side,
          tMs: msg.tMs,
        });
      }
    }
    republish();
  }

  function pushOdds(tick: OddsTick): void {
    // guard against fiction: a tick with a non-finite field is ignored (the stage
    // does the same). We keep the ring roughly time-ordered by pushing in arrival
    // order and sorting lazily only when we correlate.
    if (
      !Number.isFinite(tick.pHome) ||
      !Number.isFinite(tick.pDraw) ||
      !Number.isFinite(tick.pAway) ||
      !Number.isFinite(tick.tMs)
    ) {
      return;
    }
    ticks.push(toRead(tick));
    if (ticks.length > MAX_TICKS) ticks.splice(0, ticks.length - MAX_TICKS);
    // a late tick can complete a previously-unsettled swing → republish so the
    // chip stamps in honestly (rows update like a wire report).
    republish();
  }

  /** discard patches key on (seconds|side) only — kind is unknown on the wire. */
  function discardKey(seconds: number | null, side: Side | null): string {
    return `discard|${seconds ?? 'x'}|${side ?? 'n'}`;
  }

  /** find the swing around a moment, or undefined if the market hasn't settled/spoken. */
  function swingAt(tMs: number): OddsSwing | undefined {
    if (ticks.length === 0) return undefined;
    // before = last tick at-or-before tMs; after = first tick at-or-after tMs+SETTLE
    let before: OddsRead | undefined;
    let after: OddsRead | undefined;
    const afterThreshold = tMs + SETTLE_MS;
    // ticks arrive roughly ascending; scan linearly (fixtures are small). We do not
    // assume sorted — track the max ≤tMs and the min ≥threshold.
    for (const t of ticks) {
      if (t.tMs <= tMs) {
        if (!before || t.tMs > before.tMs) before = t;
      }
      if (t.tMs >= afterThreshold) {
        if (!after || t.tMs < after.tMs) after = t;
      }
    }
    if (!before || !after) return undefined; // market hasn't settled yet (or never spoke)
    // a MEANINGFUL move only: the largest of the three deltas must clear the noise
    // floor, else this is ambient drift, not the market reacting to the moment.
    const dMax = Math.max(
      Math.abs(after.pHome - before.pHome),
      Math.abs(after.pDraw - before.pDraw),
      Math.abs(after.pAway - before.pAway),
    );
    if (dMax < MIN_SWING_DELTA) return undefined;
    return { before, after };
  }

  /** apply the newest patch (amend re-describes; discard strikes) to a resolved row. */
  function applyPatches(row: EventRow): void {
    const ev = row.ev;
    const seconds = eventClockSeconds(ev);
    // discard matches on (seconds, side) — but ONLY against field actions with a
    // real clock anchor. Status-family rows (kickoff/break/penalties/full-time)
    // are phase facts, not field actions: the wire retracts a shot, never a
    // half-time. Without this guard a null-clock discard's 'x|n' key struck
    // every neutral break row (observed live: Half-time rendered struck-through).
    const dKey = discardKey(seconds, ev.side);
    const dPatch = patches.get(dKey);
    if (dPatch && dPatch.kind === 'discard' && seconds !== null && DISCARDABLE.has(ev.kind)) {
      row.discarded = true;
      row.pending = false; // a struck possible is resolved (struck), not held
    }
    // amend matches on (kind, seconds, side)
    const aKey = tripleKey(ev.kind, seconds, ev.side);
    const aPatch = patches.get(aKey);
    if (aPatch && aPatch.kind === 'amend' && aPatch.detail) {
      // re-describe in place: "SHOT" → "SHOT — WOODWORK"
      row.ev = { ...ev, detail: aPatch.detail };
    }
  }

  /** the freshest signal we've seen (newest event OR odds tick) — a `possible` is only
   * "held breath" while the feed hasn't clearly moved past it (see resolveRows). */
  function newestSignalTMs(): number {
    let m = 0;
    for (const ev of events.values()) if (ev.tMs > m) m = ev.tMs;
    const lastTick = ticks.length ? ticks[ticks.length - 1] : undefined;
    if (lastTick && lastTick.tMs > m) m = lastTick.tMs;
    return m;
  }

  /** build the flat, resolved, newest-first event rows (pre-fold, pre-collapse). */
  function resolveRows(): EventRow[] {
    const rows: EventRow[] = [];
    const now = newestSignalTMs();
    for (const ev of events.values()) {
      // a `possible` holds its breath only while FRESH — within the settle window of the
      // newest signal. Once the feed moves past it with no confirming goal + no discard,
      // the VAR check resolved (usually "no goal"); we stop the pulse and demote it to a
      // settled minor so a dozen checks don't pulse forever. Honest: the wire raised a
      // check and moved on; we reflect exactly that, we don't invent a verdict.
      const isPossible = ev.kind === 'possible' && ev.confirmed !== true;
      const stale = isPossible && ev.tMs < now - SETTLE_MS;
      const isPendingPossible = isPossible && !stale;
      const row: EventRow = {
        kind: 'event',
        id: ev.id,
        ev,
        // a fresh possible is major (held breath, always visible); once stale it folds
        major: MAJOR_KINDS.has(ev.kind) || isPendingPossible,
        swing: swingAt(ev.tMs),
        discarded: false,
        pending: isPendingPossible,
        tMs: ev.tMs,
        minute: ev.minute,
      };
      applyPatches(row);
      rows.push(row);
    }
    // sort newest-first; ties broken by arrival order (newest arrival on top)
    rows.sort((a, b) => {
      if (b.tMs !== a.tMs) return b.tMs - a.tMs;
      return (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0);
    });
    return rows;
  }

  /**
   * Collapse consecutive same-side danger rows within DANGER_SPELL_MS into one.
   * Operates on a CHRONOLOGICAL (oldest-first) copy so "consecutive" and the
   * minute-span read forward; the result is flipped back to newest-first by the
   * caller. A spell keeps the FIRST danger row's identity + tMs range.
   */
  function collapseDanger(chrono: EventRow[]): EventRow[] {
    const out: EventRow[] = [];
    let i = 0;
    while (i < chrono.length) {
      const row = chrono[i]!;
      if (row.ev.kind !== 'danger' || row.discarded) {
        out.push(row);
        i++;
        continue;
      }
      // start a spell
      let j = i;
      let lastTMs = row.tMs;
      let lastMinute = row.minute;
      while (
        j + 1 < chrono.length &&
        chrono[j + 1]!.ev.kind === 'danger' &&
        !chrono[j + 1]!.discarded &&
        chrono[j + 1]!.ev.side === row.ev.side &&
        chrono[j + 1]!.tMs - lastTMs <= DANGER_SPELL_MS
      ) {
        j++;
        lastTMs = chrono[j]!.tMs;
        lastMinute = chrono[j]!.minute;
      }
      if (j > i) {
        // collapsed spell → one row, minute-span label, tMs of the LAST tick (so it
        // sorts to where the spell ended) but keeping the first row's id stem.
        const startMin = row.minute;
        const span =
          startMin != null && lastMinute != null && lastMinute !== startMin
            ? `${startMin}'–${lastMinute}'`
            : startMin != null
              ? `${startMin}'`
              : undefined;
        out.push({
          ...row,
          tMs: lastTMs,
          minute: lastMinute,
          spanLabel: span,
          swing: swingAt(row.tMs), // the swing keys off the spell START (when it began)
        });
      } else {
        out.push(row);
      }
      i = j + 1;
    }
    return out;
  }

  /**
   * Fold minors between majors. Walk newest-first; accumulate a run of non-major
   * rows into a FoldRow; flush it when a major arrives (or at the end). Each fold
   * carries pre-counted summary + the hidden items (newest-first) for expansion.
   */
  function foldMinors(newestFirst: EventRow[]): LedgerRow[] {
    const out: LedgerRow[] = [];
    let bucket: EventRow[] = [];

    const flush = (): void => {
      if (bucket.length === 0) return;
      if (bucket.length === 1) {
        // a LONE minor reads better inline than behind a useless "▸ 1 MOMENTS"
        // disclosure — inline it, flagged minor so the list UI prints it lighter.
        // A fold is a device for a STRETCH; one moment isn't a stretch.
        out.push({ ...bucket[0]!, inlineMinor: true } as EventRow);
      } else {
        out.push(makeFold(bucket));
      }
      bucket = [];
    };

    for (const row of newestFirst) {
      if (row.major) {
        flush();
        out.push(row);
      } else {
        bucket.push(row);
      }
    }
    flush();
    return out;
  }

  function makeFold(items: EventRow[]): FoldRow {
    const summary = summarize(items);
    const tMs = items.reduce((m, r) => Math.max(m, r.tMs), 0);
    const idStem = items.map((r) => r.id).join('~');
    return { kind: 'fold', id: `fold:${idStem}`, items, summary, tMs };
  }

  function summarize(items: EventRow[]): FoldSummary {
    let shots = 0;
    let corners = 0;
    let freeKicks = 0;
    let dangerMinutes = 0;
    let other = 0;
    for (const r of items) {
      switch (r.ev.kind) {
        case 'shot':
          shots++;
          break;
        case 'corner':
          corners++;
          break;
        case 'free-kick':
          freeKicks++;
          break;
        case 'danger': {
          // a collapsed spell contributes its span length; a lone danger contributes ~1'
          const raw = r.spanLabel;
          dangerMinutes += spanMinutes(raw);
          break;
        }
        default:
          other++;
      }
    }
    return { total: items.length, shots, corners, freeKicks, dangerMinutes, other };
  }

  function spanMinutes(span: string | undefined): number {
    if (!span) return 1;
    const m = span.match(/(\d+)'–(\d+)'/);
    if (m) return Math.max(1, Number(m[2]) - Number(m[1]));
    return 1;
  }

  function republish(): void {
    const flat = resolveRows(); // newest-first, resolved (amend/discard applied)
    // danger collapse needs chronological order
    const chrono = [...flat].reverse();
    const collapsed = collapseDanger(chrono);
    const newestFirst = collapsed.reverse();
    const rows = foldMinors(newestFirst);
    const headId = rows.length > 0 ? rowHeadId(rows[0]!) : null;
    version++;
    published = { rows, headId, version };
    for (const cb of subs) cb(published);
  }

  function rowHeadId(row: LedgerRow): string {
    return row.kind === 'event' ? row.id : row.id;
  }

  function subscribe(cb: (s: LedgerSnapshot) => void): Unsubscribe {
    subs.add(cb);
    cb(published);
    return () => {
      subs.delete(cb);
    };
  }

  function clear(): void {
    events.clear();
    order.clear();
    patches.clear();
    ticks.length = 0;
    seq = 0;
    republish();
  }

  return {
    push,
    pushOdds,
    snapshot: () => published,
    subscribe,
    clear,
  };
}
