/**
 * ROOOT data lane — CrowdClient over the stands WebSocket.
 *
 * Implements contracts/ledger.ts's `CrowdClient` (root / cheer / onState /
 * close) by speaking contracts/crowd.ts on the wire: HelloMsg + CheerMsg out,
 * StandsStateMsg in, mapped to the CrowdView the social strip renders. Same
 * socket the LiveSource feed rides — but this class only ever cares about the
 * crowd half of `ServerMsg | FeedMsg`; feed messages are ignored here (the
 * data source consumes those).
 *
 * Honesty (AGENTS.md law #1, BRIEF-WATCHING §3):
 *  · counts + roar are COUNTS off the server, never percentages, never blended
 *    with market numbers — we pass them through untouched;
 *  · `connected` is the truth of the socket. When it's down, we publish a
 *    CrowdView with connected:false (counts frozen at their last-known values,
 *    NOT reset to a fake zero and NOT invented upward) so the UI can render its
 *    own "STANDS OPENING SOON — counts are local" treatment. We never fake a
 *    crowd; optimistic local cheer counting is the UI's call, not ours.
 *
 * The faith seam:
 *  StandsStateMsg deliberately carries NO score (contracts/crowd.ts is frozen;
 *  crowd data and market data ride separate buses and never mix on the wire).
 *  Faith — "whose cheers count double right now" — is the TRAILING side, which
 *  is a fact of the SCORE, not of the stands. So this client does not sniff it
 *  from crowd traffic; the composition root feeds the trailing side in via
 *  setTrailingSide() (from the same onScore it already handles), and we fold it
 *  into every CrowdView we publish. setTrailingSide is an additional method on
 *  the concrete class, not part of the CrowdClient interface the UI consumes —
 *  the UI reads faith off CrowdView.faithSide like everything else.
 *
 * Reconnect: exponential backoff (1s → doubling → capped at 30s), mirroring
 * LiveSource's curve, with an attempt cap after which we stop and stay honestly
 * disconnected rather than spin forever. Every reconnect re-sends the hello
 * (with the rooted side, if any) so the server re-seats presence + root.
 */
import type { CrowdClient, CrowdView } from '@contracts/ledger';
import type { CheerMsg, HelloMsg, ServerMsg, Side, StandsStateMsg } from '@contracts/crowd';
import type { FeedMsg } from '@contracts/feed';

export interface CrowdClientOptions {
  /** stands service WebSocket URL, e.g. wss://stands.rooot.club/ (matchId is appended) */
  url: string;
  matchId: string;
  /** display name carried inside room rows (optional) */
  name?: string;
  /** injectable WebSocket ctor for test harnesses / node (default global WebSocket) */
  wsImpl?: typeof WebSocket;
  /** injectable storage for anonId (default localStorage; tests pass a Map-backed shim) */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** override the generated anonId (tests only — production reads/writes storage) */
  anonId?: string;
  maxReconnectAttempts?: number;
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 8;
const ANON_ID_KEY = 'rooot.anonId';
/** cheer taps inside this window coalesce into one CheerMsg (the contract
 * invites client batching; the server clamps + token-buckets regardless). */
const CHEER_FLUSH_MS = 120;

function readAnonId(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined): string {
  const gen = () => `anon-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  if (!storage) return gen();
  try {
    const existing = storage.getItem(ANON_ID_KEY);
    if (existing) return existing;
    const fresh = gen();
    storage.setItem(ANON_ID_KEY, fresh);
    return fresh;
  } catch {
    // storage can throw (Safari private mode, disabled cookies) — fall back to
    // an ephemeral id rather than crash; the fan is just un-remembered.
    return gen();
  }
}

export class StandsCrowdClient implements CrowdClient {
  private readonly opts: CrowdClientOptions;
  private readonly anonId: string;
  private ws: WebSocket | null = null;
  private stopped = false;
  private backoffMs = INITIAL_BACKOFF_MS;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private stateCb: ((s: CrowdView) => void) | null = null;
  private mySide: Side | null = null;
  private trailingSide: Side | null = null;

  /** last COUNTS the server sent — held through a disconnect so the strip
   * shows the last true crowd, marked disconnected, rather than blanking. */
  private lastCounts: { home: number; away: number } = { home: 0, away: 0 };
  private lastRoar: { home: number; away: number } = { home: 0, away: 0 };
  private everGotState = false;

  /** pending client-side cheer taps, flushed as one CheerMsg per window. */
  private pendingCheers = 0;
  private cheerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: CrowdClientOptions) {
    this.opts = options;
    this.anonId = options.anonId ?? readAnonId(options.storage ?? defaultStorage());
    this.connect();
  }

  /* ── CrowdClient surface ─────────────────────────────────────────── */

  root(side: Side): void {
    this.mySide = side;
    // a root is a hello carrying the side — the server's handleHello calls
    // match.root(anonId, side), a Set keyed by anonId (once-per-fan, idempotent
    // if the fan re-roots the same side; switching sides just moves them).
    this.sendHello();
    this.publish(); // reflect the local side immediately (faith/among-us UI)
  }

  cheer(): void {
    // You cheer the end you adopted. Before rooting there is no end to cheer —
    // honestly a no-op rather than guessing a side.
    if (!this.mySide) return;
    this.pendingCheers += 1;
    if (this.cheerTimer === null) {
      this.cheerTimer = setTimeout(() => this.flushCheers(), CHEER_FLUSH_MS);
    }
  }

  onState(cb: (s: CrowdView) => void): void {
    this.stateCb = cb;
    // push the current view immediately so a just-subscribed strip has a frame
    // to render (connected:false until the first server tick lands).
    this.publish();
  }

  close(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.cheerTimer !== null) {
      clearTimeout(this.cheerTimer);
      this.cheerTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  /* ── additional (not on the CrowdClient interface): the faith feed ── */

  /**
   * The composition root calls this from onScore with the side currently
   * behind (null when level or nobody's trailing). It is the ONLY source of
   * faithSide — never sniffed from crowd traffic (see the file header). Cheap
   * and idempotent; republishes only when the trailing side actually changed.
   */
  setTrailingSide(side: Side | null): void {
    if (side === this.trailingSide) return;
    this.trailingSide = side;
    this.publish();
  }

  /** The anonId this client uses (localStorage-backed) — exposed for the
   * composition root's later wallet-link + attendance flows. */
  getAnonId(): string {
    return this.anonId;
  }

  /* ── wire plumbing ───────────────────────────────────────────────── */

  private connect(): void {
    if (this.stopped) return;
    const WsCtor = this.opts.wsImpl ?? WebSocket;
    const url = `${this.opts.url}${this.opts.url.includes('?') ? '&' : '?'}matchId=${encodeURIComponent(
      this.opts.matchId,
    )}`;

    let socket: WebSocket;
    try {
      socket = new WsCtor(url);
    } catch (err) {
      console.error('[CrowdClient] failed to construct WebSocket', err);
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.backoffMs = INITIAL_BACKOFF_MS;
      // (re)announce presence + the rooted side so a reconnect re-seats us.
      this.sendHello();
      // connected:true is published when the first StandsStateMsg arrives (that
      // is when we actually have honest counts to show); until then the last
      // known view stands, still marked by whatever `connected` was.
    };

    socket.onmessage = (ev: MessageEvent) => {
      this.handleMessage(typeof ev.data === 'string' ? ev.data : String(ev.data));
    };

    socket.onerror = (ev: Event) => {
      console.warn('[CrowdClient] socket error', ev);
    };

    socket.onclose = () => {
      this.ws = null;
      // publish the honest disconnected view: last-known counts, connected:false.
      this.publish();
      if (this.stopped) return;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const maxAttempts = this.opts.maxReconnectAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.reconnectAttempts++;
    if (this.reconnectAttempts > maxAttempts) {
      // give up quietly and stay disconnected — the UI already shows the honest
      // "stands opening soon" state off connected:false. No infinite spin.
      console.warn('[CrowdClient] reconnect attempts exhausted; staying disconnected');
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private sendHello(): void {
    const hello: HelloMsg = {
      type: 'hello',
      matchId: this.opts.matchId,
      anonId: this.anonId,
      ...(this.opts.name ? { name: this.opts.name } : {}),
      ...(this.mySide ? { side: this.mySide } : {}),
    };
    this.sendRaw(hello);
  }

  private flushCheers(): void {
    this.cheerTimer = null;
    const n = this.pendingCheers;
    this.pendingCheers = 0;
    if (n <= 0 || !this.mySide) return;
    const msg: CheerMsg = {
      type: 'cheer',
      matchId: this.opts.matchId,
      side: this.mySide,
      n,
      atMs: Date.now(),
    };
    this.sendRaw(msg);
  }

  private sendRaw(msg: HelloMsg | CheerMsg): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== ws.OPEN) return; // dropped while offline; reconnect re-hellos
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      console.warn('[CrowdClient] send failed', err);
    }
  }

  private handleMessage(raw: string): void {
    let msg: ServerMsg | FeedMsg;
    try {
      msg = JSON.parse(raw) as ServerMsg | FeedMsg;
    } catch {
      return; // not JSON — ignore
    }
    // This client only cares about crowd state. FeedMsg (odds/score/status/
    // ledger/feedState) and other ServerMsg variants (callReceipt/room) ride
    // the same socket but are consumed elsewhere — ignore them here.
    if (msg.type === 'stands') {
      if (msg.matchId !== this.opts.matchId) return; // not our room
      this.applyStands(msg);
    }
  }

  private applyStands(msg: StandsStateMsg): void {
    this.lastCounts = { home: msg.counts.home, away: msg.counts.away };
    this.lastRoar = { home: msg.roar.home, away: msg.roar.away };
    this.everGotState = true;
    this.publish(true);
  }

  /** Build the current CrowdView and hand it to the subscriber. `connected`
   * reflects the live socket + whether we've ever had real state to show. */
  private publish(connectedNow?: boolean): void {
    if (!this.stateCb) return;
    const socketOpen = this.ws !== null && this.ws.readyState === this.ws.OPEN;
    const connected = connectedNow ?? (socketOpen && this.everGotState);
    const view: CrowdView = {
      rooted: { home: this.lastCounts.home, away: this.lastCounts.away },
      roar: { home: this.lastRoar.home, away: this.lastRoar.away },
      faithSide: this.trailingSide,
      connected,
    };
    this.stateCb(view);
  }
}

/** localStorage if present (browser), else undefined (node/tests without a shim). */
function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // access to localStorage can throw in sandboxed frames
  }
  return undefined;
}
