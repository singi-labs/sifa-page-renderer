---
"@singi-labs/sifa-page-renderer": patch
---

Add `renderActivityPage(profile, sections, vms, ctx?, streamOptions?)`: a standalone activity ("Now") page that wraps `renderActivityStream` in the same masthead + sidebar + footer layout as the section pages. Adds a `ctx.activityStream` flag that injects a "Now" nav entry (masthead + mobile bottom nav, linking to `now.html`) into `renderHome`, `renderSectionPage`, and `renderSinglePage`; nav output is unchanged when the flag is omitted.
