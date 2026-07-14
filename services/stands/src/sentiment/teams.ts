/** Fixture → team identity for the sentiment record (the WC fixtures we serve). */
import type { SentimentRecord } from '@contracts/sentiment';

type Fx = SentimentRecord['fixture'];
const C = (code: string, name: string, a: string, b: string) => ({ code, name, colors: [a, b] as const });

export const FIXTURE_INFO: Record<string, Fx> = {
  '18175918': { home: C('ARG', 'Argentina', '#75AADB', '#F6B40E'), away: C('CPV', 'Cape Verde', '#003893', '#CF2027'), competition: 'World Cup', dateISO: '2026-07-03' },
  '18176123': { home: C('AUS', 'Australia', '#FFCD00', '#1F6F40'), away: C('EGY', 'Egypt', '#CE1126', '#1A1A18'), competition: 'World Cup', dateISO: '2026-07-03' },
  '18179549': { home: C('COL', 'Colombia', '#FCD116', '#003893'), away: C('GHA', 'Ghana', '#006B3F', '#CE1126'), competition: 'World Cup', dateISO: '2026-07-04' },
  '18185036': { home: C('CAN', 'Canada', '#FF0000', '#FFFFFF'), away: C('MAR', 'Morocco', '#C1272D', '#006233'), competition: 'World Cup', dateISO: '2026-07-04' },
  '18188721': { home: C('PAR', 'Paraguay', '#D52B1E', '#0038A8'), away: C('FRA', 'France', '#002395', '#ED2939'), competition: 'World Cup', dateISO: '2026-07-04' },
  '18187298': { home: C('BRA', 'Brazil', '#009B3A', '#FFDF00'), away: C('NOR', 'Norway', '#BA0C2F', '#00205B'), competition: 'World Cup', dateISO: '2026-07-05' },
  '18192996': { home: C('MEX', 'Mexico', '#006847', '#CE1126'), away: C('ENG', 'England', '#FFFFFF', '#CF081F'), competition: 'World Cup', dateISO: '2026-07-06' },
  '18198205': { home: C('POR', 'Portugal', '#006600', '#FF0000'), away: C('ESP', 'Spain', '#AA151B', '#F1BF00'), competition: 'World Cup', dateISO: '2026-07-06' },
  '18193785': { home: C('USA', 'United States', '#3C3B6E', '#B22234'), away: C('BEL', 'Belgium', '#000000', '#FDDA24'), competition: 'World Cup', dateISO: '2026-07-07' },
  '18202701': { home: C('ARG', 'Argentina', '#75AADB', '#F6B40E'), away: C('EGY', 'Egypt', '#CE1126', '#1A1A18'), competition: 'World Cup', dateISO: '2026-07-07' },
  '18202783': { home: C('SUI', 'Switzerland', '#D52B1E', '#FFFFFF'), away: C('COL', 'Colombia', '#FCD116', '#003893'), competition: 'World Cup', dateISO: '2026-07-07' },
  '18209181': { home: C('FRA', 'France', '#002395', '#ED2939'), away: C('MAR', 'Morocco', '#C1272D', '#006233'), competition: 'World Cup', dateISO: '2026-07-09' },
  '18218149': { home: C('ESP', 'Spain', '#AA151B', '#F1BF00'), away: C('BEL', 'Belgium', '#000000', '#FDDA24'), competition: 'World Cup', dateISO: '2026-07-10' },
  '18213979': { home: C('NOR', 'Norway', '#BA0C2F', '#00205B'), away: C('ENG', 'England', '#FFFFFF', '#CF081F'), competition: 'World Cup', dateISO: '2026-07-11' },
  '18222446': { home: C('ARG', 'Argentina', '#75AADB', '#F6B40E'), away: C('SUI', 'Switzerland', '#D52B1E', '#FFFFFF'), competition: 'World Cup', dateISO: '2026-07-12' },
  '18237038': { home: C('FRA', 'France', '#002395', '#ED2939'), away: C('ESP', 'Spain', '#AA151B', '#F1BF00'), competition: 'World Cup', dateISO: '2026-07-14' },
  '18241006': { home: C('ENG', 'England', '#FFFFFF', '#CF081F'), away: C('ARG', 'Argentina', '#75AADB', '#F6B40E'), competition: 'World Cup', dateISO: '2026-07-15' },
};

export function fixtureInfo(matchId: string): Fx | null {
  return FIXTURE_INFO[matchId] ?? null;
}
