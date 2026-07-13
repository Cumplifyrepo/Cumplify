/**
 * Cumplify design tokens — extracted from the Framer project ("Spora (copy)")
 * via the framer-api Server API on 2026-07-13 (getColorStyles / getTextStyles,
 * live-verified; see .kiro/evidence/frontend-app/tasks-25-31-design-authority.md).
 *
 * Layer 1 (`framer`): raw Framer style values, verbatim. Regenerate with
 *   `node --env-file=.env scripts/framer-sync.mjs` (writes framer-styles.json;
 *   update this block only when the Framer styles actually change).
 * Layer 2 (`colors`, `type`, `space`, `radius`): the semantic dark-theme
 *   mapping used by the app (owner decision 2026-07-11: the SaaS UI is DARK
 *   THEME — steering 21). Components import ONLY the semantic layer.
 *
 * Radii and spacing are derived from the /dashboard + component reference
 * renders (the Server API does not expose them for component masters) — they
 * are architect-ruled values on the Framer visual language, not API reads.
 */

/** Layer 1 — raw Framer color styles (names verbatim from the project). */
export const framer = {
  neutral50: 'rgb(252, 252, 252)',
  neutral100: 'rgb(241, 242, 243)',
  neutral200: 'rgb(227, 229, 232)',
  neutral300: 'rgb(204, 208, 214)',
  neutral400: 'rgb(174, 180, 188)',
  neutral500: 'rgb(137, 146, 159)',
  neutral900: 'rgb(28, 30, 34)',
  darkMode50: 'rgb(59, 63, 68)',
  darkMode100: 'rgb(56, 60, 66)',
  darkMode300: 'rgb(49, 53, 58)',
  darkMode400: 'rgb(46, 50, 56)',
  darkMode600: 'rgb(39, 42, 48)',
  darkMode700: 'rgb(35, 40, 46)',
  darkMode800: 'rgb(33, 37, 44)',
  darkMode900: 'rgb(20, 24, 31)',
  black: 'rgb(0, 0, 0)',
  accent: 'rgb(0, 101, 248)',
  accentSecondary: 'rgb(117, 166, 240)',
  warning: 'rgb(251, 191, 36)',
  success: 'rgb(74, 222, 128)',
  danger: 'rgb(248, 113, 113)',
  textPrimary: 'rgb(255, 255, 255)',
  textSecondary: 'rgb(102, 102, 102)',
} as const;

/** Layer 2 — semantic dark-theme palette. Import this, not `framer`. */
export const colors = {
  bg: framer.darkMode900, // app background
  surface: framer.darkMode800, // panels / cards
  surfaceRaised: framer.darkMode700, // nested cards, popovers, table headers
  surfaceHover: framer.darkMode600, // hover states on surface
  borderSubtle: framer.darkMode400, // default hairlines
  border: framer.darkMode300, // card borders, dividers
  borderStrong: framer.darkMode50, // focused/active outlines (non-accent)

  textHeading: framer.neutral50, // headings (Framer heading styles use Neutral 50)
  textBody: framer.neutral300, // Body Regular color per Framer text style
  textSecondary: framer.neutral400, // Body Medium color per Framer text style
  textMuted: framer.neutral500, // timestamps, placeholders, captions
  textOnAccent: framer.textPrimary,

  accent: framer.accent, // primary actions, links, active nav
  accentMuted: framer.accentSecondary, // hovered links, secondary indicators
  success: framer.success, // readiness good / approved / closed
  warning: framer.warning, // pending / due-soon / medium severity
  danger: framer.danger, // overdue / rejected / high severity / flagged
} as const;

/**
 * Typography. Framer ramp verbatim in `type.framer*`; the app scale rules
 * (marketing H1/H2 sizes are landing-page scale and are NOT used inside the
 * app shell): page title = Framer H3, panel title = H4, card title = H5.
 */
export const type = {
  familyDisplay: "'Inter Display', 'Inter', system-ui, sans-serif",
  familyText: "'Inter', system-ui, sans-serif",

  pageTitle: { fontSize: '32px', fontWeight: 400, letterSpacing: '-0.3px', lineHeight: 1.2 }, // Framer "Heading 3"
  panelTitle: { fontSize: '24px', fontWeight: 400, letterSpacing: '-1px', lineHeight: 1.3 }, // Framer "Heading 4"
  cardTitle: { fontSize: '20px', fontWeight: 400, letterSpacing: '0px', lineHeight: 1.4 }, // Framer "Heading 5"
  body: { fontSize: '16px', fontWeight: 400, letterSpacing: '0px', lineHeight: 1.5 }, // "Body Regular"
  bodyMedium: { fontSize: '16px', fontWeight: 500, letterSpacing: '0px', lineHeight: 1.5 }, // "Body Medium"
  small: { fontSize: '14px', fontWeight: 400, letterSpacing: '0px', lineHeight: 1.5 }, // app-scale derivative
  label: { fontSize: '14px', fontWeight: 600, letterSpacing: '2px', lineHeight: 1.4, textTransform: 'uppercase' }, // "Capitalized Label"
  labelSmall: { fontSize: '12px', fontWeight: 500, letterSpacing: '2px', lineHeight: 1.4, textTransform: 'uppercase' }, // "Capitalized Label Small"
} as const;

/** 4px base grid. */
export const space = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
  panelPad: '24px',
  cardPad: '16px',
} as const;

export const radius = {
  card: '16px', // panels and cards (Framer Card 1/2/3 language)
  inner: '12px', // nested cards, inputs-in-cards
  control: '10px', // inputs, selects
  pill: '9999px', // buttons and chips (Framer buttons are pill-shaped)
} as const;

/**
 * CSS custom properties for globals.css: `:root { ...cssVariables }`.
 * Keys are stable — Tailwind config and plain CSS both consume them.
 */
export const cssVariables: Record<string, string> = {
  '--color-bg': colors.bg,
  '--color-surface': colors.surface,
  '--color-surface-raised': colors.surfaceRaised,
  '--color-surface-hover': colors.surfaceHover,
  '--color-border-subtle': colors.borderSubtle,
  '--color-border': colors.border,
  '--color-border-strong': colors.borderStrong,
  '--color-text-heading': colors.textHeading,
  '--color-text-body': colors.textBody,
  '--color-text-secondary': colors.textSecondary,
  '--color-text-muted': colors.textMuted,
  '--color-text-on-accent': colors.textOnAccent,
  '--color-accent': colors.accent,
  '--color-accent-muted': colors.accentMuted,
  '--color-success': colors.success,
  '--color-warning': colors.warning,
  '--color-danger': colors.danger,
  '--font-display': type.familyDisplay,
  '--font-text': type.familyText,
  '--radius-card': radius.card,
  '--radius-inner': radius.inner,
  '--radius-control': radius.control,
  '--radius-pill': radius.pill,
};
