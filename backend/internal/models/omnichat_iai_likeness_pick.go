package models

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ErrLikenessCandidateNotFound is a pick that names nothing open: already
// chosen, never hers, or somebody else's character.
var ErrLikenessCandidateNotFound = errors.New("omnichat likeness: no such candidate is awaiting a choice")

// PickLikeness settles which of the four she looks like.
//
// One transaction, because the three outcomes have to hold together: she wears
// it, the creator owns it, and the other three stop existing. A half-applied
// pick would leave a character whose face is a picture nobody can see, or three
// discarded renders occupying storage nobody will ever look at.
//
// The picked file becomes three things at once -- her avatar, a private
// identity reference every later render is conditioned on, and the single
// forward-facing full body the 2D-to-3D pipeline takes. Nothing is regenerated
// to produce any of them, which is what makes them incapable of disagreeing
// about who she is.
func (r *OmniChatMediaRepository) PickLikeness(
	ctx context.Context, personaID, ownerUserID int, candidateID int64,
) (*OmniChatMediaAsset, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var jobID uuid.UUID
	var mediaFileID int
	var storageURL string
	err = tx.QueryRow(ctx, `
		SELECT c.generation_job_id, c.media_file_id, mf.storage_url
		FROM omnichat_iai_likeness_candidates c
		JOIN media_files mf ON mf.id = c.media_file_id
		WHERE c.id = $1 AND c.persona_id = $2 AND c.owner_user_id = $3
		FOR UPDATE OF c
	`, candidateID, personaID, ownerUserID).Scan(&jobID, &mediaFileID, &storageURL)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrLikenessCandidateNotFound
	}
	if err != nil {
		return nil, err
	}

	asset := &OmniChatMediaAsset{ID: uuid.New()}
	if err := tx.QueryRow(ctx, `
		INSERT INTO omnichat_media_assets (
			id, owner_user_id, persona_id, generation_job_id, media_file_id,
			kind, visibility, prompt, scene_snapshot, safety_status
		)
		SELECT $1, $2, $3, j.id, $4, 'image', 'private', j.prompt, '{}'::jsonb, 'approved'
		FROM omnichat_generation_jobs j
		WHERE j.id = $5
		RETURNING created_at
	`, asset.ID, ownerUserID, personaID, mediaFileID, jobID).Scan(&asset.CreatedAt); err != nil {
		return nil, fmt.Errorf("omnichat likeness: record the chosen picture: %w", err)
	}
	asset.OwnerUserID, asset.PersonaID, asset.MediaFileID = ownerUserID, personaID, mediaFileID
	asset.Kind, asset.Visibility = OmniChatMediaKindImage, OmniChatAssetVisibilityPrivate

	// She wears it, and it becomes what every later render is conditioned on.
	// The private reference list lives in extensions_json, which never reaches
	// a browser -- unlike gallery_urls, serialized on every persona response.
	if err := adoptLikenessReference(ctx, tx, personaID, storageURL); err != nil {
		return nil, err
	}

	// The three nobody picked. Removing the file is the whole discard: the
	// candidate rows cascade with it, and the deletion outbox hands each stored
	// object to the retention worker. The picked file is safe from this by the
	// asset's own RESTRICT.
	if _, err := tx.Exec(ctx, `
		DELETE FROM media_files
		WHERE id IN (
			SELECT media_file_id FROM omnichat_iai_likeness_candidates
			WHERE persona_id = $1 AND owner_user_id = $2 AND id <> $3
		)
	`, personaID, ownerUserID, candidateID); err != nil {
		return nil, fmt.Errorf("omnichat likeness: discard the rest: %w", err)
	}

	// The choice is closed, so the row describing it goes too. A chosen
	// candidate is not a candidate.
	if _, err := tx.Exec(ctx,
		`DELETE FROM omnichat_iai_likeness_candidates WHERE id = $1`, candidateID); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return asset, nil
}

// adoptLikenessReference points her at the picture and records it as the
// identity reference renders condition on.
func adoptLikenessReference(ctx context.Context, tx pgx.Tx, personaID int, storageURL string) error {
	var extensions []byte
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(extensions_json, '{}'::jsonb) FROM bot_personas WHERE id = $1 FOR UPDATE`,
		personaID).Scan(&extensions); err != nil {
		return err
	}

	var blob map[string]json.RawMessage
	if err := json.Unmarshal(extensions, &blob); err != nil {
		return fmt.Errorf("omnichat likeness: read her identity: %w", err)
	}
	if blob == nil {
		blob = map[string]json.RawMessage{}
	}

	profile := OmniChatMediaIdentityProfile{}
	if raw, found := blob["omnichat_media"]; found {
		if err := json.Unmarshal(raw, &profile); err != nil {
			return fmt.Errorf("omnichat likeness: read her identity profile: %w", err)
		}
	}
	// First and only. A likeness replaces whatever was there rather than
	// appending: these references are what she looks like, and a picture from a
	// choice somebody has since remade is not.
	profile.ReferenceURLs = []string{storageURL}

	encoded, err := json.Marshal(profile)
	if err != nil {
		return fmt.Errorf("omnichat likeness: write her identity profile: %w", err)
	}
	blob["omnichat_media"] = encoded
	merged, err := json.Marshal(blob)
	if err != nil {
		return fmt.Errorf("omnichat likeness: write her identity: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE bot_personas
		   SET avatar_url = $2, extensions_json = $3, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $1
	`, personaID, storageURL, merged); err != nil {
		return fmt.Errorf("omnichat likeness: give her the picture: %w", err)
	}
	return nil
}
