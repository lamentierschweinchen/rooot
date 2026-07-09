/**
 * mintScarfForClaim (Task 6b step 4) — the claim → mint glue for a REAL match claim. Builds an
 * honest MatchRelicData (mint/relic-from-match.ts), uploads it with the fan's matchId/side/call
 * folded into `attributes` (mint/metadata.ts's buildFanAttributes), and mints it owned by the
 * fan's pubkey into the shared ROOOT scarf collection (mint/collection.ts) — service pays, fan
 * owns, devnet only.
 *
 * NEVER THROWS: every failure (no fixture identity, RPC hiccup, insufficient devnet SOL, Irys
 * hiccup, malformed data) is caught and logged; the caller always gets a value back (`null` on
 * any failure) so a mint problem can never cost the fan their already-saved bind
 * (server.ts's handleSeatClaim saves the profile BEFORE calling this).
 */
import type { ClaimRecord } from './claim';
import { buildRelicFromMatch, type LiveScoreSnapshot } from '../mint/relic-from-match';
import { buildFanAttributes, buildClaimDescription } from '../mint/metadata';
import { uploadRelic } from '../mint/storage';
import { mintRelic } from '../mint/mint';
import { makeScarfCoverPng } from '../mint/cover';
import { ensureIrysFunded } from '../mint/irys-fund';
import { getMintRuntime } from '../mint/runtime';

export type { LiveScoreSnapshot };

export interface ScarfMint {
  asset: string;
  txUrl: string;
}

export async function mintScarfForClaim(record: ClaimRecord, score: LiveScoreSnapshot): Promise<ScarfMint | null> {
  try {
    const relic = buildRelicFromMatch(record.matchId, score);
    if (!relic) {
      console.warn(`[seat:mint] no fixture identity for matchId=${record.matchId} — skipping mint (bind still saved)`);
      return null;
    }

    const { umi, cluster, collection } = await getMintRuntime();
    const cover = makeScarfCoverPng();
    const capturedAtISO = new Date().toISOString();
    await ensureIrysFunded(umi, cover.length + 8192);

    const fanAttrs = buildFanAttributes({ matchId: record.matchId, side: record.side, call: record.call });
    const uris = await uploadRelic({ bytes: cover, mime: 'image/png' }, relic, umi, {
      imageUri: '', // overwritten by storage.ts after the cover upload
      mime: 'image/png',
      live: true, // the included data (fixture identity + the score as of claim time) IS real
      capturedAtISO,
      metaTransform: (md) => ({
        ...md,
        // Honesty seam: the frozen live-branch description/verify text assumes a fully-aggregated,
        // finished match — override both so this minimal relic never overclaims (see
        // mint/metadata.ts's buildClaimDescription doc comment).
        description: buildClaimDescription(relic, score.decided),
        attributes: [...md.attributes, ...fanAttrs],
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
    return { asset: result.asset, txUrl: result.txUrl };
  } catch (err) {
    console.warn(`[seat:mint] mint failed for ${record.pubkey.slice(0, 8)} @ ${record.matchId}: ${String(err)}`);
    return null;
  }
}
