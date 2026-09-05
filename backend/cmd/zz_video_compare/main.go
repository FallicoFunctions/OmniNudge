// Command zz_video_compare animates one still across several OpenRouter video
// models and reports what each one cost, how long it took, and what came back.
//
// It exists because the self-hosted path takes about 580 seconds for a
// six-second clip, and because every question we have about video -- does the
// motion resolve, does her face survive, does last_frame do anything -- is a
// question no payload inspection can answer. It has to be rendered and looked
// at.
//
// One still, one motion prompt, one seed, many models. The only variable is
// the model. That discipline is not optional here: on the self-hosted path
// every comparison drew a fresh seed and a day of conclusions turned out to be
// seed variance.
//
// Not a test. It spends money and writes files.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/openrouter"
)

// Price per second of output, from OpenRouter's model collection on
// 2026-09-05. Recorded here so the run reports what a comparison cost rather
// than leaving it to be looked up later, and so a price change shows up as a
// stale number rather than as silence.
var pricePerSecond = map[string]float64{
	"bytedance/seedance-2.0-mini": 0.01345,
	"bytedance/seedance-2.0-fast": 0.04035,
	"bytedance/seedance-2.0":      0.06726,
	"bytedance/seedance-2.5":      0.1028,
	"alibaba/wan-3.0":             0.0425,
	"google/veo-3.1-lite":         0.05,
	"google/veo-3.1-fast":         0.10,
	"minimax/hailuo-3":            0.13,
	"x-ai/grok-imagine-video":     0.05,
}

func main() {
	asset := flag.String("asset", "", "the image asset id to animate (required)")
	models := flag.String("models", "bytedance/seedance-2.0-mini,alibaba/wan-3.0,google/veo-3.1-lite",
		"comma-separated OpenRouter model ids")
	prompt := flag.String("prompt", "she talks and smiles, gesturing lightly with one hand", "motion prompt")
	seconds := flag.Int("seconds", 5, "clip length")
	resolution := flag.String("resolution", "720p", "clip resolution")
	seed := flag.Int64("seed", 4242, "seed, held constant across every model")
	lastFrame := flag.Bool("last-frame", false, "also pin the closing frame to the same still")
	out := flag.String("out", "", "directory to write the clips into (required)")
	timeout := flag.Duration("timeout", 10*time.Minute, "how long to wait for each clip")
	dryRun := flag.Bool("dry-run", false, "print what would be sent and spend nothing")
	flag.Parse()

	if err := run(*asset, *models, *prompt, *resolution, *out, *seconds, *seed, *lastFrame, *dryRun, *timeout); err != nil {
		fmt.Fprintln(os.Stderr, "zz_video_compare:", err)
		os.Exit(1)
	}
}

func run(assetID, modelList, prompt, resolution, outDir string,
	seconds int, seed int64, lastFrame, dryRun bool, timeout time.Duration) error {
	ctx := context.Background()

	chosen := make([]string, 0, 4)
	for _, model := range strings.Split(modelList, ",") {
		if model = strings.TrimSpace(model); model != "" {
			chosen = append(chosen, model)
		}
	}
	if len(chosen) == 0 {
		return errors.New("--models is empty")
	}
	if strings.TrimSpace(assetID) == "" {
		return errors.New("--asset is required")
	}
	if strings.TrimSpace(outDir) == "" && !dryRun {
		return errors.New("--out is required")
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		return err
	}
	defer db.Close()

	sourceURL, err := signAsset(ctx, cfg, db, assetID)
	if err != nil {
		return err
	}

	frames := []openrouter.FrameImage{{URL: sourceURL, FrameType: openrouter.FrameTypeFirst}}
	if lastFrame {
		// The same still at both ends: she should return to the pose she
		// started in, which is what a clip that does not stop mid-gesture
		// looks like. Whether these models honour it is the open question.
		frames = append(frames, openrouter.FrameImage{URL: sourceURL, FrameType: openrouter.FrameTypeLast})
	}

	fmt.Printf("still:   %s\n", shorten(sourceURL))
	fmt.Printf("prompt:  %s\n", prompt)
	fmt.Printf("fixed:   %ds at %s, seed %d, last_frame=%v\n\n", seconds, resolution, seed, lastFrame)

	if dryRun {
		for _, model := range chosen {
			fmt.Printf("%-32s would cost $%.3f for %ds\n", model, costOf(model, seconds), seconds)
		}
		return nil
	}

	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}
	client := openrouter.NewClient(cfg.OpenRouter.APIKey, "")

	fmt.Printf("%-32s %-10s %-9s %-8s %s\n", "MODEL", "LATENCY", "COST", "BYTES", "RESULT")
	var spent float64
	for _, model := range chosen {
		latency, size, note := renderOne(ctx, client, model, cfg.OpenRouter.APIKey, openrouter.VideoRequest{
			Model:       model,
			Prompt:      prompt,
			Duration:    seconds,
			Resolution:  resolution,
			Seed:        &seed,
			FrameImages: frames,
		}, outDir, timeout)
		cost := costOf(model, seconds)
		if !strings.HasPrefix(note, "submit failed") && !strings.HasPrefix(note, "failed") {
			spent += cost
		}
		fmt.Printf("%-32s %-10s $%-8.3f %-8s %s\n",
			model, latency.Round(time.Second), cost, humanBytes(size), note)
	}
	fmt.Printf("\nspent about $%.3f on %d clips\n", spent, len(chosen))
	fmt.Printf("clips in %s\n", outDir)
	return nil
}

// renderOne never returns an error. One model refusing is a result worth
// recording beside the others, not a reason to abandon the comparison and
// leave the models after it unmeasured.
func renderOne(ctx context.Context, client *openrouter.Client, model, apiKey string,
	request openrouter.VideoRequest, outDir string, timeout time.Duration) (time.Duration, int64, string) {
	started := time.Now()
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	job, err := client.SubmitVideo(ctx, request)
	if err != nil {
		return time.Since(started), 0, "submit failed: " + trim(err.Error())
	}
	status, err := client.WaitForVideo(ctx, job.ID, 3*time.Second)
	if err != nil {
		return time.Since(started), 0, "failed: " + trim(err.Error())
	}
	latency := time.Since(started)

	name := filepath.Join(outDir, strings.NewReplacer("/", "_", ".", "-").Replace(model)+".mp4")
	size, err := download(ctx, status.UnsignedURLs[0], name, apiKey)
	if err != nil {
		// The clip rendered and was billed. Say so, so the spend line is not a
		// lie: "unsigned" names the URL's signature, not its authorisation.
		return latency, 0, "rendered, download failed: " + trim(err.Error())
	}
	return latency, size, "ok"
}

func download(ctx context.Context, url, path, apiKey string) (int64, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	// unsigned_urls are OpenRouter's own content endpoint and still require the
	// key. The name means the URL carries no signature, not that it is public;
	// reading it as "public" cost one billed clip that could not be fetched.
	if strings.HasPrefix(url, "https://openrouter.ai/") {
		request.Header.Set("Authorization", "Bearer "+apiKey)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		return 0, fmt.Errorf("http %d", response.StatusCode)
	}
	file, err := os.Create(path)
	if err != nil {
		return 0, err
	}
	defer file.Close()
	return io.Copy(file, response.Body)
}

func signAsset(ctx context.Context, cfg *config.Config, db *database.DB, assetID string) (string, error) {
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

	var storage services.StorageService
	if cfg.Storage.StorageBackend == "s3" {
		if storage, err = services.NewS3StorageService(cfg); err != nil {
			return "", fmt.Errorf("s3: %w", err)
		}
	} else if storage, err = services.NewLocalStorageService("./uploads", cfg.FrontendURL+"/uploads"); err != nil {
		return "", fmt.Errorf("local storage: %w", err)
	}
	// Long enough to outlast the slowest clip in a comparison. The provider
	// fetches this itself, so an expiry shorter than the queue would fail the
	// last model in the list and look like that model's fault.
	return storage.GetSignedURL(ctx, path, 60*time.Minute)
}

func costOf(model string, seconds int) float64 {
	return pricePerSecond[model] * float64(seconds)
}

func humanBytes(size int64) string {
	if size <= 0 {
		return "-"
	}
	return fmt.Sprintf("%dKB", size/1024)
}

func trim(value string) string {
	value = strings.Join(strings.Fields(value), " ")
	if len(value) > 400 {
		return value[:400] + "…"
	}
	return value
}

func shorten(url string) string {
	if i := strings.Index(url, "?"); i > 0 {
		return url[:i] + "?…"
	}
	return url
}
