/**
 * "Highlights" block for the personal site (page.sifa.id/{handle}), rendered
 * below the About section on the home view. Same selection and labeling as the
 * sifa-web profile page: both call the SDK's {@link buildProfileHighlights} and
 * {@link shouldRenderHighlights}, so the two surfaces feature the same records
 * and never drift. Only the markup differs -- here it is academicpages HTML
 * (cards styled with the shared `--card` / `--border` / `--link` tokens), no
 * React, no client JS.
 */
import {
  buildProfileHighlights,
  shouldRenderHighlights,
  SECTION_LABELS,
  type ProfileHighlightsInput,
  type ProfileHighlightTile,
  type ProfileHighlightStatus,
  type SectionId,
} from "@singi-labs/sifa-sdk";
import { escapeHtml, safeUrl } from "./util.js";
import { sectionSlug } from "./slug.js";
import { navIcon } from "./section-icons.js";

/**
 * Map a tile's profile-page anchor (`#career`, `#presentations`, …) to the
 * renderer's `SectionId`, so the personal site can rewrite the link to its own
 * section slug (which differs, e.g. `#presentations` -> `#talks-presentations`).
 * The tile's `href` already encodes the exact target -- including the
 * education->course fallback (`#courses` vs `#education`) -- so it is the right
 * routing key.
 */
const HREF_TO_SECTION_ID: Record<string, SectionId> = {
  "#presentations": "presentations",
  "#publications": "publications",
  "#career": "career",
  "#education": "education",
  "#courses": "courses",
  "#projects": "projects",
  "#involvement": "involvement",
};

const STATUS_LABEL: Record<ProfileHighlightStatus, string> = {
  upcoming: "Upcoming",
  current: "Current",
  recent: "Recent",
};

/** Resolve a tile to the personal-site section it links to (id + `#slug` href). */
function tileTarget(tile: ProfileHighlightTile): { id: SectionId; href: string } {
  const id = HREF_TO_SECTION_ID[tile.href] ?? (tile.section as SectionId);
  return { id, href: `#${sectionSlug(SECTION_LABELS[id])}` };
}

/** One highlight card: whole-card link to its section, label + status pill,
 * title, optional cover / meta / date. All user text is escaped. */
function highlightCard(tile: ProfileHighlightTile): string {
  const { id, href } = tileTarget(tile);
  const sectionLabel = SECTION_LABELS[id];
  const statusLabel = STATUS_LABEL[tile.status];
  // The whole card is a single link, so its accessible name must carry the
  // label + status + title + date the sighted user reads across the card.
  const ariaLabel = [sectionLabel, statusLabel, tile.title, tile.dateStr]
    .filter(Boolean)
    .join(" · ");

  // Cover art (talks / publications). Any aspect ratio from arbitrary hosts, so
  // a validated plain <img> on a muted letterbox -- matching the publications
  // section. Decorative: the card link's aria-label names it.
  const cover = tile.imageUrl && safeUrl(tile.imageUrl);
  const coverHtml = cover
    ? `<img class="highlight-cover" src="${cover}" alt="" loading="lazy" decoding="async" />`
    : "";

  const meta = tile.meta
    ? `<span class="highlight-meta">${escapeHtml(tile.meta)}</span>`
    : "";
  const date = tile.dateStr
    ? `<span class="highlight-date">${escapeHtml(tile.dateStr)}</span>`
    : "";

  return (
    `<li class="highlight-card">` +
    `<a class="highlight-link" href="${href}" aria-label="${escapeHtml(ariaLabel)}">` +
    coverHtml +
    `<span class="highlight-top">` +
    `<span class="highlight-label">${navIcon(id)}${escapeHtml(sectionLabel)}</span>` +
    `<span class="highlight-pill highlight-pill--${tile.status}">${escapeHtml(statusLabel)}</span>` +
    `</span>` +
    `<span class="highlight-title">${escapeHtml(tile.title)}</span>` +
    meta +
    date +
    `</a></li>`
  );
}

/**
 * Render the Highlights block, or an empty string when the profile has too few
 * highlights to be worth a labeled block (the shared {@link shouldRenderHighlights}
 * threshold -- a lone tile just duplicates the section right below it).
 *
 * @param profile The structured profile. Typed as the SDK `ProfileHighlightsInput`
 *   (the Highlights-relevant fields), which both `Profile` and the anonymous
 *   public-view profile satisfy; only those fields are read.
 * @param options.today Injectable "today" (YYYY-MM-DD) for the upcoming/recent
 *   split. Defaults to the current date, matching the renderer's other
 *   time-aware helpers (activity, heatmap).
 */
export function renderHighlights(
  profile: ProfileHighlightsInput,
  options?: { today?: string },
): string {
  const today = options?.today ?? new Date().toISOString().slice(0, 10);
  const rows = buildProfileHighlights(profile, { today });
  if (!shouldRenderHighlights(rows)) return "";

  const cards = [...rows.row1, ...rows.row2].map(highlightCard).join("");
  return (
    `<section class="highlights" aria-labelledby="highlights-heading">` +
    `<h2 id="highlights-heading" class="highlights-heading">Highlights</h2>` +
    `<ul class="highlights-grid">${cards}</ul>` +
    `</section>`
  );
}
