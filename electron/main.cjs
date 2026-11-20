const {app, BrowserWindow, ipcMain, dialog, shell} = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.sf2': 'application/octet-stream',
  '.sf3': 'application/octet-stream',
  '.wasm': 'application/wasm',
};

let staticServer = null;

function startStaticServer(distDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = (req.url || '/').split('?')[0];
      const safePath = path.normalize(decodeURIComponent(requestUrl)).replace(/^(\.\.[/\\])+/, '');
      let filePath = path.join(distDir, safePath === '/' || safePath === '\\' ? 'index.html' : safePath);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
        });
        res.end(content);
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({server, url: `http://127.0.0.1:${address.port}`});
    });
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#0b0d11',
    autoHideMenuBar: true,
    title: `ScoreFrame v${app.getVersion()}`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({url}) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return {action: 'deny'};
  });

  if (process.env.ELECTRON_START_URL) {
    await win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    const distDir = path.join(__dirname, '..', 'dist');
    const started = await startStaticServer(distDir);
    staticServer = started.server;
    await win.loadURL(started.url);
  }
}

ipcMain.handle('dialog:openGpFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {name: 'Guitar Pro & Sheet Music', extensions: ['gp', 'gp3', 'gp4', 'gp5', 'gpx', 'gp8', 'xml', 'musicxml', 'mxl', 'cap']},
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const filePath = result.filePaths[0];
  const bytes = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
});

ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

ipcMain.handle('app:openExternal', async (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
