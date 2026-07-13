/**
 * ROOOT — THE LOOM · dev harness (verification entry; the loom lane owns this).
 *
 * Boots the living loom against the REAL ARG–CPV replay (the five-goal epic,
 * fixture 18175918) and provides the controls the design session asked for:
 *   · speed 1× / 8× / 60×          · jump-to: pre · 28′ · 58′ cliff · 90′ death · ET · FT
 *   · pause                         · ⤓ PNG
 *   · colorway toggle (newsprint / press-black)
 *   · reduced-motion: rows settle, no stitch animation
 *
 * DRIVER: ReplayPump (loom/replay-pump.ts) — a faithful twin of the production
 * ReplaySource that runs on a wall-clock the harness owns, so the weave advances
 * at any speed and in any tab (automation tabs are permanently hidden, where
 * ReplaySource's setTimeout pacing is throttled to a crawl). Same FROZEN parsers,
 * same recorded lines, same pacing ceiling — nothing fabricated.
 *
 * NOT a product surface — clearly badged DEV.
 */

import { lookupFixture } from '../data';
import { ReplayPump } from './replay-pump';
import { Weave } from './weave';
import { createLoom } from './loom';
import type { Colorway, LoomView } from './loom';
import type { MatchCallbacks } from '@contracts/match';

const FIXTURE_ID = '18175918'; // ARG–CPV, the bundled real replay
const REPLAY_URL = '/replay/arg-cpv-20260703.jsonl';

/** the jump targets the brief names — match-minute + whether in the ET band */
const JUMPS: { key: string; label: string; minute: number; et: boolean }[] = [
  { key: 'pre', label: 'PRE', minute: 0, et: false },
  { key: '28', label: "28′ ARG", minute: 28, et: false },
  { key: '58', label: "58′ CLIFF", minute: 58, et: false },
  { key: '90', label: "90′ DEATH", minute: 90, et: false },
  { key: 'et', label: 'ET', minute: 105, et: true },
  { key: 'ft', label: 'FT', minute: 120, et: true },
];

type Speed = 1 | 8 | 60;

export function boot(root: HTMLElement): void {
  const params = new URLSearchParams(location.search);
  const reduced =
    params.has('reduced') ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const fixture = lookupFixture(FIXTURE_ID);
  if (!fixture) throw new Error('[loom-dev] fixture meta missing');

  const state = {
    speed: (params.get('speed') === '1' ? 1 : params.get('speed') === '60' ? 60 : 8) as Speed,
    playing: true,
    colorway: (params.get('cw') === 'black' ? 'press-black' : 'newsprint') as Colorway,
  };

  /* ── DOM ────────────────────────────────────────────────────────────── */
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'loom-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'loom-canvas';
  wrap.appendChild(canvas);
  root.appendChild(wrap);
  const ui = document.createElement('div');
  ui.className = 'loom-ui';
  root.appendChild(ui);

  /* ── weave + painter ────────────────────────────────────────────────── */
  const weave = new Weave();
  const loom: LoomView = createLoom(canvas, weave, fixture, reduced, state.colorway);
  weave.on((e) => {
    if (e.type === 'goal') loom.jolt();
    else if (e.type === 'row-complete') loom.snap(e.minute, e.et);
    else if (e.type === 'death') loom.markDeath();
  });

  /* ── the replay pump (harness-owned clock) ──────────────────────────── */
  const pump = new ReplayPump({ url: REPLAY_URL, fixture, speed: state.speed });
  const callbacks: MatchCallbacks = {
    onOdds: (t) => weave.onOdds(t),
    onScore: (ev) => weave.onScore(ev),
    onStatus: (ev) => weave.onStatus(ev),
    onLedger: (m) => weave.onLedger(m),
    onFeedState: () => {},
  };
  let ready = false;
  void pump.initialize().then(() => {
    pump.start(callbacks);
    ready = true;
  });

  // headless assertion surface
  (window as unknown as { __loom?: unknown }).__loom = {
    get cloth() {
      return weave.cloth;
    },
    get progress() {
      return pump.progress;
    },
    jump: (key: string) => doJump(key),
    setColorway: (c: Colorway) => {
      loom.setColorway(c);
      state.colorway = c;
    },
    setSpeed: (s: Speed) => setSpeed(s),
    play: (v: boolean) => {
      state.playing = v;
      syncUI();
    },
  };

  /* ── frame loop (rAF visible; interval pump when hidden) + _devStep ──── */
  let rafId = 0;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let lastT = performance.now();

  function step(dtMs: number): void {
    const dt = Math.min(250, dtMs);
    if (state.playing && ready) pump.advance(dt);
    loom.frame(state.playing ? dt : 0);
  }
  function raf(now: number): void {
    const dt = now - lastT;
    lastT = now;
    step(dt);
    rafId = requestAnimationFrame(raf);
  }
  // _devStep: the harness pump for throttled/hidden tabs (drives BOTH the replay
  // clock and the painter, unlike stage/dev.ts which only pumps the renderer —
  // here the data driver is ours, so one pump advances the whole weave).
  (window as unknown as { _devStep?: (dtMs: number) => void })._devStep = (dtMs: number) => step(dtMs);

  function ensureDriver(): void {
    if (document.hidden) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (timerId == null) {
        lastT = performance.now();
        timerId = setInterval(() => {
          const now = performance.now();
          const dt = now - lastT;
          lastT = now;
          step(dt);
        }, 1000 / 60);
      }
    } else {
      if (timerId != null) {
        clearInterval(timerId);
        timerId = null;
      }
      if (!rafId) {
        lastT = performance.now();
        rafId = requestAnimationFrame(raf);
      }
    }
  }
  document.addEventListener('visibilitychange', ensureDriver);

  /* ── controls ───────────────────────────────────────────────────────── */
  function setSpeed(s: Speed): void {
    state.speed = s;
    pump.setSpeed(s);
    syncUI();
  }
  function doJump(key: string): void {
    const j = JUMPS.find((x) => x.key === key);
    if (!j) return;
    if (key === 'pre') {
      loom.setFollow(true);
      return;
    }
    // fast-forward the replay to the moment (drains real lines), then focus it.
    if (ready) pump.seekToMinute(j.minute, j.et);
    loom.focusMinute(j.minute, j.et);
  }

  function renderUI(): void {
    ui.innerHTML = `
      <div class="loom-panel" data-cw="${state.colorway}">
        <div class="loom-badge">DEV · REAL REPLAY · ARG–CPV · NOT LIVE</div>
        <div class="loom-row">
          <button data-a="play">${state.playing ? '⏸ Pause' : '▶ Play'}</button>
          <label class="loom-speed">speed
            <select data-a="speed">
              <option value="1"${state.speed === 1 ? ' selected' : ''}>1×</option>
              <option value="8"${state.speed === 8 ? ' selected' : ''}>8×</option>
              <option value="60"${state.speed === 60 ? ' selected' : ''}>60×</option>
            </select>
          </label>
          <button data-a="cw">${state.colorway === 'newsprint' ? '◐ press-black' : '◐ newsprint'}</button>
          <button data-a="png" title="download this frame">⤓ PNG</button>
        </div>
        <div class="loom-row loom-jumps">
          <span>jump</span>
          ${JUMPS.map((j) => `<button data-j="${j.key}">${j.label}</button>`).join('')}
        </div>
        <div class="loom-note">every stitch = a real tick · rows = real minutes · the ET market is labeled${reduced ? ' · REDUCED-MOTION' : ''}</div>
      </div>`;
  }
  function syncUI(): void {
    const play = ui.querySelector<HTMLButtonElement>('[data-a="play"]');
    if (play) play.textContent = state.playing ? '⏸ Pause' : '▶ Play';
    const panel = ui.querySelector<HTMLElement>('.loom-panel');
    if (panel) panel.setAttribute('data-cw', state.colorway);
    const cwBtn = ui.querySelector<HTMLButtonElement>('[data-a="cw"]');
    if (cwBtn) cwBtn.textContent = state.colorway === 'newsprint' ? '◐ press-black' : '◐ newsprint';
    const sel = ui.querySelector<HTMLSelectElement>('[data-a="speed"]');
    if (sel) sel.value = String(state.speed);
  }
  renderUI();

  ui.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const a = t.getAttribute('data-a');
    const j = t.getAttribute('data-j');
    if (a === 'play') {
      state.playing = !state.playing;
      syncUI();
    } else if (a === 'cw') {
      state.colorway = state.colorway === 'newsprint' ? 'press-black' : 'newsprint';
      loom.setColorway(state.colorway);
      syncUI();
    } else if (a === 'png') {
      const cl = weave.cloth;
      const min = cl.clockMinute > 0 ? `${Math.floor(cl.clockMinute)}min` : 'pre';
      const link = document.createElement('a');
      link.download = `rooot-loom-${state.colorway}-${min}.png`;
      link.href = loom.toPNG();
      link.click();
    } else if (j !== null) {
      doJump(j);
      if (j !== 'pre') window.setTimeout(() => loom.setFollow(true), 3000);
    }
  });
  ui.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.getAttribute('data-a') === 'speed') {
      const v = Number((t as HTMLSelectElement).value);
      setSpeed(v === 1 || v === 60 ? (v as Speed) : 8);
    }
  });

  window.addEventListener('resize', () => loom.resize());

  loom.resize();
  requestAnimationFrame(() => loom.resize());
  ensureDriver();
}
