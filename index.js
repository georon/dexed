const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron')
const fs = require('fs/promises')
const path = require('path')
const { sortEntries, isBinary, isEncPath } = require('./lib/edit.js')
const { SUFFIX, encrypt, decrypt } = require('./lib/crypt.js')

let win

const createWindow = () => {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // Links in rendered content must never navigate or open windows in the app.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  win.loadFile('index.html')
}

const send = (action) => win.webContents.send('menu', action)

const buildMenu = (mode = 'text') => {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Open folder', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('openFolder') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => send('close') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'Mode',
      submenu: [
        { label: 'Text', type: 'radio', checked: mode === 'text', accelerator: 'CmdOrCtrl+Alt+T', click: () => send('mode:text') },
        { label: 'Rich Text', type: 'radio', checked: mode === 'rich', accelerator: 'CmdOrCtrl+Alt+R', click: () => send('mode:rich') },
        { label: 'Markdown', type: 'radio', checked: mode === 'markdown', accelerator: 'CmdOrCtrl+Alt+M', click: () => send('mode:markdown') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+Shift+B', click: () => send('toggleSidebar') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

ipcMain.handle('file:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections']
  })
  return canceled ? [] : filePaths
})

ipcMain.handle('dir:choose', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('dir:list', async (_e, dir) => {
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  const entries = await Promise.all(
    dirents.map(async (d) => {
      const full = path.join(dir, d.name)
      let isDir = d.isDirectory()
      if (d.isSymbolicLink()) isDir = await fs.stat(full).then((s) => s.isDirectory(), () => false)
      return { name: d.name, path: full, isDir }
    })
  )
  return sortEntries(entries)
})

const MAX_FILE_BYTES = 10 * 1024 * 1024

// Reads one file for a tab; returns { error } instead of throwing so the page can show it.
ipcMain.handle('file:read', async (_e, filePath, password) => {
  try {
    const buf = await fs.readFile(filePath)
    if (buf.length > MAX_FILE_BYTES) return { error: 'File is too large to open (over 10 MB).' }
    if (isEncPath(filePath)) {
      const content = decrypt(buf, password || '')
      if (content === null) return { error: 'Wrong password, or the file is not an encrypted text file.' }
      return { path: filePath, content }
    }
    if (isBinary(buf)) return { error: 'This looks like a binary file, so it was not opened.' }
    return { path: filePath, content: buf.toString('utf8') }
  } catch (err) {
    return { error: err.message }
  }
})

// Returns the saved path, or null if the user cancelled the Save As dialog.
ipcMain.handle('file:save', async (_e, { filePath, defaultName, content, forceDialog, password }) => {
  let target = filePath
  if (!target || forceDialog) {
    const { canceled, filePath: chosen } = await dialog.showSaveDialog(win, {
      defaultPath: filePath || defaultName
    })
    if (canceled) return null
    target = chosen
  }
  if (isEncPath(target)) {
    if (!password) throw new Error('Use the Encrypt button to save an encrypted (.enc) file.')
    await fs.writeFile(target, encrypt(content, password))
  } else {
    await fs.writeFile(target, content, 'utf8')
  }
  return target
})

// Saves the content encrypted under "<name>.enc" and removes the plain file it replaces.
// Returns the new path, or null if the user cancelled the Save dialog.
ipcMain.handle('file:encrypt', async (_e, { filePath, defaultName, content, password }) => {
  let target = filePath
  if (!target) {
    const { canceled, filePath: chosen } = await dialog.showSaveDialog(win, { defaultPath: defaultName })
    if (canceled) return null
    target = chosen
  }
  const encPath = isEncPath(target) ? target : target + SUFFIX
  await fs.writeFile(encPath, encrypt(content, password))
  if (filePath && encPath !== filePath) await fs.unlink(filePath)
  return encPath
})

// Renderer reports the active tab's mode so the radio items stay in sync.
ipcMain.on('mode:sync', (_e, mode) => buildMenu(mode))

app.whenReady().then(() => {
  buildMenu()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
