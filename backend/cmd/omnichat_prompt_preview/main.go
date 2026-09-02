// Command omnichat_prompt_preview prints exactly what a "Scene photo" request
// would send to the GPU worker for a real conversation, without spending a
// RunPod cold start or any GPU time.
//
// Image generation is only reachable through a CUDA worker, so the feedback
// loop for prompt and scene-state changes is otherwise minutes long and costs
// money per attempt. This command closes that loop: it resolves the same scene
// state, runs the same NormalizeOmniChatGenerationRequest and
// BuildRunPodGenerationSpec the queue uses, and prints the resulting payload.
//
// It is read-only. It never submits a job and never writes to the database.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/services"
)

// placeholderReferenceURL stands in for the presigned persona reference.
// Signing needs live object-storage credentials and contributes nothing to
// prompt inspection, but BuildRunPodGenerationSpec validates the URL shape, so
// the payload must still carry a well-formed HTTPS reference.
const placeholderReferenceURL = "https://storage.googleapis.com/omnichat-preview/persona-reference.png"

// placeholderEndpointID stands in for a RunPod endpoint that is not configured.
//
// Same reasoning as the reference URL above: this command exists to read the
// prompt without GPU access, and BuildImageSpec refuses an empty endpoint id --
// so a machine with no RunPod credentials, which is exactly the machine this is
// most useful on, could not run it at all. The id is only ever printed.
const placeholderEndpointID = "endpoint-not-configured"

// withPreviewEndpoints fills in whatever the deployment has not configured, so
// the payload can be built and read anywhere.
func withPreviewEndpoints(media config.OmniChatMediaConfig) config.OmniChatMediaConfig {
	if strings.TrimSpace(media.RunPodImageEndpointID) == "" {
		media.RunPodImageEndpointID = placeholderEndpointID
	}
	if strings.TrimSpace(media.RunPodVideoEndpointID) == "" {
		media.RunPodVideoEndpointID = placeholderEndpointID
	}
	return media
}

// placeholderSourceStillURL stands in for the still the image phase has not
// rendered yet. A video preview is about the motion prompt and the request
// shape, neither of which depends on the actual frame.
const placeholderSourceStillURL = "https://storage.googleapis.com/omnichat-preview/source-still.png"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	conversationID := flag.Int("conversation", 0, "conversation id to preview")
	ownerUserID := flag.Int("owner", 0, "owning user id for the conversation")
	personaID := flag.Int("persona", 0, "persona id (defaults to the conversation's persona)")
	mode := flag.String("mode", string(models.OmniChatGenerationModeContextual), "generation mode: contextual, create, or likeness")
	kind := flag.String("kind", string(models.OmniChatMediaKindImage), "media kind: image or video")
	prompt := flag.String("prompt", "", "requested view; defaults to the Scene photo button's prompt")
	aspect := flag.String("aspect", "4:5", "aspect ratio")
	asJSON := flag.Bool("json", false, "emit the raw provider payload as JSON only")
	flag.Parse()

	// A likeness is her first picture and happens before any conversation
	// exists, so it needs a persona and nothing else. Previewing it is the only
	// way to read that prompt without a GPU, and it is the one prompt nothing
	// else in this command could reach.
	previewingLikeness := models.OmniChatGenerationMode(strings.ToLower(strings.TrimSpace(*mode))) ==
		models.OmniChatGenerationModeLikeness
	if previewingLikeness {
		if *personaID < 1 || *ownerUserID < 1 {
			return errors.New("--persona and --owner are required for a likeness")
		}
	} else if *conversationID < 1 || *ownerUserID < 1 {
		return errors.New("--conversation and --owner are required")
	}
	mediaKind := models.OmniChatMediaKind(strings.ToLower(strings.TrimSpace(*kind)))
	if mediaKind != models.OmniChatMediaKindImage && mediaKind != models.OmniChatMediaKindVideo {
		return errors.New("--kind must be image or video")
	}

	_ = godotenv.Load(".env", "backend/.env")
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	media := models.NewOmniChatMediaRepository(db.Pool)
	personas := models.NewBotPersonaRepository(db.Pool)

	resolvedPersonaID := *personaID
	if resolvedPersonaID < 1 && !previewingLikeness {
		resolvedPersonaID, err = conversationPersonaID(ctx, db, *conversationID, *ownerUserID)
		if err != nil {
			return err
		}
	}
	persona, err := personas.GetAccessibleByID(ctx, resolvedPersonaID, ownerUserID)
	if err != nil {
		return fmt.Errorf("load persona: %w", err)
	}
	if persona == nil {
		return fmt.Errorf("persona %d is not accessible to user %d", resolvedPersonaID, *ownerUserID)
	}

	// Her whole instruction is built by the server from her description, so a
	// likeness preview ignores --prompt entirely rather than pretending a
	// caller has a say in it.
	if previewingLikeness {
		return previewLikeness(cfg, persona, *ownerUserID, *asJSON)
	}

	requestedPrompt := strings.TrimSpace(*prompt)
	if requestedPrompt == "" {
		requestedPrompt = "Show the current scene as a candid photo, preserving the character, setting, outfit, mood, and activity."
	}
	request := models.OmniChatGenerationRequest{
		Kind:           mediaKind,
		Mode:           models.OmniChatGenerationMode(*mode),
		PersonaID:      resolvedPersonaID,
		ConversationID: conversationID,
		Prompt:         requestedPrompt,
		AspectRatio:    *aspect,
	}

	// Mirror the service: contextual requests take server-owned scene state and
	// recent events, never anything supplied by the caller.
	if request.Mode == models.OmniChatGenerationModeContextual {
		scene, err := media.GetConversationSceneOwned(ctx, *conversationID, *ownerUserID)
		if err != nil {
			return fmt.Errorf("load conversation scene: %w", err)
		}
		if scene != nil {
			request.Scene = *scene
		}
		events, err := media.GetRecentConversationEventsOwned(ctx, *conversationID, *ownerUserID, 5)
		if err != nil {
			return fmt.Errorf("load recent events: %w", err)
		}
		request.Scene.RecentEvents = events
	}

	normalized, err := services.NormalizeOmniChatGenerationRequest(request)
	if err != nil {
		return fmt.Errorf("normalize request: %w", err)
	}

	job := &models.OmniChatGenerationJob{
		OwnerUserID:     *ownerUserID,
		PersonaID:       resolvedPersonaID,
		ConversationID:  conversationID,
		Kind:            normalized.Kind,
		Mode:            normalized.Mode,
		Prompt:          normalized.Prompt,
		NegativePrompt:  normalized.NegativePrompt,
		EffectivePrompt: normalized.EffectivePrompt,
		AspectRatio:     normalized.AspectRatio,
		Scene:           normalized.Scene,
		IdentityProfile: services.ResolveOmniChatMediaIdentityProfile(persona),
	}
	// Mirror the queue's resolveInputs, which folds the persona's stable
	// appearance into the scene just before submission. Without this the
	// preview would understate what actually ships.
	if job.Scene.SubjectAppearance == "" {
		job.Scene.SubjectAppearance = job.IdentityProfile.Appearance
	}
	// The image spec is what a Scene photo sends, and it is also the first
	// phase of a video job: the queue renders this still, then animates it.
	imageSpec, err := queue.BuildImageSpec(withPreviewEndpoints(cfg.OmniChatMedia), job, []string{placeholderReferenceURL})
	if err != nil {
		return fmt.Errorf("build image spec: %w", err)
	}
	specs := []labelledSpec{{label: "image", spec: imageSpec}}
	if job.Kind == models.OmniChatMediaKindVideo {
		// The still does not exist yet at preview time, so its signed URL is
		// stood in for. Everything else -- the motion-only prompt, the mode,
		// the absence of references -- is exactly what the queue will send.
		videoSpec, err := queue.BuildVideoSpec(withPreviewEndpoints(cfg.OmniChatMedia), job, placeholderSourceStillURL)
		if err != nil {
			return fmt.Errorf("build video spec: %w", err)
		}
		specs = append(specs, labelledSpec{label: "video", spec: videoSpec})
	}

	if *asJSON {
		// The worker preview consumes one payload, so emit the phase that is
		// actually in question: the animation for a video, the still otherwise.
		payload, err := json.MarshalIndent(specs[len(specs)-1].spec.Input, "", "  ")
		if err != nil {
			return err
		}
		fmt.Println(string(payload))
		return nil
	}

	sceneJSON, err := json.MarshalIndent(normalized.Scene, "", "  ")
	if err != nil {
		return err
	}
	fmt.Printf("persona:          %s (id %d, platform-owned=%t)\n", persona.Name, persona.ID, persona.OwnerUserID == nil)
	fmt.Printf("identity profile: mode=%s adapter=%s scale=%.2f references=%d\n",
		job.IdentityProfile.Mode, job.IdentityProfile.Adapter, job.IdentityProfile.AdapterScale, job.IdentityProfile.ReferenceLimit)
	if job.IdentityProfile.LoraModelID != "" {
		fmt.Printf("lora:             %s / %s @ %.2f\n", job.IdentityProfile.LoraModelID, job.IdentityProfile.LoraWeightName, job.IdentityProfile.LoraScale)
	}
	fmt.Printf("\n--- resolved scene state ---\n%s\n", sceneJSON)
	fmt.Printf("\n--- effective prompt ---\n%s\n", normalized.EffectivePrompt)
	for index, entry := range specs {
		payload, err := json.MarshalIndent(entry.spec.Input, "", "  ")
		if err != nil {
			return err
		}
		fmt.Printf("\n--- phase %d: %s payload (endpoint %s) ---\n%s\n",
			index+1, entry.label, entry.spec.EndpointID, payload)
	}
	fmt.Printf("\nPipe the payload into the worker's own preview to see the final rendered prompt:\n")
	fmt.Printf("  go run ./cmd/omnichat_prompt_preview -conversation %d -owner %d -kind %s -json > /tmp/payload.json\n",
		*conversationID, *ownerUserID, job.Kind)
	fmt.Printf("  (cd ../infra/runpod && python -m omnichat_worker.preview /tmp/payload.json)\n")
	return nil
}

type labelledSpec struct {
	label string
	spec  *queue.RunPodGenerationSpec
}

func conversationPersonaID(ctx context.Context, db *database.DB, conversationID, ownerUserID int) (int, error) {
	var personaID int
	err := db.Pool.QueryRow(ctx, `
		SELECT persona_id
		FROM bot_conversations
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, conversationID, ownerUserID).Scan(&personaID)
	if err != nil {
		return 0, fmt.Errorf("load conversation persona: %w", err)
	}
	return personaID, nil
}

// previewLikeness prints exactly what her first picture would send.
//
// It builds the request the same way the likeness service does, so the framing,
// the medium and the description are read from the same code that would run for
// real. Nothing is submitted and nothing is written.
func previewLikeness(cfg *config.Config, persona *models.BotPersona, ownerUserID int, asJSON bool) error {
	profile := services.ResolveOmniChatMediaIdentityProfile(persona)
	request, err := services.NormalizeOmniChatLikenessRequest(models.OmniChatGenerationRequest{
		Kind:      models.OmniChatMediaKindImage,
		PersonaID: persona.ID,
		// The brief is normally written for her by a language model. This
		// preview makes no network calls, so it shows the shape with the same
		// fallback a brief-writer outage would use -- the framing, the medium
		// and the description around it are the real ones either way.
		Prompt: services.BuildOmniAILikenessPrompt(profile, services.OmniAIFallbackCandidateBrief),
	})
	if err != nil {
		return fmt.Errorf("normalize likeness request: %w", err)
	}

	job := &models.OmniChatGenerationJob{
		OwnerUserID:     ownerUserID,
		PersonaID:       persona.ID,
		Kind:            request.Kind,
		Mode:            request.Mode,
		Prompt:          request.Prompt,
		EffectivePrompt: request.EffectivePrompt,
		AspectRatio:     request.AspectRatio,
		IdentityProfile: profile,
	}
	spec, err := queue.BuildImageSpec(withPreviewEndpoints(cfg.OmniChatMedia), job, nil)
	if err != nil {
		return fmt.Errorf("build likeness spec: %w", err)
	}

	if asJSON {
		encoded, err := json.MarshalIndent(spec.Input, "", "  ")
		if err != nil {
			return err
		}
		fmt.Println(string(encoded))
		return nil
	}

	fmt.Printf("persona      %d (%s)\n", persona.ID, persona.Name)
	fmt.Printf("described    %s\n", orNone(profile.Appearance))
	fmt.Printf("medium       %s\n", orDefault(profile.RenderStyle, "photorealistic"))
	fmt.Printf("aspect       %v\n", spec.Input["aspect_ratio"])
	fmt.Printf("references   %d (none yet: this is what makes her one)\n", len(profile.ReferenceURLs))
	fmt.Printf("\nprompt\n%s\n", spec.Input["prompt"])
	return nil
}

func orNone(value string) string {
	if strings.TrimSpace(value) == "" {
		return "(nobody described her)"
	}
	return value
}

func orDefault(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
