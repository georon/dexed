// Pure editing helpers (no DOM, no Electron) so they can be unit tested with `node --test`.
// Loaded as a plain script in the renderer (exposes `DexedEdit`) and via require() in tests.
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.DexedEdit = factory()
})(this, function () {
  const DEFAULT_NAMES = { text: 'Untitled.txt', rich: 'Untitled.html', markdown: 'Untitled.md' }

  // A trailing ".enc" is ignored, so the type comes from the extension before it.
  const modeForPath = (p) => {
    const name = (p || '').replace(/\.enc$/i, '')
    return /\.html?$/i.test(name) ? 'rich' : /\.(md|markdown)$/i.test(name) ? 'markdown' : 'text'
  }

  const isEncPath = (p) => /\.enc$/i.test(p || '')

  const baseName = (p) => (p ? p.split(/[\\/]/).pop() : 'Untitled')

  const looksLikeHtml = (content) => /<[a-z][\s\S]*>/i.test(content)

  // Plain text -> HTML for the rich view: escape and keep line breaks.
  const plainToHtml = (content) =>
    content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

  // Folders first, then files, each alphabetically (case-insensitive, numeric-aware).
  const sortEntries = (entries) =>
    [...entries].sort(
      (a, b) =>
        Number(b.isDir) - Number(a.isDir) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    )

  // A NUL byte in the first 8 KB is a reliable sign the file is not text.
  const isBinary = (bytes) => bytes.subarray(0, 8192).includes(0)

  // An edit replaces value[start, end) with `text`, then selects
  // [start + selStart, start + selEnd] in the new value.
  const edit = (start, end, text, selStart, selEnd) => ({ start, end, text, selStart, selEnd })

  const applyEdit = (value, e) => value.slice(0, e.start) + e.text + value.slice(e.end)

  function wrapSelection(value, s, e, before, after, placeholder) {
    const sel = value.slice(s, e) || placeholder
    return edit(s, e, before + sel + after, before.length, before.length + sel.length)
  }

  // Toggles a per-line marker over the lines touched by the selection: if every line already
  // matches `is`, remove the marker; otherwise strip any existing marker and add `make(i)`.
  function prefixLines(value, s, e, make, is, strip) {
    const start = value.lastIndexOf('\n', s - 1) + 1
    let end = value.indexOf('\n', e)
    if (end === -1) end = value.length
    const lines = value.slice(start, end).split('\n')
    const allMarked = lines.every((l) => is.test(l))
    const text = lines
      .map((l, i) => (allMarked ? l.replace(strip, '') : make(i) + l.replace(strip, '')))
      .join('\n')
    return edit(start, end, text, 0, text.length)
  }

  // Inserts a block, starting on a new line if the cursor is mid-line.
  function insertBlock(value, s, e, text, selFrom = 0, selTo = 0) {
    const lead = s > 0 && value[s - 1] !== '\n' ? '\n' : ''
    return edit(s, e, lead + text, lead.length + selFrom, lead.length + (selTo || text.length))
  }

  const LIST_MARK = /^(- \[[ xX]\] |[-*+] |\d+\. )/
  const heading = (n) => (v, s, e) =>
    prefixLines(v, s, e, () => '#'.repeat(n) + ' ', new RegExp(`^#{${n}} `), /^#{1,6} /)

  const markdownActions = {
    bold: (v, s, e) => wrapSelection(v, s, e, '**', '**', 'bold'),
    italic: (v, s, e) => wrapSelection(v, s, e, '*', '*', 'italic'),
    strike: (v, s, e) => wrapSelection(v, s, e, '~~', '~~', 'text'),
    code: (v, s, e) => wrapSelection(v, s, e, '`', '`', 'code'),
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    ul: (v, s, e) => prefixLines(v, s, e, () => '- ', /^- (?!\[)/, LIST_MARK),
    ol: (v, s, e) => prefixLines(v, s, e, (i) => `${i + 1}. `, /^\d+\. /, LIST_MARK),
    task: (v, s, e) => prefixLines(v, s, e, () => '- [ ] ', /^- \[[ xX]\] /, LIST_MARK),
    quote: (v, s, e) => prefixLines(v, s, e, () => '> ', /^> /, /^> ?/),
    link: (v, s, e) => {
      const label = v.slice(s, e) || 'link text'
      // Select the "url" placeholder so it can be typed over.
      return edit(s, e, `[${label}](url)`, label.length + 3, label.length + 6)
    },
    image: (v, s, e) => wrapSelection(v, s, e, '![', '](url)', 'alt text'),
    codeblock: (v, s, e) => {
      const sel = v.slice(s, e) || 'code'
      return insertBlock(v, s, e, '```\n' + sel + '\n```\n', 4, 4 + sel.length)
    },
    table: (v, s, e) =>
      insertBlock(v, s, e, '| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n', 2, 10),
    hr: (v, s, e) => insertBlock(v, s, e, '\n---\n')
  }

  // Returns the edit for a toolbar action, or null if `action` is not a text edit.
  const markdownEdit = (action, value, s, e) => markdownActions[action]?.(value, s, e) ?? null

  return {
    DEFAULT_NAMES, modeForPath, isEncPath, baseName, looksLikeHtml, plainToHtml,
    applyEdit, markdownEdit, sortEntries, isBinary
  }
})
