package models

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// AttachLikenessReference stores one of the supporting pictures.
//
// Neither a candidate nor a gallery asset. Nobody chooses it and nobody is
// shown it: it exists so the adapter has more than one look at her, and its
// whole life is one entry in the identity profile's reference list.
//
// The list is capped by the profile's own ReferenceLimit rather than by this
// function guessing. Overrunning it would push the anchor -- the picture
// somebody actually chose -- out of a list the renderer mean-pools, and the
// character would drift away from the face they picked.
func (r *OmniChatMediaRepository) AttachLikenessReference(
	ctx context.Context, jobID uuid.UUID, media *MediaFile,
	freeTierBytes, proTierBytes int64, provenance OmniChatGenerationProvenance,
) error {
	if media == nil {
		return errors.New("generated media metadata is required")
	}
	if media.FileSize <= 0 {
		return errors.New("generated media file size must be positive")
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	job, err := lockRunningGenerationJob(ctx, tx, jobID)
	if err != nil {
		return err
	}
	if job.Mode != string(OmniChatGenerationModeLikenessReference) {
		return fmt.Errorf("generation job %s is not a likeness reference", jobID)
	}
	if job.Kind != OmniChatMediaKindImage {
		return fmt.Errorf("generation job %s is not an image", jobID)
	}
	if err := insertGeneratedMediaFile(ctx, tx, job, media, freeTierBytes, proTierBytes); err != nil {
		return err
	}
	if err := appendLikenessReference(ctx, tx, job.PersonaID, media.StorageURL); err != nil {
		return err
	}

	provenanceJSON, err := provenance.encode()
	if err != nil {
		return fmt.Errorf("encode generation provenance: %w", err)
	}
	tag, err := tx.Exec(ctx, `
		UPDATE omnichat_generation_jobs
		   SET status = 'succeeded', completed_at = NOW(), last_activity_at = NOW(),
		       provider_metadata = COALESCE(provider_metadata, '{}'::jsonb)
		                           || jsonb_build_object('source', $2::jsonb)
		 WHERE id = $1 AND status = 'running'
	`, jobID, provenanceJSON)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return errors.New("generation job changed while storing its likeness reference")
	}
	return tx.Commit(ctx)
}

// appendLikenessReference adds one picture to what renders are conditioned on.
//
// The row is locked for the whole transaction because five of these land
// independently: without it two workers finishing together would each read the
// same list, append their own, and one would be lost.
func appendLikenessReference(ctx context.Context, tx pgx.Tx, personaID int, storageURL string) error {
	profile, blob, err := lockIdentityProfile(ctx, tx, personaID)
	if err != nil {
		return err
	}

	for _, existing := range profile.ReferenceURLs {
		if existing == storageURL {
			// A retry that already landed. Appending again would spend one of
			// her six slots on a duplicate.
			return nil
		}
	}

	limit := NormalizeOmniChatMediaIdentityProfile(profile).ReferenceLimit
	if len(profile.ReferenceURLs) >= limit {
		// Full. The anchor is first in this list and must stay: it is the
		// picture somebody chose, and the renderer mean-pools what it is given.
		return nil
	}
	profile.ReferenceURLs = append(profile.ReferenceURLs, storageURL)
	return writeIdentityProfile(ctx, tx, personaID, profile, blob)
}
