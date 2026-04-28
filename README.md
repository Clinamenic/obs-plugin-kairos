# Chronolog

Obsidian plugin for a daily journal dashboard: open entries by date, edit body and structured frontmatter fields, and attach media.

Source: [github.com/Clinamenic/obs-plugin-chronolog](https://github.com/Clinamenic/obs-plugin-chronolog).

## Requirements

- Obsidian desktop (`isDesktopOnly` is required for current features).
- Minimum Obsidian version: see `manifest.json` (`minAppVersion`).

## Development

```bash
npm install
npm run build
```

Watch mode:

```bash
npm run dev
```

Symlink this directory into a vault for testing:

```bash
ln -s /path/to/obs-plugin-chronolog /path/to/vault/.obsidian/plugins/chronolog
```

Enable **Chronolog** under Settings - Community plugins (or enable the plugin id `chronolog` in your development vault).

## Release

See [AGENTS.md](AGENTS.md) and `.cursor/rules/005b_project_update.mdc` / `005c_obsidian_release.mdc` for version bumps and GitHub releases (tag push builds `main.js`, `manifest.json`, `styles.css`).

## License

MIT. See [LICENSE](LICENSE).
