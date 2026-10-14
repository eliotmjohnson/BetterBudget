const TARGET_CACHE = 'better-budget-notification-target';
const TARGET_KEY = '/__notification-target';
const TARGET_MESSAGE = 'better-budget:notification-target';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    const payload = event.data ? event.data.json() : {};

    event.waitUntil(
        self.registration.showNotification(payload.title ?? 'Better Budget', {
            body: payload.body ?? '',
            tag: payload.tag,
            icon: '/better-budget-icon-192-v3.png',
            badge: '/better-budget-icon-192-v3.png',
            data: { url: payload.url ?? '/' }
        })
    );
});

async function rememberTarget(target) {
    const cache = await caches.open(TARGET_CACHE);

    await cache.put(
        TARGET_KEY,
        new Response(
            JSON.stringify({
                url: `${target.pathname}${target.search}`,
                at: Date.now()
            })
        )
    );
}

async function openTarget(target) {
    await rememberTarget(target);
    const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    });
    const open = windows.find(
        (client) => new URL(client.url).origin === self.location.origin
    );

    if (!open) {
        await self.clients.openWindow(target.href);

        return;
    }
    open.postMessage({ type: TARGET_MESSAGE });
    await open.focus();
}

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(
        event.notification.data?.url ?? '/',
        self.location.origin
    );

    event.waitUntil(openTarget(target));
});
