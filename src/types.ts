export interface ExtraField {
  key: string;
  label: string;
  type: "text" | "list";
}

export interface ChronologSettings {
  journalRoot: string;
  mediaAttachmentsField: string;
  extraFields: ExtraField[];
}

export interface JournalEntryFrontmatter {
  uuid: string;
  date: string;
  locations: string[];
  people: string[];
  type: "journal-entry";
  previous_entry: string | null;
  next_entry: string | null;
  media_attachments: string[];
  [key: string]: unknown;
}
