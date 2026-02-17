-- Cleanup for Message Search 1M Benchmark dataset.
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/scripts/search_messages_1m_cleanup.sql
--
-- Removes only synthetic benchmark users and their conversation/messages:
--   - bench_user_1
--   - bench_user_2

\timing on

WITH bench_users AS (
  SELECT id
  FROM users
  WHERE username IN ('bench_user_1', 'bench_user_2')
),
bench_conversations AS (
  SELECT c.id
  FROM conversations c
  JOIN bench_users bu1 ON bu1.id = c.user1_id
  JOIN bench_users bu2 ON bu2.id = c.user2_id
)
DELETE FROM messages m
USING bench_conversations bc
WHERE m.conversation_id = bc.id;

DELETE FROM conversations c
USING (
  SELECT c2.id
  FROM conversations c2
  JOIN users u1 ON u1.id = c2.user1_id
  JOIN users u2 ON u2.id = c2.user2_id
  WHERE u1.username IN ('bench_user_1', 'bench_user_2')
    AND u2.username IN ('bench_user_1', 'bench_user_2')
) bc
WHERE c.id = bc.id;

DELETE FROM users
WHERE username IN ('bench_user_1', 'bench_user_2');

VACUUM (ANALYZE) messages;
VACUUM (ANALYZE) conversations;
VACUUM (ANALYZE) users;

\echo Benchmark dataset cleanup complete.
