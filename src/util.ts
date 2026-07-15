/**
 * Shared HTML-safety utilities used by both the layout renderer (`render.ts`)
 * and the structured section renderer (`sections.ts`).
 *
 * These live in their own module so the two renderers can share the exact same
 * escaping / URL-validation / Markdown-sanitization behavior without a circular
 * import between them.
 */

import { marked } from 'marked';
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
 * Convert profile-authored Markdown to HTML and sanitize it. `marked`
 * passes through raw HTML in its input verbatim (that's how Markdown
 * works), so unsanitized output would let profile content run arbitrary
 * script or event-handler attributes on the rendered page.
 */
export function renderMarkdown(body: string): string {
  return DOMPurify.sanitize(marked.parse(body) as string, {
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
