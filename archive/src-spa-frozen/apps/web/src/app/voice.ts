/**
 * ROOOT app — THE VOICE (the copy system, one home).
 *
 * The law (owner, Jul 4): show, don't tell. A HUD informs; the data is the
 * drama; words are labels and facts, never performance. Everything the shell
 * prints comes through here so the register stays one voice:
 *
 *   · labels are CAPS, short, bureaucratic-beautiful (the España strip:
 *     SECTOR / BLOCK / SEAT) — never sentences, never exclamation marks.
 *   · numbers speak alone wherever they can; a label only names the unit.
 *   · time is a fact: a future kick-off is promised in the fan's clock;
 *     a played fixture is dated in UTC (the memento register). Never both,
 *     never a bogus epoch.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** parse an ISO kickoff; null when missing/invalid/epoch-garbage. */
function kickoffDate(iso: string): Date | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() < 2001) return null; // epoch placeholder — never print it
  return d;
}

/**
 * The fixture's date line, always printable:
 *   future kick-off  → "KICK-OFF 21:00"      (the fan's own clock — a promise)
 *   played / running → "JUL 3 · 22:00 UTC"   (a record — fixture-fact UTC)
 *   unknown          → ""                     (print nothing over a lie)
 */
export function fixtureDateLine(iso: string, now: Date = new Date()): string {
  const d = kickoffDate(iso);
  if (!d) return '';
  if (d.getTime() > now.getTime()) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `KICK-OFF ${hh}:${mm}`;
  }
  const mon = MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mon} ${day} · ${hh}:${mm} UTC`;
}

/** the ledger's empty-state fact (the story hasn't started): kick-off or nothing. */
export function ledgerEmptyLine(iso: string, now: Date = new Date()): string {
  return fixtureDateLine(iso, now);
}

/** the colophon's provenance facts — stated, never sold. */
export const PROVENANCE = {
  market: 'MARKET · TXLINE ON SOLANA',
  crowd: 'CROWD · REAL TAPS, COUNTED',
} as const;
