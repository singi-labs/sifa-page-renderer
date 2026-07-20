import { describe, it, expect } from "vitest";
import { renderHeatmap, countToLevel, type HeatmapDataInput } from "./heatmap.js";

// A fixed "now" so the grid window is deterministic across runs.
const NOW = new Date("2026-07-20T12:00:00.000Z");

function data(overrides: Partial<HeatmapDataInput> = {}): HeatmapDataInput {
  return {
    days: [
      { date: "2026-07-14", total: 5, apps: [{ appId: "bluesky", count: 5 }] },
      {
        date: "2026-07-18",
        total: 2,
        apps: [
          { appId: "bluesky", count: 1 },
          { appId: "github", count: 1 },
        ],
      },
    ],
    thresholds: [1, 3, 6, 10],
    appTotals: [
      { appId: "bluesky", appName: "Bluesky", total: 6 },
      { appId: "github", appName: "GitHub", total: 1 },
    ],
    ...overrides,
  };
}

describe("countToLevel", () => {
  it("maps counts onto 0-4 buckets against the thresholds", () => {
    const t: [number, number, number, number] = [1, 3, 6, 10];
    expect(countToLevel(0, t)).toBe(0);
    expect(countToLevel(1, t)).toBe(1);
    expect(countToLevel(3, t)).toBe(2);
    expect(countToLevel(6, t)).toBe(3);
    expect(countToLevel(7, t)).toBe(4);
    expect(countToLevel(999, t)).toBe(4);
  });
});

describe("renderHeatmap", () => {
  it("returns an empty string when data is null", () => {
    expect(renderHeatmap(null, { now: NOW })).toBe("");
  });

  it("returns an empty string when there are no days", () => {
    expect(renderHeatmap(data({ days: [] }), { now: NOW })).toBe("");
  });

  it("returns an empty string when every day is empty", () => {
    const empty = data({
      days: [{ date: "2026-07-14", total: 0, apps: [] }],
      appTotals: [],
    });
    expect(renderHeatmap(empty, { now: NOW })).toBe("");
  });

  it("renders the summary stats: total actions, most-active app, apps active", () => {
    const html = renderHeatmap(data(), { now: NOW, daysBack: 180 });
    expect(html).toContain("7 activities in the last 6 months");
    expect(html).toContain("Most active: Bluesky");
    expect(html).toContain("2 apps active");
  });

  it("uses the singular 'activity' for a total of one", () => {
    const one = data({
      days: [{ date: "2026-07-18", total: 1, apps: [{ appId: "bluesky", count: 1 }] }],
      appTotals: [{ appId: "bluesky", appName: "Bluesky", total: 1 }],
    });
    const html = renderHeatmap(one, { now: NOW, daysBack: 180 });
    expect(html).toContain("1 activity in the last 6 months");
    expect(html).toContain("1 app active");
  });

  it("colours cells by intensity level using the shared thresholds", () => {
    const html = renderHeatmap(data(), { now: NOW });
    // 2026-07-14 has total 5 -> thresholds [1,3,6,10] -> level 3
    expect(html).toContain('class="heatmap-cell heat-lvl-3"');
    // 2026-07-18 has total 2 -> level 2
    expect(html).toContain('class="heatmap-cell heat-lvl-2"');
  });

  it("gives active cells a per-app hover breakdown with the total", () => {
    const html = renderHeatmap(data(), { now: NOW });
    // 2026-07-14: one app (5 Bluesky), 5 total.
    expect(html).toContain("Jul 14, 2026");
    expect(html).toContain("5 Bluesky");
    expect(html).toContain("5 total");
    // 2026-07-18: two apps, 2 total.
    expect(html).toContain("1 Bluesky");
    expect(html).toContain("1 GitHub");
    expect(html).toContain("2 total");
  });

  it("labels empty in-range days as 'No activity'", () => {
    const html = renderHeatmap(data(), { now: NOW, daysBack: 21 });
    expect(html).toContain("No activity");
  });

  it("colours cells by the day's dominant app", () => {
    const html = renderHeatmap(
      data({
        days: [
          { date: "2026-07-14", total: 5, apps: [{ appId: "bluesky", count: 5 }] },
          {
            date: "2026-07-16",
            total: 4,
            apps: [
              { appId: "github", count: 3 },
              { appId: "bluesky", count: 1 },
            ],
          },
        ],
      }),
      { now: NOW }
    );
    expect(html).toContain("--cell:var(--app-bluesky-stripe, var(--app-fallback-stripe))");
    expect(html).toContain("--cell:var(--app-github-stripe, var(--app-fallback-stripe))");
  });

  it("renders month + weekday axis labels", () => {
    const html = renderHeatmap(data(), { now: NOW, daysBack: 60 });
    expect(html).toContain('class="heatmap-weekday" style="grid-row:1">Mon');
    expect(html).toContain('class="heatmap-weekday" style="grid-row:3">Wed');
    expect(html).toContain('class="heatmap-weekday" style="grid-row:5">Fri');
    expect(html).toContain('class="heatmap-month"');
    // The window spans June -> July, so both month abbreviations appear.
    expect(html).toContain(">Jul</span>");
    expect(html).toContain(">Jun</span>");
  });

  it("renders an app-colour legend keyed by the stripe palette", () => {
    const html = renderHeatmap(data(), { now: NOW });
    expect(html).toContain('class="heatmap-legend"');
    expect(html).toContain(
      'class="heatmap-legend-dot" style="background:var(--app-bluesky-stripe, var(--app-fallback-stripe))"'
    );
    expect(html).toContain("Bluesky");
    expect(html).toContain("GitHub");
  });

  it("caps the legend at six apps", () => {
    const many = data({
      appTotals: Array.from({ length: 9 }, (_, i) => ({
        appId: `app${i}`,
        appName: `App ${i}`,
        total: 9 - i,
      })),
    });
    const html = renderHeatmap(many, { now: NOW });
    const dots = html.match(/class="heatmap-legend-dot"/g) ?? [];
    expect(dots.length).toBe(6);
  });

  it("escapes app names in the legend", () => {
    const xss = data({
      appTotals: [{ appId: "x", appName: '<b>x</b>', total: 5 }],
    });
    const html = renderHeatmap(xss, { now: NOW });
    expect(html).toContain('class="heatmap-legend"');
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("emits a grid whose cell count is a multiple of 7 (full week columns)", () => {
    const html = renderHeatmap(data(), { now: NOW, daysBack: 28 });
    const cells = html.match(/class="heatmap-cell/g) ?? [];
    expect(cells.length % 7).toBe(0);
    expect(cells.length).toBeGreaterThanOrEqual(28);
  });

  it("escapes the most-active app name", () => {
    const xss = data({
      appTotals: [{ appId: "x", appName: '<img src=x onerror=alert(1)>', total: 5 }],
    });
    const html = renderHeatmap(xss, { now: NOW });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("omits the most-active line when appTotals is empty but activity exists", () => {
    const noTotals = data({ appTotals: [] });
    const html = renderHeatmap(noTotals, { now: NOW });
    expect(html).toContain("7 activities in the last 6 months");
    expect(html).not.toContain("Most active:");
  });
});
