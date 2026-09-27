/**
 * Shared HTML-safety utilities used by both the layout renderer (`render.ts`)
 * and the structured section renderer (`sections.ts`).
 *
 * These live in their own module so the two renderers can share the exact same
 * escaping / URL-validation / Markdown-sanitization behavior without a circular
 * import between them.
 */

import { Marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

/** HTML-escape a value for safe interpolation into markup or an attribute. */
export function escapeHtml(s: string | number | undefined | null): string {
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

/**
 * Validate and escape a profile-supplied URL for use in an `href`/`src`
 * attribute. Rejects everything but `http:`/`https:` (blocks `javascript:`
 * and other executable schemes) and HTML-escapes the result so it can't
 * break out of the surrounding quotes. Returns `null` for anything unsafe
 * or unparseable so the caller can omit the attribute/element entirely.
 */
export function safeUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return escapeHtml(url);
}

/**
 * Markdown parser that shows raw HTML as literal text instead of passing it
 * through. Profile text such as `Tools: <React>, <Vue>` is prose, not markup;
 * letting `marked` emit it as tags made DOMPurify drop the words entirely.
 * Code spans keep their own escaping, so `Map<K, V>` in backticks is intact.
 */
const markdown = new Marked({
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
  },
});

/**
 * Convert profile-authored Markdown to HTML and sanitize it. Raw HTML in the
 * input is escaped at parse time (see `markdown`), and the output still goes
 * through the DOMPurify allowlist, so profile content can never run script or
 * event-handler attributes on the rendered page.
 */
export function renderMarkdown(body: string): string {
  return DOMPurify.sanitize(markdown.parse(body) as string, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'a',
      'ul',
      'ol',
      'li',
      'code',
      'pre',
      'blockquote',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}
