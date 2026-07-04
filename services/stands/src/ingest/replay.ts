/**
 * Replay ingest — streams a recorded fixtures/*.jsonl through the SAME
 * contracts/normalize.ts path as live TxLINE, at configurable speed, so the
 * deployed service can power a full fake-free demo after matches end
 * (docs/PRODUCT.md "Completeness": replay mode ships in v1).
 *
 * File format (docs/DATA.md): one line per SSE message,
 * { receivedAtMs, event, data } with data as the raw JSON string. Timing is
 * reconstructed from consecutive receivedAtMs deltas, scaled by REPLAY_SPEED
 * (2 = twice as fast, 0.5 = half speed).
 */
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import type { FeedMsg } from '@contracts/feed';
import type { LedgerMsg } from '@contracts/ledger';
import {
  parseLedgerMessage,
  parseOddsMessage,
  parseScoreMessage,
  parseStatusMessage,
  sniffParticipant1IsHome,
} from '@contracts/normalize';

interface FixtureLine {
  receivedAtMs: number;
  event: string;
  data: string;
}

export interface ReplayIngestHandle {
  stop(): void;
}

/**
 * Streams a single JSONL file (either an odds or scores recording — a line's
 * shape self-selects: parseOddsMessage only accepts 1X2 odds rows,
 * parseScoreMessage/parseStatusMessage only accept scores-stream shapes, so
 * trying all three and taking whichever parses is safe and file-agnostic).
 */
export function startReplayIngest(opts: {
  file: string;
  fixtureId: string;
  speed: number;
  onFeedMsg: (msg: FeedMsg) => void;
  onDone: () => void;
}): ReplayIngestHandle {
  const speed = opts.speed > 0 ? opts.speed : 1;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const rl = createInterface({ input: createReadStream(opts.file, 'utf8'), crlfDelay: Infinity });
  const lines: FixtureLine[] = [];

  rl.on('line', (raw) => {
    if (!raw.trim()) return;
    try {
      const rec = JSON.parse(raw) as FixtureLine;
      if (rec.event === 'message') lines.push(rec);
    } catch {
      // skip malformed line — a replay fixture must never crash the demo
    }
  });

  rl.on('close', () => {
    if (stopped || lines.length === 0) {
      opts.onDone();
      return;
    }
    playFrom(0);
  });

  function fixtureIdOf(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const id = obj.FixtureId ?? obj.fixtureId;
    return typeof id === 'number' ? String(id) : null;
  }

  /** The fixtureKey a LedgerMsg belongs to — carried on every variant
   * (event: the `${fixtureKey}:` id prefix; amend/discard: fixtureKey). Used
   * to keep one fixture's rows out of another's room, same honesty rule as
   * the odds/score/status routing above. */
  function ledgerFixtureId(msg: LedgerMsg): string | null {
    if (msg.type === 'event') {
      const sep = msg.ev.id.indexOf(':');
      return sep > 0 ? msg.ev.id.slice(0, sep) : null;
    }
    return msg.fixtureKey || null;
  }

  function playFrom(i: number): void {
    if (stopped) return;
    if (i >= lines.length) {
      opts.onDone();
      return;
    }
    const line = lines[i]!;
    emit(line);
    const next = lines[i + 1];
    const delayMs = next ? Math.max(0, (next.receivedAtMs - line.receivedAtMs) / speed) : 0;
    timer = setTimeout(() => playFrom(i + 1), Math.min(delayMs, 5_000)); // cap gaps (e.g. across __meta reconnects) so replay doesn't stall
  }

  // side-truth latch (contracts/normalize.ts parseOddsMessage doc): learned
  // from the bundle's scores envelopes, threaded into every odds parse. Lines
  // stream via readline, so this learns lazily — bundles carry pre-kickoff
  // scores envelopes, so the latch lands before the in-running odds.
  let p1IsHome = true;
  // phase-aware market hand-off (see txline.ts twin): ET/pens → 'et' 1X2
  let oddsPeriod: 'full' | 'et' = 'full';

  function emit(line: FixtureLine): void {
    try {
      if (line.data.includes('"Participant1IsHome"')) {
        const p1h = sniffParticipant1IsHome(line.data);
        if (p1h !== null) p1IsHome = p1h;
      }

      // Ledger is a PARALLEL channel (see ReplaySource / contracts/ledger.ts):
      // a 'goal' line produces BOTH a score FeedMsg and a ledger FeedMsg. Parse
      // + broadcast it independently of the odds/score/status early-returns
      // below. Filter by fixtureKey so a shared multi-fixture file never leaks
      // one match's rows into another's room (the same honesty rule the
      // score/status routing enforces via fixtureIdOf).
      const ledger = parseLedgerMessage(line.data, line.receivedAtMs, 'replay');
      if (ledger && ledgerFixtureId(ledger) === opts.fixtureId) {
        opts.onFeedMsg({ type: 'ledger', msg: ledger });
      }

      const tick = parseOddsMessage(line.data, line.receivedAtMs, 'replay', p1IsHome, oddsPeriod);
      if (tick) {
        if (fixtureIdOf(tick.raw) !== opts.fixtureId) return;
        opts.onFeedMsg({ type: 'odds', tick });
        return;
      }
      const score = parseScoreMessage(line.data, line.receivedAtMs, 'replay');
      if (score) {
        if (fixtureIdOf(score.raw) !== opts.fixtureId) return;
        opts.onFeedMsg({ type: 'score', ev: score });
        return;
      }
      const status = parseStatusMessage(line.data, line.receivedAtMs, 'replay');
      if (status) {
        if (fixtureIdOf(status.raw) !== opts.fixtureId) return;
        if (status.phase === 'EXTRA_TIME' || status.phase === 'PENALTIES') oddsPeriod = 'et';
        opts.onFeedMsg({ type: 'status', ev: status });
      }
    } catch (err) {
      console.warn(`[replay] normalize error (dropping line): ${String(err)}`);
    }
  }

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      rl.close();
    },
  };
}
