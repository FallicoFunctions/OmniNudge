package models

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// OmniChatIAILikenessCandidate is one of the four pictures somebody chooses her
// face from.
//
// It carries the file and nothing about ownership of it, because nobody owns it
// yet. Three of the four are discarded, and only the picked one becomes
// something the creator has.
type OmniChatIAILikenessCandidate struct {
	ID          int64     `json:"id"`
	PersonaID   int       `json:"persona_id"`
	JobID       uuid.UUID `json:"generation_job_id"`
	MediaFileID int       `json:"media_file_id"`
	StorageURL  string    `json:"storage_url"`
	StoragePath string    `json:"-"`
}

// AttachLikenessCandidate stores a finished likeness render.
//
// It deliberately does not reuse CompleteGenerationJob. That writes an asset --
// a claim that the user owns this and can see it in their gallery -- which is
// true of exactly one of the four and only once they have chosen. Writing four
// would put three pictures nobody picked in front of them, and into the
// seventeen queries that read assets, two of which are publications and the
// data export.
//
// The job is marked succeeded here, unlike the two-phase video still: a
// likeness has no second phase, and the render finishing is the whole of it.
func (r *OmniChatMediaRepository) AttachLikenessCandidate(
	ctx context.Context, jobID uuid.UUID, media *MediaFile,
	freeTierBytes, proTierBytes int64, provenance OmniChatGenerationProvenance,
) (*OmniChatIAILikenessCandidate, error) {
	if media == nil {
		return nil, errors.New("generated media metadata is required")
	}
	if media.FileSize <= 0 {
		return nil, errors.New("generated media file size must be positive")
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	job, err := lockRunningGenerationJob(ctx, tx, jobID)
	if err != nil {
		return nil, err
	}
	if job.Mode != string(OmniChatGenerationModeLikeness) {
		// A scene render arriving here would be stored where nobody can see it
		// and silently lost. Refusing says which path was wrong.
		return nil, fmt.Errorf("generation job %s is not a likeness", jobID)
	}
	if err := insertGeneratedMediaFile(ctx, tx, job, media, freeTierBytes, proTierBytes); err != nil {
		return nil, err
	}

	candidate := &OmniChatIAILikenessCandidate{
		PersonaID: job.PersonaID, JobID: jobID, MediaFileID: media.ID,
		StorageURL: media.StorageURL, StoragePath: media.StoragePath,
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO omnichat_iai_likeness_candidates
			(persona_id, owner_user_id, generation_job_id, media_file_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, job.PersonaID, job.OwnerUserID, jobID, media.ID).Scan(&candidate.ID); err != nil {
		return nil, fmt.Errorf("record likeness candidate: %w", err)
	}

	provenanceJSON, err := provenance.encode()
	if err != nil {
		return nil, fmt.Errorf("encode generation provenance: %w", err)
	}
	tag, err := tx.Exec(ctx, `
		UPDATE omnichat_generation_jobs
		   SET status = 'succeeded', completed_at = NOW(), last_activity_at = NOW(),
		       provider_metadata = COALESCE(provider_metadata, '{}'::jsonb)
		                           || jsonb_build_object('source', $2::jsonb)
		 WHERE id = $1 AND status = 'running'
	`, jobID, provenanceJSON)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() != 1 {
		return nil, errors.New("generation job changed while storing its likeness candidate")
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return candidate, nil
}

// ListLikenessCandidates is her open choice, oldest first so the four appear in
// the order they were asked for rather than the order they happened to finish.
func (r *OmniChatMediaRepository) ListLikenessCandidates(
	ctx context.Context, personaID, ownerUserID int,
) ([]*OmniChatIAILikenessCandidate, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.persona_id, c.generation_job_id, c.media_file_id,
		       mf.storage_url, mf.storage_path
		FROM omnichat_iai_likeness_candidates c
		JOIN media_files mf ON mf.id = c.media_file_id
		WHERE c.persona_id = $1 AND c.owner_user_id = $2
		ORDER BY c.created_at ASC, c.id ASC
	`, personaID, ownerUserID)
	if err != nil {
		return nil, fmt.Errorf("list likeness candidates: %w", err)
	}
	defer rows.Close()

	candidates := make([]*OmniChatIAILikenessCandidate, 0, 4)
	for rows.Next() {
		one := &OmniChatIAILikenessCandidate{}
		if err := rows.Scan(&one.ID, &one.PersonaID, &one.JobID, &one.MediaFileID,
			&one.StorageURL, &one.StoragePath); err != nil {
			return nil, fmt.Errorf("scan likeness candidate: %w", err)
		}
		candidates = append(candidates, one)
	}
	return candidates, rows.Err()
}
