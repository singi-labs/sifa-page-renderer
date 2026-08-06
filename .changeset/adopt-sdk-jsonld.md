---
'@singi-labs/sifa-page-renderer': patch
---

Build the Person JSON-LD with `@singi-labs/sifa-sdk/jsonld` instead of by hand.

sifa.id and a personal site described the same person differently: sifa.id emitted `homeLocation: Place`, this renderer emitted `address: PostalAddress`. Both now use the same emitter, so a fix to one is a fix to both.

The page's own `canonical` is passed through as `canonicalUrl`, so a self-hosted site keeps its own `url` and `@id` rather than being given a sifa.id path that does not resolve. URL scheme validation still happens here, before values reach the graph, and `<` is still escaped to `<`.

Visible change: `address` becomes `homeLocation`, and a `@id` is now emitted.
