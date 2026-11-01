const tabsEl = document.getElementById('tabs')
const textEl = document.getElementById('editor')
const richEl = document.getElementById('rich')
const formatBar = document.getElementById('format-toolbar')
const mdBar = document.getElementById('md-toolbar')
const previewEl = document.getElementById('preview')
const sidebar = document.getElementById('sidebar')
const treeEl = document.getElementById('tree')
const folderNameEl = document.getElementById('folder-name')
const refreshBtn = document.querySelector('[data-side="refresh"]')
const modeButtons = document.querySelectorAll('#mode-switch button')

// Tab content is always a string: raw text in text mode, HTML in rich mode.
// Switching mode only changes how it is shown, so it is lossless.
let tabs = [] // { id, path, content, saved, mode }
let activeId = null
let nextId = 1

const active = () => tabs.find((t) => t.id === activeId)
const isDirty = (t) => t.content !== t.saved
const { DEFAULT_NAMES, isEncPath, modeForPath, baseName, looksLikeHtml, plainToHtml, markdownEdit } = DexedEdit
const nameOf = (t) => baseName(t.path)

function renderTabs() {
  tabsEl.textContent = ''
  for (const t of tabs) {
    const el = document.createElement('div')
    el.className = 'tab' + (t.id === activeId ? ' active' : '')
    el.title = t.path || ''
    el.onclick = () => activate(t.id)

    const label = document.createElement('span')
    label.textContent = nameOf(t) + (isDirty(t) ? ' ●' : '')

    const close = document.createElement('span')
    close.className = 'close'
    close.textContent = '×'
    close.onclick = (e) => { e.stopPropagation(); closeTab(t.id) }

    el.append(label, close)
    tabsEl.append(el)
  }
  const t = active()
  document.title = t ? `${nameOf(t)} - Dexed` : 'Dexed'
  markActiveInTree()
}

// Plain text shown in rich mode keeps its line breaks; real HTML is sanitized.
function toDisplayHtml(content) {
  if (!looksLikeHtml(content)) return plainToHtml(content)
  const doc = new DOMParser().parseFromString(content, 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((n) => n.remove())
  doc.querySelectorAll('*').forEach((n) => {
    for (const a of [...n.attributes]) {
      if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name)
    }
  })
  return doc.body.innerHTML
}

function renderPreview() {
  const t = active()
  if (t) previewEl.innerHTML = DOMPurify.sanitize(marked.parse(t.content))
}

function renderEditor() {
  const t = active()
  const mode = t ? t.mode : 'text'
  // Which pieces are visible in each mode (text editor, preview, rich editor, toolbars).
  textEl.hidden = mode === 'rich' && !!t
  previewEl.hidden = !(t && mode === 'markdown')
  richEl.hidden = !(t && mode === 'rich')
  formatBar.hidden = richEl.hidden
  mdBar.hidden = previewEl.hidden
  textEl.disabled = !t
  if (!t) textEl.value = ''
  else if (mode === 'rich') richEl.innerHTML = toDisplayHtml(t.content)
  else textEl.value = t.content
  if (t && mode === 'markdown') renderPreview()
  modeButtons.forEach((b) => b.classList.toggle('on', !!t && b.dataset.mode === mode))
  window.dexed.syncMode(mode)
  updateFormatState()
  if (t) (mode === 'rich' ? richEl : textEl).focus()
}

function activate(id) {
  activeId = id
  renderTabs()
  renderEditor()
}

function addTab(path, content) {
  const existing = path && tabs.find((t) => t.path === path)
  if (existing) return existing.id
  const t = { id: nextId++, path, content, saved: content, mode: modeForPath(path) }
  tabs.push(t)
  return t.id
}

// Opens one file by path in a tab, in the mode that suits its extension.
async function openPath(filePath) {
  const open = tabs.find((t) => t.path === filePath)
  if (open) return activate(open.id)
  let password
  let res
  if (isEncPath(filePath)) {
    // Ask again until the password works or the user cancels.
    for (;;) {
      password = await askPassword(`Password for ${baseName(filePath)}`)
      if (password === null) return
      res = await window.dexed.readFile(filePath, password)
      if (!res.error) break
      alert(`${baseName(filePath)}: ${res.error}`)
    }
  } else {
    res = await window.dexed.readFile(filePath)
    if (res.error) return alert(`${baseName(filePath)}: ${res.error}`)
  }
  const id = addTab(res.path, res.content)
  if (password) tabs.find((t) => t.id === id).password = password
  activate(id)
}

// --- Password dialog ---
const pwDialog = document.getElementById('pw-dialog')
const pwInput = document.getElementById('pw-input')
const pwConfirm = document.getElementById('pw-confirm')
const pwError = document.getElementById('pw-error')

// Resolves with the entered password, or null if cancelled. `confirm` asks for it twice.
function askPassword(title, confirm = false) {
  document.getElementById('pw-title').textContent = title
  pwInput.value = pwConfirm.value = pwError.textContent = ''
  pwConfirm.hidden = !confirm
  return new Promise((resolve) => {
    const form = document.getElementById('pw-form')
    const cancel = document.getElementById('pw-cancel')
    const finish = (value) => {
      form.onsubmit = cancel.onclick = pwDialog.oncancel = null
      pwDialog.close()
      resolve(value)
    }
    form.onsubmit = (e) => {
      e.preventDefault()
      if (!pwInput.value) pwError.textContent = 'Enter a password.'
      else if (confirm && pwInput.value !== pwConfirm.value) pwError.textContent = 'Passwords do not match.'
      else finish(pwInput.value)
    }
    cancel.onclick = () => finish(null)
    pwDialog.oncancel = (e) => { e.preventDefault(); finish(null) }
    pwDialog.showModal()
    pwInput.focus()
  })
}

async function encryptActive() {
  const t = active()
  if (!t) return
  if (isEncPath(t.path)) return alert(`${nameOf(t)} is already encrypted.`)
  const password = await askPassword(`Choose a password for ${nameOf(t)}`, true)
  if (password === null) return
  try {
    const newPath = await window.dexed.encryptFile({
      filePath: t.path,
      defaultName: DEFAULT_NAMES[t.mode] + '.enc',
      content: t.content,
      password
    })
    if (!newPath) return
    t.path = newPath
    t.saved = t.content
    t.password = password
    renderTabs()
  } catch (err) {
    alert(`Encrypt failed: ${err.message}`)
  }
}

// --- Folder tree (sidebar) ---
let rootDir = null

function markActiveInTree() {
  const p = active()?.path
  treeEl.querySelectorAll('.row.file').forEach((row) =>
    row.classList.toggle('active', row.dataset.path === p)
  )
}

function message(text) {
  const el = document.createElement('p')
  el.className = 'msg'
  el.textContent = text
  return el
}

// Fills `ul` with the entries of `dir`. Sub-folders load lazily when first expanded.
async function loadDir(dir, ul) {
  ul.textContent = ''
  let entries
  try {
    entries = await window.dexed.listDir(dir)
  } catch (err) {
    return ul.append(message('Cannot read folder.'))
  }
  if (!entries.length) ul.append(message('(empty)'))
  for (const entry of entries) {
    const li = document.createElement('li')
    const row = document.createElement('div')
    row.className = 'row ' + (entry.isDir ? 'dir' : 'file')
    row.dataset.path = entry.path
    row.title = entry.path
    const arrow = document.createElement('span')
    arrow.className = 'arrow'
    arrow.textContent = entry.isDir ? '▸' : ''
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = entry.name
    row.append(arrow, name)
    li.append(row)

    if (entry.isDir) {
      const children = document.createElement('ul')
      children.hidden = true
      li.append(children)
      let loaded = false
      row.onclick = async () => {
        children.hidden = !children.hidden
        arrow.textContent = children.hidden ? '▸' : '▾'
        if (!children.hidden && !loaded) {
          loaded = true
          await loadDir(entry.path, children)
          markActiveInTree()
        }
      }
    } else {
      row.onclick = () => openPath(entry.path)
    }
    ul.append(li)
  }
  // Indent nested levels.
  ul.querySelectorAll(':scope > li > .row').forEach((row) => {
    row.style.paddingLeft = `${8 + depthOf(ul) * 14}px`
  })
}

function depthOf(ul) {
  let depth = 0
  for (let el = ul.parentElement; el && el !== treeEl; el = el.parentElement) {
    if (el.tagName === 'UL') depth++
  }
  return depth
}

async function showFolder(dir) {
  rootDir = dir
  folderNameEl.textContent = baseName(dir)
  folderNameEl.title = dir
  refreshBtn.hidden = false
  treeEl.textContent = ''
  const ul = document.createElement('ul')
  treeEl.append(ul)
  await loadDir(dir, ul)
  markActiveInTree()
}

async function openFolder() {
  const dir = await window.dexed.chooseFolder()
  if (dir) await showFolder(dir)
}

document.getElementById('sidebar').addEventListener('click', (e) => {
  const b = e.target.closest('button')
  if (!b) return
  if (b.dataset.side === 'open') openFolder()
  else if (b.dataset.side === 'refresh' && rootDir) showFolder(rootDir)
})

function setMode(mode) {
  const t = active()
  if (!t || t.mode === mode) return
  t.mode = mode
  renderEditor()
}

async function openFiles() {
  for (const p of await window.dexed.openFiles()) await openPath(p)
}

async function save(forceDialog = false) {
  const t = active()
  if (!t) return false
  let saved
  try {
    saved = await window.dexed.saveFile({
      filePath: t.path,
      defaultName: DEFAULT_NAMES[t.mode],
      content: t.content,
      forceDialog,
      password: t.password
    })
  } catch (err) {
    alert(`Save failed: ${err.message}`)
    return false
  }
  if (!saved) return false
  t.path = saved
  t.saved = t.content
  renderTabs()
  return true
}

function closeTab(id) {
  const t = tabs.find((x) => x.id === id)
  if (!t) return
  if (isDirty(t) && !confirm(`Discard unsaved changes to ${nameOf(t)}?`)) return
  const i = tabs.indexOf(t)
  tabs.splice(i, 1)
  if (activeId === id) activeId = tabs.length ? tabs[Math.min(i, tabs.length - 1)].id : null
  renderTabs()
  renderEditor()
}

function onEdit(value) {
  const t = active()
  if (!t) return
  const wasDirty = isDirty(t)
  t.content = value
  if (wasDirty !== isDirty(t)) renderTabs()
}
textEl.addEventListener('input', () => {
  onEdit(textEl.value)
  if (active()?.mode === 'markdown') renderPreview()
})
richEl.addEventListener('input', () => onEdit(richEl.innerHTML))

// --- Rich text formatting ---
function stepFont(delta) {
  const cur = parseInt(document.queryCommandValue('fontSize'), 10) || 3
  document.execCommand('fontSize', false, Math.min(7, Math.max(1, cur + delta)))
}

function updateFormatState() {
  if (richEl.hidden) return
  formatBar.querySelectorAll('[data-cmd]').forEach((b) => {
    if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList',
      'justifyLeft', 'justifyCenter', 'justifyRight'].includes(b.dataset.cmd)) {
      b.classList.toggle('on', document.queryCommandState(b.dataset.cmd))
    }
  })
}
document.addEventListener('selectionchange', updateFormatState)

// Keep focus/selection in the editor when clicking toolbar buttons.
document.querySelectorAll('.toolbar').forEach((bar) =>
  bar.addEventListener('mousedown', (e) => e.preventDefault())
)

formatBar.addEventListener('click', (e) => {
  const b = e.target.closest('button')
  if (!b) return
  richEl.focus()
  if (b.dataset.font) stepFont(Number(b.dataset.font))
  else document.execCommand(b.dataset.cmd)
  onEdit(richEl.innerHTML)
  updateFormatState()
})

// --- Markdown editing ---
// The edit itself is computed by DexedEdit.markdownEdit (lib/edit.js). It is applied through
// execCommand('insertText') so the textarea's native undo stack keeps working; that also fires
// 'input', which updates the dirty marker and the preview.
function runMdAction(action) {
  textEl.focus()
  if (action === 'undo' || action === 'redo') return document.execCommand(action)
  const e = markdownEdit(action, textEl.value, textEl.selectionStart, textEl.selectionEnd)
  if (!e) return
  textEl.setSelectionRange(e.start, e.end)
  document.execCommand('insertText', false, e.text)
  textEl.setSelectionRange(e.start + e.selStart, e.start + e.selEnd)
}

mdBar.addEventListener('click', (e) => {
  const b = e.target.closest('button')
  if (b) runMdAction(b.dataset.md)
})

textEl.addEventListener('keydown', (e) => {
  if (active()?.mode !== 'markdown' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return
  const action = { b: 'bold', i: 'italic', k: 'link' }[e.key.toLowerCase()]
  if (!action) return
  e.preventDefault()
  runMdAction(action)
})

// Rendered links must not navigate the app window.
previewEl.addEventListener('click', (e) => {
  if (e.target.closest('a')) e.preventDefault()
})

const appActions = {
  new: () => activate(addTab(null, '')),
  open: openFiles,
  openFolder,
  toggleSidebar: () => { sidebar.hidden = !sidebar.hidden },
  save: () => save(),
  encrypt: encryptActive,
  saveAs: () => save(true),
  close: () => activeId && closeTab(activeId),
  'mode:text': () => setMode('text'),
  'mode:rich': () => setMode('rich'),
  'mode:markdown': () => setMode('markdown')
}

document.getElementById('main-toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('button')
  if (!b) return
  if (b.dataset.app) appActions[b.dataset.app]()
  else if (b.dataset.mode) setMode(b.dataset.mode)
})

window.dexed.onMenu((action) => appActions[action]?.())

renderTabs()
renderEditor()
