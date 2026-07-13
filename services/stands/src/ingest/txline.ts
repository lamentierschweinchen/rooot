/**
 * TxLINE SSE ingest — server-side, single shared connection per stream
 * (odds + scores), fanned out to every match room via contracts/normalize.ts
 * + FeedMsg.
 *
 * SSE line parsing is a deliberate copy of scripts/record.ts's approach (task
 * brief: "copy the parsing into your own file — do not import scripts/").
 * Kept close to that implementation on purpose so behavior stays predictable
 * across the two call sites; diverges only where this is a live fanout
 * instead of a file recorder (no disk writes, reconnect drives onFeedState).
 *
 * Auth: reads TXLINE_TOKEN_FILE ({ jwt, apiToken }) IN PROCESS. The token
 * values never get logged, thrown into an error message, or placed in argv —
 * only the file PATH may appear in logs.
 */
import { readFileSync } from 'node:fs';
import type { FeedMsg } from '@contracts/feed';
import type { LedgerMsg } from '@contracts/ledger';
import { parseLedgerMessage, parseLineups, parseOddsMessage, parseScoreMessage, parseSpell, parseStatusMessage } from '@contracts/normalize';
import type { FixtureRoster } from '@contracts/normalize';

const TXLINE_API = process.env.TXLINE_API ?? 'https://txline-dev.txodds.com';
const TOKEN_FILE = process.env.TXLINE_TOKEN_FILE ?? '../../.secrets/txline-token.json';

/** Read-liveness watchdog (Jul 11 NOR–ENG wedge post-mortem): the wire sends
 * an SSE heartbeat event every ~15s on BOTH streams even when the match is
 * quiet (42k+ heartbeats across each night capture), so a stream that has
 * produced ZERO BYTES for this long is dead — a silent half-open TCP drop
 * (NAT/proxy death without a FIN/RST, e.g. across the half-time idle), which
 * `reader.read()` would otherwise await FOREVER: no error, no `done`, no
 * reconnect, ingest permanently dark while the process looks alive. That is
 * exactly what NOR–ENG's second half looked like: the recorder (its own
 * TxLINE connection) captured every second-half envelope while the service
 * broadcast none of them, and no feedState transition was ever logged — the
 * read loop was parked on a dead socket. The watchdog aborts the attempt,
 * which lands in the existing catch → backoff → reconnect path (feedState
 * 'reconnecting' → 'connected'), the same path a clean network error takes.
 * Env-tunable so the dev check can run a real stall test in seconds; clamped
 * to a floor so a bad value can never busy-loop the sweeper. 60s default =
 * 4 missed heartbeats — far beyond any observed healthy gap. */
function txlineIdleTimeoutMs(): number {
  const raw = process.env.TXLINE_IDLE_TIMEOUT_MS;
  const n = raw !== undefined ? Number(raw) : 60_000;
  return Number.isFinite(n) ? Math.max(1_000, n) : 60_000;
}
const TXLINE_IDLE_TIMEOUT_MS = txlineIdleTimeoutMs();

/** Connect-phase analogue of the read watchdog above (the client adapters
 * grew the same guard — "connect-attempt watchdog", review fast-follow): a
 * fetch whose response headers never arrive would also await forever. */
function txlineConnectTimeoutMs(): number {
  const raw = process.env.TXLINE_CONNECT_TIMEOUT_MS;
  const n = raw !== undefined ? Number(raw) : 30_000;
  return Number.isFinite(n) ? Math.max(1_000, n) : 30_000;
}
const TXLINE_CONNECT_TIMEOUT_MS = txlineConnectTimeoutMs();

interface TxLineToken {
  jwt: string;
  apiToken: string;
}

function loadToken(): TxLineToken {
  const raw = readFileSync(TOKEN_FILE, 'utf8'); // let this throw with the path only, never contents
  const parsed = JSON.parse(raw) as Partial<TxLineToken>;
  if (typeof parsed.jwt !== 'string' || typeof parsed.apiToken !== 'string') {
    throw new Error(`TXLINE_TOKEN_FILE (${TOKEN_FILE}) missing jwt/apiToken fields`);
  }
  return { jwt: parsed.jwt, apiToken: parsed.apiToken };
}

type FeedState = 'connected' | 'reconnecting' | 'lost';

interface StreamOptions {
  name: 'odds' | 'scores';
  url: string;
  headers: Record<string, string>;
  fixtureIds: Set<string>;
  onFeedMsg: (msg: FeedMsg) => void;
  onFeedState: (state: FeedState) => void;
  signal: AbortSignal;
}

/** odds messages carry FixtureId (number); scores messages carry fixtureId (number) — normalize.ts keeps both under `.raw`. */
function fixtureIdOf(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = obj.FixtureId ?? obj.fixtureId;
  return typeof id === 'number' ? String(id) : null;
}

/** FixtureId straight off an unparsed wire line (pre-normalize) — for the side-truth latch lookup below. */
function rawFixtureId(data: string): string | null {
  try {
    const obj = JSON.parse(data) as { FixtureId?: unknown };
    return typeof obj.FixtureId === 'number' ? String(obj.FixtureId) : null;
  } catch {
    return null;
  }
}

/** The fixtureKey a LedgerMsg belongs to (event: id prefix; amend/discard:
 * fixtureKey) — for the same per-fixture routing the score/status paths use. */
function ledgerFixtureId(msg: LedgerMsg): string | null {
  if (msg.type === 'event') {
    const sep = msg.ev.id.indexOf(':');
    return sep > 0 ? msg.ev.id.slice(0, sep) : null;
  }
  return msg.fixtureKey || null;
}

/**
 * Side-truth latch, per fixture (contracts/normalize.ts parseOddsMessage doc):
 * the scores stream carries Participant1IsHome on every envelope; the odds
 * stream never does. The scores dispatch writes this map, the odds dispatch
 * reads it — one shared SSE covers many fixtures, hence per-FixtureId.
 * Module scope is deliberate: one service process, one day's fixtures.
 */
const p1IsHomeByFixture = new Map<string, boolean>();

/** phase-aware market hand-off, per fixture (contracts/normalize.ts
 * parseOddsMessage doc): once a fixture enters EXTRA_TIME/PENALTIES the
 * full-match 1X2 has settled and the ET-scoped 1X2 carries the belief.
 * Written by the scores dispatch, read by the odds dispatch — same
 * cross-stream latch pattern as the side-truth map above. */
const oddsPeriodByFixture = new Map<string, 'full' | 'et'>();

/** roster latch, per fixture — the wire's lineups envelope names the scorers */
const rosterByFixture = new Map<string, FixtureRoster>();

function dispatch(opts: StreamOptions, event: string, data: string, receivedAtMs: number): void {
  if (event === 'heartbeat' || event === '__meta' || event === '__disconnect') return;
  try {
    if (opts.name === 'odds') {
      const fid = rawFixtureId(data);
      const tick = parseOddsMessage(
        data,
        receivedAtMs,
        'live',
        fid ? (p1IsHomeByFixture.get(fid) ?? true) : true,
        fid ? (oddsPeriodByFixture.get(fid) ?? 'full') : 'full',
      );
      if (!tick) return;
      if (!opts.fixtureIds.has(fixtureIdOf(tick.raw) ?? '')) return;
      opts.onFeedMsg({ type: 'odds', tick });
    } else {
      // roster latch: lineups → both squads (scorer names, same wire) + the starting XI
      if (data.includes('"lineups"')) {
        const r = parseLineups(data);
        if (r) {
          rosterByFixture.set(String(r.fixtureId), r);
          if (r.lineup && opts.fixtureIds.has(String(r.fixtureId))) {
            opts.onFeedMsg({ type: 'lineup', fixtureId: String(r.fixtureId), lineup: r.lineup });
          }
        }
      }
      // learn the side-truth before parsing — every scores envelope carries it
      if (data.includes('"Participant1IsHome"')) {
        try {
          const env = JSON.parse(data) as { FixtureId?: unknown; Participant1IsHome?: unknown };
          if (typeof env.FixtureId === 'number' && typeof env.Participant1IsHome === 'boolean') {
            p1IsHomeByFixture.set(String(env.FixtureId), env.Participant1IsHome);
          }
        } catch {
          // not JSON — the parse calls below will drop it
        }
      }
      // Ledger is a PARALLEL channel (contracts/ledger.ts): a 'goal' envelope
      // yields BOTH a score FeedMsg and a ledger FeedMsg, and ledger actions
      // (shots, cards, danger spells, amends/discards) ride the scores stream
      // only. Forward it independently of — and before — the score/status
      // early-returns below, filtered to configured fixtures. LiveSource turns
      // this ledger FeedMsg back into onLedger client-side.
      const lfidPeek = rawFixtureId(data);
      const ledger = parseLedgerMessage(data, receivedAtMs, 'live', lfidPeek ? rosterByFixture.get(lfidPeek) : undefined);
      if (ledger) {
        const lfid = ledgerFixtureId(ledger);
        if (lfid && opts.fixtureIds.has(lfid)) opts.onFeedMsg({ type: 'ledger', msg: ledger });
      }
      // possession spells (contracts/texture.ts) — the loom's possession/
      // pressure/tempo threads. Biggest stream; forwarded to fixtures a client
      // is watching. Side via the same p1IsHome latch as odds.
      if (lfidPeek && opts.fixtureIds.has(lfidPeek)) {
        const spell = parseSpell(data, receivedAtMs, 'live', p1IsHomeByFixture.get(lfidPeek) ?? true);
        if (spell) opts.onFeedMsg({ type: 'spell', fixtureId: lfidPeek, spell });
      }
      // a scores line is either a score change or a status change, not both
      // (see contracts/normalize.ts parseStatusMessage doc comment) — try
      // score first, fall back to status.
      const score = parseScoreMessage(data, receivedAtMs, 'live', lfidPeek ? rosterByFixture.get(lfidPeek) : undefined);
      if (score) {
        if (!opts.fixtureIds.has(fixtureIdOf(score.raw) ?? '')) return;
        opts.onFeedMsg({ type: 'score', ev: score });
        return;
      }
      const status = parseStatusMessage(data, receivedAtMs, 'live');
      if (status) {
        const sfid = fixtureIdOf(status.raw) ?? '';
        // market hand-off latch (one-way per fixture): ET/pens → 'et' 1X2
        if (sfid && (status.phase === 'EXTRA_TIME' || status.phase === 'PENALTIES')) {
          oddsPeriodByFixture.set(sfid, 'et');
        }
        if (!opts.fixtureIds.has(sfid)) return;
        opts.onFeedMsg({ type: 'status', ev: status });
      }
    }
  } catch (err) {
    console.warn(`[txline:${opts.name}] normalize error (dropping message): ${String(err)}`);
  }
}

/**
 * One SSE stream's connect+parse+reconnect loop. Mirrors scripts/record.ts's
 * line-buffering state machine (event:/data:/blank-line-dispatch), but calls
 * back into normalize+broadcast instead of writing JSONL to disk.
 */
async function runStream(opts: StreamOptions): Promise<void> {
  let backoffMs = 1000;
  let everConnected = false;

  while (!opts.signal.aborted) {
    // Per-attempt liveness watchdog (TXLINE_IDLE_TIMEOUT_MS doc above): one
    // sweeper covers both phases — headers that never arrive (connect limit)
    // and a connected stream that stops producing bytes (idle limit). It
    // aborts THE ATTEMPT only (opts.signal, the ingest-wide stop, is left
    // alone) — the abort surfaces as a rejection inside this try, and the
    // existing catch → backoff → reconnect path handles it like any other
    // network error. Every received chunk (heartbeats included — they are
    // bytes) resets the clock.
    const attempt = new AbortController();
    const attemptSignal = AbortSignal.any([opts.signal, attempt.signal]);
    let lastByteMs = Date.now();
    let connected = false;
    const sweepEveryMs = Math.max(250, Math.min(5_000, Math.floor(TXLINE_IDLE_TIMEOUT_MS / 4)));
    const sweeper = setInterval(() => {
      const idleMs = Date.now() - lastByteMs;
      const limitMs = connected ? TXLINE_IDLE_TIMEOUT_MS : TXLINE_CONNECT_TIMEOUT_MS;
      if (idleMs > limitMs) {
        console.warn(
          `[txline:${opts.name}] ${connected ? 'stream silent' : 'connect pending'} for ${Math.round(idleMs / 1000)}s (limit ${Math.round(limitMs / 1000)}s) — aborting this attempt to force a reconnect`,
        );
        attempt.abort();
      }
    }, sweepEveryMs);
    try {
      console.log(`[txline:${opts.name}] connecting`);
      const res = await fetch(opts.url, {
        headers: { Accept: 'text/event-stream', ...opts.headers },
        signal: attemptSignal,
      });
      if (!res.ok || !res.body) {
        const bodyText = await res.text().catch(() => '');
        throw new Error(`http ${res.status}: ${bodyText.slice(0, 200)}`);
      }
      everConnected = true;
      connected = true;
      lastByteMs = Date.now();
      backoffMs = 1000;
      opts.onFeedState('connected');

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let event = 'message';
      let dataLines: string[] = [];

      while (!opts.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        lastByteMs = Date.now(); // proof of life — heartbeats count, they are bytes
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).replace(/\r$/, '');
          buf = buf.slice(nl + 1);
          if (line === '') {
            if (dataLines.length) dispatch(opts, event, dataLines.join('\n'), Date.now());
            event = 'message';
            dataLines = [];
          } else if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        }
      }
      clearInterval(sweeper); // attempt concluded — don't let it fire during the pause below
      if (opts.signal.aborted) return;
      console.warn(`[txline:${opts.name}] stream ended; reconnecting`);
      opts.onFeedState('reconnecting');
    } catch (err) {
      // clear FIRST: the backoff sleep below happens inside this attempt's
      // scope, and a still-armed sweeper would keep "aborting" the already-
      // dead attempt — harmless (the signal is spent) but one noise line per
      // sweep through every long outage. finally stays as the safety net.
      clearInterval(sweeper);
      if (opts.signal.aborted) return;
      console.warn(`[txline:${opts.name}] ${String(err)}; retry in ${backoffMs}ms`);
      opts.onFeedState(everConnected ? 'reconnecting' : 'lost');
      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 30_000);
    } finally {
      clearInterval(sweeper);
    }
  }
}

export interface TxLineIngestHandle {
  stop(): void;
}

/**
 * Starts both odds + scores streams. onFeedMsg receives normalized FeedMsg
 * for fixtures in `fixtureIds`. onFeedState reflects the combined health of
 * both streams: connected only when both are; lost only if neither has ever
 * connected; reconnecting otherwise.
 */
export function startTxLineIngest(opts: {
  fixtureIds: Set<string>;
  onFeedMsg: (msg: FeedMsg) => void;
  onFeedState: (state: FeedState) => void;
}): TxLineIngestHandle {
  const token = loadToken(); // throws loudly if missing — caller decides whether that's fatal
  const headers = {
    Authorization: `Bearer ${token.jwt}`,
    'X-Api-Token': token.apiToken,
  };

  const controller = new AbortController();
  const states: Record<'odds' | 'scores', FeedState> = { odds: 'lost', scores: 'lost' };

  const combineAndEmit = () => {
    const combined: FeedState =
      states.odds === 'connected' && states.scores === 'connected'
        ? 'connected'
        : states.odds === 'lost' && states.scores === 'lost'
          ? 'lost'
          : 'reconnecting';
    opts.onFeedState(combined);
  };

  const oddsPromise = runStream({
    name: 'odds',
    url: `${TXLINE_API}/api/odds/stream`,
    headers,
    fixtureIds: opts.fixtureIds,
    onFeedMsg: opts.onFeedMsg,
    onFeedState: (s) => {
      states.odds = s;
      combineAndEmit();
    },
    signal: controller.signal,
  });

  const scoresPromise = runStream({
    name: 'scores',
    url: `${TXLINE_API}/api/scores/stream`,
    headers,
    fixtureIds: opts.fixtureIds,
    onFeedMsg: opts.onFeedMsg,
    onFeedState: (s) => {
      states.scores = s;
      combineAndEmit();
    },
    signal: controller.signal,
  });

  // STARTUP SEED (caught live at CAN–MAR, Jul 4): the streams are edge-
  // triggered — after a (re)start mid-match, a fresh service has no cached
  // status/score until the NEXT change, so joiners saw "KICK OFF SOON" and a
  // still tide for minutes. Both /snapshot endpoints return arrays of the
  // SAME envelope shapes as the streams, so we replay each element through
  // the SAME dispatch — seeding the join snapshot with the true current
  // state instantly. Best-effort: a failed snapshot never blocks the streams.
  const seedSnapshot = async (): Promise<void> => {
    for (const fid of opts.fixtureIds) {
      for (const [name, path] of [
        ['scores', `/api/scores/snapshot/${fid}`],
        ['odds', `/api/odds/snapshot/${fid}`],
      ] as const) {
        try {
          const res = await fetch(`${TXLINE_API}${path}`, { headers, signal: controller.signal });
          if (!res.ok) continue;
          const arr = (await res.json()) as unknown;
          if (!Array.isArray(arr)) continue;
          const streamOpts: StreamOptions = {
            name,
            url: '',
            headers,
            fixtureIds: opts.fixtureIds,
            onFeedMsg: opts.onFeedMsg,
            onFeedState: () => {},
            signal: controller.signal,
          };
          for (const env of arr) {
            const ts = typeof (env as { Ts?: unknown }).Ts === 'number' ? (env as { Ts: number }).Ts : Date.now();
            dispatch(streamOpts, 'message', JSON.stringify(env), ts);
          }
          console.log(`[txline:seed] ${name} snapshot for ${fid}: ${arr.length} envelopes replayed`);

          // CLOCK SEED: playing-phase kickoff/status envelopes are edge-
          // triggered, so the freshest 'status' in the snapshot can be the
          // clock-0 kickoff — a joiner then sees "0'" on a match 30' in
          // (caught live, CAN–MAR). Every envelope, though, carries the
          // TRUE current StatusId + running Clock. Surface the freshest one
          // as a status so the scoreboard shows the real minute at once.
          // Honest: StatusId and Clock are the wire's own latest values.
          if (name === 'scores') {
            let freshest: { StatusId?: number; Clock?: { Running?: boolean; Seconds?: number }; Ts?: number } | null = null;
            for (const env of arr as Array<{ StatusId?: number; Clock?: { Running?: boolean; Seconds?: number }; Ts?: number }>) {
              if (typeof env.StatusId !== 'number' || !env.Clock?.Running) continue;
              if (!freshest || (env.Ts ?? 0) > (freshest.Ts ?? 0)) freshest = env;
            }
            if (freshest) {
              const synthetic = {
                FixtureId: Number(fid),
                Action: 'status',
                Data: { StatusId: freshest.StatusId },
                Clock: freshest.Clock,
                Ts: freshest.Ts,
              };
              dispatch(streamOpts, 'message', JSON.stringify(synthetic), freshest.Ts ?? Date.now());
              console.log(`[txline:seed] clock seed ${fid}: StatusId ${freshest.StatusId} @ ${Math.floor((freshest.Clock?.Seconds ?? 0) / 60)}'`);
            }
          }

          // LINEUP SEED (xi-seed-recovery, Jul 13 — scratchpad/starting-xi-
          // diagnosis.md): lineups is a ONE-SHOT envelope (~45min pre-KO);
          // SSE never replays, so a restart after the drop has no live
          // re-delivery to catch. STEP 0 of that task confirmed the REAL
          // /api/scores/snapshot/{fid} endpoint DOES carry it (finished
          // fixtures 18222446 + 18213979, one envelope each, both parse
          // clean) — so the generic per-envelope loop just above THIS
          // already recovers it: dispatch()'s roster latch runs
          // unconditionally on every scores envelope, seed or live, no
          // lineups-specific branch needed to make it fire. This block does
          // NOT re-dispatch anything (that would double-fire onFeedMsg for
          // the SAME envelope within one seedSnapshot pass) — it only
          // confirms + logs what the loop above already did, so an operator
          // can see the recovery land on a Fly deploy, and so a restart
          // check has a stable line to assert against.
          //
          // Double-apply safety (if live later re-delivers, e.g. the wire's
          // observed 1-4 re-emissions of the same one-shot): rosterByFixture
          // .set() and, downstream, snapshotFor(matchId).lineup are both
          // plain last-write-wins assignments with no counter or one-shot
          // side effect (unlike goal/card ledger triggers, which DO need the
          // openedTriggerIds dedup Set because they open a moment window) —
          // a later live delivery just overwrites with equivalent-or-fresher
          // data. Never double-counts, never fabricates, nothing to guard.
          if (name === 'scores') {
            const sawLineupsEnvelope = (arr as Array<{ Action?: unknown }>).some((env) => env.Action === 'lineups');
            if (sawLineupsEnvelope) {
              const roster = rosterByFixture.get(fid);
              if (roster) {
                const xi = roster.lineup ? `, starting XI ${roster.lineup.home.length}v${roster.lineup.away.length}` : '';
                console.log(`[txline:seed] lineup seed ${fid}: roster recovered (${roster.byPlayerId.size} players${xi})`);
              } else {
                console.warn(`[txline:seed] lineup seed ${fid}: snapshot carried a lineups envelope but it failed to parse — team sheet stays empty`);
              }
            }
          }
        } catch {
          // aborted or unreachable — the live streams still carry the match
        }
      }
    }
  };
  void seedSnapshot();

  void Promise.allSettled([oddsPromise, scoresPromise]);

  return {
    stop() {
      controller.abort();
    },
  };
}
