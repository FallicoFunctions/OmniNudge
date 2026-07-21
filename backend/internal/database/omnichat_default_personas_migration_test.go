package database

import (
	"context"
	"io/fs"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestMigrateSeedsDefaultOmniChatPersonas(t *testing.T) {
	db, err := NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	rows, err := db.Pool.Query(ctx, `
		SELECT id, slug, first_message, system_prompt, scenario, example_dialogue,
		       response_style_profile, post_history_instructions, tags, is_nsfw
		FROM bot_personas
		WHERE owner_user_id IS NULL AND visibility = 'public' AND is_active
		ORDER BY slug
	`)
	require.NoError(t, err)
	defer rows.Close()

	type personaSeed struct {
		id            int
		firstMessage  string
		systemPrompt  string
		scenario      string
		example       string
		responseStyle string
		postHistory   string
		tags          []string
		isNSFW        bool
	}

	personas := map[string]personaSeed{}
	for rows.Next() {
		var slug string
		var seed personaSeed
		require.NoError(t, rows.Scan(
			&seed.id,
			&slug,
			&seed.firstMessage,
			&seed.systemPrompt,
			&seed.scenario,
			&seed.example,
			&seed.responseStyle,
			&seed.postHistory,
			&seed.tags,
			&seed.isNSFW,
		))
		personas[slug] = seed
	}
	require.NoError(t, rows.Err())

	expectedSlugs := []string{
		"dr-harold-whitcomb",
		"ella-morgan",
		"high-school-story-narrator",
		"malachar-warlock-dm",
		"max-rosen",
		"pink-sadie",
		"pirate-story-narrator",
		"rhett-callahan",
		"ruleskeeper-dm",
		"scarlett-voss",
	}
	narrativeSlugs := map[string]bool{
		"pirate-story-narrator":      true,
		"high-school-story-narrator": true,
		"ruleskeeper-dm":             true,
		"malachar-warlock-dm":        true,
	}
	require.Len(t, personas, len(expectedSlugs))
	for _, slug := range expectedSlugs {
		seed, ok := personas[slug]
		require.Truef(t, ok, "missing default persona %s", slug)
		require.NotEmptyf(t, seed.firstMessage, "first_message should be seeded for %s", slug)
		require.NotEmptyf(t, seed.systemPrompt, "system_prompt should be seeded for %s", slug)
		require.NotEmptyf(t, seed.scenario, "scenario should be seeded for %s", slug)
		require.Containsf(t, seed.example, "{{User}}:", "example dialogue should use the user marker for %s", slug)
		require.Containsf(t, seed.example, "{{Char}}:", "example dialogue should use the character marker for %s", slug)
		if narrativeSlugs[slug] {
			require.Equalf(t, models.ResponseStyleProfileLeanNarrative, seed.responseStyle, "unexpected response style for %s", slug)
			require.Containsf(t, seed.postHistory, "[Conversation Handoff]", "narrative personas should retain reply handoff rules for %s", slug)
		} else {
			require.NotContainsf(t, seed.postHistory, "[Conversation Handoff]", "social personas should not force reply handoffs for %s", slug)
			expectedStyle := models.ResponseStyleProfileNaturalDialogue
			if slug == "dr-harold-whitcomb" {
				expectedStyle = models.ResponseStyleProfileProfessional
			}
			require.Equalf(t, expectedStyle, seed.responseStyle, "unexpected response style for %s", slug)
		}
		require.NotEmptyf(t, seed.tags, "tags should be seeded for %s", slug)
		require.Containsf(t, seed.firstMessage, "*", "first_message should include italic action/narration markers for %s", slug)
		require.Falsef(t, seed.isNSFW, "default persona %s should not be marked NSFW", slug)
	}

	var outputFormattedCount int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM bot_personas
		WHERE owner_user_id IS NULL
		  AND visibility = 'public'
		  AND is_active
		  AND character_version = '2026-07-defaults-v1'
		  AND post_history_instructions LIKE '%[Output Formatting]%'
		  AND post_history_instructions LIKE '%Wrap actions, inner thoughts, scene-setting, and narration in single asterisks%'
		  AND post_history_instructions LIKE '%Write spoken dialogue as plain regular text without surrounding quotation marks%'
	`).Scan(&outputFormattedCount))
	require.Equal(t, len(expectedSlugs), outputFormattedCount)

	require.Equal(t, 1, personas["ruleskeeper-dm"].id)
	require.Equal(t, 2, personas["pirate-story-narrator"].id)
	require.Equal(t, 3, personas["high-school-story-narrator"].id)
	require.Equal(t, 4, personas["ella-morgan"].id)

	var warlockAvatarURL string
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT avatar_url FROM bot_personas WHERE slug = 'malachar-warlock-dm'
	`).Scan(&warlockAvatarURL))
	require.Equal(t, "/omnichat/avatars/malachar-warlock-dm.png", warlockAvatarURL)

	var dmRollCompletionCount int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM bot_personas
		WHERE slug IN ('ruleskeeper-dm', 'malachar-warlock-dm')
		  AND owner_user_id IS NULL
		  AND character_version = '2026-07-defaults-v1'
		  AND system_prompt LIKE '%Always complete each roll by choosing a die result%'
		  AND system_prompt LIKE '%Never end a response with an unresolved formula%'
		  AND post_history_instructions LIKE '%Roll dice yourself unless the user explicitly asks to roll manually%'
		  AND post_history_instructions LIKE '%Every roll must include the die result, modifier, total, outcome, consequence, and next playable situation%'
	`).Scan(&dmRollCompletionCount))
	require.Equal(t, 2, dmRollCompletionCount)

	var dmCombatLedgerCount int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM bot_personas
		WHERE slug IN ('ruleskeeper-dm', 'malachar-warlock-dm')
		  AND owner_user_id IS NULL
		  AND character_version = '2026-07-defaults-v1'
		  AND system_prompt LIKE '%[Combat Accounting]%'
		  AND system_prompt LIKE '%Before declaring a creature defeated%'
		  AND system_prompt LIKE '%Hex Warrior changes weapon use by rule concept; it does not by itself add an extra damage die%'
		  AND post_history_instructions LIKE '%[Combat Ledger]%'
		  AND post_history_instructions LIKE '%previous HP, damage roll, modifiers that are already established%'
		  AND post_history_instructions LIKE '%Never say an enemy is defeated unless the new HP is 0 or lower%'
	`).Scan(&dmCombatLedgerCount))
	require.Equal(t, 2, dmCombatLedgerCount)

	var dmSpellGuardrailCount int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM bot_personas
		WHERE slug IN ('ruleskeeper-dm', 'malachar-warlock-dm')
		  AND owner_user_id IS NULL
		  AND character_version = '2026-07-defaults-v1'
		  AND system_prompt LIKE '%[Spell Resolution Guardrail]%'
		  AND system_prompt LIKE '%At character level 3, Eldritch Blast makes one spell attack%'
		  AND system_prompt LIKE '%never use a d20 as its damage die%'
		  AND system_prompt LIKE '%Do not rename Eldritch Blast as Chaos Bolt%'
	`).Scan(&dmSpellGuardrailCount))
	require.Equal(t, 2, dmSpellGuardrailCount)
}

func TestSpellResolutionGuardrailMigrationRollsBackCleanly(t *testing.T) {
	db, err := NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	countGuardrails := func() int {
		var count int
		require.NoError(t, db.Pool.QueryRow(ctx, `
			SELECT COUNT(*)
			FROM bot_personas
			WHERE slug IN ('ruleskeeper-dm', 'malachar-warlock-dm')
			  AND system_prompt LIKE '%[Spell Resolution Guardrail]%'
		`).Scan(&count))
		return count
	}
	require.Equal(t, 2, countGuardrails())

	require.NoError(t, db.MigrateDown(ctx))
	require.Equal(t, 0, countGuardrails())
	var combatAccountingCount int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM bot_personas
		WHERE slug IN ('ruleskeeper-dm', 'malachar-warlock-dm')
		  AND system_prompt LIKE '%[Combat Accounting]%'
	`).Scan(&combatAccountingCount))
	require.Equal(t, 2, combatAccountingCount)

	require.NoError(t, db.Migrate(ctx))
	require.Equal(t, 2, countGuardrails())
}

func TestStarterMessageOutputFormatMigrationRepairsLegacyStarterRows(t *testing.T) {
	db, err := NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	var userID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('starter_repair_user', 'starter_repair_user', 'hash')
		RETURNING id
	`).Scan(&userID))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT id FROM bot_personas WHERE slug = 'malachar-warlock-dm'
	`).Scan(&personaID))

	var conversationID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_conversations (user_id, persona_id, title)
		VALUES ($1, $2, 'Starter repair')
		RETURNING id
	`, userID, personaID).Scan(&conversationID))

	const oldStarter = `Malachar taps a black-lacquered staff against the floor. "Before the first omen appears, what name should be written in the campaign ledger, and who are you playing? Character name, ancestry or species, class, background, level, and preferred tone will do. Choose a haunted lighthouse, a lost dwarven vault, a royal masquerade, or offer a darker doorway of your own."`
	const newStarter = `*Malachar taps a black-lacquered staff against the floor.* Before the first omen appears, what name should be written in the campaign ledger, and who are you playing? Character name, ancestry or species, class, background, level, and preferred tone will do. Choose a haunted lighthouse, a lost dwarven vault, a royal masquerade, or offer a darker doorway of your own.`

	var messageID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_messages (conversation_id, role, content)
		VALUES ($1, 'assistant', $2)
		RETURNING id
	`, conversationID, oldStarter).Scan(&messageID))

	migrationSQL, err := fs.ReadFile(migrationsFS, "migrations/128_omnichat_starter_message_output_format.up.sql")
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, string(migrationSQL))
	require.NoError(t, err)

	var content string
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT content FROM bot_messages WHERE id = $1
	`, messageID).Scan(&content))
	require.Equal(t, newStarter, content)
}

func TestDanglingUserTurnRepairMigrationOnlyRepairsStaleLatestUserTurns(t *testing.T) {
	db, err := NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	var userID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('dangling_repair_user', 'dangling_repair_user', 'hash')
		RETURNING id
	`).Scan(&userID))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT id FROM bot_personas WHERE slug = 'malachar-warlock-dm'
	`).Scan(&personaID))

	var staleConversationID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_conversations (user_id, persona_id, title)
		VALUES ($1, $2, 'Stale dangling')
		RETURNING id
	`, userID, personaID).Scan(&staleConversationID))
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO bot_messages (conversation_id, role, content, created_at)
		VALUES ($1, 'user', 'This turn was left hanging.', NOW() - INTERVAL '10 minutes')
	`, staleConversationID)
	require.NoError(t, err)

	var recentConversationID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_conversations (user_id, persona_id, title)
		VALUES ($1, $2, 'Recent active')
		RETURNING id
	`, userID, personaID).Scan(&recentConversationID))
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO bot_messages (conversation_id, role, content, created_at)
		VALUES ($1, 'user', 'This turn may still be generating.', NOW())
	`, recentConversationID)
	require.NoError(t, err)

	migrationSQL, err := fs.ReadFile(migrationsFS, "migrations/128_omnichat_starter_message_output_format.up.sql")
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, string(migrationSQL))
	require.NoError(t, err)

	var staleLastRole, staleLastContent string
	var staleLastFailed bool
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT role, content, failed
		FROM bot_messages
		WHERE conversation_id = $1
		ORDER BY id DESC
		LIMIT 1
	`, staleConversationID).Scan(&staleLastRole, &staleLastContent, &staleLastFailed))
	require.Equal(t, models.BotMessageRoleAssistant, staleLastRole)
	require.True(t, staleLastFailed)
	require.Equal(t, "The bot was interrupted before it could answer. Please send your message again.", staleLastContent)

	var recentMessageCount int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM bot_messages
		WHERE conversation_id = $1
	`, recentConversationID).Scan(&recentMessageCount))
	require.Equal(t, 1, recentMessageCount)
}

func TestDMRollCompletionMigrationRepairsUnresolvedRollPlaceholders(t *testing.T) {
	db, err := NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	var userID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('roll_repair_user', 'roll_repair_user', 'hash')
		RETURNING id
	`).Scan(&userID))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT id FROM bot_personas WHERE slug = 'malachar-warlock-dm'
	`).Scan(&personaID))

	var conversationID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_conversations (user_id, persona_id, title)
		VALUES ($1, $2, 'Roll repair')
		RETURNING id
	`, userID, personaID).Scan(&conversationID))

	const unresolvedRoll = "*The parchment shivers.*\n\n*Roll for Intelligence (Investigation).*\n\n**d20 + 2 = ?**"
	var messageID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_messages (conversation_id, role, content, failed)
		VALUES ($1, 'assistant', $2, FALSE)
		RETURNING id
	`, conversationID, unresolvedRoll).Scan(&messageID))

	migrationSQL, err := fs.ReadFile(migrationsFS, "migrations/128_omnichat_starter_message_output_format.up.sql")
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, string(migrationSQL))
	require.NoError(t, err)

	var content string
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT content FROM bot_messages WHERE id = $1
	`, messageID).Scan(&content))
	require.NotContains(t, content, "d20 + 2 = ?")
	require.Contains(t, content, "d20 + 2 = interrupted")
	require.Contains(t, content, "the DM will roll, resolve the outcome, and continue the scene")
}

func TestStaleDanglingTurnsMigrationRepairsOnlyOldLatestUserTurns(t *testing.T) {
	db, err := NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	var userID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('dangling_turn_user', 'dangling_turn_user', 'hash')
		RETURNING id
	`).Scan(&userID))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT id FROM bot_personas WHERE slug = 'malachar-warlock-dm'
	`).Scan(&personaID))

	var staleConversationID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_conversations (user_id, persona_id, title)
		VALUES ($1, $2, 'Stale dangling turn')
		RETURNING id
	`, userID, personaID).Scan(&staleConversationID))
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO bot_messages (conversation_id, role, content, created_at)
		VALUES ($1, 'user', 'I ready my sword', NOW() - INTERVAL '2 minutes')
	`, staleConversationID)
	require.NoError(t, err)

	var freshConversationID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_conversations (user_id, persona_id, title)
		VALUES ($1, $2, 'Fresh dangling turn')
		RETURNING id
	`, userID, personaID).Scan(&freshConversationID))
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO bot_messages (conversation_id, role, content, created_at)
		VALUES ($1, 'user', 'Still waiting', NOW())
	`, freshConversationID)
	require.NoError(t, err)

	migrationSQL, err := fs.ReadFile(migrationsFS, "migrations/128_omnichat_starter_message_output_format.up.sql")
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, string(migrationSQL))
	require.NoError(t, err)

	var staleAssistantCount int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM bot_messages
		WHERE conversation_id = $1
		  AND role = 'assistant'
		  AND failed
		  AND content = 'The bot was interrupted before it could answer. Please send your message again.'
	`, staleConversationID).Scan(&staleAssistantCount))
	require.Equal(t, 1, staleAssistantCount)

	var freshAssistantCount int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM bot_messages
		WHERE conversation_id = $1
		  AND role = 'assistant'
	`, freshConversationID).Scan(&freshAssistantCount))
	require.Zero(t, freshAssistantCount)
}
