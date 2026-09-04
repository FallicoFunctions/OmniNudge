package config

import (
	"fmt"
	"strings"
)

// MediaEndpointGaps names every generative-media setting that is absent but
// needed, one line per gap, ready to log at boot.
//
// It exists because video regressed for a month without anyone noticing.
// RUNPOD_VIDEO_ENDPOINT_ID was set in August, six clips rendered, and then the
// value was lost -- an environment-file merge is the likely culprit, the same
// accident the runpod README already warns about for
// RUNPOD_REQUEST_TIMEOUT_SECONDS. The backend booted cleanly the whole time.
// The only symptom was a 15-second failure at the moment a user asked for a
// clip, reported as "provider_unavailable", which reads as a GPU problem and
// is not.
//
// These are not fatal. A deployment may legitimately run images without video,
// and a local checkout with no RunPod account should still start. The point is
// that a missing endpoint is stated once, by name, where somebody starting the
// process will see it, rather than discovered by a user.
func (c OmniChatMediaConfig) MediaEndpointGaps() []string {
	if !strings.EqualFold(strings.TrimSpace(c.Provider), "runpod") {
		return nil
	}
	var gaps []string
	add := func(envVar, value, consequence string) {
		if strings.TrimSpace(value) == "" {
			gaps = append(gaps, fmt.Sprintf("%s is not set: %s", envVar, consequence))
		}
	}
	add("RUNPOD_API_KEY", c.RunPodAPIKey, "no media of any kind can be generated")
	add("RUNPOD_IMAGE_ENDPOINT_ID", c.RunPodImageEndpointID,
		"image generation fails as provider_unavailable")
	add("RUNPOD_VIDEO_ENDPOINT_ID", c.RunPodVideoEndpointID,
		"video generation fails as provider_unavailable")
	if c.ExplicitContentEnabled {
		add("RUNPOD_NSFW_IMAGE_ENDPOINT_ID", c.RunPodNSFWImageEndpointID,
			"explicit content is enabled but falls back to the standard image endpoint")
	}
	return gaps
}
