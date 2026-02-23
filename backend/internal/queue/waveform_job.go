package queue

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"os/exec"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/services"
)

const JobTypeWaveform JobType = "waveform_generation"

// WaveformJobPayload is the payload for waveform generation jobs.
type WaveformJobPayload struct {
	VoiceMessageID int    `json:"voice_message_id"`
	StorageKey     string `json:"storage_key"`
}

// WaveformJobHandler processes waveform generation jobs.
type WaveformJobHandler struct {
	pool    *pgxpool.Pool
	storage services.StorageService
}

// NewWaveformJobHandler creates a WaveformJobHandler.
func NewWaveformJobHandler(pool *pgxpool.Pool, storage services.StorageService) *WaveformJobHandler {
	return &WaveformJobHandler{pool: pool, storage: storage}
}

// Handle implements the asynq job handler interface.
func (h *WaveformJobHandler) Handle(ctx context.Context, task *asynq.Task) error {
	var payload WaveformJobPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("waveform job: unmarshal payload: %w", err)
	}

	waveform, err := h.generateWaveform(ctx, payload.StorageKey)
	if err != nil {
		return fmt.Errorf("waveform job: generate: %w", err)
	}

	waveformJSON, err := json.Marshal(waveform)
	if err != nil {
		return fmt.Errorf("waveform job: marshal waveform: %w", err)
	}

	_, err = h.pool.Exec(ctx, `
		UPDATE voice_messages SET waveform_data = $1 WHERE id = $2
	`, string(waveformJSON), payload.VoiceMessageID)
	if err != nil {
		return fmt.Errorf("waveform job: db update: %w", err)
	}

	log.Printf("waveform job: completed for voice_message_id=%d", payload.VoiceMessageID)
	return nil
}

func (h *WaveformJobHandler) generateWaveform(ctx context.Context, storageKey string) ([]float64, error) {
	// Download audio file from storage.
	rc, err := h.storage.Download(ctx, storageKey)
	if err != nil {
		return nil, fmt.Errorf("download audio: %w", err)
	}
	defer rc.Close()

	// Save to temp file.
	tmpFile, err := os.CreateTemp("", "waveform-*")
	if err != nil {
		return nil, fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := io.Copy(tmpFile, rc); err != nil {
		tmpFile.Close()
		return nil, fmt.Errorf("write temp file: %w", err)
	}
	tmpFile.Close()

	// Run ffmpeg to decode audio to raw PCM s16le mono at 8000 Hz.
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-i", tmpPath,
		"-ac", "1",
		"-ar", "8000",
		"-f", "s16le",
		"-",
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	pcmData, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("ffmpeg pcm extraction: %w (stderr: %s)", err, stderr.String())
	}

	if len(pcmData) < 2 {
		// Return a flat waveform if no data.
		flat := make([]float64, 100)
		return flat, nil
	}

	// Convert raw bytes to int16 samples.
	sampleCount := len(pcmData) / 2
	samples := make([]int16, sampleCount)
	for i := 0; i < sampleCount; i++ {
		samples[i] = int16(binary.LittleEndian.Uint16(pcmData[i*2 : i*2+2]))
	}

	// Group samples into 100 chunks, take max abs value per chunk.
	const numBars = 100
	chunkSize := sampleCount / numBars
	if chunkSize == 0 {
		chunkSize = 1
	}

	waveform := make([]float64, numBars)
	for i := 0; i < numBars; i++ {
		start := i * chunkSize
		end := start + chunkSize
		if end > sampleCount {
			end = sampleCount
		}
		var maxAbs int16
		for _, s := range samples[start:end] {
			abs := s
			if abs < 0 {
				abs = -abs
			}
			if abs > maxAbs {
				maxAbs = abs
			}
		}
		// Normalize to [0.0, 1.0] using s16le max value.
		waveform[i] = math.Min(1.0, float64(maxAbs)/32768.0)
	}

	return waveform, nil
}
