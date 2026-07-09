import fs from 'node:fs';
import path from 'node:path';

export interface Profile { pubkey: string; sides: string[]; since: number; displayName: string | null; }
const DIR = process.env.ROOOT_SEAT_DIR || '/tmp/rooot-seat';

function keyPath(pubkey: string): string {
  // defense-in-depth: never let a pubkey escape DIR (full base58 validation happens at the Task 6 HTTP boundary)
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
  fs.writeFileSync(keyPath(pubkey), JSON.stringify(next));
  return next;
}
