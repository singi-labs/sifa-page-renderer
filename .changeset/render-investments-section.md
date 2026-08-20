---
'@singi-labs/sifa-page-renderer': patch
---

Render the `investments` profile section.

The SDK added an `investments` section (angel cheques, syndicate and LP entries), so `SECTION_RENDERERS` now has a matching renderer: company (canonical entity name when linked), role, stage and status via the SDK label helpers, amount, date range, and a Markdown description. Bumps `@singi-labs/sifa-sdk` to `0.14.1` and `isomorphic-dompurify` to `3.22.0`.
