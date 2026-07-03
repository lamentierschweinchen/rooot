/**
 * ROOOT data lane — minimal fixture metadata (id → home/away TeamRef).
 *
 * STOPGAP: docs/DATA.md assigns the full hand-curated team colors/flags JSON
 * to apps/web/src/lib/teams.ts, owned by the stage/crowd lanes ("additive
 * only" for everyone else per AGENTS.md's lane table) — that file doesn't
 * exist yet as of this lane's work. ReplaySource/LiveSource/MockSource all
 * need SOME TeamRef to satisfy contracts/match.ts's Fixture shape, so this
 * file holds just enough (the fixtures actually present in fixtures/*.jsonl
 * + docs/DATA.md's FixtureId table) to unblock today. Once lib/teams.ts
 * lands, this should be replaced by a lookup into that file — do not grow
 * this into a second source of truth for team colors.
 */
import type { Fixture, TeamRef } from '@contracts/match';

function team(code: string, name: string, colors: [string, string], flag: string): TeamRef {
  return { code, name, colors, flag };
}

// Colors are a plain best-effort placeholder (primary kit shade + a neutral
// second) — NOT the hand-curated pairs docs/DATA.md calls for. Swap the
// instant apps/web/src/lib/teams.ts exists.
const ARG = team('ARG', 'Argentina', ['#75AADB', '#FFFFFF'], '🇦🇷');
const CPV = team('CPV', 'Cape Verde', ['#003893', '#CF2027'], '🇨🇻');
const COL = team('COL', 'Colombia', ['#FCD116', '#003893'], '🇨🇴');
const GHA = team('GHA', 'Ghana', ['#CE1126', '#FCD116'], '🇬🇭');
const CAN = team('CAN', 'Canada', ['#FF0000', '#FFFFFF'], '🇨🇦');
const MAR = team('MAR', 'Morocco', ['#C1272D', '#006233'], '🇲🇦');
const PAR = team('PAR', 'Paraguay', ['#0038A8', '#CE1126'], '🇵🇾');
const FRA = team('FRA', 'France', ['#002395', '#ED2939'], '🇫🇷');
const BRA = team('BRA', 'Brazil', ['#FFDF00', '#009739'], '🇧🇷');
const NOR = team('NOR', 'Norway', ['#BA0C2F', '#00205B'], '🇳🇴');
const MEX = team('MEX', 'Mexico', ['#006847', '#CE1126'], '🇲🇽');
const ENG = team('ENG', 'England', ['#FFFFFF', '#CE1124'], '🏴󠁧󠁢󠁥󠁮󠁧󠁿');
const POR = team('POR', 'Portugal', ['#046A38', '#DA020E'], '🇵🇹');
const ESP = team('ESP', 'Spain', ['#AA151B', '#F1BF00'], '🇪🇸');
const USA = team('USA', 'USA', ['#B22234', '#3C3B6E'], '🇺🇸');
const BEL = team('BEL', 'Belgium', ['#000000', '#FDDA24'], '🇧🇪');

/** FixtureIds confirmed live per docs/DATA.md — kickoff times UTC. */
export const FIXTURES: Record<string, Fixture> = {
  '18175918': { id: '18175918', home: ARG, away: CPV, kickoffISO: '2026-07-03T22:00:00Z' },
  '18179549': { id: '18179549', home: COL, away: GHA, kickoffISO: '2026-07-04T01:30:00Z' },
  '18185036': { id: '18185036', home: CAN, away: MAR, kickoffISO: '2026-07-04T17:00:00Z' },
  '18188721': { id: '18188721', home: PAR, away: FRA, kickoffISO: '2026-07-04T21:00:00Z' },
  '18187298': { id: '18187298', home: BRA, away: NOR, kickoffISO: '2026-07-05T20:00:00Z' },
  '18192996': { id: '18192996', home: MEX, away: ENG, kickoffISO: '2026-07-06T00:00:00Z' },
  '18198205': { id: '18198205', home: POR, away: ESP, kickoffISO: '2026-07-06T19:00:00Z' },
  '18193785': { id: '18193785', home: USA, away: BEL, kickoffISO: '2026-07-07T00:00:00Z' },
};

export function lookupFixture(fixtureId: string): Fixture | null {
  return FIXTURES[fixtureId] ?? null;
}
