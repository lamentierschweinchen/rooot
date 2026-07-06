/**
 * The relic metadata — the soul of the artifact, and where the honesty rule lives.
 *
 * Ported from STRATA's `src/mint/metadata.ts`. Every fact written here is REAL only when the relic
 * was captured LIVE off the wire: the odds path, the goals, the crowd timeline, and the verdict are
 * aggregated from real events during a match. If the relic was NOT captured live (e.g. the devnet
 * proof's synthetic sample), the metadata says so plainly and the verify hints are withheld — we
 * never claim a relic is verifiable when it isn't (mirrors STRATA exactly).
 *
 * Dependency-free. `MatchRelicData` and friends are type-only imports from the frozen relic seam.
 */
import type { MatchRelicData } from '@contracts/relic';
import { ATTRIBUTION, SITE_URL, SPEC, SYMBOL, txlineExplorerUrl, solscanTxUrl, type MintCluster } from './config';

export interface NftAttribute {
  trait_type: string;
  value: string | number;
}

/** The provenance block — everything needed to verify the relic against the world after the feed is gone. */
export interface RelicProvenance {
  /** TxLINE Merkle anchors covering the odds/scores window used. */
  txlineRefs: string[];
  /** Merkle root of attendee anonIds (prove "I'm in the crowd photo"). */
  attendeeRoot: string;
  /** The cluster the relic's provenance transactions describe. */
  network: MintCluster;
  /** sha256 of the sentiment record this relic summarizes, if anchored. */
  recordHash?: string;
  /** The devnet/mainnet memo tx signature that anchored `recordHash`, if any. */
  anchorTxSig?: string;
}

interface VerifyHint {
  note: string;
  anchorTxExplorer?: string;
  anchorTxSolscan?: string;
  txlineRefs?: string[];
}

/** Standard NFT metadata + a `rooot` block carrying the match, provenance, and verify hints. */
export interface RelicMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url: string;
  attributes: NftAttribute[];
  properties: {
    category: 'image';
    files: Array<{ uri: string; type: string }>;
  };
  rooot: {
    spec: string;
    live: boolean;
    capturedAtISO: string;
    fixture: { id: string; home: string; away: string; kickoffISO: string; venue?: string };
    finalScore: { home: number; away: number };
    goals: Array<{ minute: number | null; side: 'home' | 'away'; scorer?: string }>;
    verdictWinner: 'home' | 'away' | 'draw';
    provenance: RelicProvenance;
    edition?: { serial: number; editionSize: number | null };
    attribution: string;
    verify: VerifyHint;
  };
}

export interface BuildRelicMetadataOptions {
  /** The Arweave (or in-bundle) URI the relic's cover image should point at. */
  imageUri: string;
  mime?: string;
  /** ISO-8601 (UTC) capture timestamp for this relic. Defaults to now. */
  capturedAtISO?: string;
  /**
   * Honesty flag: true only when the relic was assembled from a LIVE capture off the wire. When
   * false (e.g. the devnet proof's synthetic sample), the description says so and verify hints are
   * withheld. Defaults to the provenance/network heuristic being *insufficient* to assert live, so
   * callers MUST pass `live: true` explicitly for a genuine capture.
   */
  live?: boolean;
  /** Optional edition info to stamp (serial within the edition + edition size). */
  edition?: { serial: number; editionSize: number | null };
  /** Optional override of the full descriptive title (otherwise derived from the fixture + score). */
  title?: string;
}

const FIXTURE_CODE = (relic: MatchRelicData): string =>
  `${relic.fixture.home.code}–${relic.fixture.away.code}`;

const SCORE_STR = (relic: MatchRelicData): string =>
  `${relic.finalScore.home}–${relic.finalScore.away}`;

/** Full, descriptive title for the metadata `name` (fixture · score · winner-of-the-stands). */
export function buildRelicTitle(relic: MatchRelicData, live: boolean): string {
  const tag = live ? '' : ' (PROOF)';
  return `ROOOT · ${FIXTURE_CODE(relic)} ${SCORE_STR(relic)}${tag}`;
}

/**
 * Short on-chain asset name, ≤ 32 chars (mpl-core name limit). e.g. `ROOOT · POR–ESP`.
 * Falls back to a hard slice if a pathological code pushes it over.
 */
export function buildOnChainName(relic: MatchRelicData): string {
  const name = `ROOOT · ${FIXTURE_CODE(relic)}`;
  return name.length <= 32 ? name : name.slice(0, 32);
}

function buildDescription(relic: MatchRelicData, live: boolean): string {
  const fix = `${relic.fixture.home.name} vs ${relic.fixture.away.name}`;
  const score = SCORE_STR(relic);
  const wonStands =
    relic.verdict.winner === 'draw'
      ? 'the stands were split'
      : `the ${relic.verdict.winner === 'home' ? relic.fixture.home.name : relic.fixture.away.name} end won the stands`;
  if (!live) {
    return (
      'A ROOOT relic — the crowd\'s memory of a match, kept forever. ' +
      '⚠ This is a PROOF relic minted from SYNTHETIC sample data: the fixture, score, goals, ' +
      'crowd timeline, and verdict are illustrative, NOT captured off a live feed, and are NOT ' +
      'independently verifiable. No on-chain provenance is asserted. ' +
      `Relics are made live during matches at ${SITE_URL}. — ${ATTRIBUTION}`
    );
  }
  return (
    `A ROOOT relic — the crowd\'s memory of ${fix}, kept forever. Final ${score}; ${wonStands}. ` +
    'Every count in this relic is a real tap, react, or call made by fans during the match, and ' +
    'every market probability is the de-vigged tide as it actually stood. The provenance in this ' +
    'metadata (TxLINE Merkle refs, attendee root, anchor signature) lets you verify the relic ' +
    `against the world after the feed is gone. Relics are made live at ${SITE_URL}. — ${ATTRIBUTION}`
  );
}

function buildAttributes(relic: MatchRelicData, live: boolean): NftAttribute[] {
  const v = relic.verdict;
  const winnerName =
    v.winner === 'draw'
      ? 'Split'
      : v.winner === 'home'
        ? relic.fixture.home.name
        : relic.fixture.away.name;
  const attrs: NftAttribute[] = [
    { trait_type: 'Fixture', value: `${relic.fixture.home.name} vs ${relic.fixture.away.name}` },
    { trait_type: 'Home', value: relic.fixture.home.name },
    { trait_type: 'Away', value: relic.fixture.away.name },
    { trait_type: 'Final score', value: SCORE_STR(relic) },
    { trait_type: 'Goals', value: relic.goals.length },
    { trait_type: 'Won the stands', value: winnerName },
    { trait_type: 'Kickoff (UTC)', value: relic.fixture.kickoffISO },
    { trait_type: 'Data source', value: live ? 'live capture' : 'synthetic (proof)' },
    { trait_type: 'Network', value: relic.provenance.network },
  ];
  if (relic.fixture.venue) attrs.push({ trait_type: 'Venue', value: relic.fixture.venue });
  return attrs;
}

function buildVerify(prov: RelicProvenance, live: boolean): VerifyHint {
  if (!live) {
    return {
      note: 'Synthetic proof relic — no live capture, no on-chain provenance to verify.',
    };
  }
  const hint: VerifyHint = {
    note:
      'This relic was captured live. The TxLINE Merkle refs anchor the market window; the anchor ' +
      'transaction (if present) notarizes the sentiment record hash on-chain. Open the links to confirm.',
  };
  if (prov.txlineRefs.length) hint.txlineRefs = prov.txlineRefs;
  if (prov.anchorTxSig) {
    hint.anchorTxExplorer = txlineExplorerUrl(prov.anchorTxSig, prov.network);
    hint.anchorTxSolscan = solscanTxUrl(prov.anchorTxSig, prov.network);
  }
  return hint;
}

/**
 * Build the full relic metadata object. Pass the URI the `image` should point at:
 *  • local bundle  → relative filename ({ imageUri: 'cover.png' })
 *  • on-chain mint → Arweave gateway URI returned by Irys.
 *
 * HONESTY: `opts.live` MUST be true only when `relic` was assembled from a genuine live capture.
 * The devnet proof passes `live: false`, and the description + verify hints degrade accordingly.
 */
export function buildRelicMetadata(relic: MatchRelicData, opts: BuildRelicMetadataOptions): RelicMetadata {
  const live = opts.live === true;
  const mime = opts.mime ?? 'image/png';
  const capturedAtISO = opts.capturedAtISO ?? new Date().toISOString();
  const prov: RelicProvenance = {
    txlineRefs: relic.provenance.txlineRefs,
    attendeeRoot: relic.provenance.attendeeRoot,
    network: relic.provenance.network,
  };

  return {
    name: opts.title ?? buildRelicTitle(relic, live),
    symbol: SYMBOL,
    description: buildDescription(relic, live),
    image: opts.imageUri,
    external_url: SITE_URL,
    attributes: buildAttributes(relic, live),
    properties: {
      category: 'image',
      files: [{ uri: opts.imageUri, type: mime }],
    },
    rooot: {
      spec: SPEC,
      live,
      capturedAtISO,
      fixture: {
        id: relic.fixture.id,
        home: relic.fixture.home.name,
        away: relic.fixture.away.name,
        kickoffISO: relic.fixture.kickoffISO,
        ...(relic.fixture.venue ? { venue: relic.fixture.venue } : {}),
      },
      finalScore: relic.finalScore,
      goals: relic.goals.map((g) => ({
        minute: g.minute,
        side: g.side,
        ...(g.scorer ? { scorer: g.scorer } : {}),
      })),
      verdictWinner: relic.verdict.winner,
      provenance: prov,
      ...(opts.edition ? { edition: opts.edition } : {}),
      attribution: ATTRIBUTION,
      verify: buildVerify(prov, live),
    },
  };
}
