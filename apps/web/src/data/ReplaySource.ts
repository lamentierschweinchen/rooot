/**
 * ROOOT data lane — ReplaySource.
 *
 * Loads a bundled JSONL fixture (fetched from the app's public/ path — Vite
 * serves apps/web/public/* at the site root) and replays it through
 * contracts/normalize.ts with the ORIGINAL pacing preserved: the gap between
 * two lines in real life (receivedAtMs delta) becomes the gap between their
 * callbacks in replay, scaled by `speed`. Replay mode is a first-class
 * product surface (docs/ARCHITECTURE.md: "judges review after the final") —
 * this is not a debug stub.
 *
 * The bundled fixture is expected to be a MERGED, chronologically-sorted
 * transcript of odds + score lines for one fixture (see
 * apps/web/public/replay/arg-cpv-20260703.jsonl, built by
 * scripts/extract-fixture.ts) — one line per original SSE event, in the
 * exact `{ receivedAtMs, event, data }` shape scripts/record.ts writes and
 * fixtures/*.jsonl already use, so the SAME parser handles both the raw
 * capture (for inspection/dev) and the trimmed bundle (for shipping).
 *
 * Quirks handled (observed directly in fixtures/{odds,scores}-20260703.jsonl):
 *   - `__meta` lines (connection-open marker) — logged, not emitted as ticks.
 *   - `__disconnect` lines (recorder's own reconnect marker) — logged, not
 *     emitted; a replay should not "flap" the feed state just because the
 *     ORIGINAL recorder's TCP connection did.
 *   - `heartbeat` lines (keep-alive, ~15s cadence in the capture) — skipped
 *     silently; they carry no odds/score payload (`{"Ts": <epoch>}` only).
 *   - Unparseable `data` JSON, or a payload contracts/normalize.ts's parsers
 *     reject (wrong market, wrong period, NA odds, etc.) — silently
 *     dropped, same "never throw on a line we don't like" policy as the
 *     recorder itself.
 */
import type { Fixture, MatchCallbacks, MatchDataSource } from '@contracts/match';
import {
  parseOddsMessage,
  parseScoreMessage,
  parseStatusMessage,
  sniffParticipant1IsHome,
} from '@contracts/normalize';

interface RawLine {
  receivedAtMs: number;
  event: string;
  data: string;
}

export type ReplaySpeed = 1 | 8 | 60;

export interface ReplaySourceOptions {
  /** public/ path to the bundled JSONL, e.g. '/replay/arg-cpv-20260703.jsonl' */
  url: string;
  fixture: Fixture;
  /** playback speed multiplier — 1x (real pacing), 8x, 60x (skim). Default 1. */
  speed?: ReplaySpeed;
  /** injectable fetch for test harnesses (node/tsx has no global fetch of a bundled asset) */
  fetchImpl?: typeof fetch;
}

/** milliseconds — a gap longer than this collapses to this ceiling so a long
 * mid-fixture silence (e.g. the real ~5-40min gaps observed between odds
 * ticks in the pre-match capture) doesn't stall the demo for real minutes
 * even at 1x. Keeps replay "honest but watchable." */
const MAX_GAP_MS = 4000;

export class ReplaySource implements MatchDataSource {
  private readonly opts: Required<Omit<ReplaySourceOptions, 'fetchImpl'>> & Pick<ReplaySourceOptions, 'fetchImpl'>;
  private lines: RawLine[] = [];
  private cb: MatchCallbacks | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private cursor = 0;
  /** side-truth latch — learned from the bundle's scores envelopes (see emitLine) */
  private p1IsHome = true;

  constructor(options: ReplaySourceOptions) {
    this.opts = { speed: 1, ...options };
  }

  async initialize(): Promise<void> {
    const doFetch = this.opts.fetchImpl ?? fetch;
    const res = await doFetch(this.opts.url);
    if (!res.ok) {
      throw new Error(`[ReplaySource] failed to load ${this.opts.url}: HTTP ${res.status}`);
    }
    const text = await res.text();
    this.lines = parseJsonl(text);
    // Pre-latch the side-truth from the first scores envelope in the bundle so
    // odds lines that precede it don't play under the `true` default (the
    // whole capture is in memory — no reason to learn lazily).
    for (const l of this.lines) {
      if (l.event === 'message' && l.data.includes('"Participant1IsHome"')) {
        const p1h = sniffParticipant1IsHome(l.data);
        if (p1h !== null) {
          this.p1IsHome = p1h;
          break;
        }
      }
    }
    if (this.lines.length === 0) {
      throw new Error(`[ReplaySource] ${this.opts.url} parsed to zero lines — empty or malformed fixture`);
    }
  }

  start(cb: MatchCallbacks): void {
    this.cb = cb;
    this.stopped = false;
    this.cursor = 0;
    cb.onFeedState?.('replay');
    this.scheduleNext();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getFixture(): Fixture | null {
    return this.opts.fixture;
  }

  private scheduleNext(): void {
    if (this.stopped || !this.cb) return;
    if (this.cursor >= this.lines.length) return; // replay reached the end of the capture

    const line = this.lines[this.cursor];
    if (!line) return;
    const prevLine = this.cursor > 0 ? this.lines[this.cursor - 1] : undefined;
    const gapMs = prevLine ? line.receivedAtMs - prevLine.receivedAtMs : 0;
    const delayMs = Math.min(Math.max(gapMs, 0), MAX_GAP_MS) / this.opts.speed;

    this.timer = setTimeout(() => {
      this.emitLine(line);
      this.cursor++;
      this.scheduleNext();
    }, delayMs);
  }

  private emitLine(line: RawLine): void {
    if (!this.cb) return;
    switch (line.event) {
      case '__meta':
        console.log('[ReplaySource] capture start marker', line.data);
        return;
      case '__disconnect':
        console.log('[ReplaySource] recorder reconnect marker (not a live feed drop) — ignored', line.data);
        return;
      case 'heartbeat':
        return; // keep-alive only, no payload to normalize
      case 'message':
        break;
      default:
        console.warn('[ReplaySource] unknown transport event, skipping', line.event);
        return;
    }

    // Side-truth latch (contracts/normalize.ts doc): scores envelopes carry
    // Participant1IsHome; odds envelopes never do. Latch the latest answer and
    // thread it into every odds parse — a false means part1 is the AWAY side.
    if (line.data.includes('"Participant1IsHome"')) {
      const p1h = sniffParticipant1IsHome(line.data);
      if (p1h !== null) this.p1IsHome = p1h;
    }

    const odds = parseOddsMessage(line.data, line.receivedAtMs, 'replay', this.p1IsHome);
    if (odds) {
      this.cb.onOdds(odds);
      return;
    }
    const score = parseScoreMessage(line.data, line.receivedAtMs, 'replay');
    if (score) {
      this.cb.onScore(score);
      return;
    }
    const status = parseStatusMessage(line.data, line.receivedAtMs, 'replay');
    if (status) {
      this.cb.onStatus(status);
      return;
    }
    // Not an error: most lines in a merged odds+scores bundle are markets
    // outside the honest palette (over/under, asian handicap) or off-fixture
    // rows if the bundle wasn't pre-filtered — normalize.ts silently filters
    // these by design (see its file header).
  }
}

function parseJsonl(text: string): RawLine[] {
  const out: RawLine[] = [];
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as RawLine;
      if (typeof parsed.receivedAtMs === 'number' && typeof parsed.event === 'string') {
        out.push(parsed);
      }
    } catch {
      // a bundled fixture should never have a bad line, but replay must
      // never crash the stage over one — same policy as the recorder.
      console.warn('[ReplaySource] skipping unparseable line');
    }
  }
  return out;
}
