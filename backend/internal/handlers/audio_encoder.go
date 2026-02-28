package handlers

import (
	"github.com/omninudge/backend/internal/ports"
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

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/queue"
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

// EncodeAudio processes raw audio from iOS devices and encodes to WebM/Opus
// POST /api/v1/media/encode-audio
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

	// Create temp directory for processing
	tempDir := filepath.Join(os.TempDir(), fmt.Sprintf("audio-encode-%d-%d", userID, time.Now().Unix()))
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		log.Printf("Failed to create temp directory: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to process audio")
		return
	}
	defer os.RemoveAll(tempDir)

	// Save uploaded WAV file
	inputPath := filepath.Join(tempDir, "input.wav")
	outputPath := filepath.Join(tempDir, "output.webm")

	inputFile, err := os.Create(inputPath)
	if err != nil {
		log.Printf("Failed to create input file: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to process audio")
		return
	}

	_, err = io.Copy(inputFile, file)
	inputFile.Close()
	if err != nil {
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

	output, err := cmd.CombinedOutput()
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

	filename := fmt.Sprintf("voice_%d_%d.webm", userID, time.Now().Unix())
	finalPath := filepath.Join(uploadsDir, filename)

	if err := os.WriteFile(finalPath, encodedData, 0644); err != nil {
		log.Printf("Failed to write encoded file: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to save audio")
		return
	}

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
