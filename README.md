# @singi-labs/sifa-pages-renderer

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
import { buildProfileSections, renderHome, renderSectionPage } from '@singi-labs/sifa-pages-renderer';
import { CSS } from '@singi-labs/sifa-pages-renderer/style';

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

See [sifa-pages](https://github.com/singi-labs/sifa-pages) for a complete self-hosting scaffold.

### Server-rendered (Next.js, Fastify, etc.)

```typescript
import { buildProfileSections, renderSinglePage } from '@singi-labs/sifa-pages-renderer';
import { getCSS } from '@singi-labs/sifa-pages-renderer/style';

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
@singi-labs/sifa-pages-renderer/static/fonts/quattro-regular.woff2
@singi-labs/sifa-pages-renderer/static/assets/sifa-logo.svg
```

Or copy them to your build output:

```bash
cp -r node_modules/@singi-labs/sifa-pages-renderer/static/* dist/
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
