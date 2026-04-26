import { App, TFile } from "obsidian";

export function searchContacts(app: App, query: string): TFile[] {
  const q = query.toLowerCase().trim();
  const startsWith: TFile[] = [];
  const contains: TFile[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    if (cache?.frontmatter?.["type"] !== "contact") continue;
    const name = file.basename.toLowerCase();
    if (!q) {
      startsWith.push(file);
    } else if (name.startsWith(q)) {
      startsWith.push(file);
    } else if (name.includes(q)) {
      contains.push(file);
    }
  }

  startsWith.sort((a, b) => a.basename.localeCompare(b.basename));
  contains.sort((a, b) => a.basename.localeCompare(b.basename));

  return [...startsWith, ...contains].slice(0, 20);
}
