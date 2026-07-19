import { describe, it, expect } from "vitest";
import {
  APP_BRAND_LOGOS,
  cardIcon,
  categoryGlyph,
  pillGlyph,
} from "./app-icons";

describe("app-icons: cardIcon", () => {
  it("uses the category glyph for every app (no brand logos shipped)", () => {
    expect(APP_BRAND_LOGOS).toEqual({});
    // popfeed is categorized as Reviews -> the star glyph, not a brand mark.
    expect(cardIcon("popfeed")).toBe(categoryGlyph("popfeed"));
  });

  it("falls through to a category glyph for shared bsky posts", () => {
    const html = cardIcon("bluesky");
    // bluesky is categorized as Posts -> the speech-bubble glyph.
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
