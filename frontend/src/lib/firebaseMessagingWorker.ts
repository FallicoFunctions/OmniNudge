import workerURL from '../firebase-messaging-sw.ts?worker&url';

const firebaseMessagingConfigured = [
  import.meta.env.VITE_FIREBASE_API_KEY,
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  import.meta.env.VITE_FIREBASE_PROJECT_ID,
  import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  import.meta.env.VITE_FIREBASE_APP_ID,
].every(Boolean);

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function getFirebaseMessagingWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!firebaseMessagingConfigured || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(workerURL, { type: 'module' })
      .catch(() => null);
  }
  return registrationPromise;
}
