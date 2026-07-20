/**
 * Pure renderer for personal sites driven by Sifa profile data.
 *
 * No fs, no fetch -- importable by any Node.js build harness, Next.js Route Handler,
 * or static site generator. The same codebase powers:
 *  - sifa-page (GitHub Pages, self-hosted static sites)
 *  - sifa-web `/p/{handle}/site` (server-rendered on demand)
 *
 * Layout is styled after academicpages.github.io: a top masthead with horizontal nav,
 * a left sidebar with avatar / identity / links shown as content, main content,
 * and a Sifa-branded footer.
 *
 * `profile` supplies the identity (name, avatar, headline, location, links)
 * rendered in the sidebar/footer -- structurally a subset of the SDK `Profile`.
 * Body `sections` are built from the structured SDK `Profile` via
 * {@link buildProfileSections} (see `./sections.ts`); their HTML is already
 * sanitized/escaped. `ctx` carries build/request metadata (year, last-updated
 * date, OG tags, CSP nonce, path overrides).
 */

import { escapeHtml, safeUrl } from "./util.js";
import { navIcon } from "./section-icons.js";
import type { RenderedSection } from "./sections.js";
import { renderActivityStream, type ActivityStreamOptions } from "./activity.js";
import { renderHeatmap, type HeatmapDataInput } from "./heatmap.js";
import type { StreamCardVM, SectionGroupId } from "@singi-labs/sifa-sdk";
import { ALL_SECTIONS, SECTION_GROUPS, normalizePlatformId } from "@singi-labs/sifa-sdk";

// Section id -> nav group, straight from the SDK's single source of truth so
// the personal-site nav groups exactly like the main sifa.id profile.
const SECTION_ID_TO_GROUP = new Map<string, SectionGroupId>(
  ALL_SECTIONS.map((s) => [s.id, s.group])
);

// English group headings (the renderer is i18n-free, matching SECTION_LABELS).
// `overview` never surfaces as a heading -- its sole section (About) renders
// flat -- but is included for exhaustiveness.
const GROUP_LABELS: Record<SectionGroupId, string> = {
  overview: "Overview",
  experience: "Experience",
  qualifications: "Qualifications",
  more: "More",
};

// --- Public types -----------------------------------------------------------

/** Minimal profile shape -- compatible with the SDK `Profile` type. */
export interface AcademicProfile {
  handle?: string | null;
  displayName?: string | null;
  headline?: string | null;
  about?: string | null;
  avatar?: string | null;
  website?: string | null;
  locationLocality?: string | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  locationCountry?: string | null;
  /**
   * Structured locations. Preferred over the flat `location*` fields above,
   * which are deprecated legacy mirrors of the entry where `isPrimary` is
   * true and may not be populated for every profile.
   */
  locations?: Array<{
    isPrimary?: boolean | null;
    /** Pre-formatted display string, e.g. "Rotterdam, Netherlands". */
    location?: string | null;
    locationLocality?: string | null;
    locationCity?: string | null;
    locationRegion?: string | null;
    locationCountry?: string | null;
  }> | null;
  externalAccounts?: Array<{
    label?: string | null;
    platform?: string | null;
    url?: string | null;
    verified?: boolean | null;
    /** The link the owner marked primary in their profile's links section. */
    primary?: boolean | null;
  }> | null;
  /** Nested location object (some profiles use this shape). */
  location?: {
    locality?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
  } | null;
}

/** Context passed to every render call. */
export interface RenderContext {
  /** Copyright year shown in the footer. */
  year?: number | string;
  /** "Site last updated" date string shown in the footer. */
  updated?: string;
  /** Path overrides for assets. Defaults match the self-hosted layout. */
  paths?: RenderPaths;
  /** Open Graph meta tags to inject into `<head>`. */
  og?: OpenGraphMeta;
  /**
   * Canonical URL for the page. Emitted as `<link rel="canonical">` and used as
   * the `url` in the Schema.org Person JSON-LD. Consolidates ranking signal when
   * the same profile renders at multiple URLs (page.sifa.id, sifa.id, self-hosted).
   */
  canonical?: string;
  /**
   * When true, renders all sections in a single HTML document with JS-based
   * section switching (nav links use hash fragments instead of .html files).
   * Used by server-rendered contexts like sifa-web where multi-page static
   * files aren't available.
   */
  singlePage?: boolean;
  /**
   * CSP nonce to stamp on every inline `<script>` this renderer emits (theme
   * init, theme toggle, single-page nav). Required by server-rendered hosts
   * whose Content-Security-Policy uses a nonce + `'strict-dynamic'`, which
   * makes browsers ignore `'unsafe-inline'` and block any un-nonced inline
   * script -- without it the nav and dark-mode toggle silently do nothing.
   */
  nonce?: string;
  /**
   * When set, injects a "Now" activity-stream nav item into every page's nav
   * (masthead + mobile bottom nav) so the separate activity page rendered by
   * {@link renderActivityPage} is reachable from the home page and each section
   * page. Pass `true` for the default "Now" label, or an object to customize it.
   * The entry links to `now.html` (override via {@link ActivityNavConfig.href})
   * and is marked active only on the activity page.
   * When omitted, the nav is byte-identical to a build without an activity page.
   */
  activityStream?: boolean | ActivityNavConfig;
  /**
   * When set, rewrites the SECTION nav links (About/Career/…) to point back at
   * the single-page profile home instead of the self-hosted `.html` files or
   * in-document hashes. Intended for single-page hosts like sifa-web's
   * `page.sifa.id/{handle}/now` activity route, where relative `career.html`
   * links would resolve to `page.sifa.id/{handle}/career.html` and 404.
   *
   * The About/index section links to `profileHomeHref` itself (e.g. `/gui.do`);
   * every other section with slug `S` links to `profileHomeHref` + `#` + `S`
   * (e.g. `/gui.do#career`). Applied to both the masthead and mobile bottom nav.
   * The "Now" activity entry (see {@link activityStream}) and the masthead brand
   * badge are unaffected; section active-state is still slug-based.
   *
   * May be an absolute `http(s)` URL or a same-origin relative path; validated
   * and escaped the same way as {@link ActivityNavConfig.href} (executable
   * schemes like `javascript:` are rejected, falling back to the default
   * section links). When omitted, the nav is byte-identical to today.
   */
  profileHomeHref?: string;
}

/** Nav configuration for the activity ("Now") page. */
export interface ActivityNavConfig {
  /** Nav label + page title for the activity page. Default: `"Now"`. */
  label?: string;
  /**
   * Href for the "Now" nav entry (masthead + mobile bottom nav). Defaults to
   * the self-hosted `"now.html"` file. Set this so a single-page host (e.g.
   * sifa-web's `page.sifa.id/{handle}` route) can point "Now" at a real
   * per-handle URL such as `"/gui.do/now"` instead of the static file. May be
   * an absolute `http(s)` URL or a same-origin relative path; validated and
   * escaped (executable schemes like `javascript:` are rejected, falling back
   * to `"now.html"`). Active-state highlighting is keyed on the entry's slug,
   * so a custom href still highlights correctly on the activity page.
   */
  href?: string;
}

/** Path overrides for CSS, fonts, and static assets. */
export interface RenderPaths {
  /** Path to the stylesheet. Default: `"style.css"`. */
  css?: string;
  /** Path to the favicon. Default: `"assets/favicon.svg"`. */
  favicon?: string;
  /** Directory prefix for logo SVGs. Default: `"assets"`. */
  assetDir?: string;
  /** Directory prefix for font files. Default: `"fonts"`. */
  fontDir?: string;
}

/** Open Graph meta tag values. */
export interface OpenGraphMeta {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  siteName?: string;
  type?: string;
}

// --- identity helpers -------------------------------------------------------

function locationLine(profile: AcademicProfile): string | null {
  const primary =
    profile.locations?.find((l) => l.isPrimary) ??
    profile.locations?.[0] ??
    null;
  if (primary?.location) return primary.location;

  const loc = profile.location;
  const flat = [
    primary?.locationLocality ??
      primary?.locationCity ??
      profile.locationLocality ??
      profile.locationCity ??
      loc?.locality ??
      loc?.city,
    primary?.locationRegion ?? profile.locationRegion ?? loc?.region,
    primary?.locationCountry ?? profile.locationCountry ?? loc?.country,
  ].filter(Boolean);
  return flat.length ? flat.join(", ") : null;
}

/**
 * Display names for known external-account platforms, used when the account
 * has no custom label. Matches the platform list documented at
 * https://docs.sifa.id/docs/external-accounts.
 */
const PLATFORM_LABELS: Record<string, string> = {
  rss: "RSS",
  website: "Website",
  substack: "Substack",
  fediverse: "Fediverse",
  bsky: "Bluesky",
  bluesky: "Bluesky",
  github: "GitHub",
  orcid: "ORCID",
  keyoxide: "Keyoxide",
  youtube: "YouTube",
  twitter: "Twitter/X",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  other: "Link",
};

function linkLabel(label?: string | null, platform?: string | null): string {
  if (label) return label;
  if (platform) {
    // Normalize synonyms (e.g. `activitypub` -> `fediverse`) so the derived
    // label matches the brand mark rather than a capitalized raw id.
    const key = normalizePlatformId(platform).toLowerCase();
    return PLATFORM_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
  }
  return "Link";
}

/** Compact display form of a URL: no scheme, no `www.`, no trailing slash, truncated. */
function displayUrl(url: string): string {
  let s = url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
  if (s.length > 38) s = s.slice(0, 37) + "…";
  return s;
}

/**
 * Monochrome brand glyphs for known link platforms, as inline SVG path data
 * (viewBox 0 0 24 24, filled with currentColor). Sourced from simple-icons
 * (CC0). Bundling them inline keeps the page fully self-contained: no
 * favicon-service call, no per-visitor request to each linked domain, and no
 * broken-image icons under a strict CSP. Platforms without a brand mark
 * (website, keyoxide, other, or anything unrecognized) fall back to a generic
 * globe via `linkIcon()`.
 */
const PLATFORM_ICON_PATHS: Record<string, string> = {
  github:
    "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  orcid:
    "M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 0 1-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.025-5.325 5.025h-3.919V7.416zm1.444 1.303v7.444h2.297c3.272 0 4.022-2.484 4.022-3.722 0-2.016-1.284-3.722-4.097-3.722h-2.222z",
  rss: "M19.199 24C19.199 13.467 10.533 4.8 0 4.8V0c13.165 0 24 10.835 24 24h-4.801zM3.291 17.415c1.814 0 3.293 1.479 3.293 3.295 0 1.813-1.485 3.29-3.301 3.29C1.47 24 0 22.526 0 20.71s1.475-3.294 3.291-3.295zM15.909 24h-4.665c0-6.169-5.075-11.245-11.244-11.245V8.09c8.727 0 15.909 7.184 15.909 15.91z",
  // ActivityPub logo (Simple Icons, CC0), the same mark sifa-web renders for
  // fediverse accounts. The platform spans Mastodon, GoToSocial, Pleroma, etc.,
  // so the protocol logo is used rather than a Mastodon-specific mark.
  fediverse:
    "M10.91 4.442L0 10.74v2.52L8.727 8.22v10.077l2.182 1.26zM6.545 12l-4.364 2.52 4.364 2.518zm6.545-2.52L17.455 12l-4.364 2.52zm0-5.038L24 10.74v2.52l-10.91 6.298v-2.52L21.819 12 13.091 6.96z",
  youtube:
    "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  twitter:
    "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
  substack:
    "M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z",
};

/**
 * Inline SVG icon for a link, chosen by platform. Known platforms get their
 * brand mark; everything else gets a generic globe.
 */
// Bluesky butterfly (viewBox 0 0 600 530, unlike the 24x24 marks above), the
// same logo used across sifa.id. Handled separately in linkIcon() for its
// distinct viewBox.
const BLUESKY_ICON_PATH =
  "m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z";

// Full Sifa logo mark (viewBox 0 0 256 256, from the bundled favicon): the two
// filled `@` paths plus the two outlined diamonds and the chevron. Rendered
// monochrome in currentColor so it follows the light/dark toggle and sits
// alongside the other sidebar glyphs. Handled separately in linkIcon() for its
// distinct viewBox, like the Bluesky butterfly.
const SIFA_ATSIGN_PATHS = [
  "M128,71.5C159.183,71.5 184.5,96.817 184.5,128C184.5,159.183 159.183,184.5 128,184.5C96.817,184.5 71.5,159.183 71.5,128C71.5,96.817 96.817,71.5 128,71.5ZM128,104.5C115.03,104.5 104.5,115.03 104.5,128C104.5,140.97 115.03,151.5 128,151.5C140.97,151.5 151.5,140.97 151.5,128C151.5,115.03 140.97,104.5 128,104.5Z",
  "M174.866,194.259C182.45,189.218 192.7,191.282 197.741,198.866C202.782,206.45 200.718,216.7 193.134,221.741C175.432,233.507 150.846,240.5 128,240.5C66.284,240.5 15.5,189.716 15.5,128C15.5,66.284 66.284,15.5 128,15.5C189.716,15.5 240.5,66.284 240.5,128C240.5,160.538 225.46,184.5 196,184.5C166.54,184.5 151.5,160.538 151.5,128L151.5,88C151.5,78.893 158.893,71.5 168,71.5C177.107,71.5 184.5,78.893 184.5,88L184.5,128C184.5,134.408 185.237,140.363 187.279,145.164C188.851,148.858 191.536,151.5 196,151.5C200.464,151.5 203.149,148.858 204.721,145.164C206.763,140.363 207.5,134.408 207.5,128C207.5,84.388 171.612,48.5 128,48.5C84.388,48.5 48.5,84.388 48.5,128C48.5,171.612 84.388,207.5 128,207.5C144.415,207.5 162.148,202.713 174.866,194.259Z",
];
const SIFA_ICON = `<svg class="side-link-icon" viewBox="0 0 256 256" width="16" height="16" aria-hidden="true"><g transform="matrix(0.333333,0,0,0.333333,37.583333,37.083333)" fill="currentColor" fill-rule="evenodd"><path d="${SIFA_ATSIGN_PATHS[0]}"/><path d="${SIFA_ATSIGN_PATHS[1]}"/></g><g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round"><path d="M176,47.75 L208,79.75 L176,111.75 L144,79.75 Z" stroke-width="12"/><path d="M80,144 L112,176 L80,208 L48,176 Z" stroke-width="12"/><path d="M152,192 L176,160 L200,192" stroke-width="11"/></g></svg>`;

function linkIcon(platform?: string | null): string {
  // Normalize synonyms (e.g. keytrace's `activitypub` -> `fediverse`) so they
  // resolve to the right brand mark instead of the generic globe.
  const key = normalizePlatformId(platform ?? "").toLowerCase();
  if (key === "bsky" || key === "bluesky") {
    return `<svg class="side-link-icon" viewBox="0 0 600 530" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="${BLUESKY_ICON_PATH}"/></svg>`;
  }
  if (key === "sifa") {
    return SIFA_ICON;
  }
  const d = PLATFORM_ICON_PATHS[key];
  if (d) {
    return `<svg class="side-link-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
  }
  return `<svg class="side-link-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.9 5.6 3.9 9s-1.4 6.5-3.9 9c-2.5-2.5-3.9-5.6-3.9-9S9.5 5.5 12 3z"/></svg>`;
}

/** Inline map-pin marker shown before the location line. */
function pinIcon(): string {
  return `<svg class="meta-icon" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 21s7-5.686 7-11a7 7 0 1 0-14 0c0 5.314 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
}

/**
 * Keep only the first entry for each distinct URL (normalized). Profiles
 * commonly surface the same link twice: once as the dedicated `website`
 * field, again inside `externalAccounts` (e.g. when a "website" account is
 * marked primary). Without this, the sidebar would show that link twice.
 */
function dedupeByUrl<T extends { url: string } | null>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (!e || !e.url) return true;
    let key: string;
    try {
      key = new URL(e.url).toString();
    } catch {
      key = e.url;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Slug + filename stem for the activity ("Now") page. */
const ACTIVITY_SLUG = "now";

/** A single nav destination, shared by the masthead and mobile bottom nav. */
interface NavEntry {
  slug: string;
  title: string;
  /** Section id for the bottom-nav icon lookup (`navIcon`). */
  iconId: string;
  /** Pre-resolved href (hash in single-page mode, `.html` otherwise). */
  href: string;
  /**
   * SDK nav group this entry belongs to. Drives the desktop masthead grouping
   * (multi-section groups collapse into a dropdown). Undefined for entries
   * outside the section model (e.g. the "Now" activity entry), which stay flat.
   */
  group?: SectionGroupId;
}

/**
 * Validate + escape a caller-supplied "Now" nav href, returning an
 * attribute-safe (already HTML-escaped) value, or `null` if it's unsafe.
 *
 * An absolute `http(s)` URL is validated and escaped via {@link safeUrl}.
 * Otherwise the value is treated as a same-origin relative path (e.g.
 * `"/gui.do/now"`), which `safeUrl` rejects because `new URL()` needs an
 * absolute URL. For that case we reject any control characters and any scheme
 * -- a `:` that appears before the first `/` -- which blocks `javascript:`,
 * `data:`, etc., then HTML-escape so the value can't break out of the `href`
 * attribute. `#hash` and `now.html`-style relative paths pass through.
 */
function safeNavHref(href: string): string | null {
  const abs = safeUrl(href);
  if (abs) return abs;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(href)) return null;
  const slash = href.indexOf("/");
  const colon = href.indexOf(":");
  if (colon !== -1 && (slash === -1 || colon < slash)) return null;
  return escapeHtml(href);
}

/**
 * Resolve the optional activity-stream nav entry from the render context.
 * Returns `undefined` (no entry) unless `ctx.activityStream` is truthy, keeping
 * nav output byte-identical for builds without an activity page.
 */
function activityNavEntry(ctx?: RenderContext): NavEntry | undefined {
  const cfg = ctx?.activityStream;
  if (!cfg) return undefined;
  const label = typeof cfg === "object" && cfg.label ? cfg.label : "Now";
  // A caller can point "Now" at a real per-handle URL; when unset (or rejected
  // as unsafe) fall back to the self-hosted `now.html` so output stays
  // byte-identical to a build without a custom href.
  const customHref =
    typeof cfg === "object" && cfg.href ? safeNavHref(cfg.href) : null;
  // Always a real page link (never a single-page hash): the activity stream is
  // a separate route, not one of the in-document `.page-section` blocks.
  return {
    slug: ACTIVITY_SLUG,
    title: label,
    iconId: ACTIVITY_SLUG,
    href: customHref ?? `${ACTIVITY_SLUG}.html`,
  };
}

/**
 * Build the ordered nav entries: the profile sections, then the optional
 * activity ("Now") entry. Section hrefs follow the single-page/hash convention;
 * the activity entry always links to its own page.
 *
 * When `profileHomeHref` is set (already validated + HTML-escaped by
 * {@link safeNavHref}), the SECTION links instead point back at the single-page
 * profile home: the index/About section → `profileHomeHref`; every other
 * section with slug `S` → `profileHomeHref` + `#` + `S`. The slug is derived
 * from {@link sectionSlug} (only `[a-z0-9-]`), so the combined value stays
 * attribute-safe. The activity entry is untouched (it keeps its own href).
 */
function navEntries(
  sections: RenderedSection[],
  singlePage?: boolean,
  activity?: NavEntry,
  profileHomeHref?: string
): NavEntry[] {
  const base = sections.map<NavEntry>((s) => ({
    slug: s.slug,
    title: s.title,
    iconId: s.id,
    group: SECTION_ID_TO_GROUP.get(s.id),
    href: profileHomeHref
      ? s.slug === "index"
        ? profileHomeHref
        : `${profileHomeHref}#${s.slug}`
      : singlePage
      ? `#${s.slug}`
      : `${s.slug}.html`,
  }));
  return activity ? [...base, activity] : base;
}

/** A single top-nav anchor, with active state when it's the current page. */
function navLink(e: NavEntry, activeSlug: string): string {
  const active = e.slug === activeSlug;
  return `<a href="${e.href}"${
    active ? ' aria-current="page" class="active"' : ""
  }>${escapeHtml(e.title)}</a>`;
}

/**
 * A desktop dropdown for a group with 2+ sections: a focusable, non-link
 * trigger (the group heading) plus a submenu of the section links. Opens on
 * hover and `:focus-within` via CSS alone -- no JS, so the nav still works with
 * scripting disabled. The container carries `active` when the current page is
 * one of its sections, so the collapsed heading can highlight.
 */
function navGroup(
  group: SectionGroupId,
  run: NavEntry[],
  activeSlug: string
): string {
  const active = run.some((e) => e.slug === activeSlug);
  const items = run.map((e) => navLink(e, activeSlug)).join("");
  return (
    `<div class="nav-group${active ? " active" : ""}">` +
    `<button type="button" class="nav-group-label" aria-haspopup="true">${escapeHtml(
      GROUP_LABELS[group]
    )}</button>` +
    `<div class="nav-group-menu">${items}</div>` +
    `</div>`
  );
}

/**
 * The masthead nav: sections grouped by their SDK nav group. A group with a
 * single visible section renders as a flat top-level link (so Overview shows
 * just "About"); a group with 2+ sections collapses into a {@link navGroup}
 * dropdown. Entries without a group (the "Now" activity entry) stay flat. With
 * one section per group the output is the flat list this produced before.
 */
function navItems(entries: NavEntry[], activeSlug: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < entries.length) {
    const g = entries[i].group;
    if (g === undefined) {
      out.push(navLink(entries[i], activeSlug));
      i++;
      continue;
    }
    // Sections of a group are contiguous (ALL_SECTIONS is group-ordered), so
    // gather the run sharing this group id.
    const run: NavEntry[] = [];
    while (i < entries.length && entries[i].group === g) {
      run.push(entries[i]);
      i++;
    }
    out.push(
      run.length === 1 ? navLink(run[0], activeSlug) : navGroup(g, run, activeSlug)
    );
  }
  return out.join("\n");
}

// Slots on the mobile bottom bar. With more sections than this, the last slot
// becomes a "More" button that opens a sheet with the overflow.
const BOTTOM_NAV_SLOTS = 5;

/**
 * Mobile bottom navigation: an app-style fixed bar (icon + label per section,
 * hidden on desktop via CSS). When there are more sections than fit, the first
 * `BOTTOM_NAV_SLOTS - 1` show in the bar and the rest move into a "More" bottom
 * sheet. Icons come from `navIcon(section.id)`.
 */
function bottomNav(entries: NavEntry[], activeSlug: string): string {
  if (entries.length === 0) return "";
  const link = (e: NavEntry, cls: string) => {
    const active = e.slug === activeSlug;
    return (
      `<a class="${cls}${active ? " active" : ""}" href="${
        e.href
      }" data-slug="${escapeHtml(e.slug)}"` +
      `${active ? ' aria-current="page"' : ""}>${navIcon(
        e.iconId
      )}<span>${escapeHtml(e.title)}</span></a>`
    );
  };

  if (entries.length <= BOTTOM_NAV_SLOTS) {
    return `<nav class="bottom-nav" aria-label="Sections">${entries
      .map((s) => link(s, "bnav-item"))
      .join("")}</nav>`;
  }

  const primary = entries.slice(0, BOTTOM_NAV_SLOTS - 1);
  const overflow = entries.slice(BOTTOM_NAV_SLOTS - 1);
  const overflowActive = overflow.some((s) => s.slug === activeSlug);
  const bar =
    primary.map((s) => link(s, "bnav-item")).join("") +
    `<button type="button" class="bnav-item bnav-more${
      overflowActive ? " active" : ""
    }"` +
    ` aria-haspopup="dialog" aria-expanded="false" aria-controls="more-sheet">` +
    `${navIcon("more")}<span>More</span></button>`;
  const sheet =
    `<div class="more-sheet" id="more-sheet" hidden>` +
    `<div class="more-backdrop" data-more-close></div>` +
    `<div class="more-panel" role="dialog" aria-modal="true" aria-label="More sections">` +
    `<div class="more-head"><span>Sections</span>` +
    `<button type="button" class="more-close" aria-label="Close" data-more-close>${navIcon(
      "close"
    )}</button></div>` +
    `<div class="more-list">${overflow
      .map((s) => link(s, "more-item"))
      .join("")}</div>` +
    `</div></div>`;
  return `<nav class="bottom-nav" aria-label="Sections">${bar}</nav>${sheet}`;
}

// --- render: masthead (top nav) --------------------------------------------

function masthead(
  entries: NavEntry[],
  activeSlug: string,
  paths: Required<RenderPaths>
): string {
  return `<header class="masthead">
  <div class="masthead-inner">
    <nav class="top-nav">${navItems(
      entries,
      activeSlug
    )}\n    </nav>
    <div class="masthead-actions">
      <button id="theme-toggle" class="theme-toggle" aria-label="Toggle dark mode" type="button">${svgSun()}${svgMoon()}</button>
      <a class="sifa-logo" href="https://sifa.id" title="Built with Sifa" target="_blank" rel="noopener">
        <img class="brand-logo brand-logo-light" src="${
          paths.assetDir
        }/sifa-logo.svg" alt="Sifa" height="22">
        <img class="brand-logo brand-logo-dark" src="${
          paths.assetDir
        }/sifa-logo-dark.svg" alt="Sifa" height="22">
      </a>
    </div>
  </div>
</header>`;
}

// --- render: sidebar (identity + links) ------------------------------------

function sidebar(profile: AcademicProfile): string {
  const handle = profile.handle ?? "";
  const name = profile.displayName ?? handle ?? "Profile";

  const avatarSrc = safeUrl(profile.avatar);
  const avatar = avatarSrc
    ? `<img src="${avatarSrc}" alt="" class="avatar">`
    : `<div class="avatar avatar-placeholder">${escapeHtml(name).slice(
        0,
        1
      )}</div>`;

  const headline = profile.headline
    ? `<p class="meta-line">${escapeHtml(profile.headline)}</p>`
    : "";
  const loc = locationLine(profile);
  const locHtml = loc
    ? `<p class="meta-line meta-location">${pinIcon()}${escapeHtml(loc)}</p>`
    : "";

  const accounts = profile.externalAccounts ?? [];
  // The one link the owner marked primary in their profile's links section.
  const primaryAccount = accounts.find((a) => a?.primary);

  const rawLinks = dedupeByUrl([
    // 1. Primary link (if the owner marked one). Hoisted to the top; its later
    //    copy in `accounts` below is dropped by `dedupeByUrl`.
    primaryAccount
      ? {
          label: linkLabel(primaryAccount.label, primaryAccount.platform),
          platform: primaryAccount.platform ?? "",
          url: primaryAccount.url ?? "",
        }
      : null,
    // 2. Sifa ID -- every Sifa user has a canonical profile, so surface it
    //    unconditionally as the identity anchor (before any hand-added copy).
    handle
      ? {
          label: "Sifa ID",
          platform: "sifa",
          url: `https://sifa.id/p/${encodeURIComponent(handle)}`,
        }
      : null,
    // 3. Bluesky -- every Sifa identity is an AT Protocol/Bluesky account, so
    //    the handle is always their Bluesky handle. Listed before any Bluesky
    //    link the user also added by hand so `dedupeByUrl` keeps this one.
    handle
      ? {
          label: `@${handle}`,
          platform: "bluesky",
          url: `https://bsky.app/profile/${handle}`,
        }
      : null,
    // 4. Website, then the remaining external accounts in their existing order.
    profile.website
      ? { label: "Website", platform: "website", url: profile.website }
      : null,
    ...accounts.map((a) => ({
      label: linkLabel(a.label, a.platform),
      platform: a.platform ?? "",
      url: a.url ?? "",
    })),
  ])
    // Keep the raw url (for the differentiator line) alongside the escaped,
    // scheme-validated href.
    .map((e) => (e && e.url ? { ...e, href: safeUrl(e.url) } : null))
    .filter(
      (
        e
      ): e is { label: string; platform: string; url: string; href: string } =>
        Boolean(e && e.href)
    );

  // When several links share the same label (e.g. multiple Bluesky accounts,
  // all labelled "Bluesky"), show the URL underneath so visitors can tell them
  // apart. Unique-label links stay single-line.
  const labelCounts = new Map<string, number>();
  for (const e of rawLinks)
    labelCounts.set(e.label, (labelCounts.get(e.label) ?? 0) + 1);

  const linkEntries = rawLinks
    .map((e) => {
      const sub =
        (labelCounts.get(e.label) ?? 0) > 1
          ? `<span class="side-link-sub">${escapeHtml(
              displayUrl(e.url)
            )}</span>`
          : "";
      return `<a class="side-link" href="${
        e.href
      }" rel="me noopener" target="_blank">${linkIcon(
        e.platform
      )}<span class="side-link-text"><span class="side-link-label">${escapeHtml(
        e.label
      )}</span>${sub}</span></a>`;
    })
    .join("");
  const linksHtml = linkEntries
    ? `<div class="side-links">${linkEntries}</div>`
    : "";

  return `<aside class="sidebar">
  ${avatar}
  <h1 class="sidebar-name">${escapeHtml(name)}</h1>
  ${headline}
  ${locHtml}
  ${linksHtml}
</aside>`;
}

// --- render: layout ---------------------------------------------------------

function resolvePaths(paths?: RenderPaths): Required<RenderPaths> {
  return {
    css: paths?.css ?? "style.css",
    favicon: paths?.favicon ?? "assets/favicon.svg",
    assetDir: paths?.assetDir ?? "assets",
    fontDir: paths?.fontDir ?? "fonts",
  };
}

function ogTags(og?: OpenGraphMeta): string {
  if (!og) return "";
  const tags: string[] = [];
  if (og.title)
    tags.push(`<meta property="og:title" content="${escapeHtml(og.title)}">`);
  if (og.description)
    tags.push(
      `<meta property="og:description" content="${escapeHtml(og.description)}">`
    );
  if (og.url)
    tags.push(`<meta property="og:url" content="${escapeHtml(og.url)}">`);
  if (og.image)
    tags.push(`<meta property="og:image" content="${escapeHtml(og.image)}">`);
  if (og.siteName)
    tags.push(
      `<meta property="og:site_name" content="${escapeHtml(og.siteName)}">`
    );
  if (og.type)
    tags.push(`<meta property="og:type" content="${escapeHtml(og.type)}">`);
  // Twitter card equivalents
  if (og.title)
    tags.push(`<meta name="twitter:title" content="${escapeHtml(og.title)}">`);
  if (og.description)
    tags.push(
      `<meta name="twitter:description" content="${escapeHtml(
        og.description
      )}">`
    );
  if (og.image) {
    tags.push(`<meta name="twitter:image" content="${escapeHtml(og.image)}">`);
    tags.push(`<meta name="twitter:card" content="summary_large_image">`);
  }
  return tags.length ? "\n  " + tags.join("\n  ") : "";
}

/**
 * Validate a URL's scheme (http/https only) and return it RAW (unescaped),
 * for use in JSON contexts where JSON.stringify handles escaping. `safeUrl`
 * is the HTML-attribute variant (escaped).
 */
function rawSafeUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : null;
  } catch {
    return null;
  }
}

/**
 * Schema.org `Person` JSON-LD for the profile. Emitted in `<head>` so search
 * engines and agents get structured identity (name, url, image, links,
 * location). Values are user-authored, so `<` is escaped to `<` to
 * prevent a `</script>` breakout even though the block is not executable JS.
 */
function personJsonLd(profile: AcademicProfile, ctx?: RenderContext): string {
  const name = profile.displayName ?? profile.handle;
  if (!name) return "";

  const sameAs = [
    profile.website,
    ...(profile.externalAccounts ?? []).map((a) => a.url),
  ]
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .map((u) => rawSafeUrl(u))
    .filter((u): u is string => u !== null);

  const loc = locationLine(profile);
  const person: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
  };
  if (ctx?.canonical) person.url = ctx.canonical;
  if (profile.handle) person.alternateName = `@${profile.handle}`;
  const avatar = rawSafeUrl(profile.avatar);
  if (avatar) person.image = avatar;
  if (profile.headline) person.jobTitle = profile.headline;
  if (profile.about) person.description = profile.about;
  if (loc) person.address = { "@type": "PostalAddress", addressLocality: loc };
  if (sameAs.length) person.sameAs = Array.from(new Set(sameAs));

  const json = JSON.stringify(person).replace(/</g, "\\u003c");
  const nonceAttr = ctx?.nonce ? ` nonce="${escapeHtml(ctx.nonce)}"` : "";
  return `\n  <script type="application/ld+json"${nonceAttr}>${json}</script>`;
}

function layout(opts: {
  title: string;
  profile: AcademicProfile;
  sections: RenderedSection[];
  activeSlug: string;
  main: string;
  ctx?: RenderContext;
}): string {
  const { title, profile, sections, activeSlug, main, ctx } = opts;
  const paths = resolvePaths(ctx?.paths);
  const handle = profile.handle ?? "";
  const name = profile.displayName ?? handle ?? "Profile";
  const year = ctx?.year ?? "";
  const updated = ctx?.updated ?? "";
  const nonceAttr = ctx?.nonce ? ` nonce="${escapeHtml(ctx.nonce)}"` : "";
  // Validate + escape the optional single-page home href the same way as the
  // "Now" href; a rejected (unsafe) value falls back to the default section
  // links, keeping output byte-identical to a build without it.
  const profileHomeHref = ctx?.profileHomeHref
    ? (safeNavHref(ctx.profileHomeHref) ?? undefined)
    : undefined;
  const entries = navEntries(
    sections,
    ctx?.singlePage,
    activityNavEntry(ctx),
    profileHomeHref
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>${
    ctx?.og?.description
      ? `\n  <meta name="description" content="${escapeHtml(
          ctx.og.description
        )}">`
      : ""
  }${
    ctx?.canonical
      ? `\n  <link rel="canonical" href="${escapeHtml(ctx.canonical)}">`
      : ""
  }
  <link rel="icon" href="${paths.favicon}" type="image/svg+xml">
  <link rel="preconnect" href="https://cdn.bsky.app">
  <link rel="stylesheet" href="${paths.css}">${ogTags(ctx?.og)}${personJsonLd(
    profile,
    ctx
  )}
  <script${nonceAttr}>(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();</script>
</head>
<body>
  ${masthead(entries, activeSlug, paths)}
  <div class="shell">
    ${sidebar(profile)}
    <main class="main">
${main}
    </main>
  </div>
  <footer class="site-footer">
    <div class="footer-left">
      <div class="footer-brand">
        <img class="brand-logo brand-logo-light" src="${
          paths.assetDir
        }/sifa-logo.svg" alt="Sifa" height="20">
        <img class="brand-logo brand-logo-dark" src="${
          paths.assetDir
        }/sifa-logo-dark.svg" alt="Sifa" height="20">
      </div>
      <div class="footer-meta">
        ${year ? `<span>&copy; ${year} ${escapeHtml(name)}</span>` : ""}
        ${
          updated
            ? `<span class="footer-updated">Site last updated ${escapeHtml(
                updated
              )}</span>`
            : ""
        }
      </div>
    </div>
    <div class="footer-links">
      <a href="https://sifa.id/p/${encodeURIComponent(
        handle
      )}">View ${escapeHtml(name)}'s full Sifa ID</a>
      <a href="https://sifa.id">Start your own website for free</a>
      <a href="https://github.com/singi-labs/sifa-page">Self-host your own Sifa ID-driven page like this</a>
    </div>
  </footer>
  ${bottomNav(entries, activeSlug)}
  <script${nonceAttr}>document.getElementById('theme-toggle').addEventListener('click',function(){var t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;try{localStorage.setItem('theme',t);}catch(e){}});</script>${
    entries.length > BOTTOM_NAV_SLOTS ? bottomNavScript(nonceAttr) : ""
  }${ctx?.singlePage ? singlePageScript(nonceAttr) : ""}
</body>
</html>
`;
}

// Open/close the mobile "More" bottom sheet. Included on every page (the sheet
// exists in both single-page and multi-page output whenever there's overflow).
function bottomNavScript(nonceAttr = ""): string {
  return `
  <script${nonceAttr}>(function(){
    var sheet=document.getElementById('more-sheet');if(!sheet)return;
    var moreBtn=document.querySelector('.bnav-more');
    function setOpen(o){sheet.hidden=!o;document.body.classList.toggle('more-open',o);if(moreBtn){moreBtn.setAttribute('aria-expanded',o?'true':'false');}}
    if(moreBtn){moreBtn.addEventListener('click',function(){setOpen(sheet.hidden);});}
    sheet.querySelectorAll('[data-more-close]').forEach(function(el){el.addEventListener('click',function(){setOpen(false);});});
    sheet.querySelectorAll('.more-item').forEach(function(a){a.addEventListener('click',function(){setOpen(false);});});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!sheet.hidden){setOpen(false);}});
  })();</script>`;
}

function singlePageScript(nonceAttr = ""): string {
  return `
  <script${nonceAttr}>(function(){
    function mark(a,isActive){a.classList.toggle('active',isActive);if(isActive){a.setAttribute('aria-current','page');}else{a.removeAttribute('aria-current');}}
    function activate(slug){
      document.querySelectorAll('.page-section').forEach(function(el){el.hidden=el.id!==slug;});
      document.querySelectorAll('.top-nav a').forEach(function(a){mark(a,a.getAttribute('href')==='#'+slug);});
      // Highlight the collapsed group heading when its section is active.
      document.querySelectorAll('.top-nav .nav-group').forEach(function(g){g.classList.toggle('active',!!g.querySelector('a[href="#'+slug+'"]'));});
      // Sync the mobile bottom nav + "More" sheet.
      var inSheet=false;
      document.querySelectorAll('.bnav-item[data-slug],.more-item[data-slug]').forEach(function(a){
        var isActive=a.getAttribute('data-slug')===slug;mark(a,isActive);
        if(isActive&&a.classList.contains('more-item')){inSheet=true;}
      });
      var moreBtn=document.querySelector('.bnav-more');if(moreBtn){moreBtn.classList.toggle('active',inSheet);}
    }
    function fromHash(){activate(location.hash.replace('#','')||'index');}
    window.addEventListener('hashchange',fromHash);
    fromHash();
  })();</script>`;
}

// --- render: pages ----------------------------------------------------------

/** Render the home/about page (multi-page mode). */
export function renderHome(
  profile: AcademicProfile,
  sections: RenderedSection[],
  ctx?: RenderContext
): string {
  const about = sections.find((s) => s.slug === "index");
  const aboutHtml = about ? about.html : "<p>No bio yet.</p>";
  const main = `
    <h2 class="page-title">About</h2>
    <div class="prose">${aboutHtml}</div>
  `;
  return layout({
    title: profile.displayName ?? profile.handle ?? "Profile",
    profile,
    sections,
    activeSlug: "index",
    main,
    ctx,
  });
}

/** Render a single section page (Career, Education, etc.) in multi-page mode. */
export function renderSectionPage(
  profile: AcademicProfile,
  section: RenderedSection,
  sections: RenderedSection[],
  ctx?: RenderContext
): string {
  const main = `
    <h2 class="page-title">${escapeHtml(section.title)}</h2>
    <div class="prose">${section.html}</div>
  `;
  return layout({
    title: `${section.title} - ${
      profile.displayName ?? profile.handle ?? "Profile"
    }`,
    profile,
    sections,
    activeSlug: section.slug,
    main,
    ctx,
  });
}

/**
 * Render all sections as one HTML document with JS-based section switching.
 * Used by server-rendered contexts (e.g. sifa-web) that serve a single route
 * instead of a multi-page static site.
 */
export function renderSinglePage(
  profile: AcademicProfile,
  sections: RenderedSection[],
  ctx?: RenderContext
): string {
  const about = sections.find((s) => s.slug === "index");
  const others = sections.filter((s) => s.slug !== "index");
  const aboutHtml = about ? about.html : "<p>No bio yet.</p>";

  const sectionHtml = (
    id: string,
    title: string,
    body: string,
    active: boolean
  ) => `
    <section id="${id}" class="page-section"${active ? "" : " hidden"}>
      <h2 class="page-title">${escapeHtml(title)}</h2>
      <div class="prose">${body}</div>
    </section>`;

  const main = [
    sectionHtml("index", "About", aboutHtml, true),
    ...others.map((s) => sectionHtml(s.slug, s.title, s.html, false)),
  ].join("\n");

  return layout({
    title: profile.displayName ?? profile.handle ?? "Profile",
    profile,
    sections,
    activeSlug: "index",
    main,
    ctx: { ...ctx, singlePage: true },
  });
}

/**
 * Render the activity ("Now") page: the same masthead + sidebar + footer layout
 * as the section pages, with the activity stream as its main content. The stream
 * itself is produced by {@link renderActivityStream} (see `./activity.ts`), so
 * page.sifa.id and sifa-web render the same view-model.
 *
 * The activity nav entry is shown active on this page and injected across the
 * whole nav: it forces `ctx.activityStream` on (defaulting to the "Now" label)
 * so the masthead + bottom nav always surface the link, even if the caller
 * didn't set the flag. `streamOptions` is forwarded verbatim to
 * {@link renderActivityStream} (blob URLs, permalinks, grouping, empty text).
 */
export function renderActivityPage(
  profile: AcademicProfile,
  sections: RenderedSection[],
  vms: StreamCardVM[],
  ctx?: RenderContext,
  streamOptions?: ActivityStreamOptions,
  heatmap?: HeatmapDataInput | null
): string {
  const cfg = ctx?.activityStream;
  const label = typeof cfg === "object" && cfg.label ? cfg.label : "Now";
  const main = `
    <h2 class="page-title">${escapeHtml(label)}</h2>
${renderHeatmap(heatmap)}
${renderActivityStream(vms, streamOptions)}
  `;
  return layout({
    title: `${label} - ${profile.displayName ?? profile.handle ?? "Profile"}`,
    profile,
    sections,
    activeSlug: ACTIVITY_SLUG,
    // Ensure the "Now" nav entry appears on its own page even when the caller
    // didn't set the flag; preserve a custom label/config if they did.
    ctx: { ...ctx, activityStream: cfg ?? true },
    main,
  });
}

function svgSun(): string {
  return '<svg class="icon-sun" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.7"/><g stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4"/></g></svg>';
}

function svgMoon(): string {
  return '<svg class="icon-moon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z"/></svg>';
}

// --- re-exports (public API surface) ----------------------------------------

export { buildProfileSections, type RenderedSection } from "./sections.js";
export {
  parseSections,
  sectionSlug,
  isSidebarOnly,
  type ParsedSection,
} from "./slug.js";
export {
  renderActivityStream,
  type ActivityStreamOptions,
} from "./activity.js";
export {
  renderHeatmap,
  countToLevel,
  type HeatmapDataInput,
  type HeatmapDayInput,
  type RenderHeatmapOptions,
} from "./heatmap.js";
