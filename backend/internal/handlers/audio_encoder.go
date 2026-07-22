package handlers

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"

	"github.com/omninudge/backend/internal/ports"

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
	encodedData, err := os.ReadFile(outputPath)
	if err != nil {
		log.Printf("Failed to read encoded file: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to process audio")
		return
	}

	// Get file stats
	fileInfo, err := os.Stat(outputPath)
	if err != nil {
		log.Printf("Failed to stat encoded file: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to process audio")
		return
	}

	// Save to uploads directory
	uploadsDir := "./uploads/voice"
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		log.Printf("Failed to create uploads directory: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to save audio")
		return
	}

	finalFile, err := os.CreateTemp(uploadsDir, fmt.Sprintf("voice_%d_*.webm", userID))
	if err != nil {
		log.Printf("Failed to create encoded audio file: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to save audio")
		return
	}
	finalPath := finalFile.Name()
	filename := filepath.Base(finalPath)
	if _, err := finalFile.Write(encodedData); err != nil {
		_ = finalFile.Close()
		_ = os.Remove(finalPath)
		log.Printf("Failed to write encoded file: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to save audio")
		return
	}
	if err := finalFile.Close(); err != nil {
		_ = os.Remove(finalPath)
		log.Printf("Failed to close encoded audio file: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to save audio")
		return
	}
	persisted := false
	defer func() {
		if !persisted {
			_ = os.Remove(finalPath)
		}
	}()

	// Create media file record
	mediaFile := &models.MediaFile{
		UserID:           userID,
		Filename:         filename,
		OriginalFilename: header.Filename,
		FileType:         "audio",
		FileSize:         fileInfo.Size(),
		StorageURL:       fmt.Sprintf("/uploads/voice/%s", filename),
		StoragePath:      finalPath,
		Duration:         &duration,
		UploadedAt:       time.Now(),
	}

	if err := h.mediaRepo.Create(c.Request.Context(), mediaFile); err != nil {
		log.Printf("Failed to create media file record: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to save audio metadata")
		return
	}
	persisted = true

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
			mediaURL := fmt.Sprintf("/uploads/voice/%s", filename)
			err = h.queueClient.EnqueueTranscription(c.Request.Context(), mediaFile.ID, mediaURL, userID)
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
		"url":           fmt.Sprintf("/uploads/voice/%s", filename),
		"mime_type":     "audio/webm",
		"file_size":     fileInfo.Size(),
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
