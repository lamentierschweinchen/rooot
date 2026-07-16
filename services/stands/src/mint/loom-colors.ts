/**
 * The loom's own display inks — a verbatim mirror of woven-loom.html's FX theme table — so the
 * mint's captured keepsake weaves in the SAME colours the fan watched on the live loom.
 *
 * Why this exists: the live loom themes each match from that in-page table (e.g. ENG in red
 * #CF081F), and its adapter respects that choice (`__themedLocally`). But the server's authoritative
 * team palette (sentiment/teams.ts's `fixtureInfo`) can differ — England's primary there is the
 * white kit (#FFFFFF), which weaves a near-invisible band on cream paper and, worse, would make the
 * keepsake NOT match the live loom. Mirroring the loom's table keeps the two identical.
 *
 * KEEP IN SYNC with woven-loom.html's FX table. Any match not listed falls through to the caller's
 * fixtureInfo colour (still honest, just not loom-tuned).
 */
export const LOOM_INK: Record<string, { home: string; away: string }> = {
  '18202701': { home: '#75AADB', away: '#CE1126' }, // ARG · EGY
  '18202783': { home: '#D52B1E', away: '#FCD116' }, // SUI · COL
  '18193785': { home: '#2A3B78', away: '#B4232B' }, // USA · BEL
  '18209181': { home: '#0055A4', away: '#C1272D' }, // FRA · MAR
  '18218149': { home: '#AA151B', away: '#1A1A18' }, // ESP · BEL
  '18213979': { home: '#BA0C2F', away: '#CF081F' }, // NOR · ENG
  '18222446': { home: '#75AADB', away: '#D52B1E' }, // ARG · SUI
  '18237038': { home: '#0055A4', away: '#AA151B' }, // FRA · ESP
  '18241006': { home: '#CF081F', away: '#75AADB' }, // ENG · ARG
};

/** The loom's ink for a side of a match, or `fallback` (the caller's fixtureInfo colour) if the
 * match isn't in the loom's table. */
export function loomInk(matchId: string, side: 'home' | 'away', fallback: string): string {
  return LOOM_INK[matchId]?.[side] ?? fallback;
}
