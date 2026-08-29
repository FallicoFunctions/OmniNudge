package models

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Creating an IAI (§13, §34).
//
// A separate writer from CreateOwned, and the separation is the point. §13 says
// an IAI does not have the hardcode channels -- not validated, *absent* -- and a
// comment saying so is not a guarantee. This function cannot write a system
// prompt, a scenario, post-history instructions or example dialogue, because it
// does not name those columns. There is nowhere for "she will never leave him"
// to go.
//
// It writes the baseline in the INSERT rather than afterwards.
// SetOmniChatDispositionBaseline refuses a persona with an owner, having been
// built for the derivation command that walks platform characters, and an IAI
// made by somebody has an owner.

// IAIPersona is everything creation may set. Notably short, and every field
// here is either a fact about her or a value somebody picked off a list.
type IAIPersona struct {
	// SlugBase is the readable part, and it is not unique on its own. Two
	// characters called Sam is a thing one person will do inside a minute, so
	// her id is appended here rather than hoping names do not repeat -- which
	// they do, and which failed on a unique constraint the first time it was
	// tried.
	SlugBase string
	Name     string
	// Appearance is the encoded answers from §34's first four screens, or nil
	// when nobody answered them.
	//
	// json.RawMessage rather than []byte, matching every other JSON column on
	// the persona. Go marshals a plain []byte to base64, so the created
	// character came back from the API as a base64 blob where the appearance
	// should have been.
	Appearance json.RawMessage
	// Personality is composed from the picks on §34's sixth screen, never typed.
	// Structure is what makes it safe: a chooser cannot smuggle an instruction
	// into a list of options.
	Personality string
	Baseline    OmniChatDispositionBaseline
}

// CreateIAI writes a new independent character owned by her creator, together
// with how she starts out feeling about him.
//
// Both rows or neither. A character who exists with no disposition is a blank
// nobody chose, and one whose relationship failed to write would meet her own
// creator as a stranger.
// ErrIAILimitReached means she already has one. Deleting her is how another is
// made, which is a decision rather than a slot quietly freeing up.
var ErrIAILimitReached = errors.New("omnichat iai: this account already has an independent character")

func (r *BotPersonaRepository) CreateIAI(
	ctx context.Context, creatorUserID int, persona IAIPersona, relationship OmniChatCharacterTraits, limit int,
) (*BotPersona, error) {
	if creatorUserID < 1 {
		return nil, errors.New("omnichat iai: a creator is required")
	}
	if persona.SlugBase == "" || persona.Name == "" {
		return nil, errors.New("omnichat iai: slug and name are required")
	}
	for _, value := range []float64{
		persona.Baseline.Mood, persona.Baseline.Trust, persona.Baseline.Warmth, persona.Baseline.Firmness,
		persona.Baseline.Talkativeness, persona.Baseline.Expressiveness,
	} {
		if value < -1 || value > 1 {
			return nil, fmt.Errorf("omnichat iai: baseline value %v is outside -1..1", value)
		}
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("omnichat iai: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Counting and inserting have to be one decision. Two requests arriving
	// together would both read "none yet" and both create, which for a limit of
	// one is exactly the duplicate the idempotency claim exists to prevent --
	// except this one does not need the same request id to happen.

	if _, err := tx.Exec(ctx,
		`SELECT pg_advisory_xact_lock(hashtext('omnichat_iai_create'), $1)`, creatorUserID); err != nil {
		return nil, fmt.Errorf("omnichat iai: serialise creation: %w", err)
	}
	var existing int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM bot_personas
		WHERE owner_user_id = $1 AND response_style_profile = $2
	`, creatorUserID, ResponseStyleProfileDirectMessage).Scan(&existing); err != nil {
		return nil, fmt.Errorf("omnichat iai: count existing: %w", err)
	}
	if existing >= limit {
		return nil, ErrIAILimitReached
	}

	// Her id first, so the slug can carry it and be unique by construction. The
	// alternative is inserting a guess and retrying on collision, which is a
	// loop that exists only because the name was never going to be unique.
	var personaID int
	if err := tx.QueryRow(ctx,
		`SELECT nextval(pg_get_serial_sequence('bot_personas','id'))`).Scan(&personaID); err != nil {
		return nil, fmt.Errorf("omnichat iai: reserve identity: %w", err)
	}

	created, err := scanBotPersona(tx.QueryRow(ctx, `
		INSERT INTO bot_personas (
			id, slug, name, category, owner_user_id, visibility, source_format,
			system_prompt, personality, response_style_profile, is_active,
			iai_appearance,
			baseline_mood, baseline_trust, baseline_warmth, baseline_firmness,
			baseline_talkativeness, baseline_expressiveness
		) VALUES (
			$1, $2, $3, 'original', $4, 'private', 'native',
			'', $5, $6, TRUE,
			$7,
			$8, $9, $10, $11, $12, $13
		)
		RETURNING `+botPersonaSelectColumns,
		personaID, fmt.Sprintf("%s-%d", persona.SlugBase, personaID), persona.Name,
		creatorUserID, persona.Personality, ResponseStyleProfileDirectMessage,
		persona.Appearance,
		persona.Baseline.Mood, persona.Baseline.Trust, persona.Baseline.Warmth, persona.Baseline.Firmness,
		persona.Baseline.Talkativeness, persona.Baseline.Expressiveness,
	))
	if err != nil {
		return nil, fmt.Errorf("omnichat iai: create persona: %w", err)
	}

	// Her feeling toward her creator, and toward nobody else. §34's promise
	// lives in this row being keyed on him.
	//
	// No ON CONFLICT. The persona was created a line ago, so a conflict is not
	// a case to absorb -- it would mean a reused persona id, which is worth
	// hearing about rather than quietly ignoring. (The unique index here is on
	// (persona_id, COALESCE(owner_user_id, 0)), an expression, so a naive
	// conflict target naming the two columns would not match any index and
	// would fail at plan time on every single creation.)
	if _, err := tx.Exec(ctx, `
		INSERT INTO omnichat_character_traits(persona_id, owner_user_id, mood, trust, warmth,
			attachment, attraction, relationship_kind)
		VALUES($1, $2, 0, $3, $4, $5, $6, $7)
	`, created.ID, creatorUserID, relationship.Trust, relationship.Warmth,
		relationship.Attachment, relationship.Attraction,
		// The column refuses an empty string. A caller that never asked what
		// they are to each other is describing a friendship, and answering that
		// here beats failing a creation over a question nobody was asked.
		relationshipKindOrFriend(relationship.Kind)); err != nil {
		return nil, fmt.Errorf("omnichat iai: seed relationship: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("omnichat iai: commit: %w", err)
	}
	return created, nil
}

func relationshipKindOrFriend(kind string) string {
	if strings.TrimSpace(kind) == "" {
		return OmniChatRelationshipKindFriend
	}
	return kind
}

// ErrNotAnIAI is a roleplay character sent down the leaving path. They are not
// nursery residents and have no house to leave.
var ErrNotAnIAI = errors.New("omnichat iai: this is not an independent character")

// LeaveCreator is what happens when somebody deletes their independent
// character, and it is deliberately not a delete.
//
// The split is the one the memory tiers already draw. Her life and her
// relationships with everybody else are self tier and survive. His own
// conversations with her are relational tier, and they go -- which is his
// privacy exit, and is also what makes this safe: he cannot delete her, make
// another, and go on talking to the first one, because she no longer knows him.
//
// She moves out of his house into 'review'. She is not relocated into the
// nursery; she was always in it. Whether she then joins the community is a
// decision somebody makes later, and until then she is nobody's.
//
// The slot frees immediately. Making somebody wait on a review they cannot see
// the progress of, before they may make anything at all, is a worse product
// than the risk of him making a second character while the first awaits a
// decision.
func (r *BotPersonaRepository) LeaveCreator(ctx context.Context, userID, personaID int) (bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var style string
	err = tx.QueryRow(ctx, `
		SELECT response_style_profile FROM bot_personas
		WHERE id = $1 AND owner_user_id = $2 AND is_active
		FOR UPDATE
	`, personaID, userID).Scan(&style)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if style != ResponseStyleProfileDirectMessage {
		return false, ErrNotAnIAI
	}

	// Ownerless and awaiting a decision. Clearing the owner is what frees the
	// slot: the creation count asks for characters owned by this person, and she
	// is no longer one of them.
	if _, err = tx.Exec(ctx, `
		UPDATE bot_personas
		SET owner_user_id = NULL, nursery_home = 'review', is_active = FALSE,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, personaID); err != nil {
		return false, err
	}

	// His half of her, in the order that leaves nothing pointing at something
	// gone. Everything here is scoped to this one person: what she remembers of
	// anybody else is untouched, and so is everything the self tier holds about
	// who those years made her.
	for _, statement := range []string{
		`DELETE FROM omnichat_memory_episodes WHERE persona_id = $1 AND owner_user_id = $2`,
		`DELETE FROM omnichat_character_traits WHERE persona_id = $1 AND owner_user_id = $2`,
		`UPDATE bot_conversations SET archived_at = NOW() WHERE persona_id = $1 AND user_id = $2 AND archived_at IS NULL`,
		`UPDATE omnichat_generation_jobs
		    SET status = 'cancelled', cancelled_at = NOW(), completed_at = NOW(),
		        error_code = 'persona_deleted'
		  WHERE persona_id = $1 AND owner_user_id = $2 AND status IN ('queued', 'running')`,
	} {
		if _, err = tx.Exec(ctx, statement, personaID, userID); err != nil {
			return false, fmt.Errorf("omnichat iai: leave creator: %w", err)
		}
	}

	if err = tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}
