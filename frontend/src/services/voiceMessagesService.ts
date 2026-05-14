import type { VoiceMessage } from '../types/messages'

const API_BASE = '/api/v1'

export type VoiceMessageResponse = VoiceMessage;

export interface UploadVoiceResponse {
  voice_message_id: number
  storage_key: string
  duration_seconds: number
}

function getFilename(mimeType: string): string {
  if (mimeType.includes('webm')) return 'voice.webm'
  if (mimeType.includes('mp4')) return 'voice.m4a'
  if (mimeType.includes('ogg')) return 'voice.ogg'
  return 'voice.wav'
}

export const voiceMessagesService = {
  async upload(messageId: number, audioBlob: Blob, durationSeconds: number): Promise<UploadVoiceResponse> {
    const formData = new FormData()
    formData.append('audio', audioBlob, getFilename(audioBlob.type))
    formData.append('duration_seconds', String(durationSeconds))
    const resp = await fetch(`${API_BASE}/messages/${messageId}/voice`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })
    if (!resp.ok) throw new Error(await resp.text())
    return resp.json()
  },

  async getVoiceMessage(messageId: number): Promise<VoiceMessageResponse> {
    const resp = await fetch(`${API_BASE}/messages/${messageId}/voice`, {
      credentials: 'include',
    })
    if (!resp.ok) throw new Error(await resp.text())
    return resp.json()
  },
}
