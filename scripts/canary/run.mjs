#!/usr/bin/env node
/**
 * ROOOT release-gate canary — entrypoint. See scripts/canary/README.md for
 * usage, the local-stack commands, and known concerns/limitations.
 *
 *   node run.mjs --web <baseUrl> --ws <wsUrl> --mode full|smoke [--match <id>]
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs, validateArgs, assertFullModeHostSafety, HELP } from './lib/cli.mjs';
import { Report, STATUS } from './lib/report.mjs';
import { runFull } from './lib/fullMode.mjs';
import { runSmoke } from './lib/smokeMode.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(String(err.message || err));
    console.error(HELP);
    process.exit(2);
  }

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  const errors = validateArgs(args);
  if (errors.length) {
    console.error('Invalid arguments:');
    for (const e of errors) console.error(`  - ${e}`);
    console.error(HELP);
    process.exit(2);
  }

  try {
    assertFullModeHostSafety(args);
  } catch (err) {
    console.error(String(err.message || err));
    process.exit(2);
  }

  const report = new Report({ mode: args.mode, web: args.web, ws: args.ws, match: args.match });

  try {
    if (args.mode === 'full') {
      await runFull(report, args);
    } else {
      await runSmoke(report, args);
    }
  } catch (err) {
    // A step-level failure is always caught and recorded inside runFull/runSmoke;
    // reaching here means something broke outside any step (browser launch,
    // etc.) -- record it so the JSON/table still reflects a real outcome
    // rather than a bare stack trace on stderr.
    report.add('run: fatal error', STATUS.FAIL, `${err && err.stack ? err.stack : String(err)}`);
  }

  report.finish();
  report.printTable();

  const outPath = args.out || join(__dirname, 'results', `${args.mode}-${isoStamp()}.json`);
  const written = report.writeFile(outPath);
  console.log(`results written to ${written}`);

  process.exit(report.exitCode());
}

main();
