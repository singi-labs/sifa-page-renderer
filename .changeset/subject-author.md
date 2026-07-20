---
'@singi-labs/sifa-page-renderer': patch
---

Render the original author (avatar, display name, handle) on nested subject cards, so a quoted, reposted, or replied-to post shows whose post it is. Reads the new `StreamCardVM.author` field (sifa-sdk 0.12.20) and only draws the row at depth greater than zero; top-level cards stay unchanged. Bumps the sifa-sdk peer to 0.12.20.
