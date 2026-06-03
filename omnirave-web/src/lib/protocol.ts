import type { RuntimeChatMessage, RuntimePlayer, RuntimeZoneID, RuntimeZoneMedia } from './session';

export interface WorldSnapshotMessage {
  type: 'world_snapshot';
  currentPlayerId: string;
  activeZone: RuntimeZoneID;
  players: RuntimePlayer[];
  zoneMedia: RuntimeZoneMedia[];
}

export interface WorldChatMessage extends RuntimeChatMessage {
  type: 'chat_message';
}
