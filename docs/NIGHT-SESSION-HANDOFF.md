# ROOOT — Night-Session Handoff

*Coordinator · Jul 16 evening · deadline **Jul 19 23:59 UTC** (~3 days)*

Everything from this session is done, verified, and committed on `main`. This is the
one-page picture for tonight: what landed, what the Codex review turned up, the
decisions that are yours, and the run-order.

---

## Bottom line

The **collect flow works end-to-end** and is verified in a real browser:
gate → surfaces → loom weaves the real ENG-ARG feed → **seals** → **Collect** →
mint → the scarf shows in the **cabinet**. The three things you hit in your
smoke-test are all fixed.

**One action is yours and yours only: the production deploy.** `main` is ahead of
`rooot.club`; prod deploys are a manual `vercel --prod` and the deploy classifier
blocks an agent from running it. Nothing else is blocking.

---

## What your smoke-test found → what happened

| You saw | Cause | State |
|---|---|---|
| Scarf minted but **not in the cabinet** | cabinet never loaded the album adapter — it could only read local cloths, never your on-chain album | **fixed + verified** against your real album (scarf renders: "ENG 1–2 ARG · Nº 025") |
| **Loom Collect didn't work** | (a) loom lacked the passkey stack → claim would fail; (b) prod's ENG-ARG is stuck LIVE·102', never seals | (a) **fixed**; (b) **solved** by the sealed replay below |
| Scarf **on-chain** (right image?) | — | the minted image **is the real woven loom** (788×2034 capture), not the fallback — capture succeeded |

**The sealed replay (the big one):** `/live` now serves a self-contained fast-forward
of the **real recorded ENG-ARG feed** — weaves the actual odds/goals to FULL_TIME,
seals, shows Collect. No dependency on the stuck prod live-room. ~30s, honest (real
messages, only dead-air gaps compressed).

---

## Committed this session (on `main`, not yet on prod)

| Commit | What |
|---|---|
| `5b8b7e1` | cabinet reads the on-chain album; loom Collect gets its passkey stack |
| `5a367b5` | `/live` sealed replay — weaves the real ENG-ARG feed to full time |
| `5f0dc50` | Codex-review hardening (5 fixes, below) |

---

## Codex adversarial review — FIXED (5)

Commissioned a read-only Codex (gpt-5.2) pass over the whole changeset. Acted on and
verified:

1. **Replay `?match=` hijack** — `/live?match=<other>` re-themed + mis-minted the real
   ENG-ARG feed under another team. Now **hard-bound** to fixture 18241006 (data,
   theme, and mint id locked together); `?match` ignored in replay.
2. **`/loom` was dead** — rewrote to the loom but the adapter's gate excluded the
   pathname, so the ARG-CPV *specimen* played. Now seals like `/live`.
3. **Cabinet XSS** — on-chain album fields went into `innerHTML` unescaped; a
   foreign asset (if the collection filter fails open, see #6 below) could inject
   markup. Now escaped — verified `<img onerror>`/`<script>` render as inert text, no
   execution, real scarf unchanged.
4. **`?replay=1&demo=1` stall** — mixed modes loaded one feed but booted another.
   Replay now wins cleanly.
5. **Bake could publish an unsealable hero** — the bake now aborts unless the source
   yields a terminal FULL_TIME **and** the real settled 1–2 final.

---

## Codex review — FLAGGED for tonight (your calls)

These are real but are either pre-existing, values-calls, or bigger than a quick fix.
My recommendation on each:

- **[decision] Mint auth — anyone can mass-mint.** The walletless passkey mint is
  service-paid and the server doesn't prove key-ownership (no signed nonce). On devnet
  it means bots could mint junk scarves (free SOL + Irys cost). **Pre-existing, not
  from this session.** *Rec: acceptable for the devnet submission; note as the #1
  mainnet hardening (sign a server nonce with the derived key). ~half a day if you
  want it before submission.*
- **[decision] Law-8 fallback.** On capture failure the mint substitutes a code-drawn
  `scarf-svg`/gradient — which is exactly what **your law 8** forbids. Capture
  currently works, so it rarely triggers. *Rec: fail **closed** (leave Collect
  retryable) instead of minting a substitute. Your call — it's your law.*
- **[pre-deploy check] Collection durability.** The scarf-collection address cache
  lives in ephemeral `.secrets/`, not the `/data` volume. A Fly redeploy could lose
  it → a **new** collection → **every cabinet goes empty** and the album fails *open*.
  This directly threatens the cabinet fix. *Rec: before tonight's stands deploy, pin
  the collection address (or set `ROOOT_SCARF_COLLECTION_CACHE=/data/…`) and make the
  album fail **closed**. Cheap + important.*
- **[polish] PRF-less devices can't collect** (Privy path deferred) → generic error.
  Demo device is fine. *Rec: add a clear "can't collect on this device yet" message.*
- **[polish] Hero feed is 2.64 MB** (67% duplicated raw envelopes), parsed
  synchronously on the phone-first hero. *Rec: slim the bake to fields the loom reads.*
- **[minor] Early 2nd-half odds pin at 48'** (clock reset vs monotonic guard).
  Cosmetic, pre-existing.

Codex verified as **sound**: feed is honest (real order, no synthesis; 5s cap/30s
speed change pacing only), no secrets in the diff/feed, Collect stays hidden until
seal, mint is full-time-gated + idempotent, all typechecks pass.

---

## Verified this session (evidence)

- `/live` + `?replay=1&match=<other>` → both seal **ENG 1–2 ARG** (screenshots taken).
- `?demo=1` → still SUI-COL (no regression).
- Cabinet → real scarf renders from the on-chain album; XSS escaped (no execution).
- Keepsake export (`?keepsake&export=1`) → sealed ENG-ARG, `loomKeepsake.ready` — the
  mint-capture roundtrip holds.
- typecheck green (root/web/stands); re-bake passes the new gates (feed byte-identical).

---

## Run-order for tonight

1. **Deploy** — `vercel --prod` (web) and, if touching stands, `flyctl deploy`. This
   is the linchpin; everything above is waiting on it.
2. **Before the stands deploy:** settle the **collection-durability** check so cabinets
   survive the redeploy.
3. **Spot-check on prod:** `/live` seals + Collect; `/loom` seals; one real Collect →
   cabinet shows it. (Watch Fly logs for `captured the fan's loom keepsake` vs
   `falling back to scarf-svg`.)
4. **Decisions:** law-8 fallback (fail-closed?), mint-auth scope for submission.
5. **If time (polish):** slim the hero feed; PRF-less error copy; refresh
   `SUBMISSION-tech-doc.md` (still Jul 14).
