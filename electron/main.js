// electron/main.js
// Source: https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app
const { app, BrowserWindow } = require('electron/main');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,    // default false; explicit for clarity
      contextIsolation: true,    // default true; explicit for clarity
      // sandbox: true is the Electron 20+ default -- do not override
      // No preload: app is pure renderer-side, no IPC needed (D-04 resolution)
    }
  });

  // __dirname is electron/ -- go one level up to reach index.html at root
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  // macOS: re-create window on dock icon click if none are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
