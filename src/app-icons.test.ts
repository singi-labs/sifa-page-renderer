import { describe, it, expect } from "vitest";
import {
  APP_BRAND_LOGOS,
  cardIcon,
  categoryGlyph,
  pillGlyph,
} from "./app-icons";

// A path fragment unique to the extracted Popfeed brand mark.
const POPFEED_MARKER = "M 50,0 A 44,44";

describe("app-icons: cardIcon", () => {
  it("uses the brand logo for a single-writer app (popfeed)", () => {
    const html = cardIcon("popfeed");
    expect(html).toContain(POPFEED_MARKER);
    expect(html).toContain("viewBox=\"0 0 96 112\"");
  });

  it("falls through to a category glyph for shared bsky posts (no bluesky brand logo)", () => {
    const html = cardIcon("bluesky");
    // bluesky is categorized as Posts -> the speech-bubble glyph, NOT a brand logo.
    expect(html).not.toContain(POPFEED_MARKER);
    expect(html).toBe(categoryGlyph("bluesky"));
    expect(APP_BRAND_LOGOS.bluesky).toBeUndefined();
  });

  it("uses the default dot for an unknown / uncategorized app", () => {
    const html = cardIcon("totally-unknown-app-xyz");
    expect(html).toContain("<circle");
    expect(html).toBe(categoryGlyph("totally-unknown-app-xyz"));
  });
});

describe("app-icons: categoryGlyph / pillGlyph", () => {
  it("maps a known category to its glyph (popfeed -> Reviews star)", () => {
    // Reviews glyph is a star path; assert it is a themeable <svg> with currentColor.
    const html = categoryGlyph("popfeed");
    expect(html).toContain("<svg");
    expect(html).toContain("currentColor");
  });

  it("pillGlyph is always the category glyph, even for branded apps", () => {
    expect(pillGlyph("popfeed")).toBe(categoryGlyph("popfeed"));
    expect(pillGlyph("bluesky")).toBe(categoryGlyph("bluesky"));
  });
});
