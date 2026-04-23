import { Menu, BrowserWindow } from 'electron';

/**
 * Build the native application menu. File→Open/Save/Save As fire IPC messages
 * on the `zwaggen:menu` channel; the renderer's AppHeader subscribes via
 * `window.zwaggen.onMenuAction` and dispatches into existing flows.
 */
export function buildMenu(getMainWindow: () => BrowserWindow | null): Menu {
  const isMac = process.platform === 'darwin';
  const send = (channel: string) => {
    const w = getMainWindow();
    if (w) w.webContents.send('zwaggen:menu', channel);
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ];
  return Menu.buildFromTemplate(template);
}
