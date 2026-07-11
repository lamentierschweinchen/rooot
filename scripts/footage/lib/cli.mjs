/**
 * CLI for the footage rig. There is deliberately NO mode that writes: this rig
 * watches production the way any lurking fan does, and the write-free
 * guarantee is enforced in code (lib/wsTap.mjs, adapted from the canary's
 * smoke-mode tap), not by flag discipline.
 */

export const DEFAULT_WEB = 'https://rooot.club';
export const DEFAULT_WS = 'wss://rooot-stands.fly.dev/';
/** Default session length in minutes: one full match incl. ET + pens with
 * generous margin, so an unattended run always ends by itself. */
export const DEFAULT_UNTIL_MIN = 240;

export function parseArgs(argv) {
  const args = {
    match: null,
    out: null,
    web: DEFAULT_WEB,
    ws: DEFAULT_WS,
    until: String(DEFAULT_UNTIL_MIN),
    headed: false,
    skipBeauty: false,
    chaosKillSec: 0,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--match': args.match = argv[++i]; break;
      case '--out': args.out = argv[++i]; break;
      case '--web': args.web = argv[++i]; break;
      case '--ws': args.ws = argv[++i]; break;
      case '--until': args.until = argv[++i]; break;
      case '--headed': args.headed = true; break;
      case '--skip-beauty': args.skipBeauty = true; break;
      case '--chaos-kill': args.chaosKillSec = Number(argv[++i]); break;
      case '--help':
      case '-h': args.help = true; break;
      default:
        throw new Error(`unrecognized argument "${a}" (see --help)`);
    }
  }
  return args;
}

/** `--until` accepts plain minutes ("240") or an ISO timestamp
 * ("2026-07-12T01:30:00Z"). Returns the absolute deadline in ms. */
export function resolveUntilMs(until, nowMs = Date.now()) {
  if (/^\d+$/.test(until)) return nowMs + Number(until) * 60_000;
  const t = Date.parse(until);
  if (Number.isNaN(t)) throw new Error(`--until must be minutes (e.g. 240) or an ISO timestamp, got "${until}"`);
  if (t <= nowMs) throw new Error(`--until ${until} is already in the past`);
  return t;
}

export function validateArgs(args) {
  const errors = [];
  if (!args.match || !/^\d+$/.test(args.match)) errors.push('--match <fixtureId> is required (digits, e.g. 18213979)');
  for (const [flag, url] of [['--web', args.web], ['--ws', args.ws]]) {
    try { new URL(url); } catch { errors.push(`${flag} is not a valid URL: ${url}`); }
  }
  if (!Number.isFinite(args.chaosKillSec) || args.chaosKillSec < 0) errors.push('--chaos-kill must be a non-negative number of seconds');
  try { resolveUntilMs(args.until); } catch (err) { errors.push(String(err.message ?? err)); }
  return errors;
}

export const HELP = `
ROOOT footage rig -- read-only live capture for the demo video

Usage:
  node run.mjs --match <fixtureId> [--out <dir>] [--until <min|ISO>] [--web <url>] [--ws <url>]
               [--skip-beauty] [--headed] [--chaos-kill <sec>]

  --match <id>      TxLINE fixture id to film (required), e.g. 18213979 (NOR-ENG).
  --out <dir>       output dir (default: scripts/footage/out/<matchId>).
  --until <m|ISO>   stop after N minutes or at an ISO time (default: ${DEFAULT_UNTIL_MIN} min).
  --web <url>       app base (default: ${DEFAULT_WEB}).
  --ws <url>        stands WS base (default: ${DEFAULT_WS}).
  --skip-beauty     skip the three 30s beauty passes (home/gate/stadium).
  --headed          run Chromium headed (debugging only).
  --chaos-kill <s>  VERIFICATION ONLY: force-close the loom page after <s> seconds to
                    prove crash recovery. Refused when --until is more than 15 minutes out.

Output (all under the out dir):
  segments/         .webm video segments (see README for the naming scheme)
  events.jsonl      the tagged timeline ({tMs, iso, type, detail} per line)

The rig NEVER writes to production: no gate entries, no side-carrying hellos, no
clicks. Every recorded page runs under a WebSocket tap (adapted from
scripts/canary/lib/wsTap.mjs) that hard-blocks any outgoing frame except the
bare hello a lurking visitor sends; the rig's own watcher socket never sends at all.
`;
