---
'@singi-labs/sifa-page-renderer': patch
---

Style inline code and fenced blocks in `.prose`

`renderMarkdown` already passes the `code` and `pre` tags through the DOMPurify allowlist, but the stylesheet declared no rule for either, so a code span rendered in the body font at body size. These rules give it a GitHub-like chip: monospace, 85% size, rounded, on a background mixed from `--muted` into `--bg`. Both themes follow from the existing tokens, so no new variable is introduced and the allowlist is unchanged.
