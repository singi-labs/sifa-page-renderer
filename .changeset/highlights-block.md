---
'@singi-labs/sifa-page-renderer': patch
---

Add `renderHighlights` and render the "Highlights" block below the About section on the single-page personal site (page.sifa.id/{handle}). It features one ongoing or most-recent record per section (talk, publication, career, education, project, involvement) as academicpages-styled cards, driven by the SDK's shared `buildProfileHighlights` so the personal site features the same records as the sifa.id profile page. Callers opt in by passing the profile as `RenderContext.highlights` to `renderSinglePage`; omitting it leaves the output byte-identical. Requires `@singi-labs/sifa-sdk` >= 0.18.17.
