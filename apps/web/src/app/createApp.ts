/**
 * ROOOT — THE WATCHING SHELL entry (BRIEF-WATCHING). ONE coherent object on the
 * Newsprint page: scoreband · full-bleed stage window · cheer bar · THE LEDGER ·
 * the social strip — phone-first, desktop two-column. The current poster-in-black
 * dies here.
 *
 * This is the clean seam the coordinator wires from main.ts (which stays
 * coordinator-only):
 *
 *     import { createApp } from './app/createApp';
 *     const app = createApp({ mount: document.body, source, fixture, crowd? });
 *
 * `source` is any MatchDataSource (ReplaySource today, LiveSource in prod) —
 * createApp calls source.start(app.callbacks) with a MatchCallbacks that fans the
 * feed out to BOTH the stage and the ledger builder (onLedger → builder.push,
 * onOdds → builder.pushOdds + stage). `crowd` is an optional CrowdClient
 * (contracts/ledger.ts) Lane C delivers; omitted → the honest disconnected stand-in
 * (STANDS OPENING SOON, ghosted local cheer). createApp never reaches into src/data
 * or contracts — it binds to the frozen shapes only.
 */

import './app.css';
import '../ledger/ledger.css';

import type { Fixture, MatchCallbacks, MatchDataSource, OddsTick, ScoreEvent, StatusEvent } from '@contracts/match';
import type { CrowdClient, CrowdView } from '@contracts/ledger';
import type { Side } from '@contracts/crowd';

import { createStage } from '../stage';
import type { Stage, StageCrowdInput } from '../stage';
import { createLedgerBuilder, createLedgerList } from '../ledger';
import { COLORS } from '../lib/theme';

import { createScoreband } from './scoreband';
import { createSocialStrip, createCheerBar } from './crowd-ui';
import { createInterstitial } from './interstitial';
import { createDisconnectedCrowd } from './crowd-seam';
import { bakePaperSheet } from './paper-field';

export interface CreateAppOptions {
  /** where the shell mounts (usually document.body) */
  mount: HTMLElement;
  /** the feed — ReplaySource / LiveSource / MockSource; started by the shell */
  source: MatchDataSource;
  /** the fixture (teams/flags/kickoff) — usually source.getFixture() */
  fixture: Fixture;
  /** the real stands client (Lane C). Omit → honest disconnected stand-in. */
  crowd?: CrowdClient;
  /** start the source immediately? default true. (false lets tests drive callbacks.) */
  autostart?: boolean;
}

export interface RooootApp {
  /** the MatchCallbacks the source drives (also usable directly in tests) */
  callbacks: MatchCallbacks;
  /** current rooted side, or null */
  mySide(): Side | null;
  destroy(): void;
}

const ROOT_KEY = 'rooot.mySide';

/** contrast-legible ink on a team colour (SYSTEM §1 legibility gate). */
function inkOnHex(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? COLORS.pressBlack : COLORS.newsprint;
}

export function createApp(opts: CreateAppOptions): RooootApp {
  const { mount, source, fixture } = opts;
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── the page skeleton ─────────────────────────────────────────────── */
  mount.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'rt-page';
  // mirror the reduced-motion decision onto the DOM so the CSS can gate on it too —
  // this makes the ?reduced dev override affect CSS animations (which can't see a
  // patched window.matchMedia), and belt-and-suspenders alongside the @media query
  // for real OS settings. Both paths → the settled, motionless end-state (SYSTEM §7).
  if (reducedMotion) page.setAttribute('data-reduced', '');

  // set the design tokens from theme.ts (single source of truth; CSS reads the vars)
  page.style.setProperty('--np', COLORS.newsprint);
  page.style.setProperty('--sb', COLORS.sunbleach);
  page.style.setProperty('--ink', COLORS.pressBlack);
  page.style.setProperty('--grey', COLORS.terraceGrey);
  page.style.setProperty('--gold', COLORS.medalGold);
  page.style.setProperty('--poppy', COLORS.poppy);
  page.style.setProperty('--sky', COLORS.kickoffSky);
  page.style.setProperty('--grass', COLORS.grass);
  page.style.setProperty('--fizz', COLORS.fizzPink);
  page.style.setProperty('--sun', COLORS.aztecaSun);
  // per-fixture team inks (used ONLY in the four legal slots — flag/end/counter/tick)
  const homeHex = fixture.home.colors[0];
  const awayHex = fixture.away.colors[0];
  page.style.setProperty('--home', homeHex);
  page.style.setProperty('--away', awayHex);
  page.style.setProperty('--home-ink', inkOnHex(homeHex));
  page.style.setProperty('--away-ink', inkOnHex(awayHex));

  // THE SHEET: bake the paper materiality once and lay it under the whole page so the
  // experience reads as printed on one warm sheet, not a flat hex (BRIEF-PRINT-SOUL §3).
  const sheet = bakePaperSheet();
  if (sheet) {
    page.style.backgroundImage = `url("${sheet}")`;
    page.style.backgroundSize = 'cover';
    page.style.backgroundAttachment = 'fixed';
    page.setAttribute('data-sheet', ''); // CSS drops the flat tooth-tile in favour of the bake
  }

  // scoreband spans the top; below it, a centered shell holds the two-column grid
  const scoreband = createScoreband(fixture);
  page.appendChild(scoreband.el);

  const shell = document.createElement('div');
  shell.className = 'rt-shell';
  page.appendChild(shell);

  const cols = document.createElement('div');
  cols.className = 'rt-cols';
  shell.appendChild(cols);

  // left column: the stage window + social strip + cheer-bar dock (desktop)
  const stageCol = document.createElement('div');
  stageCol.className = 'rt-stage-col';
  cols.appendChild(stageCol);

  const stageWrap = document.createElement('div');
  stageWrap.className = 'rt-stage-wrap';
  const canvas = document.createElement('canvas');
  stageWrap.appendChild(canvas);
  stageCol.appendChild(stageWrap);

  const strip = createSocialStrip(fixture);
  stageCol.appendChild(strip.el);

  // the cheer bar: fixed at thumb on phone (appended to page so it escapes the grid),
  // docked under the stage on desktop (moved into the stage column). One element, two
  // homes — placement is decided here by viewport so CSS stays declarative.
  const cheerBar = createCheerBar(fixture, reducedMotion);
  const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches;
  if (desktop) stageCol.appendChild(cheerBar.el);
  else page.appendChild(cheerBar.el);

  // right column: THE LEDGER (empty state greets with the kickoff time)
  const builder = createLedgerBuilder();
  const ledger = createLedgerList({ builder, reducedMotion, kickoffLabel: kickoffHHMM(fixture.kickoffISO) });
  // hand the tricodes to the list so goal rows can stamp "ARG 1–0 CPV"
  ledger.el.dataset.homeCode = fixture.home.code;
  ledger.el.dataset.awayCode = fixture.away.code;
  cols.appendChild(ledger.el);

  // the root interstitial (first visit)
  const interstitial = createInterstitial(fixture);
  page.appendChild(interstitial.el);

  mount.appendChild(page);

  // keep CSS vars for sticky offsets fresh (scoreband/ ledger heights)
  const sbH = scoreband.el.getBoundingClientRect().height || 56;
  page.style.setProperty('--scoreband-h', `${Math.round(sbH)}px`);
  const cbH = cheerBar.el.getBoundingClientRect().height || 128;
  page.style.setProperty('--cheerbar-h', `${Math.round(cbH)}px`);

  /* ── the stage ─────────────────────────────────────────────────────── */
  const stage: Stage = createStage({ canvas, fixture, mySide: null, posed: false });

  // Hidden/automation tabs throttle rAF to zero — pump the stage when hidden so
  // headless verification + backgrounded phones stay live (mirrors main.ts/dev.ts).
  const pump = stage as Stage & { _devStep?: (dt: number) => void };
  let lastPump = performance.now();
  const pumpTimer = window.setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.25, (now - lastPump) / 1000);
    lastPump = now;
    if (document.hidden) pump._devStep?.(dt);
  }, 120);

  /* ── the crowd (real client or honest disconnected stand-in) ───────── */
  let sideRef: Side | null = readSide();
  const crowd: CrowdClient = opts.crowd ?? createDisconnectedCrowd(() => sideRef);

  // the stage's crowd input (StageCrowdInput) is COUNTS + roar + pulse; CrowdView
  // carries counts + roar (+faith). We forward what we have; pulse stays neutral (the
  // ends' resting motion is atmosphere, not a crowd claim — honest when disconnected).
  function toStageCrowd(v: CrowdView): StageCrowdInput {
    return {
      counts: { home: v.rooted.home, away: v.rooted.away },
      roar: { home: v.roar.home, away: v.roar.away },
      pulse: {
        home: { belief: 0, nerves: 0, rage: 0 },
        away: { belief: 0, nerves: 0, rage: 0 },
      },
    };
  }

  crowd.onState((v: CrowdView) => {
    strip.set(v);
    cheerBar.set(v);
    stage.setCrowd(toStageCrowd(v));
    // the scoreband's phase chip speaks the stakes when faith is live
    scoreband.setFaith(v.faithSide != null);
  });

  cheerBar.onCheer(() => crowd.cheer());
  cheerBar.onPickRequest(() => interstitial.open());

  /* ── root choice (persist locally + hello the service) ─────────────── */
  function applySide(side: Side | null): void {
    sideRef = side;
    stage.setMySide(side);
    cheerBar.setSide(side);
  }
  interstitial.onPick((side) => {
    writeSide(side);
    applySide(side);
    crowd.root(side); // hello the stands (no-op on the disconnected stand-in)
    interstitial.close();
  });

  // returning fan: skip the interstitial, restore their end
  if (sideRef) {
    applySide(sideRef);
    interstitial.close();
  } else {
    applySide(null);
    interstitial.open();
  }

  /* ── the PAUSE → poster switch (scoreband) ─────────────────────────── */
  let posed = false;
  scoreband.onPause(() => {
    posed = !posed;
    stage.setPosed(posed);
    scoreband.setPosed(posed);
  });

  /* ── feed → stage + ledger (the fan-out) ───────────────────────────── */
  const callbacks: MatchCallbacks = {
    onOdds: (tick: OddsTick) => {
      stage.callbacks.onOdds(tick);
      builder.pushOdds(tick); // swing correlation reads real ticks
    },
    onScore: (ev: ScoreEvent) => {
      stage.callbacks.onScore(ev);
      scoreband.set({ homeScore: Math.max(0, Math.floor(ev.home)), awayScore: Math.max(0, Math.floor(ev.away)), minute: ev.minute ?? undefined });
    },
    onStatus: (ev: StatusEvent) => {
      stage.callbacks.onStatus(ev);
      scoreband.set({ phase: ev.phase, minute: ev.minute ?? undefined });
    },
    onFeedState: (s) => {
      stage.callbacks.onFeedState?.(s);
      scoreband.set({ feed: s });
    },
    onLedger: (msg) => {
      builder.push(msg);
    },
  };

  /* ── resize ────────────────────────────────────────────────────────── */
  const onResize = (): void => {
    stage.resize();
    const h = scoreband.el.getBoundingClientRect().height || 56;
    page.style.setProperty('--scoreband-h', `${Math.round(h)}px`);
    const ch = cheerBar.el.getBoundingClientRect().height || 128;
    page.style.setProperty('--cheerbar-h', `${Math.round(ch)}px`);
  };
  window.addEventListener('resize', onResize);
  // one deferred resize after fonts/layout settle so the canvas picks up its box
  requestAnimationFrame(() => stage.resize());

  /* ── start the feed ────────────────────────────────────────────────── */
  if (opts.autostart !== false) {
    void source.initialize().then(() => source.start(callbacks));
  }

  return {
    callbacks,
    mySide: () => sideRef,
    destroy() {
      window.removeEventListener('resize', onResize);
      window.clearInterval(pumpTimer);
      crowd.close();
      ledger.destroy();
      stage.destroy();
      source.stop();
      mount.innerHTML = '';
    },
  };
}

/** kickoff time as UTC "HH:MM" for the ledger's greeting; '' if unparseable. */
function kickoffHHMM(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function readSide(): Side | null {
  try {
    const v = localStorage.getItem(ROOT_KEY);
    return v === 'home' || v === 'away' ? v : null;
  } catch {
    return null;
  }
}
function writeSide(side: Side): void {
  try {
    localStorage.setItem(ROOT_KEY, side);
  } catch {
    /* private mode — the choice lives for the session only */
  }
}
