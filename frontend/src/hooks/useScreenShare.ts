import { useState, useRef, useCallback, useEffect } from 'react';
import { callsService } from '../services/callsService';

export interface UseScreenShareReturn {
  isSharing: boolean;
  screenStream: MediaStream | null;
  startSharing: () => Promise<void>;
  stopSharing: () => void;
  error: string | null;
}

export function useScreenShare(
  callId: number | null,
  peerConnection: RTCPeerConnection | null
): UseScreenShareReturn {
  const [isSharing, setIsSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenSenderRef = useRef<RTCRtpSender | null>(null);

  const stopSharing = useCallback(() => {
    // Remove the screen track sender from the peer connection.
    if (peerConnection && screenSenderRef.current) {
      try {
        peerConnection.removeTrack(screenSenderRef.current);
      } catch (e) {
        console.error('[useScreenShare] removeTrack error:', e);
      }
      screenSenderRef.current = null;
    }

    // Stop all tracks in the screen stream.
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    setScreenStream(null);
    setIsSharing(false);

    // Notify backend.
    if (callId !== null) {
      callsService
        .stopScreenShare(callId)
        .catch((err) => console.error('[useScreenShare] stopScreenShare API error:', err));
    }
  }, [callId, peerConnection]);

  const startSharing = useCallback(async () => {
    if (!callId) return;

    // Check browser support.
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('screenShareNotSupported');
      return;
    }

    try {
      setError(null);
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });

      // Issue 3: validate that a video track actually exists before proceeding.
      // Do NOT assign screenStreamRef until we know the track is valid.
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        stream.getTracks().forEach((t) => t.stop());
        setError('screenShareNotSupported');
        return;
      }

      // Track is valid — now store references.
      screenStreamRef.current = stream;
      setScreenStream(stream);

      // When user clicks the browser's "Stop sharing" button.
      videoTrack.onended = () => {
        stopSharing();
      };

      // Add screen track to peer connection as an additional track.
      if (peerConnection) {
        const sender = peerConnection.addTrack(videoTrack, stream);
        screenSenderRef.current = sender;
      }

      setIsSharing(true);

      // Notify backend so it can signal the other participant.
      await callsService.startScreenShare(callId);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        // User dismissed the picker — silent failure.
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        setScreenStream(null);
      } else {
        console.error('[useScreenShare] startSharing error:', err);
        setError('screenShareNotSupported');
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        setScreenStream(null);
      }
    }
  }, [callId, peerConnection, stopSharing]);

  // Stop sharing when page is closed while sharing.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isSharing) {
        stopSharing();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSharing, stopSharing]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
    };
  }, []);

  return { isSharing, screenStream, startSharing, stopSharing, error };
}
