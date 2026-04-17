/// <reference lib="webworker" />

// Tri-Star Pickleball Push Notification Service Worker

// Fetch handler required for PWA installability
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Tri-Star Pickleball", body: event.data.text() };
  }

  const options = {
    body: payload.body ?? "",
    icon: "/TriStarPB-light-minimal.jpg",
    badge: "/ic_notification_xxxhdpi_96px.png",
    data: { url: payload.link ?? "/" },
    vibrate: [100, 50, 100],
    tag: payload.tag ?? "tristar-notification",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(payload.title ?? "Tri-Star Pickleball", options));
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
