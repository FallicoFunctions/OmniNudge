package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/utils"
)

// hlsSegmentDuration is the target HLS segment length in seconds.
// Apple recommends 6 seconds for most use cases.
const hlsSegmentDuration = "6"

// VideoTranscodeHandler processes video transcoding jobs using ffmpeg.
// It transcodes the input video (identified by its S3/local key) to HLS format,
// uploads the resulting segments to storage, and updates the media_files record
// with the output CDN URL on completion.
type VideoTranscodeHandler struct {
	pool           *pgxpool.Pool
	outputBase     string // local base dir for HLS segments, e.g. "./uploads/hls"
	storageService services.StorageService
}

// NewVideoTranscodeHandler creates a VideoTranscodeHandler.
// outputBase is the directory where HLS segments are written during transcoding.
// storageService is used to upload the resulting HLS segments.
func NewVideoTranscodeHandler(pool *pgxpool.Pool, outputBase string, storageService services.StorageService) *VideoTranscodeHandler {
	return &VideoTranscodeHandler{
		pool:           pool,
		outputBase:     outputBase,
		storageService: storageService,
	}
}

// storageKeyRe matches only safe storage key characters.
var storageKeyRe = regexp.MustCompile(`^[a-zA-Z0-9/_.-]+$`)

// isValidStorageKey returns true only if key contains safe path characters and
// does not contain any path traversal sequences.
func isValidStorageKey(key string) bool {
	if key == "" {
		return false
	}
	return storageKeyRe.MatchString(key) && !strings.Contains(key, "..")
}

// Handle is the asynq-compatible handler function for video_transcode jobs.
func (h *VideoTranscodeHandler) Handle(ctx context.Context, task *asynq.Task) error {
	var payload VideoTranscodePayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("video_transcode: unmarshal payload: %v: %w", err, asynq.SkipRetry)
	}
	if payload.MediaID <= 0 || payload.InputKey == "" || payload.OutputKey == "" {
		return fmt.Errorf("video_transcode: invalid payload media_id=%d input_key=%q output_key=%q: %w",
			payload.MediaID, payload.InputKey, payload.OutputKey, asynq.SkipRetry)
	}

	// SEC-6: Validate storage keys to prevent path traversal.
	if !isValidStorageKey(payload.InputKey) || !isValidStorageKey(payload.OutputKey) {
		return fmt.Errorf("video_transcode: invalid key characters: %w", asynq.SkipRetry)
	}

	zlog.Info().
		Int("media_id", payload.MediaID).
		Str("input_key", payload.InputKey).
		Str("output_key", payload.OutputKey).
		Str("format", payload.Format).
		Msg("video_transcode: starting")

	// Create a temporary directory for HLS output segments.
	tmpDir, err := os.MkdirTemp("", "omninudge_hls_*")
	if err != nil {
		return fmt.Errorf("video_transcode: create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	// Download input from storage to a local temp file.
	inputExt := filepath.Ext(payload.InputKey)
	if inputExt == "" {
		inputExt = ".mp4"
	}
	inputTmp := filepath.Join(tmpDir, "input"+inputExt)
	rc, err := h.storageService.Download(ctx, payload.InputKey)
	if err != nil {
		return fmt.Errorf("video_transcode: download input %q: %w", payload.InputKey, err)
	}
	inputFile, createErr := os.Create(inputTmp)
	if createErr != nil {
		rc.Close()
		return fmt.Errorf("video_transcode: create input tmp: %w", createErr)
	}
	// Cap download at 10 GB to prevent a corrupted or malicious storage entry
	// from exhausting disk space on the worker.
	const maxInputBytes = 10 * 1024 * 1024 * 1024
	written, copyErr := io.Copy(inputFile, io.LimitReader(rc, maxInputBytes+1))
	inputFile.Close()
	rc.Close()
	if copyErr != nil {
		return fmt.Errorf("video_transcode: write input tmp: %w", copyErr)
	}
	if written > maxInputBytes {
		return fmt.Errorf("video_transcode: input file exceeds size cap (%d bytes): %w", maxInputBytes, asynq.SkipRetry)
	}
	inputPath := inputTmp

	outputPlaylist := filepath.Join(tmpDir, "index.m3u8")

	// Build ffmpeg command for HLS transcoding.
	// -hls_time hlsSegmentDuration — target segment length (Apple recommends 6 s)
	// -hls_list_size 0             — keep all segments in the playlist
	// -hls_segment_type mpegts
	// -c:v libx264 -preset fast -crf 23 — reasonable quality/speed trade-off
	// -c:a aac -b:a 128k
	args := []string{
		"-y",            // overwrite output without prompting
		"-i", inputPath, // input file
		"-c:v", "libx264", // video codec
		"-preset", "fast", // encoding speed preset
		"-crf", "23", // constant rate factor (quality)
		"-c:a", "aac", // audio codec
		"-b:a", "128k", // audio bitrate
		"-hls_time", hlsSegmentDuration, // segment duration in seconds
		"-hls_list_size", "0", // keep all segments
		"-hls_segment_filename", filepath.Join(tmpDir, "seg_%03d.ts"),
		"-f", "hls", // output format
		outputPlaylist,
	}

	//nolint:gosec // inputPath comes from internal job payload, validated above.
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	output, err := utils.RunCommandWithOutputLimit(cmd, 64*1024)
	if err != nil {
		var execErr *exec.Error
		if errors.As(err, &execErr) && errors.Is(execErr.Err, exec.ErrNotFound) {
			zlog.Error().Err(err).Int("media_id", payload.MediaID).Msg("video_transcode: ffmpeg not found — infrastructure issue")
			return fmt.Errorf("video_transcode: ffmpeg not found: %w", asynq.SkipRetry)
		}
		zlog.Error().Err(err).Int("media_id", payload.MediaID).Str("output", string(output)).Msg("video_transcode: ffmpeg failed")
		return fmt.Errorf("video_transcode: ffmpeg: %w", err)
	}

	zlog.Info().
		Int("media_id", payload.MediaID).
		Str("output_playlist", outputPlaylist).
		Msg("video_transcode: ffmpeg completed successfully")

	// COR-3: Walk tmpDir and upload every HLS segment/playlist to storage.
	uploadCount := 0
	uploadErr := filepath.Walk(tmpDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		relPath, _ := filepath.Rel(tmpDir, path)
		destKey := payload.OutputKey + "/" + relPath

		// Determine content type by file extension.
		contentType := "video/mp2t" // default for .ts segments
		if strings.HasSuffix(relPath, ".m3u8") {
			contentType = "application/x-mpegURL"
		}

		f, err := os.Open(path)
		if err != nil {
			return fmt.Errorf("open segment %q: %w", relPath, err)
		}
		_, uploadErr := h.storageService.Upload(ctx, destKey, f, contentType)
		f.Close()
		if uploadErr != nil {
			return fmt.Errorf("upload segment %q: %w", destKey, uploadErr)
		}
		uploadCount++
		return nil
	})
	if uploadErr != nil {
		return fmt.Errorf("video_transcode: upload HLS segments: %w", uploadErr)
	}
	if uploadCount == 0 {
		return fmt.Errorf("video_transcode: ffmpeg produced no output files for media_id=%d", payload.MediaID)
	}

	zlog.Info().
		Int("media_id", payload.MediaID).
		Str("output_key", payload.OutputKey).
		Msg("video_transcode: HLS segments uploaded")

	// COR-4: Store the public CDN URL (not the raw storage key) in cdn_url.
	cdnURL := h.storageService.PublicURL(payload.OutputKey + "/index.m3u8")

	_, dbErr := h.pool.Exec(ctx,
		`UPDATE media_files SET cdn_url = $1 WHERE id = $2`,
		cdnURL, payload.MediaID,
	)
	if dbErr != nil {
		return fmt.Errorf("video_transcode: update media_files cdn_url for id=%d: %w", payload.MediaID, dbErr)
	}

	zlog.Info().
		Int("media_id", payload.MediaID).
		Str("cdn_url", cdnURL).
		Msg("video_transcode: media record updated")

	return nil
}
