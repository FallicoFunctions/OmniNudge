package handlers

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/services"

	"github.com/gin-gonic/gin"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/utils"
)

// AudioEncoderHandler handles server-side audio encoding for iOS devices
type AudioEncoderHandler struct {
	mediaRepo    ports.MediaFileRepository
	settingsRepo ports.UserSettingsRepository
	queueClient  *queue.QueueClient
	storage      services.StorageService
}

// NewAudioEncoderHandler creates a new audio encoder handler
func NewAudioEncoderHandler(
	mediaRepo ports.MediaFileRepository,
	settingsRepo ports.UserSettingsRepository,
	queueClient *queue.QueueClient,
) *AudioEncoderHandler {
	return &AudioEncoderHandler{
		mediaRepo:    mediaRepo,
		settingsRepo: settingsRepo,
		queueClient:  queueClient,
	}
}

func (h *AudioEncoderHandler) SetStorageService(storage services.StorageService) *AudioEncoderHandler {
	h.storage = storage
	return h
}

func (h *AudioEncoderHandler) persistEncodedAudio(
	ctx context.Context,
	userID int,
	originalFilename string,
	encodedData []byte,
	duration int,
) (*models.MediaFile, error) {
	if h.storage == nil {
		return nil, errors.New("encoded audio storage is unavailable")
	}
	objectKey := fmt.Sprintf("%d/voice/%s.webm", userID, uuid.NewString())
	_, err := h.storage.Upload(ctx, objectKey, bytes.NewReader(encodedData), "audio/webm")
	if err != nil {
		return nil, fmt.Errorf("store encoded audio: %w", err)
	}
	media := &models.MediaFile{
		UserID:           userID,
		Filename:         filepath.Base(objectKey),
		OriginalFilename: filepath.Base(originalFilename),
		FileType:         "audio/webm",
		FileSize:         int64(len(encodedData)),
		// Stored audio is private user media. Keep the response behind the
		// ownership-aware upload gateway instead of returning a CDN object URL.
		StorageURL:       "/uploads/" + objectKey,
		StoragePath:      filepath.ToSlash(filepath.Join("uploads", objectKey)),
		StorageObjectKey: objectKey,
		Duration:         &duration,
		UploadedAt:       time.Now(),
		// The client-supplied source is never served. ffmpeg creates this new
		// WebM payload, so it is safe to expose through the clean-only gateway.
		ScanStatus: models.MediaScanStatusClean,
	}
	if err := h.mediaRepo.Create(ctx, media); err != nil {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if deleteErr := h.storage.Delete(cleanupCtx, objectKey); deleteErr != nil {
			log.Printf("Failed to rollback encoded audio object %q: %v", objectKey, deleteErr)
		}
		return nil, fmt.Errorf("save encoded audio metadata: %w", err)
	}
	return media, nil
}

// EncodeAudio processes raw audio from iOS devices and encodes to WebM/Opus.
// @Summary      Encode audio
// @Tags         Media
// @Security     BearerAuth
// @Accept       multipart/form-data
// @Produce      json
// @Param        audio  formData  file  true  "Raw audio file"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /media/encode-audio [post]
func (h *AudioEncoderHandler) EncodeAudio(c *gin.Context) {
	userID := c.GetInt("user_id")

	// Parse multipart form
	file, header, err := c.Request.FormFile("audio")
	if err != nil {
		RespondError(c, http.StatusBadRequest, "No audio file provided")
		return
	}
	defer file.Close()

	durationStr := c.PostForm("duration")
	duration, _ := strconv.Atoi(durationStr)

	// Validate file size (max 50MB for raw WAV)
	if header.Size > 50*1024*1024 {
		RespondError(c, http.StatusBadRequest, "Audio file too large (max 50MB)")
		return
	}

	// Use an unpredictable, owner-only workspace. Predictable names in the
	// shared system temp directory permit pre-creation and symlink attacks.
	tempDir, err := os.MkdirTemp("", "audio-encode-*")
	if err != nil {
		log.Printf("Failed to create temp directory: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to process audio")
		return
	}
	defer os.RemoveAll(tempDir)

	// Save uploaded WAV file
	inputPath := filepath.Join(tempDir, "input.wav")
	outputPath := filepath.Join(tempDir, "output.webm")

	// #nosec G304 -- inputPath is constructed inside the private directory returned by os.MkdirTemp.
	inputFile, err := os.OpenFile(inputPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		log.Printf("Failed to create input file: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to process audio")
		return
	}

	written, copyErr := io.Copy(inputFile, io.LimitReader(file, 50*1024*1024+1))
	closeErr := inputFile.Close()
	if written > 50*1024*1024 {
		RespondError(c, http.StatusBadRequest, "Audio file too large (max 50MB)")
		return
	}
	if copyErr != nil || closeErr != nil {
		log.Printf("Failed to save input file: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to process audio")
		return
	}

	// Encode to WebM/Opus using ffmpeg
	// -c:a libopus: Opus codec (high quality, low bitrate)
	// -b:a 64k: 64kbps bitrate (good quality for voice)
	// -vbr on: Variable bitrate
	// -compression_level 10: Maximum compression
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()

	// #nosec G204 -- ffmpeg is fixed and both paths are server-created temp files passed without a shell.
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-i", inputPath,
		"-c:a", "libopus",
		"-b:a", "64k",
		"-vbr", "on",
		"-compression_level", "10",
		"-f", "webm",
		"-y", // Overwrite output file
		outputPath,
	)

	output, err := utils.RunCommandWithOutputLimit(cmd, 64*1024)
	if err != nil {
		log.Printf("FFmpeg encoding failed: %v\nOutput: %s", err, string(output))
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to encode audio",
			"details": "Audio encoding failed. Please try again.",
		})
		return
	}

	// Read encoded file
	// #nosec G304 -- outputPath is constructed inside the private directory returned by os.MkdirTemp.
	encodedData, err := os.ReadFile(outputPath)
	if err != nil {
		log.Printf("Failed to read encoded file: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to process audio")
		return
	}

	mediaFile, err := h.persistEncodedAudio(
		c.Request.Context(),
		userID,
		header.Filename,
		encodedData,
		duration,
	)
	if err != nil {
		log.Printf("Failed to create media file record: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to save audio metadata")
		return
	}

	// Enqueue transcription job only when explicitly enabled and user opted in.
	// This avoids creating dead-letter jobs until the transcription backend is implemented.
	if h.queueClient != nil && duration > 0 {
		shouldTranscribe := false
		if h.settingsRepo != nil {
			settings, settingsErr := h.settingsRepo.GetByUserID(c.Request.Context(), userID)
			if settingsErr != nil {
				log.Printf("Failed to load user settings for transcription opt-in: %v", settingsErr)
			} else if settings != nil {
				shouldTranscribe = settings.TranscriptionOptIn
			}
		}

		if shouldTranscribe && os.Getenv("ENABLE_TRANSCRIPTION_QUEUE") == "true" {
			err = h.queueClient.EnqueueTranscription(c.Request.Context(), mediaFile.ID, mediaFile.StorageURL, userID)
			if err != nil {
				log.Printf("Failed to enqueue transcription job: %v", err)
				// Don't fail the request - transcription is optional
			}
		} else if shouldTranscribe {
			log.Printf("Transcription opt-in enabled for user %d, but transcription queue is disabled (set ENABLE_TRANSCRIPTION_QUEUE=true to enable)", userID)
		}
	}

	// Return encoded file info
	c.JSON(http.StatusOK, gin.H{
		"media_file_id": mediaFile.ID,
		"url":           mediaFile.StorageURL,
		"mime_type":     "audio/webm",
		"file_size":     mediaFile.FileSize,
		"duration":      duration,
	})
}

// CheckFFmpegAvailability checks if ffmpeg is installed
func CheckFFmpegAvailability() error {
	cmd := exec.Command("ffmpeg", "-version")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg not found: %w", err)
	}
	return nil
}
