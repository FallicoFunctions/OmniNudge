// Package main implements a CLI tool that seeds realistic test data into the
// OmniNudge database for QA purposes (QA-007).
package main

import (
	"context"
	"flag"
	"fmt"
	"math/rand"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/models"
)

const (
	seedEmailPattern = "seed_user_%d@omninudge.test"
	seedPassword     = "Password123!"
	bcryptCost       = 12
)

var messageContents = []string{
	"Hey, how are you doing?",
	"Did you check out that new post on the general hub?",
	"I think the new feature looks amazing!",
	"Can we schedule a quick sync later?",
	"Just pushed my latest changes, let me know what you think.",
	"Have you seen the latest discussion about the upcoming release?",
	"I'll be online later if you want to chat.",
	"That's a really interesting perspective!",
	"Thanks for sharing, I'll look into it.",
	"I totally agree with your point.",
	"Let me know when you're free.",
	"Just finished reviewing the code, left some comments.",
	"The build passed! Ready to merge.",
	"Good morning! Hope you have a productive day.",
	"Did you catch the game last night?",
	"I'll send over the details shortly.",
	"Looks good to me, ship it!",
	"Can you double check the edge cases?",
	"I found a bug, will open a ticket.",
	"Ping me when you have a moment.",
	"The deployment went smoothly.",
	"Rolling back — something went wrong in prod.",
	"All green on the integration tests.",
	"Just got back from lunch, what did I miss?",
	"Anyone else seeing this flakiness?",
	"This is really coming together nicely.",
	"I love working on this project.",
	"Let's get this merged before EOD.",
	"Just FYI — the meeting moved to 3pm.",
	"Happy to pair on this if you want.",
	"Reading through the docs now.",
	"Found the root cause — it was a race condition.",
	"Fixed! Tests pass locally.",
	"Opened PR #42, please review.",
	"Leaving early today, see you tomorrow.",
	"Great job everyone, this was a tough one!",
	"The new design looks crisp.",
	"Feature flagged and ready to roll out.",
	"Metrics look healthy post-deploy.",
	"Rolled out to 10% — no errors so far.",
	"Full rollout complete. Monitoring.",
	"That edge case was sneaky.",
	"Good catch! I would have missed that.",
	"Going to tackle the tech debt next sprint.",
	"Quick question — did we ever resolve that ticket?",
	"Confirmed: reproduces on main branch.",
	"Hotfix deployed to production.",
	"Retrospective notes are in the shared doc.",
	"Can't wait to demo this to the stakeholders.",
	"Standby — refreshing the logs.",
}

var hubDescriptions = []string{
	"A place to discuss everything and anything.",
	"Share your projects, get feedback, learn together.",
	"For enthusiasts, hobbyists, and professionals alike.",
}

var postTitles = []string{
	"Welcome to the community!",
	"Show and tell: what are you working on?",
	"Weekly discussion thread",
	"Tips and tricks you wish you knew earlier",
	"Best practices for 2026",
	"Ask anything — no question too basic",
	"Interesting find I wanted to share",
	"How I solved a tricky problem",
	"Lessons learned from last week",
	"Let's talk about the future of this space",
	"Deep dive: understanding the fundamentals",
	"Hot take: controversial opinion incoming",
	"Resource roundup for beginners",
	"Community poll: what do you want next?",
	"Behind the scenes: how it works",
	"Quick update on my progress",
	"Seeking feedback on my latest work",
	"Announcement: big changes coming",
	"A beginner's guide to getting started",
	"The story behind this project",
}

func main() {
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	reset := flag.Bool("reset", false, "Delete all seeded data before reseeding")
	count := flag.Int("count", 20, "Number of seed users to create")
	flag.Parse()

	// Load .env if present
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, cfg.Database.DatabaseURL())
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("database ping failed")
	}
	log.Info().Msg("connected to database")

	if *reset {
		if err := resetSeedData(ctx, pool); err != nil {
			log.Fatal().Err(err).Msg("reset failed")
		}
	}

	if err := seedData(ctx, pool, *count); err != nil {
		log.Fatal().Err(err).Msg("seeding failed")
	}

	log.Info().Msg("seed complete")
}

func resetSeedData(ctx context.Context, pool *pgxpool.Pool) error {
	log.Info().Msg("resetting seed data...")

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin reset tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // deferred rollback error is intentionally discarded; tx commit outcome takes precedence

	// 1. NULL out messages.pinned_by for messages sent by seed users
	//    (FK has no CASCADE/SET NULL so must be cleared before deleting users).
	_, err = tx.Exec(ctx, `
		UPDATE messages
		SET pinned_by = NULL, pinned = FALSE, pinned_at = NULL
		WHERE pinned_by IN (
			SELECT id FROM users WHERE email LIKE 'seed_user_%@omninudge.test'
		)
	`)
	if err != nil {
		return fmt.Errorf("clear pinned_by for seed users: %w", err)
	}

	// 2. Delete hubs created by seed users (named seed_hub_*).
	_, err = tx.Exec(ctx, `
		DELETE FROM hubs WHERE name LIKE 'seed_hub_%'
	`)
	if err != nil {
		return fmt.Errorf("delete seed hubs: %w", err)
	}

	// 3. Delete seed users; related rows with CASCADE FK will follow automatically.
	_, err = tx.Exec(ctx, `
		DELETE FROM users WHERE email LIKE 'seed_user_%@omninudge.test'
	`)
	if err != nil {
		return fmt.Errorf("delete seed users: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reset tx: %w", err)
	}

	log.Info().Msg("seed data deleted")
	return nil
}

func seedData(ctx context.Context, pool *pgxpool.Pool, userCount int) error {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	// --- 1. Hash password once ---
	log.Info().Str("password", seedPassword).Msg("hashing seed password")
	hash, err := bcrypt.GenerateFromPassword([]byte(seedPassword), bcryptCost)
	if err != nil {
		return fmt.Errorf("bcrypt: %w", err)
	}
	passwordHash := string(hash)

	// --- 2. Create users ---
	log.Info().Int("count", userCount).Msg("creating seed users")
	userIDs := make([]int, 0, userCount)
	userRepo := models.NewUserRepository(pool)

	for i := 1; i <= userCount; i++ {
		email := fmt.Sprintf(seedEmailPattern, i)
		username := fmt.Sprintf("seed_user_%d", i)

		// Skip if already exists
		existing, _ := userRepo.GetByUsername(ctx, username)
		if existing != nil {
			log.Info().Str("username", username).Msg("user already exists, skipping")
			userIDs = append(userIDs, existing.ID)
			continue
		}

		user := &models.User{
			Username:     username,
			PasswordHash: passwordHash,
			Role:         "user",
		}
		// Store email via raw query since model uses encryption path
		if err := userRepo.Create(ctx, user); err != nil {
			return fmt.Errorf("create user %d: %w", i, err)
		}
		// Update email directly (seed data, plaintext is fine for test)
		_, err := pool.Exec(ctx,
			`UPDATE users SET email = $1 WHERE id = $2`,
			email, user.ID,
		)
		if err != nil {
			return fmt.Errorf("set email for user %d: %w", i, err)
		}
		userIDs = append(userIDs, user.ID)
		log.Info().Str("username", username).Str("email", email).Int("id", user.ID).Msg("created user")
	}

	if len(userIDs) < 2 {
		return fmt.Errorf("need at least 2 users to seed conversations")
	}

	// --- 3. Create 5 direct conversations ---
	log.Info().Msg("creating direct conversations")
	convRepo := models.NewConversationRepository(pool)
	dmConvIDs := make([]int, 0, 5)

	for i := 0; i < 5 && i+1 < len(userIDs); i++ {
		u1 := userIDs[i]
		u2 := userIDs[(i+1)%len(userIDs)]
		conv, err := convRepo.Create(ctx, u1, u2)
		if err != nil {
			return fmt.Errorf("create dm conversation %d: %w", i, err)
		}
		dmConvIDs = append(dmConvIDs, conv.ID)
		log.Info().Int("conversation_id", conv.ID).Int("user1", u1).Int("user2", u2).Msg("created dm conversation")
	}

	// --- 4. Create group conversations ---
	log.Info().Msg("creating group conversations")
	groupConvIDs := make([]int, 0, 2)

	// Group 1: 5 members
	group1Members := pickN(userIDs, 5, rng)
	gid1, err := createGroupConversation(ctx, pool, group1Members[0], group1Members[1:], "Seed Group Alpha")
	if err != nil {
		return fmt.Errorf("create group alpha: %w", err)
	}
	groupConvIDs = append(groupConvIDs, gid1)
	log.Info().Int("conversation_id", gid1).Int("members", 5).Msg("created group alpha")

	// Group 2: 10 members (or max available)
	group2Members := pickN(userIDs, 10, rng)
	gid2, err := createGroupConversation(ctx, pool, group2Members[0], group2Members[1:], "Seed Group Beta")
	if err != nil {
		return fmt.Errorf("create group beta: %w", err)
	}
	groupConvIDs = append(groupConvIDs, gid2)
	log.Info().Int("conversation_id", gid2).Int("members", len(group2Members)).Msg("created group beta")

	// --- 5. Seed 50 messages per conversation ---
	log.Info().Msg("seeding messages")
	msgRepo := models.NewMessageRepository(pool)

	allConvIDs := append(dmConvIDs, groupConvIDs...)
	for _, convID := range allConvIDs {
		members, err := getConversationMembers(ctx, pool, convID, userIDs)
		if err != nil {
			return fmt.Errorf("get members for conv %d: %w", convID, err)
		}
		if len(members) == 0 {
			continue
		}

		var pinnedCount int
		for j := 0; j < 50; j++ {
			senderIdx := rng.Intn(len(members))
			senderID := members[senderIdx]

			// For DMs we need a recipient; for groups use sender again (group messages use sender==recipient pattern)
			recipientID := senderID
			if len(members) == 2 {
				recipientID = members[1-senderIdx]
			}

			content := messageContents[rng.Intn(len(messageContents))]
			msg := &models.Message{
				ConversationID:    convID,
				SenderID:          senderID,
				RecipientID:       recipientID,
				EncryptedContent:  fmt.Sprintf("seed_encrypted[%s]", content),
				MessageType:       "text",
				EncryptionVersion: "v1",
			}

			if err := msgRepo.Create(ctx, msg); err != nil {
				return fmt.Errorf("create message for conv %d: %w", convID, err)
			}

			// Pin some messages (first 3 per conversation)
			if pinnedCount < 3 && rng.Intn(10) < 2 {
				_, err := pool.Exec(ctx,
					`UPDATE messages SET pinned = TRUE, pinned_by = $1, pinned_at = NOW() WHERE id = $2`,
					senderID, msg.ID,
				)
				if err == nil {
					pinnedCount++
				}
			}

			// Add reactions to some messages
			if rng.Intn(5) == 0 && msg.ID > 0 {
				emojis := []string{"👍", "❤️", "😂", "🔥", "👏"}
				emoji := emojis[rng.Intn(len(emojis))]
				reactorID := members[rng.Intn(len(members))]
				_, _ = pool.Exec(ctx,
					`INSERT INTO message_reactions (message_id, user_id, emoji)
					 VALUES ($1, $2, $3)
					 ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
					msg.ID, reactorID, emoji,
				)
			}
		}
		log.Info().Int("conversation_id", convID).Int("messages", 50).Msg("seeded messages")
	}

	// --- 6. Create 3 hubs ---
	log.Info().Msg("creating hubs")
	hubRepo := models.NewHubRepository(pool)
	hubIDs := make([]int, 0, 3)
	hubNames := []string{"seed_hub_alpha", "seed_hub_beta", "seed_hub_gamma"}

	for i, name := range hubNames {
		desc := hubDescriptions[i%len(hubDescriptions)]
		createdBy := userIDs[rng.Intn(len(userIDs))]
		hub := &models.Hub{
			Name:        name,
			Description: &desc,
			Type:        "public",
			CreatedBy:   &createdBy,
		}
		if err := hubRepo.Create(ctx, hub); err != nil {
			// Might already exist
			log.Warn().Err(err).Str("hub", name).Msg("hub create skipped (may already exist)")
			existing, gerr := hubRepo.GetByName(ctx, name)
			if gerr == nil {
				hubIDs = append(hubIDs, existing.ID)
			}
			continue
		}
		hubIDs = append(hubIDs, hub.ID)
		log.Info().Str("hub", name).Int("id", hub.ID).Msg("created hub")
	}

	if len(hubIDs) == 0 {
		return fmt.Errorf("no hubs available to attach posts to")
	}

	// --- 7. Create 20 posts across hubs ---
	log.Info().Msg("creating posts")
	postRepo := models.NewPlatformPostRepository(pool)

	for i := 0; i < 20; i++ {
		hubID := hubIDs[rng.Intn(len(hubIDs))]
		authorID := userIDs[rng.Intn(len(userIDs))]
		title := postTitles[i%len(postTitles)]
		body := fmt.Sprintf("This is seed post #%d. %s", i+1, messageContents[rng.Intn(len(messageContents))])

		post := &models.PlatformPost{
			AuthorID: authorID,
			HubID:    &hubID,
			Title:    title,
			Body:     &body,
		}
		if err := postRepo.Create(ctx, post); err != nil {
			return fmt.Errorf("create post %d: %w", i, err)
		}
		log.Info().Int("post_id", post.ID).Str("title", title).Msg("created post")
	}

	return nil
}

// createGroupConversation inserts a group conversation and its participants directly.
func createGroupConversation(ctx context.Context, pool *pgxpool.Pool, creatorID int, otherIDs []int, name string) (int, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // deferred rollback error is intentionally discarded; tx commit outcome takes precedence

	var convID int
	err = tx.QueryRow(ctx, `
		INSERT INTO conversations
			(conversation_type, is_group, group_name, created_by, max_participants, last_message_at)
		VALUES
			('group', TRUE, $1, $2, 250, CURRENT_TIMESTAMP)
		RETURNING id
	`, name, creatorID).Scan(&convID)
	if err != nil {
		return 0, fmt.Errorf("insert conversation: %w", err)
	}

	// Insert creator as owner
	_, err = tx.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
		VALUES ($1, $2, 'owner', CURRENT_TIMESTAMP)
	`, convID, creatorID)
	if err != nil {
		return 0, fmt.Errorf("insert creator participant: %w", err)
	}

	// Insert other members as members
	for _, uid := range otherIDs {
		_, err = tx.Exec(ctx, `
			INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at, invited_by)
			VALUES ($1, $2, 'member', CURRENT_TIMESTAMP, $3)
		`, convID, uid, creatorID)
		if err != nil {
			return 0, fmt.Errorf("insert participant %d: %w", uid, err)
		}
	}

	// Insert default group settings
	_, err = tx.Exec(ctx, `
		INSERT INTO group_settings (conversation_id, anyone_can_invite, anyone_can_pin, message_history_visible)
		VALUES ($1, FALSE, FALSE, TRUE)
	`, convID)
	if err != nil {
		return 0, fmt.Errorf("insert group settings: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return convID, nil
}

// getConversationMembers returns the member user IDs for a conversation.
// For DMs it uses the conversation's user1_id/user2_id; for groups it queries conversation_participants.
func getConversationMembers(ctx context.Context, pool *pgxpool.Pool, convID int, fallback []int) ([]int, error) {
	rows, err := pool.Query(ctx, `
		SELECT user_id FROM conversation_participants WHERE conversation_id = $1
	`, convID)
	if err != nil {
		return nil, fmt.Errorf("query participants: %w", err)
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}

	// DM conversations store members in conversations.user1_id / user2_id
	if len(ids) == 0 {
		row := pool.QueryRow(ctx, `SELECT user1_id, user2_id FROM conversations WHERE id = $1`, convID)
		var u1, u2 *int
		if err := row.Scan(&u1, &u2); err == nil && u1 != nil && u2 != nil {
			ids = []int{*u1, *u2}
		}
	}

	if len(ids) == 0 {
		// Last resort: pick two from fallback
		if len(fallback) >= 2 {
			ids = fallback[:2]
		}
	}

	return ids, nil
}

// pickN returns up to n randomly selected unique elements from src.
func pickN(src []int, n int, rng *rand.Rand) []int {
	if n >= len(src) {
		out := make([]int, len(src))
		copy(out, src)
		return out
	}
	perm := rng.Perm(len(src))
	out := make([]int, n)
	for i := 0; i < n; i++ {
		out[i] = src[perm[i]]
	}
	return out
}
