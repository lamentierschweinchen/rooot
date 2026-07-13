/**
 * ROOOT stage — DEV HARNESS (dev-only, clearly labeled). NOT shipped to users.
 *
 * Drives the real MatchCallbacks with a scripted match so the stage can be judged
 * without a live feed, and simulates the crowd bus (StageCrowdInput). The script:
 *   pre-match 45/25/30 · early goal AGAINST the bottom side (drops to ~18%) ·
 *   slow climb · equalizer ~63' · late winner ~86' (to ~85%) · FT.
 * Crowd: roar rising/falling, plus a FAITH moment (heavy roar while behind).
 *
 * Controls (top-left overlay): Play/Pause, speed, scrub to key states, reduced-motion
 * reload, and a legend that says DEV loud. A live "market vs crowd" ticker proves the
 * two are separate signals (honesty).
 */

import type { Fixture, OddsTick, ScoreEvent, MatchPhase } from '@contracts/match';
import type { ReactKind, Side } from '@contracts/crowd';
import { createStage } from './index';
import type { StageCrowdInput, Stage } from './index';

/* ── the fixture (team codes + unicode flags only; no federation marks) ── */
const FIXTURE: Fixture = {
  id: 'dev-mex-arg',
  home: { code: 'MEX', name: 'Mexico', colors: ['#0B6E4F', '#F4F4F4'], flag: '🇲🇽' },
  away: { code: 'ARG', name: 'Argentina', colors: ['#6CB4E4', '#FFFFFF'], flag: '🇦🇷' },
  kickoffISO: new Date().toISOString(),
  venue: 'DEV — scripted match',
};

/** mySide = home (MEX) at the bottom: the drama is the bottom side going behind then winning. */
const MY_SIDE: Side = 'home';

/* ── the script: a timeline of odds/score/status keyframes, in "match seconds" ──
 * We compress 90' into ~72s of wall time at 1× (scale via speed control). Each odds
 * keyframe is a de-vigged triple; the stage eases between them. Goals fire fire. */

interface OddsKey { min: number; pH: number; pD: number; pA: number }
interface ScoreKey { min: number; h: number; a: number; side: Side }
interface StatusKey { min: number; phase: MatchPhase }

// odds from MEX's perspective (pH = MEX win, pA = ARG win)
const ODDS: OddsKey[] = [
  { min: 0, pH: 0.45, pD: 0.25, pA: 0.30 }, // pre-match balance
  { min: 8, pH: 0.44, pD: 0.26, pA: 0.30 },
  { min: 13, pH: 0.18, pD: 0.24, pA: 0.58 }, // early goal against → collapse to ~18%
  { min: 25, pH: 0.22, pD: 0.26, pA: 0.52 },
  { min: 40, pH: 0.28, pD: 0.30, pA: 0.42 }, // slow climb
  { min: 55, pH: 0.34, pD: 0.33, pA: 0.33 },
  { min: 62, pH: 0.40, pD: 0.34, pA: 0.26 },
  { min: 63, pH: 0.42, pD: 0.36, pA: 0.22 }, // just before equalizer, fog thick (level-ish)
  { min: 64, pH: 0.50, pD: 0.30, pA: 0.20 }, // equalizer → MEX ahead on belief
  { min: 75, pH: 0.55, pD: 0.28, pA: 0.17 },
  { min: 84, pH: 0.58, pD: 0.27, pA: 0.15 },
  { min: 86, pH: 0.85, pD: 0.10, pA: 0.05 }, // late winner → ~85%
  { min: 90, pH: 0.90, pD: 0.07, pA: 0.03 },
];

const SCORES: ScoreKey[] = [
  { min: 13, h: 0, a: 1, side: 'away' }, // ARG scores early (against MEX)
  { min: 64, h: 1, a: 1, side: 'home' }, // MEX equalize
  { min: 86, h: 2, a: 1, side: 'home' }, // MEX late winner
];

const STATUS: StatusKey[] = [
  { min: -1, phase: 'PRE' },
  { min: 0, phase: 'FIRST_HALF' },
  { min: 45, phase: 'HALF_TIME' },
  { min: 46, phase: 'SECOND_HALF' },
  { min: 90, phase: 'FULL_TIME' },
];

const FULL_MATCH_MIN = 94;
const BASE_WALL_SECONDS = 72; // wall time for a full match at 1×

/* ── crowd simulation ────────────────────────────────────────────────── */
/* roar = decayed cheers/sec. We craft a curve: warm pre-match, drops when MEX concede,
 * a FAITH SURGE (heavy MEX roar while behind), spikes on both goals, huge on the winner. */
function crowdAt(min: number, homeScore: number, awayScore: number): StageCrowdInput {
  const homeBehind = homeScore < awayScore;
  // base ambient roar both sides
  let rHome = 3 + 1.5 * Math.sin(min * 0.5);
  let rAway = 2.5 + 1.2 * Math.sin(min * 0.4 + 1);

  // ARG celebrate their goal 13-18'
  if (min >= 13 && min < 19) rAway += 10 * (1 - (min - 13) / 6);
  // MEX FAITH: 20-45' heavy home roar while a goal down (the faith moment)
  if (min >= 20 && min < 46 && homeBehind) rHome += 6 + 3 * Math.sin(min * 1.3);
  // MEX equalizer 64-70'
  if (min >= 64 && min < 71) rHome += 12 * (1 - (min - 64) / 7);
  // MEX winner 86-94'
  if (min >= 86) rHome += 16 * Math.max(0, 1 - (min - 86) / 8);

  rHome = Math.max(0, rHome);
  rAway = Math.max(0, rAway);

  // counts grow slightly across the match; MEX (home, the local) larger
  const grow = Math.min(1, Math.max(0, min) / 90);
  const cHome = Math.round(11800 + 700 * grow + (homeBehind ? 400 : 0));
  const cAway = Math.round(8100 + 300 * grow);

  const pulse: { home: Record<ReactKind, number>; away: Record<ReactKind, number> } = {
    home: {
      belief: Math.round(rHome * 20),
      nerves: Math.round((homeBehind ? 40 : 12) + 10 * Math.abs(Math.sin(min))),
      rage: Math.round(homeBehind ? 18 : 4),
    },
    away: {
      belief: Math.round(rAway * 18),
      nerves: Math.round((awayScore <= homeScore ? 30 : 10) + 6),
      rage: Math.round(4),
    },
  };

  return { counts: { home: cHome, away: cAway }, roar: { home: rHome, away: rAway }, pulse };
}

/* ── interpolate odds between keyframes ──────────────────────────────── */
function oddsAt(min: number): OddsTick {
  let lo = ODDS[0]!;
  let hi = ODDS[ODDS.length - 1]!;
  for (let i = 0; i < ODDS.length - 1; i++) {
    const a = ODDS[i]!;
    const b = ODDS[i + 1]!;
    if (min >= a.min && min <= b.min) {
      lo = a;
      hi = b;
      break;
    }
    if (min < ODDS[0]!.min) {
      lo = hi = ODDS[0]!;
      break;
    }
    if (min > ODDS[ODDS.length - 1]!.min) {
      lo = hi = ODDS[ODDS.length - 1]!;
      break;
    }
  }
  const span = hi.min - lo.min;
  const t = span > 0 ? (min - lo.min) / span : 0;
  return {
    tMs: Date.now(),
    minute: Math.max(0, Math.floor(min)),
    pHome: lo.pH + (hi.pH - lo.pH) * t,
    pDraw: lo.pD + (hi.pD - lo.pD) * t,
    pAway: lo.pA + (hi.pA - lo.pA) * t,
    source: 'replay',
  };
}

/* ── boot ────────────────────────────────────────────────────────────── */
export function boot(canvas: HTMLCanvasElement, ui: HTMLElement): void {
  // DEV-only: `?reduced` forces prefers-reduced-motion so the calm variant can be verified
  // without touching the createStage contract (the stage reads window.matchMedia at build).
  if (new URLSearchParams(location.search).has('reduced')) {
    const realMM = window.matchMedia.bind(window);
    window.matchMedia = ((q: string) => {
      if (typeof q === 'string' && q.includes('prefers-reduced-motion')) {
        return { matches: true, media: q, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList;
      }
      return realMM(q);
    }) as typeof window.matchMedia;
  }

  const stage = createStage({ canvas, fixture: FIXTURE, mySide: MY_SIDE });
  // verification hook: pump N frames of dt synchronously (deterministic capture under a
  // hidden/throttled tab). Not used in production.
  (window as unknown as { __devPump?: (n: number, dt: number) => void }).__devPump = (
    n: number,
    dt: number,
  ) => {
    const s = stage as Stage & { _devStep?: (d: number) => void };
    for (let k = 0; k < n; k++) s._devStep?.(dt);
  };

  let playing = true;
  let speed = 1;
  let roarBoost = false;
  let matchMin = -2; // start just before kickoff
  let firedScores = new Set<number>();
  let lastStatus: MatchPhase | null = null;
  let curScore = { h: 0, a: 0 };

  // deliver initial odds + status immediately so frame 1 is honest
  stage.callbacks.onStatus({ tMs: Date.now(), phase: 'PRE', minute: null, source: 'replay' });
  stage.callbacks.onFeedState?.('replay');
  stage.callbacks.onOdds(oddsAt(0));

  function applyStatus(min: number): void {
    let want: MatchPhase = 'PRE';
    for (const s of STATUS) if (min >= s.min) want = s.phase;
    if (want !== lastStatus) {
      lastStatus = want;
      stage.callbacks.onStatus({
        tMs: Date.now(),
        phase: want,
        minute: min < 0 ? null : Math.floor(min),
        source: 'replay',
      });
    }
  }

  function applyScores(min: number): void {
    for (const s of SCORES) {
      if (min >= s.min && !firedScores.has(s.min)) {
        firedScores.add(s.min);
        curScore = { h: s.h, a: s.a };
        const ev: ScoreEvent = {
          tMs: Date.now(),
          minute: Math.floor(s.min),
          home: s.h,
          away: s.a,
          side: s.side,
          source: 'replay',
        };
        stage.callbacks.onScore(ev);
      }
    }
  }

  let lastWall = performance.now();
  let oddsAccum = 0;
  // The stage is a Stage plus a dev-only _devStep(dt) for pumping frames when RAF is
  // paused (a hidden/automation tab throttles requestAnimationFrame to zero).
  const devStage = stage as Stage & { _devStep?: (dt: number) => void };

  function drive(now: number): void {
    const dtWall = Math.min(0.1, (now - lastWall) / 1000);
    lastWall = now;
    if (playing) {
      const perSecMin = (FULL_MATCH_MIN / BASE_WALL_SECONDS) * speed;
      matchMin += dtWall * perSecMin;
      if (matchMin > FULL_MATCH_MIN) {
        matchMin = FULL_MATCH_MIN;
        playing = false;
        syncButtons();
      }
      applyStatus(matchMin);
      applyScores(matchMin);
      oddsAccum += dtWall;
      if (oddsAccum >= 0.4) {
        oddsAccum = 0;
        stage.callbacks.onOdds(oddsAt(matchMin));
      }
    }
    const c = crowdAt(matchMin, curScore.h, curScore.a);
    if (roarBoost) {
      // DEV override: both ends at full throat (verifies "the end BURNS" at high roar)
      c.roar = { home: 26, away: 20 };
      c.pulse.home.belief += 400;
      c.pulse.away.belief += 300;
    }
    stage.setCrowd(c);
    updateReadout(matchMin);
    // When the tab is HIDDEN the stage's own RAF is paused, so pump it a frame here so
    // animation still advances under automation/headless capture. When visible, the
    // stage's RAF drives itself — don't double-step (that would run at 2x).
    if (document.hidden) devStage._devStep?.(dtWall);
  }

  // Prefer RAF (60fps when visible); fall back to a timer when the tab is hidden so the
  // scripted match + stage keep advancing under automation/headless capture.
  let rafId = 0;
  let timerId: ReturnType<typeof setInterval> | null = null;
  function rafTick(now: number): void {
    drive(now);
    rafId = requestAnimationFrame(rafTick);
  }
  function ensureDriver(): void {
    if (document.hidden) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (timerId == null) timerId = setInterval(() => drive(performance.now()), 1000 / 60);
    } else {
      if (timerId != null) {
        clearInterval(timerId);
        timerId = null;
      }
      if (!rafId) rafId = requestAnimationFrame(rafTick);
    }
  }
  document.addEventListener('visibilitychange', ensureDriver);

  /* ── DEV UI ─────────────────────────────────────────────────────── */
  ui.innerHTML = `
    <div class="dev-panel">
      <div class="dev-badge">DEV · SCRIPTED MATCH · NOT LIVE</div>
      <div class="dev-row">
        <button data-a="play">⏸ Pause</button>
        <button data-a="restart">⏮ Restart</button>
        <button data-a="shot" title="download this frame as a PNG">⤓ PNG</button>
        <button data-a="roar" title="override: both ends at full roar">🔥 roar</button>
        <label>speed
          <select data-a="speed">
            <option value="0.5">0.5×</option>
            <option value="1" selected>1×</option>
            <option value="2">2×</option>
            <option value="4">4×</option>
          </select>
        </label>
      </div>
      <div class="dev-row dev-jump">
        <span>jump:</span>
        <button data-j="0">pre 45/25/30</button>
        <button data-j="14">the dark 18%</button>
        <button data-j="64">equalizer + fire</button>
        <button data-j="86">late winner 85%</button>
        <button data-j="92">full time</button>
      </div>
      <div class="dev-readout" data-el="readout"></div>
      <div class="dev-note">market = halftone dot-fields on the pitch · crowd = pictogram ends · never blended</div>
    </div>`;

  const btnPlay = ui.querySelector<HTMLButtonElement>('[data-a="play"]')!;
  const readout = ui.querySelector<HTMLElement>('[data-el="readout"]')!;

  function syncButtons(): void {
    btnPlay.textContent = playing ? '⏸ Pause' : '▶ Play';
  }
  function jump(min: number): void {
    matchMin = min;
    // re-fire status/scores deterministically for the jumped-to time
    lastStatus = null;
    firedScores = new Set<number>();
    curScore = { h: 0, a: 0 };
    for (const s of SCORES) if (min >= s.min) { firedScores.add(s.min); curScore = { h: s.h, a: s.a }; }
    // set score without a fresh eruption when scrubbing backward is fine; forward jumps
    // that cross a goal will fire on the applyScores path next tick if not pre-marked.
    stage.callbacks.onScore({
      tMs: Date.now(),
      minute: Math.max(0, Math.floor(min)),
      home: curScore.h,
      away: curScore.a,
      source: 'replay',
    });
    applyStatus(min);
    stage.callbacks.onOdds(oddsAt(min));
    stage.setCrowd(crowdAt(min, curScore.h, curScore.a));
  }

  ui.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const a = t.getAttribute('data-a');
    const j = t.getAttribute('data-j');
    if (a === 'shot') {
      const min = matchMin < 0 ? 'pre' : `${Math.floor(matchMin)}min`;
      const link = document.createElement('a');
      link.download = `rooot-stage-${min}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } else if (a === 'roar') {
      roarBoost = !roarBoost;
      t.textContent = roarBoost ? '🔥 ROARING' : '🔥 roar';
    } else if (a === 'play') {
      playing = !playing;
      syncButtons();
    } else if (a === 'restart') {
      matchMin = -2;
      firedScores = new Set<number>();
      lastStatus = null;
      curScore = { h: 0, a: 0 };
      playing = true;
      syncButtons();
    } else if (j !== null) {
      const min = Number(j);
      // a jump forward across a goal should still show its fire — nudge just before it
      jump(min);
    }
  });
  ui.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.getAttribute('data-a') === 'speed') {
      speed = Number((t as HTMLSelectElement).value) || 1;
    }
  });

  function updateReadout(min: number): void {
    const o = oddsAt(min);
    const c = crowdAt(min, curScore.h, curScore.a);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const minLabel = min < 0 ? 'pre' : `${Math.floor(min)}'`;
    readout.innerHTML =
      `<b>${minLabel}</b> &nbsp; MARKET ` +
      `<span class="mkt">MEX ${pct(o.pHome)} · draw ${pct(o.pDraw)} · ARG ${pct(o.pAway)}</span>` +
      `<br>SCORE <b>${curScore.h}–${curScore.a}</b> &nbsp; ROAR ` +
      `<span class="crd">MEX ${c.roar.home.toFixed(1)} · ARG ${c.roar.away.toFixed(1)}</span>` +
      (curScore.h < curScore.a ? ` &nbsp; <span class="faith">FAITH ×2</span>` : '');
  }

  window.addEventListener('resize', () => stage.resize());
  syncButtons();
  ensureDriver();
}
