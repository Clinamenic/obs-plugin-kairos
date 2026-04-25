import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, KairosSettingTab } from "./settings";
import { JournalModal } from "./journal-modal";
import type { KairosSettings } from "./types";

// Circle with an inscribed + and a short horizontal tangent line at the top.
const RIBBON_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="6" y1="3" x2="18" y2="3"/>
  <circle cx="12" cy="13" r="8"/>
  <line x1="12" y1="9" x2="12" y2="17"/>
  <line x1="8" y1="13" x2="16" y2="13"/>
</svg>`;

export default class KairosPlugin extends Plugin {
  settings: KairosSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addRibbonIcon(
      RIBBON_ICON_SVG,
      "Open journal entry",
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
