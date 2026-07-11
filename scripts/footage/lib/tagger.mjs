/**
 * Turns the raw wire (contracts/feed.ts FeedMsg + contracts/crowd.ts
 * ServerMsg, as fanned out by services/stands) into the editor's timeline --
 * so the money moments (a goal on the loom, the GOOOL eruption, the crowd
 * split at a Pulse reveal) are findable without scrubbing hours of video.
 *
 * Honesty rules carried through: everything logged is a REAL wire message --
 * nothing synthesized, nothing blended. `_replay`-tagged messages (the join
 * snapshot's history) never produce timeline entries; the untagged current
 * status/score the join replay sends become explicit `baseline` lines so a
 * reconnect can never fake a kickoff or a goal.
 *
 * `onMoneyEvent(tag)` fires for goals and phase changes only -- the segment
 * rotation triggers per the brief ("new video segment on every goal/status
 * event").
 */

/** Ledger kinds worth a timeline line (the drama vocabulary). Shots/corners/
 * possession are far too chatty for a scrub file -- the video has them. */
const LEDGER_KINDS = new Set(['goal', 'red-card', 'var', 'possible', 'penalty-kick']);

const ODDS_LOG_GAP_MS = 60_000; // one belief line per minute is plenty for scrubbing
const STANDS_SAMPLE_GAP_MS = 300_000; // crowd-size context every 5 min
const CHEER_BURST_WINDOW_MS = 10_000; // brief: bursts = >3 echoes / 10s
const CHEER_BURST_MIN = 4; // ">3"
const CHEER_BURST_RELOG_MS = 10_000; // at most one burst line per window

/** The join snapshot delivers its cached status/score within ~1-2s of
 * connect; anything arriving later is a LIVE broadcast. Observed on the real
 * pre-match wire (Jul 11, 18213979): no status/score is cached at all until
 * the scores stream wakes near kickoff -- so the first status this rig ever
 * sees can BE the kickoff broadcast itself, and the first score can BE the
 * first goal. Past this age, treat them as such rather than as baselines. */
const LATE_FIRST_MS = 120_000;

function round3(n) {
  return typeof n === 'number' ? Math.round(n * 1000) / 1000 : null;
}

export class Tagger {
  constructor(log, { onMoneyEvent = () => {} } = {}) {
    this.log = log;
    this.onMoneyEvent = onMoneyEvent;
    this.bornMs = Date.now();
    this.phase = null;
    this.score = null;
    this.sawOdds = false;
    this.lastOddsLogMs = 0;
    this.lastStandsLogMs = 0;
    this.cheers = []; // rolling {atMs, side}
    this.lastBurstLogMs = 0;
    this.feedState = null;
  }

  handle(m) {
    if (!m || typeof m !== 'object') return;
    const replay = m._replay === true;

    switch (m.type) {
      case 'status': {
        const ev = m.ev;
        if (!ev || !ev.phase) return;
        if (replay) return; // history: never a timeline entry
        if (this.phase === null) {
          this.phase = ev.phase;
          // a FIRST_HALF arriving long after connect is the live kickoff
          // broadcast itself (see LATE_FIRST_MS), not a join-replay baseline.
          if (ev.phase === 'FIRST_HALF' && Date.now() - this.bornMs > LATE_FIRST_MS) {
            this.log.log('kickoff', { minute: ev.minute ?? null, firstObserved: true });
            this.onMoneyEvent('kickoff');
          } else {
            this.log.log('baseline', { phase: ev.phase, minute: ev.minute ?? null });
          }
          return;
        }
        if (ev.phase === this.phase) return; // join-replay repeat / re-emission
        const prev = this.phase;
        this.phase = ev.phase;
        if (ev.phase === 'FIRST_HALF' && prev === 'PRE') {
          this.log.log('kickoff', { minute: ev.minute ?? null });
          this.onMoneyEvent('kickoff');
        } else {
          this.log.log('status', { phase: ev.phase, prev, minute: ev.minute ?? null });
          this.onMoneyEvent(`status-${ev.phase}`);
        }
        return;
      }

      case 'score': {
        const ev = m.ev;
        if (!ev || typeof ev.home !== 'number' || typeof ev.away !== 'number') return;
        if (replay) return;
        const s = { home: ev.home, away: ev.away };
        if (this.score === null) {
          this.score = s;
          // a non-zero first score long after connect is a live goal we must
          // not swallow as baseline (nothing was cached pre-match).
          if ((s.home > 0 || s.away > 0) && Date.now() - this.bornMs > LATE_FIRST_MS) {
            this.log.log('goal', { score: s, prev: null, side: ev.side ?? null, scorer: ev.scorer ?? null, minute: ev.minute ?? null, firstObserved: true });
            this.onMoneyEvent(`goal-${s.home}-${s.away}`);
          } else {
            this.log.log('baseline', { score: s, minute: ev.minute ?? null });
          }
          return;
        }
        if (s.home === this.score.home && s.away === this.score.away) return;
        const prev = this.score;
        this.score = s;
        const increased = s.home > prev.home || s.away > prev.away;
        const type = increased ? 'goal' : 'score-correction'; // a decrement = VAR chalk-off
        this.log.log(type, {
          score: s,
          prev,
          side: ev.side ?? null,
          scorer: ev.scorer ?? null,
          minute: ev.minute ?? null,
        });
        this.onMoneyEvent(`${increased ? 'goal' : 'score'}-${s.home}-${s.away}`);
        return;
      }

      case 'odds': {
        const t = m.tick;
        if (!t) return;
        const entry = { pHome: round3(t.pHome), pDraw: round3(t.pDraw), pAway: round3(t.pAway), period: t.period || 'full', minute: t.minute ?? null };
        const now = Date.now();
        if (!this.sawOdds) {
          this.sawOdds = true;
          this.lastOddsLogMs = now;
          this.log.log('market-open', entry); // the first tick this room ever showed us
          return;
        }
        if (now - this.lastOddsLogMs >= ODDS_LOG_GAP_MS) {
          this.lastOddsLogMs = now;
          this.log.log('odds', entry);
        }
        return;
      }

      case 'ledger': {
        if (replay) return;
        const inner = m.msg;
        if (!inner || inner.type !== 'event') return;
        const ev = inner.ev;
        if (!ev || !LEDGER_KINDS.has(ev.kind)) return;
        this.log.log('ledger', {
          kind: ev.kind,
          side: ev.side ?? null,
          minute: ev.minute ?? null,
          detail: ev.detail ?? null,
          id: ev.id ?? null,
        });
        return;
      }

      case 'moment': {
        // a Pulse window opening is current drama even when delivered on join
        this.log.log('moment', { kind: m.kind, side: m.side ?? null, minute: m.minute ?? null, momentId: m.momentId });
        return;
      }

      case 'momentResult': {
        const h = m.byEnd && m.byEnd.home;
        const a = m.byEnd && m.byEnd.away;
        this.log.log('momentResult', {
          kind: m.kind,
          minute: m.minute ?? null,
          home: h ? { top: h.top, pct: round3(h.pct), n: h.n } : null,
          away: a ? { top: a.top, pct: round3(a.pct), n: a.n } : null,
        });
        return;
      }

      case 'cheerEcho': {
        const now = Date.now();
        this.cheers.push({ atMs: now, side: m.side });
        while (this.cheers.length && now - this.cheers[0].atMs > CHEER_BURST_WINDOW_MS) this.cheers.shift();
        if (this.cheers.length >= CHEER_BURST_MIN && now - this.lastBurstLogMs > CHEER_BURST_RELOG_MS) {
          this.lastBurstLogMs = now;
          const home = this.cheers.filter((c) => c.side === 'home').length;
          this.log.log('cheerBurst', { in10s: this.cheers.length, home, away: this.cheers.length - home });
        }
        return;
      }

      case 'stands': {
        const now = Date.now();
        if (now - this.lastStandsLogMs < STANDS_SAMPLE_GAP_MS) return;
        this.lastStandsLogMs = now;
        this.log.log('stands', { counts: m.counts, roar: m.roar, presence: m.presence });
        return;
      }

      case 'feedState': {
        if (m.state === this.feedState) return;
        this.feedState = m.state;
        this.log.log('feedState', { state: m.state });
        return;
      }

      case 'sentiment': {
        // the crystallized record at full time -- the night's headline
        const r = m.record;
        this.log.log('sentiment', { headline: r ? r.headline : null });
        return;
      }

      default:
        return; // consensus/welcome/room/etc: not timeline material
    }
  }
}
