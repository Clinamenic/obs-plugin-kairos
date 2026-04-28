import { App, PluginSettingTab, Setting, ButtonComponent } from "obsidian";
import type ChronologPlugin from "./main";
import type { ChronologSettings, ExtraField } from "./types";

export const DEFAULT_SETTINGS: ChronologSettings = {
  journalRoot: "journal",
  mediaAttachmentsField: "media_attachments",
  extraFields: [],
};

export class ChronologSettingTab extends PluginSettingTab {
  plugin: ChronologPlugin;

  constructor(app: App, plugin: ChronologPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Journal root folder")
      .setDesc("Path to the root journal folder relative to the vault root.")
      .addText((text) =>
        text
          .setPlaceholder("journal")
          .setValue(this.plugin.settings.journalRoot)
          .onChange(async (value) => {
            this.plugin.settings.journalRoot = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Media attachments field")
      .setDesc(
        "Frontmatter key used to store media attachment wikilinks (e.g. media_attachments)."
      )
      .addText((text) =>
        text
          .setPlaceholder("media_attachments")
          .setValue(this.plugin.settings.mediaAttachmentsField)
          .onChange(async (value) => {
            this.plugin.settings.mediaAttachmentsField = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("Extra fields").setHeading();

    new Setting(containerEl)
      .setName("Add extra field")
      .setDesc(
        "Define additional frontmatter fields to display in the journal dashboard."
      )
      .addButton((btn: ButtonComponent) =>
        btn.setButtonText("Add field").onClick(async () => {
          this.plugin.settings.extraFields.push({
            key: "",
            label: "",
            type: "text",
          });
          await this.plugin.saveSettings();
          this.display();
        })
      );

    this.plugin.settings.extraFields.forEach(
      (field: ExtraField, index: number) => {
        const fieldSetting = new Setting(containerEl)
          .setName(`Field ${index + 1}`)
          .addText((text) =>
            text
              .setPlaceholder("frontmatter-key")
              .setValue(field.key)
              .onChange(async (value) => {
                this.plugin.settings.extraFields[index].key = value.trim();
                await this.plugin.saveSettings();
              })
          )
          .addText((text) =>
            text
              .setPlaceholder("Display label")
              .setValue(field.label)
              .onChange(async (value) => {
                this.plugin.settings.extraFields[index].label = value.trim();
                await this.plugin.saveSettings();
              })
          )
          .addDropdown((drop) =>
            drop
              .addOption("text", "Text")
              .addOption("list", "List")
              .setValue(field.type)
              .onChange(async (value) => {
                this.plugin.settings.extraFields[index].type = value as
                  | "text"
                  | "list";
                await this.plugin.saveSettings();
              })
          )
          .addButton((btn: ButtonComponent) =>
            btn.setButtonText("Remove").onClick(async () => {
              this.plugin.settings.extraFields.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            })
          );

        fieldSetting.settingEl.addClass("chronolog-extra-field-row");
      }
    );
  }
}
