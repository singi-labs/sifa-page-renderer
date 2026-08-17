---
'@singi-labs/sifa-page-renderer': patch
---

Make single-page section navigation work with JavaScript disabled.

In single-page mode the sections were switched by an inline script keyed off the URL hash, so with JS off only the default About section showed and the nav links revealed nothing. The single-page document now carries a `single-page` body class, and the stylesheet uses `:target` (plus `:has` for the default section) to show the section named in the URL hash, so the nav works without JS. Multi-page output, which renders one section per document, is untouched.
