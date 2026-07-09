export interface ClaimRecord {
  pubkey: string;
  method: 'passkey' | 'privy';
  side: 'home' | 'away' | 'neutral' | null;
  call: { home: number; away: number } | null;
  matchId: string;
  boundAtMs: number;
}
interface MatchLike {
  matchId: string;
  rooted: Map<string, string>;
  predictions: Map<string, { home: number; away: number; atMs: number }>;
}
export function bindClaim(match: MatchLike, anonId: string, pubkey: string, method: 'passkey' | 'privy', nowMs: number): ClaimRecord {
  const side = (match.rooted.get(anonId) as ClaimRecord['side']) ?? null;
  const pred = match.predictions.get(anonId);
  const call = pred ? { home: pred.home, away: pred.away } : null;
  return { pubkey, method, side, call, matchId: match.matchId, boundAtMs: nowMs };
}
