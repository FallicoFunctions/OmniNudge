-- Message Search 1M Benchmark (F0-003)
-- Usage:
--   psql "$DATABASE_URL" -f backend/scripts/search_messages_1m_benchmark.sql
--
-- Notes:
-- - Creates synthetic users/conversations/messages for performance testing.
-- - Uses ON CONFLICT/IF NOT EXISTS guards where practical to avoid duplicate failures.
-- - Run in a dedicated dev/test database only.

\timing on

-- Ensure required extension/indexes are available.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Synthetic users
INSERT INTO users (username, password_hash, created_at)
VALUES
  ('bench_user_1', 'bench_hash', NOW()),
  ('bench_user_2', 'bench_hash', NOW())
ON CONFLICT (username) DO NOTHING;

-- Ensure deterministic IDs for the benchmark users.
WITH u AS (
  SELECT id, username FROM users WHERE username IN ('bench_user_1', 'bench_user_2')
),
ids AS (
  SELECT
    MAX(CASE WHEN username = 'bench_user_1' THEN id END) AS user1_id,
    MAX(CASE WHEN username = 'bench_user_2' THEN id END) AS user2_id
  FROM u
)
INSERT INTO conversations (user1_id, user2_id, created_at, last_message_at)
SELECT LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id), NOW(), NOW()
FROM ids
ON CONFLICT (user1_id, user2_id) DO NOTHING;

-- Locate conversation id.
\echo Resolving benchmark conversation id...
WITH u AS (
  SELECT id, username FROM users WHERE username IN ('bench_user_1', 'bench_user_2')
),
ids AS (
  SELECT
    MAX(CASE WHEN username = 'bench_user_1' THEN id END) AS user1_id,
    MAX(CASE WHEN username = 'bench_user_2' THEN id END) AS user2_id
  FROM u
)
SELECT c.id AS benchmark_conversation_id
FROM conversations c, ids
WHERE c.user1_id = LEAST(ids.user1_id, ids.user2_id)
  AND c.user2_id = GREATEST(ids.user1_id, ids.user2_id);

-- Insert up to 1,000,000 synthetic messages for that conversation.
-- Uses plaintext-ish payload to stress LIKE/trigram path.
\echo Inserting synthetic messages (this can take several minutes)...
WITH u AS (
  SELECT id, username FROM users WHERE username IN ('bench_user_1', 'bench_user_2')
),
ids AS (
  SELECT
    MAX(CASE WHEN username = 'bench_user_1' THEN id END) AS user1_id,
    MAX(CASE WHEN username = 'bench_user_2' THEN id END) AS user2_id
  FROM u
),
conv AS (
  SELECT c.id AS conversation_id, ids.user1_id, ids.user2_id
  FROM conversations c, ids
  WHERE c.user1_id = LEAST(ids.user1_id, ids.user2_id)
    AND c.user2_id = GREATEST(ids.user1_id, ids.user2_id)
  LIMIT 1
),
existing AS (
  SELECT COUNT(*)::int AS cnt
  FROM messages m, conv
  WHERE m.conversation_id = conv.conversation_id
),
to_insert AS (
  SELECT GREATEST(0, 1000000 - cnt) AS remaining FROM existing
)
INSERT INTO messages (
  conversation_id,
  sender_id,
  recipient_id,
  encrypted_content,
  sender_encrypted_content,
  message_type,
  sent_at,
  encryption_version
)
SELECT
  conv.conversation_id,
  CASE WHEN gs.n % 2 = 0 THEN conv.user1_id ELSE conv.user2_id END AS sender_id,
  CASE WHEN gs.n % 2 = 0 THEN conv.user2_id ELSE conv.user1_id END AS recipient_id,
  CASE
    WHEN gs.n % 20 = 0 THEN 'hello benchmark token with link https://example.com/' || gs.n::text
    ELSE 'benchmark payload message #' || gs.n::text
  END AS encrypted_content,
  CASE
    WHEN gs.n % 20 = 0 THEN 'hello benchmark token with link https://example.com/' || gs.n::text
    ELSE 'benchmark payload message #' || gs.n::text
  END AS sender_encrypted_content,
  CASE WHEN gs.n % 10 = 0 THEN 'image' ELSE 'text' END AS message_type,
  NOW() - (gs.n || ' seconds')::interval AS sent_at,
  'v1' AS encryption_version
FROM conv
JOIN to_insert ON to_insert.remaining > 0
JOIN LATERAL generate_series(1, to_insert.remaining) AS gs(n) ON TRUE;

ANALYZE messages;

\echo Running benchmark query plans...
EXPLAIN (ANALYZE, BUFFERS)
SELECT m.id
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE m.conversation_id = (
  SELECT c2.id
  FROM conversations c2
  JOIN users u1 ON u1.id = c2.user1_id
  JOIN users u2 ON u2.id = c2.user2_id
  WHERE u1.username IN ('bench_user_1', 'bench_user_2')
    AND u2.username IN ('bench_user_1', 'bench_user_2')
  LIMIT 1
)
AND LOWER(COALESCE(m.sender_encrypted_content, m.encrypted_content, '')) LIKE '%benchmark token%'
ORDER BY m.sent_at DESC, m.id DESC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS)
SELECT m.id
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE m.conversation_id = (
  SELECT c2.id
  FROM conversations c2
  JOIN users u1 ON u1.id = c2.user1_id
  JOIN users u2 ON u2.id = c2.user2_id
  WHERE u1.username IN ('bench_user_1', 'bench_user_2')
    AND u2.username IN ('bench_user_1', 'bench_user_2')
  LIMIT 1
)
AND m.media_url IS NOT NULL
ORDER BY m.sent_at DESC, m.id DESC
LIMIT 50;

\echo Benchmark complete.
