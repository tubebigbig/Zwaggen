import { Menu, BrowserWindow } from 'electron';
import { basename } from 'node:path';
import { listRecents, clearRecents } from './recents';

/**
 * Build the native application menu. File→Open/Save/Save As fire IPC messages
 * on the `zwaggen:menu` channel; the renderer's AppHeader subscribes via
 * `window.zwaggen.onMenuAction` and dispatches into existing flows.
 *
 * Async because the File→Open Recent submenu is hydrated from the on-disk
 * recents store. Callers must `await` and re-`setApplicationMenu` after every
 * recents mutation (see `rebuildMenu` in `main.ts`).
 */
export async function buildMenu(getMainWindow: () => BrowserWindow | null): Promise<Menu> {
  const isMac = process.platform === 'darwin';
  const send = (channel: string) => {
    const w = getMainWindow();
    if (w) w.webContents.send('zwaggen:menu', channel);
  };

  const recents = await listRecents();
  const recentsItems: Electron.MenuItemConstructorOptions[] = recents.length === 0
    ? [{ label: '(no recent files)', enabled: false }]
    : recents.map((r) => ({
        label: basename(r.path),
        toolTip: r.path,
        click: () => {
          const w = getMainWindow();
          if (w) w.webContents.send('zwaggen:open-file', { path: r.path });
        },
      }));
  recentsItems.push({ type: 'separator' });
  recentsItems.push({
    label: 'Clear Recents',
    enabled: recents.length > 0,
    click: async () => {
      await clearRecents();
      Menu.setApplicationMenu(await buildMenu(getMainWindow));
    },
  });

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Open Recent', submenu: recentsItems },
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
