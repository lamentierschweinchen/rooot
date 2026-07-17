# External site analysis — rooot.club (owner-supplied, 2026-07-17)

*Source: an external full-site analysis the owner brought in during the submission
push. The coordinator verified the critical claims against prod the same day —
verification results inline in [square brackets]. This is the infrastructure/SEO/
trust lens; the UX lens is `2026-07-16-cold-ux/report.html`.*

---

**What it is:** A live-match companion for the 2026 World Cup — you pick a side,
call the score, cheer in a virtual stand, and a "loom" weaves the market + match
events into a scarf that mints on-chain (Solana) at full time into your "cabinet".
Full loop walked: landing → gate → ground (full-time ENG 1–2 ARG replay) → collect
(scarf Nº 027) → cabinet.

## What's genuinely strong

- **Brand & concept** — the ticket-stub/woven-cloth identity is coherent,
  distinctive, memorable. The "what's real" honesty framework (market =
  probability, crowd = raw counts, chain = provenance, never blended) is a real
  differentiator vs. prediction/betting apps.
- **Performance baseline** — pages 10–29 KB, TTFB ~0.3s, inline CSS, self-hosted
  subset fonts with `font-display:swap`.
- **Smart engineering** — the fixture manifest rotates "tonight's match" with zero
  page edits; proper 404 status codes; HSTS; HTTP→HTTPS; per-page titles;
  aria-labels on the confidence pips.

## Critical — broken right now [all VERIFIED on prod 2026-07-17]

1. **Homepage hero image 404** — `/plate/gens/stadium-hero.png` doesn't exist
   [verified: 404; referenced as the landing's CSS background]. First impression
   is a broken visual. Fix the path + fallback background so a missing image never
   leaves a void.
2. **Stale fixture = state whiplash** — fixture.json kickoff 15 Jul, but landing
   says "TONIGHT 21:00" [verified ×3] and the gate "GAME STARTS AT 21:00"; clicking
   through dumps into FULL TIME + collect. No post-match state exists. Add one:
   "FULL TIME — see how it wove · next match →", retire fixtures after the whistle.
3. **Homepage has no favicon** — favicon.svg exists and is linked on /demo and
   /gate but not on / [verified: 0 refs].

## High-impact improvements

- **Say what it is, faster.** Landing copy is atmospheric but doesn't say
  predict → cheer → collect. The demo page nails it: "Follow the games live.
  Predict, cheer, and collect." Put that clarity on the homepage. Add a
  "no stakes, no betting" reassurance near the market numbers (odds-like numbers
  invite gambling-adjacent assumptions in some jurisdictions).
- **Explain ownership at collect.** Nº 027 minted with no wallet, account, or
  explanation — where does the scarf live? What happens on a new device? One line
  at collect time. **Related bug:** the cabinet's SCARVES shelf stayed empty after
  collecting — the item landed under CARDS, contradicting the promise.
  [Coordinator note: Nº 027 post-dates the Jul-16 cabinet fix → suspect an
  album-refresh race after mint; VERIFY with a fresh-device collect before fixing.]
- **Fix the cold-start stands.** "FROM 1 PREDICTION · 0 here" makes the social core
  feel empty. Honest options only: tournament-wide aggregates ("14,203 entered this
  gate all tournament"); pooling/invites are the roadmapped friend layer.
- **SEO & sharing basics** [verified: robots.txt 404, sitemap.xml 404, www serves a
  200 duplicate, og.png = 912 KB]: add robots + sitemap; 301 www→apex; compress
  og.png <300 KB; searchable title ("ROOOT — live World Cup predictions, crowds &
  collectible scarves") + SportsEvent structured data; share card for the scarf
  ("I called ENG 1–2 — scarf Nº 027").
- **Retention plumbing:** no reminders (.ics / push), no upcoming-fixtures list, no
  archive, no PWA manifest or apple-touch-icon. A fixtures strip is the cheapest.

## Polish list

- Trust pages: no footer, About, Contact, Privacy, Terms — table stakes for
  anything on-chain.
- Caching: fonts/images ship `max-age=0, must-revalidate`; `/plate/*` should be
  immutable.
- Desktop ground/gate: the phone-width strip floats in dead space — device frame +
  side panel.
- Contrast/type: the 9px gold "TONIGHT 21:00" and gold-on-cream small text likely
  fail WCAG AA; "HOW SURE?" pips have aria-labels but no visible selected labels.
- Localization later.

**Suggested order:** the 3 criticals today (small), then SEO/canonical + share
cards + post-match state, then reminders/fixtures/PWA + custody explainer.
**Don't touch the voice or the honesty framework — those are the moat.**
