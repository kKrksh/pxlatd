const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');

function createWindow(width = 1920, height = 1080) {
    const win = new BrowserWindow({
        width: width,
        height: height,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: "./preload.js"
        }
    });
    
    win.loadFile("src/editor/editor.html");
    win.webContents.openDevTools();
    return win;
}

app.whenReady().then(() => {
    const win = createWindow(1920, 1080);
    globalShortcut.register('F12', () => {
        win.webContents.toggleDevTools();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
