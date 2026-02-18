/**
 * Types for the message reactions feature (F1-005).
 * Mirror the backend models/reaction.go structs.
 */

/** A single reaction row as returned by POST /messages/{id}/reactions. */
export interface MessageReaction {
  id: number;
  message_id: number;
  user_id: number;
  username?: string;
  emoji: string;
  created_at: string;
}

/**
 * Aggregated reactions for a single emoji type on a message.
 * Returned as an array by GET /messages/{id}/reactions.
 *
 * `my_reaction_id` is set when the authenticated user has reacted with this
 * emoji. Clients use it to call DELETE /messages/{id}/reactions/{id}.
 */
export interface ReactionSummary {
  emoji: string;
  count: number;
  user_ids: number[];
  usernames: string[];
  user_reacted: boolean;
  my_reaction_id?: number;
}

/** Top-level response from GET /messages/{id}/reactions. */
export interface GetReactionsResponse {
  reactions: ReactionSummary[];
  total_unique_emoji: number;
  /** True when the combined user list across all emoji exceeds 500 entries. */
  users_truncated: boolean;
}

/** Payload carried in the `reaction_added` WebSocket event. */
export interface WsReactionAddedPayload {
  message_id: number;
  conversation_id: number;
  reaction: MessageReaction;
}

/** Payload carried in the `reaction_removed` WebSocket event. */
export interface WsReactionRemovedPayload {
  message_id: number;
  conversation_id: number;
  reaction_id: number;
  user_id: number;
  emoji: string;
}
