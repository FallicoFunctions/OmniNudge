/// <reference lib="webworker" />

import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const messaging = getMessaging(initializeApp(firebaseConfig));

onBackgroundMessage(messaging, (payload) => {
  const { notification, data } = payload;
  return self.registration.showNotification(notification?.title || 'New notification', {
    body: notification?.body || '',
    icon: '/logo.png',
    badge: '/badge.png',
    data: data || {},
    tag: data?.conversation_id || 'default',
    requireInteraction: false,
    silent: false,
  });
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const data = event.notification.data as Record<string, unknown> | undefined;
  const conversationID = typeof data?.conversation_id === 'string' ? data.conversation_id : '';

  let path = '/';
  if (data?.type === 'message' && /^\d+$/.test(conversationID)) {
    path = `/messages/${conversationID}`;
  } else if (data?.type === 'call') {
    path = '/calls';
  }

  const targetURL = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((client) => client.url === targetURL);
      if (existing && 'focus' in existing) {
        return existing.focus();
      }
      return self.clients.openWindow(targetURL);
    }),
  );
});

export {};
