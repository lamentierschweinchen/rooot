/**
 * CLI parsing + the honesty gate: `--mode full` REFUSES to run against
 * rooot.club or *.fly.dev (task-5-brief.md point 2 / AGENTS.md law #1 & #3 —
 * full mode performs real writes, so it must be structurally incapable of
 * touching production, not just conventionally discouraged from it).
 */

// Tonight's real fixture (apps/web/public/fixture.json, Task 1) — the sane
// default when the operator doesn't pin a specific match. Historical replay
// fixtures (e.g. 18202783) are opt-in via --match, see README.
export const DEFAULT_MATCH = '18218149';

export function parseArgs(argv) {
  const args = { web: null, ws: null, mode: null, match: DEFAULT_MATCH, headed: false, out: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--web': args.web = argv[++i]; break;
      case '--ws': args.ws = argv[++i]; break;
      case '--mode': args.mode = argv[++i]; break;
      case '--match': args.match = argv[++i]; break;
      case '--out': args.out = argv[++i]; break;
      case '--headed': args.headed = true; break;
      case '--help':
      case '-h': args.help = true; break;
      default:
        throw new Error(`unrecognized argument "${a}" (see --help)`);
    }
  }
  return args;
}

export function validateArgs(args) {
  const errors = [];
  if (!args.web) errors.push('--web <baseUrl> is required (e.g. http://localhost:4180 or https://rooot.club)');
  if (!args.ws) errors.push('--ws <wsUrl> is required (e.g. ws://localhost:8788/ or wss://rooot-stands.fly.dev/)');
  if (!args.mode || !['full', 'smoke'].includes(args.mode)) errors.push('--mode full|smoke is required');
  if (args.web) {
    try { new URL(args.web); } catch { errors.push(`--web is not a valid URL: ${args.web}`); }
  }
  if (args.ws) {
    try { new URL(args.ws); } catch { errors.push(`--ws is not a valid URL: ${args.ws}`); }
  }
  return errors;
}

const PROD_HOSTS_EXACT = new Set(['rooot.club', 'fly.dev']);
const PROD_HOST_SUFFIXES = ['.rooot.club', '.fly.dev'];

function hostnameOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

/** True if `url`'s hostname is (or is a subdomain of) rooot.club / fly.dev. */
export function isProdHost(url) {
  const h = hostnameOf(url);
  if (!h) return false;
  if (PROD_HOSTS_EXACT.has(h)) return true;
  return PROD_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

/** Throws with a clear message if `--mode full` is pointed at a production
 * host. Call this before touching the network in any way. */
export function assertFullModeHostSafety(args) {
  if (args.mode !== 'full') return;
  const badWeb = isProdHost(args.web);
  const badWs = isProdHost(args.ws);
  if (badWeb || badWs) {
    const offenders = [badWeb ? `--web ${args.web}` : null, badWs ? `--ws ${args.ws}` : null].filter(Boolean).join(' and ');
    throw new Error(
      `REFUSING: --mode full targets a production host (${offenders}). ` +
      `full mode performs real root/predict/cheer writes and must only ever run against a local stack. ` +
      `Use --mode smoke to check production read-only, or point --web/--ws at localhost.`,
    );
  }
}

export const HELP = `
ROOOT release-gate canary

Usage:
  node run.mjs --web <baseUrl> --ws <wsUrl> --mode full|smoke [--match <id>] [--out <path>] [--headed]

  --web <baseUrl>   e.g. http://localhost:4180 (full mode) or https://rooot.club (smoke mode)
  --ws <wsUrl>      e.g. ws://localhost:8788/  (full mode) or wss://rooot-stands.fly.dev/ (smoke mode)
  --mode full|smoke full = two-browser read/write acceptance flow, LOCAL STACKS ONLY (refuses
                            rooot.club / *.fly.dev). smoke = production-safe read-only checks.
  --match <id>      TxLINE fixture id (default: ${DEFAULT_MATCH}, tonight's fixture.json match).
  --out <path>      JSON results file path (default: scripts/canary/results/<mode>-<ts>.json).
  --headed          run chromium headed (debugging only; default headless).

See scripts/canary/README.md for the exact local-stack commands and replay setup.
`;
