# Production crowd-signal systems — research for ROOOT's stands

Read-only research. Goal: how do production real-time audience systems architect
*ephemeral* crowd signals (data structures, lifecycle, reveal mechanics,
anti-fabrication stances), and where does ROOOT's `services/stands` already
match / diverge / lead.

---

## Part 1 — External research

### (a) Twitch chat + hype train

- **Chat fan-out**: Twitch chat (Go) splits into **Edge** (client-facing, speaks
  IRC-over-TCP/WebSocket) and **Pubsub** (internal fan-out to every Edge node
  subscribed to a topic) — a hierarchical broadcast tree, not one global
  broadcast. [Twitch Engineering overview](https://blog.twitch.tv/en/2015/12/18/twitch-engineering-an-introduction-and-overview-a23917b71a25/), [Group Chat engineering](https://blog.twitch.tv/en/2014/04/03/technically-speaking-group-chat-and-general-chat-engineering-86d6cb40a02c/)
- **Rate limiting is a literal token bucket**: "Twitch keeps a number of
  remaining requests [per user]... a request uses up a token from the bucket."
  Exceeding it **silently drops** the message (no error, no queue). Duplicate
  messages within 30s are also dropped server-side. [pajbot/tmi-rate-limits](https://github.com/pajbot/tmi-rate-limits), [Twitch dev forums](https://discuss.dev.twitch.com/t/trying-to-understand-chats-rate-limit/11693)
- **Hype Train**: contributions (bits, gift subs) are counted individually in
  real time; "Conductor" = current top contributor, a title that can be stolen
  live. Progress event distributed via the same Pubsub broker. Level-ups are
  discrete, server-computed thresholds, not a smoothed/approximate metric.
  [Twitch Hype Train guide](https://help.twitch.tv/s/article/hype-train-guide?language=en_US)
- **What's authoritative vs approximate**: the token-bucket-gated message *is*
  the count (post-throttle) — Twitch doesn't try to reconstruct "true" tap
  volume behind the throttle, it just decides what's ADMITTED and that
  admitted stream is truth. No hidden "real" number beneath a smoothed display.

### (b) HQ Trivia — architecture + scaling

Public detail is thin (no official postmortem found); pieced together from
retrospectives:
- Peaked at **600K average / 1.7M spike concurrent** viewers on RTMP-based live
  video + a separate answer channel. [Mux: How to Build Interactive Live Video](https://www.mux.com/blog/how-to-build-interactive-live-video-remember-hq-trivia), [Trembit architecture retrospective](https://trembit.com/blog/hq-trivia-software-architecture/)
- Inferred stack: Node.js answer-ingest tier, **Redis as a shock absorber in
  front of Postgres** — "the relational database physically can't make one
  million data savings in a very short period" — i.e., a durable store cannot
  be the hot write path for a synchronized-instant event; an in-memory tier
  absorbs the spike and folds to durable storage after.
- The famous failure mode wasn't the count logic — it was **synchronized
  client playback**: everyone needs the *same* 10-second countdown, and video
  buffering skew meant some phones saw the question late and were eliminated
  unfairly. Users reported taps not registering before time-out. This is a
  clock-sync/fairness problem, not a counting-honesty problem. [D2iQ: edge computing prescription](https://d2iq.com/blog/hq-trivia), [SlashGear retrospective](https://www.slashgear.com/1370704/hq-trivia-most-disastrous-moments/)
- Lesson for ROOOT: **the danger zone is stamping a fan's action against a
  clock/market that's already moved by the time it's server-processed**,
  exactly the problem `NEXT GOAL`'s `marketAtCall` stamping and PREDICT's
  `marketAtPredict` are designed to solve by stamping server-side truth, not
  trusting a client-side instant.

### (c) Slido / Kahoot / Mentimeter — live polling

Least technically-documented of the five (no engineering blogs found; only
product marketing and generic "how to build a Kahoot clone" tutorials — these
are treated as low-confidence and mostly excluded). What's consistent across
generic-but-repeated descriptions: [PubNub: live audience polling](https://www.pubnub.com/blog/live-audience-polling-system/)
- Standard shape: WS/pubsub ingest → **durable authoritative store is the
  vote row** (userId, option, timestamp) → live view is a *read-side*
  aggregate recomputed on change, not the source of truth itself.
- No public source documents **vote dedup** or **late-joiner** mechanics in
  technical detail — these are treated as solved-by-obvious-means (unique
  constraint on user+question) rather than written up anywhere.
- Kahoot's only public engineering data point is infra, not logic: migrated
  off self-managed VMs to **GKE for elastic capacity at peak hours** — a scale
  statement, not a counting-honesty one. [Kahoot Google Cloud case study](https://cloud.google.com/customers/kahoot)
- Conclusion: this category is architecturally boring by design — "single
  authoritative row per (user, question), aggregate is derived" is the whole
  pattern, and nobody publishes more because there isn't more.

### (d) Stadium / second-screen fan apps

- **Uplause** (NFL/NBA/NHL/NCAA game-day vendor) ships a live decibel meter and
  a "vote by cheer" mechanic — i.e., a commercial product already sells
  exactly ROOOT's `roar` concept as a licensed stadium feature. [Uplause](https://www.uplause.com/)
- **MLB's 2020 fan-noise app** is the sharpest contrast point found: it
  "tracks the **percentage** of fans cheering for each team" and feeds that
  into stadium speaker mix — i.e. a real commercial system that takes honest
  per-fan taps and **deliberately converts them into a percentage/vibe** for
  presentation. This is precisely the pattern AGENTS.md law #1 forbids ("never
  dressed as a percentage"). [Bleacher Report](https://bleacherreport.com/articles/2900985-mlb-will-allow-fans-to-use-app-to-influence-crowd-noise-from-home-during-games), [SI: conductor with an iPad](https://www.si.com/mlb/2020/09/05/baseball-fake-crowd-nosie)
- **HearMeCheer** (Iowa State) and **MyApplause** both stream real fan audio
  into the stadium PA — same "real signal, not synthetic" ethic ROOOT applies
  to counts, but for audio. Players quoted saying it "is a completely
  different story" knowing the noise is real vs canned — direct evidence that
  fans/players *can tell* and *do care* whether a crowd signal is real,
  supporting AGENTS.md law #1's premise. [NBC Bay Area: Invisible Crowd](https://www.nbcbayarea.com/news/sports/the-invisible-crowd-inside-the-nfls-fake-crowd-noise-system/2381799/)
- No public second-screen system documents "ends"/section-based identity at
  the protocol level (NBA/NFL app writeups are product features — in-app
  predictions, multiview — not architecture). [NBA app 2024-25 features](https://www.nba.com/news/nba-app-launches-new-features-ahead-of-2024-25)

### (e) Presence systems — heartbeat vs connection-count

- **Discord**: presence is **deliberately never persisted** — it lives only in
  per-guild in-memory processes, fanned out via pub/sub on change. At scale
  (30K+ concurrent in one guild) naive fan-out (send to every session
  process) became the bottleneck; they built **Manifold** to batch/partition
  fan-out by node and by core rather than message every socket individually.
  [Discord: Scaling Elixir to 5M concurrent users](https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users)
- **Slack**: dedicated in-memory **Presence Servers**, users consistently
  hashed to a shard; critically, clients only **subscribe to presence for
  users currently visible on screen** — presence updates were ~60% of total
  event volume before this filter. They moved from broadcast to
  scoped-pub/sub for exactly this reason. [Slack: Real-time Messaging](https://slack.engineering/real-time-messaging/)
- **General pattern** (heartbeat vs connection-count): a raw "socket is open"
  count silently drifts from reality because TCP can die without a close
  event (NAT timeout, network switch, mobile handoff) — "the server believes
  200,000 clients are connected while the actual number is far lower."
  Standard fix: heartbeat/ping-pong on ~25-30s interval, terminate on missed
  pong; presence-as-TTL-in-Redis is the equivalent pattern for HTTP-fronted
  presence. [OneUptime: WebSocket presence detection](https://oneuptime.com/blog/post/2026-02-02-websocket-presence-detection/view), [OneUptime: WebSocket heartbeat](https://oneuptime.com/blog/post/2026-01-27-websocket-heartbeat/view)
- Nobody in this research treats "connection count" and "heartbeat-verified
  liveness" as interchangeable — every serious writeup treats raw connection
  count as a known liar and heartbeat as the correction layer.

---

## Part 2 — ROOOT's actual architecture (mapped)

Read directly: `services/stands/src/server.ts`, `decay.ts`, `match-state.ts`,
`registry.ts`, `contracts/crowd.ts`, `docs/MECHANISMS.md`, `docs/ENGAGEMENT.md`.

| Concept | File : symbol | Shape |
|---|---|---|
| Per-user throttle | `decay.ts:TokenBucket` (cap 8, refill 3/s) | Classic token bucket — same primitive as Twitch IRC's rate-limit buckets |
| Aggregate rate ("roar") | `decay.ts:RollingCounter` (3s window, second-bucketed ring) | Sliding-window counter, same family as the "sliding window counter" pattern used for API rate limiting generally |
| Presence | `match-state.ts:connected` (anonId→refcount) + `server.ts:conns` (socket→state) | Refcounted by **socket adoption**, not a naive Set — survives multi-tab; corrected for TCP-lies by... |
| Heartbeat | `server.ts:wsHeartbeatIntervalMs`, `isAlive` on `ConnState` | ws-level ping/pong, terminate on missed pong — added as **Fix F1b** specifically because Fly's proxy silently dropped idle sockets, i.e. ROOOT independently hit and fixed the exact "connection count lies" problem the presence research warns about |
| Eviction gate's live count | `registry.ts:roomClientCount` hook | Superset of `presenceCount()` — counts feed-only sockets too, so eviction can never fire under a genuinely-watching fan |
| Discrete per-tap signal | `server.ts:emitCheerEcho` / `CheerEchoMsg` | 1:1 with server-accepted (post-throttle) cheer messages, capped at 15/s, silently dropped past cap — mirrors Twitch's "admitted stream is the whole truth, no smoothing beneath it" |
| Windowed reveal | `server.ts:momentLifecycle` / `beginMoment` / `endMoment`, `REACT_WINDOW_MS`=25s | Open→collect→close-on-timer→aggregate histogram; **trigger dedup by real event id** (`openedTriggerIds`), persisted across restarts via registry hooks — closes the exact "replay re-fires an already-run moment" class of bug |
| Late-joiner mid-window catch-up | `server.ts:replaySnapshot` → `activeMomentSnapshot()` | A joiner mid-window gets the open moment immediately, can still react — same need HQ Trivia/Kahoot have, handled |
| Honest-empty aggregation | `match-state.ts:endMoment`'s `fold()` | An end with zero reactors returns `{top:'', pct:0, hist:{}, n:0}` — never fabricated |
| Async durable side-effect, decoupled from hot path | `server.ts:crystallizeSentiment` → `anchorRecordHash().then()` + `backfillAnchors()` sweep | Fire-and-forget on-chain anchor, healed by a periodic disk-driven sweep if the write-back is lost — same shape as HQ Trivia's Redis-in-front-of-Postgres shock absorber, but with an explicit repair loop |
| Consensus (crowd belief, distinct from market) | `match-state.ts:consensus()`, `contracts/crowd.ts:ConsensusMsg/PredictGroup` | Every group always carries `n` (real sample size) alongside derived stats — never a bare percentage |

---

## Part 3 — Synthesis: patterns → adopt/adapt/skip

| # | Pattern | Who does it | ROOOT seam | Verdict | Effort |
|---|---|---|---|---|---|
| 1 | Per-user token-bucket throttle feeding an aggregate rate counter | Twitch IRC rate-limit buckets | `decay.ts: TokenBucket` + `RollingCounter` | **Already adopted**, matches production shape closely (Twitch: silent drop past bucket; ROOOT: same). No action — maybe log-sample drop rate if cheer spam ever becomes a real incident. | none |
| 2 | Heartbeat-verified liveness, not raw connection count | Discord/Slack presence, general WS guides | `server.ts: wsHeartbeatIntervalMs`/`isAlive`, `registry.ts: roomClientCount` | **Already adopted** — and for the *right* documented reason (Fly proxy silently dropping idle sockets, Fix F1b). This is independently-arrived-at best practice. | none |
| 3 | Windowed reveal with server-side event-id dedup, persisted across restart | HQ Trivia/Kahoot/Slido's implicit answer-window shape (undocumented publicly); Twitch Hype Train's discrete level events | `server.ts: momentLifecycle`/`openedTriggerIds` (+ registry persistence hooks) | **Already adopted, arguably ahead of what's publicly documented** — the cross-restart replay-dedup (`openedTriggerIds`, `nextGoalResolvedIds` surviving a `REPLAY_FILE`/TxLINE reseed) is a specific hardening no researched source describes; this class of bug (double-fire on restart) is exactly what bit HQ Trivia-style systems in outages generally. | none — keep as reference pattern for any NEW windowed mechanic added later |
| 4 | Scoped/filtered pub-sub fan-out instead of full broadcast, once presence volume is large | Slack (visible-only presence), Discord (Manifold batched fan-out) | `server.ts: broadcastToMatch` (full per-room broadcast to every socket) | **Skip at hackathon/MVP scale.** One match room tops out at low-thousands of sockets on a single Fly instance; Slack/Discord only needed this at 10K+ fan-out per event. Revisit ONLY if a real World Cup match room is expected to carry >~5-10K concurrent sockets on one instance — then shard by matchId (already the natural boundary) before touching fan-out-within-a-room. | large (defer) |
| 5 | Recognition/leaderboard for top contributors ("Conductor") | Twitch Hype Train | n/a — no ROOOT equivalent | **Deliberate skip, and say so explicitly.** This is the one Twitch pattern that actively conflicts with AGENTS.md law #3 (no wager, nothing to flip) and law #1's anti-performative-metrics spirit — a leaderboard turns cheering into a status game. Not an oversight; a fit mismatch. | n/a |

---

## Part 4 — Where ROOOT is already differentiated (research-backed)

The research supports treating "real counts only, never dressed as a
percentage" as a genuine point of difference, not just a nice principle:

- **MLB's own pandemic-era fan app did the opposite** — it took real per-fan
  taps and converted them into a *percentage* for stadium presentation. A
  real, shipped, commercial sports-tech product made exactly the choice
  AGENTS.md law #1 forbids. ROOOT's `StandsStateMsg`/`ConsensusMsg` always
  carry raw counts + `n`, never a bare percent.
- **No researched system (Twitch/Discord/Slack/HQ Trivia/Slido-class) documents
  an "honestly empty" rule** — i.e., explicitly returning a null/zero result
  rather than a synthesized one when nobody reacted. ROOOT's `match-state.ts:
  endMoment`'s `fold()` (`top:''` when `n===0`) is a small but real,
  code-enforced anti-fabrication behavior nothing in the research literature
  calls out as a named practice elsewhere.
- **The "three beliefs, never blended" framing** (market / crowd / result,
  each its own visual material — `docs/ENGAGEMENT.md`) has no clean industry
  parallel in what was found. Prediction-market-adjacent products either show
  ONE number (the market) or blend social sentiment into a single "buzz"
  score. Showing crowd-belief and market-belief side by side, explicitly
  un-blended, reads as a genuinely novel product decision rather than a
  pattern borrowed from anywhere researched — worth stating plainly rather
  than searching for a false precedent.
- Player quotes on MLB/NFL fake-vs-real crowd noise ("knowing cheers are
  created by people at home... is a completely different story") are
  qualitative evidence that the honesty distinction ROOOT is built on is
  perceptible and valued by the people closest to the product category, not
  just an internal principle.

---

## Sources

- [Twitch Engineering: An Introduction and Overview](https://blog.twitch.tv/en/2015/12/18/twitch-engineering-an-introduction-and-overview-a23917b71a25/)
- [Twitch: Group Chat and General Chat Engineering](https://blog.twitch.tv/en/2014/04/03/technically-speaking-group-chat-and-general-chat-engineering-86d6cb40a02c/)
- [Twitch Hype Train Guide (official help)](https://help.twitch.tv/s/article/hype-train-guide?language=en_US)
- [pajbot/tmi-rate-limits — TMI message rate limits](https://github.com/pajbot/tmi-rate-limits)
- [Twitch Developer Forums: chat rate limit](https://discuss.dev.twitch.com/t/trying-to-understand-chats-rate-limit/11693)
- [Mux: How to Build Interactive Live Video (HQ Trivia)](https://www.mux.com/blog/how-to-build-interactive-live-video-remember-hq-trivia)
- [Trembit: HQ Trivia software architecture analysis](https://trembit.com/blog/hq-trivia-software-architecture/)
- [D2iQ: Dear HQ Trivia, edge computing](https://d2iq.com/blog/hq-trivia)
- [SlashGear: HQ Trivia's most disastrous moments](https://www.slashgear.com/1370704/hq-trivia-most-disastrous-moments/)
- [PubNub: Live Audience Polling System](https://www.pubnub.com/blog/live-audience-polling-system/)
- [Kahoot Google Cloud case study](https://cloud.google.com/customers/kahoot)
- [Uplause — stadium fan engagement](https://www.uplause.com/)
- [Bleacher Report: MLB fan-noise app tracks cheer percentage](https://bleacherreport.com/articles/2900985-mlb-will-allow-fans-to-use-app-to-influence-crowd-noise-from-home-during-games)
- [SI: What's behind MLB's fake crowd noise](https://www.si.com/mlb/2020/09/05/baseball-fake-crowd-nosie)
- [NBC Bay Area: The Invisible Crowd (NFL fake crowd noise)](https://www.nbcbayarea.com/news/sports/the-invisible-crowd-inside-the-nfls-fake-crowd-noise-system/2381799/)
- [NBA App 2024-25 features](https://www.nba.com/news/nba-app-launches-new-features-ahead-of-2024-25)
- [Discord: How Discord Scaled Elixir to 5,000,000 Concurrent Users](https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users)
- [Slack Engineering: Real-time Messaging](https://slack.engineering/real-time-messaging/)
- [OneUptime: WebSocket Presence Detection](https://oneuptime.com/blog/post/2026-02-02-websocket-presence-detection/view)
- [OneUptime: WebSocket Heartbeat/Ping-Pong](https://oneuptime.com/blog/post/2026-01-27-websocket-heartbeat/view)
- [Rate limiting algorithms: token bucket vs sliding window (Arcjet)](https://blog.arcjet.com/rate-limiting-algorithms-token-bucket-vs-sliding-window-vs-fixed-window/)

### ROOOT files read
`services/stands/src/server.ts`, `services/stands/src/decay.ts`,
`services/stands/src/match-state.ts`, `services/stands/src/registry.ts`,
`contracts/crowd.ts`, `docs/MECHANISMS.md`, `docs/ENGAGEMENT.md`.
