/**
 * Slug + legacy `.md` parsing helpers, split out so both the layout renderer
 * (`render.ts`) and the structured section builder (`sections.ts`) can use
 * `sectionSlug` without a circular import.
 */

/** A parsed markdown section (title + body). */
export interface ParsedSection {
  title: string;
  body: string;
}

/**
 * Parse a markdown string into sections keyed by `##` headings.
 *
 * @deprecated The renderer now builds sections from the structured SDK
 * `Profile` via {@link ./sections.ts}#buildProfileSections rather than from the
 * `.md` export. Kept as a public utility for consumers that still parse `.md`.
 */
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
