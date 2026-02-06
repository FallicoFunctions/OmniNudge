import { useRef, useEffect, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook to play a notification sound when new messages arrive
 * Automatically listens for 'new-message' events and plays sound
 * Respects the notificationSound setting
 */
export function useNotificationSound() {
  const { notificationSound } = useSettings();
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio element
  useEffect(() => {
    // Using a data URI for a simple notification beep
    // This is a short, subtle notification sound encoded as base64
    // Frequency: 800Hz, Duration: 100ms
    const audioDataUri =
      'data:audio/wav;base64,UklGRhQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YdABAACAhoqOkpWZnJ+io6Wnqaqrq6uqqainpqShn5yZlZKOioaCAP79+vf08/Hu6+jl4d7a19TPzMjFwb69ubWxravopqKdmZWRjYmFgYB/f4CBg4aJjI+Tl5qeoaSnqqyur7CxsrKysrGwrq2rqKWhnpiUkY2Jg398';

    audioRef.current = new Audio(audioDataUri);
    audioRef.current.volume = 0.5; // Set to 50% volume

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Play sound function
  const playSound = useCallback(() => {
    if (!notificationSound || !audioRef.current) return;

    // Reset audio to beginning in case it's already playing
    audioRef.current.currentTime = 0;

    // Play (handle autoplay restrictions)
    audioRef.current.play().catch((error) => {
      console.warn('[Sound] Failed to play notification:', error);
      // Browser may block autoplay until user interacts with page
    });
  }, [notificationSound]);

  // Listen for new message events
  useEffect(() => {
    const handleNewMessage = (event: Event) => {
      const customEvent = event as CustomEvent<{ conversationId: number; senderId: number }>;
      const { senderId } = customEvent.detail;

      // Only play sound if message is from another user (not from current user)
      if (senderId !== user?.id) {
        playSound();
      }
    };

    window.addEventListener('new-message', handleNewMessage);

    return () => {
      window.removeEventListener('new-message', handleNewMessage);
    };
  }, [user?.id, playSound]);

  // Return playSound for manual triggering (e.g., test button)
  return { playSound };
}
