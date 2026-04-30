import { App, TFile, Modal, normalizePath, Vault } from "obsidian";
import type ChronologPlugin from "./main";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildEntryPath(
  journalRoot: string,
  date: Date
): string {
  const year = date.getFullYear();
  const monthNum = String(date.getMonth() + 1).padStart(2, "0");
  const monthName = MONTH_NAMES[date.getMonth()];
  const dayNum = String(date.getDate()).padStart(2, "0");
  const dayName = DAY_NAMES[date.getDay()];
  const iso = dateToIso(date);

  const folder = normalizePath(
    `${journalRoot}/${year}/${monthNum}-${monthName}/${dayNum}-${dayName}`
  );
  const filename = `Journal ${iso} ${dayName}.md`;
  return `${folder}/${filename}`;
}

export function buildMediaFolder(entryPath: string): string {
  const folder = entryPath.substring(0, entryPath.lastIndexOf("/"));
  return `${folder}/media`;
}

/** Obsidian vault paths cannot contain `\`, `/`, or `:`. Strip path segments and replace forbidden chars. */
export function sanitizeVaultAttachmentBasename(originalName: string): string {
  const lastSep = Math.max(
    originalName.lastIndexOf("/"),
    originalName.lastIndexOf("\\")
  );
  const leaf = lastSep >= 0 ? originalName.slice(lastSep + 1) : originalName;
  const safe = leaf.replace(/[/\\]+/g, "_").replace(/:+/g, "_");
  const dot = safe.lastIndexOf(".");
  const ext = dot >= 0 ? safe.slice(dot) : "";
  let stem = dot >= 0 ? safe.slice(0, dot) : safe;
  stem = stem.replace(/^[.\s_]+|[.\s_]+$/g, "");
  if (!stem) stem = "attachment";
  return ext ? `${stem}${ext}` : stem;
}

function insertSuffixBeforeExt(basename: string, n: number): string {
  const dot = basename.lastIndexOf(".");
  if (dot <= 0) return `${basename}-${n}`;
  return `${basename.slice(0, dot)}-${n}${basename.slice(dot)}`;
}

/** Returns a vault path under `mediaFolder` that passes `checkPath`, avoiding name collisions. */
export function resolveAttachmentDestPath(
  vault: Vault,
  mediaFolder: string,
  originalName: string
): { destPath: string; basename: string } {
  const safeBasename = sanitizeVaultAttachmentBasename(originalName);
  let i = 0;
  while (true) {
    const leaf =
      i === 0 ? safeBasename : insertSuffixBeforeExt(safeBasename, i);
    const destPath = normalizePath(`${mediaFolder}/${leaf}`);
    if (!vault.getAbstractFileByPath(destPath)) {
      return { destPath, basename: leaf };
    }
    i++;
  }
}

export function findEntryByDate(app: App, isoDate: string): TFile | null {
  const files = app.vault.getMarkdownFiles();
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) continue;
    if (fm["type"] !== "journal-entry") continue;
    const rawDate = fm["date"];
    if (!rawDate) continue;
    // Normalise: date may be a Date object (parsed by yaml), a string, or a number
    const dateStr =
      rawDate instanceof Date
        ? dateToIso(rawDate)
        : String(rawDate).slice(0, 10);
    if (dateStr === isoDate) return file;
  }
  return null;
}

export function findNearestPreviousEntry(
  app: App,
  isoDate: string
): TFile | null {
  const files = app.vault.getMarkdownFiles();
  let best: { file: TFile; date: string } | null = null;

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm || fm["type"] !== "journal-entry") continue;
    const rawDate = fm["date"];
    if (!rawDate) continue;
    const dateStr =
      rawDate instanceof Date
        ? dateToIso(rawDate)
        : String(rawDate).slice(0, 10);
    if (dateStr >= isoDate) continue;
    if (!best || dateStr > best.date) {
      best = { file, date: dateStr };
    }
  }
  return best ? best.file : null;
}

function buildNewEntryFrontmatter(
  isoDate: string,
  previousEntryName: string | null
): string {
  const uuid = crypto.randomUUID();
  const prevLink = previousEntryName ? `"[[${previousEntryName}]]"` : "null";
  return [
    "---",
    `uuid: ${uuid}`,
    `date: ${isoDate}`,
    "locations:",
    "people:",
    "type: journal-entry",
    "has-content: false",
    `previous_entry: ${prevLink}`,
    "next_entry:",
    "media_attachments:",
    "---",
    "",
  ].join("\n");
}

export async function createEntryFile(
  app: App,
  plugin: ChronologPlugin,
  date: Date
): Promise<TFile | null> {
  const isoDate = dateToIso(date);
  const entryPath = buildEntryPath(plugin.settings.journalRoot, date);
  const folderPath = entryPath.substring(0, entryPath.lastIndexOf("/"));

  // Ensure folder hierarchy exists
  const parts = folderPath.split("/");
  let accumulated = "";
  for (const part of parts) {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    if (!app.vault.getFolderByPath(accumulated)) {
      await app.vault.createFolder(accumulated);
    }
  }

  // Find previous entry to link
  const prevFile = findNearestPreviousEntry(app, isoDate);
  const prevName = prevFile
    ? prevFile.basename
    : null;

  const content = buildNewEntryFrontmatter(isoDate, prevName);
  const newFile = await app.vault.create(entryPath, content);

  // Update previous entry's next_entry field
  if (prevFile) {
    const dayName = DAY_NAMES[date.getDay()];
    const newName = `Journal ${isoDate} ${dayName}`;
    await app.fileManager.processFrontMatter(prevFile, (fm) => {
      fm["next_entry"] = `[[${newName}]]`;
    });
  }

  return newFile;
}

export class ConfirmCreateModal extends Modal {
  private date: Date;
  private onConfirm: () => void;
  private onCancel: () => void;

  constructor(
    app: App,
    date: Date,
    onConfirm: () => void,
    onCancel: () => void
  ) {
    super(app);
    this.date = date;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  onOpen(): void {
    const { contentEl } = this;
    const iso = dateToIso(this.date);
    contentEl.createEl("p", {
      text: `No journal entry found for ${iso}. Create one?`,
    });

    const btnRow = contentEl.createDiv({ cls: "chronolog-confirm-row" });

    btnRow.createEl("button", { text: "Create", cls: "mod-cta" }).addEventListener(
      "click",
      () => {
        this.close();
        this.onConfirm();
      }
    );

    btnRow.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
      this.close();
      this.onCancel();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
