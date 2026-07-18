/**
 * Lucide (ISC) icon shapes for the mobile bottom-nav, keyed by section id
 * (plus `more`/`close` for the UI). Inner SVG only; `navIcon()` wraps them.
 */
const SECTION_ICON_SHAPES: Record<string, string> = {
  about: `<path d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' /><circle cx='12' cy='7' r='4' />`,
  career: `<path d='M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' /><rect width='20' height='14' x='2' y='6' rx='2' />`,
  skills: `<path d='M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' /><path d='M20 2v4' /><path d='M22 4h-4' /><circle cx='4' cy='20' r='2' />`,
  projects: `<path d='M18 19a5 5 0 0 1-5-5v8' /><path d='M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5' /><circle cx='13' cy='12' r='2' /><circle cx='20' cy='19' r='2' />`,
  presentations: `<path d='M2 3h20' /><path d='M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3' /><path d='m7 21 5-5 5 5' />`,
  publications: `<path d='M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20' /><path d='M8 11h8' /><path d='M8 7h6' />`,
  credentials: `<path d='M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z' /><path d='m9 12 2 2 4-4' />`,
  education: `<path d='M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z' /><path d='M22 10v6' /><path d='M6 12.5V16a6 3 0 0 0 12 0v-3.5' />`,
  courses: `<path d='M12 7v14' /><path d='M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' />`,
  awards: `<path d='M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978' /><path d='M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978' /><path d='M18 9h1.5a1 1 0 0 0 0-5H18' /><path d='M4 22h16' /><path d='M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z' /><path d='M6 9H4.5a1 1 0 0 1 0-5H6' />`,
  involvement: `<path d='M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762' />`,
  languages: `<path d='m5 8 6 6' /><path d='m4 14 6-6 2-3' /><path d='M2 5h12' /><path d='M7 2h1' /><path d='m22 22-5-10-5 10' /><path d='M14 18h6' />`,
  now: `<circle cx='12' cy='12' r='10' /><polyline points='12 6 12 12 16 14' />`,
  more: `<circle cx='12' cy='12' r='1' /><circle cx='19' cy='12' r='1' /><circle cx='5' cy='12' r='1' />`,
  close: `<path d='M18 6 6 18' /><path d='m6 6 12 12' />`,
};

/** Generic fallback (dot) for an unmapped section id. */
const FALLBACK_ICON = `<circle cx='12' cy='12' r='4' />`;

/**
 * Render a nav icon as an inline stroked SVG (Lucide style). `id` is a
 * section id, `more`, or `close`.
 */
export function navIcon(id: string): string {
  const shapes = SECTION_ICON_SHAPES[id] ?? FALLBACK_ICON;
  return (
    `<svg class="nav-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`
  );
}
