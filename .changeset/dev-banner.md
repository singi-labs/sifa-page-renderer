---
"@singi-labs/sifa-page-renderer": patch
---

Add an optional "in development" disclaimer banner. When `ctx.devBanner` is set, every page renders a slim amber bar at the top with the notice, a link to report issues on GitHub, and a dismiss control that is remembered for ~30 days via localStorage (a pre-paint guard script prevents a flash before it hides). The banner and its inline scripts are omitted entirely when the flag is off, so self-hosted builds are unaffected. Used by page.sifa.id to set expectations while the personal-page feature matures.
