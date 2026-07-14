/**
 * ROOOT relics — the collectible generators (barrel). Owned by the relics lane.
 *
 * Four print-grade generators, each a PURE function (data → offscreen canvas):
 *   · renderCard(CardData)          — 5:7 trading card (1500×2100)
 *   · renderStub(StubData)          — 2:1 call ticket  (1600×800)
 *   · renderPoster(MatchRelicData)  — 2:3 match poster (1400×2100)
 *   · renderScarfStrip(MatchRelicData) — knit scarf SEGMENT spike (600×2100) [stretch]
 *
 * Fonts must be loaded via ensureRelicFonts() before any render (Doto/Anybody/
 * Young Serif/Silkscreen from theme FONT_URLS). Data is built by ./buildRelicData
 * from the real AUS–EGY capture (market REAL; fan/crowd SYNTHETIC dev specimen).
 */

export { renderCard, CARD_SIZE } from './renderCard';
export { renderStub, STUB_SIZE } from './renderStub';
export { renderPoster, POSTER_SIZE } from './renderPoster';
export { renderScarfStrip, SCARF_SIZE } from './renderScarfStrip';
export { ensureRelicFonts } from './paint';
export {
  buildMatchRelicData,
  buildCardData,
  buildStubData,
  parseFeed,
  downsampleOdds,
  extractGoals,
  deriveRatings,
  AUS,
  EGY,
  AUS_EGY_FIXTURE_ID,
} from './buildRelicData';
