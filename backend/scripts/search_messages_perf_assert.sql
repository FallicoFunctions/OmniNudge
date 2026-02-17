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
	benchmark_conversation_id INT;
	max_ms NUMERIC := 500;
	text_query_budget_ms NUMERIC := 500;
	explain_plan JSON;
	exec_ms NUMERIC;
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
		max_ms := 500;
		text_query_budget_ms := 500;
	ELSE
		-- Without pg_trgm, leading-wildcard content scans rely on seq scan paths.
		max_ms := 500;
		text_query_budget_ms := 700;
		RAISE NOTICE 'pg_trgm not installed; using relaxed text-query budget: % ms', text_query_budget_ms;
	END IF;

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

	SELECT c.id
	INTO benchmark_conversation_id
	FROM conversations c
	JOIN users u1 ON u1.id = c.user1_id
	JOIN users u2 ON u2.id = c.user2_id
	WHERE u1.username IN ('bench_user_1', 'bench_user_2')
	  AND u2.username IN ('bench_user_1', 'bench_user_2')
	ORDER BY c.id DESC
	LIMIT 1;

	IF benchmark_conversation_id IS NULL THEN
		RAISE EXCEPTION 'Benchmark conversation not found; run benchmark seed first.';
	END IF;

	EXECUTE format(
		$q1$
		EXPLAIN (ANALYZE, FORMAT JSON)
		WITH visible AS (
			SELECT m.id, m.sent_at
			FROM messages m
			WHERE m.conversation_id = %2$s
			  AND m.sender_id = %1$s
			  AND m.deleted_for_sender = FALSE
			  AND m.sent_at >= NOW() - INTERVAL '30 days'

			UNION ALL

			SELECT m.id, m.sent_at
			FROM messages m
			WHERE m.conversation_id = %2$s
			  AND m.recipient_id = %1$s
			  AND m.deleted_for_recipient = FALSE
			  AND m.sent_at >= NOW() - INTERVAL '30 days'
		)
		SELECT v.id
		FROM visible v
		ORDER BY v.sent_at DESC, v.id DESC
		LIMIT 50 OFFSET 0
		$q1$,
		auth_user_id,
		benchmark_conversation_id
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
		WHERE m.conversation_id = %2$s
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
		auth_user_id,
		benchmark_conversation_id
	)
	INTO explain_plan;

	exec_ms := (explain_plan->0->>'Execution Time')::numeric;
	IF exec_ms > text_query_budget_ms THEN
		RAISE EXCEPTION 'Message text query exceeded budget: % ms (budget: % ms)', exec_ms, text_query_budget_ms;
	END IF;
	RAISE NOTICE 'PASS text query: % ms (budget: % ms)', exec_ms, text_query_budget_ms;
END $$;
