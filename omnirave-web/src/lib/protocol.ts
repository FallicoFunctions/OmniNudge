import type { RuntimeChatMessage, RuntimePlayer, RuntimeZoneEvent, RuntimeZoneID, RuntimeZoneMedia } from './session';

export interface WorldSnapshotMessage {
  type: 'world_snapshot';
  currentPlayerId: string;
  activeZone: RuntimeZoneID;
  players: RuntimePlayer[];
  zoneMedia: RuntimeZoneMedia[];
  zoneEvents: RuntimeZoneEvent[];
}

export interface WorldChatMessage extends RuntimeChatMessage {
  type: 'chat_message';
}
