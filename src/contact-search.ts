import { App, TFile } from "obsidian";

export function searchContacts(app: App, query: string): TFile[] {
  const q = query.toLowerCase().trim();
  const results: TFile[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    if (cache?.frontmatter?.["type"] !== "contact") continue;
    if (!q || file.basename.toLowerCase().includes(q)) {
      results.push(file);
    }
  }

  results.sort((a, b) => a.basename.localeCompare(b.basename));
  return results.slice(0, 20);
}
