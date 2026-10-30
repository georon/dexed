const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron')
const fs = require('fs/promises')
const path = require('path')

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
    { role: 'viewMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

ipcMain.handle('file:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections']
  })
  if (canceled) return []
  return Promise.all(
    filePaths.map(async (p) => ({ path: p, content: await fs.readFile(p, 'utf8') }))
  )
})

// Returns the saved path, or null if the user cancelled the Save As dialog.
ipcMain.handle('file:save', async (_e, { filePath, defaultName, content, forceDialog }) => {
  let target = filePath
  if (!target || forceDialog) {
    const { canceled, filePath: chosen } = await dialog.showSaveDialog(win, {
      defaultPath: filePath || defaultName
    })
    if (canceled) return null
    target = chosen
  }
  await fs.writeFile(target, content, 'utf8')
  return target
})

// Renderer reports the active tab's mode so the radio items stay in sync.
ipcMain.on('mode:sync', (_e, mode) => buildMenu(mode))

app.whenReady().then(() => {
  buildMenu()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
