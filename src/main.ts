import { Plugin, addIcon } from "obsidian";
import { DEFAULT_SETTINGS, KairosSettingTab } from "./settings";
import { JournalModal } from "./journal-modal";
import type { KairosSettings } from "./types";

// Inner SVG content for Obsidian's addIcon — coordinate space is 0 0 100 100.
// Shape: circle with inscribed + and a short horizontal tangent line at the top.
const KAIROS_ICON_ID = "kairos-journal";
const KAIROS_ICON_SVG = `
  <line x1="18" y1="18" x2="82" y2="18" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
  <circle cx="50" cy="60" r="34" stroke="currentColor" stroke-width="8" fill="none"/>
  <line x1="50" y1="36" x2="50" y2="84" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
  <line x1="26" y1="60" x2="74" y2="60" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
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
