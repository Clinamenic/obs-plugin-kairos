import { App, Menu, Modal, TFile, normalizePath, setIcon } from "obsidian";
import type ChronologPlugin from "./main";
import type { ExtraField } from "./types";
import {
  dateToIso,
  findEntryByDate,
  createEntryFile,
  ConfirmCreateModal,
  buildMediaFolder,
  resolveAttachmentDestPath,
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

function normalizeFrontmatterBoolean(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  if (typeof value === "number") return value === 1;
  return false;
}

function parseFrontmatterIsoDate(value: unknown): string | null {
  if (value instanceof Date) return dateToIso(value);
  if (typeof value === "string" || typeof value === "number") {
    const asString = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(asString) ? asString : null;
  }
  return null;
}

const IMAGE_NAME_PATTERN = /\.(jpe?g|png|gif|webp|avif)$/i;
const VIDEO_NAME_PATTERN =
  /\.(mp4|m4v|webm|mov|mkv|ogv|avi|wmv|mpeg|mpg|3gp?)(\?.*)?$/i;

export class JournalModal extends Modal {
  private plugin: ChronologPlugin;
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

  /** Serializes vault body + frontmatter ops so overlaps cannot resurrect stale content */
  private vaultOpChain: Promise<void> = Promise.resolve();

  /**
   * Bumped when navigated journal file path changes. Debounced body saves captured
   * at schedule time are dropped if stale after flush + navigation raced the timer callback.
   */
  private journalTargetEpoch = 0;

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
  /** Filled in buildShell: syncs with currentDate in loadDate */
  private calendarDateInput: HTMLInputElement | null = null;

  constructor(app: App, plugin: ChronologPlugin, date?: Date) {
    super(app);
    this.plugin = plugin;
    this.currentDate = date ?? new Date();
  }

  async onOpen(): Promise<void> {
    this.modalEl.addClass("chronolog-modal");
    this.buildShell();
    await this.loadDate(this.currentDate);
  }

  onClose(): void {
    if (this.contentDebounceTimer !== null) {
      clearTimeout(this.contentDebounceTimer);
      this.contentDebounceTimer = null;
    }
    let closePersist: { file: TFile; body: string } | null = null;
    if (this.editorView && this.currentFile) {
      closePersist = {
        file: this.currentFile,
        body: this.editorView.state.doc.toString(),
      };
    }
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }
    if (closePersist) {
      const { file, body } = closePersist;
      void this.enqueueVaultOp(() => this.processBodyIntoFile(file, body));
    }
    // Remove the nav bar we injected into Obsidian's modal-header
    this.titleEl.parentElement
      ?.querySelectorAll(".chronolog-header")
      .forEach((el) => el.remove());
    this.calendarDateInput = null;
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
    modalHeader.querySelectorAll(".chronolog-header").forEach((el) => el.remove());
    const header = modalHeader.createDiv({ cls: "chronolog-header" });

    // Left: Today / calendar
    const left = header.createDiv({ cls: "chronolog-header-left" });

    const todayBtn = left.createEl("button", {
      cls: "chronolog-header-btn",
      text: "Today",
      attr: { "aria-label": "Go to today" },
    });

    // One control: label styled as a button, transparent type=date on top of the icon (native click opens the picker; no showPicker/body input)
    const calLabel = left.createEl("label", {
      cls: "chronolog-header-btn chronolog-calendar-label",
      attr: { "aria-label": "Jump to date" },
    });
    const calIcon = calLabel.createSpan({ cls: "chronolog-calendar-icon" });
    calIcon.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    const dateInput = calLabel.createEl("input", {
      cls: "chronolog-calendar-date-input",
      attr: { type: "date" },
    }) as HTMLInputElement;
    this.calendarDateInput = dateInput;
    dateInput.value = dateToIso(this.currentDate);
    dateInput.addEventListener("change", () => {
      const v = dateInput.value;
      if (!v) return;
      const parts = v.split("-");
      if (parts.length !== 3) return;
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return;
      void this.navigateTo(new Date(y, m - 1, d));
    });

    // Centre: prev / date / next
    const centre = header.createDiv({ cls: "chronolog-header-center" });

    const prevWithContentBtn = centre.createEl("button", {
      cls: "chronolog-header-btn",
      text: "\u2039\u2039",
      attr: { "aria-label": "Previous day with content" },
    });

    const prevBtn = centre.createEl("button", {
      cls: "chronolog-header-btn",
      text: "\u2039",
      attr: { "aria-label": "Previous day" },
    });

    this.headerDateEl = centre.createEl("span", { cls: "chronolog-header-date" });

    const nextBtn = centre.createEl("button", {
      cls: "chronolog-header-btn",
      text: "\u203a",
      attr: { "aria-label": "Next day" },
    });

    const nextWithContentBtn = centre.createEl("button", {
      cls: "chronolog-header-btn",
      text: "\u203a\u203a",
      attr: { "aria-label": "Next day with content" },
    });

    // Right: close
    const right = header.createDiv({ cls: "chronolog-header-right" });

    // Close button (replaces Obsidian's floating .modal-close-button)
    const closeBtn = right.createEl("button", {
      cls: "chronolog-header-btn",
      text: "\u00d7",
      attr: { "aria-label": "Close" },
    });

    prevWithContentBtn.addEventListener(
      "click",
      () => void this.navigateToPreviousDayWithContent()
    );
    prevBtn.addEventListener("click", () => this.navigateDay(-1));
    nextBtn.addEventListener("click", () => this.navigateDay(1));
    nextWithContentBtn.addEventListener(
      "click",
      () => void this.navigateToNextDayWithContent()
    );
    todayBtn.addEventListener("click", () => this.navigateTo(new Date()));
    closeBtn.addEventListener("click", () => this.close());

    // ── Body ─────────────────────────────────────────────────────────────────
    // Goes into contentEl (.modal-content), which Obsidian already makes
    // scrollable, so no custom overflow CSS needed.
    const { contentEl } = this;
    contentEl.empty();

    // Body
    const body = contentEl.createDiv({ cls: "chronolog-body" });

    // Content
    const editorWrap = body.createDiv({ cls: "chronolog-editor-wrap" });

    // Editor area
    const editorEl = editorWrap.createDiv({ cls: "chronolog-editor-content" });
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
    const dropZone = body.createDiv({ cls: "chronolog-drop-zone" });
    const mediaRowScroll = dropZone.createDiv({ cls: "chronolog-media-row-scroll" });
    const mediaRow = mediaRowScroll.createDiv({ cls: "chronolog-media-row" });
    const dropHint = mediaRow.createDiv({
      cls: "chronolog-media-upload-tile chronolog-drop-hint",
      attr: { "aria-label": "Add media", title: "Add media" },
    });
    dropHint.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

    this.mediaGrid = mediaRow.createDiv({ cls: "chronolog-media-grid" });

    // Hidden file input — opened by clicking the add-media tile
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
      dropZone.addClass("chronolog-drop-active");
    });
    dropZone.addEventListener("dragleave", () =>
      dropZone.removeClass("chronolog-drop-active")
    );
    dropZone.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      dropZone.removeClass("chronolog-drop-active");
      const files = e.dataTransfer?.files;
      if (files) {
        Array.from(files).forEach((f) => this.handleMediaDrop(f));
      }
    });

    // People
    const peopleRow = body.createDiv({ cls: "chronolog-field-row" });
    peopleRow.createEl("label", { cls: "chronolog-field-label", text: "People" });
    const peopleWrapper = peopleRow.createDiv({ cls: "chronolog-chip-field" });
    const peopleInputRow = peopleWrapper.createDiv({
      cls: "chronolog-chip-input-row",
    });
    this.peopleInput = peopleInputRow.createEl("input", {
      cls: "chronolog-chip-input",
      attr: { type: "text", placeholder: "Search contacts..." },
    });
    this.peopleSuggestions = peopleInputRow.createDiv({
      cls: "chronolog-suggestions",
    });
    this.peopleSuggestions.hide();
    this.peopleContainer = peopleWrapper.createDiv({
      cls: "chronolog-chip-container",
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
    const filmsRow = body.createDiv({ cls: "chronolog-field-row" });
    filmsRow.createEl("label", { cls: "chronolog-field-label", text: "Films watched" });
    const filmsWrapper = filmsRow.createDiv({ cls: "chronolog-chip-field" });
    const filmsInputRow = filmsWrapper.createDiv({
      cls: "chronolog-chip-input-row",
    });
    this.filmsInput = filmsInputRow.createEl("input", {
      cls: "chronolog-chip-input",
      attr: {
        type: "text",
        placeholder: "Add a film and press Enter...",
      },
    });
    this.filmsSuggestions = filmsInputRow.createDiv({
      cls: "chronolog-suggestions",
    });
    this.filmsSuggestions.hide();
    this.filmsContainer = filmsWrapper.createDiv({
      cls: "chronolog-chip-container",
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
    const locationsRow = body.createDiv({ cls: "chronolog-field-row" });
    locationsRow.createEl("label", { cls: "chronolog-field-label", text: "Locations" });
    const locationsWrapper = locationsRow.createDiv({ cls: "chronolog-chip-field" });
    const locationsInputRow = locationsWrapper.createDiv({
      cls: "chronolog-chip-input-row",
    });
    this.locationsInput = locationsInputRow.createEl("input", {
      cls: "chronolog-chip-input",
      attr: { type: "text", placeholder: "Add a location..." },
    }) as HTMLInputElement;
    this.locationsSuggestions = locationsInputRow.createDiv({
      cls: "chronolog-suggestions",
    });
    this.locationsSuggestions.hide();
    this.locationsContainer = locationsWrapper.createDiv({
      cls: "chronolog-chip-container",
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
      body.createEl("div", { cls: "chronolog-divider" });
      for (const field of extraFields) {
        const fieldRow = body.createDiv({ cls: "chronolog-field-row" });
        fieldRow.createEl("label", {
          cls: "chronolog-field-label",
          text: field.label || field.key,
        });
        if (field.type === "list") {
          const fieldWrapper = fieldRow.createDiv({ cls: "chronolog-chip-field" });
          const fieldInputRow = fieldWrapper.createDiv({
            cls: "chronolog-chip-input-row",
          });
          const input = fieldInputRow.createEl("input", {
            cls: "chronolog-chip-input",
            attr: { type: "text", placeholder: `Add a value...` },
          }) as HTMLInputElement;
          const sugEl = fieldInputRow.createDiv({ cls: "chronolog-suggestions" });
          sugEl.hide();
          const container = fieldWrapper.createDiv({
            cls: "chronolog-chip-container",
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
          const fieldWrapper = fieldRow.createDiv({ cls: "chronolog-chip-input-row" });
          const input = fieldWrapper.createEl("input", {
            cls: "chronolog-chip-input",
            attr: { type: "text" },
          }) as HTMLInputElement;
          const sugEl = fieldWrapper.createDiv({ cls: "chronolog-suggestions" });
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

  private async navigateToPreviousDayWithContent(): Promise<void> {
    await this.flushContentDebounce();
    const currentIso = dateToIso(this.currentDate);
    let bestIso: string | null = null;

    for (const file of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm || fm["type"] !== "journal-entry") continue;
      if (!normalizeFrontmatterBoolean(fm["has-content"])) continue;
      const entryIso = parseFrontmatterIsoDate(fm["date"]);
      if (!entryIso || entryIso >= currentIso) continue;
      if (!bestIso || entryIso > bestIso) bestIso = entryIso;
    }

    if (!bestIso) return;
    await this.loadDate(new Date(`${bestIso}T00:00:00`));
  }

  private async navigateToNextDayWithContent(): Promise<void> {
    await this.flushContentDebounce();
    const currentIso = dateToIso(this.currentDate);
    let bestIso: string | null = null;

    for (const file of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm || fm["type"] !== "journal-entry") continue;
      if (!normalizeFrontmatterBoolean(fm["has-content"])) continue;
      const entryIso = parseFrontmatterIsoDate(fm["date"]);
      if (!entryIso || entryIso <= currentIso) continue;
      if (!bestIso || entryIso < bestIso) bestIso = entryIso;
    }

    if (!bestIso) return;
    await this.loadDate(new Date(`${bestIso}T00:00:00`));
  }

  // -------------------------------------------------------------------------
  // Load a date into the modal
  // -------------------------------------------------------------------------

  private async loadDate(date: Date): Promise<void> {
    this.currentDate = date;
    this.headerDateEl.setText(formatHeaderDate(date));
    const isoDate = dateToIso(date);
    if (this.calendarDateInput) {
      this.calendarDateInput.value = isoDate;
    }
    let file = findEntryByDate(this.app, isoDate);

    if (!file) {
      // Show empty state; offer creation
      this.bumpJournalEpochIfNeeded(null);
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
              this.bumpJournalEpochIfNeeded(created);
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

    this.bumpJournalEpochIfNeeded(file);
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
  // Vault serialization (body + frontmatter)
  // -------------------------------------------------------------------------

  /** Single-writer queue for all journal file mutations opened from this modal */
  private enqueueVaultOp(task: () => Promise<void>): Promise<void> {
    const next = this.vaultOpChain.then(() => task());
    this.vaultOpChain = next.catch(() => {});
    return next;
  }

  private bumpJournalEpochIfNeeded(nextFile: TFile | null): void {
    const prev = this.currentFile?.path ?? "";
    const next = nextFile?.path ?? "";
    if (prev !== next) this.journalTargetEpoch++;
  }

  private async processBodyIntoFile(
    target: TFile,
    newBody: string
  ): Promise<void> {
    await this.app.vault.process(target, (raw) => {
      const frontmatterEnd = this.findFrontmatterEnd(raw);
      if (frontmatterEnd === -1) return raw;
      const header = raw.slice(0, frontmatterEnd);
      return `${header}\n${newBody}`;
    });
  }

  // -------------------------------------------------------------------------
  // Content save (debounced, driven by CM6 update listener)
  // -------------------------------------------------------------------------

  private scheduleContentSave(doc: string): void {
    if (this.contentDebounceTimer !== null) {
      clearTimeout(this.contentDebounceTimer);
    }
    const epochAtSchedule = this.journalTargetEpoch;
    this.contentDebounceTimer = setTimeout(() => {
      this.contentDebounceTimer = null;
      void this.saveDebouncedBody(doc, epochAtSchedule);
    }, this.DEBOUNCE_MS);
  }

  /** Debounced path: drop work if navigated away before the delayed callback ran */
  private async saveDebouncedBody(
    body: string,
    epochAtSchedule: number
  ): Promise<void> {
    await this.enqueueVaultOp(async () => {
      if (epochAtSchedule !== this.journalTargetEpoch) return;
      const file = this.currentFile;
      if (!file) return;
      await this.processBodyIntoFile(file, body);
    });
  }

  private async flushContentDebounce(): Promise<void> {
    if (this.contentDebounceTimer !== null) {
      clearTimeout(this.contentDebounceTimer);
      this.contentDebounceTimer = null;
    }
    if (!this.editorView || !this.currentFile) return;
    const file = this.currentFile;
    const doc = this.editorView.state.doc.toString();
    await this.enqueueVaultOp(() => this.processBodyIntoFile(file, doc));
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
        cls: "chronolog-suggestion-item",
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
    const file = this.currentFile;
    if (!file) return;
    const snapshot = [...this.people];
    await this.enqueueVaultOp(async () => {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm["people"] = snapshot.length ? snapshot : null;
      });
    });
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
    const file = this.currentFile;
    if (!file) return;
    const snapshot = [...this.films];
    await this.enqueueVaultOp(async () => {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm["films-watched"] = snapshot.length ? snapshot : null;
      });
    });
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
    const file = this.currentFile;
    if (!file) return;
    const snapshot = [...this.locations];
    await this.enqueueVaultOp(async () => {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm["locations"] = snapshot.length ? snapshot : null;
      });
    });
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
    const file = this.currentFile;
    if (!file) return;
    let snap: string | string[] | null;
    if (field.type === "list") {
      const chips = this.extraListValues[field.key] ?? [];
      snap = chips.length ? chips : null;
    } else {
      const trimmed = (rawValue ?? "").trim();
      snap = trimmed || null;
    }
    const key = field.key;
    await this.enqueueVaultOp(async () => {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm[key] = snap;
      });
    });
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
        cls: "chronolog-suggestion-item",
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
      const item = this.mediaGrid.createDiv({ cls: "chronolog-media-item" });

      const mediaFile = this.app.vault.getFileByPath(
        normalizePath(`${buildMediaFolder(file.path)}/${name}`)
      );

      if (mediaFile && IMAGE_NAME_PATTERN.test(name)) {
        const img = item.createEl("img", { cls: "chronolog-media-thumb" });
        img.src = this.app.vault.getResourcePath(mediaFile);
        img.alt = name;
      } else if (mediaFile && VIDEO_NAME_PATTERN.test(name)) {
        const videoTile = item.createDiv({ cls: "chronolog-media-video-tile" });
        videoTile.setAttribute("title", name);
        videoTile.setAttribute("aria-label", `Video: ${name}`);
        setIcon(videoTile, "video");
      } else {
        item.createEl("span", {
          cls: "chronolog-media-filename",
          text: name,
        });
      }

      const removeBtn = item.createEl("button", {
        cls: "chronolog-media-remove",
        text: "\u00d7",
        attr: { "aria-label": `Remove ${name}` },
      });
      removeBtn.addEventListener("click", () => {
        void this.enqueueVaultOp(async () => {
          await this.app.fileManager.processFrontMatter(file, (fm) => {
            const current: string[] = parseWikilinks(fm[mediaField]);
            fm[mediaField] = current.filter((l) => l !== link);
          });
          const cache = this.app.metadataCache.getFileCache(file);
          const updated = parseWikilinks(cache?.frontmatter?.[mediaField]);
          this.renderMediaGrid(updated, file);
        });
      });
    }
  }

  private async handleMediaDrop(nativeFile: File): Promise<void> {
    const entryFile = this.currentFile;
    if (!entryFile) return;

    await this.enqueueVaultOp(async () => {
      const mediaFolder = buildMediaFolder(entryFile.path);

      if (!this.app.vault.getFolderByPath(mediaFolder)) {
        await this.app.vault.createFolder(mediaFolder);
      }

      const { destPath, basename: safeBasename } = resolveAttachmentDestPath(
        this.app.vault,
        mediaFolder,
        nativeFile.name
      );
      const arrayBuffer = await nativeFile.arrayBuffer();
      let vaultFile = this.app.vault.getFileByPath(destPath);
      if (!vaultFile) {
        vaultFile = await this.app.vault.createBinary(
          destPath,
          arrayBuffer
        );
      }

      const mediaField = this.plugin.settings.mediaAttachmentsField;
      const link = toWikilink(safeBasename);

      await this.app.fileManager.processFrontMatter(entryFile, (fm) => {
        const current: string[] = parseWikilinks(fm[mediaField]);
        if (!current.includes(link)) {
          current.push(link);
          fm[mediaField] = current;
        }
      });

      const cache = this.app.metadataCache.getFileCache(entryFile);
      const updated = parseWikilinks(cache?.frontmatter?.[mediaField]);
      this.renderMediaGrid(updated, entryFile);
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private createChip(label: string, onRemove: () => void): HTMLElement {
    const chip = document.createElement("span");
    chip.className = "chronolog-chip";
    chip.createSpan({ text: label });
    const x = chip.createEl("button", {
      cls: "chronolog-chip-remove",
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
