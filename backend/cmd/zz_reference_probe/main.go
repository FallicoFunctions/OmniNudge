// Command zz_reference_probe renders one reference variant at seeds it controls.
//
// Six attempts at the portrait framing were argued from runs that could not
// support the argument. A reference takes its seed from the job id, so every
// re-run draws new seeds; each run produces three portraits; and the model is
// stochastic. Comparing two such runs and attributing the difference to the
// change between them is not a weak experiment, it is not an experiment -- and
// it is how the body adapter came to be blamed for something it does not do.
//
// This renders the same variant at the same seeds, straight to the endpoint, so
// an arm can be compared with an arm. It reuses the real prompt builder, the
// real negative prompt and the real aspect: a probe against a payload of its
// own invention would measure the probe.
//
// It writes nothing to her profile, and the product keeps no seed override --
// the product wants a seed that is stable per job and has no reason to expose
// one.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/runpod"
)

func main() {
	personaID := flag.Int("persona", 0, "the OmniAI to render references for (required)")
	variant := flag.String("variant", "portrait_neutral", "which reference variant")
	seedList := flag.String("seeds", "11,22,33,44", "comma-separated seeds, the same across arms")
	label := flag.String("label", "", "name for this arm (required)")
	out := flag.String("out", "reference-probe", "directory to write into")
	bodyAdapter := flag.String("body-adapter", "", "off | on | unset -- what to send, or nothing")
	adapterScale := flag.Float64("adapter-scale", 0, "identity_adapter_scale to send; 0 uses her profile's")
	timeout := flag.Duration("timeout", 20*time.Minute, "per render")
	flag.Parse()

	if *personaID == 0 || strings.TrimSpace(*label) == "" {
		fmt.Fprintln(os.Stderr, "zz_reference_probe: --persona and --label are required")
		os.Exit(1)
	}
	if err := probe(*personaID, *variant, *label, *out, *bodyAdapter, *seedList, *adapterScale, *timeout); err != nil {
		fmt.Fprintln(os.Stderr, "zz_reference_probe:", err)
		os.Exit(1)
	}
}

func probe(personaID int, variant, label, out, bodyAdapter, seedList string,
	adapterScale float64, timeout time.Duration) error {
	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		return err
	}
	defer db.Close()

	persona, err := models.NewBotPersonaRepository(db.Pool).GetByID(ctx, personaID)
	if err != nil {
		return err
	}
	profile := services.ResolveOmniChatMediaIdentityProfile(persona)
	if len(profile.ReferenceURLs) == 0 {
		return fmt.Errorf("persona %d has no anchor to condition on", personaID)
	}

	storage, err := storageFor(cfg)
	if err != nil {
		return err
	}
	anchorKey := strings.TrimPrefix(strings.SplitN(profile.ReferenceURLs[0], "?", 2)[0], "/uploads/")
	anchorURL, err := storage.GetSignedURL(ctx, anchorKey, time.Hour)
	if err != nil {
		return fmt.Errorf("sign the anchor: %w", err)
	}

	aspect, found := services.OmniAIReferenceVariantAspect(variant)
	if !found {
		return fmt.Errorf("no such variant %q; have %v", variant, services.OmniAIReferenceVariantKeys())
	}
	faceAppearance := ""
	if facts, ok := services.OmniAIAppearanceFactsFor(persona); ok {
		faceAppearance = services.RenderOmniAIFaceAppearance(facts)
	}
	prompt := services.BuildOmniAIReferencePrompt(profile, variant, faceAppearance)

	seeds, err := parseSeeds(seedList)
	if err != nil {
		return err
	}
	dir := filepath.Join(out, label)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	client := runpod.NewClient(cfg.OmniChatMedia.RunPodAPIKey, cfg.OmniChatMedia.RunPodBaseURL)

	scale := profile.AdapterScale
	if adapterScale > 0 {
		scale = adapterScale
	}
	fmt.Printf("arm:      %s\nvariant:  %s (%s)\nseeds:    %v\nbody:     %s\nscale:    %.2f\nprompt:   %s\n\n",
		label, variant, aspect, seeds, orUnset(bodyAdapter), scale, prompt)

	for _, seed := range seeds {
		input := map[string]any{
			"kind": "image", "mode": "create", "prompt": prompt,
			"negative_prompt": services.OmniAIRenderNegativePrompt,
			"num_images":      1, "aspect_ratio": aspect, "output_format": "png",
			"seed":                   seed,
			"identity_mode":          string(profile.Mode),
			"identity_adapter":       profile.Adapter,
			"identity_adapter_scale": scale,
			"reference_image_urls":   []string{anchorURL},
		}
		switch strings.ToLower(strings.TrimSpace(bodyAdapter)) {
		case "off":
			input["body_adapter"] = false
		case "on":
			input["body_adapter"] = true
		}

		started := time.Now()
		fmt.Printf("seed %d ... ", seed)
		file, renderErr := render(ctx, client, cfg.OmniChatMedia.RunPodImageEndpointID, input, dir, seed, timeout)
		if renderErr != nil {
			fmt.Printf("FAILED after %.0fs: %v\n", time.Since(started).Seconds(), renderErr)
			continue
		}
		fmt.Printf("%s in %.0fs\n", filepath.Base(file), time.Since(started).Seconds())
	}

	manifest, err := json.MarshalIndent(map[string]any{
		"label": label, "variant": variant, "aspect": aspect, "seeds": seeds,
		"body_adapter": orUnset(bodyAdapter), "identity_adapter_scale": scale, "prompt": prompt,
	}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "manifest.json"), append(manifest, '\n'), 0o644)
}

func storageFor(cfg *config.Config) (services.StorageService, error) {
	if cfg.Storage.StorageBackend == "s3" {
		return services.NewS3StorageService(cfg)
	}
	return services.NewLocalStorageService("./uploads", cfg.FrontendURL+"/uploads")
}

func parseSeeds(list string) ([]int64, error) {
	var seeds []int64
	for _, item := range strings.Split(list, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		seed, err := strconv.ParseInt(item, 10, 64)
		if err != nil || seed < 0 {
			return nil, fmt.Errorf("%q is not a seed", item)
		}
		seeds = append(seeds, seed)
	}
	if len(seeds) == 0 {
		return nil, fmt.Errorf("no seeds given")
	}
	return seeds, nil
}

func orUnset(value string) string {
	if strings.TrimSpace(value) == "" {
		return "unset"
	}
	return value
}

func render(ctx context.Context, client *runpod.Client, endpoint string,
	input map[string]any, dir string, seed int64, timeout time.Duration) (string, error) {
	jobID, err := client.Submit(ctx, endpoint, input)
	if err != nil {
		return "", err
	}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		time.Sleep(5 * time.Second)
		status, err := client.Status(ctx, endpoint, jobID)
		if err != nil {
			return "", err
		}
		switch status.Status {
		case runpod.StatusCompleted:
			result, err := client.Result(ctx, endpoint, jobID)
			if err != nil {
				return "", err
			}
			if len(result.Images) == 0 {
				return "", fmt.Errorf("the worker returned no image")
			}
			return save(ctx, result.Images[0].URL, dir, seed)
		case runpod.StatusFailed, runpod.StatusCancelled, runpod.StatusTimedOut:
			return "", fmt.Errorf("%s: %s", status.Status, status.Error)
		}
	}
	return "", fmt.Errorf("did not finish within %s", timeout)
}

func save(ctx context.Context, url, dir string, seed int64) (string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return "", err
	}
	defer func() { _ = response.Body.Close() }()
	path := filepath.Join(dir, fmt.Sprintf("seed-%d.png", seed))
	file, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer func() { _ = file.Close() }()
	_, err = io.Copy(file, response.Body)
	return path, err
}
