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
    const future = { kind: "github-pr", text: "opened a PR" } as unknown as StreamCardVM["body"];
    const html = renderActivityStream([vm({ body: future })], { now: NOW });
    expect(html).toContain("opened a PR");
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

  it("leaves the title unlinked by default (per-item permalinks deferred)", () => {
    const html = renderActivityStream([vm()], { now: NOW });
    expect(html).toContain("posted on Bluesky");
    expect(html).not.toContain("<a class=\"stream-title-link\"");
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
