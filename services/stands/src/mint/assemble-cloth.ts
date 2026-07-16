/**
 * assembleClothRecord — build the fan's sealed "cloth record" SERVER-SIDE, from authoritative match
 * data, so the mint can headlessly capture their real loom keepsake (mint/scarf-capture.ts).
 *
 * Deliberately server-built, NEVER client-sent: law 1 (nothing renders that didn't happen) + the
 * claim honesty gate (server.ts never trusts the request body) forbid a client-supplied belief or
 * calls. Fields the server can't honestly source (danger / possession per-minute shares) are emitted
 * empty rather than faked. The record shape mirrors woven-loom.html's writeCloth()
 * (design/scarf-artwork/CAPTURE-RECIPE.md), so the deployed loom re-weaves it verbatim.
 */
import type { SentimentRecord, Triple } from '@contracts/sentiment';
import type { MarketPoint } from '../sentiment/builder';
import type { ClothRecord } from './scarf-capture';
import { loomInk } from './loom-colors';

const pct = (t: Triple): [number, number, number] => [
  +(t.home * 100).toFixed(1),
  +(t.draw * 100).toFixed(1),
  +(t.away * 100).toFixed(1),
];

/** The market's belief bands, in the cloth's [minute, home%, draw%, away%] shape. Prefer the LIVE
 * per-minute path (the accumulator, while warm), downsampled to ≥0.4-min gaps exactly like the
 * client's own writeCloth. If the match is cold, reconstruct a coarse-but-honest path from the
 * on-disk record's REAL inflection points — kickoff belief → each swing's resting belief → close.
 * Never interpolates a move that didn't happen; between swings the loom simply draws a straight
 * thread, the honest summary of a sub-noise-floor stretch. */
function beliefBands(path: MarketPoint[], rec: SentimentRecord | null): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  if (path.length) {
    let last = -9;
    for (let i = 0; i < path.length; i++) {
      const p = path[i]!;
      if (p.minute == null || p.triple == null) continue;
      if (p.minute - last >= 0.4 || i === path.length - 1) {
        const [h, d, a] = pct(p.triple);
        out.push([+p.minute.toFixed(2), h, d, a]);
        last = p.minute;
      }
    }
    if (out.length) return out;
  }
  const m = rec?.market;
  if (m) {
    if (m.open) { const [h, d, a] = pct(m.open); out.push([0, h, d, a]); }
    for (const s of m.swings ?? []) {
      if (s.minute == null) continue;
      const [h, d, a] = pct(s.to);
      out.push([+s.minute.toFixed(2), h, d, a]);
    }
    const end = m.etClose ?? m.close;
    if (end) {
      const lastMin = out.length ? out[out.length - 1]![0]! : 0;
      const [h, d, a] = pct(end);
      out.push([Math.max(lastMin + 1, 90), h, d, a]);
    }
    out.sort((x, y) => x[0]! - y[0]!);
  }
  return out;
}

/** Scored goals from the on-disk ledger → [minute, 'h'|'a'|'', 'goal', scorer]. Two ways a goal
 * scores: a confirmed `goal` row, OR an in-play penalty that went in — kind `penalty-kick`, detail
 * 'Scored', wire-confirmed (penalty-kicks don't carry `ev.confirmed`, so we read `raw.Confirmed`),
 * excluding shootout kicks (`StatusId===12`). The scorer name lives in `detail` for a goal (the
 * headline is the constant "Goal"); a penalty-kick's detail is the outcome, so it has no roster
 * name. Confirm/retract honesty: an unconfirmed goal never weaves; a confirmed-then-chalked-off one
 * is dropped later by reconcileGoals against the settled score. */
function goalEvents(rec: SentimentRecord | null): Array<[number, 'h' | 'a' | '', string, string]> {
  const out: Array<[number, 'h' | 'a' | '', string, string]> = [];
  for (const e of rec?.events ?? []) {
    const raw = e.raw as { Confirmed?: boolean; StatusId?: number } | undefined;
    const isGoal = e.kind === 'goal' && e.confirmed !== false;
    const isPenGoal = e.kind === 'penalty-kick' && e.detail === 'Scored' && raw?.Confirmed === true && raw?.StatusId !== 12;
    if (!isGoal && !isPenGoal) continue;
    const side: 'h' | 'a' | '' = e.side === 'home' ? 'h' : e.side === 'away' ? 'a' : '';
    const scorer = isGoal ? (e.detail ?? '') : '';
    out.push([+(e.minute ?? 0), side, 'goal', scorer]);
  }
  return out.sort((x, y) => x[0]! - y[0]!);
}

/** Drop the most-recent excess goals per side so the woven cloth never shows more goals than the
 * SETTLED score. A goal confirmed on the wire then chalked off (`action_discarded`) stays
 * `confirmed:true` in the crystallized record (the accumulator ignores discards), but the score
 * reverted — mirrors the live adapters' scorer-reconcile (stats-adapter.js / loom-adapter.js) so
 * the permanent keepsake never weaves a goal that didn't stand (law 1). */
function reconcileGoals(
  events: Array<[number, 'h' | 'a' | '', string, string]>,
  score: [number, number],
): Array<[number, 'h' | 'a' | '', string, string]> {
  const caps: Array<['h' | 'a', number]> = [['h', score[0]], ['a', score[1]]];
  for (const [key, max] of caps) {
    let idxs = events.map((e, i) => (e[1] === key ? i : -1)).filter((i) => i >= 0);
    while (idxs.length > max) {
      let dropAt = idxs[0]!;
      for (const i of idxs) if (events[i]![0]! >= events[dropAt]![0]!) dropAt = i;
      events.splice(dropAt, 1);
      idxs = events.map((e, i) => (e[1] === key ? i : -1)).filter((i) => i >= 0);
    }
  }
  return events;
}

export interface ClothAssembly {
  matchId: string;
  home: { tri: string; ink: string };
  away: { tri: string; ink: string };
  score: [number, number];
  root: 'home' | 'away' | null;
  /** Live per-minute belief path (accumulator.getBeliefPath()); [] when the match is cold. */
  beliefPath: MarketPoint[];
  /** On-disk crystallized record — events + the belief-reconstruction fallback. Null if absent. */
  record: SentimentRecord | null;
  /** The fan's ordered resolved NEXT GOAL calls (FanStats.nextGoalLog). */
  nextGoalLog: Array<{ side: 'home' | 'away' | 'none'; minute: number | null; hit: boolean; id: string }>;
  /** The fan's gate outcome prediction, graded — or null if they never locked one. */
  outcome: { sub: string; hit: boolean } | null;
  /** Keepsake seam printed into the seal (edition serial, owner, headline call). */
  ks: { editionNo: number; owner: string; call: { label: string; hit: boolean } | null } | null;
}

/** Assemble the cloth record, or null when there's no honest belief to weave (a beliefless cloth
 * is bare warp — the mint then falls back to scarf-svg rather than mint a blank). */
export function assembleClothRecord(a: ClothAssembly): ClothRecord | null {
  const belief = beliefBands(a.beliefPath, a.record);
  if (!belief.length) return null;
  const events = reconcileGoals(goalEvents(a.record), a.score);
  const lastBelief = belief.length ? belief[belief.length - 1]![0]! : 0;
  const lastEvent = events.length ? events[events.length - 1]![0]! : 0;
  const dur = +Math.max(90, lastBelief, lastEvent).toFixed(1) + 3;

  const subOf = (side: 'home' | 'away' | 'none'): string =>
    side === 'home' ? a.home.tri : side === 'away' ? a.away.tri : 'NO MORE';
  const calls: Array<{ m: number; k: string; sub: string; hit: boolean; id: string }> = [];
  if (a.outcome) calls.push({ m: 2, k: 'outcome', sub: a.outcome.sub, hit: a.outcome.hit, id: 'outcome' });
  for (const c of a.nextGoalLog) {
    calls.push({ m: c.minute ?? 0, k: 'nextgoal', sub: subOf(c.side), hit: c.hit, id: c.id });
  }
  calls.sort((x, y) => x.m - y.m);

  const record: ClothRecord = {
    v: 1,
    at: 0,
    fx: a.matchId,
    // the loom's own display inks (mirror of its FX table) so the keepsake matches the live loom;
    // falls back to the caller's fixtureInfo colour for any match not in the loom's table.
    home: { tri: a.home.tri, ink: loomInk(a.matchId, 'home', a.home.ink) },
    away: { tri: a.away.tri, ink: loomInk(a.matchId, 'away', a.away.ink) },
    score: a.score,
    dur,
    src: 'live',
    belief,
    danger: [],
    poss: [],
    events,
    pens: null,
    root: a.root,
    calls,
    ks: a.ks,
  };
  return record;
}
