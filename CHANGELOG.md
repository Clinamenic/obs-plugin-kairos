# Changelog

## 0.2.3 - 2026-04-25

Commit: 7763498 (2026-04-25T20:20:55-07:00)

### Fixed

- fix(ui): modal padding overridden to bottom-only (16px); removes Obsidian default padding on top and sides
- fix(ui): modal header bottom margin removed
- fix(ui): modal body given side padding to replace the removed modal padding

## 0.2.2 - 2026-04-25

Commit: b8201c8 (2026-04-25T20:16:07-07:00)

### Changed

- style(ui): remove top and side padding from modal body (bottom padding retained)
- feat(ui): locations field converted to pill/chip UI (matching people and films fields)
- feat(ui): all custom fields with type "list" now render as pills; applies to any future list fields added in settings

## 0.2.1 - 2026-04-25

Commit: 649e5af (2026-04-25T19:47:23-07:00)

### Added

- feat(editor): formatting toolbar above the CM6 editor with B / I / [ ] / ` buttons (mousedown keeps focus in editor; tooltips show keyboard shortcuts)
- feat(editor): editor content area capped at 300px height with overflow scroll

## 0.2.0 - 2026-04-25

Commit: a451fe7 (2026-04-25T19:33:19-07:00)

### Added

- feat(editor): replace plain textarea with a full CodeMirror 6 editor
  - markdown syntax highlighting (headings, bold, italic, code, blockquotes, links)
  - wikilink autocomplete (`[[` triggers suggestions from vault files, starts-with priority)
  - keyboard formatting shortcuts: Mod-b (bold), Mod-i (italic), Mod-k (link), Mod-` (code)
  - undo/redo via history extension
  - soft line-wrapping
  - Obsidian-themed styles (accent, text, background variables)
  - auto-save via CM6 update listener (500 ms debounce, same as before)

## 0.1.9 - 2026-04-26

Commit: 2204cfd

### Fixed

- fix(ui): sticky header finally working — modal capped at 90vh with flex-column layout; modal-content gets flex:1 + min-height:0 + overflow-y:auto so it scrolls while modal-header stays fixed above it

## 0.1.8 - 2026-04-26

Commit: 6a36979

### Fixed

- fix(ui): nav bar moved into Obsidian's native .modal-header element, which sits permanently above the scrollable .modal-content — sticky header now works without any CSS position tricks; body scrolls freely via Obsidian's built-in modal-content overflow

## 0.1.7 - 2026-04-26

Commit: e4cb3ad

### Fixed

- fix(ui): sticky header now works correctly — body scrolls while header stays fixed
  - removed `overflow: hidden` from modal-content (was squishing content)
  - added `min-height: 0` to body (required for flex children to scroll rather than overflow)

## 0.1.6 - 2026-04-26

Commit: 6d345e7

### Added

- feat(ui): autosuggest for films-watched field (from existing journal entries, starts-with priority)
- feat(ui): autosuggest for locations field (from existing journal entries)
- feat(ui): autosuggest for all extra fields (from existing journal entries)
- feat(ui): sticky modal header — nav bar stays fixed while body scrolls (max-height 85vh)

## 0.1.5 - 2026-04-26

Commit: 3458772

### Added

- feat(search): autocomplete prioritises starts-with matches before contains matches

### Fixed

- fix(ui): chip container has padding around its edges
- fix(ui): footer and Close button removed; click outside to dismiss
- fix(ui): nav buttons use accent colour (pill style) with uniform 26px height matching the date picker

## 0.1.4 - 2026-04-26

Commit: 0e55610

### Fixed

- fix(ui): pill border-radius set to 100px for fully rounded ends
- fix(ui): x button uses a small circle background (rgba 20% black overlay) that darkens on hover

## 0.1.3 - 2026-04-26

Commit: fea6787

### Fixed

- fix(ui): move media drop zone to directly below content textarea
- fix(ui): chips now appear below the input row, not inline with it
- fix(ui): pills use accent colour (`--interactive-accent`) with `--text-on-accent` text
- fix(ui): pills are shorter (fixed 20px height), x button has no background and is slightly larger

## 0.1.2 - 2026-04-26

Commit: d676803

### Fixed

- fix(ribbon): scale custom icon SVG to 100x100 coordinate space (Obsidian's addIcon viewBox)
- fix(nav): reorder modal header to [prev] [Today] [date] [next] [date picker]

## 0.1.1 - 2026-04-26

Commit: 8bf3650

### Fixed

- fix(ribbon): register custom icon with addIcon before addRibbonIcon so the ribbon button renders correctly

## 0.1.0 - 2026-04-25

### Added

- Initial release
