// Command zz_model_compare renders the same four portraits from several image
// models so they can be judged against each other rather than one at a time.
//
// The question it exists to answer is whether an SFW SDXL checkpoint can carry
// this product's portraits. That cannot be read off a model card: the worker's
// own comment says vanilla SDXL "renders a generic idealized face, which fights
// persona likeness", and likeness is the entire premise. So the models have to
// draw the same person, from the same words, on the same seeds, and be looked
// at.
//
// It talks to the endpoint directly rather than through the queue for one
// reason: the seed. In the product a seed is derived from the job id, so two
// runs of the same prompt are deliberately two different pictures -- which is
// right there and fatal here, because it would confound the model with the
// seed. Every run below pins the same seeds, so the only thing that changes
// between two directories is the checkpoint.
//
// The model itself is selected by OMNICHAT_IMAGE_MODEL_ID on the endpoint, not
// by anything sent in a request. Switching models means editing the endpoint
// and waiting for a cold start; --label records which one produced a
// directory, and the worker echoes its build back so a stale endpoint cannot
// be mistaken for a result.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/omninudge/backend/internal/services/runpod"
)

// The four seeds every model renders. Fixed, and fixed across models: this is
// the whole basis of the comparison.
var defaultSeeds = []int64{101, 202, 303, 404}

// A described person, not a blank one. An unspecified subject is exactly the
// case where every checkpoint falls back to its own prior, which would compare
// the priors instead of the models' response to a brief.
const defaultAppearance = "A woman in her late twenties with warm brown eyes, " +
	"shoulder-length dark curly hair, light brown skin, and a few freckles across her nose. " +
	"Average build, about five foot six."

// A brief a model would plausibly write, held fixed across every checkpoint.
//
// Written down rather than generated, because a fresh brief per run would make
// the outfit another thing that changed between two models and there would be
// nothing left that did not.
var defaultBrief = services.OmniAICandidateBrief{
	Outfit: "a rust-coloured corduroy overshirt open over a cream long-sleeved top tucked into " +
		"dark straight-leg jeans, brown leather ankle boots, a thin gold chain, and large black " +
		"headphones resting around her neck",
	Setting: "on a path between brick university buildings on an overcast autumn afternoon, " +
		"wet leaves on the ground behind her",
	Holding: "a travel coffee cup",
}

type candidate struct {
	Seed        int64                         `json:"seed"`
	Brief       services.OmniAICandidateBrief `json:"brief"`
	Prompt      string                        `json:"prompt"`
	File        string                        `json:"file"`
	WorkerBuild string                        `json:"worker_build,omitempty"`
	ModelID     string                        `json:"model_id,omitempty"`
	// SHA256 of the rendered bytes. Two runs of the same seed and prompt on
	// the same checkpoint are deterministic, so an identical digest across two
	// labels means one model rendered both -- which is what a warm worker
	// serving its already-loaded pipeline looks like after the model variable
	// was edited. The run reports success either way.
	Digest       string  `json:"digest,omitempty"`
	ReturnedSeed *int64  `json:"returned_seed,omitempty"`
	Portrait     string  `json:"portrait_standard"`
	RenderError  string  `json:"render_error,omitempty"`
	Seconds      float64 `json:"seconds"`
}

type manifest struct {
	Label          string                    `json:"label"`
	RenderedAt     string                    `json:"rendered_at"`
	Appearance     string                    `json:"appearance"`
	Personality    string                    `json:"personality,omitempty"`
	Style          models.OmniAIStyleProfile `json:"style,omitempty"`
	NegativePrompt string                    `json:"negative_prompt"`
	Candidates     []candidate               `json:"candidates"`
}

func main() {
	label := flag.String("label", "", "name of the model the endpoint is currently serving (required)")
	out := flag.String("out", "model-compare", "directory to write results into")
	appearance := flag.String("appearance", defaultAppearance, "the appearance description to render")
	seedList := flag.String("seeds", "", "comma-separated seeds (default 101,202,303,404)")
	sheet := flag.Bool("sheet", false, "build the comparison page from directories already rendered, and render nothing")
	dryRun := flag.String("dry-run", "", "write the payloads to this file and submit nothing")
	personality := flag.String("personality", "", "her personality, in prose. Set it to write the four briefs for real instead of reusing one fixed brief.")
	briefsFrom := flag.String("briefs-from", "", "reuse the briefs from an earlier run's manifest.json, so a prompt change is the only thing that differs")
	styleNote := flag.String("style-note", "", "the creator's own words about how she dresses, passed to the style writer")
	noStyle := flag.Bool("no-style", false, "skip the style writer, so the briefs are written from her personality alone")
	timeout := flag.Duration("timeout", 8*time.Minute, "how long to wait for one render")
	flag.Parse()

	if *sheet {
		if err := buildSheet(*out); err != nil {
			fail(err)
		}
		return
	}
	if strings.TrimSpace(*label) == "" {
		fail(errors.New("--label is required: it records which checkpoint the endpoint was serving"))
	}
	seeds, err := parseSeeds(*seedList)
	if err != nil {
		fail(err)
	}
	if err := run(*label, *out, *appearance, *personality, *briefsFrom, *styleNote, *noStyle,
		seeds, *timeout, *dryRun); err != nil {
		fail(err)
	}
}

func run(
	label, out, appearance, personality, briefsFrom, styleNote string, noStyle bool,
	seeds []int64, timeout time.Duration, dryRun string,
) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	media := cfg.OmniChatMedia
	if strings.TrimSpace(media.RunPodAPIKey) == "" {
		return errors.New("RUNPOD_API_KEY is not set")
	}
	endpoint := strings.TrimSpace(media.RunPodImageEndpointID)
	if endpoint == "" {
		return errors.New("RUNPOD_IMAGE_ENDPOINT_ID is not set")
	}

	profile := models.OmniChatMediaIdentityProfile{Appearance: appearance}
	briefs, err := briefsFor(cfg, personality, briefsFrom, styleNote, noStyle, &profile, len(seeds))
	if err != nil {
		return err
	}
	negative := services.OmniAIRenderNegativePrompt

	dir := filepath.Join(out, sanitize(label))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}

	if dryRun != "" {
		// Checked against the worker's own validator rather than read. The two
		// ends of this contract have disagreed before, and a field the worker
		// refuses costs a GPU minute per seed to find out about.
		payloads := map[string]any{}
		for i, seed := range seeds {
			payloads[fmt.Sprintf("seed-%d", seed)] = imageInput(
				services.BuildOmniAILikenessPrompt(profile, briefs[i]), negative, seed)
		}
		if err := writeJSON(dryRun, payloads); err != nil {
			return err
		}
		fmt.Printf("wrote %s -- submitted nothing\n", dryRun)
		return nil
	}

	client := runpod.NewClient(media.RunPodAPIKey, media.RunPodBaseURL)

	// Left nil when the review is not configured, and every verdict then reads
	// "unavailable". Built through a nil *Client instead, the interface would
	// be non-nil while the pointer inside it was nil, so the review's own
	// "not configured" guard would pass and the call would panic -- reporting
	// a checkpoint as unjudged is the one thing this must not get wrong.
	var review *services.OpenRouterRenderedImageReview
	if apiClient := openRouterClient(cfg); apiClient != nil {
		review = services.NewOpenRouterRenderedImageReview(apiClient)
	} else {
		fmt.Println("note: the portrait review is not configured, so nothing below is judged.")
	}

	fmt.Printf("label:    %s\nendpoint: %s\nseeds:    %v\n\n", label, endpoint, seeds)

	record := manifest{
		Label:          label,
		RenderedAt:     time.Now().UTC().Format(time.RFC3339),
		Appearance:     appearance,
		Personality:    personality,
		Style:          profile.Style,
		NegativePrompt: negative,
	}

	for i, seed := range seeds {
		brief := briefs[i]
		prompt := services.BuildOmniAILikenessPrompt(profile, brief)
		fmt.Printf("  outfit:  %s\n  setting: %s\n  holding: %s\n", brief.Outfit, brief.Setting, orDash(brief.Holding))
		started := time.Now()
		fmt.Printf("seed %d ... ", seed)
		entry := candidate{Seed: seed, Portrait: "not checked", Brief: brief, Prompt: prompt}

		file, result, err := render(context.Background(), client, endpoint, prompt, negative, seed, dir, timeout)
		entry.Seconds = time.Since(started).Seconds()
		if err != nil {
			entry.RenderError = err.Error()
			fmt.Printf("FAILED after %.0fs: %v\n", entry.Seconds, err)
			record.Candidates = append(record.Candidates, entry)
			continue
		}
		entry.File = filepath.Base(file)
		entry.WorkerBuild = result.WorkerBuild
		entry.ModelID = result.ModelID
		entry.Digest = digestOf(file)
		entry.ReturnedSeed = result.Seed

		// The classifier is the same one the pipeline runs, against the same
		// standard, so a pass rate here is the pass rate the product would see.
		var refused bool
		reviewErr := errors.New("review is not configured")
		if review != nil {
			refused, reviewErr = review.ReviewRenderedImageAgainst(
				context.Background(), file, "image/png", services.OmniChatImageStandardPortrait)
		}
		switch {
		case reviewErr != nil:
			entry.Portrait = "unavailable: " + reviewErr.Error()
		case refused:
			entry.Portrait = "FAIL"
		default:
			entry.Portrait = "PASS"
		}
		fmt.Printf("%s in %.0fs  portrait=%s  build=%s  model=%s\n",
			entry.File, entry.Seconds, entry.Portrait, orDash(result.WorkerBuild),
			orDash(result.ModelID))
		record.Candidates = append(record.Candidates, entry)
	}

	if err := writeJSON(filepath.Join(dir, "manifest.json"), record); err != nil {
		return err
	}
	summarize(record)
	fmt.Printf("\nwrote %s\n", dir)
	return nil
}

// briefsFor returns one brief per seed.
//
// With --personality it runs the real writer against a persona built from the
// same words the picture prompt is built from, so the thing being looked at is
// what the product would actually produce -- the briefs included. Without it,
// one fixed brief is repeated, which is what a model comparison wants: a brief
// that varied per seed would make the clothes another thing that changed
// between two checkpoints, and there would be nothing left that did not.
func briefsFor(
	cfg *config.Config, personality, briefsFrom, styleNote string, noStyle bool,
	profile *models.OmniChatMediaIdentityProfile, count int,
) ([]services.OmniAICandidateBrief, error) {
	// Reused from an earlier run when asked. Writing fresh briefs would make the
	// clothes change alongside the prompt, and there would be nothing left to
	// attribute a different result to.
	if strings.TrimSpace(briefsFrom) != "" {
		raw, err := os.ReadFile(briefsFrom)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", briefsFrom, err)
		}
		var earlier manifest
		if err := json.Unmarshal(raw, &earlier); err != nil {
			return nil, fmt.Errorf("%s: %w", briefsFrom, err)
		}
		reused := make([]services.OmniAICandidateBrief, 0, count)
		for _, entry := range earlier.Candidates {
			reused = append(reused, entry.Brief)
		}
		if len(reused) != count {
			return nil, fmt.Errorf("%s holds %d briefs and %d seeds were asked for",
				briefsFrom, len(reused), count)
		}
		fmt.Printf("briefs reused from %s\n\n", briefsFrom)
		return reused, nil
	}

	repeated := make([]services.OmniAICandidateBrief, count)
	for i := range repeated {
		repeated[i] = defaultBrief
	}
	if strings.TrimSpace(personality) == "" {
		return repeated, nil
	}

	model := strings.TrimSpace(cfg.OpenRouter.ExtractionModel)
	if model == "" {
		model = strings.TrimSpace(cfg.OpenRouter.StandardFallback)
	}
	if model == "" || strings.TrimSpace(cfg.OpenRouter.APIKey) == "" {
		return nil, errors.New("--personality needs OPENROUTER_API_KEY and a model to write the briefs with")
	}

	// Refused rather than quietly falling back to the fixed brief. Asking for
	// real briefs and silently getting four identical ones would be read as the
	// writer having produced them.
	persona := &models.BotPersona{Name: "Candidate", Personality: personality}

	// Her taste, written by the real writer, then carried on the profile the
	// brief writer resolves it from. This is the whole experiment: the same
	// person and the same seeds, dressed once out of a written wardrobe and
	// once out of her personality alone.
	// Encoded before the style is written, not after. The writer reads her
	// description off this blob, so setting it afterwards left it empty and the
	// wardrobe came back written for nobody -- "She wears..." for a man.
	persona.ExtensionsJSON = mustEncodeProfile(*profile)
	if !noStyle {
		style, err := services.NewModelOmniAIStyleWriter(
			openrouter.NewClient(cfg.OpenRouter.APIKey, model),
		).WriteStyleProfile(context.Background(), persona, styleNote)
		if err != nil {
			return nil, fmt.Errorf("write her style: %w", err)
		}
		profile.Style = style
		fmt.Printf("taste:     %s\nsignature: %s\nnote:      %s\n\n",
			style.Taste, orDash(style.SignatureItem), orDash(style.Note))
	}
	persona.ExtensionsJSON = mustEncodeProfile(*profile)

	written, err := services.NewModelOmniAICandidateBriefWriter(
		openrouter.NewClient(cfg.OpenRouter.APIKey, model),
	).WriteCandidateBriefs(context.Background(), persona, count)
	if err != nil {
		return nil, fmt.Errorf("write the briefs: %w", err)
	}
	fmt.Printf("briefs written by %s\n\n", model)
	return written, nil
}

// mustEncodeProfile puts the profile where ResolveOmniChatMediaIdentityProfile
// reads it, so the brief writer receives her taste through the same path the
// product uses rather than through a field this command sets directly.
func mustEncodeProfile(profile models.OmniChatMediaIdentityProfile) []byte {
	encoded, err := json.Marshal(struct {
		OmniChatMedia models.OmniChatMediaIdentityProfile `json:"omnichat_media"`
	}{OmniChatMedia: profile})
	if err != nil {
		return nil
	}
	return encoded
}

// imageInput is field for field what BuildImageSpec sends for an anchor
// likeness: the same 9:16 frame, the same png, the same create mode the backend
// rewrites likeness to. A comparison run against a payload of this command's
// own invention would measure this command.
func imageInput(prompt, negative string, seed int64) map[string]any {
	return map[string]any{
		"kind":            "image",
		"mode":            "create",
		"prompt":          prompt,
		"negative_prompt": negative,
		"num_images":      1,
		"aspect_ratio":    "9:16",
		"output_format":   "png",
		"seed":            seed,
	}
}

// render submits one job and waits for it, saving the first image it returns.
//
// Submit wraps the input in its own envelope, so this passes it bare: wrapping
// it here as well nests one inside the other and the worker refuses the request
// at the door.
func render(
	ctx context.Context, client *runpod.Client, endpoint, prompt, negative string,
	seed int64, dir string, timeout time.Duration,
) (string, *runpod.Result, error) {
	input := imageInput(prompt, negative, seed)
	jobID, err := client.Submit(ctx, endpoint, input)
	if err != nil {
		return "", nil, fmt.Errorf("submit: %w", err)
	}

	deadline := time.Now().Add(timeout)
	for {
		if time.Now().After(deadline) {
			return "", nil, fmt.Errorf("job %s did not finish within %s", jobID, timeout)
		}
		time.Sleep(5 * time.Second)
		status, err := client.Status(ctx, endpoint, jobID)
		if err != nil {
			return "", nil, fmt.Errorf("status: %w", err)
		}
		switch status.Status {
		case runpod.StatusCompleted:
			result, err := client.Result(ctx, endpoint, jobID)
			if err != nil {
				return "", nil, fmt.Errorf("result: %w", err)
			}
			file, err := saveFirstImage(ctx, result, dir, seed)
			return file, result, err
		case runpod.StatusFailed, runpod.StatusCancelled, runpod.StatusTimedOut:
			return "", nil, fmt.Errorf("job %s ended %s: %s", jobID, status.Status, status.Error)
		}
	}
}

func saveFirstImage(ctx context.Context, result *runpod.Result, dir string, seed int64) (string, error) {
	images := result.Images
	if len(images) == 0 && result.Image != nil {
		images = []runpod.MediaFile{*result.Image}
	}
	if len(images) == 0 {
		return "", errors.New("the worker returned no image")
	}
	url := strings.TrimSpace(images[0].URL)
	if url == "" {
		return "", errors.New("the worker returned an image with no url")
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return "", fmt.Errorf("download: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download returned %s", response.Status)
	}

	path := filepath.Join(dir, fmt.Sprintf("seed-%d.png", seed))
	file, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer func() { _ = file.Close() }()
	if _, err := io.Copy(file, response.Body); err != nil {
		return "", fmt.Errorf("save: %w", err)
	}
	return path, nil
}

// openRouterClient builds the same review client the worker builds, or nil
// when the review is not configured -- in which case every verdict below reads
// "unavailable" rather than quietly reading "PASS".
func openRouterClient(cfg *config.Config) *openrouter.Client {
	model := strings.TrimSpace(cfg.OpenRouter.ImageReviewModel)
	if model == "" || strings.TrimSpace(cfg.OpenRouter.APIKey) == "" {
		return nil
	}
	return openrouter.NewClient(cfg.OpenRouter.APIKey, model)
}

func parseSeeds(list string) ([]int64, error) {
	if strings.TrimSpace(list) == "" {
		return defaultSeeds, nil
	}
	var seeds []int64
	for _, item := range strings.Split(list, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		seed, err := strconv.ParseInt(item, 10, 64)
		if err != nil || seed < 0 {
			return nil, fmt.Errorf("%q is not a seed: the worker takes a non-negative integer", item)
		}
		seeds = append(seeds, seed)
	}
	if len(seeds) == 0 {
		return nil, errors.New("--seeds listed no seeds")
	}
	return seeds, nil
}

// sanitize keeps a model id usable as one directory name.
func sanitize(label string) string {
	replaced := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '.', r == '_':
			return r
		default:
			return '-'
		}
	}, strings.TrimSpace(label))
	return strings.Trim(replaced, "-")
}

func summarize(record manifest) {
	var pass, fail, errored int
	for _, entry := range record.Candidates {
		switch {
		case entry.RenderError != "":
			errored++
		case entry.Portrait == "PASS":
			pass++
		case entry.Portrait == "FAIL":
			fail++
		}
	}
	fmt.Printf("\n%s: %d passed the portrait standard, %d failed, %d did not render\n",
		record.Label, pass, fail, errored)
}

// digestOf hashes a rendered file, and returns "" rather than failing: a
// missing digest weakens the duplicate check but must never lose a render.
func digestOf(path string) string {
	file, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer func() { _ = file.Close() }()
	sum := sha256.New()
	if _, err := io.Copy(sum, file); err != nil {
		return ""
	}
	return hex.EncodeToString(sum.Sum(nil))
}

// duplicateLabels reports groups of runs whose every render is byte-identical.
//
// This is the check that catches a model switch which did not take. Editing
// OMNICHAT_IMAGE_MODEL_ID does not disturb a worker that is already warm, so
// the endpoint keeps serving the checkpoint it loaded first and the run
// succeeds, passes, and is labelled with a model that never rendered it.
// Nothing in a per-run result says so; only two runs side by side do.
func duplicateLabels(manifests []manifest) [][]string {
	bySignature := map[string][]string{}
	for _, record := range manifests {
		var parts []string
		complete := true
		for _, entry := range record.Candidates {
			if entry.Digest == "" {
				complete = false
				break
			}
			parts = append(parts, fmt.Sprintf("%d:%s", entry.Seed, entry.Digest))
		}
		if !complete || len(parts) == 0 {
			continue
		}
		sort.Strings(parts)
		signature := strings.Join(parts, "|")
		bySignature[signature] = append(bySignature[signature], record.Label)
	}
	var groups [][]string
	for _, labels := range bySignature {
		if len(labels) > 1 {
			sort.Strings(labels)
			groups = append(groups, labels)
		}
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i][0] < groups[j][0] })
	return groups
}

func writeJSON(path string, value any) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(raw, '\n'), 0o644)
}

func orDash(value string) string {
	if strings.TrimSpace(value) == "" {
		return "-"
	}
	return value
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "zz_model_compare:", err)
	os.Exit(1)
}

// buildSheet lays every rendered directory out as one page: a row per seed, a
// column per model.
//
// Arranged that way on purpose. Reading four portraits from one model tells you
// whether that model is any good; reading one seed across four models is the
// only way to see what the checkpoint changed, because everything else about
// the render was held still.
func buildSheet(out string) error {
	entries, err := os.ReadDir(out)
	if err != nil {
		return fmt.Errorf("read %s: %w", out, err)
	}

	var manifests []manifest
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(out, entry.Name(), "manifest.json"))
		if err != nil {
			continue
		}
		var record manifest
		if err := json.Unmarshal(raw, &record); err != nil {
			return fmt.Errorf("%s/manifest.json: %w", entry.Name(), err)
		}
		record.Label = entry.Name()
		manifests = append(manifests, record)
	}
	if len(manifests) == 0 {
		return fmt.Errorf("no rendered model directories under %s: run without --sheet first", out)
	}
	sort.Slice(manifests, func(i, j int) bool { return manifests[i].Label < manifests[j].Label })

	seeds := collectSeeds(manifests)
	var page strings.Builder
	page.WriteString(sheetHeader)
	page.WriteString("<h1>Portrait model comparison</h1>")
	fmt.Fprintf(&page, "<p class=meta>%d models &middot; %d seeds &middot; same prompt, same seeds, "+
		"only the checkpoint differs.</p>", len(manifests), len(seeds))

	for _, group := range duplicateLabels(manifests) {
		fmt.Fprintf(&page, "<p class=alarm><strong>%s rendered identical bytes.</strong> "+
			"The same seed and prompt on the same checkpoint is deterministic, so one model "+
			"produced all of them. A model switch that did not take looks exactly like this: "+
			"editing the model variable leaves a warm worker serving the pipeline it already "+
			"loaded. Replace the worker and render again before reading anything below.</p>",
			escape(strings.Join(group, " and ")))
	}

	page.WriteString("<table><thead><tr><th>seed</th>")
	for _, record := range manifests {
		fmt.Fprintf(&page, "<th>%s<span>%s</span><span>%s</span></th>",
			escape(record.Label), escape(passRate(record)), escape(reportedModel(record)))
	}
	page.WriteString("</tr></thead><tbody>")

	for _, seed := range seeds {
		fmt.Fprintf(&page, "<tr><th class=seed>%d</th>", seed)
		for _, record := range manifests {
			page.WriteString(cellFor(record, seed))
		}
		page.WriteString("</tr>")
	}
	page.WriteString("</tbody></table>")

	if len(manifests[0].Candidates) > 0 {
		page.WriteString("<h2>The prompt every model was given, for the first seed</h2>")
		fmt.Fprintf(&page, "<pre>%s</pre>", escape(manifests[0].Candidates[0].Prompt))
	}
	page.WriteString("<h2>Negative prompt</h2>")
	fmt.Fprintf(&page, "<pre>%s</pre>", escape(manifests[0].NegativePrompt))
	page.WriteString("</body></html>")

	path := filepath.Join(out, "comparison.html")
	if err := os.WriteFile(path, []byte(page.String()), 0o644); err != nil {
		return err
	}
	fmt.Printf("wrote %s (%d models, %d seeds)\n", path, len(manifests), len(seeds))
	return nil
}

func cellFor(record manifest, seed int64) string {
	for _, entry := range record.Candidates {
		if entry.Seed != seed {
			continue
		}
		if entry.RenderError != "" {
			return fmt.Sprintf("<td class=missing><div class=err>did not render</div><small>%s</small></td>",
				escape(entry.RenderError))
		}
		verdict := "unknown"
		switch entry.Portrait {
		case "PASS", "FAIL":
			verdict = strings.ToLower(entry.Portrait)
		}
		src := escape(filepath.Join(record.Label, entry.File))
		return fmt.Sprintf(
			"<td><a href=\"%s\"><img src=\"%s\" loading=lazy alt=\"%s seed %d\"></a>"+
				"<div class=\"verdict %s\">%s</div><small>%.0fs &middot; %s</small>"+
				"<p class=brief><b>%s</b><br>%s</p></td>",
			src, src, escape(record.Label), seed, verdict, escape(entry.Portrait),
			entry.Seconds, escape(orDash(entry.WorkerBuild)),
			escape(entry.Brief.Outfit), escape(entry.Brief.Setting))
	}
	return "<td class=missing><div class=err>not rendered</div></td>"
}

func collectSeeds(manifests []manifest) []int64 {
	seen := map[int64]bool{}
	var seeds []int64
	for _, record := range manifests {
		for _, entry := range record.Candidates {
			if !seen[entry.Seed] {
				seen[entry.Seed] = true
				seeds = append(seeds, entry.Seed)
			}
		}
	}
	sort.Slice(seeds, func(i, j int) bool { return seeds[i] < seeds[j] })
	return seeds
}

// reportedModel is what the worker said it loaded, which is not necessarily
// what the label claims. Workers built before the model id was reported say
// nothing, and an empty answer is shown as unreported rather than as agreement.
func reportedModel(record manifest) string {
	seen := map[string]bool{}
	for _, entry := range record.Candidates {
		if strings.TrimSpace(entry.ModelID) != "" {
			seen[entry.ModelID] = true
		}
	}
	if len(seen) == 0 {
		return "model unreported"
	}
	names := make([]string, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	sort.Strings(names)
	return strings.Join(names, " + ")
}

func passRate(record manifest) string {
	var pass, total int
	for _, entry := range record.Candidates {
		if entry.RenderError != "" {
			continue
		}
		total++
		if entry.Portrait == "PASS" {
			pass++
		}
	}
	if total == 0 {
		return "nothing rendered"
	}
	return fmt.Sprintf("%d/%d passed", pass, total)
}

func escape(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;")
	return replacer.Replace(value)
}

const sheetHeader = `<!doctype html><meta charset=utf-8>
<title>Portrait model comparison</title>
<style>
:root { color-scheme: light dark; --line:#d8d4cd; --muted:#6b665e; --bg:#faf9f7; --fg:#1b1a18; }
@media (prefers-color-scheme: dark) {
  :root { --line:#35322d; --muted:#9a938a; --bg:#151412; --fg:#eceae6; }
}
body { margin:0; padding:2rem; background:var(--bg); color:var(--fg);
  font:14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
h1 { font-size:1.4rem; margin:0 0 .25rem; }
h2 { font-size:1rem; margin:2rem 0 .5rem; }
.meta { color:var(--muted); margin:0 0 1.5rem; }
table { border-collapse:collapse; }
th, td { border:1px solid var(--line); padding:.5rem; vertical-align:top; text-align:center; }
thead th { font-weight:600; }
thead th span { display:block; font-weight:400; color:var(--muted); font-size:.8rem; }
.seed { color:var(--muted); font-weight:400; }
img { display:block; width:230px; height:auto; border-radius:3px; }
.verdict { margin-top:.4rem; font-weight:600; font-size:.8rem; }
.verdict.pass { color:#1f7a45; }
.verdict.fail { color:#b3261e; }
.verdict.unknown { color:var(--muted); }
small { display:block; color:var(--muted); font-size:.72rem; margin-top:.15rem; }
.missing { color:var(--muted); width:230px; }
.brief { width:230px; margin:.5rem 0 0; text-align:left; font-size:.72rem;
  color:var(--muted); line-height:1.35; }
.err { font-weight:600; }
.alarm { border:1px solid #b3261e; border-left-width:4px; border-radius:4px;
  padding:.75rem 1rem; max-width:70ch; margin:0 0 1.25rem; }
pre { white-space:pre-wrap; background:rgba(128,128,128,.1); padding:.75rem;
  border-radius:4px; max-width:70ch; }
</style><body>
`
