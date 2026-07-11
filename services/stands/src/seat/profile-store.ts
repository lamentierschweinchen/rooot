/**
 * Flat-file profile store keyed by pubkey — the small off-chain blob (sides/
 * since/displayName) that isn't worth a mint (spec §5, §10). Ported from the
 * your-seat branch; ADAPTED here to live on the SAME durable volume the
 * restart snapshot uses (services/stands/src/snapshot.ts's DATA_DIR — /data
 * when the Fly volume is mounted, /tmp otherwise) instead of a hardcoded
 * `/tmp/rooot-seat`, so a fan's claimed identity survives a redeploy exactly
 * like match snapshots and sentiment records do. ROOOT_SEAT_DIR still wins
 * when set (an explicit operator override, and what the dev checks use to
 * stay hermetic — mirrors STANDS_DATA_DIR's own override convention).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, writeFileAtomic } from '../snapshot';

export interface Profile { pubkey: string; sides: string[]; since: number; displayName: string | null; }
const DIR = process.env.ROOOT_SEAT_DIR || path.join(DATA_DIR, 'seat');

function keyPath(pubkey: string): string {
  // defense-in-depth: never let a pubkey escape DIR (full base58 validation happens at the HTTP boundary, seat/validate.ts)
  if (!pubkey || /[\\/]/.test(pubkey) || pubkey.includes('..')) throw new Error('invalid pubkey');
  return path.join(DIR, `${pubkey}.json`);
}

export function mergeProfile(prev: Profile, patch: Partial<Profile>): Profile {
  const sides = Array.from(new Set([...(prev.sides || []), ...((patch.sides as string[]) || [])]));
  const since = Math.min(prev.since || Infinity, patch.since ?? Infinity);
  const displayName = (patch.displayName && patch.displayName.trim()) ? patch.displayName.trim() : prev.displayName;
  return { pubkey: prev.pubkey, sides, since: Number.isFinite(since) ? since : Date.now(), displayName };
}
export function loadProfile(pubkey: string): Profile {
  try { return JSON.parse(fs.readFileSync(keyPath(pubkey), 'utf8')); }
  catch { return { pubkey, sides: [], since: Date.now(), displayName: null }; }
}
export function saveProfile(pubkey: string, patch: Partial<Profile>): Profile {
  fs.mkdirSync(DIR, { recursive: true });
  const next = mergeProfile(loadProfile(pubkey), patch);
  // Atomic (tmp+rename, snapshot.ts's writeFileAtomic — review fix): a SIGKILL mid-write must
  // leave the OLD complete profile, never a torn file that a later loadProfile silently reads
  // as "fresh fan" and re-stamps with a new `since`.
  writeFileAtomic(keyPath(pubkey), JSON.stringify(next));
  return next;
}
