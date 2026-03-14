package models

import (
	"fmt"
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	MediaScanStatusPending  = "pending"
	MediaScanStatusClean    = "clean"
	MediaScanStatusInfected = "infected"
	MediaScanStatusError    = "error"
)

// MediaFile represents an uploaded media asset
type MediaFile struct {
	ID               int        `json:"id"`
	UserID           int        `json:"user_id"`
	Filename         string     `json:"filename"`
	OriginalFilename string     `json:"original_filename"`
	FileType         string     `json:"file_type"`
	FileSize         int64      `json:"file_size"`
	StorageURL       string     `json:"storage_url"`
	ThumbnailURL     *string    `json:"thumbnail_url,omitempty"`
	StoragePath      string     `json:"storage_path"`
	Width            *int       `json:"width,omitempty"`
	Height           *int       `json:"height,omitempty"`
	Duration         *int       `json:"duration,omitempty"`
	UsedInMessageID  *int       `json:"used_in_message_id,omitempty"`
	UploadedAt       time.Time  `json:"uploaded_at"`
	ScanStatus       string     `json:"scan_status"`
	ScannedAt        *time.Time `json:"scanned_at,omitempty"`
	ScanError        *string    `json:"scan_error,omitempty"`
	QuarantinedAt    *time.Time `json:"quarantined_at,omitempty"`
}

// MediaFileRepository handles database operations for media files
type MediaFileRepository struct {
	pool *pgxpool.Pool
}

// NewMediaFileRepository creates a new media file repository
func NewMediaFileRepository(pool *pgxpool.Pool) *MediaFileRepository {
	return &MediaFileRepository{pool: pool}
}

// Create inserts a media file record
func (r *MediaFileRepository) Create(ctx context.Context, media *MediaFile) error {
	if media.ScanStatus == "" {
		media.ScanStatus = MediaScanStatusPending
	}

	query := `
		INSERT INTO media_files (
			user_id, filename, original_filename, file_type, file_size,
			storage_url, thumbnail_url, storage_path, width, height, duration, used_in_message_id, scan_status
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id, uploaded_at, scan_status, scanned_at, scan_error, quarantined_at
	`

	return r.pool.QueryRow(ctx, query,
		media.UserID,
		media.Filename,
		media.OriginalFilename,
		media.FileType,
		media.FileSize,
		media.StorageURL,
		media.ThumbnailURL,
		media.StoragePath,
		media.Width,
		media.Height,
		media.Duration,
		media.UsedInMessageID,
		media.ScanStatus,
	).Scan(
		&media.ID,
		&media.UploadedAt,
		&media.ScanStatus,
		&media.ScannedAt,
		&media.ScanError,
		&media.QuarantinedAt,
	)
}

// GetByStorageURL retrieves a media file by its storage URL.
func (r *MediaFileRepository) GetByStorageURL(ctx context.Context, storageURL string) (*MediaFile, error) {
	query := `
		SELECT id, user_id, filename, original_filename, file_type, file_size,
		       storage_url, thumbnail_url, storage_path, width, height, duration, used_in_message_id, uploaded_at,
		       scan_status, scanned_at, scan_error, quarantined_at
		FROM media_files
		WHERE storage_url = $1
	`
	media := &MediaFile{}
	err := r.pool.QueryRow(ctx, query, storageURL).Scan(
		&media.ID,
		&media.UserID,
		&media.Filename,
		&media.OriginalFilename,
		&media.FileType,
		&media.FileSize,
		&media.StorageURL,
		&media.ThumbnailURL,
		&media.StoragePath,
		&media.Width,
		&media.Height,
		&media.Duration,
		&media.UsedInMessageID,
		&media.UploadedAt,
		&media.ScanStatus,
		&media.ScannedAt,
		&media.ScanError,
		&media.QuarantinedAt,
	)
	if err != nil {
		return nil, err
	}
	return media, nil
}

// GetByID retrieves a media file by its ID.
func (r *MediaFileRepository) GetByID(ctx context.Context, id int) (*MediaFile, error) {
	query := `
		SELECT id, user_id, filename, original_filename, file_type, file_size,
		       storage_url, thumbnail_url, storage_path, width, height, duration, used_in_message_id, uploaded_at,
		       scan_status, scanned_at, scan_error, quarantined_at
		FROM media_files
		WHERE id = $1
	`
	media := &MediaFile{}
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&media.ID,
		&media.UserID,
		&media.Filename,
		&media.OriginalFilename,
		&media.FileType,
		&media.FileSize,
		&media.StorageURL,
		&media.ThumbnailURL,
		&media.StoragePath,
		&media.Width,
		&media.Height,
		&media.Duration,
		&media.UsedInMessageID,
		&media.UploadedAt,
		&media.ScanStatus,
		&media.ScannedAt,
		&media.ScanError,
		&media.QuarantinedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return media, nil
}

// GetTotalStorageByUserID returns total bytes currently stored by a user.
func (r *MediaFileRepository) GetTotalStorageByUserID(ctx context.Context, userID int) (int64, error) {
	var total sql.NullInt64
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(file_size), 0)
		FROM media_files
		WHERE user_id = $1
	`, userID).Scan(&total)
	if err != nil {
		return 0, err
	}
	if !total.Valid {
		return 0, nil
	}
	return total.Int64, nil
}

// GetTrackedStorageByUserID returns tracked storage usage from users.storage_used_bytes.
func (r *MediaFileRepository) GetTrackedStorageByUserID(ctx context.Context, userID int) (int64, error) {
	var total sql.NullInt64
	err := r.pool.QueryRow(ctx, `
		SELECT storage_used_bytes
		FROM users
		WHERE id = $1
	`, userID).Scan(&total)
	if err != nil {
		return 0, err
	}
	if !total.Valid {
		return 0, nil
	}
	return total.Int64, nil
}


// IncrementTrackedStorageByUserID atomically adds delta bytes to users.storage_used_bytes.
// BUG-21: Reject negative delta values to prevent accidental decrement via this function.
// BUG-20: Check RowsAffected to detect when no user row was updated.
func (r *MediaFileRepository) IncrementTrackedStorageByUserID(ctx context.Context, userID int, delta int64) error {
	if delta < 0 {
		return fmt.Errorf("IncrementTrackedStorageByUserID: negative delta %d not allowed", delta)
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE users
		SET storage_used_bytes = COALESCE(storage_used_bytes, 0) + $2
		WHERE id = $1
	`, userID, delta)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("IncrementTrackedStorageByUserID: user %d not found", userID)
	}
	return nil
}

// FindByStoragePath retrieves a media file by its storage_path column.
// Returns (nil, nil) when no record is found.
// BUG-6: Used by ConfirmUpload for idempotent replay detection.
func (r *MediaFileRepository) FindByStoragePath(ctx context.Context, storagePath string) (*MediaFile, error) {
	query := `
		SELECT id, user_id, filename, original_filename, file_type, file_size,
		       storage_url, thumbnail_url, storage_path, width, height, duration, used_in_message_id, uploaded_at,
		       scan_status, scanned_at, scan_error, quarantined_at
		FROM media_files
		WHERE storage_path = $1
		LIMIT 1
	`
	media := &MediaFile{}
	err := r.pool.QueryRow(ctx, query, storagePath).Scan(
		&media.ID,
		&media.UserID,
		&media.Filename,
		&media.OriginalFilename,
		&media.FileType,
		&media.FileSize,
		&media.StorageURL,
		&media.ThumbnailURL,
		&media.StoragePath,
		&media.Width,
		&media.Height,
		&media.Duration,
		&media.UsedInMessageID,
		&media.UploadedAt,
		&media.ScanStatus,
		&media.ScannedAt,
		&media.ScanError,
		&media.QuarantinedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return media, nil
}

// UpdateThumbnailURL updates thumbnail_url for an existing media record.
func (r *MediaFileRepository) UpdateThumbnailURL(ctx context.Context, mediaID int, thumbnailURL string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE media_files
		SET thumbnail_url = $2
		WHERE id = $1
	`, mediaID, thumbnailURL)
	return err
}

func (r *MediaFileRepository) DeleteByID(ctx context.Context, mediaID int) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM media_files
		WHERE id = $1
	`, mediaID)
	return err
}

// GetByPublicURL retrieves media metadata for storage or thumbnail URL.
// Returns (nil, nil) when no media record maps to the URL.
func (r *MediaFileRepository) GetByPublicURL(ctx context.Context, publicURL string) (*MediaFile, error) {
	query := `
		SELECT id, user_id, filename, original_filename, file_type, file_size,
		       storage_url, thumbnail_url, storage_path, width, height, duration, used_in_message_id, uploaded_at,
		       scan_status, scanned_at, scan_error, quarantined_at
		FROM media_files
		WHERE storage_url = $1 OR thumbnail_url = $1
		LIMIT 1
	`
	media := &MediaFile{}
	err := r.pool.QueryRow(ctx, query, publicURL).Scan(
		&media.ID,
		&media.UserID,
		&media.Filename,
		&media.OriginalFilename,
		&media.FileType,
		&media.FileSize,
		&media.StorageURL,
		&media.ThumbnailURL,
		&media.StoragePath,
		&media.Width,
		&media.Height,
		&media.Duration,
		&media.UsedInMessageID,
		&media.UploadedAt,
		&media.ScanStatus,
		&media.ScannedAt,
		&media.ScanError,
		&media.QuarantinedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return media, nil
}

func (r *MediaFileRepository) MarkScanClean(ctx context.Context, mediaID int) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE media_files
		SET scan_status = $2,
			scanned_at = NOW(),
			scan_error = NULL,
			quarantined_at = NULL
		WHERE id = $1
	`, mediaID, MediaScanStatusClean)
	return err
}

func (r *MediaFileRepository) MarkScanError(ctx context.Context, mediaID int, scanErr string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE media_files
		SET scan_status = $2,
			scanned_at = NOW(),
			scan_error = $3
		WHERE id = $1
	`, mediaID, MediaScanStatusError, scanErr)
	return err
}

func (r *MediaFileRepository) MarkScanInfected(ctx context.Context, mediaID int, reason string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE media_files
		SET scan_status = $2,
			scanned_at = NOW(),
			scan_error = $3,
			quarantined_at = NOW()
		WHERE id = $1
	`, mediaID, MediaScanStatusInfected, reason)
	return err
}
