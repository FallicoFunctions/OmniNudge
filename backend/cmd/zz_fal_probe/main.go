// Command zz_fal_probe animates one still from an audio track, through fal.ai.
//
// The question it answers first is narrow and cheap: does ByteDance refuse a
// photorealistic character here as it does on Seedance, where four of four
// stills came back with InputImageSensitiveContentDetected. If it refuses,
// OmniHuman is out and there is no point writing a client for it.
//
// The question behind that one is the whole reason for the path. Every video
// model tried so far invents a voice and animates speech that cannot be
// switched off. A model driven by a supplied audio track speaks in the voice
// it is given, and runs exactly as long as the audio -- which retires the
// frame budget, the pinned last frame and the pose matching all at once.
//
// Not a test. It spends money.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/speech"
	"github.com/omninudge/backend/internal/services/voicebox"
)

// falExampleAudio is fal's own sample. Used deliberately for the first run:
// it isolates "does this provider accept her face" from "is the voice
// pipeline wired", and only one of those is worth money to learn today.
const falExampleAudio = "https://storage.googleapis.com/falserverless/example_inputs/omnihuman_audio.mp3"

func main() {
	model := flag.String("model", "fal-ai/bytedance/omnihuman", "fal model id")
	asset := flag.String("asset", "", "image asset id to animate")
	persona := flag.Int("persona", 0, "animate a persona's stored reference instead")
	refIndex := flag.Int("ref", 1, "which reference, 1-based")
	audio := flag.String("audio", "", "audio url to drive the mouth; empty uses --say or fal's sample")
	say := flag.String("say", "", "synthesize this line through voicebox and drive the mouth with it")
	voice := flag.String("voice", "af_heart", "voicebox preset voice id for --say")
	prompt := flag.String("prompt", "", "prompt, for models that take one")
	out := flag.String("out", "", "directory to write the clip into")
	timeout := flag.Duration("timeout", 15*time.Minute, "how long to wait")
	flag.Parse()

	if err := run(*model, *asset, *persona, *refIndex, *audio, *say, *voice, *prompt, *out, *timeout); err != nil {
		fmt.Fprintln(os.Stderr, "zz_fal_probe:", err)
		os.Exit(1)
	}
}

func run(model, assetID string, personaID, refIndex int, audioURL, say, voice, prompt, outDir string, timeout time.Duration) error {
	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if strings.TrimSpace(cfg.OmniChatMedia.FalAPIKey) == "" {
		return errors.New("FAL_API_KEY is not set")
	}
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		return err
	}
	defer db.Close()

	imageURL, err := signStill(ctx, cfg, db, assetID, personaID, refIndex)
	if err != nil {
		return err
	}

	switch {
	case strings.TrimSpace(say) != "":
		audioURL, err = speak(ctx, cfg, say, voice)
		if err != nil {
			return err
		}
	case strings.TrimSpace(audioURL) == "":
		audioURL = falExampleAudio
	}

	body := map[string]any{"image_url": imageURL, "audio_url": audioURL}
	if strings.TrimSpace(prompt) != "" {
		body["prompt"] = prompt
	}

	fmt.Printf("model:  %s\n", model)
	fmt.Printf("still:  %s\n", shorten(imageURL))
	fmt.Printf("audio:  %s\n\n", shorten(audioURL))

	started := time.Now()
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	videoURL, err := generate(ctx, cfg.OmniChatMedia.FalBaseURL, cfg.OmniChatMedia.FalAPIKey, model, body)
	if err != nil {
		return err
	}
	fmt.Printf("done in %s\n", time.Since(started).Round(time.Second))

	if strings.TrimSpace(outDir) == "" {
		fmt.Printf("video:  %s\n", videoURL)
		return nil
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}
	name := outDir + "/" + strings.NewReplacer("/", "_", ".", "-").Replace(model) + ".mp4"
	size, err := download(ctx, videoURL, name)
	if err != nil {
		return err
	}
	fmt.Printf("wrote   %s (%d KB)\n", name, size/1024)
	return nil
}

type falQueued struct {
	RequestID   string `json:"request_id"`
	StatusURL   string `json:"status_url"`
	ResponseURL string `json:"response_url"`
	Status      string `json:"status"`
}

func generate(ctx context.Context, baseURL, apiKey, model string, body map[string]any) (string, error) {
	encoded, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	var queued falQueued
	url := strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(model, "/")
	if err := call(ctx, http.MethodPost, url, apiKey, bytes.NewReader(encoded), &queued); err != nil {
		return "", err
	}
	if queued.StatusURL == "" || queued.ResponseURL == "" {
		return "", fmt.Errorf("fal returned no status or response url: %+v", queued)
	}
	fmt.Printf("queued  %s\n", queued.RequestID)

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		var status struct {
			Status string `json:"status"`
			Error  any    `json:"error"`
		}
		if err := call(ctx, http.MethodGet, queued.StatusURL, apiKey, nil, &status); err != nil {
			return "", err
		}
		switch strings.ToUpper(strings.TrimSpace(status.Status)) {
		case "COMPLETED", "OK":
			var result struct {
				Video struct {
					URL string `json:"url"`
				} `json:"video"`
			}
			if err := call(ctx, http.MethodGet, queued.ResponseURL, apiKey, nil, &result); err != nil {
				return "", err
			}
			if result.Video.URL == "" {
				// The silent-zero shape again: completed with nothing in it.
				return "", errors.New("fal completed with no video url")
			}
			return result.Video.URL, nil
		case "FAILED", "ERROR":
			return "", fmt.Errorf("fal job failed: %v", status.Error)
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-ticker.C:
		}
	}
}

func call(ctx context.Context, method, url, apiKey string, body io.Reader, target any) error {
	request, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return err
	}
	// "Key", not "Bearer". fal's own docs are explicit and it is the kind of
	// detail that costs an hour when it is guessed from another provider.
	request.Header.Set("Authorization", "Key "+apiKey)
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return err
	}
	if response.StatusCode >= 400 {
		return fmt.Errorf("fal %s returned %d: %s", method, response.StatusCode, string(payload))
	}
	return json.Unmarshal(payload, target)
}

func download(ctx context.Context, url, path string) (int64, error) {
	request, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		return 0, fmt.Errorf("download returned %d", response.StatusCode)
	}
	file, err := os.Create(path)
	if err != nil {
		return 0, err
	}
	defer file.Close()
	return io.Copy(file, response.Body)
}

func signStill(ctx context.Context, cfg *config.Config, db *database.DB,
	assetID string, personaID, refIndex int) (string, error) {
	storage, err := storageFor(cfg)
	if err != nil {
		return "", err
	}
	if personaID > 0 {
		persona, err := models.NewBotPersonaRepository(db.Pool).GetByID(ctx, personaID)
		if err != nil {
			return "", err
		}
		profile := services.ResolveOmniChatMediaIdentityProfile(persona)
		if refIndex < 1 || refIndex > len(profile.ReferenceURLs) {
			return "", fmt.Errorf("persona %d has %d references, asked for %d",
				personaID, len(profile.ReferenceURLs), refIndex)
		}
		return storage.GetSignedURL(ctx, cleanKey(profile.ReferenceURLs[refIndex-1]), 60*time.Minute)
	}
	id, err := uuid.Parse(assetID)
	if err != nil {
		return "", fmt.Errorf("bad asset id: %w", err)
	}
	var path string
	err = db.Pool.QueryRow(ctx, `
		SELECT mf.storage_path
		  FROM omnichat_media_assets a
		  JOIN media_files mf ON mf.id = a.media_file_id
		 WHERE a.id = $1`, id).Scan(&path)
	if err != nil {
		return "", fmt.Errorf("locate the still: %w", err)
	}
	return storage.GetSignedURL(ctx, path, 60*time.Minute)
}

func cleanKey(reference string) string {
	key := strings.TrimPrefix(reference, "/uploads/")
	if i := strings.Index(key, "?"); i > 0 {
		key = key[:i]
	}
	return key
}

// speak synthesizes a line locally and puts it somewhere fal can fetch.
//
// Voicebox listens on loopback, so its bytes are unreachable from the public
// internet. The provider fetches audio by URL, which makes the upload a
// requirement of the architecture rather than a convenience: local synthesis
// and a hosted animator cannot meet without object storage between them.
func speak(ctx context.Context, cfg *config.Config, text, voiceID string) (string, error) {
	client, err := voicebox.NewClient(cfg.OmniChatVoice.VoiceboxBaseURL,
		time.Duration(cfg.OmniChatVoice.VoiceboxTimeoutSeconds)*time.Second)
	if err != nil {
		return "", fmt.Errorf("voicebox: %w", err)
	}
	audio, err := client.Synthesize(ctx, voiceID, speech.Request{Text: text, ModelID: "kokoro"})
	if err != nil {
		return "", fmt.Errorf("synthesize: %w", err)
	}
	storage, err := storageFor(cfg)
	if err != nil {
		return "", err
	}
	key := fmt.Sprintf("omnichat/speech/probe-%s%s", uuid.NewString(), audio.Extension)
	if _, err := storage.Upload(ctx, key, bytes.NewReader(audio.Bytes), audio.ContentType); err != nil {
		return "", fmt.Errorf("upload speech: %w", err)
	}
	signed, err := storage.GetSignedURL(ctx, key, 60*time.Minute)
	if err != nil {
		return "", fmt.Errorf("sign speech: %w", err)
	}
	fmt.Printf("spoke:  %q as %s (%d KB)\n", text, voiceID, len(audio.Bytes)/1024)
	return signed, nil
}

func storageFor(cfg *config.Config) (services.StorageService, error) {
	if cfg.Storage.StorageBackend == "s3" {
		return services.NewS3StorageService(cfg)
	}
	return services.NewLocalStorageService("./uploads", cfg.FrontendURL+"/uploads")
}

func shorten(url string) string {
	if i := strings.Index(url, "?"); i > 0 {
		return url[:i] + "?…"
	}
	return url
}
