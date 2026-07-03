/**
 * ROOOT — DESIGN TOKENS (NEW file, additive; owned by the design-system lane).
 *
 * The visual canon as typed, dependency-free code. No DOM, no state, no imports.
 * Importable by every build lane (stage / crowd / relics / mint) so a chip, a
 * meter, a scoreboard, or a card renders from ONE source of truth. This file is
 * the machine-readable twin of `design/SYSTEM.md`; where the two ever disagree,
 * SYSTEM.md is the law and this file is the bug.
 *
 * Foundations: `design/POP-LANGUAGE.md` (palette sampled by eye) + the brand-book
 * color/glyph/motion/frame tables + the 14 canon renders in
 * `design/references/_chosen/`.
 *
 * Naming: `as const` throughout so downstream code gets literal types (exact hex
 * strings, exact durations) rather than widened `string`/`number`. Nothing here
 * imports anything; nothing here has side effects.
 */

/* =========================================================================
 * 1 · PALETTE
 * The world is FLAT SPOT INK. Every hex is a printed ink, never a gradient stop.
 * ===================================================================== */

/**
 * NEUTRALS — the calm frame, always present. These are the constants that let
 * any two team palettes coexist on one surface (POP-LANGUAGE §A.2).
 */
export const NEUTRALS = {
  /** default paper ground · card border · album page */
  newsprint: '#F3ECDA',
  /** warmer paper — stubs, pennants, card interiors */
  sunbleach: '#EDE3C8',
  /** every keyline, every rule, the ink; scoreboards, heavy display type */
  pressBlack: '#1A1A18',
  /** the neutral DRAW / void ground; subdued/inactive data, the Zidane grey */
  terraceGrey: '#B0AEA8',
  /** the RARE mark ONLY — reward language, proof line, special ticks. A printed spot, never a glow */
  medalGold: '#E0A93B',
} as const;

/**
 * LOUD GROUNDS — the rotation. THE TOPPS RULE: exactly ONE owns a surface at a
 * time; two loud grounds never touch (a Press-Black seam or a cream border must
 * separate them). A team color is NEVER the ground.
 */
export const LOUD = {
  /** the hottest ground — eruption / card energy / GOOOL */
  fizzPink: '#E8256C',
  /** the pre-match page frame · warm proof objects (the default "stage" frame) */
  aztecaSun: '#F2C230',
  /** England territory + selected accents only */
  poppy: '#E0574E',
  /** optional loud ground for lighter match states */
  kickoffSky: '#3FA0D6',
  /** Mexico territory + fan-end flag blocks */
  grass: '#1E7A44',
  /** Frame-2 "the Dark" pressure ground */
  ultra: '#1E4FC0',
  /** ticket-stub blocks + bureaucratic proof language */
  magenta: '#C43A72',
} as const;

/**
 * The loud-ground ROTATION order (POP-LANGUAGE §A.2). Pick a ground for a surface
 * that NEITHER team owns; if both teams are loud, fall back to `terraceGrey`.
 * Order is the canonical cycle used when a surface index must map to a ground.
 */
export const LOUD_ROTATION = [
  LOUD.fizzPink,
  LOUD.aztecaSun,
  LOUD.poppy,
  LOUD.kickoffSky,
  LOUD.grass,
  LOUD.ultra,
  LOUD.magenta,
] as const;

/** Every named color in one flat object, for token lookups / CSS-var emission. */
export const COLORS = { ...NEUTRALS, ...LOUD } as const;

export type NeutralName = keyof typeof NEUTRALS;
export type LoudName = keyof typeof LOUD;
export type ColorName = keyof typeof COLORS;

/**
 * SURFACE → GROUND starting map (brand-book Frame Suite p.9 + POP-LANGUAGE).
 * The coordinator may re-point any of these per fixture, but these are the
 * defaults the frame mandates lock in.
 */
export const SURFACE_GROUND = {
  /** pre-match stage — Azteca Sun frame */
  stagePrematch: LOUD.aztecaSun,
  /** "the Dark" late-tension frame — Ultra ground */
  stageDark: LOUD.ultra,
  /** goal eruption frame — Fizz Pink ground */
  stageGoool: LOUD.fizzPink,
  /** trading card — rotates per fixture; Fizz Pink is the canon default */
  card: LOUD.fizzPink,
  /** call stub — Sunbleach paper body with a loud header block */
  stub: NEUTRALS.sunbleach,
} as const;

/* =========================================================================
 * 2 · TEAM-COLOR SLOT RULES
 * Team colors enter ONLY through these four slots — never the ground, never UI
 * chrome (POP-LANGUAGE §A.2, brand-book p.4 "team jurisdiction").
 * ===================================================================== */

/** The only places a team color is legal. Anything else is a violation. */
export const TEAM_COLOR_SLOTS = [
  /** the two halftone TERRITORY fields advancing from each goal-end */
  'territory',
  /** the flag-block / patchwork PANELS at the belief ends */
  'flagBlock',
  /** the keyline-boxed team CHIP in the scoreboard band */
  'scoreChip',
  /** the scarf / pin / relic ends */
  'relicEnd',
] as const;
export type TeamColorSlot = (typeof TEAM_COLOR_SLOTS)[number];

/**
 * A per-fixture team palette. `home`/`away` are that team's identity colors
 * (used ONLY in the four slots above). `ground` is the loud ground chosen for
 * the surface — it must be a color NEITHER team owns.
 */
export interface FixturePalette {
  homeTeam: string;
  awayTeam: string;
  /** loud ground for this surface; neither team's color. Falls back to terraceGrey. */
  ground: string;
}

/** The reference-blessed demo fixture (MEX Grass vs ENG Poppy — brand-book p.4). */
export const DEMO_FIXTURE: FixturePalette = {
  homeTeam: LOUD.grass, // Mexico
  awayTeam: LOUD.poppy, // England
  ground: LOUD.fizzPink, // owned by neither → legal
} as const;

/* =========================================================================
 * 3 · TYPE SYSTEM
 * Four voices, each with ONE job. The dot voice prints data; the display voice
 * screams; the serif is the programme register and NEVER touches a loud ground.
 * Google Fonts URLs are the exact axes from apps/web/public/type-lab.html.
 * ===================================================================== */

/** Exact Google Fonts stylesheet URLs (verbatim from type-lab.html head). */
export const FONT_URLS = {
  /** display / scream — the wdth axis (50..150) IS the stretch gesture */
  anybody:
    'https://fonts.googleapis.com/css2?family=Anybody:wdth,wght@50..150,100..900&display=swap',
  /** programme / verdict register ONLY — never on loud grounds */
  youngSerif: 'https://fonts.googleapis.com/css2?family=Young+Serif&display=swap',
  /** ALL data / numbers — the printer's dot-matrix voice */
  doto: 'https://fonts.googleapis.com/css2?family=Doto:wght,ROND@100..900,0..100&display=swap',
  /** knit contexts (relics) — the pixel-jacquard twin of Doto */
  silkscreen: 'https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap',
  /** ALTERNATE editorial serif — not a default */
  fraunces:
    'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..900&display=swap',
  /** ALTERNATE dot face — not a default */
  handjet: 'https://fonts.googleapis.com/css2?family=Handjet:wght@100..900&display=swap',
} as const;

/** All font stylesheet URLs, for building a single <link> preload set. */
export const FONT_URL_LIST = Object.values(FONT_URLS);

/** CSS font-family stacks (with period-honest fallbacks). */
export const FONT_STACKS = {
  /** the scream / wordmark / display band / eruptions */
  display: "'Anybody', system-ui, sans-serif",
  /** the programme / verdicts / editorial warmth — OFF loud grounds */
  serif: "'Young Serif', Georgia, serif",
  /** every number: score, clock, %, counts, serials, meters */
  data: "'Doto', ui-monospace, monospace",
  /** relic / knit contexts */
  knit: "'Silkscreen', ui-monospace, monospace",
  /** alternate serif (editorial only) */
  serifAlt: "'Fraunces', Georgia, serif",
  /** alternate dot face */
  dataAlt: "'Handjet', ui-monospace, monospace",
} as const;

/** Named roles → which stack + the rule that governs the role. */
export const TYPE_ROLES = {
  scream: { stack: FONT_STACKS.display, note: 'wdth axis = stretch; verdicts, GOOOL, wordmark' },
  programme: {
    stack: FONT_STACKS.serif,
    note: 'verdict / editorial register; NEVER on a loud ground',
  },
  data: { stack: FONT_STACKS.data, note: 'ALL live numbers — never set a probability in a display face' },
  label: { stack: FONT_STACKS.display, note: 'chip labels, tricodes, band words (Anybody, tight tracking)' },
  knit: { stack: FONT_STACKS.knit, note: 'relics only — Doto rendered as stitches' },
} as const;
export type TypeRole = keyof typeof TYPE_ROLES;

/** The Anybody width axis, as design-meaningful stops (idle → mid → full scream). */
export const WIDTH_AXIS = {
  min: 50,
  rest: 100,
  max: 150,
  /** the "hold-to-call" gesture travels rest → max */
  screamFrom: 100,
  screamTo: 150,
} as const;

/* =========================================================================
 * 4 · GRID & FRAME RATIOS
 * Boxes-first. Draw the boxes, then fill. Keyline + border are a SYSTEM, not a
 * guess (POP-LANGUAGE §C). Values are fractions of the framed object's width.
 * ===================================================================== */

export const GRID = {
  /** outer keyline weight ≈ 2% of object width (fat hairline, visible at thumb) */
  keyline: 0.02,
  /** inner rules / dividers = half the keyline */
  keylineInner: 0.01,
  /** cream/white border OUTSIDE the keyline ≈ 5% of width, uniform all four sides */
  border: 0.05,
  /** perforation / zigzag tooth ≈ 3.5% of the edge it rides */
  tooth: 0.035,
  /** at MOST one diagonal per composition; this is its angle off-horizontal (deg) */
  diagonalDeg: 14,
  /** card aspect — 5:7 portrait (width:height) */
  cardAspect: 5 / 7,
  /** ticket-stub aspect — 2:1 landscape */
  stubAspect: 2 / 1,
} as const;

/** Keyline weight tiers, resolved to px for a given object width. */
export function keylinePx(objectWidthPx: number): { outer: number; inner: number; border: number } {
  const w = Number.isFinite(objectWidthPx) && objectWidthPx > 0 ? objectWidthPx : 0;
  return {
    outer: Math.max(1, Math.round(w * GRID.keyline)),
    inner: Math.max(1, Math.round(w * GRID.keylineInner)),
    border: Math.max(2, Math.round(w * GRID.border)),
  };
}

/* =========================================================================
 * 5 · HONEST GEOMETRY (the probability axis)
 * Vertical = probability. Halfway = a THIN constant seam at EXACTLY 50%. THE DRAW
 * is a paper-band WIDTH (= pDraw) with zigzag teeth, the seam riding inside it.
 * Territory extent = EXACTLY win probability. Market number ≠ crowd counts, ever.
 * ===================================================================== */

export const GEOMETRY = {
  /** the halfway seam sits at exactly 0.5 of the pitch height — a constant, never moves */
  halfwaySeam: 0.5,
  /** the halfway seam is a thin Press-Black rule; weight as a fraction of pitch height */
  seamWeight: 0.006,
  /** the DRAW band is centered on the seam; its half-width each side = pDraw/2 */
  drawBandCentered: true,
  /** territory solid core → dot-dissolve begins at this fraction of the way to the working edge */
  dissolveStart: 0.55,
  /** the working edge of a territory = solid→dot fade over this fraction of the field */
  dissolveSpan: 0.22,
  /** clamp any single probability into a legible band so a 2% tail still renders a sliver */
  minRenderP: 0.02,
  maxRenderP: 0.98,
} as const;

/* =========================================================================
 * 6 · HALFTONE / PRESS TEXTURE
 * Press language, NEVER aging. Dots coarse enough to READ as dots. One or two
 * inks. A hair of misregistration as flavor. No sepia/scratch/distress/blur/glow.
 * ===================================================================== */

export const HALFTONE = {
  /** dot cell size in px at 1× (coarse — reads as dots, ~the 66-duotone panel) */
  cell: 7,
  /** min / max dot radius as a fraction of the cell (density = belief) */
  dotMin: 0.06,
  dotMax: 0.46,
  /** dot grid angle (deg) — the classic offset screen tilt */
  angleDeg: 15,
  /** deliberate CMYK misregistration offset, as a fraction of object width (0.3–0.8%) */
  misregister: 0.005,
  /** uniform paper grain opacity on grounds (subtle "printed on paper" tooth) */
  grain: 0.05,
} as const;

/* =========================================================================
 * 7 · MOTION SYSTEM
 * A live MECHANICAL PRINT SYSTEM, not a digital broadcast. Stepped movement,
 * register snaps, dot-field changes, contained band refreshes. No smears, no
 * glow, no blur, no camera swoops. (Brand-book Motion table p.8 + cartoon logic.)
 * Every consumer must gate on prefers-reduced-motion.
 * ===================================================================== */

/** Durations in milliseconds. */
export const MOTION_MS = {
  /** halftone breathing — idle dot appear/disappear cycle */
  breathe: 2600,
  /** territory advance — snap, then settle (NOT a smear) */
  territorySnap: 90,
  territorySettle: 420,
  /** roar-ring pulse period at a nominal cheer rate (scales inversely with rate) */
  roarPulse: 900,
  /** scoreboard flip — dot columns print then snap into register */
  scoreFlip: 260,
  /** starburst eruption — total sequence length (frame-stepped) */
  starburst: 640,
  /** stub PROVED punch — scale-down + tiny rotate + settle */
  punch: 300,
  /** pop-ball step-rotation increment dwell */
  popBallStep: 120,
  /** counter tick settle (rooted counts change by 1–5 then rest) */
  counterTick: 340,
} as const;

/** Easings. Pop is PUNCHY: fast-in, overshoot, tiny settle. Named for intent. */
export const EASING = {
  /** the sticker SLAP — fast in, small overshoot, settle */
  snap: 'cubic-bezier(0.22, 1.4, 0.36, 1)',
  /** calm settle after a snap (no fake momentum on odds) */
  settle: 'cubic-bezier(0.33, 0, 0.15, 1)',
  /** stepped — the printer's discrete register (paired with steps()) */
  step: 'steps(6, end)',
  /** linear breathing base */
  breathe: 'cubic-bezier(0.45, 0, 0.55, 1)',
} as const;

/**
 * Frame-stepped counts (motion is DISCRETE, not continuous). The pop-ball rotates
 * in 5 or 10 hard increments; the starburst plays as N frames.
 */
export const STEPS = {
  /** pop-ball rotation — 5 or 10 hard increments (brand-book p.8) */
  popBall: 10,
  /** starburst eruption frames */
  starburst: 6,
  /** roar-ring discrete expansion states before reset */
  roarRing: 4,
  /** scoreboard dot-print columns */
  scoreColumns: 6,
} as const;

/** The two Frame moods (brand-book Motion p.8): armed calm vs erupting event. */
export const FRAME_MOOD = {
  /** Frame 1 — armed but not explosive: calibration, counter ticks, halftone breathing */
  armed: { colors: [LOUD.aztecaSun], note: 'tension via calibration + ticks + breathing' },
  /** Frame 3 — the one diagonal event erupts: starburst + roar-rings + field snap, printed misregistration smear, NEVER a blur */
  erupt: { colors: [LOUD.fizzPink], note: 'one diagonal event block; snap outward, misregister not blur' },
} as const;

/* =========================================================================
 * 8 · Z-ORDER (paint order names)
 * One vocabulary so every lane stacks the same way. Lower index paints first.
 * ===================================================================== */

export const Z_ORDER = [
  'ground', // the single loud/paper ground
  'territory', // halftone team fields advancing from the goal-ends
  'pitchLines', // chalk markings, boxes, centre circle
  'drawBand', // the toothed neutral DRAW band + the halfway seam
  'crowdEnds', // pictogram crowd blocks + bunting rows
  'chrome', // scoreboard band, ornament rails, chips, meters
  'eruption', // starburst + roar-rings + GOOOL (event layer, above all)
  'frame', // the keyline + cream border that contains the surface
] as const;
export type ZLayer = (typeof Z_ORDER)[number];

/** Numeric z-index for a named layer (10-spaced so lanes can slot between). */
export function zIndexOf(layer: ZLayer): number {
  const i = Z_ORDER.indexOf(layer);
  return i < 0 ? 0 : (i + 1) * 10;
}

/* =========================================================================
 * 9 · COMPONENT TOKENS
 * Per-component proportions the specimens + build lanes share. Anatomy/states
 * live in SYSTEM.md; these are the numbers.
 * ===================================================================== */

export const COMPONENTS = {
  /** % chip: label row + Doto number + block-meter grid */
  pctChip: {
    /** meter grid columns × rows (filled cells ≈ percentage) */
    meterCols: 5,
    meterRows: 12,
    /** gap between meter cells, fraction of cell */
    meterGap: 0.18,
  },
  /** ROAR ring-meter: off-center concentric rings, pulses with cheer rate */
  roarMeter: {
    rings: 6,
    /** source dot offset from center, fraction of radius (OFF-center = the signature) */
    sourceOffset: 0.18,
    ringWeight: 0.05,
  },
  /** pop-ball: FIVE-segment Wyman pinwheel, two colors + black. NEVER a hexagon ball. */
  popBall: {
    segments: 5,
    /** the disc keyline weight, fraction of diameter */
    ring: 0.06,
  },
  /** starburst: drawn rays + fire-fringe + shockwave rings */
  starburst: {
    rays: 24,
    /** ray length variance (inner/outer radius ratio) */
    rayInner: 0.42,
    /** cartoon fire-fringe sawtooth teeth across the hot-field/paper boundary */
    fringeTeeth: 40,
    shockwaveRings: 3,
  },
  /** scoreboard band: flags as keylined blocks, dot-matrix score/clock */
  scoreboard: {
    /** band height as a fraction of surface width */
    height: 0.11,
    /** flag block aspect (w:h) */
    flagAspect: 3 / 2,
  },
  /** stat chip (LOU / FTH / FOR / PRE): label cap + Doto number in a keyline box */
  statChip: {
    labels: ['LOU', 'FTH', 'FOR', 'PRE'] as const,
  },
  /** THE STANDS diagonal band — the one reserved diagonal */
  standsBand: { angleDeg: GRID.diagonalDeg },
  /** stub: rotated CALLED IT rail + pictogram rows + serial + PROVED punch */
  stub: {
    /** rotated rail width as fraction of stub width */
    railWidth: 0.16,
    /** PROVED punch-hole diameter as fraction of stub height */
    punchDia: 0.22,
    /** the tear edge tooth count down the perforation side */
    tearTeeth: 14,
  },
  /** card: 5:7, keyline+border, four corner chips, footer strip */
  card: {
    aspect: GRID.cardAspect,
    cornerChips: 4,
    footerHeight: 0.06,
  },
  /** equalizer-skyline data-portrait (card): bars rising from the goal-end */
  skyline: {
    bars: 28,
    /** bar gap as fraction of bar width */
    gap: 0.22,
  },
} as const;

/* =========================================================================
 * 10 · BANNED (the diseases — encoded so lint/review can reference them)
 * ===================================================================== */

export const BANNED = [
  'true-hexagon-soccer-ball', // ONLY the 5-segment pinwheel pop-ball
  'speed-streaks', // motion = stepped/snap/squash
  'motion-blur',
  'glow',
  'gradient-mesh',
  'drop-shadow-blur',
  'sepia',
  'scratches',
  'distress',
  'torn-burnt-paper',
  'sticker-bomb', // every rail cell must carry a JOB
  'trophy-silverware', // never in match frames
  'player-faces',
  'club-crests',
  'FIFA-marks',
  'two-loud-grounds-touching', // separate with a seam or a cream border
  'probability-in-display-face', // numbers print in Doto
  'crowd-count-as-percentage', // market number ≠ crowd counts, never blended
] as const;
export type BannedItem = (typeof BANNED)[number];

/* =========================================================================
 * THE THEME — one typed const the build lanes import.
 * ===================================================================== */

export const THEME = {
  colors: COLORS,
  neutrals: NEUTRALS,
  loud: LOUD,
  loudRotation: LOUD_ROTATION,
  surfaceGround: SURFACE_GROUND,
  teamSlots: TEAM_COLOR_SLOTS,
  demoFixture: DEMO_FIXTURE,
  fontUrls: FONT_URLS,
  fontUrlList: FONT_URL_LIST,
  fontStacks: FONT_STACKS,
  typeRoles: TYPE_ROLES,
  widthAxis: WIDTH_AXIS,
  grid: GRID,
  geometry: GEOMETRY,
  halftone: HALFTONE,
  motionMs: MOTION_MS,
  easing: EASING,
  steps: STEPS,
  frameMood: FRAME_MOOD,
  zOrder: Z_ORDER,
  components: COMPONENTS,
  banned: BANNED,
} as const;

export type Theme = typeof THEME;
export default THEME;
