---
"@singi-labs/sifa-page-renderer": patch
---

Bring the "Now" page heatmap to parity with sifa-web's `/activity` Activity Bar: month + weekday axis labels, per-app dominant colours (the `--app-<id>-stripe` palette at the shared opacity ramp), a per-day hover breakdown showing each app's count and the total, and an app-colour legend below the grid. All derived from the existing `/api/activity/:id/heatmap` payload, so no API or wiring change is needed.
