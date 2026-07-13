/**
 * buildRelicFromMatch (Task 6b step 2) — the HONEST MatchRelicData for a claim-time scarf mint.
 *
 * Deliberately left undefined by the plan (task-6b-brief.md): what "the live match" really has
 * server-side, at claim time, is much thinner than MatchRelicData's full shape wants.
 *
 *  - Fixture identity: MatchState (match-state.ts) tracks crowd mechanics only (rooted anonIds,
 *    predictions, roar/pulse counters) — no team names, no colors, no kickoff time. The live
 *    TxLINE ingest (ingest/txline.ts) NEVER emits a `fixtureInfo` FeedMsg (grep confirms only
 *    scripts/bake-demo.ts, an offline demo-baking tool, ever constructs one) — so there is no
 *    wire-sourced Fixture to read at claim time. The one REAL, server-side source of team
 *    identity is the SAME hardcoded lookup sentiment/accumulator.ts already uses to build its
 *    SentimentRecord: sentiment/teams.ts's `fixtureInfo(matchId)`. That table carries
 *    code/name/colors + competition/dateISO for the tournament's known fixtures — real official
 *    team facts, just not wire-sourced. Returns null when even that identity is unavailable
 *    (unknown matchId) — the caller (seat/mint-scarf.ts) treats that as "cannot honestly mint,"
 *    never a crash, and never a fabricated placeholder team.
 *  - `flag`: TeamRef.flag is a mandatory string, but no real flag glyph is available server-side
 *    (sentiment/teams.ts carries code/name/colors only — archive/src-spa-frozen/apps/web/src/data/fixtureMeta.ts has
 *    hand-picked flags, but that's a different app/service, not importable here per
 *    tsconfig's `@contracts/*`-only path alias). Left '' rather than guessed — and never
 *    rendered downstream anyway (mint/metadata.ts's buildAttributes/buildRelicMetadata never
 *    read `.flag`).
 *  - `kickoffISO`: only the DATE is genuinely known server-side (teams.ts's `dateISO`, e.g.
 *    '2026-07-06') — there's no real kickoff clock time available (same fixtureInfo-FeedMsg gap
 *    above), so this states only what's true (the date) rather than fabricating a time-of-day.
 *  - The current score is ALSO not in MatchState; the caller reads it from server.ts's own
 *    join-snapshot cache (the same cache that catches up a freshly-joined socket) and passes it
 *    in as `score` — kept as a plain argument (not reached into) so this function stays pure and
 *    unit-testable without booting the server.
 *  - `oddsPath`/`goals`/`crowd`/`verdict`: NOT aggregated at claim time — that only happens in
 *    SentimentAccumulator, crystallized at FULL_TIME into a different, richer contract
 *    (SentimentRecord), not a drop-in MatchRelicData. Per the task's explicit honesty seam, this
 *    builds a MINIMAL relic with ONLY the real fields (fixture identity + the real score as of
 *    claim time) rather than fabricating the rest. `verdict.winner` is left `'draw'` (the frozen
 *    contract has no "unknown" option) — it never means "the stands were split," just "nothing
 *    is claimed here"; mint/metadata.ts's `buildClaimDescription` never repeats it as a claim.
 */
import type { MatchRelicData } from '@contracts/relic';
import { fixtureInfo } from '../sentiment/teams';

export interface LiveScoreSnapshot {
  home: number;
  away: number;
  /** True only when the match has genuinely reached FULL_TIME (server.ts's `resolvedMatches`
   * set, populated off the real status feed) — never inferred or guessed. */
  decided: boolean;
}

/** Returns null when there's no real fixture identity for `matchId` — the honesty gate. */
export function buildRelicFromMatch(
  matchId: string,
  score: LiveScoreSnapshot,
  nowMs = Date.now(),
): MatchRelicData | null {
  const fx = fixtureInfo(matchId);
  if (!fx) return null;

  const zeroPulse = () => ({ belief: [] as number[], nerves: [] as number[], rage: [] as number[] });

  return {
    fixture: {
      id: matchId,
      home: { code: fx.home.code, name: fx.home.name, colors: [fx.home.colors[0], fx.home.colors[1]], flag: '' },
      away: { code: fx.away.code, name: fx.away.name, colors: [fx.away.colors[0], fx.away.colors[1]], flag: '' },
      kickoffISO: fx.dateISO,
    },
    finalScore: { home: score.home, away: score.away },
    oddsPath: [],
    goals: [],
    crowd: {
      bucketSec: 60,
      roar: { home: [], away: [] },
      pulse: { home: zeroPulse(), away: zeroPulse() },
    },
    verdict: {
      scores: {
        home: { loudness: 0, faith: 0, presence: 0, foresight: 0 },
        away: { loudness: 0, faith: 0, presence: 0, foresight: 0 },
      },
      winner: 'draw',
    },
    provenance: {
      txlineRefs: [],
      attendeeRoot: '',
      network: 'devnet',
      fromMs: nowMs,
      toMs: nowMs,
    },
  };
}
