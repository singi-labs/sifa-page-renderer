/**
 * Pure string-HTML renderer for a Sifa activity stream.
 *
 * Consumes the SAME `StreamCardVM` the sifa-web activity cards render (produced
 * by the SDK's `toStreamCardVM`), so page.sifa.id and sifa-web stay in lockstep
 * without sharing a DOM: the shared artifact is the normalized view-model, not
 * the component tree. See the design doc
 * `decisions/2026-07-17-shared-activity-stream-view-model.md`.
 *
 * Framework-free at runtime: only the VM *types* are imported for typing. The
 * few runtime helpers used (`formatRelativeTime`, `isValidRgbColor`,
 * `rgbToString`) are pure SDK utilities, not a framework. All user-controlled
 * strings are escaped via `escapeHtml` and every URL is scheme-validated via
 * `safeUrl`, exactly as the profile renderer does (`./util.js`).
 */

import type {
  StreamCardVM,
  StreamCardBody,
  StreamCardSubject,
  StreamExternalLink,
  StreamMedia,
  StreamTheme,
} from "@singi-labs/sifa-sdk";
import { formatRelativeTime, isValidRgbColor, rgbToString } from "@singi-labs/sifa-sdk";
import { escapeHtml, safeUrl } from "./util.js";
import { pillGlyph } from "./app-icons.js";

/** Default CDN base for the blob-URL builder. Matches the profile renderer's
 *  `<link rel="preconnect" href="https://cdn.bsky.app">`. */
const DEFAULT_CDN_BASE = "https://cdn.bsky.app";

/** One day in milliseconds, for the "Yesterday" boundary. */
const DAY_MS = 86_400_000;

/**
 * Body kinds that carry structured, app-specific data and get a bespoke rich
 * layout (mirroring the sifa-web `/activity` cards). For these, the generic
 * `media` / `externalLink` chrome is suppressed — the rich renderer owns the
 * whole content area (including any cover image).
 */
const RICH_KINDS: ReadonlySet<StreamCardBody["kind"]> = new Set([
  "github-pr",
  "book",
  "media-review",
  "event-rsvp",
  "verification",
  "membership",
  "location",
  "travel",
  "standard-site",
]);

/** Narrow the {@link StreamCardBody} union to a single `kind`. */
type BodyOf<K extends StreamCardBody["kind"]> = Extract<StreamCardBody, { kind: K }>;

/** Options for {@link renderActivityStream}. */
export interface ActivityStreamOptions {
  /**
   * Build an image URL from a blob's `did` + `cid`. The VM stays host-agnostic
   * (media may arrive as a raw blob ref), so the host decides the CDN. When
   * omitted, a default Bluesky-style URL is built from {@link cdnBase}:
   * `{cdnBase}/img/feed_fullsize/plain/{did}/{cid}@jpeg`. Return `null` to skip
   * an image. The result is still scheme-validated + HTML-escaped before use.
   */
  blobUrl?: (did: string, cid: string) => string | null | undefined;
  /** CDN base for the default blob-URL builder. Default: `https://cdn.bsky.app`. */
  cdnBase?: string;
  /**
   * Turn a VM into a per-item permalink (the VM's `uri` is an `at://` URI, not a
   * web URL). When it returns an http(s) URL the card title links to it;
   * otherwise the title is plain text. Default: no permalink (deferred — see the
   * design doc). The result is scheme-validated + HTML-escaped.
   */
  permalink?: (vm: StreamCardVM) => string | null | undefined;
  /** Group items under Today / Yesterday / date headers (UTC). Default: `true`. */
  groupByDay?: boolean;
  /** Reference "now" for relative times + day grouping. Default: `new Date()`. */
  now?: Date;
  /** Text shown when the stream is empty. Default: `"No activity yet."`. */
  emptyText?: string;
}

/** Internal render context, threaded through the card renderers. */
interface StreamRenderCtx {
  resolveBlob: (did: string, cid: string) => string | null | undefined;
  permalink?: (vm: StreamCardVM) => string | null | undefined;
}

/**
 * Render an activity stream to an HTML fragment (a `<section>`), ready to embed
 * in a page. `vms` are assumed pre-filtered + newest-first (the AppView emits a
 * visible, sorted snapshot); grouping preserves the given order.
 */
export function renderActivityStream(
  vms: StreamCardVM[],
  options: ActivityStreamOptions = {}
): string {
  const cdnBase = options.cdnBase ?? DEFAULT_CDN_BASE;
  const resolveBlob =
    options.blobUrl ?? ((did, cid) => defaultBlobUrl(cdnBase, did, cid));
  const ctx: StreamRenderCtx = { resolveBlob, permalink: options.permalink };

  if (vms.length === 0) {
    const empty = escapeHtml(options.emptyText ?? "No activity yet.");
    return `<section class="activity-stream"><p class="stream-empty">${empty}</p></section>`;
  }

  const groupByDay = options.groupByDay ?? true;
  const now = options.now ?? new Date();

  const inner = groupByDay
    ? groupItemsByDay(vms, now)
        .map(
          (g) =>
            `<div class="stream-day"><h3 class="stream-day-label">${escapeHtml(
              g.label
            )}</h3>${g.items.map((i) => renderCard(i, ctx, 0)).join("")}</div>`
        )
        .join("")
    : vms.map((i) => renderCard(i, ctx, 0)).join("");

  return `<section class="activity-stream">${inner}</section>`;
}

// --- card ------------------------------------------------------------------

function renderCard(
  item: StreamCardVM,
  ctx: StreamRenderCtx,
  depth: number
): string {
  const styleAttr = themeStyle(item.theme);
  // The source pill carries the category glyph + app name; there is no separate
  // top-left icon (it would just duplicate the pill glyph while no brand logos
  // ship). The slot returns for real brand logos later.
  const source = `<span class="stream-source" data-color="${escapeHtml(
    item.source.color
  )}"><span class="stream-source-glyph" aria-hidden="true">${pillGlyph(
    item.source.appId
  )}</span>${escapeHtml(item.source.label)}</span>`;
  const time = `<time class="stream-time" datetime="${escapeHtml(
    item.timestamp
  )}">${escapeHtml(formatRelativeTime(item.timestamp))}</time>`;
  // The verb/action is metadata, not content: it lives in the meta row next to
  // the source pill + time, styled apart from the post body. A trailing
  // "View on {source}" link (when the VM carries a `sourceUrl`) opens the record
  // on its origin app in a new tab.
  const head = `<div class="stream-head">${source}${renderVerb(
    item,
    ctx
  )}${time}</div>`;
  const isRich = item.body ? RICH_KINDS.has(item.body.kind) : false;
  const body = renderBody(item, ctx);
  // Rich variants render their own cover/link inside the body; suppress the
  // generic chrome so we don't double-render an image or link.
  const media = isRich ? "" : renderMedia(item.media, ctx.resolveBlob);
  const link = isRich ? "" : renderExternalLink(item.externalLink);
  // Depth-limit the nested repost/reply target so a cyclic `subject` cannot
  // recurse forever; one level of nesting is enough for the personal-site view.
  const subject = depth < 1 ? renderSubject(item.subject, ctx, depth, item.verb) : "";
  // Only nested subject cards (the quoted / reposted / replied-to original)
  // show an author row: whose post is embedded. Top-level cards are the profile
  // owner's own activity, so their author is shown elsewhere on the page.
  const author = depth > 0 ? renderAuthor(item.author) : "";

  return `<article class="stream-card" data-uri="${escapeHtml(
    item.uri
  )}"${styleAttr}>${renderCardLink(item)}${author}${head}${body}${media}${link}${subject}</article>`;
}

/**
 * The meta-row verb: a per-variant action phrase (e.g. "Reviewed a TV show",
 * "Merged a pull request"), falling back to the SDK's verb-aware `title` when a
 * variant has no better phrasing. Linked to the item permalink when supplied.
 */
function renderVerb(item: StreamCardVM, ctx: StreamRenderCtx): string {
  const text = escapeHtml(cardVerb(item));
  const href = ctx.permalink ? safeUrl(ctx.permalink(item) ?? null) : null;
  return href
    ? `<a class="stream-verb stream-verb-link" href="${href}">${text}</a>`
    : `<span class="stream-verb">${text}</span>`;
}

/**
 * A stretched overlay link making the whole card clickable to the record on its
 * origin app (rendered only when the VM carries a scheme-valid `sourceUrl`).
 * Positioned `inset:0` via CSS; the card's other interactive elements (the
 * embedded reply/repost subject, external links) sit above it with a higher
 * z-index so they stay independently clickable. Opens in a new tab. `sourceUrl`
 * is scheme-validated + escaped; the aria-label text is HTML-escaped.
 */
function renderCardLink(item: StreamCardVM): string {
  const href = safeUrl(item.sourceUrl ?? null);
  if (!href) return "";
  const label = escapeHtml(`View on ${item.source.label}`);
  return `<a class="stream-card-link" href="${href}" target="_blank" rel="noopener" aria-label="${label}"></a>`;
}

/**
 * Compute the plain-text verb phrase for a card. Returns raw text; the caller
 * escapes it. Reads like the corresponding sifa-web card's header.
 */
function cardVerb(item: StreamCardVM): string {
  const body = item.body;
  if (!body) return item.title;
  switch (body.kind) {
    case "media-review":
      return mediaReviewVerb(body);
    case "book":
      return body.review && body.review.trim() ? "Reviewed a book" : item.title;
    case "github-pr":
      return body.mergedAt ? "Merged a pull request" : "Opened a pull request";
    case "event-rsvp":
      return rsvpVerb(body.rsvpStatus, item.title);
    case "verification":
      return `Verified ${platformLabel(body.platform)}`;
    case "membership":
      return body.communityName ? `Joined ${body.communityName}` : "Joined a community";
    default:
      return item.title;
  }
}

/** Humanized noun phrase for a creative-work type, used inside the verb. */
const MEDIA_TYPE_PHRASES: Record<string, string> = {
  movie: "movie",
  tv_show: "TV show",
  book: "book",
  video_game: "game",
  music: "music",
  album: "album",
};

/** Display label for a creative-work type (media pill in the rich body). */
const MEDIA_TYPE_LABELS: Record<string, string> = {
  movie: "Movie",
  tv_show: "TV Show",
  book: "Book",
  video_game: "Game",
  music: "Music",
  album: "Album",
};

function mediaTypePhrase(mediaType: string | undefined): string | null {
  if (!mediaType) return null;
  return MEDIA_TYPE_PHRASES[mediaType] ?? mediaType.replace(/_/g, " ").toLowerCase();
}

function mediaReviewVerb(body: BodyOf<"media-review">): string {
  const action =
    body.reviewKind === "review"
      ? "Reviewed"
      : body.reviewKind === "note"
        ? "Noted on"
        : "Posted about";
  const phrase = mediaTypePhrase(body.mediaType);
  return phrase ? `${action} a ${phrase}` : action;
}

function rsvpVerb(status: BodyOf<"event-rsvp">["rsvpStatus"], fallback: string): string {
  switch (status) {
    case "going":
      return "Going to an event";
    case "interested":
      return "Interested in an event";
    case "notgoing":
      return "Not going to an event";
    default:
      return fallback;
  }
}

/** Verification platform display labels (keytrace claim types + `bluesky`). */
const PLATFORM_LABELS: Record<string, string> = {
  dns: "Domain",
  github: "GitHub",
  linkedin: "LinkedIn",
  tangled: "Tangled",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  twitter: "Twitter/X",
  website: "Website",
};

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

/**
 * Per-item theme as inline CSS custom properties. Gated behind
 * {@link isValidRgbColor} so only integer 0-255 channels reach the output —
 * `rgbToString` then emits `rgb(r, g, b)`, which is digits/commas only and
 * cannot break out of the attribute.
 */
function themeStyle(theme: StreamTheme | undefined): string {
  if (!theme) return "";
  if (
    !isValidRgbColor(theme.background) ||
    !isValidRgbColor(theme.foreground) ||
    !isValidRgbColor(theme.accent)
  ) {
    return "";
  }
  return ` style="--stream-card-bg:${rgbToString(
    theme.background
  )};--stream-card-fg:${rgbToString(theme.foreground)};--stream-accent:${rgbToString(
    theme.accent
  )};"`;
}

// --- body (discriminated union) --------------------------------------------

function renderBody(item: StreamCardVM, ctx: StreamRenderCtx): string {
  const body = item.body;
  if (!body) return "";
  switch (body.kind) {
    case "text":
      return body.text ? paragraph(body.text) : "";
    case "track": {
      const line = [body.trackTitle, body.artist]
        .filter((s): s is string => Boolean(s))
        .map(escapeHtml)
        .join(" &middot; ");
      const track = line ? `<p class="stream-track">${line}</p>` : "";
      return track + (body.text ? paragraph(body.text) : "");
    }
    case "media":
    case "link":
    case "generic":
      return body.text ? paragraph(body.text) : "";
    case "github-pr":
      return renderGithubPr(body);
    case "book":
      return renderBook(body, item, ctx);
    case "media-review":
      return renderMediaReview(body, item, ctx);
    case "event-rsvp":
      return renderEventRsvp(body);
    case "verification":
      return renderVerification(body);
    case "membership":
      return renderMembership(body);
    case "location":
      return renderLocation(body);
    case "travel":
      return renderTravel(body);
    case "standard-site":
      return renderStandardSite(body);
    default:
      // Unknown / future body variant: degrade to a generic text fallback
      // rather than hard-fail.
      return fallbackText(body);
  }
}

/** Text rendering for an unrecognized future body kind. */
function fallbackText(body: StreamCardBody): string {
  const text = (body as { text?: string }).text;
  return text ? paragraph(text) : "";
}

function paragraph(text: string): string {
  return `<p class="stream-text">${nl2br(text)}</p>`;
}

// --- rich body variants ----------------------------------------------------

/** Wrap a rich variant's content, with an optional leading cover figure. */
function richWrap(kind: StreamCardBody["kind"], cover: string, inner: string): string {
  if (!cover && !inner) return "";
  return `<div class="stream-rich stream-rich-${kind}">${cover}<div class="stream-rich-main">${inner}</div></div>`;
}

/** Cover image from the first resolved/blob media item, as a small poster. */
function coverFromMedia(
  item: StreamCardVM,
  resolveBlob: (did: string, cid: string) => string | null | undefined
): string {
  const m = item.media?.[0];
  if (!m) return "";
  const raw = "url" in m ? m.url : resolveBlob(m.did, m.cid);
  const src = safeUrl(raw ?? null);
  if (!src) return "";
  return `<figure class="stream-cover"><img src="${src}" alt="${escapeHtml(
    m.alt
  )}" loading="lazy" decoding="async"></figure>`;
}

/** A muted rich-body paragraph (reviews, descriptions, shouts). */
function richText(text: string): string {
  return `<p class="stream-rich-text">${nl2br(text)}</p>`;
}

/** A bold rich-body title line. */
function richTitle(text: string): string {
  return `<p class="stream-rich-title">${escapeHtml(text)}</p>`;
}

/** A muted rich-body meta line. */
function richMeta(text: string): string {
  return `<p class="stream-rich-meta">${escapeHtml(text)}</p>`;
}

/** A small inline pill/badge. */
function badge(text: string, extra = ""): string {
  const cls = extra ? `stream-badge ${extra}` : "stream-badge";
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

/**
 * Render a 1-10 rating as five stars (half-step rounded) plus the numeric
 * value, matching BookHive/Popfeed's own display.
 */
function stars(rating: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(rating / 2)));
  const glyphs = "★".repeat(filled) + "☆".repeat(5 - filled);
  return `<span class="stream-stars" aria-label="${escapeHtml(rating)} out of 10"><span class="stream-stars-glyph" aria-hidden="true">${glyphs}</span><span class="stream-rating">${escapeHtml(
    rating
  )}/10</span></span>`;
}

/** GitHub language color dots (subset), mirroring the sifa-web card. */
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  Ruby: "#701516",
  "C++": "#f34b7d",
  C: "#555555",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  PHP: "#4F5D95",
  "C#": "#178600",
  Nix: "#7e7eff",
  Shell: "#89e051",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Dart: "#00B4AB",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
};

function renderGithubPr(body: BodyOf<"github-pr">): string {
  const repo = `${body.repoOwner}/${body.repoName}`;
  const header = `<p class="stream-rich-meta"><span class="stream-repo">${escapeHtml(
    repo
  )}</span> <span class="stream-pr-num">#${escapeHtml(body.prNumber)}</span></p>`;
  const title = richTitle(body.title);
  const stats: string[] = [];
  if (body.language) {
    // Color comes from a fixed constant map (never user data); the language
    // name itself is escaped.
    const color = LANGUAGE_COLORS[body.language] ?? "#858585";
    stats.push(
      `<span class="stream-lang"><span class="stream-lang-dot" style="--lang-dot:${color}"></span>${escapeHtml(
        body.language
      )}</span>`
    );
  }
  if (body.additions > 0 || body.deletions > 0) {
    stats.push(
      `<span class="stream-diff-add">+${escapeHtml(body.additions)}</span><span class="stream-diff-del">-${escapeHtml(
        body.deletions
      )}</span>`
    );
  }
  const statsRow = stats.length ? `<p class="stream-rich-stats">${stats.join("")}</p>` : "";
  return richWrap("github-pr", "", header + title + statsRow);
}

/** BookHive reading-status labels (raw lexicon NSIDs). */
const BOOK_STATUS_LABELS: Record<string, string> = {
  "buzz.bookhive.defs#finished": "Finished",
  "buzz.bookhive.defs#reading": "Reading",
  "buzz.bookhive.defs#wantToRead": "Want to read",
  "buzz.bookhive.defs#abandoned": "Abandoned",
};

function renderBook(
  body: BodyOf<"book">,
  item: StreamCardVM,
  ctx: StreamRenderCtx
): string {
  const cover = coverFromMedia(item, ctx.resolveBlob);
  const parts: string[] = [richTitle(body.title)];
  const authors = body.authors.filter((a) => a && a.trim());
  if (authors.length) parts.push(richMeta(authors.join(", ")));
  if (typeof body.stars === "number" && body.stars > 0) parts.push(stars(body.stars));
  const statusLabel = body.status ? BOOK_STATUS_LABELS[body.status] : undefined;
  if (statusLabel) parts.push(badge(statusLabel));
  if (body.review && body.review.trim()) parts.push(richText(body.review));
  return richWrap("book", cover, parts.join(""));
}

function renderMediaReview(
  body: BodyOf<"media-review">,
  item: StreamCardVM,
  ctx: StreamRenderCtx
): string {
  const cover = coverFromMedia(item, ctx.resolveBlob);
  const parts: string[] = [];
  if (body.isRevisit) parts.push(badge("Revisit"));
  if (body.title) parts.push(richTitle(body.title));
  if (body.mainCredit) parts.push(richMeta(body.mainCredit));
  if (typeof body.rating === "number") parts.push(stars(body.rating));
  const mediaLabel = body.mediaType
    ? (MEDIA_TYPE_LABELS[body.mediaType] ?? body.mediaType)
    : null;
  if (mediaLabel) parts.push(badge(mediaLabel, "stream-badge-quiet"));
  if (body.reviewText && body.reviewText.trim()) parts.push(richText(body.reviewText));
  return richWrap("media-review", cover, parts.join(""));
}

/** Event RSVP mode labels (normalized enum values). */
const RSVP_MODE_LABELS: Record<string, string> = {
  inperson: "In-person",
  virtual: "Virtual",
  hybrid: "Hybrid",
};

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Short month/day range, UTC (deterministic for server rendering). */
function eventDateRange(startsAt?: string, endsAt?: string): string | null {
  if (!startsAt) return null;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const sM = MONTH_ABBR[start.getUTCMonth()];
  const sD = start.getUTCDate();
  if (!endsAt) return `${sM} ${sD}`;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${sM} ${sD}`;
  const eM = MONTH_ABBR[end.getUTCMonth()];
  const eD = end.getUTCDate();
  if (sM === eM) return sD === eD ? `${sM} ${sD}` : `${sM} ${sD}-${eD}`;
  return `${sM} ${sD} - ${eM} ${eD}`;
}

function renderEventRsvp(body: BodyOf<"event-rsvp">): string {
  const parts: string[] = [];
  const nameRow: string[] = [`<span class="stream-rich-title-text">${escapeHtml(
    body.eventName ?? "Event"
  )}</span>`];
  if (body.mode) {
    const modeLabel = RSVP_MODE_LABELS[body.mode];
    if (modeLabel) nameRow.push(badge(modeLabel, "stream-badge-quiet"));
  }
  parts.push(`<p class="stream-rich-title">${nameRow.join(" ")}</p>`);
  const range = eventDateRange(body.startsAt, body.endsAt);
  if (range) parts.push(richMeta(range));
  const loc = [body.locationName, body.locationLocality, body.locationCountry]
    .filter((s): s is string => Boolean(s))
    .join(", ");
  if (loc) parts.push(richMeta(loc));
  return richWrap("event-rsvp", "", parts.join(""));
}

function renderVerification(body: BodyOf<"verification">): string {
  const subjectText = body.handle
    ? `${body.subjectLabel ? `${escapeHtml(body.subjectLabel)} ` : ""}@${escapeHtml(
        body.handle
      )}`
    : escapeHtml(body.subjectLabel ?? platformLabel(body.platform));
  const href = safeUrl(body.profileUrl ?? null);
  const subject = href
    ? `<a class="stream-rich-title stream-rich-link" href="${href}" target="_blank" rel="noopener">${subjectText}</a>`
    : `<p class="stream-rich-title">${subjectText}</p>`;
  const check = body.verified ? badge("Verified", "stream-badge-verified") : "";
  return richWrap("verification", "", subject + check);
}

function renderMembership(body: BodyOf<"membership">): string {
  // The community name is already in the meta-row verb ("Joined X"); the body
  // carries the description. (The web card also shows a community picture, but
  // the view-model does not carry it — see the report.)
  const desc = body.description && body.description.trim() ? richText(body.description) : "";
  return richWrap("membership", "", desc);
}

/** Address display: locality, region, country (matches beaconbits card). */
function formatAddress(address: BodyOf<"location">["address"]): string | null {
  if (!address) return null;
  const parts = [address.locality, address.region, address.country].filter(
    (p): p is string => Boolean(p && p.trim())
  );
  return parts.length ? parts.join(", ") : null;
}

/** Geo coordinate display, 4 decimal places. */
function formatGeo(geo: BodyOf<"location">["geo"]): string | null {
  if (!geo) return null;
  const { latitude, longitude } = geo;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

function renderLocation(body: BodyOf<"location">): string {
  const parts: string[] = [];
  if (body.venueName) parts.push(richTitle(body.venueName));
  if (body.shout) parts.push(richText(body.shout));
  const locText = formatAddress(body.address) ?? formatGeo(body.geo);
  if (locText) parts.push(richMeta(locText));
  return richWrap("location", "", parts.join(""));
}

/** Travel transportation labels (normalized to lowercase enum values). */
const TRANSPORTATION_LABELS: Record<string, string> = {
  flight: "Flight",
  train: "Train",
  bus: "Bus",
  ferry: "Ferry",
  car: "Car",
  bike: "Bike",
  walk: "Walk",
};

function transportationLabel(raw: string | undefined): string {
  if (!raw) return "Trip";
  const key = raw.toLowerCase();
  return TRANSPORTATION_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

function travelDateRange(start?: string, end?: string): string | null {
  if (!start && !end) return null;
  if (start && !end) return start;
  if (!start && end) return end;
  if (start === end) return start as string;
  return `${start} – ${end}`;
}

function renderTravel(body: BodyOf<"travel">): string {
  const label = transportationLabel(body.transportation);
  const route =
    body.origin && body.destination
      ? `${escapeHtml(body.origin)} → ${escapeHtml(body.destination)}`
      : escapeHtml(body.origin || body.destination || label);
  const parts: string[] = [`<p class="stream-rich-title">${route}</p>`];
  const carrier = body.carrier || body.carrierCode;
  const meta = carrier ? `${label} · ${carrier}` : label;
  parts.push(richMeta(meta));
  const range = travelDateRange(body.startDate, body.endDate);
  if (range) parts.push(richMeta(range));
  return richWrap("travel", "", parts.join(""));
}

/** Long-form date (e.g. "July 10, 2026"), UTC. Reuses the day-header format. */
function longDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return ABSOLUTE_DATE_FMT.format(d);
}

/** Join a base URL and path into a canonical document URL. */
function joinPath(base: string, path: string | undefined): string {
  const noTrail = base.endsWith("/") ? base.slice(0, -1) : base;
  if (!path) return noTrail;
  const lead = path.startsWith("/") ? path : `/${path}`;
  return `${noTrail}${lead}`;
}

function renderStandardSite(body: BodyOf<"standard-site">): string {
  const coverSrc = safeUrl(body.coverImageUrl ?? null);
  const cover = coverSrc
    ? `<figure class="stream-cover stream-cover-wide"><img src="${coverSrc}" alt="" loading="lazy" decoding="async"></figure>`
    : "";
  const parts: string[] = [];
  if (body.title) parts.push(richTitle(body.title));
  if (body.description) parts.push(richText(body.description));

  const metaBits: string[] = [];
  const published = longDate(body.publishedAt);
  if (published) metaBits.push(escapeHtml(published));
  if (typeof body.readingTime === "number" && body.readingTime >= 1) {
    metaBits.push(`${escapeHtml(body.readingTime)} min read`);
  }
  if (metaBits.length) {
    parts.push(`<p class="stream-rich-meta">${metaBits.join(" · ")}</p>`);
  }

  if (body.publisherName) {
    const iconSrc = safeUrl(body.icon ?? null);
    const icon = iconSrc
      ? `<img class="stream-pub-icon" src="${iconSrc}" alt="" loading="lazy" decoding="async">`
      : "";
    const canonical =
      body.siteUrl && safeUrl(body.siteUrl)
        ? safeUrl(joinPath(body.siteUrl, body.path))
        : null;
    const label = `${icon}<span class="stream-pub-name">${escapeHtml(
      body.publisherName
    )}</span>`;
    parts.push(
      canonical
        ? `<a class="stream-publisher stream-rich-link" href="${canonical}" target="_blank" rel="noopener">${label}</a>`
        : `<p class="stream-publisher">${label}</p>`
    );
  }
  return `<div class="stream-rich stream-rich-standard-site stream-rich-card">${cover}<div class="stream-rich-main">${parts.join(
    ""
  )}</div></div>`;
}

// --- media -----------------------------------------------------------------

function renderMedia(
  media: StreamMedia[] | undefined,
  resolveBlob: (did: string, cid: string) => string | null | undefined
): string {
  if (!media || media.length === 0) return "";
  const items = media
    .map((m) => {
      const raw = "url" in m ? m.url : resolveBlob(m.did, m.cid);
      const src = safeUrl(raw ?? null);
      if (!src) return "";
      return `<figure class="stream-media-item"><img src="${src}" alt="${escapeHtml(
        m.alt
      )}" loading="lazy" decoding="async"></figure>`;
    })
    .filter(Boolean)
    .join("");
  return items ? `<div class="stream-media">${items}</div>` : "";
}

// --- external link ---------------------------------------------------------

function renderExternalLink(link: StreamExternalLink | undefined): string {
  if (!link) return "";
  const href = safeUrl(link.url);
  if (!href) return "";
  const thumbSrc = safeUrl(link.thumb ?? null);
  const thumb = thumbSrc
    ? `<img class="stream-link-thumb" src="${thumbSrc}" alt="" loading="lazy" decoding="async">`
    : "";
  const title = link.title ? escapeHtml(link.title) : compactUrl(link.url);
  return `<a class="stream-link" href="${href}" target="_blank" rel="noopener">${thumb}<span class="stream-link-title">${title}</span></a>`;
}

// --- author (nested subject cards) -----------------------------------------

/**
 * Author identity row for a nested subject card (the quoted / reposted /
 * replied-to original post): avatar + display name + handle, so the reader sees
 * whose post is embedded. Returns "" when the VM carries no author or no
 * displayable identity. The avatar URL is validated + escaped by `safeUrl`.
 */
function renderAuthor(author: StreamCardVM["author"]): string {
  if (!author) return "";
  const name = author.displayName ?? author.handle;
  const avatarUrl = author.avatar ? safeUrl(author.avatar) : null;
  if (!name && !avatarUrl) return "";
  const avatar = avatarUrl
    ? `<img class="stream-subject-avatar" src="${avatarUrl}" alt="" loading="lazy" decoding="async" width="20" height="20">`
    : "";
  const nameHtml = name ? `<span class="stream-subject-name">${escapeHtml(name)}</span>` : "";
  // Append the "@handle" only when a distinct display name precedes it, so a
  // handle-only author is not shown twice.
  const handleHtml =
    author.displayName && author.handle
      ? `<span class="stream-subject-handle">@${escapeHtml(author.handle)}</span>`
      : "";
  return `<div class="stream-subject-author">${avatar}<span class="stream-subject-identity">${nameHtml}${handleHtml}</span></div>`;
}

// --- subject (repost / reply / quote target) -------------------------------

function renderSubject(
  subject: StreamCardSubject | undefined,
  ctx: StreamRenderCtx,
  depth: number,
  verb: StreamCardVM["verb"]
): string {
  if (!subject) return "";
  switch (subject.kind) {
    case "post": {
      const embed = `<div class="stream-subject">${renderCard(
        subject.post,
        ctx,
        depth + 1
      )}</div>`;
      // A repost embeds the reposted post as-is (today's rendering). Any other
      // verb with a post subject is a reply, so frame the embedded post as the
      // original being replied to.
      if (verb === "reposted") return embed;
      return `<p class="stream-reply-label">Replying to</p>${embed}`;
    }
    case "person": {
      const label = subject.displayName
        ? `${escapeHtml(subject.displayName)} <span class="stream-subject-handle">@${escapeHtml(
            subject.handle ?? ""
          )}</span>`
        : escapeHtml(subject.handle ?? subject.did);
      return `<div class="stream-subject stream-subject-person">${label}</div>`;
    }
    case "record":
      return `<div class="stream-subject stream-subject-record">${escapeHtml(
        subject.title ?? subject.uri
      )}</div>`;
    default:
      return "";
  }
}

// --- helpers ---------------------------------------------------------------

/** Escape text, then turn record newlines into `<br>`. */
function nl2br(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

/** Compact display form of a URL (no scheme, no `www.`, truncated), escaped. */
function compactUrl(url: string): string {
  const s = url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
  return escapeHtml(s.length > 48 ? s.slice(0, 47) + "…" : s);
}

/**
 * Default blob-URL builder: a Bluesky-style CDN fullsize image URL. The host
 * can override via `blobUrl` or point `cdnBase` at its own image proxy.
 */
function defaultBlobUrl(cdnBase: string, did: string, cid: string): string {
  return `${cdnBase}/img/feed_fullsize/plain/${did}/${cid}@jpeg`;
}

interface DayGroup {
  key: string;
  label: string;
  items: StreamCardVM[];
}

/**
 * Group consecutive items by their UTC calendar day, preserving input order.
 * The first two days relative to `now` are labelled "Today" / "Yesterday";
 * older days get an absolute date. UTC (not viewer-local) keeps server-rendered
 * output deterministic.
 */
function groupItemsByDay(vms: StreamCardVM[], now: Date): DayGroup[] {
  const todayKey = utcDayKey(now);
  const yesterdayKey = utcDayKey(new Date(now.getTime() - DAY_MS));
  const groups: DayGroup[] = [];
  let current: DayGroup | undefined;

  for (const item of vms) {
    const date = new Date(item.timestamp);
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? utcDayKey(date) : "undated";
    if (!current || current.key !== key) {
      current = {
        key,
        label: dayLabel(key, valid ? date : undefined, todayKey, yesterdayKey),
        items: [],
      };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
}

function dayLabel(
  key: string,
  date: Date | undefined,
  todayKey: string,
  yesterdayKey: string
): string {
  if (key === "undated" || !date) return "Undated";
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return ABSOLUTE_DATE_FMT.format(date);
}

const ABSOLUTE_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function utcDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
