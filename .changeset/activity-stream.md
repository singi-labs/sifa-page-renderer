---
"@singi-labs/sifa-page-renderer": patch
---

Add `renderActivityStream(vms, options?)`: a pure string-HTML renderer for an activity stream, consuming the same `StreamCardVM` view-model the sifa-web activity cards render (from the SDK's `toStreamCardVM`). Switches on `body.kind` (`text`/`media`/`link`/`track`/`generic`, degrading gracefully for unknown future kinds), resolves blob-ref media through an injectable `blobUrl`/`cdnBase` (default Bluesky-style CDN URL), links titles via an optional `permalink` builder, applies validated per-item RGB themes as inline custom properties, and groups items under Today/Yesterday/date headers (UTC). All user text is HTML-escaped and every URL scheme-validated, matching the profile renderer. Pins `@singi-labs/sifa-sdk` to `0.12.9` for the shared `StreamCardVM` contract. Adds `.activity-stream` / `.stream-*` styles to `getCSS()`.
