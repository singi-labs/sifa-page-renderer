/**
 * Pure renderer for academicpages-style personal sites driven by Sifa profile data.
 *
 * No fs, no fetch -- importable by any Node.js build harness, Next.js Route Handler,
 * or static site generator. The same codebase powers:
 *  - sifa-academicpages (GitHub Pages, self-hosted static sites)
 *  - sifa-web `/p/{handle}/academic` (server-rendered on demand)
 *
 * Layout matches academicpages.github.io: a top masthead with horizontal nav,
 * a left sidebar with avatar / identity / links shown as content, main content,
 * and a Sifa-branded footer.
 *
 * `profile` is the SDK `Profile` type (or any structurally-compatible object).
 * `sections` come from parsing the `.md` export. `ctx` carries build/request
 * metadata (year, last-updated date, OG tags, path overrides).
 */

import { marked } from 'marked';

// --- Public types -----------------------------------------------------------

/** Minimal profile shape -- compatible with the SDK `Profile` type. */
export interface AcademicProfile {
  handle?: string;
  displayName?: string;
  headline?: string;
  about?: string;
  avatar?: string;
  website?: string;
  locationLocality?: string;
  locationCity?: string;
  locationRegion?: string;
  locationCountry?: string;
  externalAccounts?: Array<{
    label?: string;
    platform?: string;
    url?: string;
    verified?: boolean;
  }>;
  /** Nested location object (some profiles use this shape). */
  location?: {
    locality?: string;
    city?: string;
    region?: string;
    country?: string;
  };
}

/** A parsed markdown section (title + body). */
export interface ParsedSection {
  title: string;
  body: string;
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
   * When true, renders all sections in a single HTML document with JS-based
   * section switching (nav links use hash fragments instead of .html files).
   * Used by server-rendered contexts like sifa-web where multi-page static
   * files aren't available.
   */
  singlePage?: boolean;
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

// --- .md parsing -----------------------------------------------------------

/** Parse a markdown string into sections keyed by `##` headings. */
export function parseSections(md: string): ParsedSection[] {
  const lines = md.split('\n');
  const accum: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    const m = line.match(/^## (.+)$/);
    if (m) {
      current = { title: m[1].trim(), body: [] };
      accum.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }

  return accum
    .map((s) => ({ title: s.title, body: s.body.join('\n').trim() }))
    .filter((s) => s.body);
}

/** Convert a section title to a URL-safe slug for filenames and anchors. */
export function sectionSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The "Links" section is rendered in the sidebar, not as its own page. */
export function isSidebarOnly(title: string): boolean {
  return title.toLowerCase() === 'links';
}

// --- identity helpers -------------------------------------------------------

function locationLine(profile: AcademicProfile): string | null {
  const loc = profile.location;
  const flat = [
    profile.locationLocality ?? profile.locationCity ?? loc?.locality ?? loc?.city,
    profile.locationRegion ?? loc?.region,
    profile.locationCountry ?? loc?.country,
  ].filter(Boolean);
  return flat.length ? flat.join(', ') : null;
}

function navItems(sections: ParsedSection[], activeSlug: string, singlePage?: boolean): string {
  return sections
    .filter((s) => !isSidebarOnly(s.title))
    .map((s) => {
      const isAbout = s.title.toLowerCase() === 'about';
      const slug = isAbout ? 'index' : sectionSlug(s.title);
      const href = singlePage ? `#${slug}` : (isAbout ? 'index.html' : `${slug}.html`);
      const active = isAbout
        ? activeSlug === 'index'
        : slug === activeSlug;
      return `<a href="${href}"${active ? ' aria-current="page" class="active"' : ''}>${escapeHtml(s.title)}</a>`;
    })
    .join('\n');
}

// --- render: masthead (top nav) --------------------------------------------

function masthead(
  sections: ParsedSection[],
  activeSlug: string,
  paths: Required<RenderPaths>,
  singlePage?: boolean,
): string {
  return `<header class="masthead">
  <div class="masthead-inner">
    <nav class="top-nav">${navItems(sections, activeSlug, singlePage)}\n    </nav>
    <div class="masthead-actions">
      <button id="theme-toggle" class="theme-toggle" aria-label="Toggle dark mode" type="button">${svgSun()}${svgMoon()}</button>
      <a class="sifa-logo" href="https://sifa.id" title="Built with Sifa" target="_blank" rel="noopener">
        <img class="brand-logo brand-logo-light" src="${paths.assetDir}/sifa-logo.svg" alt="Sifa" height="22">
        <img class="brand-logo brand-logo-dark" src="${paths.assetDir}/sifa-logo-dark.svg" alt="Sifa" height="22">
      </a>
    </div>
  </div>
</header>`;
}

// --- render: sidebar (identity + links) ------------------------------------

function sidebar(profile: AcademicProfile): string {
  const handle = profile.handle ?? '';
  const name = profile.displayName ?? handle ?? 'Profile';

  const avatar = profile.avatar
    ? `<img src="${profile.avatar}" alt="" class="avatar">`
    : `<div class="avatar avatar-placeholder">${escapeHtml(name).slice(0, 1)}</div>`;

  const headline = profile.headline
    ? `<p class="meta-line">${escapeHtml(profile.headline)}</p>`
    : '';
  const loc = locationLine(profile);
  const locHtml = loc ? `<p class="meta-line">${escapeHtml(loc)}</p>` : '';

  const linkEntries = [
    profile.website ? { label: 'Website', url: profile.website } : null,
    ...(profile.externalAccounts ?? []).map((a) => ({
      label: a.label ?? a.platform ?? 'Link',
      url: a.url ?? '',
    })),
  ]
    .filter((e): e is { label: string; url: string } => Boolean(e && e.url))
    .map((e) => {
      const host = e.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      return `<a class="side-link" href="${e.url}" rel="me noopener" target="_blank"><span class="side-link-label">${escapeHtml(e.label)}</span><span class="side-link-host">${escapeHtml(host)}</span></a>`;
    })
    .join('');
  const linksHtml = linkEntries ? `<div class="side-links">${linkEntries}</div>` : '';

  return `<aside class="sidebar">
  ${avatar}
  <h1 class="sidebar-name">${escapeHtml(name)}</h1>
  ${handle ? `<p class="sidebar-handle">@${escapeHtml(handle)}</p>` : ''}
  ${headline}
  ${locHtml}
  ${linksHtml}
</aside>`;
}

// --- render: layout ---------------------------------------------------------

function resolvePaths(paths?: RenderPaths): Required<RenderPaths> {
  return {
    css: paths?.css ?? 'style.css',
    favicon: paths?.favicon ?? 'assets/favicon.svg',
    assetDir: paths?.assetDir ?? 'assets',
    fontDir: paths?.fontDir ?? 'fonts',
  };
}

function ogTags(og?: OpenGraphMeta): string {
  if (!og) return '';
  const tags: string[] = [];
  if (og.title) tags.push(`<meta property="og:title" content="${escapeHtml(og.title)}">`);
  if (og.description) tags.push(`<meta property="og:description" content="${escapeHtml(og.description)}">`);
  if (og.url) tags.push(`<meta property="og:url" content="${escapeHtml(og.url)}">`);
  if (og.image) tags.push(`<meta property="og:image" content="${escapeHtml(og.image)}">`);
  if (og.siteName) tags.push(`<meta property="og:site_name" content="${escapeHtml(og.siteName)}">`);
  if (og.type) tags.push(`<meta property="og:type" content="${escapeHtml(og.type)}">`);
  // Twitter card equivalents
  if (og.title) tags.push(`<meta name="twitter:title" content="${escapeHtml(og.title)}">`);
  if (og.description) tags.push(`<meta name="twitter:description" content="${escapeHtml(og.description)}">`);
  if (og.image) tags.push(`<meta name="twitter:image" content="${escapeHtml(og.image)}">`);
  return tags.length ? '\n  ' + tags.join('\n  ') : '';
}

function layout(opts: {
  title: string;
  profile: AcademicProfile;
  sections: ParsedSection[];
  activeSlug: string;
  main: string;
  ctx?: RenderContext;
}): string {
  const { title, profile, sections, activeSlug, main, ctx } = opts;
  const paths = resolvePaths(ctx?.paths);
  const handle = profile.handle ?? '';
  const name = profile.displayName ?? handle ?? 'Profile';
  const year = ctx?.year ?? '';
  const updated = ctx?.updated ?? '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="${paths.favicon}" type="image/svg+xml">
  <link rel="preconnect" href="https://cdn.bsky.app">
  <link rel="stylesheet" href="${paths.css}">${ogTags(ctx?.og)}
  <script>(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();</script>
</head>
<body>
  ${masthead(sections, activeSlug, paths, ctx?.singlePage)}
  <div class="shell">
    ${sidebar(profile)}
    <main class="main">
${main}
    </main>
  </div>
  <footer class="site-footer">
    <div class="footer-left">
      <div class="footer-brand">
        <img class="brand-logo brand-logo-light" src="${paths.assetDir}/sifa-logo.svg" alt="Sifa" height="20">
        <img class="brand-logo brand-logo-dark" src="${paths.assetDir}/sifa-logo-dark.svg" alt="Sifa" height="20">
      </div>
      <div class="footer-meta">
        ${year ? `<span>&copy; ${year} ${escapeHtml(name)}</span>` : ''}
        ${updated ? `<span class="footer-updated">Site last updated ${escapeHtml(updated)}</span>` : ''}
      </div>
    </div>
    <div class="footer-links">
      <a href="https://sifa.id/p/${encodeURIComponent(handle)}">View ${escapeHtml(name)}'s full Sifa ID</a>
      <a href="https://sifa.id">Claim your own profile</a>
      <a href="https://github.com/singi-labs/sifa-academicpages">Self-host your own Sifa ID-driven page like this</a>
    </div>
  </footer>
  <script>document.getElementById('theme-toggle').addEventListener('click',function(){var t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;try{localStorage.setItem('theme',t);}catch(e){}});</script>${ctx?.singlePage ? singlePageScript() : ''}
</body>
</html>
`;
}

function singlePageScript(): string {
  return `
  <script>(function(){
    function activate(slug){
      document.querySelectorAll('.page-section').forEach(function(el){el.hidden=el.id!==slug;});
      document.querySelectorAll('.top-nav a').forEach(function(a){
        var isActive=a.getAttribute('href')==='#'+slug;
        a.classList.toggle('active',isActive);
        if(isActive){a.setAttribute('aria-current','page');}else{a.removeAttribute('aria-current');}
      });
    }
    function fromHash(){activate(location.hash.replace('#','')||'index');}
    window.addEventListener('hashchange',fromHash);
    fromHash();
  })();</script>`;
}

// --- render: pages ----------------------------------------------------------

/** Render the home/about page. */
export function renderHome(
  profile: AcademicProfile,
  sections: ParsedSection[],
  ctx?: RenderContext,
): string {
  const about = sections.find((s) => s.title.toLowerCase() === 'about');
  const aboutHtml = about ? marked.parse(about.body) : '<p>No bio yet.</p>';
  const main = `
    <h2 class="page-title">About</h2>
    <div class="prose">${aboutHtml}</div>
  `;
  return layout({
    title: profile.displayName ?? profile.handle ?? 'Profile',
    profile,
    sections,
    activeSlug: 'index',
    main,
    ctx,
  });
}

/** Render a section page (Experience, Education, etc.). */
export function renderSectionPage(
  profile: AcademicProfile,
  section: ParsedSection,
  sections: ParsedSection[],
  ctx?: RenderContext,
): string {
  const main = `
    <h2 class="page-title">${escapeHtml(section.title)}</h2>
    <div class="prose">${marked.parse(section.body)}</div>
  `;
  return layout({
    title: `${section.title} - ${profile.displayName ?? profile.handle ?? 'Profile'}`,
    profile,
    sections,
    activeSlug: sectionSlug(section.title),
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
  sections: ParsedSection[],
  ctx?: RenderContext,
): string {
  const about = sections.find((s) => s.title.toLowerCase() === 'about');
  const others = sections.filter((s) => s !== about && !isSidebarOnly(s.title));

  const aboutHtml = about ? marked.parse(about.body) : '<p>No bio yet.</p>';
  const sectionHtml = (id: string, title: string, body: string, active: boolean) => `
    <section id="${id}" class="page-section"${active ? '' : ' hidden'}>
      <h2 class="page-title">${escapeHtml(title)}</h2>
      <div class="prose">${body}</div>
    </section>`;

  const main = [
    sectionHtml('index', 'About', aboutHtml as string, true),
    ...others.map((s) => sectionHtml(sectionSlug(s.title), s.title, marked.parse(s.body) as string, false)),
  ].join('\n');

  return layout({
    title: profile.displayName ?? profile.handle ?? 'Profile',
    profile,
    sections,
    activeSlug: 'index',
    main,
    ctx: { ...ctx, singlePage: true },
  });
}

// --- utils ------------------------------------------------------------------

function escapeHtml(s: string | number | undefined | null): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c] ?? c;
  });
}

function svgSun(): string {
  return '<svg class="icon-sun" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.7"/><g stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4"/></g></svg>';
}

function svgMoon(): string {
  return '<svg class="icon-moon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z"/></svg>';
}
