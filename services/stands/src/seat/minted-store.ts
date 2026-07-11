/**
 * Durable per-(pubkey, matchId) minted-scarf marker (review fix, risk 3) — the
 * album invariant is ONE scarf per match per fan, but every post-FULL_TIME
 * claim used to mint a fresh duplicate. mintScarfForClaim now checks this
 * store BEFORE getMintRuntime() (before any network) and returns the EXISTING
 * asset reference on a repeat claim.
 *
 * Lives on the SAME durable base dir as the profile store (ROOOT_SEAT_DIR
 * when set — what the dev checks use to stay hermetic — else DATA_DIR/seat,
 * the Fly volume path), under a mints/ subdir so it can never collide with a
 * profile's `<pubkey>.json`. Writes are atomic (snapshot.ts's writeFileAtomic,
 * tmp+rename) — a SIGKILL mid-write can never leave a torn marker that a
 * future boot would misread as "never minted" (which would duplicate) or as
 * corrupt JSON (which loadMintMarker treats as absent anyway, same tolerant
 * read discipline as the rest of the persistence layer).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, writeFileAtomic } from '../snapshot';

export interface MintMarker {
  asset: string;
  txUrl: string;
  mintedAtMs: number;
}

// Same env-at-load discipline as profile-store.ts's DIR (the dev checks set
// ROOOT_SEAT_DIR before their first dynamic import of the server module).
const DIR = path.join(process.env.ROOOT_SEAT_DIR || path.join(DATA_DIR, 'seat'), 'mints');

/** Defense-in-depth: neither key may escape DIR (pubkey is base58-validated at
 * the HTTP boundary already; matchId comes from the registry via the claim
 * token, but guard anyway — same discipline as profile-store's keyPath). */
function markerPath(pubkey: string, matchId: string): string {
  for (const part of [pubkey, matchId]) {
    if (!part || /[\\/]/.test(part) || part.includes('..')) throw new Error('invalid marker key');
  }
  return path.join(DIR, `${pubkey}--${matchId}.json`);
}

/** The prior mint for this (pubkey, matchId), or null. Absent/corrupt reads
 * are both "no marker" — a corrupt file risks one duplicate mint, never a
 * crash or a fabricated asset reference. */
export function loadMintMarker(pubkey: string, matchId: string): MintMarker | null {
  try {
    const raw = JSON.parse(fs.readFileSync(markerPath(pubkey, matchId), 'utf8')) as MintMarker;
    return raw && typeof raw.asset === 'string' && raw.asset.length > 0 && typeof raw.txUrl === 'string'
      ? { asset: raw.asset, txUrl: raw.txUrl, mintedAtMs: Number(raw.mintedAtMs) || 0 }
      : null;
  } catch {
    return null;
  }
}

export function saveMintMarker(pubkey: string, matchId: string, marker: MintMarker): void {
  fs.mkdirSync(DIR, { recursive: true });
  writeFileAtomic(markerPath(pubkey, matchId), JSON.stringify(marker));
}
