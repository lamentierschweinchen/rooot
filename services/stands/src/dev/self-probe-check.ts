/**
 * SELF-PROBE DEAD-MAN CHECK (tonight-gate, Jul 11 NOR–ENG wedge fix) —
 * proves armSelfProbe (server.ts) across a REAL process boundary, both ways:
 *
 *   1. WEDGE → EXIT: a child boots the real server + probe, runs healthy
 *      (several passing probes — also proving misses reset on success), then
 *      closes its listener while staying alive — the exact live signature
 *      (accept path dead, event loop fine, Fly checks timing out for 40+
 *      minutes). The probe must log the WEDGED line and exit(1) within
 *      maxMisses × interval + margin, so a supervisor restart can heal it.
 *   2. HEALTHY → NO EXIT: an identical child that never wedges must still be
 *      running (no false positive) after the same window, then is killed.
 *
 * Tiny env values (the same clamped envs production reads: interval floor
 * 1s, timeout floor 250ms) keep the whole check under ~20s.
 *
 * Usage: tsx src/dev/self-probe-check.ts (or: npm run check:self-probe)
 */
import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const STANDS_ROOT = fileURLToPath(new URL('../../', import.meta.url)); // services/stands/
const TSX_BIN = path.join(STANDS_ROOT, 'node_modules', '.bin', 'tsx');

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}

interface Booted {
  proc: ChildProcessByStdio<null, Readable, Readable>;
  out(): string;
  exited: Promise<number | null>;
}

function bootDriver(extraEnv: Record<string, string>): Booted {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-selfprobe-check-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    STANDS_DATA_DIR: dataDir,
    SELF_PROBE_INTERVAL_MS: '1000',
    SELF_PROBE_TIMEOUT_MS: '500',
    SELF_PROBE_MAX_MISSES: '3',
    ...extraEnv,
  };
  const proc = spawn(TSX_BIN, ['src/dev/self-probe-driver.ts'], {
    cwd: STANDS_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chunks: string[] = [];
  proc.stdout.on('data', (c: Buffer) => chunks.push(c.toString()));
  proc.stderr.on('data', (c: Buffer) => chunks.push(c.toString()));
  const exited = new Promise<number | null>((resolve) => proc.once('exit', (code) => resolve(code)));
  proc.once('exit', () => rmSync(dataDir, { recursive: true, force: true }));
  return { proc, out: () => chunks.join(''), exited };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log('[self-probe-check] case 1: wedge the accept path after 2.5s of healthy probes — expect exit(1)');
  // 2.5s healthy = 2+ passing probes BEFORE the wedge (proves misses reset /
  // no false positive while healthy); then 3 misses × 1s + margin to exit.
  const wedged = bootDriver({ WEDGE_AFTER_MS: '2500' });
  const code = await Promise.race([wedged.exited, sleep(15_000).then(() => 'timeout' as const)]);
  if (code === 'timeout') {
    check('wedged child exited on its own (probe dead-man fired)', false, 'still running after 15s');
    wedged.proc.kill('SIGKILL');
  } else {
    check('wedged child exited on its own (probe dead-man fired)', true);
    check('exit code 1 — the for-a-supervisor-restart signal', code === 1, `code=${code}`);
  }
  const out1 = wedged.out();
  check('the probe armed', out1.includes('[stands:selfprobe] armed'), out1.split('\n').find((l) => l.includes('selfprobe')) ?? 'no selfprobe lines');
  check('the wedge actually happened before the exit', out1.includes('[selfprobe-driver] wedging now'));
  check('miss progression was logged (1/3 … 3/3)', out1.includes('(1/3)') && out1.includes('(3/3)'));
  check('the WEDGED diagnosis line names the failure for Fly logs', out1.includes('[stands:selfprobe] WEDGED'));

  console.log('[self-probe-check] case 2: healthy child — expect NO exit across the same window');
  const healthy = bootDriver({});
  const result = await Promise.race([healthy.exited, sleep(8_000).then(() => 'alive' as const)]);
  check('healthy child never self-exited (no false positive across 8s ≈ 7+ probes)', result === 'alive', `result=${String(result)}`);
  check('healthy probe armed too', healthy.out().includes('[stands:selfprobe] armed'));
  healthy.proc.kill('SIGKILL');

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[self-probe-check] FATAL', err);
  process.exit(1);
});
