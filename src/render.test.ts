import { describe, it, expect } from "vitest";
import {
  parseSections,
  sectionSlug,
  isSidebarOnly,
  renderHome,
  renderSectionPage,
  renderSinglePage,
  type AcademicProfile,
  type RenderedSection,
} from "./render";
import { getCSS, CSS } from "./style";

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
  handle: "jane.bsky.social",
  displayName: "Jane Doe",
  headline: "Engineer",
  locationCity: "Rotterdam",
  locationCountry: "NL",
  externalAccounts: [{ label: "Website", url: "https://jane.example" }],
};

// Pre-rendered structured sections, as produced by buildProfileSections. The
// render functions consume these directly (their `html` is already sanitized);
// section-generation itself is covered in sections.test.ts.
const SECTIONS: RenderedSection[] = [
  {
    id: "about",
    slug: "index",
    title: "About",
    html: "<p>I build things.</p>",
  },
  {
    id: "career",
    slug: "career",
    title: "Career",
    html: '<ul class="cv-list"><li class="cv-entry"><strong>Job A</strong></li></ul>',
  },
  {
    id: "education",
    slug: "education",
    title: "Education",
    html: "<p>School.</p>",
  },
];

describe("parseSections", () => {
  it("parses ## headings into sections with trimmed bodies", () => {
    const sections = parseSections(MD_FIXTURE);
    expect(sections.map((s) => s.title)).toEqual([
      "About",
      "Career",
      "Education",
      "Links",
    ]);
    expect(sections[0]?.body).toBe("I build things.");
  });

  it("drops sections with empty bodies", () => {
    const sections = parseSections("## About\n\n## Career\nSomething.\n");
    expect(sections.map((s) => s.title)).toEqual(["Career"]);
  });

  it("returns an empty array for markdown with no ## headings", () => {
    expect(parseSections("Just some text.")).toEqual([]);
  });
});

describe("sectionSlug", () => {
  it("lowercases, replaces & with and, and collapses non-alnum runs to hyphens", () => {
    expect(sectionSlug("Career")).toBe("career");
    expect(sectionSlug("Awards & Honors")).toBe("awards-and-honors");
    expect(sectionSlug("  Leading/Trailing  ")).toBe("leading-trailing");
  });
});

describe("isSidebarOnly", () => {
  it('is true only for "Links" (case-insensitive)', () => {
    expect(isSidebarOnly("Links")).toBe(true);
    expect(isSidebarOnly("links")).toBe(true);
    expect(isSidebarOnly("Career")).toBe(false);
  });
});

describe("renderHome", () => {
  it("renders the About section with profile identity and default multi-page nav", () => {
    const html = renderHome(PROFILE, SECTIONS, { year: 2026 });
    expect(html).toContain("Jane Doe");
    expect(html).toContain("I build things.");
    expect(html).toContain('href="career.html"');
    expect(html).toContain("&copy; 2026 Jane Doe");
  });

  it('falls back to "No bio yet." when there is no About section', () => {
    const html = renderHome(PROFILE, []);
    expect(html).toContain("No bio yet.");
  });

  it("applies path overrides for css, favicon, and asset dirs", () => {
    const html = renderHome(PROFILE, [], {
      paths: {
        css: "/api/style",
        favicon: "/assets/f.svg",
        assetDir: "/assets",
      },
    });
    expect(html).toContain('href="/api/style"');
    expect(html).toContain('href="/assets/f.svg"');
  });

  it("injects Open Graph and Twitter meta tags when og is provided", () => {
    const html = renderHome(PROFILE, [], {
      og: {
        title: "Jane Doe CV",
        description: "desc",
        url: "https://example.com/jane",
      },
    });
    expect(html).toContain('property="og:title" content="Jane Doe CV"');
    expect(html).toContain('name="twitter:title" content="Jane Doe CV"');
  });
});

describe("renderSectionPage", () => {
  it("renders the given section as active and marks it in the nav", () => {
    const career = SECTIONS.find((s) => s.slug === "career")!;
    const html = renderSectionPage(PROFILE, career, SECTIONS);
    expect(html).toContain("Career - Jane Doe");
    expect(html).toContain("<strong>Job A</strong>");
    expect(html).toContain('aria-current="page"');
  });

  it("embeds the section HTML verbatim (already sanitized by buildProfileSections)", () => {
    const section: RenderedSection = {
      id: "career",
      slug: "career",
      title: "Career",
      html: '<ul class="cv-list"><li>Trusted &amp; safe</li></ul>',
    };
    const html = renderSectionPage(PROFILE, section, [section]);
    expect(html).toContain(
      '<ul class="cv-list"><li>Trusted &amp; safe</li></ul>'
    );
  });
});

describe("renderSinglePage", () => {
  it("renders all sections in one document, About active and others hidden", () => {
    const html = renderSinglePage(PROFILE, SECTIONS, { year: 2026 });

    expect(html).toMatch(/<section id="index" class="page-section">/);
    expect(html).toMatch(/<section id="career" class="page-section" hidden>/);
    expect(html).toMatch(
      /<section id="education" class="page-section" hidden>/
    );
    // "Links" is sidebar-only, so buildProfileSections never emits it as a body
    // section -- it is not in SECTIONS and must not appear as a page section.
    expect(html).not.toContain('id="links"');
  });

  it("uses hash-fragment nav links instead of .html files", () => {
    const html = renderSinglePage(PROFILE, SECTIONS);
    expect(html).toContain('href="#index"');
    expect(html).toContain('href="#career"');
    expect(html).not.toContain('.html"');
  });

  it("includes the section-switching script", () => {
    const html = renderSinglePage(PROFILE, []);
    expect(html).toContain("hashchange");
    expect(html).toContain("activate(location.hash.replace('#','')||'index')");
  });
});

describe("CSP nonce", () => {
  it("adds the nonce to every <script> tag in a single-page render", () => {
    const html = renderSinglePage(PROFILE, [], { nonce: "test-nonce-123" });
    const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
    // theme init (head), theme toggle, section-switching script.
    expect(scriptTags.length).toBe(3);
    for (const tag of scriptTags) {
      expect(tag).toContain('nonce="test-nonce-123"');
    }
  });

  it("adds the nonce to every <script> tag in a multi-page render", () => {
    const html = renderHome(PROFILE, [], { nonce: "abc" });
    const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    for (const tag of scriptTags) {
      expect(tag).toContain('nonce="abc"');
    }
  });

  it("emits no nonce attribute when ctx.nonce is absent", () => {
    expect(renderSinglePage(PROFILE, [])).not.toContain("nonce=");
    expect(renderHome(PROFILE, [])).not.toContain("nonce=");
  });

  it("escapes the nonce value so it cannot break out of the attribute", () => {
    const html = renderHome(PROFILE, [], { nonce: 'a"><script>x' });
    expect(html).not.toContain('a"><script>x');
    expect(html).toContain('nonce="a&quot;&gt;');
  });
});

describe("sidebar icons", () => {
  it("renders a pin icon before the location line", () => {
    const html = renderHome(
      { ...PROFILE, locationCity: "Rotterdam", locationCountry: "NL" },
      []
    );
    expect(html).toContain("meta-location");
    // teardrop map-pin path
    expect(html).toContain('<svg class="meta-icon"');
    expect(html).toContain("M12 21s7-5.686 7-11");
  });

  it("gives every sidebar link an inline icon and keeps the label", () => {
    const html = renderHome(
      {
        ...PROFILE,
        website: "https://jane.example",
        externalAccounts: [
          { platform: "github", url: "https://github.com/jane" },
        ],
      },
      []
    );
    const links = html.match(/<a class="side-link"[^>]*>.*?<\/a>/g) ?? [];
    expect(links.length).toBe(2);
    for (const a of links) {
      expect(a).toContain("side-link-icon");
      expect(a).toContain("side-link-label");
    }
  });

  it("uses the brand glyph for a known platform (github)", () => {
    const html = renderHome(
      {
        handle: "j",
        externalAccounts: [{ platform: "github", url: "https://github.com/j" }],
      },
      []
    );
    expect(html).toContain("M12 .297c-6.63 0-12 5.373-12 12"); // github path
  });

  it("falls back to a globe for an unknown / custom-website platform", () => {
    const html = renderHome(
      { handle: "j", website: "https://jane.example" },
      []
    );
    // globe uses stroked circle, not a brand fill path
    expect(html).toContain('<circle cx="12" cy="12" r="9"');
  });

  it("loads icons inline only — no favicon service or per-domain favicon fetch", () => {
    const html = renderHome(
      {
        handle: "j",
        website: "https://jane.example",
        externalAccounts: [{ platform: "github", url: "https://github.com/j" }],
      },
      []
    );
    // No third-party favicon aggregator, no per-domain /favicon.ico fetch.
    expect(html).not.toContain("duckduckgo");
    expect(html).not.toContain("s2/favicons");
    expect(html).not.toContain("/favicon.ico");
    // The only icon markup is inline <svg>.
    expect(html).toContain('<svg class="side-link-icon"');
  });
});

describe("getCSS / CSS", () => {
  it("CSS is the default getCSS() output", () => {
    expect(CSS).toBe(getCSS());
  });

  it("overrides the font directory in @font-face rules", () => {
    const css = getCSS({ fontDir: "/fonts/academic" });
    expect(css).toContain("url('/fonts/academic/quattro-regular.woff2')");
  });
});

describe("security: sidebar / identity fields", () => {
  it("rejects a javascript: avatar URL and falls back to the placeholder", () => {
    const html = renderHome({ ...PROFILE, avatar: "javascript:alert(1)" }, []);
    expect(html).not.toContain("javascript:");
    expect(html).toContain("avatar-placeholder");
  });

  it("HTML-escapes an avatar URL containing a quote so it cannot break out of the src attribute", () => {
    const html = renderHome(
      { ...PROFILE, avatar: 'https://example.com/a.jpg" onerror="alert(1)' },
      []
    );
    expect(html).not.toContain('onerror="alert(1)"');
  });

  it("drops a javascript: external-account URL from the sidebar links", () => {
    const html = renderHome(
      {
        ...PROFILE,
        externalAccounts: [{ label: "Evil", url: "javascript:alert(1)" }],
      },
      []
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Evil");
  });

  it("HTML-escapes an external-account URL containing a quote", () => {
    const html = renderHome(
      {
        ...PROFILE,
        externalAccounts: [
          { label: "Site", url: 'https://example.com/" onclick="alert(1)' },
        ],
      },
      []
    );
    expect(html).not.toContain('onclick="alert(1)"');
  });
});

describe("sidebar links: dedupe by URL", () => {
  it("does not duplicate a link that is set as both profile.website and an external account", () => {
    const html = renderHome(
      {
        ...PROFILE,
        website: "https://gui.do",
        externalAccounts: [
          { label: "gui.do", platform: "website", url: "https://gui.do" },
        ],
      },
      []
    );
    const matches = html.match(/https:\/\/gui\.do/g) ?? [];
    // Exactly one <a href> for gui.do -- the href itself, no second occurrence
    // from a duplicated side-link entry.
    expect(matches.length).toBe(1);
    expect(html).toContain("Website");
  });

  it("treats a bare domain and its trailing-slash form as the same URL", () => {
    const html = renderHome(
      {
        ...PROFILE,
        website: "https://gui.do",
        externalAccounts: [{ label: "gui.do", url: "https://gui.do/" }],
      },
      []
    );
    const matches = html.match(/class="side-link"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("still shows two distinct links when the URLs actually differ", () => {
    const html = renderHome(
      {
        ...PROFILE,
        website: "https://gui.do",
        externalAccounts: [
          { label: "GitHub", url: "https://github.com/gxjansen" },
        ],
      },
      []
    );
    expect(html).toContain("gui.do");
    expect(html).toContain("github.com");
  });
});

describe("sidebar links: title instead of label + raw URL", () => {
  it("renders a single title per link, no separate host/URL text", () => {
    const html = renderHome(
      {
        ...PROFILE,
        externalAccounts: [
          { label: "My Blog", url: "https://blog.example.com" },
        ],
      },
      []
    );
    // No second line showing the raw URL host under the title.
    expect(html).not.toContain("side-link-host");
    // The title appears exactly once, inside a single label span.
    expect(html.match(/My Blog/g)?.length).toBe(1);
    expect(html).toContain(
      '<a class="side-link" href="https://blog.example.com" rel="me noopener" target="_blank">'
    );
    expect(html).toContain('<span class="side-link-label">My Blog</span>');
  });

  it("falls back to a properly capitalized platform name when there is no custom label", () => {
    const html = renderHome(
      {
        ...PROFILE,
        externalAccounts: [
          { platform: "github", url: "https://github.com/gxjansen" },
        ],
      },
      []
    );
    expect(html).toContain(">GitHub<");
  });

  it("capitalizes an unrecognized platform value instead of showing it verbatim", () => {
    const html = renderHome(
      {
        ...PROFILE,
        externalAccounts: [
          { platform: "mastodon", url: "https://example.social/@x" },
        ],
      },
      []
    );
    expect(html).toContain(">Mastodon<");
  });
});

describe("locationLine: prefers the structured locations[] array", () => {
  it("uses the pre-formatted location string from the primary entry", () => {
    const html = renderHome(
      {
        ...PROFILE,
        locationCity: undefined,
        locationCountry: undefined,
        locations: [
          { isPrimary: false, location: "Wrong one" },
          { isPrimary: true, location: "Rotterdam, Netherlands" },
        ],
      },
      []
    );
    expect(html).toContain("Rotterdam, Netherlands");
    expect(html).not.toContain("Wrong one");
  });

  it("falls back to deprecated flat fields when locations[] is absent", () => {
    const html = renderHome(
      { ...PROFILE, locationCity: "Amsterdam", locationCountry: "NL" },
      []
    );
    expect(html).toContain("Amsterdam, NL");
  });

  it("shows nothing when neither locations[] nor flat fields are set", () => {
    const html = renderHome(
      {
        handle: "jane",
        displayName: "Jane",
        locationCity: undefined,
        locationCountry: undefined,
      },
      []
    );
    expect(html).not.toContain('meta-line"></p>');
  });
});

describe("mobile bottom nav", () => {
  const many: RenderedSection[] = [
    { id: "about", slug: "index", title: "About", html: "<p>a</p>" },
    { id: "career", slug: "career", title: "Career", html: "<p>c</p>" },
    { id: "skills", slug: "skills", title: "Skills", html: "<p>s</p>" },
    { id: "projects", slug: "projects", title: "Projects", html: "<p>p</p>" },
    {
      id: "publications",
      slug: "publications",
      title: "Publications",
      html: "<p>pub</p>",
    },
    { id: "awards", slug: "awards", title: "Awards", html: "<p>aw</p>" },
    {
      id: "languages",
      slug: "languages",
      title: "Languages",
      html: "<p>l</p>",
    },
  ];

  it("renders a bottom nav with per-section icons", () => {
    const html = renderSinglePage(PROFILE, many);
    expect(html).toContain('class="bottom-nav"');
    expect(html).toContain('class="nav-icon"');
  });

  it("with >5 sections: first 4 + a More button + a sheet holding the rest", () => {
    const html = renderSinglePage(PROFILE, many); // 7 sections
    expect((html.match(/class="bnav-item/g) ?? []).length).toBe(5); // 4 links + More button
    expect(html).toContain("bnav-more");
    expect(html).toContain('id="more-sheet"');
    expect((html.match(/class="more-item/g) ?? []).length).toBe(3); // 7 - 4
  });

  it("with <=5 sections: all in the bar, no More button or sheet", () => {
    const html = renderSinglePage(PROFILE, many.slice(0, 5));
    expect((html.match(/class="bnav-item/g) ?? []).length).toBe(5); // 5 section links
    expect(html).not.toContain('id="more-sheet"'); // no sheet element
    expect(html).not.toContain("<span>More</span>"); // no More button label
  });

  it("renders no bottom nav when there are no sections", () => {
    expect(renderSinglePage(PROFILE, [])).not.toContain('class="bottom-nav"');
  });

  it("nonces the bottom-nav sheet script", () => {
    const html = renderSinglePage(PROFILE, many, { nonce: "abc" });
    for (const s of html.match(/<script\b[^>]*>/g) ?? [])
      expect(s).toContain('nonce="abc"');
  });
});
