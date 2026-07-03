/**
 * ROOOT composition root — coordinator-only (see AGENTS.md).
 *
 * Tonight's wiring: the fog-of-war stage fed by ReplaySource on the bundled
 * REAL fixture (Argentina–Cape Verde pre-match market window, captured live
 * from TxLINE). No crowd service wired yet — counts stay honestly at zero;
 * the ends' resting smoke is stage atmosphere, not a crowd claim. When the
 * replay window ends, the stage holds its last true frame (honest).
 * The scripted dramatic demo lives at /stage-dev.html (DEV-labeled).
 */
import { createStage } from './stage';
import { ReplaySource, lookupFixture } from './data';

function mount(): void {
  const fixture = lookupFixture('18175918');
  if (!fixture) throw new Error('[rooot] fixture meta missing');

  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#03050A;overflow:hidden';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  document.body.appendChild(canvas);

  const note = document.createElement('div');
  note.textContent = 'replay · real market data · captured live from TxLINE · devnet';
  note.style.cssText =
    'position:fixed;left:0;right:0;bottom:10px;text-align:center;' +
    'font:10px ui-monospace,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase;' +
    'color:rgba(237,230,214,.34);pointer-events:none';
  document.body.appendChild(note);

  const stage = createStage({ canvas, fixture, mySide: null });
  addEventListener('resize', () => stage.resize());

  // Hidden/automation tabs throttle requestAnimationFrame to zero (see
  // stage/dev.ts's identical pump). Keep the stage breathing when hidden so
  // headless verification and backgrounded phones resume seamlessly.
  const pump = stage as typeof stage & { _devStep?: (dt: number) => void };
  let lastPump = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.25, (now - lastPump) / 1000);
    lastPump = now;
    if (document.hidden) pump._devStep?.(dt);
  }, 120);

  const source = new ReplaySource({
    url: '/replay/arg-cpv-20260703.jsonl',
    fixture,
    speed: 60, // ~150 heartbeat lines precede the first odds tick — at 60x the belief settles in seconds
  });
  void source.initialize().then(() => source.start(stage.callbacks));
}

mount();
console.log('[rooot] stage live — replaying the real ARG–CPV market window.');
