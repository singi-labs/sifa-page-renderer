# @singi-labs/sifa-page-renderer

## 0.2.15

### Patch Changes

- bbbb0ca: Add optional `RenderContext.profileHomeHref` so single-page hosts can point the section nav back at the profile home. When set, the About/index section links to `profileHomeHref` and every other section links to `profileHomeHref` + `#` + slug (e.g. `/gui.do#career`), in both the masthead and mobile bottom nav. This fixes the activity ("Now") page's section links resolving to `page.sifa.id/{handle}/career.html` and 404ing. The "Now" activity entry keeps its own href and active-state; the value is validated/escaped like `activityStream.href`. Byte-identical output when unset.

## 0.2.14

### Patch Changes

- c6eaf1e: Add an optional `href` to `ActivityNavConfig` so callers can point the "Now" activity nav entry at a custom URL (e.g. a single-page host's per-handle `/gui.do/now` route) instead of the default `now.html`. The href is validated and escaped -- absolute `http(s)` URLs and same-origin relative paths are allowed, executable schemes like `javascript:` are rejected and fall back to `now.html`. Active-state highlighting stays keyed on the `now` slug, so a custom href still highlights on the activity page. When `href` is unset the nav output is byte-identical to before.

## 0.2.13

### Patch Changes

- 2ccadd4: Add `renderActivityPage(profile, sections, vms, ctx?, streamOptions?)`: a standalone activity ("Now") page that wraps `renderActivityStream` in the same masthead + sidebar + footer layout as the section pages. Adds a `ctx.activityStream` flag that injects a "Now" nav entry (masthead + mobile bottom nav, linking to `now.html`) into `renderHome`, `renderSectionPage`, and `renderSinglePage`; nav output is unchanged when the flag is omitted.
- 7d33653: Always show the profile's Bluesky account in the sidebar. Every Sifa profile is an AT Protocol identity, so the handle is rendered unconditionally as an `@handle` link to `bsky.app/profile/<handle>` with the Bluesky icon, even when the user has not added it as an external account. A Bluesky link the user added by hand for the same profile collapses into this canonical entry rather than duplicating.

## 0.2.12

### Patch Changes

- 45cbd8d: Add `renderActivityStream(vms, options?)`: a pure string-HTML renderer for an activity stream, consuming the same `StreamCardVM` view-model the sifa-web activity cards render (from the SDK's `toStreamCardVM`). Switches on `body.kind` (`text`/`media`/`link`/`track`/`generic`, degrading gracefully for unknown future kinds), resolves blob-ref media through an injectable `blobUrl`/`cdnBase` (default Bluesky-style CDN URL), links titles via an optional `permalink` builder, applies validated per-item RGB themes as inline custom properties, and groups items under Today/Yesterday/date headers (UTC). All user text is HTML-escaped and every URL scheme-validated, matching the profile renderer. Pins `@singi-labs/sifa-sdk` to `0.12.9` for the shared `StreamCardVM` contract. Adds `.activity-stream` / `.stream-*` styles to `getCSS()`.
- 45141bc: Reword the footer call-to-action from "Claim your own profile" to "Start your own website for free" (link unchanged).

## 0.2.11

### Patch Changes

- SEO batch: emit `<meta name="description">`, `<link rel="canonical">` (from a
  new `RenderContext.canonical`), `twitter:card=summary_large_image` (when an
  og:image is present), and a **Schema.org `Person` JSON-LD** block (name, url,
  alternateName, image, jobTitle, description, address, `sameAs` from the
  profile links). The JSON-LD escapes `<` to prevent a `</script>` breakout and
  carries the CSP nonce.

## 0.2.10

### Patch Changes

- Sidebar links: (1) add the Bluesky butterfly icon + "Bluesky" label for
  `bsky`/`bluesky` platforms (the same logo used on sifa.id); (2) when several
  links share a label (e.g. multiple Bluesky accounts, all "Bluesky"), show a
  compact URL under the label so visitors can tell them apart. Unique-label
  links stay single-line.

## 0.2.9

### Patch Changes

- Add a mobile bottom navigation. On narrow screens (<=760px) the horizontal
  top nav is replaced by an app-style fixed bottom bar (icon + label per
  section, Lucide icons). With more than 5 sections, the first 4 show in the
  bar and the rest move into a "More" bottom sheet. Desktop is unchanged;
  hidden in print. Sheet toggle + active-state sync scripts inherit the CSP
  nonce.

## 0.2.8

### Patch Changes

- Renamed the package from `@singi-labs/academicpages-renderer` to
  `@singi-labs/sifa-page-renderer` (repo `academicpages-renderer` →
  `sifa-page-renderer`), and the self-host scaffold from `sifa-academicpages`
  → `sifa-page`. The "academic" naming was an artifact of the visual lineage
  from academicpages.github.io, not a constraint on who the renderer is for
  (the layout is a general personal site). No API changes. The old package is
  deprecated on npm with a pointer to this one.

## 0.2.7

### Patch Changes

- Render body sections from the structured SDK `Profile` instead of re-parsing
  the profile's `.md` export.

  - New `buildProfileSections(profile)` turns an SDK `Profile` into an array of
    `RenderedSection` (`{ id, slug, title, html }`), driven by the shared
    `@singi-labs/sifa-sdk` section model (`ALL_SECTIONS`, `getVisibleSectionIds`,
    the per-section sorts, involvement grouping) and formatters
    (`formatDateRange`, `formatTimelineDate`, `formatCompanyName`, ...). This
    gives every surface exact ordering parity with the main Sifa profile page and
    richer detail (proper dates, validated links, publication citations).
  - `renderHome`, `renderSectionPage`, and `renderSinglePage` now take the
    pre-rendered `RenderedSection[]` (their `html` is already sanitized) instead
    of Markdown `ParsedSection[]`. Consumers call `buildProfileSections(profile)`
    and pass the result. Section slugs and nav labels are unchanged
    (`about` -> `index`, `Talks & sessions` -> `talks-and-sessions`, ...), so
    existing anchors and static filenames stay stable.
  - Security is preserved: About and every free-text description/activities blurb
    still go through the `marked` + DOMPurify allowlist, structured fields are
    HTML-escaped, and profile-supplied URLs go through `safeUrl` (http/https
    only, escaped). The CSP nonce, sidebar link dedup/icons, and location logic
    are unchanged.
  - `parseSections` / `sectionSlug` / `isSidebarOnly` remain exported for
    consumers that still parse `.md`, but the renderer no longer uses `.md`.
  - Adds `@singi-labs/sifa-sdk` as a (pure, framework-free) runtime dependency.

## 0.2.4

### Patch Changes

- Fix duplicate sidebar links, simplify link display, and read the current
  location data shape.

  - Deduplicate sidebar links by normalized URL. A link set as both
    `profile.website` and an `externalAccounts` entry (e.g. a "website"
    account marked primary) rendered twice.
  - Sidebar links now show a single title (the custom label, or a properly
    capitalized platform name like "GitHub"/"ORCID") instead of a label plus
    the raw URL host text underneath.
  - `locationLine` now prefers the structured `locations[]` array (using the
    entry where `isPrimary` is true, and its pre-formatted `location` string
    when present), falling back to the deprecated flat `location*` fields
    for profiles that only have those.

## 0.2.3

### Patch Changes

- Security fix: sanitize all profile-authored content before it reaches the
  rendered HTML.

  - Markdown section bodies (`About`, `Career`, etc.) are now run through
    DOMPurify with a safe-tag allowlist after Markdown-to-HTML conversion.
    `marked` passes raw HTML through verbatim by design, so unsanitized
    output would let profile content execute arbitrary script or
    event-handler attributes.
  - `profile.avatar` and external-account URLs are now validated (only
    `http:`/`https:` schemes allowed, rejecting `javascript:` and similar)
    and HTML-escaped before being written into `src`/`href` attributes, so
    a crafted value can no longer break out of the attribute or execute on
    click.

  No API changes. Existing callers get the fix automatically on upgrade.

## 0.2.2

### Patch Changes

- Widen `AcademicProfile` field types to accept `null` (matching the SDK
  `Profile` type, which uses `string | null` for optional fields). Fixes a
  typecheck failure when passing a real SDK profile directly to `renderHome`,
  `renderSectionPage`, or `renderSinglePage`.

## 0.2.1

### Patch Changes

- Add `renderSinglePage()` for server-rendered contexts that serve all sections
  through one route (e.g. sifa-web's `/p/{handle}/academic`). Sections render as
  hidden `<section>` blocks switched via hash-based nav (`#career`, `#education`,
  ...) instead of separate `.html` files.

## 0.2.0

### Minor Changes

- f5321e1: Initial release: pure HTML renderer for academicpages-style personal sites driven by Sifa profile data. Includes renderHome, renderSectionPage, parseSections, configurable asset paths, OG meta tag support, and bundled fonts/logos.
