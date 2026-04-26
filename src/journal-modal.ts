import { App, Modal, TFile, normalizePath } from "obsidian";
import type KairosPlugin from "./main";
import type { ExtraField } from "./types";
import {
  dateToIso,
  findEntryByDate,
  createEntryFile,
  ConfirmCreateModal,
  buildMediaFolder,
} from "./journal-service";
import { searchContacts } from "./contact-search";
import { searchFieldValues } from "./field-search";
import { createEditor } from "./editor";
import type { EditorView } from "@codemirror/view";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

function formatHeaderDate(date: Date): string {
  return `${DAY_NAMES_LONG[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function parseWikilinks(values: unknown): string[] {
  if (!values) return [];
  if (Array.isArray(values)) {
    return values
      .filter((v) => v != null)
      .map((v) => String(v).trim())
      .filter(Boolean);
  }
  if (typeof values === "string") {
    return values
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function toWikilink(basename: string): string {
  return `[[${basename}]]`;
}

function stripWikilink(raw: string): string {
  return raw.replace(/^\[\[/, "").replace(/\]\]$/, "");
}

export class JournalModal extends Modal {
  private plugin: KairosPlugin;
  private currentDate: Date;
  private currentFile: TFile | null = null;

  // UI state
  private people: string[] = [];
  private films: string[] = [];
  private locations: string[] = [];
  private extraValues: Record<string, string | string[]> = {};

  // Debounce for CM6 editor content saves
  private contentDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 500;

  // DOM refs
  private headerDateEl!: HTMLElement;
  private editorView: EditorView | null = null;
  private peopleContainer!: HTMLElement;
  private peopleInput!: HTMLInputElement;
  private peopleSuggestions!: HTMLElement;
  private filmsContainer!: HTMLElement;
  private filmsInput!: HTMLInputElement;
  private filmsSuggestions!: HTMLElement;
  private locationsInput!: HTMLInputElement;
  private locationsSuggestions!: HTMLElement;
  private extraFieldEls: Record<string, HTMLInputElement> = {};
  private extraFieldSuggestions: Record<string, HTMLElement> = {};
  private mediaGrid!: HTMLElement;

  constructor(app: App, plugin: KairosPlugin, date?: Date) {
    super(app);
    this.plugin = plugin;
    this.currentDate = date ?? new Date();
  }

  async onOpen(): Promise<void> {
    this.modalEl.addClass("kairos-modal");
    this.buildShell();
    await this.loadDate(this.currentDate);
  }

  onClose(): void {
    if (this.contentDebounceTimer !== null) {
      clearTimeout(this.contentDebounceTimer);
      this.contentDebounceTimer = null;
    }
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }
    // Remove the nav bar we injected into Obsidian's modal-header
    this.titleEl.parentElement
      ?.querySelectorAll(".kairos-header")
      .forEach((el) => el.remove());
    this.contentEl.empty();
  }

  // -------------------------------------------------------------------------
  // Shell (static chrome that persists across date navigation)
  // -------------------------------------------------------------------------

  private buildShell(): void {
    // ── Nav bar ──────────────────────────────────────────────────────────────
    // Inject into Obsidian's .modal-header (already above and separate from the
    // scrollable .modal-content), so stickiness comes for free from the DOM
    // structure rather than CSS tricks.
    const modalHeader = this.titleEl.parentElement!;
    modalHeader.querySelectorAll(".kairos-header").forEach((el) => el.remove());
    const header = modalHeader.createDiv({ cls: "kairos-header" });

    const prevBtn = header.createEl("button", {
      cls: "kairos-nav-btn",
      text: "\u2039",
      attr: { "aria-label": "Previous day" },
    });

    const todayBtn = header.createEl("button", {
      cls: "kairos-today-btn",
      text: "Today",
    });

    this.headerDateEl = header.createEl("span", { cls: "kairos-header-date" });

    const nextBtn = header.createEl("button", {
      cls: "kairos-nav-btn",
      text: "\u203a",
      attr: { "aria-label": "Next day" },
    });

    const datePicker = header.createEl("input", {
      cls: "kairos-date-picker",
      attr: { type: "date", "aria-label": "Jump to date" },
    }) as HTMLInputElement;

    prevBtn.addEventListener("click", () => this.navigateDay(-1));
    nextBtn.addEventListener("click", () => this.navigateDay(1));
    datePicker.addEventListener("change", () => {
      if (datePicker.value) {
        const [y, m, d] = datePicker.value.split("-").map(Number);
        this.navigateTo(new Date(y, m - 1, d));
      }
    });
    todayBtn.addEventListener("click", () => this.navigateTo(new Date()));

    // ── Body ─────────────────────────────────────────────────────────────────
    // Goes into contentEl (.modal-content), which Obsidian already makes
    // scrollable, so no custom overflow CSS needed.
    const { contentEl } = this;
    contentEl.empty();

    // Body
    const body = contentEl.createDiv({ cls: "kairos-body" });

    // Content
    body.createEl("label", { cls: "kairos-field-label", text: "Content" });
    const editorWrap = body.createDiv({ cls: "kairos-editor-wrap" });
    this.editorView = createEditor(
      editorWrap,
      this.app,
      "",
      (doc) => this.scheduleContentSave(doc)
    );

    // Media (directly beneath content)
    body.createEl("label", { cls: "kairos-field-label", text: "Media" });
    const dropZone = body.createDiv({ cls: "kairos-drop-zone" });
    dropZone.createEl("span", {
      cls: "kairos-drop-hint",
      text: "Drop photos or videos here",
    });
    this.mediaGrid = dropZone.createDiv({ cls: "kairos-media-grid" });

    dropZone.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      dropZone.addClass("kairos-drop-active");
    });
    dropZone.addEventListener("dragleave", () =>
      dropZone.removeClass("kairos-drop-active")
    );
    dropZone.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      dropZone.removeClass("kairos-drop-active");
      const files = e.dataTransfer?.files;
      if (files) {
        Array.from(files).forEach((f) => this.handleMediaDrop(f));
      }
    });

    // People
    body.createEl("label", { cls: "kairos-field-label", text: "People" });
    const peopleWrapper = body.createDiv({ cls: "kairos-chip-field" });
    const peopleInputRow = peopleWrapper.createDiv({
      cls: "kairos-chip-input-row",
    });
    this.peopleInput = peopleInputRow.createEl("input", {
      cls: "kairos-chip-input",
      attr: { type: "text", placeholder: "Search contacts..." },
    });
    this.peopleSuggestions = peopleInputRow.createDiv({
      cls: "kairos-suggestions",
    });
    this.peopleSuggestions.hide();
    this.peopleContainer = peopleWrapper.createDiv({
      cls: "kairos-chip-container",
    });
    this.peopleInput.addEventListener("input", () =>
      this.updatePeopleSuggestions()
    );
    this.peopleInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.peopleSuggestions.hide();
        this.peopleInput.value = "";
      }
    });
    document.addEventListener(
      "click",
      (e: MouseEvent) => {
        if (!peopleWrapper.contains(e.target as Node)) {
          this.peopleSuggestions.hide();
        }
      },
      { capture: true }
    );

    // Films watched
    body.createEl("label", {
      cls: "kairos-field-label",
      text: "Films watched",
    });
    const filmsWrapper = body.createDiv({ cls: "kairos-chip-field" });
    const filmsInputRow = filmsWrapper.createDiv({
      cls: "kairos-chip-input-row",
    });
    this.filmsInput = filmsInputRow.createEl("input", {
      cls: "kairos-chip-input",
      attr: {
        type: "text",
        placeholder: "Add a film and press Enter...",
      },
    });
    this.filmsSuggestions = filmsInputRow.createDiv({
      cls: "kairos-suggestions",
    });
    this.filmsSuggestions.hide();
    this.filmsContainer = filmsWrapper.createDiv({
      cls: "kairos-chip-container",
    });
    this.filmsInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === ",") && this.filmsInput.value.trim()) {
        e.preventDefault();
        this.addFilm(this.filmsInput.value.trim().replace(/,$/, ""));
        this.filmsInput.value = "";
        this.filmsSuggestions.hide();
      }
    });
    this.filmsInput.addEventListener("input", () =>
      this.updateFilmsSuggestions()
    );
    document.addEventListener(
      "click",
      (e: MouseEvent) => {
        if (!filmsWrapper.contains(e.target as Node)) {
          this.filmsSuggestions.hide();
        }
      },
      { capture: true }
    );

    // Locations
    body.createEl("label", { cls: "kairos-field-label", text: "Locations" });
    const locationsWrapper = body.createDiv({ cls: "kairos-chip-input-row" });
    this.locationsInput = locationsWrapper.createEl("input", {
      cls: "kairos-chip-input",
      attr: {
        type: "text",
        placeholder: "e.g. US, CA, San Francisco",
      },
    }) as HTMLInputElement;
    this.locationsSuggestions = locationsWrapper.createDiv({
      cls: "kairos-suggestions",
    });
    this.locationsSuggestions.hide();
    this.locationsInput.addEventListener("change", () => this.saveLocations());
    this.locationsInput.addEventListener("input", () =>
      this.updateLocationsSuggestions()
    );
    document.addEventListener(
      "click",
      (e: MouseEvent) => {
        if (!locationsWrapper.contains(e.target as Node)) {
          this.locationsSuggestions.hide();
        }
      },
      { capture: true }
    );

    // Extra fields
    const { extraFields } = this.plugin.settings;
    if (extraFields.length > 0) {
      body.createEl("div", { cls: "kairos-divider" });
      for (const field of extraFields) {
        body.createEl("label", {
          cls: "kairos-field-label",
          text: field.label || field.key,
        });
        const fieldWrapper = body.createDiv({ cls: "kairos-chip-input-row" });
        const input = fieldWrapper.createEl("input", {
          cls: "kairos-chip-input",
          attr: { type: "text" },
        }) as HTMLInputElement;
        const sugEl = fieldWrapper.createDiv({ cls: "kairos-suggestions" });
        sugEl.hide();
        input.addEventListener("change", () =>
          this.saveExtraField(field, input.value)
        );
        input.addEventListener("input", () =>
          this.updateExtraFieldSuggestions(field, input, sugEl)
        );
        document.addEventListener(
          "click",
          (e: MouseEvent) => {
            if (!fieldWrapper.contains(e.target as Node)) sugEl.hide();
          },
          { capture: true }
        );
        this.extraFieldEls[field.key] = input;
        this.extraFieldSuggestions[field.key] = sugEl;
      }
    }

    // No footer — click outside the modal to close
  }

  // -------------------------------------------------------------------------
  // Date navigation
  // -------------------------------------------------------------------------

  private async navigateDay(delta: number): Promise<void> {
    await this.flushContentDebounce();
    const next = new Date(this.currentDate);
    next.setDate(next.getDate() + delta);
    await this.loadDate(next);
  }

  private async navigateTo(date: Date): Promise<void> {
    await this.flushContentDebounce();
    await this.loadDate(date);
  }

  // -------------------------------------------------------------------------
  // Load a date into the modal
  // -------------------------------------------------------------------------

  private async loadDate(date: Date): Promise<void> {
    this.currentDate = date;
    this.headerDateEl.setText(formatHeaderDate(date));

    const isoDate = dateToIso(date);
    let file = findEntryByDate(this.app, isoDate);

    if (!file) {
      // Show empty state; offer creation
      this.currentFile = null;
      this.clearFields();
      await new Promise<void>((resolve) => {
        new ConfirmCreateModal(
          this.app,
          date,
          async () => {
            const created = await createEntryFile(
              this.app,
              this.plugin,
              date
            );
            if (created) {
              this.currentFile = created;
              await this.populateFields(created);
            }
            resolve();
          },
          () => resolve()
        ).open();
      });
      return;
    }

    this.currentFile = file;
    await this.populateFields(file);
  }

  // -------------------------------------------------------------------------
  // Populate fields from file
  // -------------------------------------------------------------------------

  private async populateFields(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const body = this.extractBody(content);

    if (this.editorView) {
      const current = this.editorView.state.doc.toString();
      if (current !== body) {
        this.editorView.dispatch({
          changes: { from: 0, to: current.length, insert: body },
        });
      }
    }

    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter ?? {};

    this.people = parseWikilinks(fm["people"]);
    this.films = parseWikilinks(fm["films-watched"]);
    this.locations = parseWikilinks(fm["locations"]);

    this.renderPeopleChips();
    this.renderFilmsChips();
    this.locationsInput.value = this.locations.join(", ");

    for (const field of this.plugin.settings.extraFields) {
      const el = this.extraFieldEls[field.key];
      if (!el) continue;
      const val = fm[field.key];
      if (field.type === "list") {
        el.value = Array.isArray(val)
          ? val.join(", ")
          : val != null
          ? String(val)
          : "";
      } else {
        el.value = val != null ? String(val) : "";
      }
    }

    // Media
    const mediaField = this.plugin.settings.mediaAttachmentsField;
    const attachments = parseWikilinks(fm[mediaField]);
    this.renderMediaGrid(attachments, file);
  }

  private clearFields(): void {
    if (this.editorView) {
      const len = this.editorView.state.doc.length;
      this.editorView.dispatch({ changes: { from: 0, to: len, insert: "" } });
    }
    this.people = [];
    this.films = [];
    this.locations = [];
    this.renderPeopleChips();
    this.renderFilmsChips();
    this.locationsInput.value = "";
    for (const key of Object.keys(this.extraFieldEls)) {
      this.extraFieldEls[key].value = "";
    }
    this.mediaGrid.empty();
  }

  // -------------------------------------------------------------------------
  // Content save (debounced, driven by CM6 update listener)
  // -------------------------------------------------------------------------

  private scheduleContentSave(doc: string): void {
    if (this.contentDebounceTimer !== null) {
      clearTimeout(this.contentDebounceTimer);
    }
    this.contentDebounceTimer = setTimeout(
      () => this.saveContent(doc),
      this.DEBOUNCE_MS
    );
  }

  private async flushContentDebounce(): Promise<void> {
    if (this.contentDebounceTimer !== null) {
      clearTimeout(this.contentDebounceTimer);
      this.contentDebounceTimer = null;
    }
    if (this.editorView) {
      await this.saveContent(this.editorView.state.doc.toString());
    }
  }

  private async saveContent(newBody: string): Promise<void> {
    if (!this.currentFile) return;
    await this.app.vault.process(this.currentFile, (raw) => {
      const frontmatterEnd = this.findFrontmatterEnd(raw);
      if (frontmatterEnd === -1) return raw;
      const header = raw.slice(0, frontmatterEnd);
      return `${header}\n${newBody}`;
    });
  }

  // -------------------------------------------------------------------------
  // People chips
  // -------------------------------------------------------------------------

  private renderPeopleChips(): void {
    this.peopleContainer.empty();
    for (const person of this.people) {
      this.peopleContainer.appendChild(
        this.createChip(stripWikilink(person), () => {
          this.people = this.people.filter((p) => p !== person);
          this.renderPeopleChips();
          this.savePeople();
        })
      );
    }
  }

  private updatePeopleSuggestions(): void {
    const q = this.peopleInput.value;
    const results = searchContacts(this.app, q);
    this.peopleSuggestions.empty();

    if (results.length === 0) {
      this.peopleSuggestions.hide();
      return;
    }

    for (const file of results) {
      const link = toWikilink(file.basename);
      if (this.people.includes(link)) continue;
      const item = this.peopleSuggestions.createDiv({
        cls: "kairos-suggestion-item",
        text: file.basename,
      });
      item.addEventListener("mousedown", (e: MouseEvent) => {
        e.preventDefault();
        this.people.push(link);
        this.renderPeopleChips();
        this.savePeople();
        this.peopleInput.value = "";
        this.peopleSuggestions.hide();
      });
    }
    this.peopleSuggestions.show();
  }

  private async savePeople(): Promise<void> {
    if (!this.currentFile) return;
    await this.app.fileManager.processFrontMatter(
      this.currentFile,
      (fm) => {
        fm["people"] = this.people.length ? this.people : null;
      }
    );
  }

  // -------------------------------------------------------------------------
  // Films chips
  // -------------------------------------------------------------------------

  private renderFilmsChips(): void {
    this.filmsContainer.empty();
    for (const film of this.films) {
      this.filmsContainer.appendChild(
        this.createChip(film, () => {
          this.films = this.films.filter((f) => f !== film);
          this.renderFilmsChips();
          this.saveFilms();
        })
      );
    }
  }

  private addFilm(title: string): void {
    if (!title || this.films.includes(title)) return;
    this.films.push(title);
    this.renderFilmsChips();
    this.saveFilms();
  }

  private async saveFilms(): Promise<void> {
    if (!this.currentFile) return;
    await this.app.fileManager.processFrontMatter(
      this.currentFile,
      (fm) => {
        fm["films-watched"] = this.films.length ? this.films : null;
      }
    );
  }

  private updateFilmsSuggestions(): void {
    const q = this.filmsInput.value.trim();
    const results = searchFieldValues(
      this.app, "films-watched", q, "journal-entry"
    ).filter((v) => !this.films.includes(v));
    this.renderSuggestions(this.filmsSuggestions, results, (value) => {
      this.addFilm(value);
      this.filmsInput.value = "";
      this.filmsSuggestions.hide();
    });
  }

  // -------------------------------------------------------------------------
  // Locations
  // -------------------------------------------------------------------------

  private async saveLocations(): Promise<void> {
    if (!this.currentFile) return;
    const raw = this.locationsInput.value;
    this.locations = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await this.app.fileManager.processFrontMatter(
      this.currentFile,
      (fm) => {
        fm["locations"] = this.locations.length ? this.locations : null;
      }
    );
  }

  private updateLocationsSuggestions(): void {
    const q = this.locationsInput.value.trim();
    const results = searchFieldValues(this.app, "locations", q, "journal-entry");
    this.renderSuggestions(this.locationsSuggestions, results, (value) => {
      this.locationsInput.value = value;
      this.locationsSuggestions.hide();
      this.saveLocations();
    });
  }

  // -------------------------------------------------------------------------
  // Extra fields
  // -------------------------------------------------------------------------

  private async saveExtraField(
    field: ExtraField,
    rawValue: string
  ): Promise<void> {
    if (!this.currentFile) return;
    const value =
      field.type === "list"
        ? rawValue
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : rawValue.trim();
    await this.app.fileManager.processFrontMatter(
      this.currentFile,
      (fm) => {
        fm[field.key] =
          (Array.isArray(value) ? value.length : value) ? value : null;
      }
    );
  }

  private updateExtraFieldSuggestions(
    field: ExtraField,
    input: HTMLInputElement,
    sugEl: HTMLElement
  ): void {
    const q = input.value.trim();
    const results = searchFieldValues(this.app, field.key, q, "journal-entry");
    this.renderSuggestions(sugEl, results, (value) => {
      input.value = value;
      sugEl.hide();
      this.saveExtraField(field, value);
    });
  }

  // -------------------------------------------------------------------------
  // Shared suggestion renderer
  // -------------------------------------------------------------------------

  private renderSuggestions(
    container: HTMLElement,
    items: string[],
    onSelect: (value: string) => void
  ): void {
    container.empty();
    if (items.length === 0) {
      container.hide();
      return;
    }
    for (const item of items) {
      const el = container.createDiv({
        cls: "kairos-suggestion-item",
        text: item,
      });
      el.addEventListener("mousedown", (e: MouseEvent) => {
        e.preventDefault();
        onSelect(item);
      });
    }
    container.show();
  }

  // -------------------------------------------------------------------------
  // Media
  // -------------------------------------------------------------------------

  private renderMediaGrid(attachments: string[], file: TFile): void {
    this.mediaGrid.empty();
    const mediaField = this.plugin.settings.mediaAttachmentsField;

    for (const link of attachments) {
      const name = stripWikilink(link);
      const item = this.mediaGrid.createDiv({ cls: "kairos-media-item" });

      const mediaFile = this.app.vault.getFileByPath(
        normalizePath(`${buildMediaFolder(file.path)}/${name}`)
      );

      if (mediaFile && /\.(jpe?g|png|gif|webp|avif)$/i.test(name)) {
        const img = item.createEl("img", { cls: "kairos-media-thumb" });
        img.src = this.app.vault.getResourcePath(mediaFile);
        img.alt = name;
      } else {
        item.createEl("span", {
          cls: "kairos-media-filename",
          text: name,
        });
      }

      const removeBtn = item.createEl("button", {
        cls: "kairos-media-remove",
        text: "\u00d7",
        attr: { "aria-label": `Remove ${name}` },
      });
      removeBtn.addEventListener("click", async () => {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          const current: string[] = parseWikilinks(fm[mediaField]);
          fm[mediaField] = current.filter((l) => l !== link);
        });
        // Re-read and re-render
        const cache = this.app.metadataCache.getFileCache(file);
        const updated = parseWikilinks(cache?.frontmatter?.[mediaField]);
        this.renderMediaGrid(updated, file);
      });
    }
  }

  private async handleMediaDrop(nativeFile: File): Promise<void> {
    if (!this.currentFile) return;

    const mediaFolder = buildMediaFolder(this.currentFile.path);

    if (!this.app.vault.getFolderByPath(mediaFolder)) {
      await this.app.vault.createFolder(mediaFolder);
    }

    const destPath = normalizePath(`${mediaFolder}/${nativeFile.name}`);
    const arrayBuffer = await nativeFile.arrayBuffer();
    let vaultFile = this.app.vault.getFileByPath(destPath);
    if (!vaultFile) {
      vaultFile = await this.app.vault.createBinary(
        destPath,
        arrayBuffer
      );
    }

    const mediaField = this.plugin.settings.mediaAttachmentsField;
    const link = toWikilink(nativeFile.name);

    await this.app.fileManager.processFrontMatter(
      this.currentFile,
      (fm) => {
        const current: string[] = parseWikilinks(fm[mediaField]);
        if (!current.includes(link)) {
          current.push(link);
          fm[mediaField] = current;
        }
      }
    );

    const cache = this.app.metadataCache.getFileCache(this.currentFile);
    const updated = parseWikilinks(cache?.frontmatter?.[mediaField]);
    this.renderMediaGrid(updated, this.currentFile);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private createChip(label: string, onRemove: () => void): HTMLElement {
    const chip = document.createElement("span");
    chip.className = "kairos-chip";
    chip.createSpan({ text: label });
    const x = chip.createEl("button", {
      cls: "kairos-chip-remove",
      text: "\u00d7",
      attr: { "aria-label": `Remove ${label}` },
    });
    x.addEventListener("click", onRemove);
    return chip;
  }

  private extractBody(raw: string): string {
    const end = this.findFrontmatterEnd(raw);
    if (end === -1) return raw;
    return raw.slice(end).replace(/^\n/, "");
  }

  private findFrontmatterEnd(raw: string): number {
    if (!raw.startsWith("---")) return -1;
    const secondDash = raw.indexOf("\n---", 3);
    if (secondDash === -1) return -1;
    return secondDash + 4;
  }
}
