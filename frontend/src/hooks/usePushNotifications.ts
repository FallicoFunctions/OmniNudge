import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { requestNotificationPermission, onForegroundMessage } from '../lib/firebase';
import { useToast } from './useToast';

interface UsePushNotificationsReturn {
  isSupported: boolean;
  isPermissionGranted: boolean;
  isRegistered: boolean;
  requestPermission: () => Promise<void>;
  unregister: () => Promise<void>;
}

/**
 * Hook to manage push notifications
 * Handles requesting permission, registering device token, and listening for messages
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const { toast } = useToast();
  const [isSupported, setIsSupported] = useState(false);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | null>(null);

  useEffect(() => {
    // Check if notifications are supported
    setIsSupported('Notification' in window && 'serviceWorker' in navigator);

    // Check current permission status
    if ('Notification' in window) {
      setIsPermissionGranted(Notification.permission === 'granted');
    }

    // Check if already registered (token in localStorage)
    const savedToken = localStorage.getItem('fcm_token');
    if (savedToken) {
      setIsRegistered(true);
      setCurrentToken(savedToken);
    }
  }, []);

  // Listen for foreground messages
  useEffect(() => {
    if (!isRegistered) return;

    const unsubscribe = onForegroundMessage((payload) => {
      const { notification, data } = payload;

      // Show toast notification
      if (notification) {
        toast.info(`${notification.title}: ${notification.body}`);
      }

      // Handle data payload (e.g., navigate to message, update UI)
      if (data) {
        console.log('Notification data:', data);
        // You can add custom handling here based on data.type
      }
    });

    return unsubscribe;
  }, [isRegistered, toast]);

  const requestPermission = async () => {
    if (!isSupported) {
      toast.error('Push notifications are not supported in this browser');
      return;
    }

    try {
      // Request permission and get FCM token
      const token = await requestNotificationPermission();

      if (!token) {
        toast.error('Failed to get notification permission');
        return;
      }

      // Register device token with backend
      await api.post('/devices/register', {
        token,
        device_type: 'web',
        device_name: getBrowserName(),
      });

      // Save token to localStorage
      localStorage.setItem('fcm_token', token);

      setIsPermissionGranted(true);
      setIsRegistered(true);
      setCurrentToken(token);

      toast.success('Push notifications enabled!');
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast.error('Failed to enable push notifications');
    }
  };

  const unregister = async () => {
    if (!currentToken) return;

    try {
      // Unregister from backend
      await api.delete('/devices/unregister', {
        data: { token: currentToken },
      });

      // Remove from localStorage
      localStorage.removeItem('fcm_token');

      setIsRegistered(false);
      setCurrentToken(null);

      toast.success('Push notifications disabled');
    } catch (error) {
      console.error('Error unregistering device:', error);
      toast.error('Failed to disable push notifications');
    }
  };

  return {
    isSupported,
    isPermissionGranted,
    isRegistered,
    requestPermission,
    unregister,
  };
}

// Helper to get browser name for device identification
function getBrowserName(): string {
  const userAgent = navigator.userAgent;

  if (userAgent.indexOf('Chrome') > -1) return 'Chrome';
  if (userAgent.indexOf('Safari') > -1) return 'Safari';
  if (userAgent.indexOf('Firefox') > -1) return 'Firefox';
  if (userAgent.indexOf('Edge') > -1) return 'Edge';
  if (userAgent.indexOf('Opera') > -1) return 'Opera';

  return 'Unknown Browser';
}
