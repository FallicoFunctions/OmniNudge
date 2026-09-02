package models

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// ErrLikenessAlreadyChosen refuses a second set of faces to a character who
// already has one.
//
// The picked face is her avatar, the reference every later render is
// conditioned on, and the single input the 2D-to-3D pipeline takes. Drawing her
// again after that does not offer a new choice; it changes who she is, for
// somebody who is already talking to her. Deleting her is how you start again,
// which is deliberately a decision rather than a button.
var ErrLikenessAlreadyChosen = errors.New("omnichat likeness: her face has already been chosen")

// DiscardLikenessCandidates clears an open choice so another set can be asked
// for, and reports how many pictures it removed.
//
// The old four go rather than accumulate. A choice between four is a decision
// somebody can make; a choice between twelve is a gallery, and every picture
// nobody picks is storage the account is charged for and can never see again.
//
// Deleting the media_files row is what frees the object. The retention worker
// is fed by a trigger on that table, so removing the candidate row alone would
// drop the only reference to a file nothing ever sweeps.
func (r *OmniChatMediaRepository) DiscardLikenessCandidates(
	ctx context.Context, personaID, ownerUserID int,
) (int, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Asked of the identity reference list rather than of avatar_url alone.
	//
	// avatar_url is writable through UpdateMedia and its storage_url is not one
	// shape, so an ordinary edit could silently disarm this and let a character
	// somebody is already talking to be redrawn. The reference list is written
	// by the pick and by nothing else. Both are asked, because the list is
	// empty for a moment between the pick committing and its first supporting
	// render landing.
	var chosen bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM bot_personas p
			WHERE p.id = $1 AND p.owner_user_id = $2
			  AND (
			    COALESCE(p.extensions_json #> '{omnichat_media,reference_urls}', '[]'::jsonb) <> '[]'::jsonb
			    OR EXISTS (
			      SELECT 1 FROM omnichat_media_assets a
			      JOIN media_files mf ON mf.id = a.media_file_id
			      WHERE a.persona_id = p.id AND p.avatar_url = mf.storage_url
			    )
			  )
		)
	`, personaID, ownerUserID).Scan(&chosen); err != nil {
		return 0, fmt.Errorf("omnichat likeness: check whether she has been drawn: %w", err)
	}
	if chosen {
		return 0, ErrLikenessAlreadyChosen
	}

	// A queued job never runs, and a running one cannot attach, because storing
	// a candidate requires the job to still be running. Without this, a render
	// from the discarded set lands among the new four.
	if _, err := tx.Exec(ctx, `
		UPDATE omnichat_generation_jobs
		   SET status = 'cancelled', cancelled_at = NOW(), completed_at = NOW(),
		       error_code = 'likeness_rerolled'
		 WHERE persona_id = $1 AND owner_user_id = $2
		   AND mode = $3 AND status IN ('queued', 'running')
	`, personaID, ownerUserID, string(OmniChatGenerationModeLikeness)); err != nil {
		return 0, fmt.Errorf("omnichat likeness: retire the open renders: %w", err)
	}

	rows, err := tx.Query(ctx, `
		DELETE FROM omnichat_omniai_likeness_candidates
		 WHERE persona_id = $1 AND owner_user_id = $2
		RETURNING media_file_id
	`, personaID, ownerUserID)
	if err != nil {
		return 0, fmt.Errorf("omnichat likeness: clear the open choice: %w", err)
	}
	var mediaFileIDs []int
	for rows.Next() {
		var id int
		if scanErr := rows.Scan(&id); scanErr != nil {
			rows.Close()
			return 0, scanErr
		}
		mediaFileIDs = append(mediaFileIDs, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	if len(mediaFileIDs) > 0 {
		if _, err := tx.Exec(ctx,
			`DELETE FROM media_files WHERE id = ANY($1) AND user_id = $2`,
			mediaFileIDs, ownerUserID); err != nil {
			return 0, fmt.Errorf("omnichat likeness: discard the pictures nobody chose: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(mediaFileIDs), nil
}
