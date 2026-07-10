/**
 * CLI parsing + the honesty gate: `--mode full` REFUSES to run against
 * anything other than a structurally-local target (task-5-brief.md point 2 /
 * AGENTS.md law #1 & #3 — full mode performs real writes, so it must be
 * structurally incapable of touching production, not just conventionally
 * discouraged from it). See `isLocalHost` below for the exact rule.
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

/**
 * Full-mode host safety: an ALLOWLIST of structurally-local targets, not a
 * blocklist of known production hosts (task-5 review finding 2). A suffix
 * blocklist keyed on "rooot.club" / "fly.dev" is bypassable -- a
 * trailing-dot FQDN (`rooot.club.`) or an IP literal that happens to resolve
 * to production both fail to match the blocked suffixes outright, and
 * lib/wsTap.mjs's runtime guard pins the only host any page may reach from
 * this SAME --ws string, so a bypass here defeats both layers at once (see
 * README "Host safety"). Inversion closes the whole class without needing
 * to recognize anything: --mode full accepts ONLY a hostname that is
 * structurally local (localhost, 127.0.0.0/8, ::1, *.local, *.localhost, or
 * an RFC1918 private range); a public IP or hostname that happens to BE
 * production is refused because it isn't local, not because it was
 * recognized as production.
 */

function hostnameOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

/** Strip a trailing dot (or dots) off an FQDN and un-bracket an IPv6
 * literal -- both are valid URL-hostname forms the WHATWG URL parser passes
 * through untouched (verified directly against Node's `URL`:
 * `new URL('wss://rooot.club./').hostname === 'rooot.club.'`,
 * `new URL('ws://[::1]/').hostname === '[::1]'`), so both would otherwise
 * silently fail a plain equality/suffix match against the canonical form. */
function normalizeHostForLocalCheck(rawHostname) {
  let h = rawHostname;
  if (h.length > 1 && h[0] === '[' && h[h.length - 1] === ']') h = h.slice(1, -1);
  h = h.replace(/\.+$/, '');
  return h;
}

/** Parse a canonical dotted-decimal IPv4 hostname into its four octets, or
 * null if it isn't one. Deliberately simple: the WHATWG URL parser already
 * normalizes hex/octal/bare-integer IPv4 literal forms into this exact
 * shape by the time `hostnameOf()` returns it -- verified directly against
 * Node's `URL` (`0x42.0x42.0x42.0x42` -> `66.66.66.66`,
 * `0102.0102.0102.0102` -> `66.66.66.66`, `1113982019` -> `66.102.4.67`) --
 * so there is no separate hex/octal parsing path to get wrong here. */
function ipv4Octets(hostname) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

/** True iff `url`'s hostname is structurally local: localhost, 127.0.0.0/8,
 * ::1, *.local, *.localhost, or a private range (10.0.0.0/8,
 * 172.16.0.0/12, 192.168.0.0/16). This -- not hostname recognition -- is
 * the entire `--mode full` enforcement boundary. */
export function isLocalHost(url) {
  const raw = hostnameOf(url);
  if (!raw) return false;
  const h = normalizeHostForLocalCheck(raw);
  if (!h) return false;
  if (h === 'localhost' || h === '::1') return true;
  if (h.endsWith('.localhost') || h.endsWith('.local')) return true;
  const oct = ipv4Octets(h);
  if (!oct) return false;
  const [a, b] = oct;
  if (a === 127) return true;                       // 127.0.0.0/8
  if (a === 10) return true;                         // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16
  return false;
}

const KNOWN_PROD_HOSTS_EXACT = new Set(['rooot.club', 'fly.dev']);
const KNOWN_PROD_HOST_SUFFIXES = ['.rooot.club', '.fly.dev'];

/** Friendlier-message-only helper -- NOT the enforcement (see isLocalHost
 * above, which is). Used only to name the specific known production host in
 * the refusal message when it's recognizable; a hostname that doesn't match
 * this is refused all the same by isLocalHost, recognized or not. */
function isKnownProdHost(url) {
  const h = normalizeHostForLocalCheck(hostnameOf(url));
  if (!h) return false;
  if (KNOWN_PROD_HOSTS_EXACT.has(h)) return true;
  return KNOWN_PROD_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

/** Throws with a clear message if `--mode full` is pointed at anything other
 * than a structurally-local host. Call this before touching the network in
 * any way. */
export function assertFullModeHostSafety(args) {
  if (args.mode !== 'full') return;
  const offenders = [
    { flag: '--web', url: args.web },
    { flag: '--ws', url: args.ws },
  ].filter(({ url }) => url && !isLocalHost(url));
  if (offenders.length) {
    const detail = offenders.map(({ flag, url }) => {
      const h = hostnameOf(url);
      const prodNote = isKnownProdHost(url) ? ` -- this is ROOOT production (${h})` : '';
      return `${flag} ${url} (hostname "${h}")${prodNote}`;
    }).join(' and ');
    throw new Error(
      `REFUSING: --mode full requires every target to be structurally local: ${detail}. ` +
      `Allowed: localhost, 127.0.0.0/8, ::1, *.local, *.localhost, or a private range ` +
      `(10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) -- nothing else, recognized or not. ` +
      `full mode performs real root/predict/cheer writes and must be structurally incapable ` +
      `of reaching a non-local host. Use --mode smoke to check production read-only, or point ` +
      `${offenders.map((o) => o.flag).join('/')} at a local address.`,
    );
  }
}

export const HELP = `
ROOOT release-gate canary

Usage:
  node run.mjs --web <baseUrl> --ws <wsUrl> --mode full|smoke [--match <id>] [--out <path>] [--headed]

  --web <baseUrl>   e.g. http://localhost:4180 (full mode) or https://rooot.club (smoke mode)
  --ws <wsUrl>      e.g. ws://localhost:8788/  (full mode) or wss://rooot-stands.fly.dev/ (smoke mode)
  --mode full|smoke full = two-browser read/write acceptance flow, LOCAL STACKS ONLY (accepts
                            ONLY localhost/127.0.0.0/8/::1/*.local/*.localhost/private ranges).
                            smoke = production-safe read-only checks.
  --match <id>      TxLINE fixture id (default: ${DEFAULT_MATCH}, tonight's fixture.json match).
  --out <path>      JSON results file path (default: scripts/canary/results/<mode>-<ts>.json).
  --headed          run chromium headed (debugging only; default headless).

See scripts/canary/README.md for the exact local-stack commands and replay setup.
`;
