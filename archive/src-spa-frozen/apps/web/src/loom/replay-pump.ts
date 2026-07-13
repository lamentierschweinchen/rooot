/**
 * ROOOT — THE LOOM · replay pump (dev-only driver for the fabrication harness).
 *
 * WHY THIS EXISTS (and why it is not ReplaySource): the production replay path is
 * `data/ReplaySource.ts`, which paces itself with setTimeout off the original
 * receivedAt deltas. That is exactly right for a real (visible) tab. But an
 * automation/headless tab is permanently `document.hidden`, and browsers clamp
 * setTimeout in hidden tabs to ≥1s — so ReplaySource crawls under verification
 * regardless of the speed multiplier, and the loom can never be watched weaving.
 *
 * This pump drives the SAME bundled JSONL through the SAME FROZEN parsers
 * (contracts/normalize.ts: parseOddsMessage / parseScoreMessage /
 * parseStatusMessage / parseLedgerMessage) with the SAME side-truth + roster
 * latching + phase→period hand-off as ReplaySource — it is a faithful twin — but
 * advances on a wall-clock the HARNESS owns. The harness ticks it every frame
 * (rAF when visible; a pumped step under hidden/automation tabs), so the weave
 * advances honestly at any speed, in any tab. Nothing here fabricates data: every
 * emitted callback is a real recorded line, in original order, at original pacing
 * (scaled by speed, with the same long-gap ceiling ReplaySource uses).
 *
 * It also supports SEEK (jump to a match-minute) by fast-forwarding: draining
 * every line up to the target instantly through the same emit path. That is how
 * the jump-to controls land on the real cloth at the real moment.
 */

import type { Fixture, MatchCallbacks } from '@contracts/match';
import {
  parseLedgerMessage,
  parseLineups,
  parseOddsMessage,
  parseScoreMessage,
  parseStatusMessage,
  sniffParticipant1IsHome,
} from '@contracts/normalize';
import type { FixtureRoster } from '@contracts/normalize';

interface RawLine {
  receivedAtMs: number;
  event: string;
  data: string;
}

/** same ceiling ReplaySource uses so a long pre-match/idle gap doesn't stall. */
const MAX_GAP_MS = 4000;

export interface ReplayPumpOptions {
  url: string;
  fixture: Fixture;
  speed: number;
}

export class ReplayPump {
  private lines: RawLine[] = [];
  private cb: MatchCallbacks | null = null;
  private cursor = 0;
  private p1IsHome = true;
  private oddsPeriod: 'full' | 'et' = 'full';
  private roster: FixtureRoster | undefined;
  /** accumulated replay-time debt owed before the next line may emit (ms) */
  private debtMs = 0;
  private speed: number;
  private readonly url: string;

  constructor(opts: ReplayPumpOptions) {
    this.speed = opts.speed;
    this.url = opts.url;
  }

  async initialize(): Promise<void> {
    const res = await fetch(this.url);
    if (!res.ok) throw new Error(`[ReplayPump] failed to load ${this.url}: HTTP ${res.status}`);
    const text = await res.text();
    this.lines = parseJsonl(text);
    // pre-latch side-truth (same as ReplaySource)
    for (const l of this.lines) {
      if (l.event === 'message' && l.data.includes('"Participant1IsHome"')) {
        const p = sniffParticipant1IsHome(l.data);
        if (p !== null) {
          this.p1IsHome = p;
          break;
        }
      }
    }
    if (this.lines.length === 0) throw new Error(`[ReplayPump] ${this.url} parsed to zero lines`);
  }

  start(cb: MatchCallbacks): void {
    this.cb = cb;
    cb.onFeedState?.('replay');
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  get done(): boolean {
    return this.cursor >= this.lines.length;
  }

  get progress(): number {
    return this.lines.length ? this.cursor / this.lines.length : 1;
  }

  /**
   * Advance replay by `dtMs` of wall time (scaled by speed). Emits every line
   * whose replay-time gap has elapsed. Called each frame by the harness.
   */
  advance(dtMs: number): void {
    if (!this.cb || this.done) return;
    this.debtMs += dtMs * this.speed;
    // burst cap so a huge dt (backgrounded catch-up) can't jank one frame
    let burst = 0;
    while (!this.done && this.debtMs >= 0 && burst < 4000) {
      const line = this.lines[this.cursor]!;
      const prev = this.cursor > 0 ? this.lines[this.cursor - 1] : undefined;
      const gap = prev ? Math.min(Math.max(line.receivedAtMs - prev.receivedAtMs, 0), MAX_GAP_MS) : 0;
      if (this.debtMs < gap) break;
      this.debtMs -= gap;
      this.emit(line);
      this.cursor++;
      burst++;
    }
  }

  /**
   * Seek to the first line at-or-after a target match-minute (or ET-minute),
   * draining everything before it INSTANTLY through the same emit path so the
   * cloth is the real cloth at that moment. Returns true if it moved forward.
   *
   * Match-minute is read from any envelope's running Clock.Seconds; ET is the
   * same clock past 90' with the market flipped to 'et'. We resolve the target
   * to a line index by scanning clocks, then drain up to it.
   */
  seekToMinute(targetMinute: number, et: boolean): void {
    if (!this.cb) return;
    const targetSec = targetMinute * 60;
    // find the first line index whose running clock reaches the target (and, for
    // et, whose phase is already extra-time so the market is the ET one).
    let idx = this.lines.length;
    let sawEt = false;
    for (let i = 0; i < this.lines.length; i++) {
      const l = this.lines[i]!;
      if (l.event !== 'message') continue;
      let d: { Clock?: { Seconds?: number; Running?: boolean }; StatusId?: number; Data?: { StatusId?: number } } | null =
        null;
      try {
        d = JSON.parse(l.data);
      } catch {
        continue;
      }
      const sid = d?.Data?.StatusId ?? d?.StatusId;
      if (sid === 7 || sid === 9) sawEt = true; // ET1/ET2 kickoff seen
      const sec = d?.Clock?.Seconds;
      if (typeof sec === 'number' && sec >= targetSec) {
        if (!et || sawEt) {
          idx = i;
          break;
        }
      }
    }
    // if we're already past it, do nothing (no rewind — the cloth only grows)
    if (idx <= this.cursor) return;
    // drain instantly to idx
    while (this.cursor < idx && this.cursor < this.lines.length) {
      this.emit(this.lines[this.cursor]!);
      this.cursor++;
    }
    this.debtMs = 0;
  }

  private emit(line: RawLine): void {
    if (!this.cb) return;
    switch (line.event) {
      case '__meta':
      case '__disconnect':
      case 'heartbeat':
        return;
      case 'message':
        break;
      default:
        return;
    }
    if (line.data.includes('"Participant1IsHome"')) {
      const p = sniffParticipant1IsHome(line.data);
      if (p !== null) this.p1IsHome = p;
    }
    if (!this.roster && line.data.includes('"lineups"')) {
      const r = parseLineups(line.data);
      if (r) this.roster = r;
    }
    // ledger is a parallel channel (same as ReplaySource)
    if (this.cb.onLedger) {
      const ledger = parseLedgerMessage(line.data, line.receivedAtMs, 'replay', this.roster);
      if (ledger) this.cb.onLedger(ledger);
    }
    const odds = parseOddsMessage(line.data, line.receivedAtMs, 'replay', this.p1IsHome, this.oddsPeriod);
    if (odds) {
      this.cb.onOdds(odds);
      return;
    }
    const score = parseScoreMessage(line.data, line.receivedAtMs, 'replay', this.roster);
    if (score) {
      this.cb.onScore(score);
      return;
    }
    const status = parseStatusMessage(line.data, line.receivedAtMs, 'replay');
    if (status) {
      if (status.phase === 'EXTRA_TIME' || status.phase === 'PENALTIES') this.oddsPeriod = 'et';
      this.cb.onStatus(status);
      return;
    }
  }
}

function parseJsonl(text: string): RawLine[] {
  const out: RawLine[] = [];
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    try {
      const p = JSON.parse(t) as RawLine;
      if (typeof p.receivedAtMs === 'number' && typeof p.event === 'string') out.push(p);
    } catch {
      /* a bundled fixture should never have a bad line; never crash over one */
    }
  }
  return out;
}
