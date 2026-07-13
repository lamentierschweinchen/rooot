/**
 * mintScarfForClaim — the claim → mint glue for a REAL match claim. Builds an honest
 * MatchRelicData (mint/relic-from-match.ts), uploads it with the fan's full scarf record folded
 * into `attributes` (mint/metadata.ts's buildScarfAttributes), and mints it owned by the fan's
 * pubkey into the shared ROOOT scarf collection (mint/collection.ts) — service pays, fan owns,
 * devnet only.
 *
 * HONESTY GATE (reconciliation plan, archive/docs-consumed/docs/HANDOFF-2026-07-10-coordinator-session.md §5): a mint
 * happens ONLY from a real full-time claim — `score.decided` must be true (server.ts's
 * `resolvedMatches`, populated off the real status feed) BEFORE any network call is attempted. A
 * claim made mid-match still binds the fan's identity + real side/call (seat/claim.ts), it just
 * doesn't mint yet — no placeholder, no "pending" asset, nothing that looks like a relic before the
 * match has actually finished. (Adapted from the your-seat branch's own "generous" gate — mint on
 * any matchId-claim, decided or not — which this reconciliation replaces per the plan's explicit
 * honesty law.)
 *
 * IDEMPOTENT per (pubkey, matchId) (review fix, risk 3): a durable minted marker on the same
 * volume base as the profile store (seat/minted-store.ts) is checked BEFORE getMintRuntime() —
 * before any network — and a repeat claim returns the EXISTING asset reference, so the album
 * stays one scarf per match per fan across repeat claims AND across restarts/redeploys. An
 * in-process single-flight map additionally collapses two CONCURRENT claims for the same pair
 * onto one mint promise (two tabs pressing at once), instead of racing past the not-yet-written
 * marker into a double mint.
 *
 * NEVER THROWS beyond the gate: every failure (no fixture identity, RPC hiccup, insufficient
 * devnet SOL, Irys hiccup, malformed data) is caught and logged; the caller always gets a value
 * back (`null` on any failure or on a not-yet-decided match) so a mint problem can never cost the
 * fan their already-saved bind (server.ts's handleSeatClaim saves the profile BEFORE calling this).
 */
import type { ClaimRecord } from './claim';
import { loadMintMarker, saveMintMarker } from './minted-store';
import { buildRelicFromMatch, type LiveScoreSnapshot } from '../mint/relic-from-match';
import { buildScarfAttributes, buildClaimDescription, type ScarfFacts } from '../mint/metadata';
import { uploadRelic } from '../mint/storage';
import { mintRelic } from '../mint/mint';
import { makeScarfCoverPng } from '../mint/cover';
import { ensureIrysFunded } from '../mint/irys-fund';
import { getMintRuntime } from '../mint/runtime';
import { fixtureInfo } from '../sentiment/teams';

export type { LiveScoreSnapshot };

export interface ScarfMint {
  asset: string;
  txUrl: string;
}

/** The fan-specific facts server.ts already knows and mustn't be re-derived here (keeps this
 * module a pure function of its inputs, unit-testable without booting the server). */
export interface ScarfExtras {
  /** The post-mortem's 3-state verdict for this fan (match-state.ts's verdictFor) — null when the
   * fan never locked a prediction, never invented. */
  result: 'exact' | 'outcome' | 'wrong' | null;
  /** THE FAN SERIAL (registry.ts's fanNoFor) — the fan's global, persistent, first-come ordinal. */
  fanNo: number;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** ISO date ('2026-07-09') -> "09 JUL '26" (matches the cabinet's demo-sample convention,
 * archive/design-docs-consumed/design/HANDOFF-coordinator-data-wiring.md's demo-seat.js stub). Falls back to the raw ISO string
 * on anything unparseable — never invents a date. Exported for the attribute-shaping dev check. */
export function formatScarfDate(dateISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO);
  if (!m) return dateISO;
  const [, y, mo, d] = m;
  const mon = MONTHS[Number(mo) - 1] ?? mo;
  return `${d} ${mon} '${y!.slice(2)}`;
}

/** The fan's locked call as a scarf-facing string, home-perspective tricode-prefixed (e.g.
 * 'SUI 2–1') — mirrors gate.html's own "YOU CALLED {home} h–a {away}" convention. Null: never
 * predicted (bindClaim never invents one). Exported for the attribute-shaping dev check. */
export function formatScarfCall(homeTricode: string, call: { home: number; away: number } | null): string | null {
  return call ? `${homeTricode} ${call.home}–${call.away}` : null;
}

/** Pure: derive the on-chain ScarfFacts record from a bound claim + the real match facts. No
 * network, no side effects — exported so the dev check can assert attribute shaping (all AlbumScarf
 * fields present, correct 3-state result mapping) without a live mint. */
export function scarfFactsFor(
  record: ClaimRecord,
  finalScore: { home: number; away: number },
  fx: { home: { code: string }; away: { code: string }; competition: string; dateISO: string },
  extras: ScarfExtras,
): ScarfFacts {
  return {
    matchId: record.matchId,
    home: fx.home.code,
    away: fx.away.code,
    score: `${finalScore.home}–${finalScore.away}`,
    call: formatScarfCall(fx.home.code, record.call),
    result: extras.result,
    comp: fx.competition.toUpperCase(),
    date: formatScarfDate(fx.dateISO),
    serial: String(extras.fanNo).padStart(3, '0'),
  };
}

/** Concurrent same-pair claims collapse onto ONE in-flight mint promise (doc
 * comment up top) — keyed like the durable marker, cleared when it settles. */
const inFlightMints = new Map<string, Promise<ScarfMint | null>>();

export async function mintScarfForClaim(record: ClaimRecord, score: LiveScoreSnapshot, extras: ScarfExtras): Promise<ScarfMint | null> {
  if (!score.decided) {
    console.log(`[seat:mint] ${record.matchId} not yet FULL_TIME — skipping mint (bind still saved; claim again after full time)`);
    return null;
  }
  // Idempotency (review fix, risk 3): checked BEFORE getMintRuntime() — before any network. A
  // repeat post-FT claim returns the fan's EXISTING scarf, never a duplicate.
  const prior = loadMintMarker(record.pubkey, record.matchId);
  if (prior) {
    console.log(`[seat:mint] ${record.pubkey.slice(0, 8)} already holds ${prior.asset} for ${record.matchId} — returning the existing scarf, no new mint`);
    return { asset: prior.asset, txUrl: prior.txUrl };
  }
  const flightKey = `${record.pubkey}--${record.matchId}`;
  const inFlight = inFlightMints.get(flightKey);
  if (inFlight) return inFlight;
  const flight = mintScarfNow(record, score, extras).finally(() => inFlightMints.delete(flightKey));
  inFlightMints.set(flightKey, flight);
  return flight;
}

async function mintScarfNow(record: ClaimRecord, score: LiveScoreSnapshot, extras: ScarfExtras): Promise<ScarfMint | null> {
  try {
    const relic = buildRelicFromMatch(record.matchId, score);
    const fx = fixtureInfo(record.matchId);
    if (!relic || !fx) {
      console.warn(`[seat:mint] no fixture identity for matchId=${record.matchId} — skipping mint (bind still saved)`);
      return null;
    }

    // Log the exact score this mint will write BEFORE any network call — one plain line so Fly
    // logs (and the dev check's post-restart scenario) show what the scarf was about to carry.
    console.log(`[seat:mint] minting for ${record.pubkey.slice(0, 8)} @ ${record.matchId}: full-time ${score.home}–${score.away}, result ${extras.result ?? 'none'}, serial ${extras.fanNo}`);

    const { umi, cluster, collection } = await getMintRuntime();
    const cover = makeScarfCoverPng();
    const capturedAtISO = new Date().toISOString();
    await ensureIrysFunded(umi, cover.length + 8192);

    const facts = scarfFactsFor(record, relic.finalScore, fx, extras);

    const uris = await uploadRelic({ bytes: cover, mime: 'image/png' }, relic, umi, {
      imageUri: '', // overwritten by storage.ts after the cover upload
      mime: 'image/png',
      live: true, // the included data (fixture identity + the real final score) IS real
      capturedAtISO,
      metaTransform: (md) => ({
        ...md,
        // Honesty seam: the frozen live-branch description/verify text assumes a fully-aggregated,
        // finished match — override so this minimal relic never overclaims (mint/metadata.ts's
        // buildClaimDescription doc comment).
        description: buildClaimDescription(relic, score.decided),
        // Honesty seam: NEVER inherit buildAttributes' match-level traits (Goals, Won the stands,
        // Data source, Kickoff) — this minimal relic doesn't have that data. buildScarfAttributes
        // emits exactly the AlbumScarf record design specced, nothing more.
        attributes: buildScarfAttributes(facts),
        rooot: {
          ...md.rooot,
          verify: {
            note:
              'Minimal relic: the seat is real and on-chain; rich match aggregates (the odds ' +
              "path, the goal-by-goal timeline, the crowd's roar) were not captured for this relic.",
          },
        },
      }),
    });

    const result = await mintRelic(relic, uris, umi, cluster, record.pubkey, collection);
    console.log(`[seat:mint] minted ${result.asset} for ${record.pubkey.slice(0, 8)} @ ${record.matchId} (${result.txUrl})`);
    // Persist the marker AFTER the mint confirms — and never let a marker-write failure hide a
    // mint that already happened on-chain: the fan gets their asset reference either way, at the
    // cost (on a disk error only) of one possible future duplicate instead of a lost scarf.
    try {
      saveMintMarker(record.pubkey, record.matchId, { asset: result.asset, txUrl: result.txUrl, mintedAtMs: Date.now() });
    } catch (err) {
      console.warn(`[seat:mint] minted marker write failed for ${record.pubkey.slice(0, 8)} @ ${record.matchId}: ${String(err)}`);
    }
    return { asset: result.asset, txUrl: result.txUrl };
  } catch (err) {
    console.warn(`[seat:mint] mint failed for ${record.pubkey.slice(0, 8)} @ ${record.matchId}: ${String(err)}`);
    return null;
  }
}
