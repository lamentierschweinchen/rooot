/**
 * Child driver for self-probe-check.ts — boots the REAL server module,
 * arms the REAL self-probe (server.ts armSelfProbe), then, when
 * WEDGE_AFTER_MS is set, reproduces the Jul 11 wedge SHAPE on itself:
 * the listener closes (accept path dead — fresh connections refused) while
 * the process itself stays alive and busy (a keepalive interval stands in
 * for the live broadcast timers that kept running through the real wedge).
 * The probe must notice and exit(1). Without WEDGE_AFTER_MS it just runs
 * healthy so the parent can assert the probe does NOT false-positive.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (!process.env.STANDS_DATA_DIR) {
  process.env.STANDS_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rooot-selfprobe-driver-'));
}

async function main(): Promise<void> {
  const { createStandsServer, armSelfProbe } = await import('../server');
  const { httpServer } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const addr = httpServer.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  console.log(`[selfprobe-driver] listening on :${port}`);
  armSelfProbe(port);

  // the process must survive the listener closing — like the real wedge,
  // where timers (4 Hz ticks, snapshots) kept running for 40+ minutes.
  setInterval(() => {}, 1_000);

  const wedgeAfter = Number(process.env.WEDGE_AFTER_MS ?? 0);
  if (wedgeAfter > 0) {
    setTimeout(() => {
      console.log('[selfprobe-driver] wedging now (closing the listener; process stays up)');
      httpServer.close();
    }, wedgeAfter);
  }
}

main().catch((err) => {
  console.error('[selfprobe-driver] FATAL', err);
  process.exit(2);
});
