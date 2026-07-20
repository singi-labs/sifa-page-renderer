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

describe("sidebar Bluesky identity link", () => {
  it("always renders the user's Bluesky @handle, even with no account added", () => {
    // PROFILE lists only a Website external account, no Bluesky.
    const html = renderHome(PROFILE, []);
    expect(html).toContain('href="https://bsky.app/profile/jane.bsky.social"');
    expect(html).toContain("@jane.bsky.social");
    // The Bluesky butterfly icon uses a distinct 600x530 viewBox.
    expect(html).toContain('viewBox="0 0 600 530"');
  });

  it("does not duplicate when the profile already lists that Bluesky profile", () => {
    const p: AcademicProfile = {
      ...PROFILE,
      externalAccounts: [
        {
          label: "Bluesky",
          platform: "bluesky",
          url: "https://bsky.app/profile/jane.bsky.social",
        },
      ],
    };
    const html = renderHome(p, []);
    const occurrences =
      html.split('href="https://bsky.app/profile/jane.bsky.social"').length - 1;
    expect(occurrences).toBe(1);
    // The canonical @handle label wins over a bare "Bluesky" label.
    expect(html).toContain("@jane.bsky.social");
  });

  it("omits the Bluesky link when the profile has no handle", () => {
    const p: AcademicProfile = { ...PROFILE, handle: null };
    const html = renderHome(p, []);
    expect(html).not.toContain("bsky.app/profile/");
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
    // theme init (head), theme toggle, section-switching script, JSON-LD.
    expect(scriptTags.length).toBe(4);
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
    // 4 links: the always-on Sifa ID + Bluesky @handle identity links, plus
    // website + github.
    expect(links.length).toBe(4);
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

  it("uses the ActivityPub mark (not the Fediverse glyph) for a fediverse platform", () => {
    const html = renderHome(
      {
        handle: "j",
        externalAccounts: [
          { platform: "fediverse", url: "https://mastodon.social/@j" },
        ],
      },
      []
    );
    // The ActivityPub mark (Simple Icons), the same logo sifa-web renders.
    expect(html).toContain("M10.91 4.442L0 10.74");
    // and the old Fediverse glyph is gone.
    expect(html).not.toContain("M23.268 5.313");
  });

  it("treats an activitypub-platform account as fediverse (icon + label)", () => {
    // Keytrace/keyoxide proofs surface the platform as `activitypub`, a synonym
    // the SDK normalizes to `fediverse`. Without a custom label it should read
    // "Fediverse", not the capitalized "Activitypub".
    const html = renderHome(
      {
        handle: "j",
        externalAccounts: [
          { platform: "activitypub", url: "https://mstdn.social/@j" },
        ],
      },
      []
    );
    expect(html).toContain("M10.91 4.442L0 10.74"); // ActivityPub mark
    expect(html).toContain("Fediverse");
    expect(html).not.toContain(">Activitypub<");
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

  it("reveals the nav submenu on hover and keyboard focus (no JS)", () => {
    const css = getCSS();
    expect(css).toContain(".nav-group-menu");
    // The submenu opens on pointer hover AND :focus-within (keyboard Tab).
    expect(css).toMatch(/\.nav-group:hover .nav-group-menu/);
    expect(css).toMatch(/\.nav-group:focus-within .nav-group-menu/);
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
    // Exactly one sidebar <a href> for gui.do (the JSON-LD sameAs also lists the
    // URL, so match the href specifically rather than any occurrence).
    const matches = html.match(/href="https:\/\/gui\.do"/g) ?? [];
    expect(matches.length).toBe(1);
    expect(html).toContain("Website");
  });

  it("treats a bare domain and its trailing-slash form as the same URL", () => {
    const html = renderHome(
      {
        ...PROFILE,
        // No handle here, so the always-on Bluesky identity link doesn't
        // count toward this URL-dedup assertion.
        handle: null,
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

// --- Part A: grouped desktop nav -------------------------------------------

/** Inner HTML of the masthead `.top-nav`. */
function topNav(html: string): string {
  const m = html.match(/<nav class="top-nav">([\s\S]*?)<\/nav>/);
  if (!m) throw new Error("no top-nav found");
  return m[1];
}

// career + skills both live in the "experience" SDK group, so this fixture
// forces a multi-item group (which collapses into a dropdown) alongside
// single-item groups (about -> overview, education -> qualifications).
const GROUPED_SECTIONS: RenderedSection[] = [
  { id: "about", slug: "index", title: "About", html: "<p>a</p>" },
  { id: "career", slug: "career", title: "Career", html: "<p>c</p>" },
  { id: "skills", slug: "skills", title: "Skills", html: "<p>s</p>" },
  { id: "education", slug: "education", title: "Education", html: "<p>e</p>" },
];

describe("grouped desktop nav", () => {
  it("collapses a multi-section group into a labelled submenu", () => {
    const nav = topNav(renderSinglePage(PROFILE, GROUPED_SECTIONS));
    // The two experience sections move under an "Experience" group trigger.
    expect(nav).toContain("nav-group");
    expect(nav).toContain(">Experience</button>");
    // Both experience sections are the submenu's items (single-page hash hrefs).
    expect(nav).toContain('<a href="#career">Career</a>');
    expect(nav).toContain('<a href="#skills">Skills</a>');
  });

  it("keeps a single-section group as a flat top-level link", () => {
    const nav = topNav(renderSinglePage(PROFILE, GROUPED_SECTIONS));
    // Education is the only "qualifications" section -> flat, no dropdown.
    expect(nav).toContain('<a href="#education">Education</a>');
    // About (the sole "overview" section) stays a flat link, with no
    // "Overview" group heading wrapping it.
    expect(nav).toContain(">About</a>");
    expect(nav).not.toContain(">Overview</button>");
  });

  it("uses a non-link, focusable button as the group trigger (no-JS hover/focus)", () => {
    const nav = topNav(renderSinglePage(PROFILE, GROUPED_SECTIONS));
    expect(nav).toContain('<button type="button" class="nav-group-label"');
    expect(nav).toContain('class="nav-group-menu"');
  });

  it("marks the group active when one of its sections is the active page", () => {
    const skills = GROUPED_SECTIONS.find((s) => s.slug === "skills")!;
    const nav = topNav(renderSectionPage(PROFILE, skills, GROUPED_SECTIONS));
    // The Experience container carries `active` because Skills is active...
    expect(nav).toContain('class="nav-group active"');
    // ...and the active child still gets aria-current inside the menu.
    expect(nav).toContain(
      '<a href="skills.html" aria-current="page" class="active">Skills</a>'
    );
  });

  it("leaves nav flat (no groups) when every group has one section", () => {
    // SECTIONS = about/career/education, one section per group.
    const nav = topNav(renderSinglePage(PROFILE, SECTIONS));
    expect(nav).not.toContain("nav-group");
    expect(nav).toContain('<a href="#career">Career</a>');
  });

  it("keeps the Now activity entry as a flat top-level link", () => {
    const nav = topNav(
      renderSinglePage(PROFILE, GROUPED_SECTIONS, { activityStream: true })
    );
    expect(nav).toContain('<a href="now.html">Now</a>');
  });
});

// --- Part B: sidebar Sifa link + ordering ----------------------------------

/** Ordered list of sidebar link hrefs, top to bottom. */
function sideLinkHrefs(html: string): string[] {
  return [...html.matchAll(/<a class="side-link" href="([^"]*)"/g)].map(
    (m) => m[1]
  );
}

describe("sidebar: Sifa ID link + link ordering", () => {
  it("always surfaces a Sifa ID link to the canonical profile", () => {
    const html = renderHome(PROFILE, []);
    expect(html).toContain('href="https://sifa.id/p/jane.bsky.social"');
    expect(html).toContain(">Sifa ID</span>");
  });

  it("omits the sidebar Sifa link when no handle is known", () => {
    // The footer's "full Sifa ID" link is separate; scope to sidebar links.
    const hrefs = sideLinkHrefs(renderHome({ ...PROFILE, handle: null }, []));
    expect(hrefs.some((h) => h.includes("sifa.id/p/"))).toBe(false);
  });

  it("orders links: primary, Sifa, Bluesky, then the rest", () => {
    const html = renderHome(
      {
        handle: "jane.bsky.social",
        externalAccounts: [
          { label: "GitHub", platform: "github", url: "https://github.com/jane" },
          {
            label: "My Site",
            platform: "website",
            url: "https://jane.example",
            primary: true,
          },
        ],
      },
      []
    );
    expect(sideLinkHrefs(html)).toEqual([
      "https://jane.example",
      "https://sifa.id/p/jane.bsky.social",
      "https://bsky.app/profile/jane.bsky.social",
      "https://github.com/jane",
    ]);
  });

  it("starts at Sifa when no link is marked primary", () => {
    const hrefs = sideLinkHrefs(renderHome(PROFILE, []));
    expect(hrefs[0]).toBe("https://sifa.id/p/jane.bsky.social");
    expect(hrefs[1]).toBe("https://bsky.app/profile/jane.bsky.social");
  });

  it("shows a primary account only once (hoisted, not duplicated)", () => {
    const html = renderHome(
      {
        handle: "jane.bsky.social",
        externalAccounts: [
          {
            label: "My Site",
            platform: "website",
            url: "https://jane.example",
            primary: true,
          },
        ],
      },
      []
    );
    const dupes = sideLinkHrefs(html).filter(
      (h) => h === "https://jane.example"
    );
    expect(dupes.length).toBe(1);
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
          { platform: "friendster", url: "https://example.social/@x" },
        ],
      },
      []
    );
    expect(html).toContain(">Friendster<");
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

describe("sidebar links: differentiate + bluesky", () => {
  it("shows the URL underneath when several links share a label", () => {
    const html = renderHome(
      {
        ...PROFILE,
        website: undefined,
        externalAccounts: [
          { platform: "bsky", url: "https://bsky.app/profile/a.example" },
          { platform: "bsky", url: "https://bsky.app/profile/b.example" },
          { platform: "github", url: "https://github.com/x" },
        ],
      },
      []
    );
    // both bsky links labelled "Bluesky" -> each gets a differentiating sub-line
    expect((html.match(/side-link-sub">/g) ?? []).length).toBe(2);
    expect(html).toContain("bsky.app/profile/a.example");
    expect(html).toContain("bsky.app/profile/b.example");
  });

  it("keeps unique-label links single-line (no sub)", () => {
    const html = renderHome(
      {
        ...PROFILE,
        website: undefined,
        externalAccounts: [{ platform: "github", url: "https://github.com/x" }],
      },
      []
    );
    expect(html).not.toContain("side-link-sub");
  });

  it("renders the Bluesky butterfly for bsky/bluesky platforms", () => {
    const html = renderHome(
      {
        ...PROFILE,
        website: undefined,
        externalAccounts: [
          { platform: "bsky", url: "https://bsky.app/profile/x" },
        ],
      },
      []
    );
    expect(html).toContain('viewBox="0 0 600 530"'); // butterfly viewBox
    expect(html).toContain('side-link-label">Bluesky<');
  });
});

describe("SEO meta + JSON-LD", () => {
  it("emits canonical link, meta description, and twitter:card", () => {
    const html = renderHome(PROFILE, [], {
      canonical: "https://sifa.id/p/jane",
      og: { description: "Jane on Sifa", image: "https://x/card" },
    });
    expect(html).toContain(
      '<link rel="canonical" href="https://sifa.id/p/jane">'
    );
    expect(html).toContain('<meta name="description" content="Jane on Sifa">');
    expect(html).toContain('twitter:card" content="summary_large_image"');
  });

  it("emits a valid Schema.org Person JSON-LD with sameAs from links", () => {
    const html = renderHome(
      {
        ...PROFILE,
        website: "https://jane.example",
        avatar: "https://cdn/x.png",
        headline: "Engineer",
        externalAccounts: [
          { platform: "github", url: "https://github.com/jane" },
        ],
      },
      [],
      { canonical: "https://sifa.id/p/jane" }
    );
    const m = html.match(
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/
    );
    expect(m).toBeTruthy();
    const o = JSON.parse(m![1].replace(/\\u003c/g, "<"));
    expect(o["@type"]).toBe("Person");
    expect(o.name).toBe("Jane Doe");
    expect(o.url).toBe("https://sifa.id/p/jane");
    expect(o.sameAs).toEqual(
      expect.arrayContaining([
        "https://jane.example",
        "https://github.com/jane",
      ])
    );
    expect(o.jobTitle).toBe("Engineer");
  });

  it("escapes < in JSON-LD so user content cannot break out of the script", () => {
    const html = renderHome(
      { ...PROFILE, about: "</script><img src=x onerror=alert(1)>" },
      [],
      {}
    );
    const m = html.match(
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/
    );
    expect(m![1]).not.toContain("</script");
    expect(m![1]).not.toContain("<img");
  });

  it("nonces the JSON-LD script", () => {
    expect(renderHome(PROFILE, [], { nonce: "abc" })).toContain(
      'ld+json" nonce="abc"'
    );
  });

  it("omits canonical/description tags when not provided", () => {
    const html = renderHome(PROFILE, [], {});
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('name="description"');
  });
});
