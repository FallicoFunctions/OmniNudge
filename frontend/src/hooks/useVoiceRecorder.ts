import { useState, useRef, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';

/**
 * Voice recorder hook with iOS Safari fallback support
 *
 * Supports two recording methods:
 * 1. MediaRecorder API (modern browsers, Android, desktop)
 * 2. Web Audio API + server-side encoding (iOS Safari fallback)
 */

interface VoiceRecorderOptions {
  onRecordingComplete?: (blob: Blob, duration: number) => void;
  onError?: (error: Error) => void;
  maxDuration?: number; // in seconds
}

interface VoiceRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  isProcessing: boolean;
  error: string | null;
}

export function useVoiceRecorder(options: VoiceRecorderOptions = {}) {
  const {
    onRecordingComplete,
    onError,
    maxDuration = 300, // 5 minutes default
  } = options;

  const [state, setState] = useState<VoiceRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    isProcessing: false,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<number | null>(null);

  // Web Audio API refs (for iOS fallback)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioBuffersRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(44100);
  const { micDeviceId } = useSettings();

  const getAudioConstraints = useCallback((): MediaTrackConstraints | boolean => {
    if (!micDeviceId) {
      return true;
    }
    return {
      deviceId: { exact: micDeviceId },
    };
  }, [micDeviceId]);

  // Feature detection
  const isMediaRecorderSupported = useCallback(() => {
    return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm');
  }, []);

  // Start duration timer
  const startDurationTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    durationIntervalRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setState(prev => ({ ...prev, duration: elapsed }));

      // Auto-stop at max duration
      if (elapsed >= maxDuration) {
        stopRecording();
      }
    }, 100);
  }, [maxDuration]);

  // Stop duration timer
  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  // Start recording with MediaRecorder (modern browsers)
  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: getAudioConstraints() });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);

        if (onRecordingComplete) {
          onRecordingComplete(audioBlob, duration);
        }

        // Cleanup
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        setState(prev => ({
          ...prev,
          isRecording: false,
          isPaused: false,
          duration: 0,
        }));
        isRecordingRef.current = false;
        isPausedRef.current = false;
      };

      mediaRecorder.start(100); // Collect data every 100ms
      startDurationTimer();

      setState(prev => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        error: null,
      }));
      isRecordingRef.current = true;
      isPausedRef.current = false;
      isRecordingRef.current = true;
      isPausedRef.current = false;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start recording');
      setState(prev => ({ ...prev, error: error.message }));
      if (onError) {
        onError(error);
      }
    }
  }, [getAudioConstraints, onRecordingComplete, onError, startDurationTimer]);

  // Start recording with Web Audio API (iOS Safari fallback)
  const startWebAudioRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: getAudioConstraints() });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      sampleRateRef.current = audioContext.sampleRate;

      const source = audioContext.createMediaStreamSource(stream);
      const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = scriptProcessor;
      audioBuffersRef.current = [];

      scriptProcessor.onaudioprocess = (event) => {
        if (isRecordingRef.current && !isPausedRef.current) {
          const inputData = event.inputBuffer.getChannelData(0);
          // Clone the data to prevent it from being overwritten
          const buffer = new Float32Array(inputData.length);
          buffer.set(inputData);
          audioBuffersRef.current.push(buffer);
        }
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      startDurationTimer();

      setState(prev => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        error: null,
      }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start recording');
      setState(prev => ({ ...prev, error: error.message }));
      if (onError) {
        onError(error);
      }
    }
  }, [getAudioConstraints, onError, startDurationTimer]);

  // Start recording (auto-detects best method)
  const startRecording = useCallback(async () => {
    if (isMediaRecorderSupported()) {
      await startMediaRecorder();
    } else {
      // iOS Safari fallback
      await startWebAudioRecorder();
    }
  }, [isMediaRecorderSupported, startMediaRecorder, startWebAudioRecorder]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    stopDurationTimer();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // MediaRecorder path
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    } else if (audioContextRef.current) {
      // Web Audio API path - need to encode on server
      setState(prev => ({ ...prev, isProcessing: true }));

      try {
        // Combine all audio buffers
        const totalLength = audioBuffersRef.current.reduce((acc, buf) => acc + buf.length, 0);
        const combinedBuffer = new Float32Array(totalLength);
        let offset = 0;
        for (const buffer of audioBuffersRef.current) {
          combinedBuffer.set(buffer, offset);
          offset += buffer.length;
        }

        // Convert Float32Array to Int16Array (PCM)
        const pcmData = new Int16Array(combinedBuffer.length);
        for (let i = 0; i < combinedBuffer.length; i++) {
          const s = Math.max(-1, Math.min(1, combinedBuffer[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Create WAV header
        const wavBuffer = createWavBuffer(pcmData, sampleRateRef.current);
        const audioBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);

        // Send to server for encoding to WebM/Opus
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');
        formData.append('duration', duration.toString());

        const response = await fetch('/api/v1/media/encode-audio', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Failed to encode audio on server');
        }

        const result = await response.json();

        // Fetch the encoded file
        const encodedResponse = await fetch(result.url);
        const encodedBlob = await encodedResponse.blob();

        if (onRecordingComplete) {
          onRecordingComplete(encodedBlob, duration);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to process audio');
        setState(prev => ({ ...prev, error: error.message }));
        if (onError) {
          onError(error);
        }
      } finally {
        setState(prev => ({ ...prev, isProcessing: false }));
      }

      // Cleanup Web Audio API resources
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      audioBuffersRef.current = [];

      setState(prev => ({
        ...prev,
        isRecording: false,
        isPaused: false,
        duration: 0,
      }));
      isRecordingRef.current = false;
      isPausedRef.current = false;
    }
  }, [stopDurationTimer, onRecordingComplete, onError]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      stopDurationTimer();
      setState(prev => ({ ...prev, isPaused: true }));
      isPausedRef.current = true;
    } else if (audioContextRef.current) {
      // For Web Audio API, we just stop collecting buffers (handled in onaudioprocess)
      stopDurationTimer();
      setState(prev => ({ ...prev, isPaused: true }));
      isPausedRef.current = true;
    }
  }, [stopDurationTimer]);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      startDurationTimer();
      setState(prev => ({ ...prev, isPaused: false }));
      isPausedRef.current = false;
    } else if (audioContextRef.current) {
      startDurationTimer();
      setState(prev => ({ ...prev, isPaused: false }));
      isPausedRef.current = false;
    }
  }, [startDurationTimer]);

  // Cancel recording
  const cancelRecording = useCallback(() => {
    stopDurationTimer();

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    audioChunksRef.current = [];
    audioBuffersRef.current = [];

    setState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      isProcessing: false,
      error: null,
    });
    isRecordingRef.current = false;
    isPausedRef.current = false;
  }, [stopDurationTimer]);

  return {
    ...state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    isMediaRecorderSupported: isMediaRecorderSupported(),
  };
}

// Helper function to create WAV file buffer
function createWavBuffer(pcmData: Int16Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + pcmData.length * 2);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, pcmData.length * 2, true);

  // PCM data
  const offset = 44;
  for (let i = 0; i < pcmData.length; i++) {
    view.setInt16(offset + i * 2, pcmData[i], true);
  }

  return buffer;
}
