self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'NOVA Connect', body: event.data ? event.data.text() : 'لديك تحديث جديد' };
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some((client) => client.visibilityState === 'visible')) return;
    if (payload.badge && self.registration.setAppBadge) {
      await self.registration.setAppBadge(payload.badge).catch(() => undefined);
    }
    await self.registration.showNotification(payload.title || 'NOVA Connect', {
      body: payload.body || 'لديك تحديث جديد',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: payload.tag || 'nova-update',
      renotify: payload.kind === 'call',
      requireInteraction: payload.kind === 'call',
      data: { url: payload.url || '/app', kind: payload.kind || 'system' },
      vibrate: payload.kind === 'call' ? [250, 120, 250, 120, 500] : [160],
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/app', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => 'focus' in client);
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'NOVA_DISMISS_NOTIFICATION' || !event.data.tag) return;
  event.waitUntil(self.registration.getNotifications({ tag: event.data.tag }).then((items) => items.forEach((item) => item.close())));
});
