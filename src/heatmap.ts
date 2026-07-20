/**
 * Pure-HTML activity heatmap for the "Now" page, rendered from the same
 * `/api/activity/:id/heatmap` payload that powers sifa-web's `/activity`
 * Activity Bar. Mirrors `/activity`: month + weekday axes, per-app dominant
 * colours (the `--app-<id>-stripe` palette at the shared 0.3 / 0.55 / 0.8 / 1.0
 * opacity ramp), a per-day hover breakdown, and an app-colour legend. The
 * AppView computes real per-day counts by walking PDS records, so the grid is
 * honest for the full window (not limited to the 50-item stream snapshot).
 */
import { escapeHtml } from "./util.js";

/** One day of activity, matching the AppView `HeatmapDay` shape. */
export interface HeatmapDayInput {
  date: string; // YYYY-MM-DD (UTC)
  total: number;
  apps: { appId: string; count: number }[];
}

/**
 * The subset of the AppView `HeatmapResponse` this renderer consumes.
 * Structurally compatible with the SDK's `HeatmapResponse` so callers can pass
 * it straight through without a translation step.
 */
export interface HeatmapDataInput {
  days: HeatmapDayInput[];
  thresholds: [number, number, number, number];
  appTotals?: { appId: string; appName: string; total: number }[];
}

export interface RenderHeatmapOptions {
  /** Reference "today". Defaults to the current date. */
  now?: Date;
  /** How many days back the grid covers. Default 180 (matches `/activity`). */
  daysBack?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS_BACK = 180;
/** Legend + `/activity` cap the app key at six entries. */
const MAX_LEGEND_ITEMS = 6;

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Bucket a day's total into a 0-4 intensity level (mirrors `heatmap-colors.ts`). */
export function countToLevel(
  count: number,
  thresholds: [number, number, number, number]
): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= thresholds[0]) return 1;
  if (count <= thresholds[1]) return 2;
  if (count <= thresholds[2]) return 3;
  return 4;
}

/** UTC `YYYY-MM-DD` for a Date, matching the AppView's `createdAt.slice(0,10)` keys. */
function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** UTC midnight of the given date. */
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Reduce an appId to a CSS-identifier-safe token for the `--app-<id>-stripe` var. */
function safeAppId(appId: string): string {
  return appId.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** CSS colour reference for an app, falling back to the neutral stripe. */
function appColorVar(appId: string): string {
  return `var(--app-${safeAppId(appId)}-stripe, var(--app-fallback-stripe))`;
}

/** Dominant app for a day: highest count, ties broken by appId (matches sifa-web). */
function dominantAppId(apps: { appId: string; count: number }[]): string | null {
  if (apps.length === 0) return null;
  let best = apps[0]!;
  for (const a of apps) {
    if (a.count > best.count || (a.count === best.count && a.appId < best.appId)) {
      best = a;
    }
  }
  return best.appId;
}

/**
 * Render the activity heatmap as an HTML `<section>`, or an empty string when
 * there is nothing to show (null payload, no days, or zero activity) so the
 * "Now" page simply omits the header.
 */
export function renderHeatmap(
  data: HeatmapDataInput | null | undefined,
  options: RenderHeatmapOptions = {}
): string {
  if (!data || data.days.length === 0) return "";

  const totalActions = data.days.reduce((sum, d) => sum + Math.max(0, d.total), 0);
  if (totalActions === 0) return "";

  const daysBack =
    options.daysBack && options.daysBack > 0 ? options.daysBack : DEFAULT_DAYS_BACK;
  const months = Math.max(1, Math.round(daysBack / 30));

  const appTotals = data.appTotals ?? [];
  const appNames = new Map(appTotals.map((a) => [a.appId, a.appName]));
  const appName = (appId: string): string => appNames.get(appId) ?? appId;

  // --- summary stats -------------------------------------------------------
  const stats: string[] = [
    `<span class="heatmap-stat-total">${escapeHtml(
      plural(totalActions, "activity", "activities")
    )} in the last ${months} months</span>`,
  ];
  const mostActive = appTotals[0];
  if (mostActive) {
    stats.push(
      `<span class="heatmap-stat-app">Most active: ${escapeHtml(mostActive.appName)}</span>`
    );
  }
  const appCount =
    appTotals.length > 0
      ? appTotals.length
      : new Set(data.days.flatMap((d) => d.apps.map((a) => a.appId))).size;
  if (appCount > 0) {
    stats.push(
      `<span class="heatmap-stat-count">${escapeHtml(
        plural(appCount, "app active", "apps active")
      )}</span>`
    );
  }

  // --- grid geometry -------------------------------------------------------
  const dayMap = new Map<string, HeatmapDayInput>();
  for (const d of data.days) dayMap.set(d.date, d);

  const now = options.now ?? new Date();
  const end = utcMidnight(now);

  // Start `daysBack` before today, rolled back to the previous Monday so the
  // first column is a full week (weekStart = Monday).
  const startRaw = new Date(end.getTime() - daysBack * DAY_MS);
  const startDow = startRaw.getUTCDay(); // 0 = Sun .. 6 = Sat
  const backToMon = startDow === 0 ? 6 : startDow - 1;
  const start = new Date(startRaw.getTime() - backToMon * DAY_MS);

  // Roll `end` forward to the Sunday of its week so the last column is full.
  const endDow = end.getUTCDay();
  const forwardToSun = endDow === 0 ? 0 : 7 - endDow;
  const gridEnd = new Date(end.getTime() + forwardToSun * DAY_MS);

  const weekCount = Math.round((gridEnd.getTime() - start.getTime()) / DAY_MS + 1) / 7;

  // --- cells + month labels, emitted column-major (Mon..Sun per week) -------
  const cells: string[] = [];
  const monthLabels: string[] = [];
  let prevMonth = -1;
  for (let col = 0; col < weekCount; col++) {
    const colStart = new Date(start.getTime() + col * 7 * DAY_MS);
    const colMonth = colStart.getUTCMonth();
    if (colMonth !== prevMonth) {
      monthLabels.push(
        `<span class="heatmap-month" style="grid-column:${col + 1}">${MONTH_ABBR[colMonth]}</span>`
      );
      prevMonth = colMonth;
    }

    for (let d = 0; d < 7; d++) {
      const day = new Date(colStart.getTime() + d * DAY_MS);
      if (day.getTime() > end.getTime()) {
        cells.push('<div class="heatmap-cell heat-lvl-0 heatmap-cell-future"></div>');
        continue;
      }
      const dateStr = utcDateStr(day);
      const entry = dayMap.get(dateStr);
      const count = entry ? Math.max(0, entry.total) : 0;
      const level = countToLevel(count, data.thresholds);

      const dateLabel = `${WEEKDAY_ABBR[day.getUTCDay()]}, ${MONTH_ABBR[day.getUTCMonth()]} ${day.getUTCDate()}, ${day.getUTCFullYear()}`;
      let title: string;
      if (!entry || entry.total === 0) {
        title = `${dateLabel}\nNo activity`;
      } else {
        const lines = entry.apps.map((a) => `${a.count} ${appName(a.appId)}`);
        lines.push(`${entry.total} total`);
        title = `${dateLabel}\n${lines.join("\n")}`;
      }

      const dominant = entry ? dominantAppId(entry.apps) : null;
      const colorStyle =
        level > 0 && dominant ? ` style="--cell:${appColorVar(dominant)}"` : "";
      cells.push(
        `<div class="heatmap-cell heat-lvl-${level}"${colorStyle} title="${escapeHtml(title)}"></div>`
      );
    }
  }

  const weekdayTrack =
    `<span class="heatmap-weekday" style="grid-row:1">Mon</span>` +
    `<span class="heatmap-weekday" style="grid-row:3">Wed</span>` +
    `<span class="heatmap-weekday" style="grid-row:5">Fri</span>`;

  // --- legend (app colour key, top apps by total) --------------------------
  let legend = "";
  if (appTotals.length > 0) {
    const items = appTotals
      .slice(0, MAX_LEGEND_ITEMS)
      .map(
        (a) =>
          `<span class="heatmap-legend-item"><span class="heatmap-legend-dot" style="background:${appColorVar(
            a.appId
          )}"></span>${escapeHtml(a.appName)}</span>`
      )
      .join("");
    legend = `<div class="heatmap-legend">${items}</div>`;
  }

  const gridAria = escapeHtml(
    `${plural(totalActions, "activity", "activities")} over the last ${months} months`
  );

  return (
    `<section class="now-heatmap" aria-label="Activity heatmap">` +
    `<div class="heatmap-stats">${stats.join("")}</div>` +
    `<div class="heatmap-cal-scroll"><div class="heatmap-cal">` +
    `<div class="heatmap-corner"></div>` +
    `<div class="heatmap-months" style="--hm-weeks:${weekCount}">${monthLabels.join("")}</div>` +
    `<div class="heatmap-weekdays">${weekdayTrack}</div>` +
    `<div class="heatmap-grid" role="img" aria-label="${gridAria}">${cells.join("")}</div>` +
    `</div></div>` +
    legend +
    `</section>`
  );
}
