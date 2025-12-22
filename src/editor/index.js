const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');
const path = require("path")
const fs = require("fs")

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
    //ipcMain.handle('ping', () => 'pong');
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

ipcMain.handle('read-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp']
      }
    ]
  });

  if (canceled) return null;
  const name = path.basename(filePaths[0])
  const buffer = fs.readFileSync(filePaths[0]);
  const ext = path.extname(filePaths[0]).slice(1).toLowerCase();
  
  const base64 = buffer.toString('base64');
  const mimeType = ext === 'jpg' ? 'jpeg' : ext;
  return [`data:image/${mimeType};base64,${base64}`, name];
});


// read selected file's contents
ipcMain.handle('select-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Sprite Directory',
    buttonLabel: 'Select Folder'
  });

  if (canceled) return null;

  return filePaths[0];
});

// get all files from directory
ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const files = fs.readdirSync(dirPath);
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.png', '.jpg', '.jpeg', '.gif', '.bmp'].includes(ext);
    });
    
    return imageFiles.map(file => path.join(dirPath, file));
  } catch (error) {
    console.error('Error reading directory:', error);
    return [];
  }
});

ipcMain.handle("getDownloadsPath", async () => {
  return app.getPath("downloads")
})