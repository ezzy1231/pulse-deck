const { app, BrowserWindow, session } = require('electron');
const path = require('path');

const DUALSHOCK_VENDOR_ID = 0x054c;

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0e1014',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => permission === 'hid',
  );
  session.defaultSession.setDevicePermissionHandler(
    (details) =>
      details.deviceType === 'hid' && details.device.vendorId === DUALSHOCK_VENDOR_ID,
  );
  session.defaultSession.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const device = details.deviceList.find(
      (entry) => entry.vendorId === DUALSHOCK_VENDOR_ID,
    );
    callback(device ? device.deviceId : undefined);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
