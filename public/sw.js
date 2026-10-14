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
    const message = event.data ? event.data.json() : {};
    const notification = message.notification ?? message;

    event.waitUntil(
        self.registration.showNotification(
            notification.title ?? 'Better Budget',
            {
                body: notification.body ?? '',
                tag: notification.tag,
                icon: '/better-budget-icon-192-v3.png',
                badge: '/better-budget-icon-192-v3.png',
                data: { url: notification.navigate ?? notification.url ?? '/' }
            }
        )
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
    try {
        await open.focus();
    } finally {
        open.postMessage({ type: TARGET_MESSAGE });
    }
}

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(
        event.notification.data?.url ?? '/',
        self.location.origin
    );

    event.waitUntil(openTarget(target));
});
