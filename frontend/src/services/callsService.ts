import { api } from '../lib/api';
import type { Call, ICEServer, SignalType } from '../types/calls';

export const callsService = {
  async startCall(conversationId: number, callType: 'voice' | 'video'): Promise<Call> {
    return api.post<Call>(`/conversations/${conversationId}/calls`, { call_type: callType });
  },

  async answerCall(callId: number): Promise<Call> {
    return api.post<Call>(`/calls/${callId}/answer`, {});
  },

  async rejectCall(callId: number): Promise<Call> {
    return api.post<Call>(`/calls/${callId}/reject`, {});
  },

  async endCall(callId: number): Promise<Call> {
    return api.post<Call>(`/calls/${callId}/end`, {});
  },

  async sendSignal(
    callId: number,
    signalType: SignalType,
    sdp?: string,
    candidate?: RTCIceCandidateInit
  ): Promise<void> {
    await api.post<{ ok: boolean }>(`/calls/${callId}/signal`, {
      signal_type: signalType,
      ...(sdp !== undefined ? { sdp } : {}),
      ...(candidate !== undefined ? { candidate } : {}),
    });
  },

  async getICEServers(): Promise<{ ice_servers: ICEServer[] }> {
    return api.get<{ ice_servers: ICEServer[] }>('/calls/ice-servers');
  },

  async startScreenShare(callId: number): Promise<void> {
    await api.post<{ ok: boolean }>(`/calls/${callId}/screen-share/start`, {});
  },

  async stopScreenShare(callId: number): Promise<void> {
    await api.post<{ ok: boolean }>(`/calls/${callId}/screen-share/stop`, {});
  },

  async getCallHistory(
    conversationId: number,
    limit = 20,
    before?: number
  ): Promise<{ calls: Call[]; limit: number }> {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    if (before !== undefined) params.append('before', before.toString());
    return api.get<{ calls: Call[]; limit: number }>(
      `/conversations/${conversationId}/calls?${params.toString()}`
    );
  },
};
