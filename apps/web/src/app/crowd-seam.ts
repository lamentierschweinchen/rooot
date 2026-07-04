/**
 * ROOOT app — THE CROWD SEAM (props/callback interface between the shell and the
 * real stands client Lane C delivers).
 *
 * The social strip + cheer bar are built HERE against this interface, not against
 * a concrete socket. Lane C (src/data/crowd-client.ts) implements CrowdClient
 * (contracts/ledger.ts) over the stands WS; the coordinator hands us one at wire
 * time. Until then — and whenever the service is unreachable — we run against a
 * DisconnectedCrowd that reports `connected:false` and keeps an honest, clearly
 * ghosted LOCAL-ONLY cheer count so the touch surface still responds (brief §3:
 * "STANDS OPENING SOON — counts are local", never a faked crowd).
 *
 * CrowdView (contracts/ledger.ts) is COUNTS + roar, never percentages, never
 * blended with the market — the honesty separation is spatial: market on the
 * pitch, crowd in the strip/ends. This seam preserves that: it only ever carries
 * the CrowdView shape.
 */

import type { CrowdClient, CrowdView } from '@contracts/ledger';
import type { Side } from '@contracts/crowd';

/** Re-export the frozen shapes the UI binds to (one import site for the app lane). */
export type { CrowdClient, CrowdView };

/**
 * A no-service stand-in with an honest disconnected state. Cheers tick a LOCAL
 * optimistic count (clearly ghosted in the UI) so the drum still responds; roar
 * decays locally so a burst of taps swells then fades like the real meter would,
 * but it is NEVER dressed up as the real crowd — `connected` stays false and the
 * strip renders "STANDS OPENING SOON — counts are local".
 */
export function createDisconnectedCrowd(mySideRef: () => Side | null): CrowdClient {
  let cb: ((s: CrowdView) => void) | null = null;
  let localHome = 0;
  let localAway = 0;
  let roarHome = 0;
  let roarAway = 0;
  let raf = 0;
  let last = 0;

  const view = (): CrowdView => ({
    rooted: { home: localHome, away: localAway },
    roar: { home: roarHome, away: roarAway },
    faithSide: null, // no server → no faith call; the UI shows faith only when the service says so
    connected: false,
  });

  const emit = (): void => {
    if (cb) cb(view());
  };

  // local roar decay loop (only runs while subscribed) — a printed meter that
  // swells on a tap and settles. Gated: if reduced-motion, we still decay but
  // the UI paints steps, not a smooth fade.
  const decay = (now: number): void => {
    if (!last) last = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const k = Math.exp(-dt / 2.2); // ~2.2s roar half-life-ish
    const nh = roarHome * k;
    const na = roarAway * k;
    if (Math.abs(nh - roarHome) > 0.01 || Math.abs(na - roarAway) > 0.01) {
      roarHome = nh;
      roarAway = na;
      emit();
    }
    raf = requestAnimationFrame(decay);
  };

  return {
    root(_side: Side) {
      // no service to hello — the choice is stored locally by the shell; nothing to send.
    },
    cheer() {
      const side = mySideRef();
      if (side === 'home') {
        localHome += 1;
        roarHome = Math.min(30, roarHome + 3);
      } else if (side === 'away') {
        localAway += 1;
        roarAway = Math.min(30, roarAway + 3);
      }
      emit();
    },
    onState(fn) {
      cb = fn;
      emit();
      if (typeof requestAnimationFrame === 'function' && !raf) {
        raf = requestAnimationFrame(decay);
      }
    },
    close() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      cb = null;
    },
  };
}
