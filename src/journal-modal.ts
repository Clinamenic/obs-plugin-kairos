import { App, Menu, Modal, TFile, normalizePath, setIcon } from "obsidian";
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
import { createEditor, wrapSelection, insertLinkSkeleton } from "./editor";
import type { EditorView } from "@codemirror/view";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DAY_NAMES = [
  "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
];

function formatHeaderDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
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

const IMAGE_NAME_PATTERN = /\.(jpe?g|png|gif|webp|avif)$/i;
const VIDEO_NAME_PATTERN =
  /\.(mp4|m4v|webm|mov|mkv|ogv|avi|wmv|mpeg|mpg|3gp?)(\?.*)?$/i;

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
  private locationsContainer!: HTMLElement;
  private locationsInput!: HTMLInputElement;
  private locationsSuggestions!: HTMLElement;
  private extraFieldEls: Record<string, HTMLInputElement> = {};
  private extraFieldSuggestions: Record<string, HTMLElement> = {};
  private extraFieldContainers: Record<string, HTMLElement> = {};
  private extraListValues: Record<string, string[]> = {};
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

    // Left: Today / calendar
    const left = header.createDiv({ cls: "kairos-header-left" });

    const todayBtn = left.createEl("button", {
      cls: "kairos-header-btn",
      text: "Today",
      attr: { "aria-label": "Go to today" },
    });

    // Calendar icon button
    const calBtn = left.createEl("button", {
      cls: "kairos-header-btn",
      attr: { "aria-label": "Jump to date", type: "button" },
    });
    calBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

    // Centre: prev / date / next
    const centre = header.createDiv({ cls: "kairos-header-center" });

    const prevBtn = centre.createEl("button", {
      cls: "kairos-header-btn",
      text: "\u2039",
      attr: { "aria-label": "Previous day" },
    });

    this.headerDateEl = centre.createEl("span", { cls: "kairos-header-date" });

    const nextBtn = centre.createEl("button", {
      cls: "kairos-header-btn",
      text: "\u203a",
      attr: { "aria-label": "Next day" },
    });

    // Right: close
    const right = header.createDiv({ cls: "kairos-header-right" });

    // Close button (replaces Obsidian's floating .modal-close-button)
    const closeBtn = right.createEl("button", {
      cls: "kairos-header-btn",
      text: "\u00d7",
      attr: { "aria-label": "Close" },
    });

    prevBtn.addEventListener("click", () => this.navigateDay(-1));
    nextBtn.addEventListener("click", () => this.navigateDay(1));
    todayBtn.addEventListener("click", () => this.navigateTo(new Date()));
    closeBtn.addEventListener("click", () => this.close());

    // ── Body ─────────────────────────────────────────────────────────────────
    // Goes into contentEl (.modal-content), which Obsidian already makes
    // scrollable, so no custom overflow CSS needed.
    const { contentEl } = this;
    contentEl.empty();

    // Body
    const body = contentEl.createDiv({ cls: "kairos-body" });

    // Content
    const editorWrap = body.createDiv({ cls: "kairos-editor-wrap" });

    // Editor area
    const editorEl = editorWrap.createDiv({ cls: "kairos-editor-content" });
    this.editorView = createEditor(
      editorEl,
      this.app,
      "",
      (doc) => this.scheduleContentSave(doc)
    );

    editorEl.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      const menu = new Menu();
      menu.addItem((item) =>
        item.setTitle("Bold").setIcon("bold")
          .onClick(() => this.editorView && wrapSelection(this.editorView, "**"))
      );
      menu.addItem((item) =>
        item.setTitle("Italic").setIcon("italic")
          .onClick(() => this.editorView && wrapSelection(this.editorView, "*"))
      );
      menu.addItem((item) =>
        item.setTitle("Code").setIcon("code")
          .onClick(() => this.editorView && wrapSelection(this.editorView, "`"))
      );
      menu.addItem((item) =>
        item.setTitle("Link").setIcon("link")
          .onClick(() => this.editorView && insertLinkSkeleton(this.editorView))
      );
      menu.addSeparator();
      menu.addItem((item) =>
        item.setTitle("Cut").setIcon("scissors")
          .onClick(() => document.execCommand("cut"))
      );
      menu.addItem((item) =>
        item.setTitle("Copy").setIcon("copy")
          .onClick(() => document.execCommand("copy"))
      );
      menu.addItem((item) =>
        item.setTitle("Paste").setIcon("clipboard-paste")
          .onClick(() => document.execCommand("paste"))
      );
      menu.showAtMouseEvent(e);
    });

    // Media (directly beneath content)
    const dropZone = body.createDiv({ cls: "kairos-drop-zone" });
    const mediaRowScroll = dropZone.createDiv({ cls: "kairos-media-row-scroll" });
    const mediaRow = mediaRowScroll.createDiv({ cls: "kairos-media-row" });
    const dropHint = mediaRow.createDiv({
      cls: "kairos-media-upload-tile kairos-drop-hint",
      attr: { "aria-label": "Add media", title: "Add media" },
    });
    dropHint.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';

    this.mediaGrid = mediaRow.createDiv({ cls: "kairos-media-grid" });

    // Hidden file input — opened by clicking the camera icon
    const fileInput = dropZone.createEl("input", {
      attr: {
        type: "file",
        accept: "image/*,video/*",
        multiple: "true",
        tabindex: "-1",
        style: "display:none",
      },
    }) as HTMLInputElement;
    dropHint.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files) {
        Array.from(fileInput.files).forEach((f) => this.handleMediaDrop(f));
        fileInput.value = "";
      }
    });

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
    const peopleRow = body.createDiv({ cls: "kairos-field-row" });
    peopleRow.createEl("label", { cls: "kairos-field-label", text: "People" });
    const peopleWrapper = peopleRow.createDiv({ cls: "kairos-chip-field" });
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
    const filmsRow = body.createDiv({ cls: "kairos-field-row" });
    filmsRow.createEl("label", { cls: "kairos-field-label", text: "Films watched" });
    const filmsWrapper = filmsRow.createDiv({ cls: "kairos-chip-field" });
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
    const locationsRow = body.createDiv({ cls: "kairos-field-row" });
    locationsRow.createEl("label", { cls: "kairos-field-label", text: "Locations" });
    const locationsWrapper = locationsRow.createDiv({ cls: "kairos-chip-field" });
    const locationsInputRow = locationsWrapper.createDiv({
      cls: "kairos-chip-input-row",
    });
    this.locationsInput = locationsInputRow.createEl("input", {
      cls: "kairos-chip-input",
      attr: { type: "text", placeholder: "Add a location..." },
    }) as HTMLInputElement;
    this.locationsSuggestions = locationsInputRow.createDiv({
      cls: "kairos-suggestions",
    });
    this.locationsSuggestions.hide();
    this.locationsContainer = locationsWrapper.createDiv({
      cls: "kairos-chip-container",
    });
    this.locationsInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const val = this.locationsInput.value.trim().replace(/,$/, "");
        if (val) {
          this.addLocation(val);
          this.locationsInput.value = "";
          this.locationsSuggestions.hide();
        }
      }
    });
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
        const fieldRow = body.createDiv({ cls: "kairos-field-row" });
        fieldRow.createEl("label", {
          cls: "kairos-field-label",
          text: field.label || field.key,
        });
        if (field.type === "list") {
          const fieldWrapper = fieldRow.createDiv({ cls: "kairos-chip-field" });
          const fieldInputRow = fieldWrapper.createDiv({
            cls: "kairos-chip-input-row",
          });
          const input = fieldInputRow.createEl("input", {
            cls: "kairos-chip-input",
            attr: { type: "text", placeholder: `Add a value...` },
          }) as HTMLInputElement;
          const sugEl = fieldInputRow.createDiv({ cls: "kairos-suggestions" });
          sugEl.hide();
          const container = fieldWrapper.createDiv({
            cls: "kairos-chip-container",
          });
          input.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              const val = input.value.trim().replace(/,$/, "");
              if (val) {
                this.addExtraListValue(field, val);
                input.value = "";
                sugEl.hide();
              }
            }
          });
          input.addEventListener("input", () =>
            this.updateExtraFieldSuggestions(field, input, sugEl)
          );
          document.addEventListener(
            "click",
            (e: MouseEvent) => {
              if (!fieldRow.contains(e.target as Node)) sugEl.hide();
            },
            { capture: true }
          );
          this.extraFieldEls[field.key] = input;
          this.extraFieldSuggestions[field.key] = sugEl;
          this.extraFieldContainers[field.key] = container;
          this.extraListValues[field.key] = [];
        } else {
          const fieldWrapper = fieldRow.createDiv({ cls: "kairos-chip-input-row" });
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
              if (!fieldRow.contains(e.target as Node)) sugEl.hide();
            },
            { capture: true }
          );
          this.extraFieldEls[field.key] = input;
          this.extraFieldSuggestions[field.key] = sugEl;
        }
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
    this.renderLocationsChips();

    for (const field of this.plugin.settings.extraFields) {
      const el = this.extraFieldEls[field.key];
      if (!el) continue;
      const val = fm[field.key];
      if (field.type === "list") {
        this.extraListValues[field.key] = Array.isArray(val)
          ? val.map(String).filter(Boolean)
          : val != null
          ? String(val).split(",").map((s) => s.trim()).filter(Boolean)
          : [];
        this.renderExtraListChips(field);
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
    this.renderLocationsChips();
    for (const key of Object.keys(this.extraFieldEls)) {
      const field = this.plugin.settings.extraFields.find(
        (f) => f.key === key
      );
      if (field?.type === "list") {
        this.extraListValues[key] = [];
        this.renderExtraListChips(field);
      } else {
        this.extraFieldEls[key].value = "";
      }
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

  private addLocation(value: string): void {
    if (!value || this.locations.includes(value)) return;
    this.locations.push(value);
    this.renderLocationsChips();
    this.saveLocations();
  }

  private renderLocationsChips(): void {
    this.locationsContainer.empty();
    for (const loc of this.locations) {
      this.locationsContainer.appendChild(
        this.createChip(loc, () => {
          this.locations = this.locations.filter((l) => l !== loc);
          this.renderLocationsChips();
          this.saveLocations();
        })
      );
    }
  }

  private async saveLocations(): Promise<void> {
    if (!this.currentFile) return;
    await this.app.fileManager.processFrontMatter(
      this.currentFile,
      (fm) => {
        fm["locations"] = this.locations.length ? this.locations : null;
      }
    );
  }

  private updateLocationsSuggestions(): void {
    const q = this.locationsInput.value.trim();
    const results = searchFieldValues(this.app, "locations", q, "journal-entry")
      .filter((v) => !this.locations.includes(v));
    this.renderSuggestions(this.locationsSuggestions, results, (value) => {
      this.addLocation(value);
      this.locationsInput.value = "";
      this.locationsSuggestions.hide();
    });
  }

  // -------------------------------------------------------------------------
  // Extra fields
  // -------------------------------------------------------------------------

  private addExtraListValue(field: ExtraField, value: string): void {
    if (!value) return;
    if (!this.extraListValues[field.key]) {
      this.extraListValues[field.key] = [];
    }
    if (this.extraListValues[field.key].includes(value)) return;
    this.extraListValues[field.key].push(value);
    this.renderExtraListChips(field);
    this.saveExtraField(field);
  }

  private renderExtraListChips(field: ExtraField): void {
    const container = this.extraFieldContainers[field.key];
    if (!container) return;
    container.empty();
    for (const val of this.extraListValues[field.key] ?? []) {
      container.appendChild(
        this.createChip(val, () => {
          this.extraListValues[field.key] = this.extraListValues[
            field.key
          ].filter((v) => v !== val);
          this.renderExtraListChips(field);
          this.saveExtraField(field);
        })
      );
    }
  }

  private async saveExtraField(field: ExtraField, rawValue?: string): Promise<void> {
    if (!this.currentFile) return;
    let value: string | string[] | null;
    if (field.type === "list") {
      const chips = this.extraListValues[field.key] ?? [];
      value = chips.length ? chips : null;
    } else {
      const trimmed = (rawValue ?? "").trim();
      value = trimmed || null;
    }
    await this.app.fileManager.processFrontMatter(
      this.currentFile,
      (fm) => {
        fm[field.key] = value;
      }
    );
  }

  private updateExtraFieldSuggestions(
    field: ExtraField,
    input: HTMLInputElement,
    sugEl: HTMLElement
  ): void {
    const q = input.value.trim();
    const existing = field.type === "list"
      ? (this.extraListValues[field.key] ?? [])
      : [];
    const results = searchFieldValues(this.app, field.key, q, "journal-entry")
      .filter((v) => !existing.includes(v));
    this.renderSuggestions(sugEl, results, (value) => {
      if (field.type === "list") {
        this.addExtraListValue(field, value);
        input.value = "";
      } else {
        input.value = value;
        this.saveExtraField(field, value);
      }
      sugEl.hide();
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

      if (mediaFile && IMAGE_NAME_PATTERN.test(name)) {
        const img = item.createEl("img", { cls: "kairos-media-thumb" });
        img.src = this.app.vault.getResourcePath(mediaFile);
        img.alt = name;
      } else if (mediaFile && VIDEO_NAME_PATTERN.test(name)) {
        const videoTile = item.createDiv({ cls: "kairos-media-video-tile" });
        videoTile.setAttribute("title", name);
        videoTile.setAttribute("aria-label", `Video: ${name}`);
        setIcon(videoTile, "video");
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
