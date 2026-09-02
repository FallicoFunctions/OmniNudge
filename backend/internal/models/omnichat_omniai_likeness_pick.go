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
// forward-facing full body of her that anybody chose. Nothing is regenerated
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

	// The whole open choice is locked, in id order, before anything moves.
	//
	// Locking only the chosen row was enough for one caller and deadlocked two:
	// each transaction held its own candidate and then reached for the files
	// behind the others, which is a lock-order inversion, and Postgres broke the
	// cycle by killing one with SQLSTATE 40P01. A double-click is the ordinary
	// way to produce that, and a deadlock reaches somebody as a server error
	// rather than as "that choice is already made".
	//
	// Taking every row gives the second caller nothing to invert: it waits on
	// the set the first is holding, and once that commits it finds no choice
	// open. Proved by restoring the single-row lock, which brings the deadlock
	// straight back.
	//
	// ORDER BY is belt and braces rather than the fix -- removing it does not
	// reproduce the deadlock, because both callers scan the same small set the
	// same way. It stays because "the same order every time" is what makes a
	// cycle impossible rather than merely unobserved, and a plan change should
	// not be able to reintroduce this.
	rows, err := tx.Query(ctx, `
		SELECT c.id, c.generation_job_id, c.media_file_id, mf.storage_url
		FROM omnichat_omniai_likeness_candidates c
		JOIN media_files mf ON mf.id = c.media_file_id
		WHERE c.persona_id = $1 AND c.owner_user_id = $2
		ORDER BY c.id
		FOR UPDATE OF c
	`, personaID, ownerUserID)
	if err != nil {
		return nil, err
	}

	var jobID uuid.UUID
	var mediaFileID int
	var storageURL string
	found := false
	for rows.Next() {
		var id int64
		var candidateJob uuid.UUID
		var candidateFile int
		var candidateURL string
		if err := rows.Scan(&id, &candidateJob, &candidateFile, &candidateURL); err != nil {
			rows.Close()
			return nil, err
		}
		if id == candidateID {
			jobID, mediaFileID, storageURL, found = candidateJob, candidateFile, candidateURL, true
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if !found {
		return nil, ErrLikenessCandidateNotFound
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
	// Carried back so the caller can condition the supporting renders on the
	// picture that was actually chosen, without reading it again.
	asset.StorageURL = storageURL
	asset.Kind, asset.Visibility = OmniChatMediaKindImage, OmniChatAssetVisibilityPrivate

	// She wears it, and it becomes what every later render is conditioned on.
	// The private reference list lives in extensions_json, which never reaches
	// a browser -- unlike gallery_urls, serialized on every persona response.
	if err := adoptLikenessReference(ctx, tx, personaID, ownerUserID, storageURL); err != nil {
		return nil, err
	}

	// The three nobody picked. Removing the file is the whole discard: the
	// candidate rows cascade with it, and the deletion outbox hands each stored
	// object to the retention worker. The picked file is safe from this by the
	// asset's own RESTRICT.
	if _, err := tx.Exec(ctx, `
		DELETE FROM media_files
		WHERE id IN (
			SELECT media_file_id FROM omnichat_omniai_likeness_candidates
			WHERE persona_id = $1 AND owner_user_id = $2 AND id <> $3
		)
	`, personaID, ownerUserID, candidateID); err != nil {
		return nil, fmt.Errorf("omnichat likeness: discard the rest: %w", err)
	}

	// Any reference still rendering was made for a face nobody kept.
	//
	// Choosing again -- which is what a re-roll is -- otherwise lets those land
	// afterwards and append to the new anchor's list, so she would be
	// conditioned on one picture of the person somebody chose and several of
	// somebody else. Measured before this existed: the stale reference stored
	// without error and without complaint.
	//
	// Cancelling closes both halves. A queued job never runs, and one already
	// running cannot attach, because storing a reference requires the job to
	// still be running and this is what stops it being.
	if _, err := tx.Exec(ctx, `
		UPDATE omnichat_generation_jobs
		   SET status = 'cancelled', cancelled_at = NOW(), completed_at = NOW(),
		       error_code = 'likeness_rechosen'
		 WHERE persona_id = $1 AND owner_user_id = $2
		   AND mode = $3 AND status IN ('queued', 'running')
	`, personaID, ownerUserID, string(OmniChatGenerationModeLikenessReference)); err != nil {
		return nil, fmt.Errorf("omnichat likeness: retire the previous references: %w", err)
	}

	// The choice is closed, so the row describing it goes too. A chosen
	// candidate is not a candidate.
	if _, err := tx.Exec(ctx,
		`DELETE FROM omnichat_omniai_likeness_candidates WHERE id = $1`, candidateID); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return asset, nil
}

// discardReplacedReferences removes the pictures a new choice just orphaned.
//
// A supporting reference is held by nothing but the identity list -- no asset
// row, no foreign key -- and nothing sweeps unreferenced media files. Dropping
// the list without this stranded five images in storage per re-roll, paid for
// and unreachable forever.
//
// Files that somebody owns are left alone. The previous anchor is in this list
// too, and it has a gallery asset: it is a picture they chose and can still
// see, and its foreign key would refuse the delete anyway. The same clause
// protects the anchor being adopted right now, whose asset was written moments
// earlier in this transaction.
func discardReplacedReferences(ctx context.Context, tx pgx.Tx, ownerUserID int, dropped []string) error {
	if len(dropped) == 0 {
		return nil
	}
	if _, err := tx.Exec(ctx, `
		DELETE FROM media_files mf
		 WHERE mf.storage_url = ANY($1)
		   AND mf.user_id = $2
		   AND NOT EXISTS (
		       SELECT 1 FROM omnichat_media_assets a WHERE a.media_file_id = mf.id
		   )
	`, dropped, ownerUserID); err != nil {
		return fmt.Errorf("omnichat likeness: discard the replaced references: %w", err)
	}
	return nil
}

// lockIdentityProfile reads her identity for update, and hands back the blob it
// came from so the rest of it survives being written again.
//
// Locked because the five supporting references land independently, and this is
// a read-modify-write: two workers finishing together would otherwise each read
// the same list, append their own, and one would be lost.
//
// In practice they are already serialized before reaching here -- the storage
// quota check takes a row lock on the owner, and all five share one owner -- so
// removing this lock does not reproduce the loss, and a test cannot tell the
// two apart. It stays because the invariant belongs to this row, not to an
// incidental side effect of counting somebody's storage.
func lockIdentityProfile(
	ctx context.Context, tx pgx.Tx, personaID int,
) (OmniChatMediaIdentityProfile, map[string]json.RawMessage, error) {
	var extensions []byte
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(extensions_json, '{}'::jsonb) FROM bot_personas WHERE id = $1 FOR UPDATE`,
		personaID).Scan(&extensions); err != nil {
		return OmniChatMediaIdentityProfile{}, nil, err
	}

	var blob map[string]json.RawMessage
	if err := json.Unmarshal(extensions, &blob); err != nil {
		return OmniChatMediaIdentityProfile{}, nil, fmt.Errorf("omnichat likeness: read her identity: %w", err)
	}
	if blob == nil {
		blob = map[string]json.RawMessage{}
	}

	profile := OmniChatMediaIdentityProfile{}
	if raw, found := blob["omnichat_media"]; found {
		if err := json.Unmarshal(raw, &profile); err != nil {
			return OmniChatMediaIdentityProfile{}, nil, fmt.Errorf("omnichat likeness: read her identity profile: %w", err)
		}
	}
	return profile, blob, nil
}

// writeIdentityProfile puts the profile back without disturbing anything else
// the extensions blob holds.
func writeIdentityProfile(
	ctx context.Context, tx pgx.Tx, personaID int,
	profile OmniChatMediaIdentityProfile, blob map[string]json.RawMessage,
) error {
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
		   SET extensions_json = $2, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $1
	`, personaID, merged); err != nil {
		return fmt.Errorf("omnichat likeness: write her identity: %w", err)
	}
	return nil
}

// adoptLikenessReference points her at the picture and records it as the first
// identity reference renders condition on.
func adoptLikenessReference(
	ctx context.Context, tx pgx.Tx, personaID, ownerUserID int, storageURL string,
) error {
	profile, blob, err := lockIdentityProfile(ctx, tx, personaID)
	if err != nil {
		return err
	}
	dropped := profile.ReferenceURLs

	// First and only. A pick replaces whatever was there rather than appending:
	// these references are what she looks like, and pictures made for a choice
	// somebody has since remade are not. The five supporting ones are rendered
	// after this and append to it.
	profile.ReferenceURLs = []string{storageURL}
	if err := discardReplacedReferences(ctx, tx, ownerUserID, dropped); err != nil {
		return err
	}
	if err := writeIdentityProfile(ctx, tx, personaID, profile, blob); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE bot_personas
		   SET avatar_url = $2, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $1
	`, personaID, storageURL); err != nil {
		return fmt.Errorf("omnichat likeness: give her the picture: %w", err)
	}
	return nil
}
