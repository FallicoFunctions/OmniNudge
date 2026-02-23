export interface Call {
  id: number
  conversation_id: number
  caller_id: number
  callee_id: number
  call_type: 'voice' | 'video'
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'rejected' | 'failed'
  started_at: string
  answered_at?: string
  ended_at?: string
  duration_seconds?: number
  ended_by?: number
  caller_username?: string
  callee_username?: string
  // Screen sharing fields (F14)
  is_screen_sharing?: boolean
  screen_share_started_at?: string
  screen_share_ended_at?: string
}

export type VideoQuality = 'low' | 'medium' | 'high'

export interface ICEServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export type SignalType = 'offer' | 'answer' | 'candidate'

export interface CallSignal {
  call_id: number
  signal_type: SignalType
  sdp?: string
  candidate?: RTCIceCandidateInit
}

export type CallManagerState =
  | 'idle'
  | 'ringing_outgoing'
  | 'ringing_incoming'
  | 'active'
  | 'ended'
