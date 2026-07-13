/**
 * THE ALBUM — assets-by-owner (DAS), shaped into the AlbumScarf record
 * archive/design-docs-consumed/design/HANDOFF-coordinator-data-wiring.md specifies verbatim: home/away
 * tricodes, final score, the fan's call, the 3-state result, comp, date,
 * serial. Drops malformed assets — never fakes a field. Ported from the
 * your-seat branch's seat/album.ts; ADAPTED here for the richer scarf shape
 * (the your-seat original carried only matchId/side/call).
 */
import { resolveScarfCollectionAddress } from '../mint/collection';

export interface AlbumScarf {
  asset: string;
  home: string;
  away: string;
  score: string;
  call: string | null;
  result: 'exact' | 'outcome' | 'wrong' | null;
  comp: string;
  date: string;
  serial: string;
  matchId: string;
  image: string | null;
}
interface DasAttr { trait_type: string; value: string; }
interface DasAsset { id: string; content?: { metadata?: { name?: string; attributes?: DasAttr[] }; json_uri?: string; links?: { image?: string } }; }

function attr(a: DasAsset, k: string): string | null {
  const list = a.content?.metadata?.attributes || [];
  const hit = list.find((x) => x.trait_type === k);
  return hit ? String(hit.value) : null;
}
function asResult(v: string | null): 'exact' | 'outcome' | 'wrong' | null {
  return v === 'exact' || v === 'outcome' || v === 'wrong' ? v : null;
}

/** Shape raw DAS assets into AlbumScarf records. Drops (never fakes) any asset missing one of the
 * always-real structural facts (name/matchId/home/away/score/comp/date/serial) — a genuine ROOOT
 * scarf mint always writes all of these together (mint-scarf.ts), so a gap means either a
 * malformed/foreign asset or a pre-reconciliation scarf from the your-seat branch's older,
 * thinner attribute set; either way, honesty says drop it rather than half-render it. `call` and
 * `result` stay nullable — a fan who claimed without ever locking a numeric prediction has neither,
 * honestly (never invented). */
export function shapeAlbum(assets: DasAsset[]): AlbumScarf[] {
  const out: AlbumScarf[] = [];
  for (const a of assets) {
    const name = a.content?.metadata?.name;
    if (!name) continue; // drop malformed, never fake
    const matchId = attr(a, 'matchId');
    const home = attr(a, 'home');
    const away = attr(a, 'away');
    const score = attr(a, 'score');
    const comp = attr(a, 'comp');
    const date = attr(a, 'date');
    const serial = attr(a, 'serial');
    if (!matchId || !home || !away || !score || !comp || !date || !serial) continue; // drop malformed, never fake
    out.push({
      asset: a.id,
      home,
      away,
      score,
      call: attr(a, 'call'),
      result: asResult(attr(a, 'result')),
      comp,
      date,
      serial,
      matchId,
      image: a.content?.links?.image ?? null,
    });
  }
  return out;
}
export async function assetsByOwner(pubkey: string, rpcUrl: string): Promise<AlbumScarf[]> {
  const res = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'seat', method: 'getAssetsByOwner', params: { ownerAddress: pubkey, page: 1, limit: 200 } }) });
  const json = await res.json() as any;
  if (json?.error) {
    // Never crash the album route over a DAS-incapable RPC — but a silent empty array on a real
    // error would look identical to "this fan genuinely owns nothing yet." Log it so a bad RPC
    // (e.g. HELIUS_RPC_URL unset, falling back to a non-DAS devnet endpoint) is diagnosable.
    console.warn(`[seat:album] RPC getAssetsByOwner error: ${JSON.stringify(json.error).slice(0, 200)}`);
  }
  // Resolved PER CALL (not a module-load-time constant) so this always agrees with mint/collection.ts's
  // ensureScarfCollection on which collection to trust — including right after the very first claim
  // in a process's life, the one that creates the collection and writes its cache file.
  const scarfCollection = resolveScarfCollectionAddress();
  const items: DasAsset[] = (json?.result?.items || []).filter((a: any) => !scarfCollection || (a.grouping || []).some((g: any) => g.group_key === 'collection' && g.group_value === scarfCollection));
  return shapeAlbum(items);
}
