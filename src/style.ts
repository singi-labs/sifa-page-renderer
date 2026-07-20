/**
 * Shared stylesheet for academicpages-style sites.
 *
 * Exported as a function so the font directory can be overridden per consumer:
 *  - Self-hosters: `getCSS()` uses the default `fonts/` (relative to style.css).
 *  - sifa-web: `getCSS({ fontDir: '/fonts/academic' })` uses an absolute path.
 *
 * The returned string is a complete CSS document, ready to serve.
 */

export interface CSSOptions {
  /** Directory prefix for font files in @font-face rules. Default: `"fonts"`. */
  fontDir?: string;
}

/** Generate the academicpages CSS with optional path overrides. */
export function getCSS(opts?: CSSOptions): string {
  const fontDir = opts?.fontDir ?? "fonts";

  return `
@font-face { font-family:'Quattro'; src:url('${fontDir}/quattro-regular.woff2') format('woff2'); font-weight:400; font-style:normal; font-display:swap; }
@font-face { font-family:'Quattro'; src:url('${fontDir}/quattro-italic.woff2') format('woff2'); font-weight:400; font-style:italic; font-display:swap; }
@font-face { font-family:'Quattro'; src:url('${fontDir}/quattro-bold.woff2') format('woff2'); font-weight:700; font-style:normal; font-display:swap; }
@font-face { font-family:'Quattro'; src:url('${fontDir}/quattro-bold-italic.woff2') format('woff2'); font-weight:700; font-style:italic; font-display:swap; }
@font-face { font-family:'Space Grotesk'; src:url('${fontDir}/space-grotesk-bold.woff2') format('woff2'); font-weight:700; font-style:normal; font-display:swap; }

:root, [data-theme="light"] {
  --bg:#fffcf0; --fg:#1c1b1a; --muted:#6b6862; --border:#e4e0d6; --card:#fff; --link:#2a5db0;
  --star:#c99700; --diff-add:#1a7f37; --diff-del:#cf222e; --verified:#1a7f37;
}
[data-theme="dark"] {
  --bg:#181714; --fg:#f0ede2; --muted:#a59f93; --border:#34322b; --card:#232118; --link:#9db8f8;
  --star:#e3b341; --diff-add:#3fb950; --diff-del:#f85149; --verified:#3fb950;
}
* { box-sizing:border-box; }
html { color-scheme: light dark; }
body {
  margin:0; color:var(--fg); background:var(--bg);
  font-family:'Quattro', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size:17px; line-height:1.6;
}
h1,h2,h3,h4,.sidebar-name,.page-title { font-family:'Space Grotesk','Quattro',sans-serif; }
a { color:var(--link); }

/* Sifa logo: one variant visible per theme. Both .sifa-logo and .footer-brand
   use .brand-logo, so these rules fix the masthead AND the footer. Specificity
   is kept equal-and-ordered so the dark-variant hide is not overridden. */
.brand-logo { display:block; }
.brand-logo-dark { display:none; }
[data-theme="dark"] .brand-logo-light { display:none; }
[data-theme="dark"] .brand-logo-dark { display:block; }

/* masthead + horizontal top nav (academicpages-style) */
.masthead { border-bottom:1px solid var(--border); position:sticky; top:0; z-index:10; background:var(--bg); }
.masthead-inner {
  max-width:1100px; margin:0 auto; padding:0.7rem 1.5rem;
  display:flex; flex-wrap:wrap; align-items:center; gap:0.5rem 1.25rem;
}
.top-nav { display:flex; flex-wrap:wrap; gap:1rem; font-size:0.92rem; }
.top-nav a { color:var(--muted); text-decoration:none; padding:0.2rem 0; }
.top-nav a:hover, .top-nav a.active { color:var(--fg); }
.top-nav a.active { font-weight:700; }
.masthead-actions { margin-left:auto; display:flex; align-items:center; gap:0.6rem; }
.sifa-logo { display:inline-flex; align-items:center; line-height:0; }

/* Grouped nav dropdowns (desktop). A group heading is a non-link, focusable
   trigger; its submenu opens on pointer hover AND :focus-within (keyboard Tab)
   via CSS alone -- no JS, so the nav still works with scripting disabled. */
.nav-group { position:relative; display:inline-flex; }
.nav-group-label {
  font:inherit; color:var(--muted); background:none; border:0; padding:0.2rem 0;
  cursor:default; display:inline-flex; align-items:center; gap:0.3rem;
}
.nav-group-label::after {
  content:""; width:0.4em; height:0.4em; border:solid currentColor;
  border-width:0 1.5px 1.5px 0; transform:translateY(-0.15em) rotate(45deg);
}
.nav-group:hover .nav-group-label,
.nav-group:focus-within .nav-group-label,
.nav-group.active .nav-group-label { color:var(--fg); }
.nav-group.active .nav-group-label { font-weight:700; }
.nav-group-menu {
  position:absolute; top:100%; left:0; z-index:20;
  display:flex; flex-direction:column; gap:0.1rem; min-width:12ch;
  padding:0.4rem; background:var(--bg);
  border:1px solid var(--border); border-radius:8px;
  box-shadow:0 6px 24px rgba(0,0,0,0.12);
  opacity:0; visibility:hidden; transform:translateY(-4px);
  transition:opacity 0.12s ease, transform 0.12s ease, visibility 0s linear 0.12s;
}
.nav-group:hover .nav-group-menu,
.nav-group:focus-within .nav-group-menu {
  opacity:1; visibility:visible; transform:translateY(0);
  transition:opacity 0.12s ease, transform 0.12s ease;
}
.nav-group-menu a { white-space:nowrap; padding:0.3rem 0.5rem; border-radius:5px; }
.nav-group-menu a:hover { background:var(--border); }

/* Mobile bottom nav + "More" sheet: desktop-hidden, shown in the media query. */
.bottom-nav, .more-sheet { display:none; }

.theme-toggle {
  background:none; border:1px solid var(--border); color:var(--muted);
  border-radius:8px; padding:0.3rem 0.45rem; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem;
}
.theme-toggle:hover { color:var(--fg); border-color:var(--muted); }
.icon-moon { display:none; }
[data-theme="dark"] .icon-sun { display:none; }
[data-theme="dark"] .icon-moon { display:block; }

.shell { display:grid; grid-template-columns:260px 1fr; max-width:1100px; margin:0 auto; }

.sidebar { padding:2rem 1.5rem; border-right:1px solid var(--border); position:sticky; top:54px; align-self:start; height:calc(100vh - 54px); overflow-y:auto; }
.avatar { width:96px; height:96px; border-radius:50%; object-fit:cover; border:1px solid var(--border); display:block; }
.avatar-placeholder { background:var(--card); color:var(--muted); font-family:'Space Grotesk',sans-serif; font-size:2.4rem; display:grid; place-items:center; }
.sidebar-name { font-size:1.25rem; margin:1rem 0 0; }
.meta-line { color:var(--muted); margin:0.15rem 0; font-size:0.92rem; }
.meta-location { display:flex; align-items:center; gap:0.35rem; margin-top:0.5rem; }
.meta-icon { flex:0 0 auto; opacity:0.75; }

/* links shown as content in the sidebar */
.side-links { display:flex; flex-direction:column; gap:0.15rem; margin-top:1rem; }
.side-link { display:flex; align-items:center; gap:0.55rem; text-decoration:none; padding:0.4rem 0; border-top:1px solid var(--border); color:var(--fg); font-size:0.92rem; }
.side-link:first-child { border-top:none; }
.side-link:hover { color:var(--link); }
.side-link-icon { flex:0 0 auto; width:16px; height:16px; opacity:0.8; }
.side-link:hover .side-link-icon { opacity:1; }
.side-link-text { display:flex; flex-direction:column; min-width:0; }
.side-link-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.side-link-sub { font-size:0.78em; color:var(--muted); line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.main { padding:2rem 2.5rem 3rem; min-width:0; }
.page-section[hidden] { display:none; }
.page-title { font-size:1.6rem; margin:0 0 1rem; padding-bottom:0.4rem; border-bottom:1px solid var(--border); }
.prose h2 { font-size:1.15rem; margin:1.6rem 0 0.5rem; }
.prose h3 { font-size:1rem; margin:1.3rem 0 0.4rem; }
.prose ul { padding-left:1.2rem; }
.prose li { margin-bottom:0.4rem; }
.prose a { word-break:break-word; }

/* structured CV entries (career, education, publications, ...) built from the
   SDK profile model. Additive: no existing selector is changed. */
.prose .cv-list { list-style:none; padding-left:0; margin:0.4rem 0 0; }
.prose .cv-list .cv-entry { margin:0 0 1.1rem; }
.prose .cv-list .cv-entry:last-child { margin-bottom:0; }
.prose .cv-cite { line-height:1.5; }
.cv-when { color:var(--muted); font-weight:400; font-size:0.92em; }
.cv-venue { font-style:italic; }
.cv-meta { color:var(--muted); font-size:0.9em; margin:0.15rem 0 0; }
.cv-desc { margin:0.35rem 0 0; }
.cv-desc > :first-child { margin-top:0; }
.cv-desc > :last-child { margin-bottom:0; }
.cv-skills { color:var(--muted); font-size:0.88em; margin-top:0.25rem; }
.prose .cv-taglist { list-style:none; padding-left:0; margin:0.35rem 0 0; display:flex; flex-wrap:wrap; gap:0.4rem; }
.prose .cv-taglist li { margin:0; background:var(--card); border:1px solid var(--border); border-radius:6px; padding:0.1rem 0.55rem; font-size:0.88em; }

/* Talk deliveries: collapsed behind a one-line summary (native <details>, no JS).
   Caret points right when closed (toward the summary), rotates down when open. */
.cv-deliveries { margin-top:0.4rem; }
.cv-delivery-summary { cursor:pointer; list-style:none; color:var(--muted); font-size:0.9em; display:flex; align-items:center; gap:0.4rem; }
.cv-delivery-summary::-webkit-details-marker { display:none; }
.cv-delivery-summary::before { content:""; width:0.4em; height:0.4em; border:solid currentColor; border-width:0 1.5px 1.5px 0; transform:rotate(-45deg); transition:transform 0.15s ease; flex:none; }
.cv-deliveries[open] .cv-delivery-summary::before { transform:rotate(45deg); }
.cv-delivery-summary:hover { color:var(--fg); }
.cv-deliveries .cv-list { margin-top:0.5rem; padding-top:0.5rem; border-top:1px solid var(--border); }

/* Publications: grouped Standard.site cards + an "Other publications" list. */
.pub-group { border:1px solid var(--border); border-radius:10px; padding:0.85rem 1rem; margin:0 0 1rem; background:var(--card); }
.pub-group-head { display:flex; align-items:baseline; justify-content:space-between; gap:0.75rem; margin-bottom:0.4rem; }
.pub-group-name { font-weight:700; }
.pub-group-count { color:var(--muted); font-size:0.86em; }
.pub-group-cta { flex:none; font-size:0.86em; color:var(--link); text-decoration:none; white-space:nowrap; }
.pub-group-cta:hover { text-decoration:underline; }
.pub-row { display:flex; align-items:center; gap:0.7rem; padding:0.45rem 0; text-decoration:none; color:var(--fg); border-top:1px solid var(--border); }
.pub-rows > .pub-row:first-child { border-top:0; }
.pub-thumb { width:44px; height:44px; border-radius:6px; object-fit:cover; border:1px solid var(--border); flex:none; }
.pub-thumb-empty { background:var(--bg); }
.pub-row-main { display:flex; flex-direction:column; min-width:0; flex:1; }
.pub-row-title { font-weight:600; overflow:hidden; text-overflow:ellipsis; }
.pub-row-sub { color:var(--muted); font-size:0.84em; }
.pub-row-date { color:var(--muted); font-size:0.84em; white-space:nowrap; flex:none; }
.pub-row:hover .pub-row-title { text-decoration:underline; }
.pub-more > summary { cursor:pointer; list-style:none; color:var(--link); font-size:0.86em; padding:0.5rem 0 0.15rem; }
.pub-more > summary::-webkit-details-marker { display:none; }
.pub-more > summary:hover { text-decoration:underline; }
.pub-other-head { font-size:0.92rem; color:var(--muted); margin:1.3rem 0 0.5rem; }
.pub-o-list { display:flex; flex-direction:column; }
.pub-o-row { display:flex; justify-content:space-between; gap:0.75rem; padding:0.6rem 0; border-top:1px solid var(--border); }
.pub-o-list > .pub-o-row:first-child { border-top:0; }
.pub-o-body { min-width:0; }
.pub-o-title { font-weight:600; }
.pub-o-subtitle { color:var(--muted); font-size:0.9em; margin-top:0.1rem; }
.pub-o-meta, .pub-o-contrib { color:var(--muted); font-size:0.84em; margin-top:0.1rem; }
.pub-o-doi { display:inline-block; font-size:0.82em; margin-top:0.15rem; }
.pub-o-date { color:var(--muted); font-size:0.84em; white-space:nowrap; flex:none; }

/* activity stream (renderActivityStream). Additive: no existing selector is
   changed. Per-item theme colors arrive as the inline custom properties
   --stream-card-bg / --stream-card-fg / --stream-accent, each falling back to
   the site tokens when absent. */
.activity-stream { display:flex; flex-direction:column; gap:1.75rem; margin:0.4rem 0 0; }
.stream-empty { color:var(--muted); margin:0.4rem 0; }
.stream-day { display:flex; flex-direction:column; gap:0.9rem; }
.stream-day-label {
  font-size:0.82rem; text-transform:uppercase; letter-spacing:0.06em;
  color:var(--muted); margin:0 0 0.1rem; font-weight:700;
}
.stream-card {
  position:relative;
  background:var(--stream-card-bg, var(--card)); color:var(--stream-card-fg, var(--fg));
  border:1px solid var(--border); border-left:3px solid var(--stream-accent, var(--border));
  border-radius:8px; padding:0.85rem 1rem;
}
.stream-card:hover { border-color:var(--stream-accent, var(--link)); }
/* Stretched overlay link: the whole card opens the source record. Inner links
   (embedded subject, external links, verb) sit above it and stay clickable. */
.stream-card-link { position:absolute; inset:0; z-index:1; border-radius:inherit; }
.stream-card :is(a:not(.stream-card-link), button) { position:relative; z-index:2; }
.stream-head { display:flex; align-items:center; gap:0.6rem; margin-bottom:0.35rem; }
/* App icon (brand logo or category glyph) at the card's top-left. */
.stream-source {
  display:inline-flex; align-items:center; gap:0.3rem; font-size:0.74rem; font-weight:700;
  color:var(--muted); background:var(--bg); border:1px solid var(--border);
  border-radius:999px; padding:0.05rem 0.5rem;
}
/* Category glyph inside the source pill, before the app name. */
.stream-source-glyph { display:inline-flex; }
.stream-source-glyph svg { width:14px; height:14px; display:block; }
.stream-time { color:var(--muted); font-size:0.8rem; margin-left:auto; }
/* The verb is metadata, not content: muted + small, set apart from post text. */
.stream-verb { color:var(--muted); font-size:0.82rem; }
.stream-verb-link { color:var(--muted); text-decoration:none; }
.stream-verb-link:hover { color:var(--link); text-decoration:underline; }
.stream-text { margin:0.4rem 0 0; word-break:break-word; }
.stream-track { margin:0.4rem 0 0; font-weight:700; }
.stream-media { display:flex; flex-wrap:wrap; gap:0.5rem; margin:0.6rem 0 0; }
.stream-media-item { margin:0; flex:0 1 auto; }
.stream-media-item img {
  max-width:100%; max-height:280px; border-radius:6px; border:1px solid var(--border); display:block;
}
.stream-link {
  display:flex; align-items:center; gap:0.6rem; margin:0.6rem 0 0;
  border:1px solid var(--border); border-radius:6px; padding:0.5rem 0.6rem;
  text-decoration:none; color:var(--fg);
}
.stream-link:hover { color:var(--link); }
.stream-link-thumb { width:48px; height:48px; object-fit:cover; border-radius:4px; flex:0 0 auto; }
.stream-link-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.stream-subject {
  position:relative; z-index:2;
  margin:0.6rem 0 0; padding:0.5rem 0.7rem; border-left:2px solid var(--border);
  background:var(--bg); border-radius:0 6px 6px 0; font-size:0.92em;
}
.stream-subject .stream-card { border:none; border-radius:0; background:none; padding:0; }
.stream-subject-handle { color:var(--muted); }
/* "Replying to" caption above the embedded original post (reply cards only). */
.stream-reply-label { margin:0.6rem 0 0; color:var(--muted); font-size:0.82rem; font-weight:700; }
.stream-reply-label + .stream-subject { margin-top:0.2rem; }

/* rich typed cards (media-review, book, github-pr, event-rsvp, verification,
   membership, location, travel, standard-site). Structured data laid out with
   an optional leading cover image, mirroring the sifa-web /activity cards. */
.stream-rich { display:flex; gap:0.75rem; margin:0.5rem 0 0; }
.stream-rich-main { min-width:0; flex:1 1 auto; }
.stream-rich-card {
  flex-direction:column; gap:0; border:1px solid var(--border); border-radius:8px; overflow:hidden;
}
.stream-rich-card .stream-rich-main { padding:0.75rem 0.85rem; }
.stream-cover { margin:0; flex:0 0 auto; }
.stream-cover img {
  width:72px; height:auto; max-height:108px; object-fit:cover; border-radius:6px;
  border:1px solid var(--border); display:block;
}
.stream-cover-wide { width:100%; }
.stream-cover-wide img { width:100%; max-height:none; aspect-ratio:16/9; border-radius:0; border:none; }
.stream-rich-title { margin:0.1rem 0 0; font-weight:700; word-break:break-word; }
.stream-rich-title-text { font-weight:700; }
.stream-rich-meta { margin:0.2rem 0 0; color:var(--muted); font-size:0.86rem; word-break:break-word; }
.stream-rich-text { margin:0.35rem 0 0; color:var(--muted); word-break:break-word; }
.stream-rich-link { color:var(--link); text-decoration:none; }
.stream-rich-link:hover { text-decoration:underline; }
.stream-rich-stats { margin:0.3rem 0 0; display:flex; flex-wrap:wrap; gap:0.75rem; font-size:0.85rem; }

.stream-badge {
  display:inline-flex; align-items:center; margin:0.25rem 0.35rem 0 0; font-size:0.74rem;
  background:var(--bg); border:1px solid var(--border); border-radius:999px; padding:0.05rem 0.5rem;
}
.stream-badge-quiet { color:var(--muted); }
.stream-badge-verified { color:var(--verified); border-color:var(--verified); }

.stream-stars {
  display:inline-flex; align-items:center; gap:0.35rem; margin:0.3rem 0 0; font-size:0.86rem;
}
.stream-stars-glyph { color:var(--star); letter-spacing:0.05em; }
.stream-rating { color:var(--muted); }

.stream-repo { font-weight:700; }
.stream-pr-num { color:var(--muted); }
.stream-lang { display:inline-flex; align-items:center; gap:0.35rem; color:var(--muted); }
.stream-lang-dot {
  display:inline-block; width:0.65rem; height:0.65rem; border-radius:999px;
  background:var(--lang-dot, var(--muted));
}
.stream-diff-add { color:var(--diff-add); font-weight:700; margin-right:0.5rem; }
.stream-diff-del { color:var(--diff-del); font-weight:700; }

.stream-publisher {
  display:inline-flex; align-items:center; gap:0.4rem; margin:0.5rem 0 0; font-size:0.85rem; color:var(--muted);
}
.stream-pub-icon { width:1.1rem; height:1.1rem; border-radius:999px; object-fit:cover; }
.stream-pub-name { font-weight:600; }

.site-footer {
  max-width:1100px; margin:0 auto; padding:1.4rem 2.5rem 3rem; border-top:1px solid var(--border);
  display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:1rem 1.5rem;
}
.footer-left { display:flex; align-items:center; gap:0.8rem; }
.footer-brand { display:flex; align-items:center; line-height:0; }
.footer-meta { display:flex; flex-direction:column; font-size:0.82rem; color:var(--muted); line-height:1.4; }
.footer-updated { opacity:0.85; }
.footer-links { display:flex; flex-wrap:wrap; gap:0.4rem 1.25rem; font-size:0.85rem; }
.footer-links a { color:var(--muted); text-decoration:underline; text-underline-offset:2px; }
.footer-links a:hover { color:var(--link); }

@media (max-width:760px) {
  .masthead-inner { padding:0.6rem 1.25rem; }
  /* The horizontal nav is replaced by the fixed bottom bar on mobile. */
  .top-nav { display:none; }
  .masthead-actions { margin-left:0; }
  .shell { grid-template-columns:1fr; }
  .sidebar { position:static; height:auto; border-right:none; border-bottom:1px solid var(--border); }
  .main { padding:1.5rem 1.25rem 2.5rem; }
  .site-footer { padding:1.4rem 1.25rem 2.5rem; }
  .footer-links { margin-left:0; }

  /* Leave room for the fixed bottom bar so it never covers content/footer. */
  body { padding-bottom:calc(58px + env(safe-area-inset-bottom,0px)); }

  .bottom-nav {
    display:flex; position:fixed; left:0; right:0; bottom:0; z-index:20;
    background:var(--bg); border-top:1px solid var(--border);
    padding:0.3rem 0.25rem calc(0.3rem + env(safe-area-inset-bottom,0px));
  }
  .bnav-item {
    flex:1 1 0; min-width:0; display:flex; flex-direction:column; align-items:center; gap:2px;
    background:none; border:none; cursor:pointer; text-decoration:none;
    color:var(--muted); font-size:0.66rem; font-family:inherit; padding:0.25rem 0.15rem;
  }
  .bnav-item .nav-icon { width:22px; height:22px; }
  .bnav-item span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .bnav-item.active { color:var(--link); }

  /* "More" bottom sheet */
  /* :not([hidden]) so the sheet stays hidden until JS opens it (a plain
     .more-sheet{display:block} would override the [hidden] attribute). */
  .more-sheet:not([hidden]) { display:block; position:fixed; inset:0; z-index:30; }
  .more-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.4); }
  .more-panel {
    position:absolute; left:0; right:0; bottom:0; background:var(--bg);
    border-top-left-radius:16px; border-top-right-radius:16px;
    max-height:70vh; overflow-y:auto; padding:0.5rem 1rem calc(1rem + env(safe-area-inset-bottom,0px));
    box-shadow:0 -8px 30px rgba(0,0,0,0.25);
  }
  .more-head {
    display:flex; align-items:center; justify-content:space-between;
    font-weight:700; padding:0.5rem 0.25rem; position:sticky; top:0; background:var(--bg);
  }
  .more-close { background:none; border:none; color:var(--muted); cursor:pointer; display:inline-flex; padding:0.25rem; }
  .more-close:hover { color:var(--fg); }
  .more-list { display:flex; flex-direction:column; }
  .more-item {
    display:flex; align-items:center; gap:0.75rem; padding:0.75rem 0.25rem;
    color:var(--fg); text-decoration:none; border-top:1px solid var(--border); font-size:0.95rem;
  }
  .more-item:first-child { border-top:none; }
  .more-item .nav-icon { width:20px; height:20px; color:var(--muted); flex:0 0 auto; }
  .more-item.active { color:var(--link); font-weight:600; }
  .more-item.active .nav-icon { color:var(--link); }
}
@media print {
  .masthead, .sidebar, .site-footer, .bottom-nav, .more-sheet { display:none; }
  body { padding-bottom:0; }
  .shell { display:block; }
  .main { max-width:none; }
}
`.trimStart();
}

/** Default CSS with standard font paths (equivalent to `getCSS()`). */
export const CSS = getCSS();
