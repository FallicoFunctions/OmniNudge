-- Message search performance assertions.
-- Requires a populated dataset (for example, after running search_messages_1m_benchmark.sql).
-- Fails with an exception if either query exceeds the latency budget.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/scripts/search_messages_perf_assert.sql
--
DO $$
DECLARE
	auth_user_id INT;
	max_ms NUMERIC := 500;
	explain_plan JSON;
	exec_ms NUMERIC;
BEGIN
	SELECT u.id
	INTO auth_user_id
	FROM users u
	WHERE EXISTS (
		SELECT 1
		FROM messages m
		WHERE m.sender_id = u.id OR m.recipient_id = u.id
	)
	ORDER BY u.id
	LIMIT 1;

	IF auth_user_id IS NULL THEN
		RAISE EXCEPTION 'No users with messages found; seed benchmark data first.';
	END IF;

	EXECUTE format(
		$q1$
		EXPLAIN (ANALYZE, FORMAT JSON)
		SELECT m.id
		FROM messages m
		INNER JOIN conversations c ON c.id = m.conversation_id
		WHERE (
			(
				(c.conversation_type = 'dm' OR c.conversation_type IS NULL)
				AND (c.user1_id = %1$s OR c.user2_id = %1$s)
			)
			OR
			(c.conversation_type = 'mod_mail' AND EXISTS (
				SELECT 1 FROM conversation_participants cp
				WHERE cp.conversation_id = c.id AND cp.user_id = %1$s
			))
		)
		AND (
			(m.sender_id = %1$s AND m.deleted_for_sender = FALSE)
			OR
			(m.recipient_id = %1$s AND m.deleted_for_recipient = FALSE)
			OR
			(m.is_multi_recipient = TRUE AND EXISTS (
				SELECT 1 FROM message_recipient_keys mrk
				WHERE mrk.message_id = m.id AND mrk.user_id = %1$s
			))
		)
		AND m.sent_at >= NOW() - INTERVAL '30 days'
		ORDER BY m.sent_at DESC, m.id DESC
		LIMIT 50 OFFSET 0
		$q1$,
		auth_user_id
	)
	INTO explain_plan;

	exec_ms := (explain_plan->0->>'Execution Time')::numeric;
	IF exec_ms > max_ms THEN
		RAISE EXCEPTION 'Message metadata query exceeded budget: % ms (budget: % ms)', exec_ms, max_ms;
	END IF;
	RAISE NOTICE 'PASS metadata query: % ms (budget: % ms)', exec_ms, max_ms;

	EXECUTE format(
		$q2$
		EXPLAIN (ANALYZE, FORMAT JSON)
		SELECT m.id
		FROM messages m
		LEFT JOIN users su ON su.id = m.sender_id
		INNER JOIN conversations c ON c.id = m.conversation_id
		WHERE (
			(
				(c.conversation_type = 'dm' OR c.conversation_type IS NULL)
				AND (c.user1_id = %1$s OR c.user2_id = %1$s)
			)
			OR
			(c.conversation_type = 'mod_mail' AND EXISTS (
				SELECT 1 FROM conversation_participants cp
				WHERE cp.conversation_id = c.id AND cp.user_id = %1$s
			))
		)
		AND (
			(m.sender_id = %1$s AND m.deleted_for_sender = FALSE)
			OR
			(m.recipient_id = %1$s AND m.deleted_for_recipient = FALSE)
			OR
			(m.is_multi_recipient = TRUE AND EXISTS (
				SELECT 1 FROM message_recipient_keys mrk
				WHERE mrk.message_id = m.id AND mrk.user_id = %1$s
			))
		)
		AND (
			LOWER(COALESCE(m.sender_encrypted_content, m.encrypted_content, '')) LIKE '%%bench%%'
			OR LOWER(COALESCE(su.username, '')) LIKE '%%bench%%'
		)
		ORDER BY m.sent_at DESC, m.id DESC
		LIMIT 50 OFFSET 0
		$q2$,
		auth_user_id
	)
	INTO explain_plan;

	exec_ms := (explain_plan->0->>'Execution Time')::numeric;
	IF exec_ms > max_ms THEN
		RAISE EXCEPTION 'Message text query exceeded budget: % ms (budget: % ms)', exec_ms, max_ms;
	END IF;
	RAISE NOTICE 'PASS text query: % ms (budget: % ms)', exec_ms, max_ms;
END $$;
