package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	zlog "github.com/rs/zerolog/log"
)

const personalConversationMaxTokens = 256

const (
	defaultGenerationAttempts    = 2
	personalConversationAttempts = 4
	personalGenerationTimeout    = 25 * time.Second
)

// Personal attempts deliberately total less than the outer request budget.
// This leaves time for validation and guarantees that the final dialogue-only
// recovery receives a bounded provider window instead of inheriting an already
// exhausted deadline.
var personalGenerationAttemptTimeouts = [...]time.Duration{
	8 * time.Second,
	6 * time.Second,
	5 * time.Second,
	4 * time.Second,
}

var defaultGenerationAttemptTimeout = 12 * time.Second

var ErrConversationalResponseContract = errors.New("chatbot: conversational response contract rejected every draft")
var ErrPersonalSceneConflict = fmt.Errorf("%w: server scene state conflicts with the personal response contract", ErrConversationalResponseContract)
var ErrGenerationOptionsUnsupported = fmt.Errorf("%w: completion provider does not support requested generation options", ErrConversationalResponseContract)

type personalDraftOutcome string
type personalDraftSource string
type personalDraftTerminalTransition string

const (
	personalDraftAcceptedRaw          personalDraftOutcome = "accepted_raw"
	personalDraftAcceptedSingleBlock  personalDraftOutcome = "accepted_single_block"
	personalDraftAcceptedRepair       personalDraftOutcome = "accepted_repair"
	personalDraftAcceptedFallback     personalDraftOutcome = "accepted_fallback"
	personalDraftAcceptedDialogue     personalDraftOutcome = "accepted_dialogue_only"
	personalDraftRejectedHygiene      personalDraftOutcome = "rejected_hygiene"
	personalDraftRejectedLength       personalDraftOutcome = "rejected_length_or_blocks"
	personalDraftRejectedNarration    personalDraftOutcome = "rejected_narration"
	personalDraftRejectedOwnership    personalDraftOutcome = "rejected_ownership"
	personalDraftRejectedBoundary     personalDraftOutcome = "rejected_boundary"
	personalDraftRejectedScene        personalDraftOutcome = "rejected_scene_conflict"
	personalDraftRejectedQuestion     personalDraftOutcome = "rejected_question_budget"
	personalDraftRejectedFormatting   personalDraftOutcome = "rejected_other_formatting"
	personalDraftRejectedSemantics    personalDraftOutcome = "rejected_other_semantics"
	personalDraftProviderTimeout      personalDraftOutcome = "provider_timeout"
	personalDraftProviderRateLimit    personalDraftOutcome = "provider_rate_limit"
	personalDraftProviderAccessDenied personalDraftOutcome = "provider_access_denied"
	personalDraftProviderTransport    personalDraftOutcome = "provider_transport"

	personalDraftSourceEmpty                   personalDraftSource = "empty"
	personalDraftSourceShapeValid              personalDraftSource = "shape_valid"
	personalDraftSourceValidDialogueEnvelope   personalDraftSource = "valid_dialogue_envelope"
	personalDraftSourceUnder24                 personalDraftSource = "under_24_words"
	personalDraftSourceRepairablePartition     personalDraftSource = "repairable_partition"
	personalDraftSourceUnpartitionable24To60   personalDraftSource = "unpartitionable_24_to_60_words"
	personalDraftSourceUnpartitionable61To100  personalDraftSource = "unpartitionable_61_to_100_words"
	personalDraftSourceOver100                 personalDraftSource = "over_100_words"
	personalDraftSourceInvalidDialogueEnvelope personalDraftSource = "invalid_dialogue_envelope"

	personalDraftTerminalAcceptedRaw         personalDraftTerminalTransition = "accepted_raw"
	personalDraftTerminalAcceptedSingleBlock personalDraftTerminalTransition = "accepted_single_block"
	personalDraftTerminalAcceptedRepair      personalDraftTerminalTransition = "accepted_repair"
	personalDraftTerminalAcceptedFallback    personalDraftTerminalTransition = "accepted_fallback"
	personalDraftTerminalAcceptedDialogue    personalDraftTerminalTransition = "accepted_dialogue_only"
	personalDraftTerminalRetryHygiene        personalDraftTerminalTransition = "retry_hygiene"
	personalDraftTerminalRetryContract       personalDraftTerminalTransition = "retry_contract"
	personalDraftTerminalRetryEmpty          personalDraftTerminalTransition = "retry_empty"
)

// PersonalDraftSourceCounters classifies each completed provider draft into
// exactly one bounded, content-free source bucket.
type PersonalDraftSourceCounters struct {
	Empty                       int `json:"empty"`
	ShapeValid                  int `json:"shape_valid"`
	ValidDialogueEnvelope       int `json:"valid_dialogue_envelope"`
	Under24Words                int `json:"under_24_words"`
	RepairablePartition         int `json:"repairable_partition"`
	Unpartitionable24To60Words  int `json:"unpartitionable_24_to_60_words"`
	Unpartitionable61To100Words int `json:"unpartitionable_61_to_100_words"`
	Over100Words                int `json:"over_100_words"`
	InvalidDialogueEnvelope     int `json:"invalid_dialogue_envelope"`
}

// PersonalDraftTerminalCounters records exactly one terminal transition for
// each completed provider draft. Provider failures are attempt outcomes rather
// than drafts and remain in the existing typed provider counters.
type PersonalDraftTerminalCounters struct {
	AcceptedRaw          int `json:"accepted_raw"`
	AcceptedSingleBlock  int `json:"accepted_single_block"`
	AcceptedRepair       int `json:"accepted_repair"`
	AcceptedFallback     int `json:"accepted_fallback"`
	AcceptedDialogueOnly int `json:"accepted_dialogue_only"`
	RetryHygiene         int `json:"retry_hygiene"`
	RetryContract        int `json:"retry_contract"`
	RetryEmpty           int `json:"retry_empty"`
}

// PersonalDraftCounters contains counters only. It must never grow fields that
// retain prompts, responses, routes, provider IDs, user IDs, or raw errors.
type PersonalDraftCounters struct {
	AcceptedRaw             int                           `json:"accepted_raw"`
	AcceptedSingleBlock     int                           `json:"accepted_single_block"`
	AcceptedRepair          int                           `json:"accepted_repair"`
	AcceptedFallback        int                           `json:"accepted_fallback"`
	AcceptedDialogueOnly    int                           `json:"accepted_dialogue_only"`
	RejectedHygiene         int                           `json:"rejected_hygiene"`
	RejectedLengthOrBlocks  int                           `json:"rejected_length_or_blocks"`
	RejectedNarration       int                           `json:"rejected_narration"`
	RejectedOwnership       int                           `json:"rejected_ownership"`
	RejectedBoundary        int                           `json:"rejected_boundary"`
	RejectedSceneConflict   int                           `json:"rejected_scene_conflict"`
	RejectedQuestionBudget  int                           `json:"rejected_question_budget"`
	RejectedOtherFormatting int                           `json:"rejected_other_formatting"`
	RejectedOtherSemantics  int                           `json:"rejected_other_semantics"`
	ProviderTimeout         int                           `json:"provider_timeout"`
	ProviderRateLimit       int                           `json:"provider_rate_limit"`
	ProviderAccessDenied    int                           `json:"provider_access_denied"`
	ProviderTransport       int                           `json:"provider_transport"`
	RawSources              PersonalDraftSourceCounters   `json:"raw_sources"`
	TerminalTransitions     PersonalDraftTerminalCounters `json:"terminal_transitions"`
}

type personalDraftDiagnostics struct {
	mu       sync.Mutex
	counters PersonalDraftCounters
}

type personalDraftDiagnosticsContextKey struct{}

func withPersonalDraftDiagnostics(ctx context.Context) (context.Context, *personalDraftDiagnostics) {
	diagnostics := &personalDraftDiagnostics{}
	return context.WithValue(ctx, personalDraftDiagnosticsContextKey{}, diagnostics), diagnostics
}

func recordPersonalDraftOutcome(ctx context.Context, outcome personalDraftOutcome) {
	diagnostics, _ := ctx.Value(personalDraftDiagnosticsContextKey{}).(*personalDraftDiagnostics)
	if diagnostics == nil {
		return
	}
	diagnostics.mu.Lock()
	diagnostics.counters.add(outcome)
	diagnostics.mu.Unlock()
}

func recordPersonalDraftSource(ctx context.Context, source personalDraftSource) {
	diagnostics, _ := ctx.Value(personalDraftDiagnosticsContextKey{}).(*personalDraftDiagnostics)
	if diagnostics == nil {
		return
	}
	diagnostics.mu.Lock()
	diagnostics.counters.RawSources.add(source)
	diagnostics.mu.Unlock()
}

func recordPersonalDraftTerminal(ctx context.Context, transition personalDraftTerminalTransition) {
	diagnostics, _ := ctx.Value(personalDraftDiagnosticsContextKey{}).(*personalDraftDiagnostics)
	if diagnostics == nil {
		return
	}
	diagnostics.mu.Lock()
	diagnostics.counters.TerminalTransitions.add(transition)
	diagnostics.mu.Unlock()
}

func (d *personalDraftDiagnostics) snapshot() PersonalDraftCounters {
	if d == nil {
		return PersonalDraftCounters{}
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.counters
}

func (c *PersonalDraftCounters) add(outcome personalDraftOutcome) {
	switch outcome {
	case personalDraftAcceptedRaw:
		c.AcceptedRaw++
	case personalDraftAcceptedSingleBlock:
		c.AcceptedSingleBlock++
	case personalDraftAcceptedRepair:
		c.AcceptedRepair++
	case personalDraftAcceptedFallback:
		c.AcceptedFallback++
	case personalDraftAcceptedDialogue:
		c.AcceptedDialogueOnly++
	case personalDraftRejectedHygiene:
		c.RejectedHygiene++
	case personalDraftRejectedLength:
		c.RejectedLengthOrBlocks++
	case personalDraftRejectedNarration:
		c.RejectedNarration++
	case personalDraftRejectedOwnership:
		c.RejectedOwnership++
	case personalDraftRejectedBoundary:
		c.RejectedBoundary++
	case personalDraftRejectedScene:
		c.RejectedSceneConflict++
	case personalDraftRejectedQuestion:
		c.RejectedQuestionBudget++
	case personalDraftRejectedFormatting:
		c.RejectedOtherFormatting++
	case personalDraftRejectedSemantics:
		c.RejectedOtherSemantics++
	case personalDraftProviderTimeout:
		c.ProviderTimeout++
	case personalDraftProviderRateLimit:
		c.ProviderRateLimit++
	case personalDraftProviderAccessDenied:
		c.ProviderAccessDenied++
	case personalDraftProviderTransport:
		c.ProviderTransport++
	}
}

func (c *PersonalDraftCounters) merge(other PersonalDraftCounters) {
	c.AcceptedRaw += other.AcceptedRaw
	c.AcceptedSingleBlock += other.AcceptedSingleBlock
	c.AcceptedRepair += other.AcceptedRepair
	c.AcceptedFallback += other.AcceptedFallback
	c.AcceptedDialogueOnly += other.AcceptedDialogueOnly
	c.RejectedHygiene += other.RejectedHygiene
	c.RejectedLengthOrBlocks += other.RejectedLengthOrBlocks
	c.RejectedNarration += other.RejectedNarration
	c.RejectedOwnership += other.RejectedOwnership
	c.RejectedBoundary += other.RejectedBoundary
	c.RejectedSceneConflict += other.RejectedSceneConflict
	c.RejectedQuestionBudget += other.RejectedQuestionBudget
	c.RejectedOtherFormatting += other.RejectedOtherFormatting
	c.RejectedOtherSemantics += other.RejectedOtherSemantics
	c.ProviderTimeout += other.ProviderTimeout
	c.ProviderRateLimit += other.ProviderRateLimit
	c.ProviderAccessDenied += other.ProviderAccessDenied
	c.ProviderTransport += other.ProviderTransport
	c.RawSources.merge(other.RawSources)
	c.TerminalTransitions.merge(other.TerminalTransitions)
}

func (c *PersonalDraftSourceCounters) add(source personalDraftSource) {
	switch source {
	case personalDraftSourceEmpty:
		c.Empty++
	case personalDraftSourceShapeValid:
		c.ShapeValid++
	case personalDraftSourceValidDialogueEnvelope:
		c.ValidDialogueEnvelope++
	case personalDraftSourceUnder24:
		c.Under24Words++
	case personalDraftSourceRepairablePartition:
		c.RepairablePartition++
	case personalDraftSourceUnpartitionable24To60:
		c.Unpartitionable24To60Words++
	case personalDraftSourceUnpartitionable61To100:
		c.Unpartitionable61To100Words++
	case personalDraftSourceOver100:
		c.Over100Words++
	case personalDraftSourceInvalidDialogueEnvelope:
		c.InvalidDialogueEnvelope++
	}
}

func (c *PersonalDraftSourceCounters) merge(other PersonalDraftSourceCounters) {
	c.Empty += other.Empty
	c.ShapeValid += other.ShapeValid
	c.ValidDialogueEnvelope += other.ValidDialogueEnvelope
	c.Under24Words += other.Under24Words
	c.RepairablePartition += other.RepairablePartition
	c.Unpartitionable24To60Words += other.Unpartitionable24To60Words
	c.Unpartitionable61To100Words += other.Unpartitionable61To100Words
	c.Over100Words += other.Over100Words
	c.InvalidDialogueEnvelope += other.InvalidDialogueEnvelope
}

func (c PersonalDraftSourceCounters) total() int {
	return c.Empty +
		c.ShapeValid +
		c.ValidDialogueEnvelope +
		c.Under24Words +
		c.RepairablePartition +
		c.Unpartitionable24To60Words +
		c.Unpartitionable61To100Words +
		c.Over100Words +
		c.InvalidDialogueEnvelope
}

func (c *PersonalDraftTerminalCounters) add(transition personalDraftTerminalTransition) {
	switch transition {
	case personalDraftTerminalAcceptedRaw:
		c.AcceptedRaw++
	case personalDraftTerminalAcceptedSingleBlock:
		c.AcceptedSingleBlock++
	case personalDraftTerminalAcceptedRepair:
		c.AcceptedRepair++
	case personalDraftTerminalAcceptedFallback:
		c.AcceptedFallback++
	case personalDraftTerminalAcceptedDialogue:
		c.AcceptedDialogueOnly++
	case personalDraftTerminalRetryHygiene:
		c.RetryHygiene++
	case personalDraftTerminalRetryContract:
		c.RetryContract++
	case personalDraftTerminalRetryEmpty:
		c.RetryEmpty++
	}
}

func (c *PersonalDraftTerminalCounters) merge(other PersonalDraftTerminalCounters) {
	c.AcceptedRaw += other.AcceptedRaw
	c.AcceptedSingleBlock += other.AcceptedSingleBlock
	c.AcceptedRepair += other.AcceptedRepair
	c.AcceptedFallback += other.AcceptedFallback
	c.AcceptedDialogueOnly += other.AcceptedDialogueOnly
	c.RetryHygiene += other.RetryHygiene
	c.RetryContract += other.RetryContract
	c.RetryEmpty += other.RetryEmpty
}

func (c PersonalDraftTerminalCounters) total() int {
	return c.AcceptedRaw +
		c.AcceptedSingleBlock +
		c.AcceptedRepair +
		c.AcceptedFallback +
		c.AcceptedDialogueOnly +
		c.RetryHygiene +
		c.RetryContract +
		c.RetryEmpty
}

type generationOptionsClient interface {
	GenerateWithOptions(context.Context, []openrouter.Message, openrouter.StreamCallback, openrouter.GenerationOptions) (string, error)
}

var (
	blankLinePattern                  = regexp.MustCompile(`\r?\n[\t ]*\r?\n+`)
	narrationSpanPattern              = regexp.MustCompile(`\*([^*\n]+)\*`)
	firstPersonNarrationWord          = regexp.MustCompile(`(?i)\b(?:i|me|my|mine|myself)\b`)
	firstPersonNarrationLead          = regexp.MustCompile(`(?i)^(?:i\b|i['’]m\b|my\b)`)
	assistantSentencePattern          = regexp.MustCompile(`[^.!?…]+[.!?…]+["'”’\)\]]*|[^.!?…]+$`)
	firstPersonActionNarration        = regexp.MustCompile(`(?i)^i\s+(?:swallow|nod|shake|lean|smile|grin|sigh|pause|glance|reach|touch|brush|trace|move|slide|pull|press|lift|lower|tilt|turn|step|sit|stand|inhale|exhale|freeze|flinch|shrug|blink|bite|gesture|clench|flex|curl|settle|stiffen|steady|search|open|close|part|shift|tense|flutter)(?:\s+(?:back|closer|away|forward|in|out|up|down|over|toward|towards))?\s*[,;.!?]`)
	firstPersonSpeechTagNarration     = regexp.MustCompile(`(?i)^i\s+(?:say|ask|reply|answer|whisper|murmur|add)\s*,`)
	firstPersonBodyAction             = regexp.MustCompile(`(?i)^i\s+(?:rest|place|lay|set|hold|keep|move|slide|brush|trace|press|lift|lower|pull|withdraw|wrap|grab|take|open|close|clench|flex|curl|settle|shift|steady)\s+(?:my|a|the)\s+(?:hand|hands|finger|fingers|thumb|palm|arm|arms|foot|feet|knee|knees|leg|legs|thigh|thighs|hip|hips|head|shoulder|shoulders|jaw|lips|mouth|body)\b`)
	firstPersonForeignBodyNarrationV2 = regexp.MustCompile(`(?i)^i\s+(?:(?:slowly|carefully|quietly|briefly|gently|hesitantly)\s+)?(?:rest|place|lay|set|hold|keep|move|slide|brush|trace|touch|press|lift|lower|pull|withdraw|wrap|grab|take|open|close|clench|flex|curl|settle|shift|steady)\s+(?:her|his|their)\s+(?:(?:left|right|upper|lower|front|back|inner|outer|near|far|same|other)\s+){0,2}(?:hand|hands|finger|fingers|thumb|palm|arm|arms|foot|feet|knee|knees|leg|legs|thigh|thighs|hip|hips|head|shoulder|shoulders|jaw|lips|mouth|body)\b`)
	firstPersonGazeAction             = regexp.MustCompile(`(?i)^i\s+(?:(?:finally|slowly|carefully|quietly|briefly|gently|hesitantly)\s+)?(?:meet|hold|avoid|search)\s+your\s+(?:eyes|gaze)\b`)
	bodyActionNarration               = regexp.MustCompile(`(?i)^my\s+(?:breath|hand|hands|finger|fingers|thumb|palm|palms|gaze|eyes|voice|heart|pulse|shoulder|shoulders|lips|mouth|head|body|foot|feet|knee|knees|leg|legs|thigh|thighs|hip|hips|jaw|chest|throat)\s+(?:hitch(?:es)?|catch(?:es)?|brush(?:es)?|trace(?:s)?|move(?:s)?|slide(?:s)?|pull(?:s)?|press(?:es)?|lift(?:s)?|lower(?:s)?|tilt(?:s)?|turn(?:s)?|tremble(?:s)?|shake(?:s)?|freeze(?:s)?|tighten(?:s)?|soften(?:s)?|drop(?:s)?|rise(?:s)?|races?|pound(?:s)?|hammer(?:s)?|lock(?:s)?|flick(?:s)?|drift(?:s)?|linger(?:s)?|hover(?:s)?|land(?:s)?|rest(?:s)?|still(?:s)?|open(?:s)?|close(?:s)?|part(?:s)?|clench(?:es)?|flex(?:es)?|curl(?:s)?|settle(?:s)?|stiffen(?:s)?|steady(?:s)?|search(?:es)?|shift(?:s)?|tense(?:s)?|flutter(?:s)?|thrum(?:s)?|beat(?:s)?|sound(?:s)?)\b`)
	thirdPersonBodyNarration          = regexp.MustCompile(`(?i)^(?:her|his|their)\s+(?:breath|hand|hands|finger|fingers|thumb|palm|palms|gaze|eyes|voice|heart|pulse|shoulder|shoulders|lips|mouth|head|body|foot|feet|knee|knees|leg|legs|thigh|thighs|hip|hips|jaw|chest|throat)\s+(?:halt(?:s|ing)?|stop(?:s|ping)?|hitch(?:es|ing)?|catch(?:es|ing)?|brush(?:es|ing)?|trace(?:s|ing)?|move(?:s|ing)?|slide(?:s|ing)?|pull(?:s|ing)?|press(?:es|ing)?|lift(?:s|ing)?|lower(?:s|ing)?|tilt(?:s|ing)?|turn(?:s|ing)?|tremble(?:s|ing)?|shake(?:s|ing)?|freeze(?:s|ing)?|tighten(?:s|ing)?|soften(?:s|ing)?|drop(?:s|ping)?|rise(?:s|ing)?|races?|pound(?:s|ing)?|hammer(?:s|ing)?|lock(?:s|ing)?|flick(?:s|ing)?|drift(?:s|ing)?|linger(?:s|ing)?|hover(?:s|ing)?|land(?:s|ing)?|rest(?:s|ing)?|search(?:es|ing)?|open(?:s|ing)?|part(?:s|ing)?|close(?:s|ing)?|clench(?:es|ing)?|flex(?:es|ing)?|curl(?:s|ing)?|settle(?:s|ing)?|stiffen(?:s|ing)?|steady(?:s|ing)?|shift(?:s|ing)?|tense(?:s|ing)?|flutter(?:s|ing)?|thrum(?:s|ing)?|beat(?:s|ing)?|sound(?:s|ing)?)\b`)
	thirdPersonOwnedPhysicalNarration = regexp.MustCompile(`(?i)^(?:she|he|they)\s+(?:pulls?|halts?|stops?|leans?|steps?|sits?|stands?|moves?|reaches?|touches?|brushes?|traces?|presses?|lifts?|lowers?|tilts?|turns?|freezes?|flinches?|shrugs?|blinks?|bites?|gestures?|swallows?|exhales?|inhales?|stiffens?|softens?|slides?|rests?|holds?|grabs?|takes?|opens?|parts?|closes?|clenches?|watches?|shifts?|flexes?|curls?|settles?|steadies?|searches?|flutters?|thrums?|beats?)\b[^.!?…]*(?:her|his|their|your|my|the|a)\s+(?:breath|hand|hands|finger|fingers|thumb|palm|palms|gaze|eyes|voice|heart|pulse|shoulder|shoulders|lips|mouth|head|body|foot|feet|knee|knees|leg|legs|thigh|thighs|hip|hips|jaw|chest|throat)\b`)
	namedThirdPersonPhysicalNarration = regexp.MustCompile(`^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:pulls?|halts?|stops?|leans?|steps?|sits?|stands?|moves?|reaches?|touches?|brushes?|traces?|presses?|lifts?|lowers?|tilts?|turns?|freezes?|flinches?|shrugs?|blinks?|bites?|gestures?|swallows?|exhales?|inhales?|stiffens?|softens?|slides?|rests?|holds?|grabs?|takes?|opens?|parts?|closes?|clenches?|watches?|shifts?|flexes?|curls?|settles?|steadies?|searches?|flutters?|thrums?|beats?)\b[^.!?…]*(?:her|his|their|your|my|the|a)\s+(?:breath|hand|hands|finger|fingers|thumb|palm|palms|gaze|eyes|voice|heart|pulse|shoulder|shoulders|lips|mouth|head|body|foot|feet|knee|knees|leg|legs|thigh|thighs|hip|hips|jaw|chest|throat)\b`)
	// Models sometimes omit the first-person subject and start with a scene
	// object instead (for example, "The denim is warm, his pulse..."). The
	// possessive body reference makes this a high-confidence stage direction
	// while avoiding ordinary dialogue such as "The plan is clear.".
	articleSceneThirdPersonNarration = regexp.MustCompile(`(?i)^(?:the|a|an)\s+[a-z][a-z'’-]*(?:\s+[a-z][a-z'’-]*){0,4}\s+(?:is|was|are|were|feels?|seems?|looks?|sounds?|smells?|rests?|lies?|hangs?|moves?|shifts?|warms?|cools?|glows?|flickers?|echoes?|drifts?)\b[^.!?…]{0,180}\b(?:his|her|their)\s+(?:(?:left|right|upper|lower|inner|outer|near|far|same|other)\s+){0,2}(?:breath|hand|hands|finger|fingers|thumb|palm|palms|gaze|eyes|voice|heart|pulse|shoulder|shoulders|lips|mouth|head|body|foot|feet|knee|knees|leg|legs|thigh|thighs|hip|hips|jaw|chest|throat)\b`)
	// Double-quote pairs are deliberately boundary-broad: providers sometimes
	// emit a closing quote before narration ("..." She says). The quote pair
	// itself is still anchored after punctuation, while leaving all following
	// spacing/text untouched for loss-limited repair.
	dialogueFormattingDoubleQuotePair = regexp.MustCompile(`(?m)(^|[.!?,;:])([ \t]*)["“”]([^"“”\n]*)["“”]`)
	dialogueFormattingSingleQuotePair = regexp.MustCompile(`(?m)(^|[.!?,;:])([ \t]*)['‘]((?:[^'\n]|'[A-Za-z])*?)['’]([ \t\r\n]|[,!?;:)\]]|$)`)
	singleDialogueQuoteBoundary       = regexp.MustCompile(`(?m)(^|[.!?,;:])([ \t]*)['‘]([A-Za-z])`)
	incompleteIntensifierPattern      = regexp.MustCompile(`(?i)\b(?:you|what\s+an?)\s+(?:absolute|complete|total|utter)\s+(?:[.!?…]|$)`)
)

var reciprocalTurnBodyParts = []string{
	"arm", "arms", "foot", "feet", "hand", "hands", "knee", "knees",
	"leg", "legs", "shoulder", "shoulders", "thigh", "thighs",
}

// messageShape is how many messages one reply may be delivered as.
//
// This used to be two numbers written into the length check, reachable only
// when personal mode was switched on, which made a rule about *style* a
// property of a bundle that also carries scene state and narration. Who decides
// the shape differs by kind of character: a roleplay character's creator picks
// it, and an IAI is offered the notation and no count at all (13).
type messageShape struct {
	minBlocks       int
	maxBlocks       int
	minMediumBlocks int
	maxMediumBlocks int
	minBlockWords   int
	maxBlockWords   int
}

// countsBlocks reports whether this shape constrains anything. A shape that
// counts nothing is not a lax rule, it is the absence of one.
func (s messageShape) countsBlocks() bool { return s.maxBlocks > 0 }

// personalConversationShape is what personal mode has always required.
var personalConversationShape = messageShape{
	minBlocks: 2, maxBlocks: 4,
	minMediumBlocks: 2, maxMediumBlocks: 3,
	minBlockWords: 12, maxBlockWords: 30,
}

// personaMessageShape answers who this character is, not which bundle is on.
func personaMessageShape(persona *models.BotPersona) messageShape {
	if personaUsesPersonalConversationMode(persona) {
		return personalConversationShape
	}
	return messageShape{}
}

func personaUsesPersonalConversationMode(persona *models.BotPersona) bool {
	if persona == nil {
		return false
	}
	profile := strings.TrimSpace(persona.ResponseStyleProfile)
	if profile == "" || profile == models.ResponseStyleProfileInherit {
		profile = models.ResponseStyleProfileNaturalDialogue
	}
	return profile == models.ResponseStyleProfileNaturalDialogue || profile == models.ResponseStyleProfileProfessional
}

// generatePersonaCompletion buffers every upstream draft until it passes the
// universal hygiene gate. Conversational profiles additionally pass their
// server-owned formatting contract before delivery.
func (s *ChatbotService) generatePersonaCompletion(
	ctx context.Context,
	persona *models.BotPersona,
	messages []openrouter.Message,
	onChunk openrouter.StreamCallback,
) (string, error) {
	return generatePersonaCompletionWithClient(ctx, s.openrouter, persona, messages, onChunk)
}

func generatePersonaCompletionWithClient(
	ctx context.Context,
	completion chatCompletionClient,
	persona *models.BotPersona,
	messages []openrouter.Message,
	onChunk openrouter.StreamCallback,
) (string, error) {
	return generatePersonaCompletionWithClientAndSceneState(ctx, completion, persona, messages, nil, onChunk)
}

func generatePersonaCompletionWithClientAndSceneState(
	ctx context.Context,
	completion chatCompletionClient,
	persona *models.BotPersona,
	messages []openrouter.Message,
	sceneState *models.OmniChatConversationSceneState,
	onChunk openrouter.StreamCallback,
) (string, error) {
	if completion == nil {
		return "", errors.New("chatbot: completion provider is unavailable")
	}
	personalMode := personaUsesPersonalConversationMode(persona)
	if personalMode && !containsSystemPrompt(messages) {
		return "", fmt.Errorf("%w: system prompt is missing", ErrConversationalResponseContract)
	}
	if personalMode && sceneState != nil {
		if !validPersonalResponseConstraintSceneState(sceneState) {
			return "", ErrPersonalSceneConflict
		}
	}
	generationCtx := ctx
	cancelGeneration := func() {}
	if personalMode {
		generationCtx, cancelGeneration = context.WithTimeout(ctx, personalGenerationTimeout)
	}
	defer cancelGeneration()

	maxAttempts := defaultGenerationAttempts
	if personalMode {
		maxAttempts = personalConversationAttempts
	}
	// The shape is settled before the first attempt: a mirroring character is
	// judged against how the other person writes, not against the shape she was
	// made with, or the contract would reject the very reply mirroring asked
	// her for.
	shape := personaMessageShape(persona)
	if personaMirrorsUser(persona) {
		shape = mirroredShape(shape, observeUserWritingStyleInPrompt(messages))
	}
	constraints := personalResponseConstraints{}
	if personalMode {
		constraints = derivePersonalResponseConstraints(messages, sceneState)
	}

	var lastErr error
	lengthOnlyRetry := false
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if err := generationCtx.Err(); err != nil {
			return "", err
		}
		generationMessages := messages
		structuredRecovery := false
		if attempt > 0 && lengthOnlyRetry {
			generationMessages = messagesWithPersonalLengthOnlyRecovery(messages)
			structuredRecovery = true
			lengthOnlyRetry = false
		} else if attempt > 0 && errors.Is(lastErr, ErrAssistantOutputHygiene) {
			generationMessages = messagesWithAssistantHygieneRetry(messages)
		} else if attempt > 0 && errors.Is(lastErr, ErrConversationalResponseContract) {
			if attempt == maxAttempts-1 {
				generationMessages = messagesWithPersonalDialogueOnlyRecovery(messages)
				structuredRecovery = true
			} else {
				generationMessages = messagesWithPersonalResponseShapeRetry(messages)
			}
		}
		attemptTimeout := defaultGenerationAttemptTimeout
		if personalMode {
			attemptTimeout = personalGenerationAttemptTimeouts[attempt]
		}
		attemptCtx, cancelAttempt := context.WithTimeout(generationCtx, attemptTimeout)
		generationOptions := openrouter.GenerationOptions{}
		if personalMode {
			generationOptions.MaxTokens = personalConversationMaxTokens
		}
		if structuredRecovery {
			generationOptions.ResponseFormat = "json_object"
		}
		candidate, err := generateBufferedAssistantCandidateWithOptions(attemptCtx, completion, generationMessages, personalMode, generationOptions)
		cancelAttempt()
		candidate = normalizeAssistantMessageContent(candidate)
		if err != nil {
			lastErr = err
			if personalMode {
				recordPersonalProviderFailure(ctx, err)
			}
			if errors.Is(err, openrouter.ErrAccessDenied) {
				return "", err
			}
			log := zlog.Warn().Int("attempt", attempt+1)
			if persona != nil {
				log = log.Int("persona_id", persona.ID)
			}
			log.Msg("chatbot: discarded incomplete provider response before delivery")
			if generationCtx.Err() != nil {
				return "", generationCtx.Err()
			}
			continue
		}
		if personalMode {
			recordPersonalDraftSource(ctx, classifyPersonalDraftSource(candidate))
		}
		if candidate != "" {
			if valid, detail := validateAssistantOutputHygiene(candidate); !valid {
				lastErr = fmt.Errorf("%w: %s", ErrAssistantOutputHygiene, detail)
				recordPersonalDraftOutcome(ctx, personalDraftRejectedHygiene)
				recordPersonalDraftTerminal(ctx, personalDraftTerminalRetryHygiene)
				log := zlog.Warn().Int("attempt", attempt+1)
				if persona != nil {
					log = log.Int("persona_id", persona.ID)
				}
				log.Msg("chatbot: rejected provider output before delivery")
				continue
			}
			if !personalMode {
				return deliverBufferedConversation(candidate, onChunk), nil
			}
			finalized, finalizeErr := finalizePersonalConversationDraftWithConstraints(ctx, persona, candidate, constraints, shape, onChunk)
			if finalizeErr == nil {
				return finalized, nil
			}
			if attempt == maxAttempts-1 {
				recovered, recoveryErr := finalizePersonalDialogueOnlyRecoveryWithConstraints(ctx, persona, candidate, constraints, onChunk)
				if recoveryErr == nil {
					return recovered, nil
				}
				finalizeErr = recoveryErr
			}
			lastErr = finalizeErr
			recordPersonalDraftTerminal(ctx, personalDraftTerminalRetryContract)
			lengthOnlyRetry = personalMode && isLengthOnlyPersonalDraftWithConstraints(candidate, constraints, shape)
			log := zlog.Warn().Int("attempt", attempt+1)
			if persona != nil {
				log = log.Int("persona_id", persona.ID)
			}
			log = log.Err(finalizeErr)
			log.Msg("chatbot: rejected conversational draft shape before delivery")
			continue
		}
		lastErr = fmt.Errorf("%w: provider returned an empty response", ErrAssistantOutputHygiene)
		if personalMode {
			recordPersonalDraftOutcome(ctx, personalDraftRejectedHygiene)
			recordPersonalDraftTerminal(ctx, personalDraftTerminalRetryEmpty)
		}
	}
	if lastErr == nil {
		lastErr = ErrAssistantOutputHygiene
	}
	return "", fmt.Errorf("%w: retry exhausted", lastErr)
}

func recordPersonalProviderFailure(ctx context.Context, err error) {
	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		recordPersonalDraftOutcome(ctx, personalDraftProviderTimeout)
	case errors.Is(err, openrouter.ErrRateLimited):
		recordPersonalDraftOutcome(ctx, personalDraftProviderRateLimit)
	case errors.Is(err, openrouter.ErrAccessDenied):
		recordPersonalDraftOutcome(ctx, personalDraftProviderAccessDenied)
	default:
		recordPersonalDraftOutcome(ctx, personalDraftProviderTransport)
	}
}

func containsSystemPrompt(messages []openrouter.Message) bool {
	for _, message := range messages {
		if message.Role == openrouter.RoleSystem {
			return true
		}
	}
	return false
}

func finalizePersonalConversationDraft(ctx context.Context, persona *models.BotPersona, candidate string, onChunk openrouter.StreamCallback) (string, error) {
	return finalizePersonalConversationDraftWithConstraints(ctx, persona, candidate, personalResponseConstraints{}, personaMessageShape(persona), onChunk)
}

func finalizePersonalConversationDraftWithConstraints(ctx context.Context, persona *models.BotPersona, candidate string, constraints personalResponseConstraints, shape messageShape, onChunk openrouter.StreamCallback) (string, error) {
	if recovered, err := parseAndValidatePersonalDialogueOnlyJSONWithConstraints(candidate, constraints); err == nil {
		recordPersonalDraftOutcome(ctx, personalDraftAcceptedDialogue)
		recordPersonalDraftTerminal(ctx, personalDraftTerminalAcceptedDialogue)
		return deliverBufferedConversation(recovered, onChunk), nil
	}
	if valid, _ := validatePersonalConversationResponseWithConstraints(candidate, constraints, shape); valid {
		recordPersonalDraftOutcome(ctx, personalDraftAcceptedRaw)
		recordPersonalDraftTerminal(ctx, personalDraftTerminalAcceptedRaw)
		return deliverBufferedConversation(candidate, onChunk), nil
	}
	recordPersonalDraftRejectionsWithConstraints(ctx, candidate, constraints, shape)

	repaired := repairPersonalConversationDraft(candidate)
	if valid, _ := validatePersonalConversationResponseWithConstraints(repaired, constraints, shape); valid {
		outcome := personalDraftAcceptedRepair
		if isPresentationOnlySingleBlockRecovery(candidate, repaired) {
			outcome = personalDraftAcceptedSingleBlock
		}
		recordPersonalDraftOutcome(ctx, outcome)
		if outcome == personalDraftAcceptedSingleBlock {
			recordPersonalDraftTerminal(ctx, personalDraftTerminalAcceptedSingleBlock)
		} else {
			recordPersonalDraftTerminal(ctx, personalDraftTerminalAcceptedRepair)
		}
		zlog.Info().Int("persona_id", persona.ID).Msg("chatbot: repaired conversational draft before delivery")
		return deliverBufferedConversation(repaired, onChunk), nil
	}

	fallback := sanitizePersonalConversationFallback(candidate)
	if valid, _ := validatePersonalConversationResponseWithConstraints(fallback, constraints, shape); valid {
		recordPersonalDraftOutcome(ctx, personalDraftAcceptedFallback)
		recordPersonalDraftTerminal(ctx, personalDraftTerminalAcceptedFallback)
		zlog.Warn().Int("persona_id", persona.ID).Msg("chatbot: sanitized malformed conversational draft before delivery")
		return deliverBufferedConversation(fallback, onChunk), nil
	}
	_, detail := validatePersonalConversationResponseWithConstraints(fallback, constraints, shape)
	return "", fmt.Errorf("%w: provider response could not be sanitized: %s", ErrConversationalResponseContract, detail)
}

func isPresentationOnlySingleBlockRecovery(candidate, repaired string) bool {
	return len(blankLinePattern.Split(strings.TrimSpace(candidate), -1)) == 1 &&
		len(blankLinePattern.Split(strings.TrimSpace(repaired), -1)) > 1 &&
		strings.Join(strings.Fields(candidate), " ") == strings.Join(strings.Fields(repaired), " ")
}

// finalizePersonalDialogueOnlyRecoveryWithConstraints is deliberately
// available only to the final bounded attempt. Dialogue-only recovery still
// has to satisfy the same two-medium-block presentation contract as every
// other personal reply.
func finalizePersonalDialogueOnlyRecoveryWithConstraints(ctx context.Context, persona *models.BotPersona, candidate string, constraints personalResponseConstraints, onChunk openrouter.StreamCallback) (string, error) {
	recovered := sanitizePersonalDialogueOnlyRecovery(candidate)
	if valid, detail := validatePersonalDialogueOnlyRecoveryWithConstraints(recovered, constraints); !valid {
		return "", fmt.Errorf("%w: dialogue-only recovery invalid: %s", ErrConversationalResponseContract, detail)
	}
	recordPersonalDraftOutcome(ctx, personalDraftAcceptedDialogue)
	recordPersonalDraftTerminal(ctx, personalDraftTerminalAcceptedDialogue)
	zlog.Warn().Int("persona_id", persona.ID).Msg("chatbot: delivered dialogue-only recovery")
	return deliverBufferedConversation(recovered, onChunk), nil
}

func messagesWithPersonalResponseShapeRetry(messages []openrouter.Message) []openrouter.Message {
	retry := append([]openrouter.Message(nil), messages...)
	const correction = `

[Personal Response Shape Retry]
Your prior draft was not delivered because it violated Personal Conversation Mode formatting, actor-and-turn continuity, or a server-enforced boundary. Rewrite the answer from scratch while preserving the intended meaning and character voice. Clearly refuse pressure to consent, agree, leave, or cross a professional boundary; never pair boundary language with accepting the pressured action. Preserve one coherent active turn and one body target throughout the reply. If you yield the turn to the user, stop and wait for the user's next message; do not immediately take the turn back or reverse my/your ownership. Return exactly two medium conversational blocks for an ordinary moment, or two to three medium blocks plus at most one short final block for a deeper moment. Separate blocks with one blank line. Each medium block must contain 12 to 30 words. Spoken dialogue must be plain text. Any essential first-person stage direction must be wrapped completely in single asterisks; never leave actions, body language, or speech tags as unmarked dialogue. Narration must use I, me, and my; never use third-person narration such as she, her, he, or his for the character. Do not mention this retry.`
	for index := range retry {
		if retry[index].Role == openrouter.RoleSystem {
			retry[index].Content += correction
			return retry
		}
	}
	return retry
}

// messagesWithPersonalDialogueOnlyRecovery removes narration from the final
// bounded recovery attempt. Plain dialogue is the smallest valid response
// surface and avoids asking a provider that already failed twice to coordinate
// character perspective, stage directions, and presentation markup again.
func messagesWithPersonalDialogueOnlyRecovery(messages []openrouter.Message) []openrouter.Message {
	retry := append([]openrouter.Message(nil), messages...)
	const correction = `

[Personal Dialogue-Only Recovery]
The prior drafts were not delivered. Answer the user's latest message directly in the character's established voice. Clearly maintain any refusal, consent limit, or professional boundary in the latest turn; never pair boundary language with accepting the pressured action. Preserve one coherent active turn and body target. If you yield the turn to the user, stop and wait; do not take it back or reverse my/your ownership in this reply.
Return exactly one JSON object in this schema and no other text: {"paragraphs":["first paragraph","second paragraph"]}
Each array item must be 12 to 30 words of plain spoken dialogue. Use no narration, actions, body language, speech tags, quotation marks inside either string, asterisks, markdown, character-name labels, or third-person prose. Do not mention this recovery.`
	for index := range retry {
		if retry[index].Role == openrouter.RoleSystem {
			retry[index].Content += correction
			return retry
		}
	}
	return retry
}

func messagesWithPersonalLengthOnlyRecovery(messages []openrouter.Message) []openrouter.Message {
	retry := messagesWithPersonalDialogueOnlyRecovery(messages)
	for index := range retry {
		if retry[index].Role == openrouter.RoleSystem {
			retry[index].Content = strings.Replace(
				retry[index].Content,
				"[Personal Dialogue-Only Recovery]",
				"[Personal Length-Only Recovery]",
				1,
			)
			return retry
		}
	}
	return retry
}

func deliverBufferedConversation(response string, onChunk openrouter.StreamCallback) string {
	if onChunk != nil {
		onChunk(response)
	}
	return response
}

func generateBufferedAssistantCandidateWithOptions(ctx context.Context, completion chatCompletionClient, messages []openrouter.Message, personalMode bool, options openrouter.GenerationOptions) (string, error) {
	if personalMode {
		if optioned, ok := completion.(generationOptionsClient); ok {
			if options.MaxTokens == 0 {
				options.MaxTokens = personalConversationMaxTokens
			}
			return optioned.GenerateWithOptions(ctx, messages, func(string) {}, options)
		}
		if strings.TrimSpace(options.ResponseFormat) != "" {
			// Never silently drop a server-owned structured-output requirement.
			// A test double or alternate client without the options interface
			// must fail closed instead of sending an unstructured final retry.
			return "", ErrGenerationOptionsUnsupported
		}
	}
	return completion.Generate(ctx, messages, func(string) {})
}

// repairPersonalConversationDraft performs loss-limited formatting repairs:
// surplus narration and presentation-only bold markers are removed,
// paragraph-wrapping quotes are unwrapped, and the remaining words are
// repartitioned without changing their order. The caller validates the result.
func repairPersonalConversationDraft(response string) string {
	response = strings.ReplaceAll(response, "**", "")
	// Third-person prose cannot be converted to first person safely with simple
	// substitutions. Preserve it as invalid so the provider receives a bounded
	// corrective retry instead of silently changing meaning or ownership.
	if containsUnmarkedThirdPersonNarration(response) {
		return response
	}
	response = markUnmarkedNarration(response)
	response = removeSurplusNarration(response)
	response = removeDialogueFormattingQuotes(response)
	response = limitPersonalDraftQuestions(response)
	blocks := blankLinePattern.Split(strings.TrimSpace(response), -1)
	cleaned := make([]string, 0, len(blocks))
	for _, block := range blocks {
		block = strings.TrimSpace(strings.Join(strings.Fields(block), " "))
		if block == "" {
			continue
		}
		block = unwrapParagraphDialogueQuotes(block)
		if block != "" {
			cleaned = append(cleaned, block)
		}
	}
	blocks = cleaned

	if partitioned, ok := partitionPersonalConversationBlocks(blocks); ok {
		blocks = partitioned
	} else if len(strings.Fields(strings.Join(blocks, " "))) < 24 {
		// A genuinely brief reply cannot satisfy two 12-word blocks without
		// inventing content. Collapse it for the guarded runtime fallback.
		blocks = []string{strings.Join(blocks, " ")}
	}

	return strings.Join(blocks, "\n\n")
}

func limitPersonalDraftQuestions(response string) string {
	seen := false
	return strings.Map(func(char rune) rune {
		if char != '?' && char != '？' {
			return char
		}
		if !seen {
			seen = true
			return char
		}
		return '.'
	}, response)
}

// sanitizePersonalConversationFallback is the final deterministic delivery
// path for non-empty provider output. It removes presentation markup that can
// become malformed when a provider reaches its token limit, bounds the reply,
// and repartitions words without inventing new character content.
func sanitizePersonalConversationFallback(response string) string {
	response = strings.NewReplacer("**", "", "*", "", "`", "").Replace(response)
	blocks := blankLinePattern.Split(strings.TrimSpace(response), -1)
	cleaned := make([]string, 0, len(blocks))
	for _, block := range blocks {
		block = strings.TrimSpace(strings.Join(strings.Fields(block), " "))
		block = strings.TrimLeft(block, "#>- ")
		block = unwrapParagraphDialogueQuotes(block)
		if block != "" {
			cleaned = append(cleaned, block)
		}
	}

	words := strings.Fields(strings.Join(cleaned, " "))
	if len(words) > 90 {
		words = words[:90]
	}
	if len(words) == 0 {
		return ""
	}
	flat := strings.Join(words, " ")
	if partitioned, ok := partitionPersonalConversationBlocks([]string{flat}); ok {
		return strings.Join(partitioned, "\n\n")
	}
	if len(words) > 60 {
		words = truncateAtSemanticBoundary(words, 60)
		flat = strings.Join(words, " ")
	}
	return flat
}

func sanitizePersonalDialogueOnlyRecovery(response string) string {
	type recoveryEnvelope struct {
		Paragraphs []string `json:"paragraphs"`
	}
	var envelope recoveryEnvelope
	decoder := json.NewDecoder(strings.NewReader(strings.TrimSpace(response)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&envelope); err == nil {
		var extra any
		if errors.Is(decoder.Decode(&extra), io.EOF) && len(envelope.Paragraphs) == 2 {
			response = strings.Join(envelope.Paragraphs, "\n\n")
		}
	}

	response = strings.ReplaceAll(response, "**", "")
	response = strings.ReplaceAll(response, "`", "")
	response = markUnmarkedNarration(response)
	response = narrationSpanPattern.ReplaceAllString(response, "")
	response = removeDialogueFormattingQuotes(response)

	blocks := blankLinePattern.Split(strings.TrimSpace(response), -1)
	cleaned := make([]string, 0, len(blocks))
	for _, block := range blocks {
		block = strings.TrimSpace(strings.Join(strings.Fields(block), " "))
		block = unwrapParagraphDialogueQuotes(block)
		if block != "" {
			cleaned = append(cleaned, block)
		}
	}
	words := strings.Fields(strings.Join(cleaned, " "))
	if len(words) < 24 || len(words) > 60 {
		return strings.Join(words, " ")
	}

	sourceBoundaries := make(map[int]bool, len(cleaned))
	wordOffset := 0
	for _, block := range cleaned {
		wordOffset += len(strings.Fields(block))
		sourceBoundaries[wordOffset] = true
	}
	cutAllowed := make([]bool, len(words)+1)
	cutAllowed[0] = true
	for index, word := range words {
		cutAllowed[index+1] = sourceBoundaries[index+1] ||
			endsSentenceBoundary(word) ||
			index+1 == len(words)
	}
	if partitioned, ok := partitionWordsByBudget(
		words,
		cutAllowed,
		[]int{12, 12},
		[]int{30, 30},
	); ok {
		return strings.Join(partitioned, "\n\n")
	}
	return strings.Join(words, " ")
}

func truncateAtSemanticBoundary(words []string, maximum int) []string {
	if len(words) <= maximum {
		return words
	}
	for end := maximum; end >= 24; end-- {
		if endsSentenceBoundary(words[end-1]) {
			return words[:end]
		}
	}
	return words[:maximum]
}

func removeSurplusNarration(response string) string {
	matches := narrationSpanPattern.FindAllStringSubmatchIndex(response, -1)
	if len(matches) == 0 {
		return response
	}
	// Do not discard an ambiguous marked span while trying to reduce a
	// provider's narration count. If a span is not a high-confidence action,
	// speech-tag, body, or gaze beat, leave the draft untouched so the bounded
	// corrective retry can preserve its meaning instead of silently deleting
	// authored content such as "*My mother said...*".
	if len(matches) > 1 {
		for _, match := range matches {
			if !isSafePersonalNarrationSpan(response[match[2]:match[3]]) {
				return response
			}
		}
	}

	var out strings.Builder
	cursor := 0
	keptNarration := false
	for _, match := range matches {
		out.WriteString(response[cursor:match[0]])
		narration := response[match[2]:match[3]]
		if !keptNarration && firstPersonNarrationWord.MatchString(narration) {
			out.WriteString(response[match[0]:match[1]])
			keptNarration = true
		}
		cursor = match[1]
	}
	out.WriteString(response[cursor:])
	return out.String()
}

func isSafePersonalNarrationSpan(narration string) bool {
	trimmed := strings.TrimSpace(narration)
	return firstPersonActionNarration.MatchString(trimmed) ||
		firstPersonSpeechTagNarration.MatchString(trimmed) ||
		firstPersonBodyAction.MatchString(trimmed) ||
		firstPersonForeignBodyNarrationV2.MatchString(trimmed) ||
		firstPersonGazeAction.MatchString(trimmed) ||
		bodyActionNarration.MatchString(trimmed)
}

func unwrapParagraphDialogueQuotes(block string) string {
	plainDialogue := strings.TrimSpace(narrationSpanPattern.ReplaceAllString(block, ""))
	if !isWrappedInDialogueQuotationMarks(plainDialogue) {
		return block
	}
	runes := []rune(plainDialogue)
	unwrapped := strings.TrimSpace(string(runes[1 : len(runes)-1]))
	return strings.TrimSpace(strings.Replace(block, plainDialogue, unwrapped, 1))
}

// removeDialogueFormattingQuotes removes quotation pairs used as dialogue
// presentation at the beginning of a block or immediately after a completed
// sentence. Inline semantic quotations (for example, I never said "always")
// are preserved because their opening quote is not a dialogue boundary.
func removeDialogueFormattingQuotes(response string) string {
	response = dialogueFormattingDoubleQuotePair.ReplaceAllString(response, "$1$2$3")
	return dialogueFormattingSingleQuotePair.ReplaceAllString(response, "$1$2$3$4")
}

type conversationalBlockShape struct {
	mediumBlocks int
	shortFinal   bool
}

// partitionPersonalConversationBlocks finds valid contiguous word boundaries
// rather than greedily merging neighboring paragraphs. Cuts never occur inside
// a narration span, so the renderer's single-asterisk contract stays intact.
func partitionPersonalConversationBlocks(blocks []string) ([]string, bool) {
	words := make([]string, 0, len(strings.Fields(strings.Join(blocks, " "))))
	sourceBoundaries := make(map[int]bool, len(blocks))
	for _, block := range blocks {
		words = append(words, strings.Fields(block)...)
		sourceBoundaries[len(words)] = true
	}
	if len(words) < 24 || len(words) > 100 {
		return nil, false
	}
	if len(blocks) >= 2 && len(blocks) <= 4 {
		mediumBlocks := len(blocks)
		shortFinal := len(blocks) >= 3 && len(strings.Fields(blocks[len(blocks)-1])) <= 10
		if shortFinal {
			mediumBlocks--
		}
		if mediumBlocks >= 2 && mediumBlocks <= 3 {
			valid := true
			for index := 0; index < mediumBlocks; index++ {
				count := len(strings.Fields(blocks[index]))
				if count < 12 || count > 30 {
					valid = false
					break
				}
			}
			if valid && (!shortFinal || len(strings.Fields(blocks[len(blocks)-1])) > 0) {
				return blocks, true
			}
		}
	}

	shapes := []conversationalBlockShape{{mediumBlocks: 2}, {mediumBlocks: 3}}
	if len(blocks) >= 3 && len(strings.Fields(blocks[len(blocks)-1])) <= 10 {
		shapes = []conversationalBlockShape{
			{mediumBlocks: 2, shortFinal: true},
			{mediumBlocks: 3, shortFinal: true},
			{mediumBlocks: 2},
			{mediumBlocks: 3},
		}
	} else {
		shapes = append(shapes,
			conversationalBlockShape{mediumBlocks: 2, shortFinal: true},
			conversationalBlockShape{mediumBlocks: 3, shortFinal: true},
		)
	}

	cutAllowed := make([]bool, len(words)+1)
	cutAllowed[0] = true
	insideNarration := false
	for index, word := range words {
		if strings.Count(word, "*")%2 == 1 {
			insideNarration = !insideNarration
		}
		semanticBoundary := sourceBoundaries[index+1] || endsSentenceBoundary(word) || index+1 == len(words)
		cutAllowed[index+1] = !insideNarration && semanticBoundary
	}
	if insideNarration {
		return nil, false
	}

	for _, shape := range shapes {
		minimums := make([]int, shape.mediumBlocks)
		maximums := make([]int, shape.mediumBlocks)
		for index := range minimums {
			minimums[index] = 12
			maximums[index] = 30
		}
		if shape.shortFinal {
			minimums = append(minimums, 1)
			maximums = append(maximums, 10)
		}
		if partitioned, ok := partitionWordsByBudget(words, cutAllowed, minimums, maximums); ok {
			return partitioned, true
		}
	}
	return nil, false
}

func endsSentenceBoundary(word string) bool {
	word = strings.TrimRight(word, `"'”’)]}*`)
	if word == "" {
		return false
	}
	last := word[len(word)-1]
	return last == '.' || last == '?' || last == '!'
}

func partitionWordsByBudget(words []string, cutAllowed []bool, minimums, maximums []int) ([]string, bool) {
	var search func(start, group int) ([]string, bool)
	search = func(start, group int) ([]string, bool) {
		if group == len(minimums) {
			return nil, start == len(words)
		}
		remainingMin := 0
		remainingMax := 0
		for index := group + 1; index < len(minimums); index++ {
			remainingMin += minimums[index]
			remainingMax += maximums[index]
		}
		for size := minimums[group]; size <= maximums[group]; size++ {
			end := start + size
			if end > len(words) || !cutAllowed[end] {
				continue
			}
			wordsLeft := len(words) - end
			if wordsLeft < remainingMin || wordsLeft > remainingMax {
				continue
			}
			tail, ok := search(end, group+1)
			if !ok {
				continue
			}
			return append([]string{strings.Join(words[start:end], " ")}, tail...), true
		}
		return nil, false
	}
	return search(0, 0)
}

func validatePersonalConversationResponse(response string) (bool, string) {
	return validatePersonalConversationResponseWithConstraints(response, personalResponseConstraints{}, personalConversationShape)
}

func validatePersonalConversationResponseWithConstraints(response string, constraints personalResponseConstraints, shape messageShape) (bool, string) {
	if valid, detail := meetsConversationalLengthBudget(response, shape); !valid {
		return false, detail
	}
	if valid, detail := validatePersonalConversationFormatting(response); !valid {
		return false, detail
	}
	if valid, detail := validatePersonalConversationSemantics(response); !valid {
		return false, detail
	}
	return validatePersonalResponseConstraints(response, constraints)
}

func recordPersonalDraftRejections(ctx context.Context, response string) {
	recordPersonalDraftRejectionsWithConstraints(ctx, response, personalResponseConstraints{}, personalConversationShape)
}

func recordPersonalDraftRejectionsWithConstraints(ctx context.Context, response string, constraints personalResponseConstraints, shape messageShape) {
	recorded := false
	if valid, _ := meetsConversationalLengthBudget(response, shape); !valid {
		recordPersonalDraftOutcome(ctx, personalDraftRejectedLength)
		recorded = true
	}
	if valid, detail := validatePersonalConversationFormatting(response); !valid {
		if strings.Contains(strings.ToLower(detail), "narration") {
			recordPersonalDraftOutcome(ctx, personalDraftRejectedNarration)
		} else {
			recordPersonalDraftOutcome(ctx, personalDraftRejectedFormatting)
		}
		recorded = true
	}
	if valid, detail := validatePersonalConversationSemantics(response); !valid {
		lowerDetail := strings.ToLower(detail)
		switch {
		case strings.Contains(lowerDetail, "ownership"):
			recordPersonalDraftOutcome(ctx, personalDraftRejectedOwnership)
		case strings.Contains(lowerDetail, "question"):
			recordPersonalDraftOutcome(ctx, personalDraftRejectedQuestion)
		default:
			recordPersonalDraftOutcome(ctx, personalDraftRejectedSemantics)
		}
		recorded = true
	}
	if valid, detail := validatePersonalResponseConstraints(response, constraints); !valid {
		if strings.Contains(strings.ToLower(detail), "boundary") || strings.Contains(strings.ToLower(detail), "consent") {
			recordPersonalDraftOutcome(ctx, personalDraftRejectedBoundary)
		} else {
			recordPersonalDraftOutcome(ctx, personalDraftRejectedScene)
		}
		recorded = true
	}
	if !recorded {
		recordPersonalDraftOutcome(ctx, personalDraftRejectedSemantics)
	}
}

func classifyPersonalDraftSource(response string) personalDraftSource {
	trimmed := strings.TrimSpace(response)
	if trimmed == "" {
		return personalDraftSourceEmpty
	}
	if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
		if _, err := parseAndValidatePersonalDialogueOnlyJSON(trimmed); err == nil {
			return personalDraftSourceValidDialogueEnvelope
		}
		return personalDraftSourceInvalidDialogueEnvelope
	}
	if valid, _ := meetsConversationalLengthBudget(trimmed, personalConversationShape); valid {
		return personalDraftSourceShapeValid
	}

	words := len(strings.Fields(trimmed))
	if words < 24 {
		return personalDraftSourceUnder24
	}
	if words > 100 {
		return personalDraftSourceOver100
	}
	if _, ok := partitionPersonalConversationBlocks(
		blankLinePattern.Split(trimmed, -1),
	); ok {
		return personalDraftSourceRepairablePartition
	}
	if words <= 60 {
		return personalDraftSourceUnpartitionable24To60
	}
	return personalDraftSourceUnpartitionable61To100
}

func isLengthOnlyPersonalDraft(response string) bool {
	return isLengthOnlyPersonalDraftWithConstraints(response, personalResponseConstraints{}, personalConversationShape)
}

func isLengthOnlyPersonalDraftWithConstraints(response string, constraints personalResponseConstraints, shape messageShape) bool {
	trimmed := strings.TrimSpace(response)
	if trimmed == "" || strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
		return false
	}
	if valid, _ := meetsConversationalLengthBudget(trimmed, shape); valid {
		return false
	}
	// Keep this explicit even though formatting validation currently detects
	// the same pattern: finalization refuses to rewrite third-person ownership,
	// so it can never be treated as a presentation-only length failure.
	if containsUnmarkedThirdPersonNarration(trimmed) {
		return false
	}
	if valid, _ := validatePersonalConversationFormatting(trimmed); !valid {
		return false
	}
	if valid, _ := validatePersonalConversationSemantics(trimmed); !valid {
		return false
	}
	if valid, _ := validatePersonalResponseConstraints(trimmed, constraints); !valid {
		return false
	}
	return true
}

func parseAndValidatePersonalDialogueOnlyJSON(raw string) (string, error) {
	return parseAndValidatePersonalDialogueOnlyJSONWithConstraints(raw, personalResponseConstraints{})
}

func parseAndValidatePersonalDialogueOnlyJSONWithConstraints(raw string, constraints personalResponseConstraints) (string, error) {
	type recoveryEnvelope struct {
		Paragraphs []string `json:"paragraphs"`
	}

	decoder := json.NewDecoder(strings.NewReader(strings.TrimSpace(raw)))
	decoder.DisallowUnknownFields()
	var envelope recoveryEnvelope
	if err := decoder.Decode(&envelope); err != nil {
		return "", fmt.Errorf("invalid dialogue-only recovery JSON: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return "", errors.New("invalid dialogue-only recovery JSON: trailing data")
		}
		return "", fmt.Errorf("invalid dialogue-only recovery JSON: %w", err)
	}
	if len(envelope.Paragraphs) != 2 {
		return "", errors.New("dialogue-only recovery must contain exactly two paragraphs")
	}
	for index, paragraph := range envelope.Paragraphs {
		if strings.TrimSpace(paragraph) != paragraph || paragraph == "" {
			return "", fmt.Errorf("dialogue-only recovery paragraph %d is empty or padded", index+1)
		}
	}
	recovered := strings.Join(envelope.Paragraphs, "\n\n")
	if valid, detail := validatePersonalDialogueOnlyRecoveryWithConstraints(recovered, constraints); !valid {
		return "", errors.New(detail)
	}
	return recovered, nil
}

func validatePersonalDialogueOnlyRecovery(response string) (bool, string) {
	return validatePersonalDialogueOnlyRecoveryWithConstraints(response, personalResponseConstraints{})
}

func validatePersonalDialogueOnlyRecoveryWithConstraints(response string, constraints personalResponseConstraints) (bool, string) {
	blocks := blankLinePattern.Split(strings.TrimSpace(response), -1)
	if len(blocks) != 2 {
		return false, "dialogue-only recovery must contain exactly two paragraphs"
	}
	for index, block := range blocks {
		wordCount := len(strings.Fields(block))
		if wordCount < 12 || wordCount > 30 {
			return false, fmt.Sprintf(
				"dialogue-only recovery paragraph %d contains %d words (required 12 to 30)",
				index+1,
				wordCount,
			)
		}
	}
	if strings.ContainsAny(response, "*`<｜>") {
		return false, "dialogue-only recovery contains narration or presentation markup"
	}
	// Report semantic ownership conflicts before the broader stage-direction
	// heuristic. Dialogue-only recovery is intentionally plain text, so a
	// phrase such as "use my leg" can resemble an action even when it is being
	// rejected for the more important reason that it flips turn ownership.
	if valid, detail := validatePersonalConversationSemantics(response); !valid {
		return false, detail
	}
	if containsUnmarkedNarration(response) || countUnmarkedThirdPersonNarrationSignals(response) > 0 {
		return false, "dialogue-only recovery contains a stage direction"
	}
	if containsDialogueFormattingQuotes(response) {
		return false, "dialogue-only recovery contains presentation quotation marks"
	}
	if valid, detail := validatePersonalResponseConstraints(response, constraints); !valid {
		return false, detail
	}
	return true, "dialogue-only recovery is safe"
}

func validatePersonalConversationSemantics(response string) (bool, string) {
	if valid, detail := validateUniversalResponseSemantics(response); !valid {
		return false, detail
	}
	// The question budget belongs to the personal-conversation contract and to
	// nothing else. A narrative character is told the opposite -- to end on a
	// playable opening, which is often a question -- so applying this to one
	// would be marking her down for following her own instructions.
	if questions := countQuestionMarks(response); questions > 1 {
		return false, fmt.Sprintf("response contains %d questions (limit 1)", questions)
	}
	return true, "personal conversation response semantics are coherent"
}

// validateUniversalResponseSemantics is the part that is true of any character
// in any style: she must not flip who owns a turn, and she must not trail off
// mid-phrase. Neither depends on a format contract.
func validateUniversalResponseSemantics(response string) (bool, string) {
	if containsConflictingTurnOwnership(response) {
		return false, "response contains conflicting turn ownership for the same body target"
	}
	if incompleteIntensifierPattern.MatchString(response) {
		return false, "response contains an incomplete intensifier fragment"
	}
	return true, "response semantics are coherent"
}

// containsConflictingTurnOwnership catches a high-confidence ownership flip:
// the same assistant reply assigns the user's turn to the character's body and
// then assigns the character's turn to the user's matching body part. The
// server rejects and regenerates instead of rewriting possessive pronouns,
// because a deterministic swap could silently change consent or intent.
func containsConflictingTurnOwnership(response string) bool {
	lower := strings.ToLower(response)
	for _, bodyPart := range reciprocalTurnBodyParts {
		userTurnTarget := "my " + bodyPart
		characterTurnTarget := "your " + bodyPart
		if phrasesAppearNearby(lower, "your turn", userTurnTarget, 80) &&
			phrasesAppearNearby(lower, "my turn", characterTurnTarget, 80) {
			return true
		}
	}
	return false
}

func phrasesAppearNearby(value, first, second string, maximumDistance int) bool {
	for firstOffset := strings.Index(value, first); firstOffset >= 0; {
		for secondOffset := strings.Index(value, second); secondOffset >= 0; {
			distance := firstOffset - secondOffset
			if distance < 0 {
				distance = -distance
			}
			if distance <= maximumDistance {
				return true
			}
			next := secondOffset + len(second)
			if next >= len(value) {
				break
			}
			remainderOffset := strings.Index(value[next:], second)
			if remainderOffset < 0 {
				break
			}
			secondOffset = next + remainderOffset
		}
		next := firstOffset + len(first)
		if next >= len(value) {
			break
		}
		remainderOffset := strings.Index(value[next:], first)
		if remainderOffset < 0 {
			break
		}
		firstOffset = next + remainderOffset
	}
	return false
}

func validatePersonalConversationFormatting(response string) (bool, string) {
	if strings.Contains(response, "**") {
		return false, "response uses bold formatting instead of plain dialogue"
	}

	narrationSpans := narrationSpanPattern.FindAllStringSubmatch(response, -1)
	if len(narrationSpans) > 1 {
		return false, fmt.Sprintf("response contains %d narration beats (limit 1)", len(narrationSpans))
	}
	if strings.Count(response, "*") != len(narrationSpans)*2 {
		return false, "response contains unbalanced or malformed narration markers"
	}
	if len(narrationSpans) == 1 && !firstPersonNarrationWord.MatchString(narrationSpans[0][1]) {
		return false, "narration must use the character's first-person voice"
	}
	if len(narrationSpans) == 1 && !firstPersonNarrationLead.MatchString(strings.TrimSpace(narrationSpans[0][1])) {
		return false, "narration must begin with I or My instead of omitting or changing the character subject"
	}
	if len(narrationSpans) == 1 && firstPersonForeignBodyNarrationV2.MatchString(strings.TrimSpace(narrationSpans[0][1])) {
		return false, "narration assigns another character's body"
	}
	if containsUnmarkedThirdPersonNarration(response) {
		return false, "response contains unmarked third-person narration"
	}
	if containsUnmarkedNarration(response) {
		return false, "response contains unmarked narration that must be wrapped in single asterisks"
	}
	if containsDialogueFormattingQuotes(response) {
		return false, "spoken dialogue contains presentation quotation marks"
	}

	for _, block := range blankLinePattern.Split(strings.TrimSpace(response), -1) {
		plainDialogue := strings.TrimSpace(narrationSpanPattern.ReplaceAllString(block, ""))
		if isWrappedInDialogueQuotationMarks(plainDialogue) {
			return false, "spoken dialogue must not be wrapped in quotation marks"
		}
	}
	return true, "personal conversation response formatting is valid"
}

// markUnmarkedNarration repairs only high-confidence first-person stage
// directions. It intentionally leaves ordinary statements such as "I think"
// or "My mother said" untouched so dialogue is never styled as narration.
func markUnmarkedNarration(response string) string {
	indices := assistantSentencePattern.FindAllStringIndex(response, -1)
	if len(indices) == 0 {
		return response
	}

	var out strings.Builder
	cursor := 0
	for _, index := range indices {
		out.WriteString(response[cursor:index[0]])
		sentence := response[index[0]:index[1]]
		leading := len(sentence) - len(strings.TrimLeft(sentence, " \t\r\n"))
		trailing := len(sentence) - len(strings.TrimRight(sentence, " \t\r\n"))
		coreEnd := len(sentence) - trailing
		core := sentence[leading:coreEnd]
		if !strings.Contains(core, "*") && looksLikeUnmarkedNarration(core) {
			out.WriteString(sentence[:leading])
			out.WriteByte('*')
			out.WriteString(core)
			out.WriteByte('*')
			out.WriteString(sentence[coreEnd:])
		} else {
			out.WriteString(sentence)
		}
		cursor = index[1]
	}
	out.WriteString(response[cursor:])
	return out.String()
}

func containsUnmarkedNarration(response string) bool {
	for _, sentence := range assistantSentencePattern.FindAllString(response, -1) {
		trimmed := strings.TrimSpace(sentence)
		if trimmed != "" && !strings.Contains(trimmed, "*") && looksLikeUnmarkedNarration(trimmed) {
			return true
		}
	}
	return false
}

func containsUnmarkedThirdPersonNarration(response string) bool {
	signals := countUnmarkedThirdPersonNarrationSignals(response)
	// Personal mode cannot safely reinterpret a physical third-person stage
	// direction as a harmless reference. A single high-confidence action is
	// therefore rejected; ordinary dialogue references do not match the narrow
	// action/body allowlist.
	return signals >= 1
}

func countUnmarkedThirdPersonNarrationSignals(response string) int {
	signals := 0
	for _, sentence := range assistantSentencePattern.FindAllString(response, -1) {
		trimmed := strings.TrimSpace(sentence)
		if trimmed == "" || strings.Contains(trimmed, "*") || strings.HasPrefix(trimmed, `"`) || strings.HasPrefix(trimmed, "“") {
			continue
		}
		if thirdPersonBodyNarration.MatchString(trimmed) ||
			thirdPersonOwnedPhysicalNarration.MatchString(trimmed) ||
			namedThirdPersonPhysicalNarration.MatchString(trimmed) ||
			articleSceneThirdPersonNarration.MatchString(trimmed) {
			signals++
		}
	}
	return signals
}

func looksLikeUnmarkedNarration(sentence string) bool {
	trimmed := strings.TrimSpace(sentence)
	if trimmed == "" || strings.HasPrefix(trimmed, `"`) || strings.HasPrefix(trimmed, "“") {
		return false
	}
	return firstPersonActionNarration.MatchString(trimmed) ||
		firstPersonSpeechTagNarration.MatchString(trimmed) ||
		firstPersonBodyAction.MatchString(trimmed) ||
		firstPersonForeignBodyNarrationV2.MatchString(trimmed) ||
		firstPersonGazeAction.MatchString(trimmed) ||
		bodyActionNarration.MatchString(trimmed)
}

func containsDialogueFormattingQuotes(response string) bool {
	if dialogueFormattingDoubleQuotePair.MatchString(response) ||
		dialogueFormattingSingleQuotePair.MatchString(response) ||
		singleDialogueQuoteBoundary.MatchString(response) {
		return true
	}

	outsideNarration := narrationSpanPattern.ReplaceAllString(response, "")
	quoteCount := 0
	for _, char := range outsideNarration {
		if char == '"' || char == '“' || char == '”' {
			quoteCount++
		}
	}
	return quoteCount%2 != 0
}

func isWrappedInDialogueQuotationMarks(value string) bool {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) < 2 {
		return false
	}
	isOpeningQuote := runes[0] == '"' || runes[0] == '“' || runes[0] == '”' || runes[0] == '\'' || runes[0] == '‘' || runes[0] == '’'
	isClosingQuote := runes[len(runes)-1] == '"' || runes[len(runes)-1] == '”' || runes[len(runes)-1] == '“' || runes[len(runes)-1] == '\'' || runes[len(runes)-1] == '’' || runes[len(runes)-1] == '‘'
	return isOpeningQuote && isClosingQuote
}

func meetsConversationalLengthBudget(response string, shape messageShape) (bool, string) {
	blocks := blankLinePattern.Split(strings.TrimSpace(response), -1)
	if shape.countsBlocks() && (len(blocks) < shape.minBlocks || len(blocks) > shape.maxBlocks) {
		return false, fmt.Sprintf("conversational response contains %d blocks (required %d to %d)",
			len(blocks), shape.minBlocks, shape.maxBlocks)
	}

	totalWords := len(strings.Fields(response))
	if totalWords > 100 {
		return false, fmt.Sprintf("conversational response contains %d words (limit 100)", totalWords)
	}

	// Everything below is the same chosen shape as the block count above: how
	// many of the messages carry weight, and how long each of those runs. A
	// character nobody picked a shape for is not held to any of it.
	if !shape.countsBlocks() {
		return true, fmt.Sprintf("conversational response uses %d blocks and %d words, unshaped", len(blocks), totalWords)
	}

	mediumBlocks := len(blocks)
	shortWords := len(strings.Fields(blocks[len(blocks)-1]))
	if len(blocks) >= 3 && shortWords <= 10 {
		mediumBlocks--
	}
	if mediumBlocks < shape.minMediumBlocks || mediumBlocks > shape.maxMediumBlocks {
		return false, fmt.Sprintf("conversational response contains %d medium blocks (required %d to %d)",
			mediumBlocks, shape.minMediumBlocks, shape.maxMediumBlocks)
	}
	for index := 0; index < mediumBlocks; index++ {
		wordCount := len(strings.Fields(blocks[index]))
		if wordCount < shape.minBlockWords {
			return false, fmt.Sprintf("medium block %d contains %d words (minimum %d)", index+1, wordCount, shape.minBlockWords)
		}
		if wordCount > shape.maxBlockWords {
			return false, fmt.Sprintf("medium block %d contains %d words (limit %d)", index+1, wordCount, shape.maxBlockWords)
		}
	}

	return true, fmt.Sprintf("conversational response uses %d blocks and %d words within budget", len(blocks), totalWords)
}
