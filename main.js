const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');

function createWindow(width = 1920, height = 1080) {
    const win = new BrowserWindow({
        width: width,
        height: height,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            //preload: path.join(__dirname, 'src/preload.js'),
        }
    });
    
    win.loadFile("index.html");
    win.webContents.openDevTools();
    return win;
}

app.whenReady().then(() => {
    //ipcMain.handle('ping', () => 'pong');
    const win = createWindow(1920, 1080);
    /*globalShortcut.register('F12', () => {
        win.webContents.toggleDevTools();
    });*/
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})







