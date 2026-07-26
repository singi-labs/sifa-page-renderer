---
"@singi-labs/sifa-page-renderer": patch
---

Fix activity-card layout on narrow screens. The source pill and relative time no longer wrap mid-phrase ("Bluesky / network", "10d / ago") -- both stay on one line and the verb truncates instead, and the verb is hidden entirely below 760px. An embedded post's author name and handle stack on two rows on mobile, so a long handle no longer squeezes the display name to a few characters or pushes the page wider than the viewport (horizontal scroll on /now).
