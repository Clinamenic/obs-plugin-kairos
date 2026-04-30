# Changelog

## 1.1.0 - 2026-04-29

Commit: 54f6257 (2026-04-29T17:21:10-07:00)

### Changed

- feat(ui): sidebar ribbon icon uses the Chronolog mark asset, scaled to Obsidian `addIcon` space and colored with `currentColor` for theme-consistent styling.

## 1.0.0 - 2026-04-27

Commit: 6a07020 (2026-04-27T21:34:16-07:00)

### BREAKING CHANGE

- Plugin renamed from Kairos to Chronolog: Obsidian plugin id is now `chronolog`; display name is Chronolog; CSS classes use the `chronolog-` prefix; ribbon icon id is `chronolog-journal`. Existing installs must rename `.obsidian/plugins/kairos/` to `.obsidian/plugins/chronolog/` and copy `data.json`, or reinstall and restore settings manually.
- Canonical repository URL: `https://github.com/Clinamenic/obs-plugin-chronolog`.

### Fixed

- fix(media): sanitize dropped attachment basenames so vault paths comply with Obsidian rules (forbidden `\`, `/`, `:`); pick a unique filename in the entry `media/` folder when a sanitized name already exists.

### Changed

- Types and exports: `ChronologPlugin`, `ChronologSettingTab`, `ChronologSettings`.

## 0.3.12 - 2026-04-26

Commit: bf2e4e5 (2026-04-26T08:57:46-07:00)

### Changed

- style(ui): journal header control pills use `--background-modifier-form-field` and `--text-normal` with a neutral border, matching the editor surface; hover uses `--background-secondary` (modal header surface)

## 0.3.11 - 2026-04-26

Commit: c84ddf0 (2026-04-26T08:53:29-07:00)

### Changed

- style(ui): journal header pills use a single scoped rule for both `button` and the calendar `label` so accent fill and on-accent text match; `box-shadow` removed on header controls; focus ring uses `outline` only; hidden date input has no focus shadow; calendar `label` uses `:focus-within` when the date field is focused

## 0.3.10 - 2026-04-26

Commit: 2e177fc (2026-04-26T08:48:44-07:00)

### Fixed

- fix(ui): journal calendar uses a label with a full-bleed `input type=date` over the calendar icon so the native date picker opens on a real click; the body `showPicker` workaround is removed; the field value is synced in `loadDate` when the visible day changes

### Changed

- style(ui): media upload tile shows a 32px plus icon instead of the camera icon

## 0.3.9 - 2026-04-26

Commit: a51309e (2026-04-26T08:40:03-07:00)

### Fixed

- fix(ui): hidden `type=date` input is created on `document.body`, tracked on the modal, and removed on close so it no longer affects modal header spacing

## 0.3.8 - 2026-04-26

Commit: fd1c95c (2026-04-26T08:36:59-07:00)

### Fixed

- fix(ui): native date input moved under `modal-header` (outside the flex bar) and cleaned up on close so a second inline calendar control no longer appears beside the calendar icon

## 0.3.7 - 2026-04-26

Commit: c9870f6 (2026-04-26T08:34:17-07:00)

### Fixed

- fix(ui): header calendar control opens a native `input type=date` picker and jumps the journal to the chosen day (`showPicker` with click fallback; styled hidden input in header)

## 0.3.6 - 2026-04-26

Commit: c8d8af5 (2026-04-26T08:26:41-07:00)

### Added

- feat(ui): video attachments in the media strip use a 64px tile with the app “video” icon (via `setIcon`) instead of a filename-only label; common video extensions are detected

### Changed

- style(ui): media tile row is horizontally scrollable (`kairos-media-row-scroll`); no wrapping; first-child upload uses `--background-secondary`
- style(ui): media drop zone uses equal padding on all sides; remove (X) on thumbnails shows on hover or focus, inset inside the tile; attachment tiles use a matching border radius

## 0.3.5 - 2026-04-26

Commit: 48a2123 (2026-04-26T08:17:35-07:00)

### Added

- feat(ui): media upload control is a 64px rounded square tile aligned with thumbnail size; attachments flow in a horizontal row after the tile (`display: contents` on the media grid)

### Changed

- style(ui): editor bottom margin plus `.kairos-body` gap sums to `var(--size-4-4)` (16px on default grid)
- style(ui): media drop zone background uses `--background-modifier-form-field` like the editor

## 0.3.4 - 2026-04-26

Commit: 9c76b52 (2026-04-26T08:09:18-07:00)

### Changed

- style(ui): journal editor surface uses `--background-modifier-form-field` to align with form field rows
- style(ui): CodeMirror layers (content, scroller, editor) use `--radius-m` so focus rings match the rounded wrapper
- style(ui): extra space below the editor and media drop zone via bottom margin on each

## 0.3.3 - 2026-04-26

Commit: b0435cf (2026-04-26T08:00:47-07:00)

### Changed

- style(ui): editor wrap and media drop zone use `--radius-m`, 16px bottom padding, media zone matches editor `--background-secondary`
- style(ui): drag-over media zone uses modifier hover background instead of accent wash
- style(ui): chip pills use `--background-secondary` with a neutral border; remove control uses theme text colours

## 0.3.2 - 2026-04-26

Commit: 93bb7dd (2026-04-26T07:54:40-07:00)

### Changed

- style(ui): chip background uses `--color-accent` so pills match the user accent colour from Settings
- style(ui): media drop zone uses a light accent tint; camera icon larger and vertically centred; active drag state uses stronger accent tint
- style(ui): journal editor uses `--background-secondary`; caret colour set to `--text-normal` so the cursor matches body text
- style(ui): modal height fixed at `min(760px, 90vh)` so switching dates no longer changes overall modal size (content scrolls inside)

## 0.3.1 - 2026-04-26

Commit: b25536b (2026-04-26T07:33:51-07:00)

### Fixed

- fix(editor): scroll boundary moved to CM scroller so autocomplete tooltip is no longer clipped by overflow

## 0.3.0 - 2026-04-26

Commit: 3b57409 (2026-04-26T07:25:09-07:00)

### Added

- feat(editor): right-click context menu with Bold, Italic, Code, Link, Cut, Copy, Paste actions

### Changed

- feat(editor): markdown token styling enhanced with per-level heading sizes, blockquote border, and hr colour
- feat(ui): editor toolbar removed; formatting accessible via keyboard shortcuts and right-click menu

## 0.2.9 - 2026-04-26

Commit: a6c45e9 (2026-04-26T06:48:22-07:00)

### Changed

- feat(ui): field labels given fixed 120px width; input area displayed to the right side by side
- feat(ui): chip containers remain below the input row within the right column
- feat(ui): Content and Media labels removed
- feat(ui): drop zone hint replaced with a camera icon
- feat(ui): clicking the camera icon opens the system file picker (image/video, multi-select)

## 0.2.7 - 2026-04-25

Commit: c0ed310 (2026-04-25T20:53:00-07:00)

### Changed

- fix(ui): removed hidden date picker input and wrapper div; calendar icon button kept as-is
- fix(ui): editor content area changed from max-height to fixed height of 300px
- style(ui): header date shortened to abbreviated day and month (e.g. Sat 25 Apr 2026)

## 0.2.6 - 2026-04-25

Commit: 382cb8f (2026-04-25T20:41:00-07:00)

### Fixed

- fix(ui): removed duplicate kairos-header-left div; Today and calendar now correctly appear as a single left slot

## 0.2.5 - 2026-04-25

Commit: ea704d5 (2026-04-25T20:35:00-07:00)

### Fixed

- fix(ui): Today and calendar buttons moved to far left of header; close button remains at far right

## 0.2.4 - 2026-04-25

Commit: b4aaf4f (2026-04-25T20:29:31-07:00)

### Changed

- feat(ui): modal header restructured into three-slot layout — left spacer / centre nav / right controls
- feat(ui): prev/date/next navigation centred; Today, calendar, and close buttons grouped at far right
- feat(ui): date picker replaced with icon-only calendar button (no visible MM/DD/YYYY text)
- feat(ui): close button moved into header; Obsidian native close button hidden
- style(ui): all header buttons use unified kairos-header-btn style
- fix(ui): modal body top padding restored

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
