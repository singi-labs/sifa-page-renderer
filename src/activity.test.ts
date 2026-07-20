import { describe, it, expect } from "vitest";
import type { StreamCardVM } from "@singi-labs/sifa-sdk";
import { renderActivityStream } from "./activity";

// Minimal builder so each fixture only specifies the fields under test; the
// common chrome (uri/cid/verb/source/tier/timestamp/title) always has a value.
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

// Fixed reference point so day-grouping / relative time is deterministic.
const NOW = new Date("2026-07-17T12:00:00.000Z");

describe("renderActivityStream: common chrome", () => {
  it("renders a section with the source label, verb-aware title, and a machine-readable timestamp", () => {
    const html = renderActivityStream([vm()], { now: NOW });
    expect(html).toContain('class="activity-stream"');
    expect(html).toContain("Bluesky");
    expect(html).toContain("posted on Bluesky");
    expect(html).toContain('datetime="2026-07-17T10:00:00.000Z"');
  });

  it("carries the at-uri as a stable data attribute for keying", () => {
    const html = renderActivityStream([vm()], { now: NOW });
    expect(html).toContain(
      'data-uri="at://did:plc:abc/app.bsky.feed.post/1"'
    );
  });

  it("renders empty-state text for an empty stream", () => {
    const html = renderActivityStream([], { emptyText: "Nothing here yet." });
    expect(html).toContain("Nothing here yet.");
    expect(html).not.toContain('class="stream-card"');
  });

  it("is a named export returning a string", () => {
    expect(typeof renderActivityStream([], {})).toBe("string");
  });
});

describe("renderActivityStream: app icons", () => {
  it("shows the category glyph only in the pill, with no separate top-left card icon", () => {
    const html = renderActivityStream([vm()], { now: NOW });
    // The glyph lives inside the source pill; there is no duplicate top-left icon.
    expect(html).toContain('class="stream-source-glyph"');
    expect(html).not.toContain('class="stream-card-icon"');
  });

  it("carries the pill glyph for a popfeed item too (no brand logos shipped)", () => {
    const html = renderActivityStream(
      [
        vm({
          source: { appId: "popfeed", label: "Popfeed", color: "purple" },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('class="stream-source-glyph"');
    expect(html).not.toContain('class="stream-card-icon"');
  });

  it("renders a glyph before the app name inside the source pill", () => {
    const html = renderActivityStream([vm()], { now: NOW });
    // The glyph span precedes the escaped app-name text within the pill.
    expect(html).toContain('class="stream-source-glyph"');
    expect(html).toMatch(/stream-source-glyph[\s\S]*?<\/span>Bluesky<\/span>/);
  });
});

describe("renderActivityStream: body kinds", () => {
  it("text body: renders the post text with newlines as <br>", () => {
    const html = renderActivityStream(
      [vm({ body: { kind: "text", text: "line one\nline two" } })],
      { now: NOW, groupByDay: false }
    );
    expect(html).toContain("line one<br>line two");
  });

  it("track body: renders the track title and artist", () => {
    const html = renderActivityStream(
      [
        vm({
          verb: "posted",
          title: "scrobbled a track",
          body: { kind: "track", trackTitle: "Teardrop", artist: "Massive Attack" },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain("Teardrop");
    expect(html).toContain("Massive Attack");
  });

  it("generic body: renders its optional caption text", () => {
    const html = renderActivityStream(
      [vm({ body: { kind: "generic", text: "did a thing" } })],
      { now: NOW }
    );
    expect(html).toContain("did a thing");
  });

  it("unknown/future body kind: degrades to the text fallback, never throws", () => {
    const future = { kind: "future-thing", text: "did something new" } as unknown as StreamCardVM["body"];
    const html = renderActivityStream([vm({ body: future })], { now: NOW });
    expect(html).toContain("did something new");
    expect(html).toContain('class="stream-card"');
  });
});

describe("renderActivityStream: media", () => {
  it("resolved media {url}: renders the URL directly", () => {
    const html = renderActivityStream(
      [
        vm({
          body: { kind: "media" },
          media: [{ url: "https://cdn.example/pic.jpg", alt: "a photo" }],
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('src="https://cdn.example/pic.jpg"');
    expect(html).toContain('alt="a photo"');
  });

  it("blob media {did,cid}: builds the URL via the injected blobUrl builder", () => {
    const html = renderActivityStream(
      [
        vm({
          body: { kind: "media" },
          media: [{ did: "did:plc:xyz", cid: "bafyimg", alt: "" }],
        }),
      ],
      {
        now: NOW,
        blobUrl: (did, cid) => `https://my-cdn.test/${did}/${cid}`,
      }
    );
    expect(html).toContain('src="https://my-cdn.test/did:plc:xyz/bafyimg"');
  });

  it("blob media: falls back to the documented default CDN pattern when no builder is given", () => {
    const html = renderActivityStream(
      [
        vm({
          body: { kind: "media" },
          media: [{ did: "did:plc:xyz", cid: "bafyimg", alt: "" }],
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain("https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:xyz/bafyimg@jpeg");
  });

  it("blob media: honors a custom cdnBase for the default builder", () => {
    const html = renderActivityStream(
      [
        vm({
          body: { kind: "media" },
          media: [{ did: "did:plc:xyz", cid: "bafyimg", alt: "" }],
        }),
      ],
      { now: NOW, cdnBase: "https://images.sifa.id" }
    );
    expect(html).toContain("https://images.sifa.id/img/feed_fullsize/plain/did:plc:xyz/bafyimg@jpeg");
  });
});

describe("renderActivityStream: external link", () => {
  it("renders the external link card with a validated href and title", () => {
    const html = renderActivityStream(
      [
        vm({
          verb: "posted",
          body: { kind: "link" },
          externalLink: { url: "https://example.com/post", title: "An article" },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('href="https://example.com/post"');
    expect(html).toContain("An article");
  });

  it("drops a javascript: external link URL", () => {
    const html = renderActivityStream(
      [
        vm({
          body: { kind: "link" },
          externalLink: { url: "javascript:alert(1)", title: "Evil" },
        }),
      ],
      { now: NOW }
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("stream-link");
  });
});

describe("renderActivityStream: subject (repost/reply target)", () => {
  it("post subject: renders the nested target's title", () => {
    const html = renderActivityStream(
      [
        vm({
          verb: "reposted",
          title: "reposted",
          subject: {
            kind: "post",
            post: vm({
              uri: "at://did:plc:other/app.bsky.feed.post/9",
              title: "posted on Bluesky",
              body: { kind: "text", text: "the original post" },
            }),
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain("stream-subject");
    expect(html).toContain("the original post");
  });

  it("person subject: renders the handle", () => {
    const html = renderActivityStream(
      [
        vm({
          verb: "endorsed",
          title: "endorsed someone",
          subject: { kind: "person", did: "did:plc:p", handle: "alice.test" },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain("alice.test");
  });
});

describe("renderActivityStream: source link", () => {
  it("makes the whole card a link to sourceUrl, opening in a new tab", () => {
    const html = renderActivityStream(
      [
        vm({
          sourceUrl: "https://bsky.app/profile/gui.do/post/abc",
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('class="stream-card-link"');
    expect(html).toContain(
      'href="https://bsky.app/profile/gui.do/post/abc"'
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain("View on Bluesky");
  });

  it("renders no source link when the VM has no sourceUrl", () => {
    const html = renderActivityStream([vm()], { now: NOW });
    expect(html).not.toContain("stream-card-link");
    expect(html).not.toContain("View on");
  });

  it("drops a javascript: sourceUrl rather than linking to it", () => {
    const html = renderActivityStream(
      [vm({ sourceUrl: "javascript:alert(1)" })],
      { now: NOW }
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("stream-card-link");
  });

  it("escapes a quote-breakout attempt in sourceUrl", () => {
    const html = renderActivityStream(
      [vm({ sourceUrl: 'https://evil.test/"onmouseover="alert(1)' })],
      { now: NOW }
    );
    expect(html).not.toContain('"onmouseover="alert(1)"');
    expect(html).toContain("&quot;onmouseover=&quot;alert(1)");
  });

  it("links the nested subject card to its own sourceUrl", () => {
    const html = renderActivityStream(
      [
        vm({
          verb: "reposted",
          title: "reposted",
          subject: {
            kind: "post",
            post: vm({
              uri: "at://did:plc:other/app.bsky.feed.post/9",
              source: { appId: "popfeed", label: "Popfeed", color: "purple" },
              sourceUrl: "https://popfeed.social/p/9",
            }),
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('href="https://popfeed.social/p/9"');
    expect(html).toContain("View on Popfeed");
  });
});

describe("renderActivityStream: reply vs repost embed", () => {
  it("a reply (non-repost verb + post subject) renders a 'Replying to' label above the embedded OP", () => {
    const html = renderActivityStream(
      [
        vm({
          verb: "posted",
          title: "replied on Bluesky",
          subject: {
            kind: "post",
            post: vm({
              uri: "at://did:plc:other/app.bsky.feed.post/9",
              body: { kind: "text", text: "the original post" },
            }),
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('class="stream-reply-label"');
    expect(html).toContain("Replying to");
    // ...and the embedded original still renders inside the quoted subject box.
    expect(html).toContain("stream-subject");
    expect(html).toContain("the original post");
    expect(html).toMatch(
      /stream-reply-label[\s\S]*?<div class="stream-subject"/
    );
  });

  it("a repost (verb 'reposted' + post subject) does NOT render a 'Replying to' label", () => {
    const html = renderActivityStream(
      [
        vm({
          verb: "reposted",
          title: "reposted",
          subject: {
            kind: "post",
            post: vm({
              uri: "at://did:plc:other/app.bsky.feed.post/9",
              body: { kind: "text", text: "the original post" },
            }),
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).not.toContain("stream-reply-label");
    expect(html).not.toContain("Replying to");
    // ...but the embedded post is still shown.
    expect(html).toContain("the original post");
  });
});

describe("renderActivityStream: per-item theme", () => {
  it("applies a validated RGB theme as inline custom properties", () => {
    const html = renderActivityStream(
      [
        vm({
          theme: {
            background: { r: 250, g: 249, b: 240 },
            foreground: { r: 28, g: 27, b: 26 },
            accent: { r: 42, g: 93, b: 176 },
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain("--stream-accent:rgb(42, 93, 176)");
  });

  it("ignores an invalid theme rather than emitting a broken style", () => {
    const html = renderActivityStream(
      [
        vm({
          theme: {
            background: { r: 999, g: -1, b: 0 },
            foreground: { r: 0, g: 0, b: 0 },
            accent: { r: 0, g: 0, b: 0 },
          } as StreamCardVM["theme"],
        }),
      ],
      { now: NOW }
    );
    expect(html).not.toContain("rgb(999");
  });
});

describe("renderActivityStream: permalink injection", () => {
  it("links the title when a permalink builder returns a web URL", () => {
    const html = renderActivityStream([vm()], {
      now: NOW,
      permalink: (item) =>
        `https://page.sifa.id/gui.do/p/${encodeURIComponent(item.cid)}`,
    });
    expect(html).toContain(
      'href="https://page.sifa.id/gui.do/p/bafycid1"'
    );
  });

  it("leaves the verb unlinked by default (per-item permalinks deferred)", () => {
    const html = renderActivityStream([vm()], { now: NOW });
    expect(html).toContain("posted on Bluesky");
    expect(html).not.toContain("stream-verb-link");
    expect(html).toContain('<span class="stream-verb">posted on Bluesky</span>');
  });
});

describe("renderActivityStream: day grouping", () => {
  it('groups items under "Today", "Yesterday", and an absolute date', () => {
    const html = renderActivityStream(
      [
        vm({ uri: "at://a/1", timestamp: "2026-07-17T09:00:00.000Z" }),
        vm({ uri: "at://a/2", timestamp: "2026-07-16T09:00:00.000Z" }),
        vm({ uri: "at://a/3", timestamp: "2026-07-10T09:00:00.000Z" }),
      ],
      { now: NOW }
    );
    expect(html).toContain("Today");
    expect(html).toContain("Yesterday");
    expect(html).toContain("July 10, 2026");
  });

  it("renders a flat list (no day headers) when groupByDay is false", () => {
    const html = renderActivityStream([vm()], {
      now: NOW,
      groupByDay: false,
    });
    expect(html).not.toContain("stream-day-label");
    expect(html).toContain('class="stream-card"');
  });
});

describe("renderActivityStream: XSS / escaping", () => {
  it("escapes a script-injection string in the post text", () => {
    const evil = '<script>alert(1)</script>';
    const html = renderActivityStream(
      [vm({ body: { kind: "text", text: evil } })],
      { now: NOW }
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes an injection attempt in the title", () => {
    const html = renderActivityStream(
      [vm({ title: '"><img src=x onerror=alert(1)>' })],
      { now: NOW }
    );
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    // The `<`/`>` are escaped, so the payload renders as inert text, not a tag.
    expect(html).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("escapes an injection attempt in media alt text", () => {
    const html = renderActivityStream(
      [
        vm({
          body: { kind: "media" },
          media: [
            { url: "https://cdn.example/p.jpg", alt: '"><script>alert(1)</script>' },
          ],
        }),
      ],
      { now: NOW }
    );
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("escapes a quote-breakout attempt in a blob-built media URL", () => {
    const html = renderActivityStream(
      [
        vm({
          body: { kind: "media" },
          media: [{ did: "did:plc:x", cid: 'a"onerror="alert(1)', alt: "" }],
        }),
      ],
      { now: NOW }
    );
    expect(html).not.toContain('onerror="alert(1)"');
  });
});

describe("renderActivityStream: verb in the meta line", () => {
  it("renders the verb inside the meta row (stream-head), set apart from post text", () => {
    const html = renderActivityStream(
      [vm({ title: "posted on Bluesky", body: { kind: "text", text: "hello world" } })],
      { now: NOW }
    );
    // The verb sits in the head, immediately after the source pill (which now
    // ends with the app name) and before the time.
    expect(html).toContain('class="stream-head"');
    expect(html).toContain(
      'Bluesky</span><span class="stream-verb">posted on Bluesky</span>'
    );
    // ...and there is no longer a separate title line.
    expect(html).not.toContain('class="stream-title"');
    // The post text is a distinct content element, not the verb.
    expect(html).toContain('<p class="stream-text">hello world</p>');
  });

  it("links the verb to the item permalink when supplied", () => {
    const html = renderActivityStream([vm()], {
      now: NOW,
      permalink: (item) => `https://page.sifa.id/gui.do/p/${item.cid}`,
    });
    expect(html).toContain(
      '<a class="stream-verb stream-verb-link" href="https://page.sifa.id/gui.do/p/bafycid1">'
    );
  });
});

describe("renderActivityStream: rich typed variants", () => {
  it("media-review: verb 'Reviewed a TV show', work title, star rating, credit, review, cover", () => {
    const html = renderActivityStream(
      [
        vm({
          source: { appId: "popfeed", label: "Popfeed", color: "grass" },
          title: "reviewed on Popfeed",
          media: [{ url: "https://cdn.example/sugar-poster.jpg", alt: "Sugar poster" }],
          body: {
            kind: "media-review",
            reviewKind: "review",
            title: "Sugar",
            mediaType: "tv_show",
            rating: 9,
            mainCredit: "Apple TV",
            reviewText: "A stylish neo-noir.",
            isRevisit: false,
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('<span class="stream-verb">Reviewed a TV show</span>');
    expect(html).toContain("Sugar");
    expect(html).toContain("9/10");
    expect(html).toContain("Apple TV");
    expect(html).toContain("A stylish neo-noir.");
    expect(html).toContain('src="https://cdn.example/sugar-poster.jpg"');
    // The media pill uses the display-cased label.
    expect(html).toContain("TV Show");
  });

  it("media-review: 'Posted about a movie' with a Revisit badge", () => {
    const html = renderActivityStream(
      [
        vm({
          title: "posted on Popfeed",
          body: {
            kind: "media-review",
            reviewKind: "post",
            title: "Heat",
            mediaType: "movie",
            isRevisit: true,
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('<span class="stream-verb">Posted about a movie</span>');
    expect(html).toContain("Revisit");
  });

  it("book: verb 'Reviewed a book', title, authors, stars, status badge, review", () => {
    const html = renderActivityStream(
      [
        vm({
          source: { appId: "bookhive", label: "BookHive", color: "amber" },
          title: "read on BookHive",
          media: [{ url: "https://cdn.example/dune.jpg", alt: "Dune cover" }],
          body: {
            kind: "book",
            title: "Dune",
            authors: ["Frank Herbert"],
            stars: 10,
            status: "buzz.bookhive.defs#finished",
            review: "A desert epic.",
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('<span class="stream-verb">Reviewed a book</span>');
    expect(html).toContain("Dune");
    expect(html).toContain("Frank Herbert");
    expect(html).toContain("10/10");
    expect(html).toContain("Finished");
    expect(html).toContain("A desert epic.");
    expect(html).toContain('src="https://cdn.example/dune.jpg"');
  });

  it("book: falls back to the SDK verb (no review) and shows the reading status", () => {
    const html = renderActivityStream(
      [
        vm({
          title: "Read",
          body: {
            kind: "book",
            title: "The Hobbit",
            authors: ["J.R.R. Tolkien"],
            status: "buzz.bookhive.defs#reading",
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('<span class="stream-verb">Read</span>');
    expect(html).toContain("Reading");
  });

  it("github-pr: repo, PR number, title, additions/deletions, language dot", () => {
    const html = renderActivityStream(
      [
        vm({
          source: { appId: "github", label: "GitHub", color: "slate" },
          title: "opened a pull request",
          body: {
            kind: "github-pr",
            repoOwner: "singi-labs",
            repoName: "sifa-sdk",
            prNumber: 294,
            title: "Add stream card body types",
            language: "TypeScript",
            additions: 420,
            deletions: 12,
            mergedAt: "2026-07-16T09:00:00.000Z",
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('<span class="stream-verb">Merged a pull request</span>');
    expect(html).toContain("singi-labs/sifa-sdk");
    expect(html).toContain("#294");
    expect(html).toContain("Add stream card body types");
    expect(html).toContain("+420");
    expect(html).toContain("-12");
    expect(html).toContain("TypeScript");
    expect(html).toContain("--lang-dot:#3178c6");
  });

  it("github-pr: unmerged PR uses the 'Opened a pull request' verb", () => {
    const html = renderActivityStream(
      [
        vm({
          title: "opened a pull request",
          body: {
            kind: "github-pr",
            repoOwner: "a",
            repoName: "b",
            prNumber: 1,
            title: "wip",
            additions: 0,
            deletions: 0,
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('<span class="stream-verb">Opened a pull request</span>');
  });

  it("event-rsvp: verb from status, event name, date range, location, mode", () => {
    const html = renderActivityStream(
      [
        vm({
          source: { appId: "smokesignal", label: "Smoke Signal", color: "orange" },
          title: "RSVP'd on Smoke Signal",
          body: {
            kind: "event-rsvp",
            rsvpStatus: "going",
            eventName: "ATProto Meetup",
            startsAt: "2026-08-04T18:00:00.000Z",
            endsAt: "2026-08-06T21:00:00.000Z",
            mode: "inperson",
            locationName: "The Commons",
            locationLocality: "Amsterdam",
            locationCountry: "NL",
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('<span class="stream-verb">Going to an event</span>');
    expect(html).toContain("ATProto Meetup");
    expect(html).toContain("Aug 4-6");
    expect(html).toContain("The Commons, Amsterdam, NL");
    expect(html).toContain("In-person");
  });

  it("verification: 'Verified GitHub' with subject and a verified badge", () => {
    const html = renderActivityStream(
      [
        vm({
          source: { appId: "keytrace", label: "Keytrace", color: "violet" },
          title: "verified an identity",
          body: {
            kind: "verification",
            platform: "github",
            verified: true,
            subjectLabel: "octocat",
            profileUrl: "https://github.com/octocat",
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('<span class="stream-verb">Verified GitHub</span>');
    expect(html).toContain("octocat");
    expect(html).toContain('href="https://github.com/octocat"');
    expect(html).toContain("Verified");
  });

  it("verification: Bluesky verification renders the handle", () => {
    const html = renderActivityStream(
      [
        vm({
          source: { appId: "bluesky", label: "Bluesky", color: "blue" },
          title: "verified an account",
          body: {
            kind: "verification",
            platform: "bluesky",
            verified: true,
            subjectLabel: "Alice",
            handle: "alice.bsky.social",
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('<span class="stream-verb">Verified Bluesky</span>');
    expect(html).toContain("Alice @alice.bsky.social");
  });

  it("membership: 'Joined {community}' verb and the description", () => {
    const html = renderActivityStream(
      [
        vm({
          source: { appId: "colibri", label: "Colibri", color: "teal" },
          title: "joined a community",
          body: {
            kind: "membership",
            communityName: "AT Protocol Builders",
            description: "A place for people building on atproto.",
            communityUri: "at://did:plc:x/community/1",
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain('<span class="stream-verb">Joined AT Protocol Builders</span>');
    expect(html).toContain("A place for people building on atproto.");
  });

  it("location: venue, shout, and a formatted address", () => {
    const html = renderActivityStream(
      [
        vm({
          source: { appId: "beaconbits", label: "BeaconBits", color: "pink" },
          title: "checked in",
          body: {
            kind: "location",
            venueName: "Café de Sluyswacht",
            shout: "Great coffee by the canal.",
            address: { locality: "Amsterdam", region: "NH", country: "Netherlands" },
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain("Café de Sluyswacht");
    expect(html).toContain("Great coffee by the canal.");
    expect(html).toContain("Amsterdam, NH, Netherlands");
  });

  it("location: falls back to geo coordinates when there is no address", () => {
    const html = renderActivityStream(
      [
        vm({
          title: "checked in",
          body: {
            kind: "location",
            venueName: "A spot",
            geo: { latitude: 52.3676, longitude: 4.9041 },
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain("52.3676, 4.9041");
  });

  it("travel: origin to destination, transportation, carrier, dates", () => {
    const html = renderActivityStream(
      [
        vm({
          source: { appId: "passports", label: "Passports", color: "cyan" },
          title: "logged a trip",
          body: {
            kind: "travel",
            origin: "AMS",
            destination: "JFK",
            transportation: "flight",
            carrier: "KLM",
            startDate: "2026-08-01",
            endDate: "2026-08-10",
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain("AMS → JFK");
    expect(html).toContain("Flight · KLM");
    expect(html).toContain("2026-08-01 – 2026-08-10");
  });

  it("standard-site: title, description, publisher, reading time, cover", () => {
    const html = renderActivityStream(
      [
        vm({
          source: { appId: "leaflet", label: "Leaflet", color: "lime" },
          title: "published a document",
          body: {
            kind: "standard-site",
            title: "On Decentralized Identity",
            description: "Why portable identity matters.",
            siteUrl: "https://example.pub",
            path: "/posts/identity",
            publisherName: "Example Pub",
            coverImageUrl: "https://cdn.example/cover.jpg",
            readingTime: 7,
            publishedAt: "2026-07-10T00:00:00.000Z",
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain("On Decentralized Identity");
    expect(html).toContain("Why portable identity matters.");
    expect(html).toContain("Example Pub");
    expect(html).toContain("7 min read");
    expect(html).toContain("July 10, 2026");
    expect(html).toContain('src="https://cdn.example/cover.jpg"');
    expect(html).toContain('href="https://example.pub/posts/identity"');
  });

  it("gracefully omits missing optional fields (no 'undefined' leaks)", () => {
    const html = renderActivityStream(
      [
        vm({
          title: "read on BookHive",
          body: { kind: "book", title: "Untitled", authors: [] },
        }),
      ],
      { now: NOW }
    );
    expect(html).toContain("Untitled");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("/10"); // no rating rendered
  });

  it("escapes a malicious rich field (book review) rather than injecting markup", () => {
    const html = renderActivityStream(
      [
        vm({
          title: "read on BookHive",
          body: {
            kind: "book",
            title: '<img src=x onerror=alert(1)>',
            authors: ["A"],
            review: "<script>alert(2)</script>",
          },
        }),
      ],
      { now: NOW }
    );
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script>alert(2)</script>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
  });
});
