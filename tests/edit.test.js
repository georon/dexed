const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const E = require('../lib/edit.js')

// Run a toolbar action on `value` with selection [s, e]; return the new text and selected text.
function run(action, value, s = 0, e = s) {
  const edit = E.markdownEdit(action, value, s, e)
  assert.ok(edit, `no edit for ${action}`)
  const out = E.applyEdit(value, edit)
  return { out, sel: out.slice(edit.start + edit.selStart, edit.start + edit.selEnd) }
}

describe('modeForPath', () => {
  test('picks the mode from the file extension', () => {
    assert.equal(E.modeForPath('/a/notes.md'), 'markdown')
    assert.equal(E.modeForPath('/a/NOTES.MARKDOWN'), 'markdown')
    assert.equal(E.modeForPath('/a/page.html'), 'rich')
    assert.equal(E.modeForPath('/a/page.HTM'), 'rich')
    assert.equal(E.modeForPath('/a/readme.txt'), 'text')
    assert.equal(E.modeForPath('/a/Makefile'), 'text')
  })
  test('untitled (no path) is text', () => {
    assert.equal(E.modeForPath(null), 'text')
    assert.equal(E.modeForPath(undefined), 'text')
  })
  test('only matches the final extension', () => {
    assert.equal(E.modeForPath('/a/md.txt'), 'text')
    assert.equal(E.modeForPath('/a/x.html.bak'), 'text')
  })
  test('every mode has a default file name', () => {
    assert.deepEqual(Object.keys(E.DEFAULT_NAMES).sort(), ['markdown', 'rich', 'text'])
  })
})

describe('baseName', () => {
  test('handles posix and windows separators', () => {
    assert.equal(E.baseName('/home/ron/a.md'), 'a.md')
    assert.equal(E.baseName('~\\a.md'), 'a.md')
  })
  test('falls back to Untitled', () => {
    assert.equal(E.baseName(null), 'Untitled')
  })
})

describe('plain text <-> rich view helpers', () => {
  test('looksLikeHtml', () => {
    assert.equal(E.looksLikeHtml('<p>hi</p>'), true)
    assert.equal(E.looksLikeHtml('a <b>b</b>'), true)
    assert.equal(E.looksLikeHtml('1 < 2 and 3 > 2'), false)
    assert.equal(E.looksLikeHtml('plain\ntext'), false)
  })
  test('plainToHtml escapes markup and keeps line breaks', () => {
    assert.equal(E.plainToHtml('a & b'), 'a &amp; b')
    assert.equal(E.plainToHtml('1 < 2'), '1 &lt; 2')
    assert.equal(E.plainToHtml('l1\nl2'), 'l1<br>l2')
  })
  test('plainToHtml escapes ampersand first (no double escaping of its own output)', () => {
    assert.equal(E.plainToHtml('<'), '&lt;')
  })
})

describe('inline wrapping', () => {
  test('wraps the selection and keeps it selected', () => {
    const r = run('bold', 'make this loud', 5, 9)
    assert.equal(r.out, 'make **this** loud')
    assert.equal(r.sel, 'this')
  })
  test('inserts a selected placeholder when nothing is selected', () => {
    const r = run('italic', 'ab', 1)
    assert.equal(r.out, 'a*italic*b')
    assert.equal(r.sel, 'italic')
  })
  test('strike, code and image', () => {
    assert.equal(run('strike', 'x', 0, 1).out, '~~x~~')
    assert.equal(run('code', 'x', 0, 1).out, '`x`')
    assert.equal(run('image', 'pic', 0, 3).out, '![pic](url)')
  })
  test('link uses the selection as label and selects the url placeholder', () => {
    const r = run('link', 'see docs here', 4, 8)
    assert.equal(r.out, 'see [docs](url) here')
    assert.equal(r.sel, 'url')
  })
  test('link with no selection uses a placeholder label', () => {
    const r = run('link', '')
    assert.equal(r.out, '[link text](url)')
    assert.equal(r.sel, 'url')
  })
})

describe('headings', () => {
  test('adds a heading to the current line only', () => {
    assert.equal(run('h2', 'one\ntwo\nthree', 5).out, 'one\n## two\nthree')
  })
  test('toggles off when the line already has that heading', () => {
    assert.equal(run('h2', '## title', 3).out, 'title')
  })
  test('switches between heading levels instead of stacking', () => {
    assert.equal(run('h3', '# title', 0).out, '### title')
    assert.equal(run('h1', '### title', 0).out, '# title')
  })
  test('H2 is not mistaken for an existing H3 when toggling', () => {
    assert.equal(run('h2', '### title', 0).out, '## title')
  })
  test('applies to every line touched by a multi-line selection', () => {
    assert.equal(run('h1', 'a\nb\nc', 0, 3).out, '# a\n# b\nc')
  })
})

describe('lists and quotes', () => {
  test('bullet list on several lines, then toggled off', () => {
    const on = run('ul', 'a\nb', 0, 3).out
    assert.equal(on, '- a\n- b')
    assert.equal(run('ul', on, 0, on.length).out, 'a\nb')
  })
  test('numbered list counts up', () => {
    assert.equal(run('ol', 'a\nb\nc', 0, 5).out, '1. a\n2. b\n3. c')
  })
  test('switching list type replaces the old marker', () => {
    assert.equal(run('ol', '- a\n- b', 0, 7).out, '1. a\n2. b')
    assert.equal(run('ul', '1. a', 0).out, '- a')
  })
  test('task list, and a task line is not treated as a plain bullet', () => {
    assert.equal(run('task', 'todo', 0).out, '- [ ] todo')
    assert.equal(run('ul', '- [ ] todo', 0).out, '- todo')
    assert.equal(run('task', '- [x] done', 0).out, 'done')
  })
  test('quote adds and removes', () => {
    assert.equal(run('quote', 'hi', 0).out, '> hi')
    assert.equal(run('quote', '> hi', 0).out, 'hi')
  })
  test('selection ending at line end does not touch the next line', () => {
    assert.equal(run('ul', 'a\nb', 0, 1).out, '- a\nb')
  })
})

describe('block inserts', () => {
  test('code block wraps the selection in a fence', () => {
    const r = run('codeblock', 'x = 1', 0, 5)
    assert.equal(r.out, '```\nx = 1\n```\n')
    assert.equal(r.sel, 'x = 1')
  })
  test('code block with no selection selects a placeholder', () => {
    assert.equal(run('codeblock', '').sel, 'code')
  })
  test('starts on a new line when the cursor is mid-line', () => {
    assert.equal(run('hr', 'abc', 3).out, 'abc\n\n---\n')
    assert.equal(run('hr', 'abc\n', 4).out, 'abc\n\n---\n')
  })
  test('table inserts a header, separator and row and selects the first header', () => {
    const r = run('table', '')
    assert.equal(r.out.split('\n')[1], '| --- | --- |')
    assert.equal(r.sel, 'Column 1')
  })
})

describe('markdownEdit', () => {
  test('returns null for non-edit actions', () => {
    assert.equal(E.markdownEdit('undo', '', 0, 0), null)
    assert.equal(E.markdownEdit('nope', '', 0, 0), null)
  })
  test('is pure: does not depend on or mutate anything between calls', () => {
    const a = E.markdownEdit('bold', 'hi', 0, 2)
    const b = E.markdownEdit('bold', 'hi', 0, 2)
    assert.deepEqual(a, b)
  })
})
