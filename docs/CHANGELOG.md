# Changelog

All notable changes are documented in this file.

## 2026-02-18

### Added
- Message reactions feature in messaging:
  - backend reaction API endpoints (`POST`, `DELETE`, `GET`)
  - backend validation and deterministic reaction ordering
  - WebSocket reaction events (`reaction_added`, `reaction_removed`)
  - frontend reaction pills with optimistic updates
  - mobile-friendly emoji picker and reaction details modal
- Message pinning feature in messaging:
  - backend schema support with `pinned`, `pinned_by`, `pinned_at`
  - pinning API endpoints (`POST /messages/:id/pin`, `DELETE /messages/:id/pin`)
  - pinned message query endpoint (`GET /conversations/:id/pinned-messages`)
  - WebSocket pin events (`message_pinned`, `message_unpinned`)
  - frontend pinned bar with jump-to-message, collapse/expand, and permission-aware unpin
  - message menu pin/unpin actions with optimistic cache updates and websocket sync
- Conversation archiving feature in messaging:
  - backend archive APIs (`PUT /conversations/:id/archive`, `PUT /conversations/:id/unarchive`, `GET /conversations/archived`)
  - batch archive endpoint (`POST /conversations/archive-batch`) with transactional behavior
  - frontend active/archived tabs, archive/unarchive actions, and multi-select archive UX
  - auto-unarchive on incoming DM with recipient opt-out setting (`auto_unarchive_on_message`)
  - WebSocket unarchive signal (`conversation_unarchived`) for recipient state sync

### Testing
- Added/expanded reaction tests across backend handlers and frontend unit suites.
- Added mobile reaction verification steps in messaging test guide.
- Added pinning tests for hook/websocket behavior and expanded manual pinning QA steps in messaging guide.
- Added archive behavior coverage in backend handler + integration suites, including enabled/disabled auto-unarchive setting paths.
- Added frontend Settings tests for auto-unarchive toggle wiring, rollback on failed persistence, and local cache persistence.
