package models

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	ErrMediaQuotaExceeded  = errors.New("storage quota exceeded")
	ErrUploadIntentInvalid = errors.New("upload intent is invalid or expired")
)

type MediaUploadIntent struct {
	ID               uuid.UUID `json:"upload_id"`
	UserID           int       `json:"-"`
	StoragePath      string    `json:"upload_key"`
	OriginalFilename string    `json:"original_filename"`
	ContentType      string    `json:"content_type"`
	DeclaredSize     int64     `json:"file_size"`
	ChecksumSHA256   string    `json:"checksum_sha256"`
	Status           string    `json:"status"`
	ConfirmedMediaID *int      `json:"media_id,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	ExpiresAt        time.Time `json:"expires_at"`
}

func (r *MediaFileRepository) ReserveUploadIntent(ctx context.Context, intent *MediaUploadIntent, storageCap int64) error {
	if intent == nil || intent.ID == uuid.Nil || intent.UserID <= 0 || intent.DeclaredSize <= 0 {
		return ErrUploadIntentInvalid
	}
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1, $2)`, int32(14800), int32(intent.UserID)); err != nil {
		return err
	}
	var usedBytes, reservedBytes int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(storage_used_bytes, 0) FROM users WHERE id=$1 FOR UPDATE`, intent.UserID).Scan(&usedBytes); err != nil {
		return err
	}
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(declared_size), 0)
		FROM media_upload_intents
		WHERE user_id=$1 AND status='pending' AND expires_at > NOW()
	`, intent.UserID).Scan(&reservedBytes); err != nil {
		return err
	}
	if usedBytes+reservedBytes+intent.DeclaredSize > storageCap {
		return ErrMediaQuotaExceeded
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO media_upload_intents (
			id, user_id, storage_path, original_filename, content_type,
			declared_size, checksum_sha256, expires_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING created_at, status
	`, intent.ID, intent.UserID, intent.StoragePath, intent.OriginalFilename,
		intent.ContentType, intent.DeclaredSize, intent.ChecksumSHA256, intent.ExpiresAt,
	).Scan(&intent.CreatedAt, &intent.Status)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *MediaFileRepository) GetUploadIntentOwned(ctx context.Context, id uuid.UUID, userID int) (*MediaUploadIntent, error) {
	intent := &MediaUploadIntent{}
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, storage_path, original_filename, content_type,
		       declared_size, checksum_sha256, status, confirmed_media_id,
		       created_at, expires_at
		FROM media_upload_intents
		WHERE id=$1 AND user_id=$2
	`, id, userID).Scan(
		&intent.ID, &intent.UserID, &intent.StoragePath, &intent.OriginalFilename,
		&intent.ContentType, &intent.DeclaredSize, &intent.ChecksumSHA256,
		&intent.Status, &intent.ConfirmedMediaID, &intent.CreatedAt, &intent.ExpiresAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return intent, err
}

// FinalizeUploadIntent atomically creates the media row, consumes the quota
// reservation, and charges actual bytes. The upload metadata must already have
// been verified against the signed intent by the caller.
func (r *MediaFileRepository) FinalizeUploadIntent(
	ctx context.Context,
	id uuid.UUID,
	userID int,
	actualSize int64,
	storageCap int64,
	storageURL string,
) (int, bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var intent MediaUploadIntent
	err = tx.QueryRow(ctx, `
		SELECT id, user_id, storage_path, original_filename, content_type,
		       declared_size, checksum_sha256, status, confirmed_media_id, expires_at
		FROM media_upload_intents
		WHERE id=$1 AND user_id=$2
		FOR UPDATE
	`, id, userID).Scan(
		&intent.ID, &intent.UserID, &intent.StoragePath, &intent.OriginalFilename,
		&intent.ContentType, &intent.DeclaredSize, &intent.ChecksumSHA256,
		&intent.Status, &intent.ConfirmedMediaID, &intent.ExpiresAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, ErrUploadIntentInvalid
	}
	if err != nil {
		return 0, false, err
	}
	if intent.Status == "confirmed" && intent.ConfirmedMediaID != nil {
		return *intent.ConfirmedMediaID, true, tx.Commit(ctx)
	}
	if intent.Status != "pending" || time.Now().UTC().After(intent.ExpiresAt) || actualSize != intent.DeclaredSize {
		return 0, false, ErrUploadIntentInvalid
	}

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1, $2)`, int32(14800), int32(userID)); err != nil {
		return 0, false, err
	}
	var usedBytes int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(storage_used_bytes, 0) FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&usedBytes); err != nil {
		return 0, false, err
	}
	if usedBytes+actualSize > storageCap {
		return 0, false, ErrMediaQuotaExceeded
	}

	var mediaID int
	err = tx.QueryRow(ctx, `
		INSERT INTO media_files (
			user_id, filename, original_filename, file_type, file_size,
			storage_url, storage_path, scan_status
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id
	`, userID, intent.OriginalFilename, intent.OriginalFilename, intent.ContentType,
		actualSize, storageURL, intent.StoragePath, MediaScanStatusPending).Scan(&mediaID)
	if err != nil {
		return 0, false, fmt.Errorf("create confirmed media: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE media_upload_intents
		SET status='confirmed', confirmed_media_id=$2, confirmed_at=NOW(), failure_reason=NULL
		WHERE id=$1
	`, id, mediaID); err != nil {
		return 0, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, false, err
	}
	return mediaID, false, nil
}

func (r *MediaFileRepository) RollbackConfirmedUpload(ctx context.Context, intentID uuid.UUID, userID int, reason string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var mediaID *int
	err = tx.QueryRow(ctx, `
		SELECT confirmed_media_id
		FROM media_upload_intents WHERE id=$1 AND user_id=$2 FOR UPDATE
	`, intentID, userID).Scan(&mediaID)
	if err != nil {
		return err
	}
	if mediaID != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM media_files WHERE id=$1 AND user_id=$2`, *mediaID, userID); err != nil {
			return err
		}
	}
	if len(reason) > 500 {
		reason = reason[:500]
	}
	if _, err := tx.Exec(ctx, `
		UPDATE media_upload_intents
		SET status='failed', confirmed_media_id=NULL, failure_reason=$3
		WHERE id=$1 AND user_id=$2
	`, intentID, userID, reason); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *MediaFileRepository) MarkUploadIntentFailed(ctx context.Context, id uuid.UUID, userID int, reason string) error {
	if len(reason) > 500 {
		reason = reason[:500]
	}
	_, err := r.pool.Exec(ctx, `
		UPDATE media_upload_intents SET status='failed', failure_reason=$3
		WHERE id=$1 AND user_id=$2 AND status='pending'
	`, id, userID, reason)
	return err
}
