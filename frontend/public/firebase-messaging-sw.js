// Firebase Cloud Messaging Service Worker
// This handles push notifications when the app is in the background or closed

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase configuration
firebase.initializeApp({
  apiKey: "AIzaSyCFMzmGkblIwDPEQexwSAjZ_YXyp1AH_5Y",
  authDomain: "omninudge-f9d7d.firebaseapp.com",
  projectId: "omninudge-f9d7d",
  storageBucket: "omninudge-f9d7d.firebasestorage.app",
  messagingSenderId: "450386878156",
  appId: "1:450386878156:web:485214a0f70f0720d66c69"
});

// Initialize Firebase Cloud Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const { notification, data } = payload;

  const notificationTitle = notification?.title || 'New notification';
  const notificationOptions = {
    body: notification?.body || '',
    icon: '/logo.png', // Your app icon
    badge: '/badge.png', // Small badge icon
    data: data || {},
    tag: data?.conversation_id || 'default', // Group notifications by conversation
    requireInteraction: false,
    silent: false,
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event);

  event.notification.close();

  // Get the data from the notification
  const data = event.notification.data || {};

  // Determine which URL to open based on notification type
  let urlToOpen = '/';

  if (data.type === 'message' && data.conversation_id) {
    urlToOpen = `/messages/${data.conversation_id}`;
  } else if (data.type === 'call') {
    urlToOpen = `/calls`;
  }

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }

      // App not open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
