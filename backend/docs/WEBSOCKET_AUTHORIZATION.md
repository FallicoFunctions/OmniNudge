# WebSocket Authorization

This document summarizes authorization behavior for realtime websocket events.

## Scope

- Current websocket inbound event surface: `typing`.
- Other privileged actions (mute/ban/admin actions) are performed over authenticated HTTP APIs and are not websocket event types today.

## Authorization Rules

1. Client must be authenticated at websocket handshake (`AuthRequired` middleware).
2. For conversation-scoped websocket events:
   - Sender must be a participant of `conversation_id` (`CanAccessConversation`).
   - If authorization fails, event is dropped, security log is written, and an error is returned to the sender.
3. Recipients are derived server-side from conversation participants; client-provided recipient IDs are never trusted.
4. Typing indicator privacy settings are enforced for both sender and recipients.

## Abuse Controls

- Rate limiting is enforced in websocket client read loop.
- Hub enforces single active connection per user ("last connection wins"), preventing multi-connection bypass patterns.

## Logging

- Connection and disconnection events are audit logged.
- Unauthorized conversation access attempts are security logged with `user_id` and `conversation_id`.

