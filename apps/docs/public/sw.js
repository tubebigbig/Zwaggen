// Tombstone service worker. Replaces the previous workbox-generated sw.js.
// Purpose: when a browser with an older Zwaggen Docs PWA installed fetches
// this file as part of its normal SW update check, install it immediately,
// wipe every cache this origin owns, unregister the SW, and reload any
// open tabs so they run without a controller from then on.
//
// This is load-bearing. Removing or renaming this file will strand users
// on whatever workbox precache they last got, indefinitely.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      await caches.delete(key);
    }
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window' });
    for (const win of windows) {
      win.navigate(win.url);
    }
  })());
});
