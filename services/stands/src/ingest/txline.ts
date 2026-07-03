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
import { parseOddsMessage, parseScoreMessage, parseStatusMessage } from '@contracts/normalize';

const TXLINE_API = process.env.TXLINE_API ?? 'https://txline-dev.txodds.com';
const TOKEN_FILE = process.env.TXLINE_TOKEN_FILE ?? '../../.secrets/txline-token.json';

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

function dispatch(opts: StreamOptions, event: string, data: string, receivedAtMs: number): void {
  if (event === 'heartbeat' || event === '__meta' || event === '__disconnect') return;
  try {
    if (opts.name === 'odds') {
      const tick = parseOddsMessage(data, receivedAtMs, 'live');
      if (!tick) return;
      if (!opts.fixtureIds.has(fixtureIdOf(tick.raw) ?? '')) return;
      opts.onFeedMsg({ type: 'odds', tick });
    } else {
      // a scores line is either a score change or a status change, not both
      // (see contracts/normalize.ts parseStatusMessage doc comment) — try
      // score first, fall back to status.
      const score = parseScoreMessage(data, receivedAtMs, 'live');
      if (score) {
        if (!opts.fixtureIds.has(fixtureIdOf(score.raw) ?? '')) return;
        opts.onFeedMsg({ type: 'score', ev: score });
        return;
      }
      const status = parseStatusMessage(data, receivedAtMs, 'live');
      if (status) {
        if (!opts.fixtureIds.has(fixtureIdOf(status.raw) ?? '')) return;
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
    try {
      console.log(`[txline:${opts.name}] connecting`);
      const res = await fetch(opts.url, {
        headers: { Accept: 'text/event-stream', ...opts.headers },
        signal: opts.signal,
      });
      if (!res.ok || !res.body) {
        const bodyText = await res.text().catch(() => '');
        throw new Error(`http ${res.status}: ${bodyText.slice(0, 200)}`);
      }
      everConnected = true;
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
      if (opts.signal.aborted) return;
      console.warn(`[txline:${opts.name}] stream ended; reconnecting`);
      opts.onFeedState('reconnecting');
    } catch (err) {
      if (opts.signal.aborted) return;
      console.warn(`[txline:${opts.name}] ${String(err)}; retry in ${backoffMs}ms`);
      opts.onFeedState(everConnected ? 'reconnecting' : 'lost');
      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 30_000);
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

  void Promise.allSettled([oddsPromise, scoresPromise]);

  return {
    stop() {
      controller.abort();
    },
  };
}
