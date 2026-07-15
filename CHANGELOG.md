# @singi-labs/academicpages-renderer

## 0.2.1

### Patch Changes

- Add `renderSinglePage()` for server-rendered contexts that serve all sections
  through one route (e.g. sifa-web's `/p/{handle}/academic`). Sections render as
  hidden `<section>` blocks switched via hash-based nav (`#career`, `#education`,
  ...) instead of separate `.html` files.

## 0.2.0

### Minor Changes

- f5321e1: Initial release: pure HTML renderer for academicpages-style personal sites driven by Sifa profile data. Includes renderHome, renderSectionPage, parseSections, configurable asset paths, OG meta tag support, and bundled fonts/logos.
