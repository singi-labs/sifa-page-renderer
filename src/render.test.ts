import { describe, it, expect } from 'vitest';
import {
  parseSections,
  sectionSlug,
  isSidebarOnly,
  renderHome,
  renderSectionPage,
  renderSinglePage,
  type AcademicProfile,
} from './render';
import { getCSS, CSS } from './style';

const MD_FIXTURE = `## About
I build things.

## Career
- Job A
- Job B

## Education
School.

## Links
- https://example.com
`;

const PROFILE: AcademicProfile = {
  handle: 'jane.bsky.social',
  displayName: 'Jane Doe',
  headline: 'Engineer',
  locationCity: 'Rotterdam',
  locationCountry: 'NL',
  externalAccounts: [{ label: 'Website', url: 'https://jane.example' }],
};

describe('parseSections', () => {
  it('parses ## headings into sections with trimmed bodies', () => {
    const sections = parseSections(MD_FIXTURE);
    expect(sections.map((s) => s.title)).toEqual(['About', 'Career', 'Education', 'Links']);
    expect(sections[0]?.body).toBe('I build things.');
  });

  it('drops sections with empty bodies', () => {
    const sections = parseSections('## About\n\n## Career\nSomething.\n');
    expect(sections.map((s) => s.title)).toEqual(['Career']);
  });

  it('returns an empty array for markdown with no ## headings', () => {
    expect(parseSections('Just some text.')).toEqual([]);
  });
});

describe('sectionSlug', () => {
  it('lowercases, replaces & with and, and collapses non-alnum runs to hyphens', () => {
    expect(sectionSlug('Career')).toBe('career');
    expect(sectionSlug('Awards & Honors')).toBe('awards-and-honors');
    expect(sectionSlug('  Leading/Trailing  ')).toBe('leading-trailing');
  });
});

describe('isSidebarOnly', () => {
  it('is true only for "Links" (case-insensitive)', () => {
    expect(isSidebarOnly('Links')).toBe(true);
    expect(isSidebarOnly('links')).toBe(true);
    expect(isSidebarOnly('Career')).toBe(false);
  });
});

describe('renderHome', () => {
  it('renders the About section with profile identity and default multi-page nav', () => {
    const sections = parseSections(MD_FIXTURE);
    const html = renderHome(PROFILE, sections, { year: 2026 });
    expect(html).toContain('Jane Doe');
    expect(html).toContain('I build things.');
    expect(html).toContain('href="career.html"');
    expect(html).toContain('&copy; 2026 Jane Doe');
  });

  it('falls back to "No bio yet." when there is no About section', () => {
    const html = renderHome(PROFILE, []);
    expect(html).toContain('No bio yet.');
  });

  it('applies path overrides for css, favicon, and asset dirs', () => {
    const html = renderHome(PROFILE, [], {
      paths: { css: '/api/style', favicon: '/assets/f.svg', assetDir: '/assets' },
    });
    expect(html).toContain('href="/api/style"');
    expect(html).toContain('href="/assets/f.svg"');
  });

  it('injects Open Graph and Twitter meta tags when og is provided', () => {
    const html = renderHome(PROFILE, [], {
      og: { title: 'Jane Doe CV', description: 'desc', url: 'https://example.com/jane' },
    });
    expect(html).toContain('property="og:title" content="Jane Doe CV"');
    expect(html).toContain('name="twitter:title" content="Jane Doe CV"');
  });
});

describe('renderSectionPage', () => {
  it('renders the given section as active and marks it in the nav', () => {
    const sections = parseSections(MD_FIXTURE);
    const career = sections.find((s) => s.title === 'Career')!;
    const html = renderSectionPage(PROFILE, career, sections);
    expect(html).toContain('Career - Jane Doe');
    expect(html).toContain('<li>Job A');
    expect(html).toContain('aria-current="page"');
  });
});

describe('renderSinglePage', () => {
  it('renders all non-sidebar sections in one document, About active and others hidden', () => {
    const sections = parseSections(MD_FIXTURE);
    const html = renderSinglePage(PROFILE, sections, { year: 2026 });

    expect(html).toMatch(/<section id="index" class="page-section">/);
    expect(html).toMatch(/<section id="career" class="page-section" hidden>/);
    expect(html).toMatch(/<section id="education" class="page-section" hidden>/);
    // "Links" is sidebar-only, never rendered as a page section.
    expect(html).not.toContain('id="links"');
  });

  it('uses hash-fragment nav links instead of .html files', () => {
    const sections = parseSections(MD_FIXTURE);
    const html = renderSinglePage(PROFILE, sections);
    expect(html).toContain('href="#index"');
    expect(html).toContain('href="#career"');
    expect(html).not.toContain('.html"');
  });

  it('includes the section-switching script', () => {
    const html = renderSinglePage(PROFILE, []);
    expect(html).toContain('hashchange');
    expect(html).toContain("activate(location.hash.replace('#','')||'index')");
  });
});

describe('getCSS / CSS', () => {
  it('CSS is the default getCSS() output', () => {
    expect(CSS).toBe(getCSS());
  });

  it('overrides the font directory in @font-face rules', () => {
    const css = getCSS({ fontDir: '/fonts/academic' });
    expect(css).toContain("url('/fonts/academic/quattro-regular.woff2')");
  });
});
