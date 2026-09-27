---
"@singi-labs/sifa-page-renderer": patch
---

State the rest of the profile in the Person JSON-LD, matching sifa.id's graph: positions as `worksFor` (and `jobTitle` when there is no headline), skills as `knowsAbout`, certifications as credentials, volunteering as `memberOf`, honors as `award`, and languages as `knowsLanguage`. Certification URLs are scheme-checked before they reach the graph. A full SDK `Profile` already carries these lists.
