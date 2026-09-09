package queue

import (
	"strings"

	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/openrouter"
)

// Two processes run this handler, and they disagreed.
//
// The API server registers an embedded job worker and the standalone worker
// registers its own, both against the same Redis queue -- so whichever one
// happens to pick a job up decides what that job can do. The worker wired the
// rendered-image review, the hosted video provider and its media credential.
// The server wired none of them.
//
// So a scene photo failed with image_review_unavailable whenever the server
// took the job and succeeded whenever the worker did, which is a coin toss
// dressed up as a bug report. Video was worse: the server would have sent a
// hosted clip to the self-hosted RunPod endpoint and then been unable to fetch
// the result.
//
// Copying three blocks into a second main is what caused this. There is one
// function now, and both mains call it, so a dependency added here reaches
// both or neither.

// ConfigureOmniChatGeneration applies every optional dependency the generation
// handler takes from configuration.
//
// Required collaborators stay in the constructor. This is only for the ones a
// deployment can leave out, each of which degrades in its own documented way.
func ConfigureOmniChatGeneration(
	handler *OmniChatGenerationHandler, cfg *config.Config, thumbnails *services.ThumbnailService,
) *OmniChatGenerationHandler {
	if handler == nil || cfg == nil {
		return handler
	}
	handler = handler.SetThumbnails(thumbnails)

	// Clips go to a hosted model; stills stay on the self-hosted worker. Only
	// wired when a key exists, so an unconfigured deployment degrades to a slow
	// clip rather than to a failing one.
	if UsesHostedVideo(cfg.OmniChatMedia) && strings.TrimSpace(cfg.OpenRouter.APIKey) != "" {
		handler = handler.SetVideoProvider(
			NewOpenRouterVideoProvider(openrouter.NewClient(cfg.OpenRouter.APIKey, "")))
		// The finished clip lives behind OpenRouter's own API and needs the key
		// to fetch: "unsigned_urls" names the URL's lack of a signature, not
		// public access. Scoped to that host so the account credential cannot
		// follow a result URL somewhere else.
		handler = handler.SetMediaBearer(config.OpenRouterMediaHost, cfg.OpenRouter.APIKey)
		zlog.Info().
			Str("provider", cfg.OmniChatMedia.VideoProvider).
			Str("model", cfg.OmniChatMedia.VideoModel).
			Str("resolution", cfg.OmniChatMedia.VideoResolution).
			Msg("omnichat video: hosted provider wired")
	} else if UsesHostedVideo(cfg.OmniChatMedia) {
		zlog.Error().
			Str("check", "media_endpoint").
			Msg("OMNICHAT_VIDEO_PROVIDER is openrouter but OPENROUTER_API_KEY is not set: clips fall back to the self-hosted worker")
	}

	// Looks at what the provider returned, on the paths where explicit output
	// would be a defect. Without it the handler falls back to failClosed, so an
	// unset review is a refusal rather than a silent gap -- which is exactly
	// what the server was doing to every scene photo.
	if model := strings.TrimSpace(cfg.OpenRouter.ImageReviewModel); model != "" && strings.TrimSpace(cfg.OpenRouter.APIKey) != "" {
		handler = handler.SetRenderedImageReview(
			services.NewOpenRouterRenderedImageReview(openrouter.NewClient(cfg.OpenRouter.APIKey, model)))
	} else {
		zlog.Error().
			Str("check", "media_endpoint").
			Msg("the rendered image review is not configured: every render that is not entitled to be explicit will be refused")
	}
	return handler
}
