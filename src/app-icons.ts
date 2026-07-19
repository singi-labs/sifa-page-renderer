/**
 * App icons for activity-stream cards.
 *
 * Mirrors sifa-web's `/activity` treatment: each card gets a top-left icon that
 * is the app's BRAND logo for recognizable single-writer apps (e.g. Popfeed),
 * and a CATEGORY glyph (speech bubble, star, camera, ...) for everything else.
 * The source pill always shows the category glyph next to the app name.
 *
 * Deliberately there is no `bluesky` brand logo: shared `app.bsky.*` posts fall
 * through to the category glyph so they read as generic posts, not as a single
 * app's content.
 *
 * Pure string HTML, no framework. Every icon is a static SVG constant using
 * `currentColor` for fills/strokes, so it inherits the card's theme color.
 */

import { categoryForApp } from "@singi-labs/sifa-sdk";

/** Wrap hand-authored 24x24 line-glyph markup in a themeable `<svg>`. */
function lineGlyph(inner: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

/** Fallback glyph for categories without a bespoke icon: a simple filled dot. */
const DEFAULT_GLYPH =
  `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="3.4"/></svg>`;

/**
 * Category id (as returned by `categoryForApp`) → inline glyph. Curated and
 * small; anything not listed falls back to {@link DEFAULT_GLYPH}.
 */
const CATEGORY_GLYPHS: Record<string, string> = {
  Posts: lineGlyph(`<path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z"/>`),
  Reviews: lineGlyph(
    `<path d="M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.6l5.9-.8z"/>`
  ),
  Articles: lineGlyph(
    `<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path d="M9 12h6M9 15.5h6"/>`
  ),
  Code: lineGlyph(`<path d="M9 8l-4 4 4 4"/><path d="M15 8l4 4-4 4"/>`),
  Photos: lineGlyph(
    `<path d="M3.5 8h3l1.5-2h6L15.5 8h5v11.5h-17z"/><circle cx="12" cy="13" r="3.2"/>`
  ),
  Events: lineGlyph(
    `<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 9h16M8 3.5v3M16 3.5v3"/>`
  ),
  Music: lineGlyph(
    `<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>`
  ),
  Video: lineGlyph(
    `<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M10.5 9.5l4.5 2.5-4.5 2.5z"/>`
  ),
  Social: lineGlyph(
    `<circle cx="9" cy="8.5" r="2.6"/><path d="M4 19c0-2.8 2.2-4.7 5-4.7s5 1.9 5 4.7"/><path d="M15.5 6.4a2.6 2.6 0 010 4.2M16.5 14.6c2 .5 3.5 2.1 3.5 4.4"/>`
  ),
  Verification: lineGlyph(
    `<circle cx="8.5" cy="8.5" r="4"/><path d="M11.3 11.3L19 19M16 16l2-2M14 14l2-2"/>`
  ),
};

/** The category glyph for an app, falling back to the default dot. */
export function categoryGlyph(appId: string): string {
  const category = categoryForApp(appId);
  return (category && CATEGORY_GLYPHS[category]) || DEFAULT_GLYPH;
}

/** Popfeed — P-shaped speech bubble with a star cutout (even-odd fill).
 *  Extracted from sifa-web's `popfeed-logo.tsx`. */
const POPFEED_LOGO =
  `<svg viewBox="0 0 96 112" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" aria-hidden="true">` +
  `<path d="M 50,0 A 44,44 0 1 1 18.9,75.1 L 4,110 L 8.7,59.1 A 44,44 0 0 1 50,0 Z"/>` +
  `<path d="M 52,24 L 56.4,35.9 L 69.1,36.4 L 59.1,44.3 L 62.6,56.6 L 52,49.5 L 41.4,56.6 L 44.9,44.3 L 34.9,36.4 L 47.6,35.9 Z"/>` +
  `</svg>`;

/**
 * Brand logos for single-writer apps, keyed by appId. When an app is not in
 * this map its card icon falls back to the category glyph.
 */
export const APP_BRAND_LOGOS: Record<string, string> = {
  popfeed: POPFEED_LOGO,
};

/**
 * The top-left card icon for an app: its brand logo when we ship one, otherwise
 * the category glyph.
 */
export function cardIcon(appId: string): string {
  return APP_BRAND_LOGOS[appId] ?? categoryGlyph(appId);
}

/** The glyph shown inside the source pill, before the app name: always the
 *  category glyph (the pill already names the app in text). */
export function pillGlyph(appId: string): string {
  return categoryGlyph(appId);
}
