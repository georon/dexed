# Dexed

A small tabbed desktop editor built with Electron. Open several files at once and
edit each one as plain text, rich text, or Markdown.

## Features

- **Tabs** – open multiple files at once; a ● marks tabs with unsaved changes.
- **Three modes, per tab** – switch from the *Mode* menu or the toolbar toggle:
  - **Text** – plain `<textarea>`.
  - **Rich Text** – WYSIWYG editing with a formatting toolbar (bold, italic, underline,
    strikethrough, bigger/smaller font, lists, alignment, undo/redo, clear formatting).
    Saved as HTML.
  - **Markdown** – source on the left, live preview on the right, with a toolbar that
    inserts Markdown (bold, italic, code, headings, lists, task lists, quote, link, image,
    code block, table, horizontal rule).
- **Mode follows the file** – `.md`/`.markdown` open in Markdown, `.html`/`.htm` in Rich Text,
  everything else in Text. Switching mode never changes the file's content, only how it is shown.
- **Safe rendering** – HTML and Markdown are sanitized (DOMPurify), and the app uses a strict
  Content Security Policy with context isolation.

## Getting started

Requires [Node.js](https://nodejs.org/) and npm.

```bash
npm install
npm start
```

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| New / Open / Save / Save As | Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S |
| Close tab | Ctrl+W |
| Text / Rich Text / Markdown mode | Ctrl+Alt+T / Ctrl+Alt+R / Ctrl+Alt+M |
| Bold / Italic (Rich Text, Markdown) | Ctrl+B / Ctrl+I |
| Insert link (Markdown) | Ctrl+K |

Use Cmd instead of Ctrl on macOS.

## Tests

```bash
npm test
```

Unit tests use Node's built-in test runner (`node --test`) and cover the pure editing logic in
`lib/edit.js` (file-type detection, Markdown toolbar edits, text-to-HTML conversion).

## Project layout

| Path | Purpose |
|---|---|
| `index.js` | Electron main process: window, menus, file open/save dialogs |
| `preload.js` | Safe bridge between the main process and the page (`contextBridge`) |
| `index.html`, `styles.css` | UI layout and styling |
| `renderer.js` | Tabs, modes, toolbars, preview |
| `lib/edit.js` | Pure editing helpers, shared by the renderer and the tests |
| `tests/` | Unit tests |

## Limitations

- No warning when quitting with unsaved tabs (only closing a single tab asks).
- Rich Text font size has the browser's seven built-in steps.
- The Markdown preview does not scroll in sync with the source.

## License

ISC
