---
"@singi-labs/sifa-page-renderer": patch
---

Show angle-bracketed text in About and item descriptions literally (for example `Tools: <React>, <Vue>`) instead of dropping it as an unknown HTML tag. Raw HTML in profile Markdown is now rendered as inert text; the DOMPurify allowlist still runs on the output.
