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

describe('security: sanitizing profile-authored content', () => {
  it('strips <script> tags and event-handler attributes from Markdown bodies', () => {
    const sections = parseSections(
      '## About\n<script>alert(1)</script>\n\nHello<img src=x onerror="alert(1)">.\n',
    );
    const html = renderHome(PROFILE, sections);
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(1)');
  });

  it('allows the safe formatting tags Markdown produces', () => {
    const sections = parseSections('## About\n**bold** and [a link](https://example.com).\n');
    const html = renderHome(PROFILE, sections);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<a href="https://example.com">a link</a>');
  });

  it('drops javascript: URIs from Markdown links', () => {
    const sections = parseSections('## About\n[click me](javascript:alert(1))\n');
    const html = renderHome(PROFILE, sections);
    expect(html).not.toContain('javascript:');
  });

  it('rejects a javascript: avatar URL and falls back to the placeholder', () => {
    const html = renderHome({ ...PROFILE, avatar: 'javascript:alert(1)' }, []);
    expect(html).not.toContain('javascript:');
    expect(html).toContain('avatar-placeholder');
  });

  it('HTML-escapes an avatar URL containing a quote so it cannot break out of the src attribute', () => {
    const html = renderHome(
      { ...PROFILE, avatar: 'https://example.com/a.jpg" onerror="alert(1)' },
      [],
    );
    expect(html).not.toContain('onerror="alert(1)"');
  });

  it('drops a javascript: external-account URL from the sidebar links', () => {
    const html = renderHome(
      { ...PROFILE, externalAccounts: [{ label: 'Evil', url: 'javascript:alert(1)' }] },
      [],
    );
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('Evil');
  });

  it('HTML-escapes an external-account URL containing a quote', () => {
    const html = renderHome(
      {
        ...PROFILE,
        externalAccounts: [
          { label: 'Site', url: 'https://example.com/" onclick="alert(1)' },
        ],
      },
      [],
    );
    expect(html).not.toContain('onclick="alert(1)"');
  });

  it('applies the same sanitization in renderSectionPage and renderSinglePage', () => {
    const sections = parseSections('## Career\n<script>alert(1)</script>Safe text.\n');
    const career = sections[0]!;
    const sectionHtml = renderSectionPage(PROFILE, career, sections);
    const singleHtml = renderSinglePage(PROFILE, sections);
    expect(sectionHtml).not.toContain('alert(1)');
    expect(singleHtml).not.toContain('alert(1)');
    expect(sectionHtml).toContain('Safe text.');
    expect(singleHtml).toContain('Safe text.');
  });
});

describe('sidebar links: dedupe by URL', () => {
  it('does not duplicate a link that is set as both profile.website and an external account', () => {
    const html = renderHome(
      {
        ...PROFILE,
        website: 'https://gui.do',
        externalAccounts: [{ label: 'gui.do', platform: 'website', url: 'https://gui.do' }],
      },
      [],
    );
    const matches = html.match(/https:\/\/gui\.do/g) ?? [];
    // Exactly one <a href> for gui.do -- the href itself, no second occurrence
    // from a duplicated side-link entry.
    expect(matches.length).toBe(1);
    expect(html).toContain('Website');
  });

  it('treats a bare domain and its trailing-slash form as the same URL', () => {
    const html = renderHome(
      {
        ...PROFILE,
        website: 'https://gui.do',
        externalAccounts: [{ label: 'gui.do', url: 'https://gui.do/' }],
      },
      [],
    );
    const matches = html.match(/class="side-link"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('still shows two distinct links when the URLs actually differ', () => {
    const html = renderHome(
      {
        ...PROFILE,
        website: 'https://gui.do',
        externalAccounts: [{ label: 'GitHub', url: 'https://github.com/gxjansen' }],
      },
      [],
    );
    expect(html).toContain('gui.do');
    expect(html).toContain('github.com');
  });
});

describe('sidebar links: title instead of label + raw URL', () => {
  it('renders a single title per link, no separate host/URL text', () => {
    const html = renderHome(
      { ...PROFILE, externalAccounts: [{ label: 'My Blog', url: 'https://blog.example.com' }] },
      [],
    );
    expect(html).not.toContain('side-link-host');
    expect(html).not.toContain('side-link-label');
    expect(html).toContain('<a class="side-link" href="https://blog.example.com" rel="me noopener" target="_blank">My Blog</a>');
  });

  it('falls back to a properly capitalized platform name when there is no custom label', () => {
    const html = renderHome(
      { ...PROFILE, externalAccounts: [{ platform: 'github', url: 'https://github.com/gxjansen' }] },
      [],
    );
    expect(html).toContain('>GitHub<');
  });

  it('capitalizes an unrecognized platform value instead of showing it verbatim', () => {
    const html = renderHome(
      { ...PROFILE, externalAccounts: [{ platform: 'mastodon', url: 'https://example.social/@x' }] },
      [],
    );
    expect(html).toContain('>Mastodon<');
  });
});

describe('locationLine: prefers the structured locations[] array', () => {
  it('uses the pre-formatted location string from the primary entry', () => {
    const html = renderHome(
      {
        ...PROFILE,
        locationCity: undefined,
        locationCountry: undefined,
        locations: [
          { isPrimary: false, location: 'Wrong one' },
          { isPrimary: true, location: 'Rotterdam, Netherlands' },
        ],
      },
      [],
    );
    expect(html).toContain('Rotterdam, Netherlands');
    expect(html).not.toContain('Wrong one');
  });

  it('falls back to deprecated flat fields when locations[] is absent', () => {
    const html = renderHome(
      { ...PROFILE, locationCity: 'Amsterdam', locationCountry: 'NL' },
      [],
    );
    expect(html).toContain('Amsterdam, NL');
  });

  it('shows nothing when neither locations[] nor flat fields are set', () => {
    const html = renderHome(
      { handle: 'jane', displayName: 'Jane', locationCity: undefined, locationCountry: undefined },
      [],
    );
    expect(html).not.toContain('meta-line"></p>');
  });
});
