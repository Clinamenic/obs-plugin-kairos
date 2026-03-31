# starter-obs-plugin

A general-purpose starter workspace for building compliant, maintainable [Obsidian](https://obsidian.md/) plugins.

## What is included

### Plugin scaffold

| File | Purpose |
|------|---------|
| `manifest.json` | Obsidian plugin manifest — id, name, version, minAppVersion, description |
| `package.json` | npm project with TypeScript + esbuild build toolchain |
| `src/main.ts` | Minimal `Plugin` class with settings load/save |
| `src/settings.ts` | Minimal `PluginSettingTab` |
| `src/types.ts` | `PluginSettings` interface placeholder |
| `styles.css` | CSS shell with Obsidian CSS variable guidance |
| `tsconfig.json`, `esbuild.config.mjs` | TypeScript + esbuild configuration |
| `versions.json` | Obsidian version compatibility map |
| `.github/workflows/release.yml` | Automated GitHub release on git tag push |
| `CHANGELOG.md` | Release history in Keep a Changelog format |
| `LICENSE` | MIT license template with `{{YEAR}}` and `{{AUTHOR_NAME}}` placeholders |
| `doap.json` | Structured project metadata — see [DOAP](#doap) below |

### Workspace scaffolding (`.workspace/`)

| File | Purpose |
|------|---------|
| `scripts/version-bump.sh` | Manifest-first SemVer bump — syncs `manifest.json` → `versions.json` → `package.json` → `doap.json` |
| `scripts/doap-sync.sh` | Syncs `doap.json` metadata fields to `package.json` |
| `config/version-bump.conf` | Optional overrides for `version-bump.sh` |
| `docs/ref/obsidian-plugin-guidelines.md` | Obsidian developer policies and submission guidelines |
| `docs/ref/reference.doap.json` | Filled DOAP example for reference |
| `QUICKSTART.md` | Human-readable quick start guide |

### Cursor rules (`.cursor/rules/`)

Each rule is a scoped instruction file loaded by Cursor's AI assistant:

| Rule | Purpose |
|------|---------|
| `001_workspace.mdc` | Workspace philosophy — separation of concerns between project code and scaffolding |
| `002_cursor_rules.mdc` | Cursor rule framework conventions — structure, scope, best practices |
| `003_dev_docs.mdc` | Documentation organization — how to use `.workspace/docs/` |
| `004_dev_tools.mdc` | Development tool reference — scripts and config in `.workspace/` |
| `005a_project_initialization.mdc` | Step-by-step guide for initializing a new plugin from this template |
| `005b_project_update.mdc` | Git + SemVer release workflow — commit analysis, version bumping, two-commit release flow |
| `005c_obsidian_release.mdc` | GitHub release and community plugin submission checklist |
| `008_style.mdc` | Style standards — no-emoji policy, Obsidian CSS variable conventions, class prefixing |
| `009_obsidian_plugin.mdc` | Comprehensive Obsidian API compliance — manifest, mobile, UI text, security, vault, workspace, commands, TypeScript |
| `027_planning_doc.mdc` | Planning document workflow — how to create and archive implementation plans |

### Claude Code rules (`.claude/rules/`)

Mirrors the Cursor ruleset for use with [Claude Code](https://code.claude.com). `CLAUDE.md` at the repo root imports `AGENTS.md` and points to this directory:

| Rule | Purpose |
|------|---------|
| `001_workspace.md` | Workspace philosophy |
| `002_claude_rules.md` | Claude rule framework conventions and `paths:` scoping |
| `003_dev_docs.md` | Documentation organization |
| `004_dev_tools.md` | Development tool reference |
| `005a_project_initialization.md` | Plugin initialization workflow |
| `005b_project_update.md` | Git + SemVer release workflow |
| `005c_obsidian_release.md` | GitHub release and submission checklist |
| `008_style.md` | Style standards |
| `009_obsidian_plugin.md` | Obsidian API compliance (path-scoped to `src/**/*.ts`, `manifest.json`, `styles.css`) |
| `027_planning_doc.md` | Planning document workflow |

### Agent orientation

| File | Purpose |
|------|---------|
| `AGENTS.md` | Comprehensive AI assistant orientation — directory structure, conventions, scripts, workflows, session protocols |
| `CLAUDE.md` | Claude Code entry point — imports `AGENTS.md` and references `.claude/rules/` |

---

## DOAP

`doap.json` provides structured project metadata combining the [DOAP](http://usefulinc.com/ns/doap#) vocabulary with [schema.org](https://schema.org/) types, extended with Obsidian-specific fields.

### Why it exists

`manifest.json` is minimal by design — Obsidian only needs a handful of fields. `doap.json` carries the richer metadata that `manifest.json` cannot: author profile, repository URL, issue tracker, release history, keywords, and related projects. It also provides a machine-readable record that tooling and AI assistants can query without parsing markdown.

### Obsidian-specific fields

```json
{
  "obsidianPluginId": "my-plugin",
  "obsidianMinVersion": "1.0.0",
  "releases": [
    {
      "@type": "SoftwareRelease",
      "version": "1.0.0",
      "url": "https://github.com/example/my-plugin/releases/tag/v1.0.0",
      "releaseDate": "2026-01-01",
      "description": "Initial release"
    }
  ]
}
```

- `obsidianPluginId` — must match `manifest.json` `id`
- `obsidianMinVersion` — must match `manifest.json` `minAppVersion`
- `releases[]` — append one entry per release; updated automatically by `version-bump.sh`

### Version sync

`manifest.json` is the single source of truth for the version. The `version-bump.sh` script propagates changes in this order:

```
manifest.json → versions.json → package.json → doap.json
```

After editing `doap.json` metadata (author, keywords, etc.), run `doap-sync.sh` to push relevant fields back to `package.json`.

See `.workspace/docs/ref/reference.doap.json` for a fully filled example.

---

## Getting started

1. Use this template on GitHub (click "Use this template") or clone it
2. Open in Cursor or Claude Code and ask the assistant to initialize the project (rule `005a`), or replace `{{PLACEHOLDER}}` values manually — see `AGENTS.md` for the full list
3. `npm install && npm run build`
4. Develop with `npm run dev`; symlink the folder into a test vault

For releases, see `AGENTS.md` or `.cursor/rules/005b_project_update.mdc` / `.claude/rules/005b_project_update.md`.

---

## Design decisions

- **`manifest.json` is the version source of truth** — Obsidian reads it; the version-bump script bumps it first and syncs to all other files
- **`doap.json` for structured metadata** — Obsidian-specific fields (`obsidianPluginId`, `obsidianMinVersion`, `releases[]`) track plugin identity and release history in a machine-readable format
- **Parallel Cursor and Claude rule sets** — `.cursor/rules/` and `.claude/rules/` carry identical guidance in their respective formats; `.workspace/` scripts and docs are assistant-agnostic
- **Lean rule set** — only rules directly relevant to Obsidian plugin development are included
