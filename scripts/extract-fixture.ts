/**
 * ROOOT extract-fixture — trim a recorded fixtures/{odds,scores}-*.jsonl
 * capture down to ONE FixtureId, merged chronologically, for bundling as an
 * apps/web/public/replay/*.jsonl ReplaySource fixture.
 *
 * What it keeps, and why:
 *   - every line (any event type: message/heartbeat/__meta/__disconnect)
 *     from BOTH the odds and scores files that belongs to --fixture, merged
 *     by receivedAtMs into one chronological stream — ReplaySource reads a
 *     single merged file (see archive/src-spa-frozen/apps/web/src/data/ReplaySource.ts).
 *   - heartbeats are dropped entirely (ReplaySource ignores them anyway, and
 *     they're pure filler — cutting them is the first, free size win).
 *   - every score/status-bearing line is ALWAYS kept, uncapped — the task
 *     requirement is "keep every score/status event," full stop.
 *   - odds `message` lines are downsampled ONLY if the file is still over
 *     --max-bytes after dropping heartbeats + non-1X2 markets: keep the
 *     full-match 1X2 series (the tide the stage renders) at full density,
 *     since it's already sparse (real ticks arrive minutes apart in this
 *     capture — see scripts/replay-inspect.ts's summary), and thin the
 *     OTHER markets (over/under, asian handicap) first since they're
 *     outside the honest palette (docs/DATA.md) and normalize.ts filters
 *     them out anyway — they only exist in the bundle as raw color/context,
 *     not because ReplaySource needs them.
 *   - "keep the drama": ANY 1X2 tick whose Pct differs from the immediately
 *     PRECEDING kept 1X2 tick by more than --swing-threshold (default 1.5
 *     percentage points on any leg) is marked protected and survives
 *     downsampling even if the general odds sampling stride would have
 *     dropped it.
 *
 * Usage:
 *   npx tsx scripts/extract-fixture.ts --fixture 18175918 \
 *     --odds fixtures/odds-20260703.jsonl --scores fixtures/scores-20260703.jsonl \
 *     --out apps/web/public/replay/arg-cpv-20260703.jsonl [--max-bytes 2000000]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

interface RawLine {
  receivedAtMs: number;
  event: string;
  data: string;
}

interface Args {
  fixtureId: number;
  oddsPath: string;
  scoresPath: string | null;
  outPath: string;
  maxBytes: number;
  swingThresholdPct: number;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const fixtureId = Number(get('--fixture'));
  const oddsPath = get('--odds');
  const outPath = get('--out');
  if (!fixtureId || !oddsPath || !outPath) {
    console.error('usage: extract-fixture --fixture <id> --odds <path> [--scores <path>] --out <path> [--max-bytes N] [--swing-threshold N]');
    process.exit(1);
  }
  return {
    fixtureId,
    oddsPath,
    scoresPath: get('--scores') ?? null,
    outPath,
    maxBytes: Number(get('--max-bytes') ?? 2_000_000),
    swingThresholdPct: Number(get('--swing-threshold') ?? 1.5),
  };
}

function readLines(path: string): RawLine[] {
  const raw = readFileSync(path, 'utf8');
  const out: RawLine[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as RawLine);
    } catch {
      console.warn(`[extract] skipping unparseable line in ${path}`);
    }
  }
  return out;
}

interface OddsPeek {
  fixtureId: number | null;
  superOddsType: string | null;
  marketPeriod: string | null;
  pct: number[] | null;
}

function peekOdds(data: string): OddsPeek {
  try {
    const d = JSON.parse(data) as {
      FixtureId?: number;
      SuperOddsType?: string;
      MarketPeriod?: string | null;
      Pct?: Array<string | number>;
    };
    const pct = d.Pct
      ? d.Pct.map((v) => (typeof v === 'number' ? v : Number(v))).filter((v) => Number.isFinite(v))
      : null;
    return {
      fixtureId: d.FixtureId ?? null,
      superOddsType: d.SuperOddsType ?? null,
      marketPeriod: d.MarketPeriod ?? null,
      pct: pct && pct.length === 3 ? pct : null,
    };
  } catch {
    return { fixtureId: null, superOddsType: null, marketPeriod: null, pct: null };
  }
}

function peekScoreFixtureId(data: string): number | null {
  try {
    // the LIVE wire speaks UpperCamelCase (FixtureId — docs/DATA.md "THE LIVE
    // WIRE"); the lowercase field belongs to the snapshot schema this script
    // was first written against. Accept both — this exact miss shipped an
    // odds-only bundle on re-cut night (zero story lines).
    const d = JSON.parse(data) as { FixtureId?: number; fixtureId?: number };
    return d.FixtureId ?? d.fixtureId ?? null;
  } catch {
    return null;
  }
}

function byteLength(lines: RawLine[]): number {
  return lines.reduce((sum, l) => sum + JSON.stringify(l).length + 1, 0);
}

function main(): void {
  const args = parseArgs();

  const oddsAll = readLines(args.oddsPath).filter((l) => l.event !== 'heartbeat');
  const scoresAll = args.scoresPath ? readLines(args.scoresPath).filter((l) => l.event !== 'heartbeat') : [];

  // Split odds lines for this fixture into: full-match 1X2 (the tide),
  // other-market (context/color), and everything else (transport markers).
  const fixture1x2: Array<{ line: RawLine; pct: number[] }> = [];
  const fixtureOtherMarket: RawLine[] = [];
  const transportLines: RawLine[] = [];

  for (const line of oddsAll) {
    if (line.event !== 'message') {
      transportLines.push(line);
      continue;
    }
    const peek = peekOdds(line.data);
    if (peek.fixtureId !== args.fixtureId) continue;
    // BOTH belief markets are first-class: the full-match 1X2 (MarketPeriod
    // null) AND the ET-scoped 1X2 (MarketPeriod 'et') — after a level 90'
    // the full line settles and the 'et' line carries the belief (the phase
    // hand-off, contracts/normalize.ts). Thinning either would delete the
    // tide. Everything else is context and may thin.
    if (
      peek.superOddsType === '1X2_PARTICIPANT_RESULT' &&
      (peek.marketPeriod === null || peek.marketPeriod === 'et') &&
      peek.pct
    ) {
      fixture1x2.push({ line, pct: peek.pct });
    } else {
      fixtureOtherMarket.push(line);
    }
  }

  const fixtureScoreLines = scoresAll.filter((l) => {
    if (l.event !== 'message') return true; // keep __meta/__disconnect from the scores stream too
    return peekScoreFixtureId(l.data) === args.fixtureId;
  });

  // Mark protected (drama-preserving) 1X2 ticks: first, last, and any tick
  // whose Pct moved more than swingThresholdPct (in percentage points) on
  // ANY leg vs. the previous KEPT tick.
  const protectedIdx = new Set<number>();
  if (fixture1x2.length > 0) {
    protectedIdx.add(0);
    protectedIdx.add(fixture1x2.length - 1);
    let prevPct = fixture1x2[0]!.pct;
    for (let i = 1; i < fixture1x2.length; i++) {
      const cur = fixture1x2[i]!.pct;
      const maxDelta = Math.max(...cur.map((v, j) => Math.abs(v - (prevPct[j] ?? 0))));
      if (maxDelta >= args.swingThresholdPct) {
        protectedIdx.add(i);
        prevPct = cur;
      }
    }
  }

  const buildMerged = (otherMarketKeep: RawLine[]): RawLine[] => {
    const merged = [
      ...transportLines,
      ...fixture1x2.map((x) => x.line),
      ...otherMarketKeep,
      ...fixtureScoreLines,
    ];
    merged.sort((a, b) => a.receivedAtMs - b.receivedAtMs);
    return merged;
  };

  // Pass 1: everything (no other-market downsampling yet).
  let merged = buildMerged(fixtureOtherMarket);
  let bytes = byteLength(merged);
  console.log(`[extract] fixture ${args.fixtureId}: 1X2=${fixture1x2.length} other-market=${fixtureOtherMarket.length} scores=${fixtureScoreLines.length} transport=${transportLines.length} → ${bytes} bytes (before downsampling)`);

  if (bytes > args.maxBytes && fixtureOtherMarket.length > 0) {
    // Thin other-market lines first (stride-sample), since normalize.ts
    // filters them out anyway — they're bundled only as raw color.
    let stride = 2;
    let thinned = fixtureOtherMarket;
    while (bytes > args.maxBytes && thinned.length > 20) {
      thinned = fixtureOtherMarket.filter((_, i) => i % stride === 0);
      merged = buildMerged(thinned);
      bytes = byteLength(merged);
      console.log(`[extract] thinned other-market to 1/${stride} (${thinned.length} lines) → ${bytes} bytes`);
      stride++;
    }
    if (bytes > args.maxBytes) {
      // Still over budget: drop other-market lines entirely. 1X2 + scores
      // + transport are never touched by this branch.
      merged = buildMerged([]);
      bytes = byteLength(merged);
      console.log(`[extract] dropped all other-market lines → ${bytes} bytes`);
    }
  }

  if (bytes > args.maxBytes) {
    // Last resort: downsample the 1X2 series itself, but NEVER drop a
    // protected (drama) tick.
    const unprotected = fixture1x2.map((x, i) => i).filter((i) => !protectedIdx.has(i));
    let dropEvery = 2;
    let kept1x2 = fixture1x2;
    while (bytes > args.maxBytes && unprotected.length > 0) {
      const toDropSet = new Set(unprotected.filter((_, k) => k % dropEvery !== 0));
      kept1x2 = fixture1x2.filter((_, i) => !toDropSet.has(i));
      const otherKept = bytes > args.maxBytes ? [] : fixtureOtherMarket;
      merged = [...transportLines, ...kept1x2.map((x) => x.line), ...otherKept, ...fixtureScoreLines].sort(
        (a, b) => a.receivedAtMs - b.receivedAtMs,
      );
      bytes = byteLength(merged);
      console.log(`[extract] downsampled 1X2 (kept ${kept1x2.length}/${fixture1x2.length}, all ${protectedIdx.size} protected swing ticks retained) → ${bytes} bytes`);
      dropEvery++;
      if (dropEvery > 20) break; // safety valve
    }
  }

  mkdirSync(dirname(args.outPath), { recursive: true });
  const body = merged.map((l) => JSON.stringify(l)).join('\n') + '\n';
  writeFileSync(args.outPath, body, 'utf8');
  console.log(`[extract] wrote ${args.outPath} — ${merged.length} lines, ${body.length} bytes (${(body.length / 1_000_000).toFixed(2)} MB)`);
}

main();
