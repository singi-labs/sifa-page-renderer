---
"@singi-labs/sifa-page-renderer": patch
---

Richly render the nine typed activity-stream body variants (media-review, book, github-pr, event-rsvp, verification, membership, location, travel, standard-site) in `renderActivityStream`, mirroring the sifa-web `/activity` cards, and move each card's verb/action into the meta row so it reads as metadata set apart from the post text.
