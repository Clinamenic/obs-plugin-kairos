import { App } from "obsidian";

export function searchFieldValues(
  app: App,
  fieldKey: string,
  query: string,
  typeFilter?: string
): string[] {
  const q = query.toLowerCase().trim();
  const valueSet = new Set<string>();

  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) continue;
    if (typeFilter && fm["type"] !== typeFilter) continue;
    const raw = fm[fieldKey];
    if (!raw) continue;
    const values: string[] = Array.isArray(raw)
      ? raw.filter(Boolean).map(String)
      : [String(raw)];
    for (const v of values) {
      const trimmed = v.trim();
      if (trimmed) valueSet.add(trimmed);
    }
  }

  const all = Array.from(valueSet);
  if (!q) return all.sort().slice(0, 20);

  const startsWith = all.filter((v) => v.toLowerCase().startsWith(q)).sort();
  const contains = all
    .filter((v) => !v.toLowerCase().startsWith(q) && v.toLowerCase().includes(q))
    .sort();

  return [...startsWith, ...contains].slice(0, 20);
}
