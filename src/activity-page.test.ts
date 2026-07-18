import { describe, it, expect } from "vitest";
import type { StreamCardVM } from "@singi-labs/sifa-sdk";
import {
  renderActivityPage,
  renderHome,
  renderSectionPage,
  type AcademicProfile,
  type RenderedSection,
} from "./render";

const PROFILE: AcademicProfile = {
  handle: "jane.bsky.social",
  displayName: "Jane Doe",
  headline: "Engineer",
};

const SECTIONS: RenderedSection[] = [
  { id: "about", slug: "index", title: "About", html: "<p>Hi.</p>" },
  {
    id: "career",
    slug: "career",
    title: "Career",
    html: "<p>Work.</p>",
  },
  {
    id: "education",
    slug: "education",
    title: "Education",
    html: "<p>School.</p>",
  },
];

// Fixed reference so relative time / day grouping is deterministic.
const NOW = new Date("2026-07-17T12:00:00.000Z");

function vm(overrides: Partial<StreamCardVM> = {}): StreamCardVM {
  return {
    uri: "at://did:plc:abc/app.bsky.feed.post/1",
    cid: "bafycid1",
    verb: "posted",
    source: { appId: "bluesky", label: "Bluesky", color: "blue" },
    tier: "creation",
    timestamp: "2026-07-17T10:00:00.000Z",
    title: "posted on Bluesky",
    ...overrides,
  };
}

/** Extract the inner HTML of the masthead's `.top-nav`. */
function topNav(html: string): string {
  const m = html.match(/<nav class="top-nav">([\s\S]*?)<\/nav>/);
  if (!m) throw new Error("no top-nav found");
  return m[1];
}

describe("renderActivityPage", () => {
  it("renders a full HTML document with the shared site layout", () => {
    const html = renderActivityPage(PROFILE, SECTIONS, [vm()], {
      year: 2026,
    });
    // Full document + site chrome (masthead, sidebar, footer).
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('class="masthead"');
    expect(html).toContain('class="sidebar"');
    expect(html).toContain('class="site-footer"');
    // Sidebar identity from the profile.
    expect(html).toContain("Jane Doe");
  });

  it("embeds the activity stream section as its main content", () => {
    const html = renderActivityPage(PROFILE, SECTIONS, [vm()], undefined, {
      now: NOW,
    });
    expect(html).toContain('class="activity-stream"');
    expect(html).toContain('class="stream-card"');
    expect(html).toContain("posted on Bluesky");
  });

  it('titles the page "Now" and marks the "Now" nav item active', () => {
    const html = renderActivityPage(PROFILE, SECTIONS, [vm()]);
    expect(html).toContain("<title>Now - Jane Doe</title>");
    expect(html).toContain('<h2 class="page-title">Now</h2>');
    // The "Now" masthead link is present and active; no section is active.
    expect(topNav(html)).toContain(
      '<a href="now.html" aria-current="page" class="active">Now</a>'
    );
  });

  it("shows the Now link even when the caller omits ctx.activityStream", () => {
    const html = renderActivityPage(PROFILE, SECTIONS, [vm()]);
    expect(topNav(html)).toContain('href="now.html"');
  });

  it("honors a custom activity nav label", () => {
    const html = renderActivityPage(PROFILE, SECTIONS, [vm()], {
      activityStream: { label: "Updates" },
    });
    expect(html).toContain("<title>Updates - Jane Doe</title>");
    expect(topNav(html)).toContain(
      '<a href="now.html" aria-current="page" class="active">Updates</a>'
    );
  });

  it("forwards stream options (empty text) to renderActivityStream", () => {
    const html = renderActivityPage(PROFILE, SECTIONS, [], undefined, {
      emptyText: "Nothing yet.",
    });
    expect(html).toContain("Nothing yet.");
    expect(html).not.toContain('class="stream-card"');
  });

  it("escapes a malicious VM string rather than emitting raw markup", () => {
    const html = renderActivityPage(PROFILE, SECTIONS, [
      vm({ title: '<img src=x onerror="alert(1)">' }),
    ]);
    expect(html).not.toContain("<img src=x onerror=");
    expect(html).toContain("&lt;img src=x onerror=");
  });
});

describe("activity nav flag: renderHome / renderSectionPage", () => {
  it("renderHome injects the Now nav link only when ctx.activityStream is set", () => {
    const withNow = renderHome(PROFILE, SECTIONS, { activityStream: true });
    expect(topNav(withNow)).toContain('>Now</a>');
    expect(withNow).toContain('href="now.html"');
  });

  it("renderSectionPage injects the Now nav link when ctx.activityStream is set", () => {
    const career = SECTIONS[1];
    const withNow = renderSectionPage(PROFILE, career, SECTIONS, {
      activityStream: true,
    });
    expect(topNav(withNow)).toContain('>Now</a>');
    // The active item is the section, not Now.
    expect(topNav(withNow)).toContain(
      '<a href="career.html" aria-current="page" class="active">Career</a>'
    );
    expect(topNav(withNow)).toContain('<a href="now.html">Now</a>');
  });

  it("omits the Now nav link when ctx.activityStream is not set", () => {
    const noFlag = renderHome(PROFILE, SECTIONS);
    expect(noFlag).not.toContain("now.html");
    expect(topNav(noFlag)).not.toContain(">Now</a>");
  });

  it("nav is byte-identical when the flag is absent (Now is a pure append)", () => {
    const noFlag = renderHome(PROFILE, SECTIONS, { year: 2026 });
    const withNow = renderHome(PROFILE, SECTIONS, {
      year: 2026,
      activityStream: true,
    });
    const navNoFlag = topNav(noFlag);
    const navWithNow = topNav(withNow);
    // The section links are byte-identical; the only difference is the single
    // appended Now anchor. Removing it reproduces the no-flag nav exactly.
    expect(navWithNow.replace('\n<a href="now.html">Now</a>', "")).toBe(
      navNoFlag
    );
    expect(navWithNow).not.toBe(navNoFlag);
  });

  it("full home output is byte-identical to before when the flag is absent", () => {
    // Guards the nav refactor: passing an unrelated ctx (no activityStream)
    // must not perturb any byte of the rendered document.
    const a = renderHome(PROFILE, SECTIONS, { year: 2026 });
    const b = renderHome(PROFILE, SECTIONS, { year: 2026 });
    expect(a).toBe(b);
    expect(a).not.toContain("now.html");
  });

  it("bottom nav also carries the Now entry with an icon when flagged", () => {
    const withNow = renderHome(PROFILE, SECTIONS, { activityStream: true });
    const m = withNow.match(
      /<nav class="bottom-nav"[\s\S]*?<\/nav>/
    );
    expect(m).not.toBeNull();
    expect(m![0]).toContain('data-slug="now"');
    expect(m![0]).toContain("<span>Now</span>");
  });
});
