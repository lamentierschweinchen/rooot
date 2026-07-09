import { resolveScarfCollectionAddress } from '../mint/collection';

export interface AlbumScarf { asset: string; name: string; matchId: string | null; side: string | null; call: { home: number; away: number } | null; image: string | null; }
interface DasAttr { trait_type: string; value: string; }
interface DasAsset { id: string; content?: { metadata?: { name?: string; attributes?: DasAttr[] }; json_uri?: string; links?: { image?: string } }; }

function attr(a: DasAsset, k: string): string | null {
  const list = a.content?.metadata?.attributes || [];
  const hit = list.find((x) => x.trait_type === k);
  return hit ? String(hit.value) : null;
}
function parseCall(v: string | null): { home: number; away: number } | null {
  if (!v) return null; const m = /^(\d+)-(\d+)$/.exec(v); return m ? { home: +m[1]!, away: +m[2]! } : null;
}
export function shapeAlbum(assets: DasAsset[]): AlbumScarf[] {
  const out: AlbumScarf[] = [];
  for (const a of assets) {
    const name = a.content?.metadata?.name; if (!name) continue; // drop malformed, never fake
    out.push({ asset: a.id, name, matchId: attr(a, 'matchId'), side: attr(a, 'side'), call: parseCall(attr(a, 'call')), image: a.content?.links?.image ?? null });
  }
  return out;
}
export async function assetsByOwner(pubkey: string, rpcUrl: string): Promise<AlbumScarf[]> {
  const res = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'seat', method: 'getAssetsByOwner', params: { ownerAddress: pubkey, page: 1, limit: 200 } }) });
  const json = await res.json() as any;
  // Resolved PER CALL (not a module-load-time constant) so this always agrees with mint/collection.ts's
  // ensureScarfCollection on which collection to trust — including right after the very first claim
  // in a process's life, the one that creates the collection and writes its cache file (Task 6b).
  const scarfCollection = resolveScarfCollectionAddress();
  const items: DasAsset[] = (json?.result?.items || []).filter((a: any) => !scarfCollection || (a.grouping || []).some((g: any) => g.group_key === 'collection' && g.group_value === scarfCollection));
  return shapeAlbum(items);
}
