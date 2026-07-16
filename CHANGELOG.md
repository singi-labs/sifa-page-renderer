# @singi-labs/sifa-pages-renderer

## 0.2.8

### Patch Changes

- Renamed the package from `@singi-labs/academicpages-renderer` to
  `@singi-labs/sifa-pages-renderer` (repo `academicpages-renderer` →
  `sifa-pages-renderer`), and the self-host scaffold from `sifa-academicpages`
  → `sifa-pages`. The "academic" naming was an artifact of the visual lineage
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
