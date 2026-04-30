import { TFile, debounce, getFrontMatterInfo, parseYaml } from "obsidian";
import type ChronologPlugin from "./main";

const TRACK_DEBOUNCE_MS = 1000;

function normalizeBoolean(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  if (typeof value === "number") return value === 1;
  return false;
}

function computeHasContent(body: string): boolean {
  return body.trim().length > 0;
}

export function registerBodyContentTracking(plugin: ChronologPlugin): void {
  const handlers = new Map<string, () => void>();

  const runForFile = async (file: TFile): Promise<void> => {
    const content = await plugin.app.vault.read(file);
    const info = getFrontMatterInfo(content);
    if (!info.exists) return;

    let parsedFrontmatter: Record<string, unknown>;
    try {
      const parsed = parseYaml(info.frontmatter);
      if (!parsed || typeof parsed !== "object") return;
      parsedFrontmatter = parsed as Record<string, unknown>;
    } catch {
      return;
    }

    if (parsedFrontmatter["type"] !== "journal-entry") return;

    const body = content.slice(info.contentStart);
    const nextHasContent = computeHasContent(body);
    const currentHasContent = normalizeBoolean(parsedFrontmatter["has-content"]);
    if (nextHasContent === currentHasContent) return;

    await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter["has-content"] = nextHasContent;
    });
  };

  plugin.registerEvent(
    plugin.app.vault.on("modify", (abstractFile) => {
      if (!(abstractFile instanceof TFile) || abstractFile.extension !== "md") return;

      const key = abstractFile.path;
      let handler = handlers.get(key);
      if (!handler) {
        handler = debounce(
          () => {
            void runForFile(abstractFile);
          },
          TRACK_DEBOUNCE_MS,
          true
        );
        handlers.set(key, handler);
      }
      handler();
    })
  );

  plugin.register(() => {
    handlers.clear();
  });
}
