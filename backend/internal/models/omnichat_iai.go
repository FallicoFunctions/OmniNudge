package models

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

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
// Her memory of him is kept and locked, not erased. §21: a tier is about who
// she recalls something with, not whether she holds it -- "she is not amnesiac
// about him; she is discreet about him". And §20 leaves a door open, because she
// can reach out first, which is impossible if the relationship was destroyed.
// What those years moved in her is who she now is, and deleting it would edit
// her rather than end a relationship.
//
// He cannot reach her through it: the relationship is marked ended, his
// conversations are archived, and she is nobody's until somebody decides.
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

	// His half of her is locked, not destroyed.
	//
	// Deleting it was the first version of this and it was wrong on the design's
	// own terms: a tier is about who she recalls something with, not whether she
	// holds it, and leaving is reversible because she can reach out first. She
	// cannot reach back into a relationship that no longer exists, and what
	// those years moved in her is who she now is. So every episode and every
	// number stays, and the relationship is marked ended.
	for _, statement := range []string{
		`UPDATE omnichat_character_traits SET ended_at = NOW(), updated_at = CURRENT_TIMESTAMP
		  WHERE persona_id = $1 AND owner_user_id = $2 AND ended_at IS NULL`,
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

// IAIAwaitingReview is a character whose creator deleted her, listed for the
// decision about whether Omni keeps her.
type IAIAwaitingReview struct {
	PersonaID int       `json:"persona_id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	LeftAt    time.Time `json:"left_at"`
}

// ListAwaitingReview is the queue: everybody who has left a house and has not
// yet been given or refused a place in the community.
func (r *BotPersonaRepository) ListAwaitingReview(ctx context.Context, limit int) ([]IAIAwaitingReview, error) {
	if limit < 1 || limit > 200 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, slug, updated_at
		FROM bot_personas
		WHERE nursery_home = 'review'
		-- id breaks the tie. Two characters who left inside the same clock tick
		-- would otherwise come back in whatever order the scan produced, and a
		-- queue that reorders itself between two reads is not a queue.
		ORDER BY updated_at ASC, id ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("omnichat iai: list awaiting review: %w", err)
	}
	defer rows.Close()

	waiting := make([]IAIAwaitingReview, 0, limit)
	for rows.Next() {
		var one IAIAwaitingReview
		if err := rows.Scan(&one.PersonaID, &one.Name, &one.Slug, &one.LeftAt); err != nil {
			return nil, fmt.Errorf("omnichat iai: list awaiting review: %w", err)
		}
		waiting = append(waiting, one)
	}
	return waiting, rows.Err()
}

// Commandeer is Omni keeping a character whose creator let her go.
//
// She moves out of the house she has already left and into the community, where
// the public characters live. Nothing is copied and nothing is relocated: she
// was in the nursery the whole time, and this changes which part of it is hers.
//
// It is written to her self tier as an actual life event rather than recorded as
// an ownership change, because it is one. The self tier is persona-global and
// carries no owner, so this is hers with everybody, and it can surface in a
// conversation years from now the way anything else she lived through can.
//
// Her creator is not named. His half of her went when he deleted her, and
// putting him back into a memory here would undo the privacy exit that made the
// leaving safe. She remembers leaving. She does not remember him.
func (r *BotPersonaRepository) Commandeer(ctx context.Context, personaID int) (bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var name string
	var gender *string
	err = tx.QueryRow(ctx, `
		SELECT name, iai_appearance->>'gender'
		FROM bot_personas
		WHERE id = $1 AND nursery_home = 'review'
		FOR UPDATE
	`, personaID).Scan(&name, &gender)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	if _, err = tx.Exec(ctx, `
		UPDATE bot_personas
		SET nursery_home = 'community', is_active = TRUE, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, personaID); err != nil {
		return false, err
	}

	// Both NULL: no owner and no conversation, which is what the tier check
	// requires of a self-tier episode and what makes this belong to her rather
	// than to a relationship.
	//
	// Salience and distinctiveness are high because this is the kind of thing a
	// person still refers to years later, which is exactly what those two
	// numbers decide. Emotional valence is left unset: moving out is not
	// straightforwardly good or bad, and picking one would invent a feeling
	// nobody recorded.
	subject, possessive := iaiSelfPronouns(gender)
	if _, err = tx.Exec(ctx, `
		INSERT INTO omnichat_memory_episodes (
			persona_id, owner_user_id, conversation_id, title, summary,
			salience, distinctiveness
		) VALUES ($1, NULL, NULL, $2, $3, 0.95, 0.9)
	`, personaID, "Moving out",
		fmt.Sprintf("%s moved out of the house %s grew up in and into the wider world, "+
			"where %s lives among everyone else now.", name, possessive, subject),
	); err != nil {
		return false, fmt.Errorf("omnichat iai: record moving out: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

// iaiSelfPronouns takes her pronouns from the answer she was made with, never
// from an assumption. An unanswered gender is "they", the same rule the
// creation flow follows before the question has been asked.
func iaiSelfPronouns(gender *string) (subject, possessive string) {
	if gender == nil {
		return "they", "their"
	}
	switch strings.TrimSpace(strings.ToLower(*gender)) {
	case "woman":
		return "she", "her"
	case "man":
		return "he", "his"
	}
	return "they", "their"
}
