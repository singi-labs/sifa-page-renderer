---
"@singi-labs/sifa-page-renderer": patch
---

Always show the profile's Bluesky account in the sidebar. Every Sifa profile is an AT Protocol identity, so the handle is rendered unconditionally as an `@handle` link to `bsky.app/profile/<handle>` with the Bluesky icon, even when the user has not added it as an external account. A Bluesky link the user added by hand for the same profile collapses into this canonical entry rather than duplicating.
