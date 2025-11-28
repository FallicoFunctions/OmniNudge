package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// MediaFile represents an uploaded media asset
type MediaFile struct {
	ID               int       `json:"id"`
	UserID           int       `json:"user_id"`
	Filename         string    `json:"filename"`
	OriginalFilename string    `json:"original_filename"`
	FileType         string    `json:"file_type"`
	FileSize         int64     `json:"file_size"`
	StorageURL       string    `json:"storage_url"`
	ThumbnailURL     *string   `json:"thumbnail_url,omitempty"`
	StoragePath      string    `json:"storage_path"`
	Width            *int      `json:"width,omitempty"`
	Height           *int      `json:"height,omitempty"`
	Duration         *int      `json:"duration,omitempty"`
	UsedInMessageID  *int      `json:"used_in_message_id,omitempty"`
	UploadedAt       time.Time `json:"uploaded_at"`
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
	query := `
		INSERT INTO media_files (
			user_id, filename, original_filename, file_type, file_size,
			storage_url, thumbnail_url, storage_path, width, height, duration, used_in_message_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, uploaded_at
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
	).Scan(&media.ID, &media.UploadedAt)
}
