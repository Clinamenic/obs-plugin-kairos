import { App } from "obsidian";
import { EditorView, keymap, ViewUpdate } from "@codemirror/view";
import { EditorState, EditorSelection, SelectionRange } from "@codemirror/state";
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import {
  autocompletion,
  CompletionContext,
  CompletionResult,
  Completion,
} from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";

// -------------------------------------------------------------------------
// Obsidian-themed base styles for the editor
// -------------------------------------------------------------------------

const obsidianTheme = EditorView.theme({
  "&": {
    background: "var(--background-primary)",
    color: "var(--text-normal)",
    caretColor: "var(--text-normal)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-text)",
    fontSize: "var(--font-text-size)",
    lineHeight: "1.6",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--text-normal)",
  },
  ".cm-selectionBackground, ::selection": {
    background: "var(--text-selection)",
  },
  ".cm-activeLine": {
    background: "transparent",
  },
  ".cm-gutters": {
    display: "none",
  },
  // Markdown syntax tokens
  ".cm-strong": { fontWeight: "bold" },
  ".cm-em": { fontStyle: "italic" },
  ".cm-strikethrough": { textDecoration: "line-through" },
  ".cm-code": { fontFamily: "var(--font-monospace)", color: "var(--text-accent)" },
  ".cm-link": { color: "var(--text-accent)", textDecoration: "underline" },
  ".cm-url": { color: "var(--text-muted)" },
  ".cm-heading": { fontWeight: "bold", color: "var(--text-normal)" },
  ".cm-header-1": { fontSize: "var(--h1-size)", lineHeight: "var(--h1-line-height)", fontWeight: "var(--h1-weight)" },
  ".cm-header-2": { fontSize: "var(--h2-size)", lineHeight: "var(--h2-line-height)", fontWeight: "var(--h2-weight)" },
  ".cm-header-3": { fontSize: "var(--h3-size)", lineHeight: "var(--h3-line-height)", fontWeight: "var(--h3-weight)" },
  ".cm-header-4": { fontSize: "var(--h4-size)", lineHeight: "var(--h4-line-height)", fontWeight: "var(--h4-weight)" },
  ".cm-header-5": { fontSize: "var(--h5-size)", lineHeight: "var(--h5-line-height)", fontWeight: "var(--h5-weight)" },
  ".cm-header-6": { fontSize: "var(--h6-size)", lineHeight: "var(--h6-line-height)", fontWeight: "var(--h6-weight)" },
  ".cm-quote": { color: "var(--blockquote-color)", fontStyle: "italic", borderLeft: "2px solid var(--blockquote-border-color)", paddingLeft: "var(--size-4-3)", marginLeft: "0" },
  ".cm-hr": { color: "var(--text-faint)", textAlign: "center" },
  // Autocomplete popup
  ".cm-tooltip.cm-tooltip-autocomplete": {
    background: "var(--background-primary)",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "var(--radius-s)",
    boxShadow: "var(--shadow-s)",
  },
  ".cm-tooltip-autocomplete ul li": {
    color: "var(--text-normal)",
    fontFamily: "var(--font-text)",
    fontSize: "var(--font-ui-small)",
    padding: "var(--size-4-1) var(--size-4-3)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    background: "var(--background-modifier-hover)",
    color: "var(--text-normal)",
  },
});

// -------------------------------------------------------------------------
// Wikilink autocomplete
// -------------------------------------------------------------------------

function wikilinkCompletions(app: App) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const match = ctx.matchBefore(/\[\[[^\]]*$/);
    if (!match) return null;

    const query = match.text.slice(2);
    const files = app.vault.getMarkdownFiles();

    const lower = query.toLowerCase();
    const startsWith: typeof files = [];
    const contains: typeof files = [];

    for (const f of files) {
      const name = f.basename.toLowerCase();
      if (name.startsWith(lower)) startsWith.push(f);
      else if (lower && name.includes(lower)) contains.push(f);
    }

    const ranked = [...startsWith, ...contains];

    return {
      from: match.from + 2,
      options: ranked.map(
        (f): Completion => ({
          label: f.basename,
          apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
            view.dispatch({
              changes: { from: from - 2, to, insert: `[[${f.basename}]]` },
            });
          },
        })
      ),
    };
  };
}

// -------------------------------------------------------------------------
// Markdown formatting keymap
// -------------------------------------------------------------------------

export function wrapSelection(view: EditorView, marker: string): boolean {
  const { state } = view;
  const changes = state.changeByRange((range: SelectionRange) => {
    const selected = state.sliceDoc(range.from, range.to);
    if (
      selected.startsWith(marker) &&
      selected.endsWith(marker) &&
      selected.length >= marker.length * 2
    ) {
      const inner = selected.slice(marker.length, -marker.length);
      return {
        changes: { from: range.from, to: range.to, insert: inner },
        range: EditorSelection.range(range.from, range.from + inner.length),
      };
    }
    const insert = `${marker}${selected}${marker}`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(
        range.from + marker.length,
        range.from + marker.length + selected.length
      ),
    };
  });
  view.dispatch(changes);
  return true;
}

export function insertLinkSkeleton(view: EditorView): boolean {
  const { state } = view;
  const changes = state.changeByRange((range: SelectionRange) => {
    const selected = state.sliceDoc(range.from, range.to);
    const insert = selected ? `[${selected}]()` : `[text](url)`;
    const cursorPos = selected
      ? range.from + selected.length + 3
      : range.from + 6;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(cursorPos),
    };
  });
  view.dispatch(changes);
  return true;
}

const markdownFormatKeymap = keymap.of([
  { key: "Mod-b", run: (view: EditorView) => wrapSelection(view, "**") },
  { key: "Mod-i", run: (view: EditorView) => wrapSelection(view, "*") },
  { key: "Mod-k", run: (view: EditorView) => insertLinkSkeleton(view) },
  { key: "Mod-`", run: (view: EditorView) => wrapSelection(view, "`") },
]);

// -------------------------------------------------------------------------
// Factory
// -------------------------------------------------------------------------

export function createEditor(
  parent: HTMLElement,
  app: App,
  initialContent: string,
  onUpdate: (doc: string) => void
): EditorView {
  const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
    if (update.docChanged) {
      onUpdate(update.state.doc.toString());
    }
  });

  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      history(),
      EditorView.lineWrapping,
      markdown(),
      autocompletion({ override: [wikilinkCompletions(app)] }),
      markdownFormatKeymap,
      keymap.of([...historyKeymap, ...defaultKeymap]),
      obsidianTheme,
      updateListener,
    ],
  });

  return new EditorView({ state, parent });
}
