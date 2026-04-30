import { Plugin, addIcon } from "obsidian";
import { DEFAULT_SETTINGS, ChronologSettingTab } from "./settings";
import { JournalModal } from "./journal-modal";
import type { ChronologSettings } from "./types";
import { CHRONOLOG_RIBBON_ICON_SVG } from "./chronolog-ribbon-icon-svg";
import { registerBodyContentTracking } from "./body-content-tracker";

const CHRONOLOG_ICON_ID = "chronolog-journal";

export default class ChronologPlugin extends Plugin {
  settings: ChronologSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    addIcon(CHRONOLOG_ICON_ID, CHRONOLOG_RIBBON_ICON_SVG);

    this.addRibbonIcon(
      CHRONOLOG_ICON_ID,
      "New journal entry",
      () => new JournalModal(this.app, this).open()
    );

    this.addCommand({
      id: "open-journal-entry",
      name: "Open journal entry",
      callback: () => new JournalModal(this.app, this).open(),
    });

    registerBodyContentTracking(this);
    this.addSettingTab(new ChronologSettingTab(this.app, this));
  }

  onunload(): void {}

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
