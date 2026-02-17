# Search Architecture

## Overview

OmniNudge currently uses PostgreSQL-backed search for:
- Public content search: posts, comments, users, hubs
- Authenticated message search: direct and mod-mail messages visible to the requesting user

Search is implemented in `backend/internal/handlers/search.go`.

## Public Content Search

Endpoints:
- `GET /api/v1/search/posts`
- `GET /api/v1/search/comments`
- `GET /api/v1/search/users`
- `GET /api/v1/search/hubs`

Implementation details:
- Uses PostgreSQL Full-Text Search (`tsvector`, `plainto_tsquery`, `ts_rank`)
- Sort options:
  - `relevance` (default)
  - `new`
  - `old`
- Supports cursor pagination and offset pagination

Indexes/triggers:
- `search_vector` columns are maintained by DB triggers in base schema migration
- GIN indexes exist for `platform_posts`, `post_comments`, `users`, and `hubs`

## Message Search

Endpoint:
- `GET /api/v1/search/messages` (auth required)

Implementation details:
- Visibility is enforced per user:
  - User must be a participant in the conversation
  - Message-level soft delete flags are respected
  - Archived conversations are excluded by default unless `include_archived=true`
- Supports metadata filters:
  - `conversation_id`
  - `sender_id`
  - `has_files`
  - `has_links`
  - `start_date`, `end_date` (RFC3339)
- Supports pagination:
  - `limit` (1-100)
  - `offset` (>=0)
  - includes `total` in response

Ranking:
- Query text match score + recency ordering (`sent_at DESC`, `id DESC`)
- When `q` is empty, results are ordered by recency

Encryption note:
- Message bodies are end-to-end encrypted in normal flow.
- Server-side text matching is best-effort for rows where searchable plaintext-like content is present.
- Full content search for encrypted text should use client-side decrypted search flows.

## Query Syntax

Message search example:

```http
GET /api/v1/search/messages?q=hello&conversation_id=42&has_files=true&start_date=2026-02-01T00:00:00Z&end_date=2026-02-17T23:59:59Z&limit=25&offset=0
Authorization: Bearer <jwt>
```

Public post search example:

```http
GET /api/v1/search/posts?q=postgres+fts&sort=relevance&limit=25
```

## Performance

Message search performance indexes were added in migration `044_message_search_indexes`:
- `idx_messages_sender_sent_at`
- `idx_messages_conversation_sender_sent_at`
- `idx_messages_sender_encrypted_content_trgm`
- `idx_messages_encrypted_content_trgm`

And extension:
- `pg_trgm` (if available)

Scale test script:
- `backend/scripts/search_messages_1m_benchmark.sql`
- Generates a synthetic 1M-message DM dataset and runs `EXPLAIN (ANALYZE, BUFFERS)` queries.

## Follow-ups

Potential future improvements:
- Dedicated encrypted-search index strategy
- Cursor pagination for message search endpoint
- Query analytics and slow-query dashboards for search endpoints
