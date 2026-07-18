# @singi-labs/sifa-page-renderer

Pure HTML renderer for personal sites driven by [Sifa](https://sifa.id) profile data, styled after [academicpages.github.io](https://academicpages.github.io/). No framework, no filesystem -- import and call.

## What it does

Takes a Sifa profile object and returns complete standalone HTML pages. Body
sections are built from the structured SDK `Profile` (via `buildProfileSections`,
driven by the shared `@singi-labs/sifa-sdk` section model), so ordering matches
the main Sifa profile page and detail is rich (proper dates, validated links,
publication citations). Each page has:

- Top masthead with horizontal navigation
- Left sidebar with avatar, identity, and links
- Main content area with prose styling
- Sifa-branded footer
- Dark mode toggle (persisted to localStorage)
- Print-friendly layout (hides chrome)

## Usage

### Self-hosted static site

```javascript
import { fetchProfile } from '@singi-labs/sifa-sdk/query/fetchers';
import { buildProfileSections, renderHome, renderSectionPage } from '@singi-labs/sifa-page-renderer';
import { CSS } from '@singi-labs/sifa-page-renderer/style';

// Fetch the structured profile from sifa.id
const profile = await fetchProfile({ baseUrl: 'https://sifa.id' }, 'your-handle.bsky.social');

// Build sections from the structured profile (About + Career + ... , Links excluded)
const sections = buildProfileSections(profile);

// Render pages
const indexHtml = renderHome(profile, sections, { year: 2026, updated: '2026-07-15' });
for (const section of sections) {
  if (section.slug === 'index') continue; // About is shown on the home page
  const html = renderSectionPage(profile, section, sections, { year: 2026 });
  // Write to dist/${section.slug}.html
}
```

See [sifa-page](https://github.com/singi-labs/sifa-page) for a complete self-hosting scaffold.

### Server-rendered (Next.js, Fastify, etc.)

```typescript
import { buildProfileSections, renderSinglePage } from '@singi-labs/sifa-page-renderer';
import { getCSS } from '@singi-labs/sifa-page-renderer/style';

// Override asset paths for your hosting setup. renderSinglePage serves all
// sections in one document with hash-based nav (#career, #education, ...).
const sections = buildProfileSections(profile);
const html = renderSinglePage(profile, sections, {
  paths: {
    css: '/api/style',
    assetDir: '/static/sifa',
    fontDir: '/fonts/sifa',
    favicon: '/static/sifa/favicon.svg',
  },
  og: {
    title: 'Jane Doe - Personal site',
    description: 'Jane Doe on Sifa ID',
    url: 'https://example.com/p/jane/site',
  },
});
```

## API

### `buildProfileSections(profile): RenderedSection[]`

Build every visible body section from a structured SDK `Profile`, in canonical
order, each rendered to sanitized HTML: `{ id, slug, title, html }`. The Links
section is excluded (it renders in the sidebar). Always the public visitor view
(owner-hidden items dropped).

### `renderHome(profile, sections, ctx?): string`

Render the home/About page. `sections` is the `buildProfileSections` output.
Returns a complete HTML document.

### `renderSectionPage(profile, section, sections, ctx?): string`

Render a single section page (Career, Education, etc.). Returns a complete HTML document.

### `renderSinglePage(profile, sections, ctx?): string`

Render all sections in one document with hash-based nav, for server-rendered
single-route hosts (e.g. sifa-web). Returns a complete HTML document.

### `renderActivityStream(vms, options?): string`

Render an activity stream to an HTML fragment (a `<section>`), from an array of
`StreamCardVM` objects -- the same normalized view-model the sifa-web activity
cards consume (produced by the SDK's `toStreamCardVM`). Both surfaces render the
same VM, so page.sifa.id and sifa-web stay in lockstep without sharing a DOM.

```typescript
import { renderActivityStream } from '@singi-labs/sifa-page-renderer';
import type { StreamCardVM } from '@singi-labs/sifa-sdk';

const html = renderActivityStream(vms, {
  // Optional. Build an image URL from a blob ref. Media may arrive already
  // resolved ({ url }) or as a raw blob ref ({ did, cid }); the VM stays
  // host-agnostic, so the host decides the CDN. Default: a Bluesky-style URL
  // `${cdnBase}/img/feed_fullsize/plain/{did}/{cid}@jpeg`.
  blobUrl: (did, cid) => `https://images.example/${did}/${cid}`,
  cdnBase: 'https://cdn.bsky.app',       // base for the default blobUrl builder
  permalink: (vm) => webUrlFor(vm),      // turn the at:// uri into a web link
  groupByDay: true,                      // Today / Yesterday / date headers (UTC)
  now: new Date(),                       // reference point for grouping + times
  emptyText: 'No activity yet.',
});
```

Options (all optional):

- `blobUrl(did, cid): string | null | undefined` -- builds an image URL for
  blob-ref media. Return `null` to skip. Default: `${cdnBase}/img/feed_fullsize/plain/{did}/{cid}@jpeg`.
- `cdnBase: string` -- base for the default `blobUrl` builder. Default `https://cdn.bsky.app`.
- `permalink(vm): string | null | undefined` -- the VM's `uri` is an `at://` URI,
  not a web URL; return an http(s) URL to link the card title. Default: unlinked
  (per-item permalinks are deferred).
- `groupByDay: boolean` -- group items under Today / Yesterday / date headers
  (UTC, deterministic for server rendering). Default `true`.
- `now: Date` -- reference "now" for relative times and day grouping. Default `new Date()`.
- `emptyText: string` -- shown when the stream is empty. Default `"No activity yet."`.

All user-controlled strings are HTML-escaped and every URL is scheme-validated
(http/https only), the same way the profile renderer handles profile data. The
card body switches on `body.kind` (`text` | `media` | `link` | `track` |
`generic`); unrecognized future kinds degrade to the text fallback. Style the
output with the `.activity-stream` / `.stream-*` rules in `getCSS()`.

### `renderActivityPage(profile, sections, vms, ctx?, streamOptions?): string`

Render a standalone activity ("Now") page: the same masthead + sidebar + footer
layout as `renderSectionPage`, with `renderActivityStream(vms, streamOptions)` as
its main content. `vms` is an array of `StreamCardVM` (as consumed by
`renderActivityStream`); `streamOptions` is forwarded verbatim. Returns a
complete HTML document with `<title>Now - {name}</title>` and the "Now" nav item
marked active. The page links to `now.html` (its nav slug is `now`), so a static
build writes it as `dist/now.html`.

```javascript
import { renderActivityPage } from '@singi-labs/sifa-page-renderer';

const nowHtml = renderActivityPage(profile, sections, vms, { year: 2026 }, {
  permalink: (vm) => webUrlFor(vm),
});
// Write to dist/now.html
```

`renderActivityPage` forces the "Now" nav entry on for its own page. To surface
that link on the home page and every section page too, set the
`ctx.activityStream` flag on those calls (see below).

### `ctx.activityStream` -- the "Now" nav flag

`RenderContext` accepts an optional `activityStream` flag that injects the "Now"
nav entry (masthead + mobile bottom nav) into `renderHome`, `renderSectionPage`,
and `renderSinglePage`, linking to `now.html`. Pass `true` for the default "Now"
label, or `{ label: 'Updates' }` to customize it. When omitted, the nav is
byte-identical to a build without an activity page.

```javascript
const ctx = { year: 2026, activityStream: true };
const indexHtml = renderHome(profile, sections, ctx);
const careerHtml = renderSectionPage(profile, career, sections, ctx);
const nowHtml = renderActivityPage(profile, sections, vms, ctx);
// All three now share a nav with an active-on-now.html "Now" link.
```

### `parseSections(md: string): ParsedSection[]`

Parse a markdown string into `##`-keyed sections. Retained for consumers that
still parse the `.md` export; the renderer itself no longer uses it.

### `sectionSlug(title: string): string`

Convert a section title to a URL-safe slug.

### `isSidebarOnly(title: string): boolean`

Returns `true` for sections that render in the sidebar (currently "Links").

### `getCSS(opts?): string`

Generate the stylesheet. Pass `{ fontDir: '/custom/path' }` to override font paths.

### `CSS: string`

Default stylesheet (equivalent to `getCSS()`).

## Static assets

The package includes fonts and SVG logos under `static/`. Import them via the package exports:

```
@singi-labs/sifa-page-renderer/static/fonts/quattro-regular.woff2
@singi-labs/sifa-page-renderer/static/assets/sifa-logo.svg
```

Or copy them to your build output:

```bash
cp -r node_modules/@singi-labs/sifa-page-renderer/static/* dist/
```

## Data requirements

The renderer expects a single data input:

- **Profile** -- an SDK `Profile` object (from `fetchProfile`). Identity fields
  (`handle`, `displayName`, `headline`, `about`, `avatar`, `website`,
  `location*`, `externalAccounts`) drive the sidebar/footer; the section arrays
  (`positions`, `education`, `publications`, ...) drive the body sections via
  `buildProfileSections`.

## License

MIT. See [LICENSE](./LICENSE).

Fonts: Quattro (SIL Open Font License), Space Grotesk (SIL Open Font License). See `static/fonts/LICENSE.txt`.
