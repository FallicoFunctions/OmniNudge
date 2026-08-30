package services

import (
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/omninudge/backend/internal/models"
)

const (
	omniChatMaxGenerationPromptRunes = 2000
	omniChatMaxNegativePromptRunes   = 1000
	omniChatMaxSceneFieldRunes       = 300
	omniChatMaxSceneListItemRunes    = 160
	omniChatMaxRecentEvents          = 5
	omniChatMaxOtherCharacters       = 8
	omniChatMaxAccessories           = 8
)

var omniChatAspectRatios = map[string]struct{}{
	"1:1": {}, "3:4": {}, "4:3": {}, "4:5": {}, "5:4": {}, "9:16": {}, "16:9": {},
}

// NormalizeOmniChatGenerationRequest validates a client request and derives a
// provider-facing prompt. It does not perform authorization; handlers/services
// must still verify ownership of every referenced object.
func NormalizeOmniChatGenerationRequest(input models.OmniChatGenerationRequest) (models.OmniChatGenerationRequest, error) {
	request := input
	if request.Kind != models.OmniChatMediaKindImage && request.Kind != models.OmniChatMediaKindVideo {
		return request, errors.New("kind must be image or video")
	}
	if request.Mode == "" {
		request.Mode = models.OmniChatGenerationModeCreate
	}
	if request.Mode != models.OmniChatGenerationModeCreate &&
		request.Mode != models.OmniChatGenerationModeContextual &&
		request.Mode != models.OmniChatGenerationModeImageToVideo {
		return request, errors.New("mode is invalid")
	}
	if request.PersonaID <= 0 {
		return request, errors.New("persona_id is required")
	}
	if request.Mode == models.OmniChatGenerationModeContextual && request.ConversationID == nil {
		return request, errors.New("conversation_id is required for contextual generation")
	}
	if request.Mode == models.OmniChatGenerationModeImageToVideo {
		if request.Kind != models.OmniChatMediaKindVideo {
			return request, errors.New("image-to-video mode requires kind video")
		}
		if request.SourceAssetID == nil {
			return request, errors.New("source_asset_id is required for image-to-video generation")
		}
	} else {
		// A source asset is only meaningful when the caller explicitly asked to
		// animate one. Clearing it elsewhere keeps a single meaning for the
		// stored column: on a scene or create video, source_asset_id set means
		// the job's own image phase produced that still, which is what makes a
		// retry resumable without a dedicated state column.
		request.SourceAssetID = nil
	}

	request.Prompt = normalizePlainText(request.Prompt)
	request.NegativePrompt = normalizePlainText(request.NegativePrompt)
	if request.Prompt == "" {
		return request, errors.New("prompt is required")
	}
	if utf8.RuneCountInString(request.Prompt) > omniChatMaxGenerationPromptRunes {
		return request, fmt.Errorf("prompt must be at most %d characters", omniChatMaxGenerationPromptRunes)
	}
	if utf8.RuneCountInString(request.NegativePrompt) > omniChatMaxNegativePromptRunes {
		return request, fmt.Errorf("negative_prompt must be at most %d characters", omniChatMaxNegativePromptRunes)
	}

	if request.AspectRatio == "" {
		if request.Kind == models.OmniChatMediaKindVideo {
			request.AspectRatio = "16:9"
		} else {
			request.AspectRatio = "1:1"
		}
	}
	if _, ok := omniChatAspectRatios[request.AspectRatio]; !ok {
		return request, errors.New("aspect_ratio is invalid")
	}
	if request.Kind == models.OmniChatMediaKindVideo {
		if request.DurationSeconds == 0 {
			request.DurationSeconds = 5
		}
		if request.DurationSeconds < 3 || request.DurationSeconds > 10 {
			return request, errors.New("duration_seconds must be between 3 and 10")
		}
	} else if request.DurationSeconds != 0 {
		return request, errors.New("duration_seconds is only valid for video")
	}

	scene, err := NormalizeOmniChatSceneState(request.Scene)
	if err != nil {
		return request, err
	}
	// The tracked interaction decides subject count; an explicit request for
	// both people can additionally opt in. Nothing can opt out of the default,
	// which is the persona alone.
	if userRequestedBothSubjects(request.Prompt) {
		scene.IncludeUserBody = true
	}
	request.Scene = scene
	request.EffectivePrompt = buildOmniChatEffectivePrompt(request)
	return request, nil
}

// NormalizeOmniChatLikenessRequest prepares her first picture.
//
// The mode allowlist above is the public contract and deliberately does not
// include likeness. A caller who could ask for it would get a path built for a
// server-written prompt -- no scene, no conversation, and no gallery asset at
// the end of it -- and would pay for a picture they could never see. So the
// mode is applied here, after the request has been validated as what it
// actually is to every length and shape rule: a create.
//
// Billing is off. The first set of four is included in what making an
// independent character already costs, and a job that carried a reservation
// would have to release it four times over for a choice where three renders are
// discarded by design. Re-rolls are charged by the caller that asks for them,
// not here.
func NormalizeOmniChatLikenessRequest(request models.OmniChatGenerationRequest) (models.OmniChatGenerationRequest, error) {
	request.Mode = models.OmniChatGenerationModeCreate
	request.ConversationID = nil
	request.Scene = models.OmniChatSceneState{}

	normalized, err := NormalizeOmniChatGenerationRequest(request)
	if err != nil {
		return request, err
	}

	normalized.Mode = models.OmniChatGenerationModeLikeness
	free := false
	normalized.BillingRequired = &free
	return normalized, nil
}

// NormalizeOmniChatSceneState prevents unbounded context and strips control
// characters before the scene is persisted or sent to a provider.
func NormalizeOmniChatSceneState(input models.OmniChatSceneState) (models.OmniChatSceneState, error) {
	scene := input
	fields := []struct {
		name  string
		value *string
	}{
		{"location", &scene.Location}, {"time_of_day", &scene.TimeOfDay},
		{"weather", &scene.Weather}, {"lighting", &scene.Lighting},
		{"activity", &scene.Activity}, {"outfit", &scene.Outfit},
		{"pose", &scene.Pose}, {"expression", &scene.Expression},
		{"mood", &scene.Mood}, {"camera_direction", &scene.CameraDirection},
		// Server-derived, but bounded here too. CreateGeneration scrubs any
		// caller-supplied value before the server fills these, so by this point
		// they come from tracked scene state and the persona record; the bound
		// keeps a long extractor output from reaching the prompt or the
		// scene_snapshot column unchecked.
		{"viewer_position", &scene.ViewerPosition},
		{"subject_appearance", &scene.SubjectAppearance},
	}
	for _, field := range fields {
		*field.value = normalizePlainText(*field.value)
		if utf8.RuneCountInString(*field.value) > omniChatMaxSceneFieldRunes {
			return scene, fmt.Errorf("scene.%s must be at most %d characters", field.name, omniChatMaxSceneFieldRunes)
		}
	}

	var err error
	scene.OtherCharacters, err = normalizeSceneList(scene.OtherCharacters, omniChatMaxOtherCharacters, false)
	if err != nil {
		return scene, fmt.Errorf("scene.other_characters: %w", err)
	}
	scene.RecentEvents, err = normalizeSceneList(scene.RecentEvents, omniChatMaxRecentEvents, true)
	if err != nil {
		return scene, fmt.Errorf("scene.recent_events: %w", err)
	}
	scene.Accessories, err = normalizeSceneList(scene.Accessories, omniChatMaxAccessories, false)
	if err != nil {
		return scene, fmt.Errorf("scene.accessories: %w", err)
	}
	return scene, nil
}

// userRequestedBothSubjects reports whether the requested view explicitly asks
// for the user in frame. Scene images default to the persona alone from the
// user's point of view, so this is the deliberate opt-in.
func userRequestedBothSubjects(prompt string) bool {
	lower := strings.ToLower(prompt)
	for _, phrase := range []string{
		"show us", "both of us", "the two of us", "us together", "me and her",
		"me and him", "her and me", "him and me", "with me in", "including me",
		"you and me", "me and you",
	} {
		if strings.Contains(lower, phrase) {
			return true
		}
	}
	return false
}

func normalizeSceneList(values []string, maxItems int, keepMostRecent bool) ([]string, error) {
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		value = normalizePlainText(value)
		if value == "" {
			continue
		}
		if utf8.RuneCountInString(value) > omniChatMaxSceneListItemRunes {
			return nil, fmt.Errorf("items must be at most %d characters", omniChatMaxSceneListItemRunes)
		}
		normalized = append(normalized, value)
	}
	if len(normalized) > maxItems {
		if keepMostRecent {
			normalized = normalized[len(normalized)-maxItems:]
		} else {
			normalized = normalized[:maxItems]
		}
	}
	return normalized, nil
}

func normalizePlainText(value string) string {
	value = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) && r != '\n' && r != '\t' {
			return -1
		}
		return r
	}, value)
	return strings.Join(strings.Fields(value), " ")
}

func buildOmniChatEffectivePrompt(request models.OmniChatGenerationRequest) string {
	if request.Mode != models.OmniChatGenerationModeContextual {
		return request.Prompt
	}

	// The reference is whatever the persona's avatar happens to be. It is
	// usually a person, but it may be anime art or an object, so the prompt
	// describes "the subject" and lets the reference decide what that is.
	// Asserting a human here would fight a legitimate non-human request.
	parts := []string{
		// The medium is not asserted here. This prompt is built when the
		// request arrives, and which medium a character is drawn in is a
		// property of the persona, resolved later where the identity profile
		// is loaded. It is appended there.
		"Create one environmental scene image, not a headshot or selfie, with the same subject identity as the supplied reference.",
		"The requested location, activity, outfit, pose, expression, mood, and camera direction are authoritative and must replace the reference background.",
		"Use the reference only for the subject's identity and appearance; do not copy its background, crop, lighting, or pose.",
		"Use medium or full-body framing unless the requested view explicitly asks for a close-up.",
		"Use the following as visual direction only; depict physical details and actions rather than written conversation.",
	}
	// Subject count is decided here, from tracked state, and stated once. It
	// used to be inferred in the worker from transcript substrings, which
	// forced a second body into ordinary scenes.
	if request.Scene.IncludeUserBody {
		parts = append(parts,
			"Two subjects are in frame: the reference subject, and the viewer whose body is partly visible in the foreground from their own point of view. Crop the viewer's face out of frame. Add no one else.")
	} else {
		parts = append(parts,
			// "photographed" asserts a medium, in a prompt that may end with
			// "Render the image as anime artwork, not as a photograph." Two
			// contradicting instructions, and only reading the assembled
			// prompt shows it. "Seen" says the same thing about viewpoint and
			// nothing about the medium.
			"The reference subject is the only subject in frame, seen from the viewer's point of view. Do not add the viewer's body and do not add anyone else.")
	}
	appendField := func(label, value string) {
		if value != "" {
			parts = append(parts, label+": "+value+".")
		}
	}
	appendField("Location", request.Scene.Location)
	appendField("Time", request.Scene.TimeOfDay)
	appendField("Weather", request.Scene.Weather)
	appendField("Lighting", request.Scene.Lighting)
	appendField("Current activity", request.Scene.Activity)
	appendField("Subject outfit", request.Scene.Outfit)
	if len(request.Scene.Accessories) > 0 {
		appendField("Visible accessories and held objects", strings.Join(request.Scene.Accessories, ", "))
	}
	appendField("Pose", request.Scene.Pose)
	appendField("Expression", request.Scene.Expression)
	appendField("Mood", request.Scene.Mood)
	appendField("Camera direction", request.Scene.CameraDirection)
	if len(request.Scene.OtherCharacters) > 0 {
		appendField("Other characters", strings.Join(request.Scene.OtherCharacters, ", "))
	}
	if len(request.Scene.RecentEvents) > 0 {
		if visualContext := visualRecentEvents(request.Scene.RecentEvents); visualContext != "" {
			appendField("Recent physical context", visualContext)
		}
	}
	parts = append(parts, "Requested view: "+request.Prompt+".")
	return strings.Join(parts, " ")
}

// BuildOmniChatVideoMotionPrompt describes how the subject should move, and
// nothing else.
//
// The still handed to the video model already fixes identity, outfit, lighting
// and setting. Restating any of that here does not reinforce it -- the video
// model re-derives the frame from the text it is given, so an appearance
// description competes with the pixels it was handed and shows up as drift.
// Only the motion is new information.
//
// Create and image-to-video requests carry the user's own wording, which is
// already an instruction about movement, so it is used as written.
//
// Contextual requests are the opposite: their prompt is the Scene video
// button's fixed boilerplate ("Show the current scene in motion, preserving
// the character, setting, outfit, mood, and activity"), which contains no
// motion information and, appended last, outweighed the one clause that did.
// It is dropped rather than restated.
//
// Three earlier fields are gone for the same reason -- each was actively
// misleading the model rather than merely wasting budget:
//
//   - Pose is the subject's posture at rest, so "standing still" arrived as an
//     instruction directly contradicting "add only motion".
//   - Mood was the only energy cue in the string. A swaying scene tagged
//     "playful" came back as jumping.
//   - CameraDirection is a camera *position*, and labelling it "camera
//     movement" invited a moving camera, which reads as motion blur.
func BuildOmniChatVideoMotionPrompt(mode models.OmniChatGenerationMode, prompt string, scene models.OmniChatSceneState) string {
	prompt = strings.TrimSpace(prompt)
	if mode != models.OmniChatGenerationModeContextual {
		return prompt
	}
	parts := []string{
		"Animate the supplied still image.",
		"Keep the subject's identity, appearance, outfit, lighting, and setting exactly as they appear in the image; add only motion.",
		"Static camera, fixed framing, no camera movement.",
	}
	if motion := strings.TrimSpace(scene.Activity); motion != "" {
		parts = append(parts, "Motion: "+motion+".")
	}
	// Without an arc the model samples a slice out of the middle of a movement
	// and the clip stops mid-gesture. Naming the start and end states is the
	// only control over pacing the pipeline has.
	parts = append(parts,
		"The subject starts from the position shown in the image, performs the motion, and comes to rest before the clip ends.")
	return strings.Join(parts, " ")
}

// visualRecentEvents removes spoken dialogue and role labels before recent
// conversation context reaches an image model. Language models can use a
// transcript directly, but diffusion models often turn transcript words into
// illegible captions, collages, or repeated panels. Narration between asterisks
// is the most reliable physical-action signal in stored chat messages.
func visualRecentEvents(events []string) string {
	if len(events) == 0 {
		return ""
	}
	start := 0
	if len(events) > 3 {
		start = len(events) - 3
	}
	visual := make([]string, 0, len(events)-start)
	for _, raw := range events[start:] {
		value := strings.TrimSpace(raw)
		role := ""
		if colon := strings.IndexByte(value, ':'); colon > 0 {
			role = strings.ToLower(strings.TrimSpace(value[:colon]))
			if role == "user" || role == "character" || role == "persona" {
				value = strings.TrimSpace(value[colon+1:])
			}
		}
		if narrated := narratedSegments(value); narrated != "" {
			value = narrated
		} else if role == "user" {
			// User turns are authoritative for the current scene. Keep only
			// physical-direction text when it is not already marked as narration;
			// ordinary dialogue and questions must not become image captions.
			value = userVisualDirection(value)
		}
		value = stripQuotedText(value)
		value = normalizePlainText(value)
		if value == "" {
			continue
		}
		if utf8.RuneCountInString(value) > omniChatMaxSceneListItemRunes {
			value = string([]rune(value)[:omniChatMaxSceneListItemRunes])
		}
		visual = append(visual, value)
	}
	return strings.Join(visual, "; ")
}

func userVisualDirection(value string) string {
	value = strings.TrimSpace(stripQuotedText(value))
	if value == "" {
		return ""
	}
	lower := strings.ToLower(value)
	visualCues := []string{
		"hand", "arm", "leg", "knee", "foot", "body", "skin", "mouth", "lips", "face", "hair",
		"touch", "hold", "grab", "move", "place", "put", "press", "slide", "stroke", "rub",
		"lean", "stand", "sit", "walk", "kneel", "lie", "bend", "turn", "pull", "push",
		"undress", "naked", "nude", "squirt", "ravish", "kiss", "lick", "moan", "trembl",
	}
	for _, cue := range visualCues {
		if strings.Contains(lower, cue) {
			return value
		}
	}
	return ""
}

func narratedSegments(value string) string {
	segments := make([]string, 0, 2)
	for {
		open := strings.IndexByte(value, '*')
		if open < 0 {
			break
		}
		value = value[open+1:]
		close := strings.IndexByte(value, '*')
		if close < 0 {
			// Scene events are deliberately bounded before they reach this
			// parser, so a long narrated beat can end with an unmatched
			// asterisk. The text after that marker is still the physical
			// direction; dropping it would make the image request fall back to
			// the generic activity (often producing a standing portrait).
			if tail := strings.TrimSpace(value); tail != "" {
				segments = append(segments, tail)
			}
			break
		}
		if segment := strings.TrimSpace(value[:close]); segment != "" {
			segments = append(segments, segment)
		}
		value = value[close+1:]
	}
	return strings.Join(segments, " ")
}

func stripQuotedText(value string) string {
	var builder strings.Builder
	inQuote := false
	for _, r := range value {
		switch r {
		case '"', '“', '”':
			inQuote = !inQuote
		case '\'', '’':
			if !inQuote {
				builder.WriteRune(r)
			}
		default:
			if !inQuote {
				builder.WriteRune(r)
			}
		}
	}
	return builder.String()
}
