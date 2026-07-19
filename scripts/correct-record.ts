/**
 * ROOOT — the correction record (ESP-ARG, the final, 19 Jul 2026).
 *
 * WHY THIS EXISTS. The service sealed the final at the 90-minute whistle
 * (StatusId 5) while the match was still alive, and anchored a record saying
 * "ESP 0-0 ARG, decided in 90". Spain then won it 1-0 in extra time through
 * Ferran Torres at 105', against ten men. The premature record is wrong about
 * the score, the phase path, the events and the story.
 *
 * The chain is append-only and we do not pretend otherwise: the premature
 * anchor STAYS. This script builds a corrected record that declares, inside
 * the hashed body, exactly which record it supersedes and why — then anchors
 * that. Two entries exist on devnet; the second says what the first got wrong.
 *
 * WHAT IS RECOMPUTED (from the real capture, via the SAME builder functions
 * the live seal uses — never a parallel implementation):
 *   finalScore · phasePath · decidedIn · events · divergence · headline · hash
 *
 * WHAT IS CARRIED OVER UNCHANGED from the premature record: the crowd. The
 * fans' predictions, cheers, presence and points were really made and really
 * counted — the premature seal did not invent them, it only graded them
 * against the wrong final. So `fans`, `feel`, `points`, `nextGoal` and
 * `market` are preserved verbatim; only what depends on the FINAL SCORE is
 * regraded. Nothing here is synthesized.
 *
 *   npx tsx scripts/correct-record.ts                # dry run: build + print, no chain write
 *   npx tsx scripts/correct-record.ts --anchor       # build, write the file, anchor on devnet
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseLedgerMessage,
  parseScoreMessage,
  parseStatusMessage,
  parseLineups,
} from '../contracts/normalize';
import { computeDivergence, deriveHeadline, hashRecord, decidedIn } from '../services/stands/src/sentiment/builder';
import type { MatchPhase } from '../contracts/match';
import type { LedgerEvent } from '../contracts/ledger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FIXTURE_ID = 18257739;
const CAPTURE_DIR = path.join(ROOT, 'fixtures/live-esp-arg');
const SCORES = path.join(CAPTURE_DIR, 'scores-esparg.jsonl');
/** the premature record, pulled off the live service via seal-on-join */
const PREMATURE = path.join(ROOT, 'services/stands/captures/esparg-sentiment-18257739-premature.json');
const OUT = path.join(ROOT, 'services/stands/captures/esparg-sentiment-18257739-corrected.json');

/** the events the SentimentRecord keeps (same allowlist as sentiment/crystallize.ts) */
const KEPT_KINDS = ['goal', 'yellow-card', 'red-card', 'var', 'shot', 'corner', 'penalty-kick'];

interface RawLine { receivedAtMs: number; event: string; data: unknown }

function readLines(file: string): RawLine[] {
  if (!fs.existsSync(file)) {
    console.error(`[correct] FATAL: capture missing at ${file}`);
    process.exit(1);
  }
  const out: RawLine[] = [];
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = l.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t) as RawLine); } catch { /* transport noise */ }
  }
  return out;
}

function main(): void {
  const anchorMode = process.argv.includes('--anchor');

  if (!fs.existsSync(PREMATURE)) {
    console.error(`[correct] FATAL: premature record not found at ${PREMATURE}`);
    process.exit(1);
  }
  const prem = JSON.parse(fs.readFileSync(PREMATURE, 'utf8')) as Record<string, unknown>;

  // ── rebuild the truth from the wire ──────────────────────────────────────
  const lines = readLines(SCORES);
  let roster: ReturnType<typeof parseLineups> | undefined;
  for (const o of lines) {
    const raw = typeof o.data === 'string' ? o.data : JSON.stringify(o.data);
    const r = parseLineups(raw);
    if (r && r.fixtureId === FIXTURE_ID) { roster = r; break; }
  }

  const phasePath: MatchPhase[] = [];
  /** by ledger event id — the wire re-emits the same event as it firms up
   * (the winner arrived three times: floated, confirmed, then named), so the
   * LAST emission of each id is the one that tells the truth. */
  const byId = new Map<string, LedgerEvent>();
  /** raw ids the wire later discarded — both of Spain's chalked-off goals.
   * A disallowed goal is not a goal; it must not sit in the record's events. */
  const discarded = new Set<number>();
  let fh = 0, fa = 0;
  for (const o of lines) {
    if (o.event === 'heartbeat') continue;
    const raw = typeof o.data === 'string' ? o.data : JSON.stringify(o.data);
    let d: { FixtureId?: number; Action?: string; Id?: number };
    try { d = JSON.parse(raw) as typeof d; } catch { continue; }
    if (d.FixtureId !== FIXTURE_ID) continue;

    if (d.Action === 'action_discarded' && typeof d.Id === 'number') discarded.add(d.Id);

    const st = parseStatusMessage(raw, o.receivedAtMs, 'live');
    if (st && phasePath[phasePath.length - 1] !== st.phase) phasePath.push(st.phase);

    // ONLY settled scores move the final — a held (unconfirmed) goal never does.
    const sc = parseScoreMessage(raw, o.receivedAtMs, 'live');
    if (sc && sc.confirmed) { fh = sc.home; fa = sc.away; }

    const lm = parseLedgerMessage(raw, o.receivedAtMs, 'live', roster ?? undefined);
    if (lm?.type === 'event' && KEPT_KINDS.includes(lm.ev.kind)) byId.set(lm.ev.id, lm.ev);
  }
  const events: LedgerEvent[] = [...byId.values()]
    .filter((e) => {
      const rawId = Number(String(e.id).split(':')[1]);
      return !(Number.isFinite(rawId) && discarded.has(rawId));
    })
    .sort((a, b) => a.tMs - b.tMs);

  const finalScore = { home: fh, away: fa };
  const decided = decidedIn(phasePath);

  // ── regrade only what depends on the final score ─────────────────────────
  const market = prem.market as Parameters<typeof computeDivergence>[0];
  const fans = prem.fans as Parameters<typeof computeDivergence>[1];
  const divergence = computeDivergence(market, fans, fh, fa);

  const premProv = (prem.provenance ?? {}) as Record<string, unknown>;
  const body = {
    ...prem,
    finalScore,
    phasePath,
    decidedIn: decided,
    events,
    divergence,
    provenance: {
      ...premProv,
      // the correction, stated inside the hashed body so the chain carries it
      supersedes: {
        recordHash: premProv.recordHash,
        anchorTxSig: premProv.anchorTxSig,
        reason:
          "sealed at the 90' whistle (StatusId 5) while the match was still alive; " +
          'the wire then signalled extra time (StatusId 6 at 21:16:20Z, ET kickoff 21:19:07Z) ' +
          'and Spain won 1-0 at 105\'. The superseded record claims ESP 0-0 ARG decided in 90.',
      },
      correctedAtISO: new Date().toISOString(),
    },
  } as Record<string, unknown>;
  delete (body.provenance as Record<string, unknown>).recordHash;
  delete (body.provenance as Record<string, unknown>).anchorTxSig;

  body.headline = deriveHeadline(body as Parameters<typeof deriveHeadline>[0]);
  const recordHash = hashRecord(body as Parameters<typeof hashRecord>[0]);
  (body.provenance as Record<string, unknown>).recordHash = recordHash;

  // ── report ───────────────────────────────────────────────────────────────
  const scorers = events.filter((e) => e.kind === 'goal').map((e) => `${e.minute}' ${e.headline}`);
  console.log('  premature : ESP %d-%d ARG · decidedIn=%s · hash %s',
    (prem.finalScore as { home: number }).home, (prem.finalScore as { away: number }).away,
    prem.decidedIn, String(premProv.recordHash).slice(0, 12));
  console.log('  corrected : ESP %d-%d ARG · decidedIn=%s · hash %s', fh, fa, decided, recordHash.slice(0, 12));
  console.log('  phasePath : %s', phasePath.join(' -> '));
  console.log('  events    : %d kept (%s)', events.length, scorers.join(', ') || 'no goals');
  console.log('  headline  : %s', body.headline);
  console.log('  foresight : crowd=%s (was %s)',
    (divergence as { foresight: { crowd: unknown } }).foresight.crowd,
    ((prem.divergence as { foresight: { crowd: unknown } }).foresight).crowd);

  if (!anchorMode) {
    console.log('\n  DRY RUN — nothing written, nothing anchored. Re-run with --anchor to commit.');
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(body, null, 1) + '\n');
  console.log(`\n  wrote ${path.relative(ROOT, OUT)}`);

  // devnet only. The keypair is read from a FILE by the relayer — the path may
  // ride an env var, the key itself never touches argv or logs.
  process.env.RELAYER_KEYPAIR_FILE ??= path.join(ROOT, '.secrets/rooot-devnet.json');
  void (async () => {
    const { anchorRecordHash } = await import('../services/stands/src/relay');
    const sig = await anchorRecordHash(String(FIXTURE_ID), recordHash, 'sentiment');
    if (!sig) {
      console.error('  ANCHOR FAILED — the record file is written but NOT on chain. Re-run --anchor; nothing was faked.');
      process.exit(1);
    }
    (body.provenance as Record<string, unknown>).anchorTxSig = sig;
    fs.writeFileSync(OUT, JSON.stringify(body, null, 1) + '\n');
    console.log(`  anchored ${sig}`);
    console.log(`  evidence:  node scripts/capture-anchor.mjs ${sig} ${FIXTURE_ID}`);
  })();
}

main();
