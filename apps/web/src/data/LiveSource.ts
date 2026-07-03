/**
 * ROOOT data lane — LiveSource.
 *
 * Connects to the stands service's WebSocket (services/stands — L2 lane) and
 * consumes contracts/feed.ts's `FeedMsg` union, translating it straight into
 * MatchCallbacks (contracts/match.ts). Per docs/ARCHITECTURE.md's data-flow
 * diagram, the service holds the single TxLINE connection server-side
 * (tokens never reach the browser) and fans normalized FeedMsg out to every
 * client over the same socket that carries crowd state (contracts/crowd.ts) —
 * so this class only ever needs to understand `FeedMsg`, never TxLINE's raw
 * wire shapes directly (those are services/stands' job, using the same
 * contracts/normalize.ts this lane ships).
 *
 * BUILT TO THE CONTRACT: as of this lane's work, services/stands/src/index.ts
 * is still a skeleton (no WebSocket server wired up yet — L2 lane lands it
 * separately today). This class cannot be exercised against a live socket
 * until that lands; it's written and typechecked against contracts/feed.ts
 * only. The reconnect/backoff loop and feed-state transitions below are
 * exercised by a scriptable fake-WebSocket in the same style the harness in
 * this lane's verification pass used (see the lane's report for the manual
 * check performed).
 *
 * Reconnect policy: exponential backoff (1s → doubling → capped at 30s,
 * matching scripts/record.ts's own backoff curve for consistency), with
 * onFeedState transitions: 'connected' on open, 'reconnecting' while a
 * backoff timer is pending after an unexpected close, 'lost' only once
 * MAX_RECONNECT_ATTEMPTS is exhausted (the stage should dim honestly rather
 * than spin forever — AGENTS.md law #7 "the stage dims honestly instead of
 * freezing on a dead feed").
 */
import type { Fixture, MatchCallbacks, MatchDataSource } from '@contracts/match';
import type { FeedMsg } from '@contracts/feed';

export interface LiveSourceOptions {
  /** stands service WebSocket URL, e.g. wss://stands.rooot.club/ws?matchId=... */
  url: string;
  matchId: string;
  /** injectable WebSocket ctor for test harnesses */
  wsImpl?: typeof WebSocket;
  maxReconnectAttempts?: number;
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 8;

export class LiveSource implements MatchDataSource {
  private readonly opts: LiveSourceOptions;
  private ws: WebSocket | null = null;
  private cb: MatchCallbacks | null = null;
  private fixture: Fixture | null = null;
  private stopped = true;
  private backoffMs = INITIAL_BACKOFF_MS;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: LiveSourceOptions) {
    this.opts = options;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async initialize(): Promise<void> {
    // Nothing to pre-fetch — fixture metadata arrives over the socket itself
    // as a `fixtureInfo` FeedMsg once connected (see onmessage below). This
    // mirrors LiveSource never touching TxLINE credentials: it knows nothing
    // until the service tells it.
  }

  start(cb: MatchCallbacks): void {
    this.cb = cb;
    this.stopped = false;
    this.reconnectAttempts = 0;
    this.backoffMs = INITIAL_BACKOFF_MS;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  getFixture(): Fixture | null {
    return this.fixture;
  }

  private connect(): void {
    if (this.stopped) return;
    const WsCtor = this.opts.wsImpl ?? WebSocket;
    const url = `${this.opts.url}${this.opts.url.includes('?') ? '&' : '?'}matchId=${encodeURIComponent(this.opts.matchId)}`;

    let socket: WebSocket;
    try {
      socket = new WsCtor(url);
    } catch (err) {
      console.error('[LiveSource] failed to construct WebSocket', err);
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.backoffMs = INITIAL_BACKOFF_MS;
      this.cb?.onFeedState?.('connected');
    };

    socket.onmessage = (ev: MessageEvent) => {
      this.handleMessage(typeof ev.data === 'string' ? ev.data : String(ev.data));
    };

    socket.onerror = (ev: Event) => {
      console.warn('[LiveSource] socket error', ev);
    };

    socket.onclose = () => {
      this.ws = null;
      if (this.stopped) return;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const maxAttempts = this.opts.maxReconnectAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.reconnectAttempts++;
    if (this.reconnectAttempts > maxAttempts) {
      this.cb?.onFeedState?.('lost');
      return;
    }
    this.cb?.onFeedState?.('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private handleMessage(raw: string): void {
    if (!this.cb) return;
    let msg: FeedMsg;
    try {
      msg = JSON.parse(raw) as FeedMsg;
    } catch {
      console.warn('[LiveSource] unparseable message, dropping');
      return;
    }
    switch (msg.type) {
      case 'fixtureInfo':
        this.fixture = msg.fixture;
        return;
      case 'odds':
        this.cb.onOdds(msg.tick);
        return;
      case 'score':
        this.cb.onScore(msg.ev);
        return;
      case 'status':
        this.cb.onStatus(msg.ev);
        return;
      case 'ledger':
        this.cb.onLedger?.(msg.msg);
        return;
      case 'feedState':
        this.cb.onFeedState?.(msg.state);
        return;
      default: {
        // exhaustiveness guard — a new FeedMsg variant should be a compile
        // error here, not a silent drop, since this file only changes when
        // contracts/feed.ts (coordinator-owned) grows a case.
        const _exhaustive: never = msg;
        console.warn('[LiveSource] unknown FeedMsg type', _exhaustive);
      }
    }
  }
}
