/// <reference lib="webworker" />

// PKL Push Notification Service Worker

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "PKL", body: event.data.text() };
  }

  const options = {
    body: payload.body ?? "",
    icon: "/pkl-icon-192.png",
    badge: "/pkl-badge-96.png",
    data: { url: payload.link ?? "/" },
    vibrate: [100, 50, 100],
    tag: payload.tag ?? "pkl-notification",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(payload.title ?? "PKL", options));
});

// Handle notification click — open or focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // If there's already an open tab, focus it and navigate
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url);
    })
  );
});
