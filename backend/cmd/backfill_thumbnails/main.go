// Command backfill_thumbnails gives an existing OmniChat asset the tile image
// it was made before.
//
// Every generated asset in the database predates thumbnails, so every gallery
// tile falls back to a placeholder or -- for anything published before the grid
// stopped doing it -- to fetching the whole asset. There is nothing to
// re-render: the picture is already in storage, and a thumbnail is a resize of
// what is there.
//
// Safe to run repeatedly. It only touches rows whose thumbnail_url is null, and
// it writes the row only after the object is stored, so an interrupted run
// leaves an unreferenced object and no wrong row. A second run overwrites that
// object with an identical one.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path"
	"time"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

func main() {
	limit := flag.Int("limit", 0, "stop after this many assets (0 means all)")
	dryRun := flag.Bool("dry-run", false, "report what would be done and change nothing")
	flag.Parse()

	if err := run(context.Background(), *limit, *dryRun); err != nil {
		fmt.Fprintln(os.Stderr, "backfill_thumbnails:", err)
		os.Exit(1)
	}
}

type pending struct {
	MediaFileID int
	StoragePath string
	FileType    string
}

func run(ctx context.Context, limit int, dryRun bool) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		return err
	}
	defer db.Close()

	storage, err := storageFor(cfg)
	if err != nil {
		return err
	}
	thumbnails := services.NewThumbnailService()

	rows, err := db.Pool.Query(ctx, `
		SELECT mf.id, mf.storage_path, mf.file_type
		  FROM omnichat_media_assets a
		  JOIN media_files mf ON mf.id = a.media_file_id
		 WHERE a.deleted_at IS NULL
		   AND mf.thumbnail_url IS NULL
		   AND mf.scan_status = 'clean'
		 ORDER BY a.created_at DESC`)
	if err != nil {
		return err
	}
	var work []pending
	for rows.Next() {
		var row pending
		if err := rows.Scan(&row.MediaFileID, &row.StoragePath, &row.FileType); err != nil {
			rows.Close()
			return err
		}
		work = append(work, row)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if limit > 0 && len(work) > limit {
		work = work[:limit]
	}
	fmt.Printf("%d asset(s) without a thumbnail\n", len(work))

	var done, skipped, failed int
	for _, row := range work {
		key, ok := models.OmniChatThumbnailKeyFor(row.StoragePath)
		if !ok {
			fmt.Printf("  skip  media %d: %s is not a generated asset path\n", row.MediaFileID, row.StoragePath)
			skipped++
			continue
		}
		if dryRun {
			fmt.Printf("  would media %d -> %s\n", row.MediaFileID, key)
			done++
			continue
		}
		if err := backfillOne(ctx, db, storage, thumbnails, row, key); err != nil {
			fmt.Printf("  FAIL  media %d: %v\n", row.MediaFileID, err)
			failed++
			continue
		}
		fmt.Printf("  ok    media %d -> %s\n", row.MediaFileID, key)
		done++
	}
	fmt.Printf("done: %d, skipped: %d, failed: %d\n", done, skipped, failed)
	if failed > 0 {
		return fmt.Errorf("%d asset(s) could not be given a thumbnail", failed)
	}
	return nil
}

func backfillOne(
	ctx context.Context, db *database.DB, storage services.StorageService,
	thumbnails *services.ThumbnailService, row pending, key string,
) error {
	source, cleanupSource, err := downloadToTemp(ctx, storage, row.StoragePath)
	if err != nil {
		return err
	}
	defer cleanupSource()

	var thumbnailPath string
	switch {
	case services.IsVideoType(row.FileType):
		thumbnailPath, err = thumbnails.GenerateVideoThumbnailSecure(source, 30*time.Second)
	case services.IsImageType(row.FileType):
		var set *services.ImageThumbnailSet
		set, err = thumbnails.GenerateImageThumbnails(source)
		if err == nil {
			thumbnailPath = set.PrimaryPath
			defer func() { _ = os.Remove(set.SmallPath) }()
		}
	default:
		return fmt.Errorf("unsupported media type %q", row.FileType)
	}
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(thumbnailPath) }()

	file, err := os.Open(thumbnailPath)
	if err != nil {
		return err
	}
	defer func() { _ = file.Close() }()
	if _, err := storage.Upload(ctx, key, file, "image/jpeg"); err != nil {
		return err
	}

	// The row is written only after the object exists, so an interrupted run
	// never leaves a thumbnail_url pointing at nothing.
	tag, err := db.Pool.Exec(ctx,
		`UPDATE media_files SET thumbnail_url = $1 WHERE id = $2 AND thumbnail_url IS NULL`,
		"/uploads/"+key, row.MediaFileID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return errors.New("the row already had a thumbnail")
	}
	return nil
}

// downloadToTemp copies a stored object to a local file that keeps the object's
// extension. The thumbnail service refuses a source whose type it cannot read
// from the name, and ffmpeg picks its output container the same way.
func downloadToTemp(ctx context.Context, storage services.StorageService, key string) (string, func(), error) {
	reader, err := storage.Download(ctx, key)
	if err != nil {
		return "", func() {}, fmt.Errorf("download %q: %w", key, err)
	}
	defer func() { _ = reader.Close() }()

	file, err := os.CreateTemp("", "omnichat-backfill-*"+path.Ext(key))
	if err != nil {
		return "", func() {}, err
	}
	cleanup := func() {
		_ = file.Close()
		_ = os.Remove(file.Name())
	}
	if _, err := io.Copy(file, reader); err != nil {
		cleanup()
		return "", func() {}, err
	}
	if err := file.Sync(); err != nil {
		cleanup()
		return "", func() {}, err
	}
	return file.Name(), cleanup, nil
}

func storageFor(cfg *config.Config) (services.StorageService, error) {
	if cfg.Storage.StorageBackend == "s3" {
		return services.NewS3StorageService(cfg)
	}
	return services.NewLocalStorageService("./uploads", cfg.FrontendURL+"/uploads")
}
