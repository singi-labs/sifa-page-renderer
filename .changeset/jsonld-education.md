---
"@singi-labs/sifa-page-renderer": patch
---

State education in the Person JSON-LD. `AcademicProfile` gains an optional `education` list; each visible entry becomes a degree credential in `hasCredential` with its EQF level as `educationalLevel`, built by the SDK like sifa.id's graph. A full SDK `Profile` already carries the list, so callers passing one need no change.
