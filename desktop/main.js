// flock.tt desktop app: runs the flock.tt server inside the app and shows the dashboard in a window.
// Overlay links keep working in TikTok LIVE Studio / OBS while the app is open.
import { app, BrowserWindow, shell, dialog, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win = null;

// Only one copy at a time: a second launch just brings the open window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start);
}

async function start() {
  // Settings and uploaded sounds go to the user's app-data folder, not the install folder.
  process.env.FLOCKTT_DATA_DIR = app.getPath('userData');
  const { ready, PORT } = await import('../src/server.js');
  try {
    await ready;
  } catch (err) {
    dialog.showErrorBox('flock.tt could not start',
      err.code === 'EADDRINUSE'
        ? `Something else is already using port ${PORT}. Close the other copy of flock.tt (or the app using that port) and try again.`
        : String(err.message || err));
    app.quit();
    return;
  }

  const url = `http://127.0.0.1:${PORT}/`;
  const os = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
  ]) : null);

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    title: 'flock.tt',
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    // No white system title bar: the page draws a black one, and Windows keeps its own min/max/close buttons on top.
    titleBarStyle: os === 'mac' ? 'hiddenInset' : 'hidden',
    ...(os === 'mac' ? {} : { titleBarOverlay: { color: '#000000', symbolColor: '#ffffff', height: 36 } }),
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false }
  });
  // The dashboard never needs the camera, microphone, location or notifications.
  win.webContents.session.setPermissionRequestHandler((_wc, _perm, done) => done(false));
  win.once('ready-to-show', () => win.show());

  // Links to other sites (GitHub, docs) and "open overlay in new tab" go to the normal browser.
  // Only real web links are handed to the system; nothing like file:// or custom app schemes.
  const openOutside = (target) => { if (/^https?:\/\//i.test(target)) shell.openExternal(target); };
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    openOutside(target);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, target) => {
    if (!target.startsWith(url)) { e.preventDefault(); openOutside(target); }
  });
  win.on('closed', () => { win = null; });
  win.loadURL(`${url}?app=${os}`);
}

app.on('window-all-closed', () => app.quit());
