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

/** Default CDN base for the blob-URL builder. Matches the profile renderer's
 *  `<link rel="preconnect" href="https://cdn.bsky.app">`. */
const DEFAULT_CDN_BASE = "https://cdn.bsky.app";

/** One day in milliseconds, for the "Yesterday" boundary. */
const DAY_MS = 86_400_000;

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
  const source = `<span class="stream-source" data-color="${escapeHtml(
    item.source.color
  )}">${escapeHtml(item.source.label)}</span>`;
  const time = `<time class="stream-time" datetime="${escapeHtml(
    item.timestamp
  )}">${escapeHtml(formatRelativeTime(item.timestamp))}</time>`;
  const head = `<div class="stream-head">${source}${time}</div>`;
  const title = `<div class="stream-title">${renderTitle(item, ctx)}</div>`;
  const body = renderBody(item.body);
  const media = renderMedia(item.media, ctx.resolveBlob);
  const link = renderExternalLink(item.externalLink);
  // Depth-limit the nested repost/reply target so a cyclic `subject` cannot
  // recurse forever; one level of nesting is enough for the personal-site view.
  const subject = depth < 1 ? renderSubject(item.subject, ctx, depth) : "";

  return `<article class="stream-card" data-uri="${escapeHtml(
    item.uri
  )}"${styleAttr}>${head}${title}${body}${media}${link}${subject}</article>`;
}

function renderTitle(item: StreamCardVM, ctx: StreamRenderCtx): string {
  const text = escapeHtml(item.title);
  const href = ctx.permalink ? safeUrl(ctx.permalink(item) ?? null) : null;
  return href
    ? `<a class="stream-title-link" href="${href}">${text}</a>`
    : `<span class="stream-title-text">${text}</span>`;
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

function renderBody(body: StreamCardBody | undefined): string {
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
    default:
      // Unknown / future body variant (the SDK will add nine app-specific
      // kinds): degrade to the generic text fallback rather than hard-fail.
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

// --- subject (repost / reply / quote target) -------------------------------

function renderSubject(
  subject: StreamCardSubject | undefined,
  ctx: StreamRenderCtx,
  depth: number
): string {
  if (!subject) return "";
  switch (subject.kind) {
    case "post":
      return `<div class="stream-subject">${renderCard(
        subject.post,
        ctx,
        depth + 1
      )}</div>`;
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
