package models

import (
	"context"
	"errors"
	"fmt"
)

// ListPlatformPersonasForBaseline returns the platform's own characters in the
// order they were created, for a derivation pass to read.
//
// Platform characters only. A user's imported card is theirs, and spending a
// model call on every card anyone ever uploaded is a bill that grows with the
// catalogue rather than with the cast we wrote.
//
// includeDerived is what --force reads: normally a character that already has a
// baseline is skipped here rather than derived and discarded at the write, so a
// re-run of the command costs nothing at all.
func (r *BotPersonaRepository) ListPlatformPersonasForBaseline(ctx context.Context, includeDerived bool, limit int) ([]*BotPersona, error) {
	if limit < 1 || limit > maxPersonaListSize {
		limit = maxPersonaListSize
	}
	query := `
		SELECT ` + botPersonaSelectColumns + `
		FROM bot_personas
		WHERE owner_user_id IS NULL AND is_active
	`
	if !includeDerived {
		query += " AND baseline_mood IS NULL"
	}
	query += " ORDER BY id LIMIT $1"

	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	personas := []*BotPersona{}
	for rows.Next() {
		persona, err := scanBotPersona(rows)
		if err != nil {
			return nil, err
		}
		personas = append(personas, persona)
	}
	return personas, rows.Err()
}

// SetOmniChatDispositionBaseline stores a derived baseline and reports whether
// it was written.
//
// Idempotence lives in the predicate rather than in the caller: without force,
// a persona that already has a baseline is not updated and false comes back, so
// two derivation runs racing each other cannot produce a character whose
// authored disposition depends on which finished last.
//
// It never touches the traits row. The two are separate for exactly this
// reason: re-deriving a baseline from an edited card must leave whatever has
// happened to the character since entirely alone.
func (r *BotPersonaRepository) SetOmniChatDispositionBaseline(ctx context.Context, personaID int, baseline OmniChatDispositionBaseline, force bool) (bool, error) {
	if personaID < 1 {
		return false, errors.New("omnichat baseline: persona is required")
	}
	// The database checks this too. It is checked here as well because a value
	// out of range means the derivation misread its own contract, and the
	// useful place to find that out is at the call site rather than in a
	// constraint violation three layers down.
	for _, value := range []float64{baseline.Mood, baseline.Trust, baseline.Warmth, baseline.Firmness} {
		if value < -1 || value > 1 {
			return false, fmt.Errorf("omnichat baseline: persona %d: value %v is outside -1..1", personaID, value)
		}
	}

	tag, err := r.pool.Exec(ctx, `
		UPDATE bot_personas
		SET baseline_mood = $2, baseline_trust = $3, baseline_warmth = $4, baseline_firmness = $5
		WHERE id = $1 AND owner_user_id IS NULL
		  AND ($6 OR baseline_mood IS NULL)
	`, personaID, baseline.Mood, baseline.Trust, baseline.Warmth, baseline.Firmness, force)
	if err != nil {
		return false, fmt.Errorf("omnichat baseline: store persona %d: %w", personaID, err)
	}
	return tag.RowsAffected() == 1, nil
}

// LoadOmniChatDispositionBaseline reads one character's authored baseline. It
// exists for the derivation command and for tests; the read paths that matter
// get the baseline alongside the traits they were already reading.
func (r *BotPersonaRepository) LoadOmniChatDispositionBaseline(ctx context.Context, personaID int) (OmniChatDispositionBaseline, error) {
	var mood, trust, warmth, firmness *float64
	if err := r.pool.QueryRow(ctx, `
		SELECT baseline_mood, baseline_trust, baseline_warmth, baseline_firmness
		FROM bot_personas
		WHERE id = $1
	`, personaID).Scan(&mood, &trust, &warmth, &firmness); err != nil {
		return OmniChatDispositionBaseline{}, fmt.Errorf("omnichat baseline: load persona %d: %w", personaID, err)
	}
	return dispositionBaseline(mood, trust, warmth, firmness), nil
}
