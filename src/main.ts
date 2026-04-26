import { Plugin, addIcon } from "obsidian";
import { DEFAULT_SETTINGS, KairosSettingTab } from "./settings";
import { JournalModal } from "./journal-modal";
import type { KairosSettings } from "./types";

// Inner SVG content only (no outer <svg> tag) — Obsidian wraps this itself.
// Shape: circle with inscribed + and a short horizontal tangent line at the top.
const KAIROS_ICON_ID = "kairos-journal";
const KAIROS_ICON_SVG = `
  <line x1="4" y1="2" x2="20" y2="2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <circle cx="12" cy="13" r="9" stroke="currentColor" stroke-width="2" fill="none"/>
  <line x1="12" y1="8" x2="12" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="7" y1="13" x2="17" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
`;

export default class KairosPlugin extends Plugin {
  settings: KairosSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    addIcon(KAIROS_ICON_ID, KAIROS_ICON_SVG);

    this.addRibbonIcon(
      KAIROS_ICON_ID,
      "New journal entry",
      () => new JournalModal(this.app, this).open()
    );

    this.addCommand({
      id: "open-journal-entry",
      name: "Open journal entry",
      callback: () => new JournalModal(this.app, this).open(),
    });

    this.addSettingTab(new KairosSettingTab(this.app, this));
  }

  onunload(): void {}

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
