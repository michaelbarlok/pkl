/// <reference lib="webworker" />

// Tri-Star Pickleball Push Notification Service Worker

// Activate immediately and take control of all open tabs without waiting
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
    // `icon` = the large circle on the right side of an Android
    // Chrome notification. Without it, Chrome generates a letter
    // avatar from the origin ("T" for tristarpickleball.com) which
    // looks like we forgot to set one. Pointing at our shipped 192px
    // PNG makes that slot render the Tri-Star logo instead.
    // iOS Safari ignores this field — it shows only the apple-touch
    // icon, so this is effectively Android-only polish.
    icon: "/TriStarPB-icon-192.png",
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
