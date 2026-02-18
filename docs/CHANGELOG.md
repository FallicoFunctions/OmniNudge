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

### Testing
- Added/expanded reaction tests across backend handlers and frontend unit suites.
- Added mobile reaction verification steps in messaging test guide.

