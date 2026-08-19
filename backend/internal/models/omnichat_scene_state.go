package models

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	omniChatSceneMaxActors = 12
	omniChatSceneMaxFacts  = 32
	omniChatSceneMaxText   = 256
)

var ErrOmniChatSceneStateConflict = errors.New("omnichat scene state conflict")

type OmniChatSceneActorKind string

const (
	OmniChatSceneActorUser    OmniChatSceneActorKind = "user"
	OmniChatSceneActorPersona OmniChatSceneActorKind = "persona"
	OmniChatSceneActorNPC     OmniChatSceneActorKind = "npc"
	OmniChatSceneActorSystem  OmniChatSceneActorKind = "system"
)

type OmniChatSceneStatus string

const (
	OmniChatSceneStatusProposed  OmniChatSceneStatus = "proposed"
	OmniChatSceneStatusCompleted OmniChatSceneStatus = "completed"
)

type OmniChatSceneBoundaryKind string

const (
	OmniChatSceneBoundaryConsent  OmniChatSceneBoundaryKind = "consent"
	OmniChatSceneBoundaryBoundary OmniChatSceneBoundaryKind = "boundary"
)

type OmniChatSceneBoundaryValue string

const (
	OmniChatSceneBoundaryAllowed  OmniChatSceneBoundaryValue = "allowed"
	OmniChatSceneBoundaryDeclined OmniChatSceneBoundaryValue = "declined"
	OmniChatSceneBoundaryRequired OmniChatSceneBoundaryValue = "required"
)

// OmniChatSceneAppearance is what an actor visibly looks like right now. It is
// tracked per actor and persists across turns until the transcript changes it,
// because an image request can arrive at any point in a scene and the wardrobe
// established ten messages ago is still the correct answer.
type OmniChatSceneAppearance struct {
	Outfit      string   `json:"outfit,omitempty"`
	Accessories []string `json:"accessories,omitempty"`
	BodyState   string   `json:"body_state,omitempty"`
}

type OmniChatSceneActor struct {
	Key        string                  `json:"key"`
	Kind       OmniChatSceneActorKind  `json:"kind"`
	Label      string                  `json:"label"`
	Appearance OmniChatSceneAppearance `json:"appearance,omitempty"`
}

// OmniChatSceneSetting is the physical place the scene occupies. Description is
// the load-bearing field: a bare place name ("dungeon") gives an image model
// nothing, so the extractor is asked for the concrete surfaces, fixtures, and
// objects the transcript established.
type OmniChatSceneSetting struct {
	Place       string `json:"place,omitempty"`
	Description string `json:"description,omitempty"`
	TimeOfDay   string `json:"time_of_day,omitempty"`
	Lighting    string `json:"lighting,omitempty"`
}

// OmniChatSceneStaging is the momentary arrangement of the scene: what the
// persona is doing at this instant and where she is relative to the user.
type OmniChatSceneStaging struct {
	PersonaPose       string `json:"persona_pose,omitempty"`
	PersonaExpression string `json:"persona_expression,omitempty"`
	Mood              string `json:"mood,omitempty"`
	Proximity         string `json:"proximity,omitempty"`
}
type OmniChatSceneEvent struct {
	Subject string `json:"subject"`
	Action  string `json:"action"`
	Target  string `json:"target"`
}
type OmniChatSceneOwnershipFact struct {
	Subject string `json:"subject"`
	Owner   string `json:"owner"`
}
type OmniChatSceneBoundaryFact struct {
	Subject string                     `json:"subject"`
	Kind    OmniChatSceneBoundaryKind  `json:"kind"`
	Value   OmniChatSceneBoundaryValue `json:"value"`
}

// OmniChatConversationSceneState is server-derived continuity state. Browser
// media scene_state remains separate and is not authoritative continuity.
type OmniChatConversationSceneState struct {
	ConversationID      int                          `json:"-"`
	OwnerUserID         int                          `json:"-"`
	Actors              []OmniChatSceneActor         `json:"actors"`
	ActiveTurnActor     string                       `json:"active_turn_actor"`
	Event               OmniChatSceneEvent           `json:"event"`
	Status              OmniChatSceneStatus          `json:"status"`
	Location            string                       `json:"location"`
	Setting             OmniChatSceneSetting         `json:"setting,omitempty"`
	Staging             OmniChatSceneStaging         `json:"staging,omitempty"`
	OwnershipFacts      []OmniChatSceneOwnershipFact `json:"ownership_facts"`
	BoundaryFacts       []OmniChatSceneBoundaryFact  `json:"boundary_facts"`
	Revision            int64                        `json:"-"`
	CheckpointMessageID int                          `json:"-"`
	CreatedAt           time.Time                    `json:"-"`
	UpdatedAt           time.Time                    `json:"-"`
}

func (s OmniChatConversationSceneState) Validate() error {
	if s.ConversationID < 1 || s.OwnerUserID < 1 {
		return errors.New("omnichat scene state: conversation and owner are required")
	}
	if len(s.Actors) == 0 || len(s.Actors) > omniChatSceneMaxActors {
		return fmt.Errorf("omnichat scene state: actors must contain 1 to %d entries", omniChatSceneMaxActors)
	}
	keys := map[string]struct{}{}
	for _, a := range s.Actors {
		if !validSceneActorKey(a.Key, a.Kind) || !validSceneText(a.Label) || !validActor(a.Kind) {
			return errors.New("omnichat scene state: actor key, label, and kind are required")
		}
		if err := validSceneAppearance(a.Appearance); err != nil {
			return fmt.Errorf("omnichat scene state: actor %q: %w", a.Key, err)
		}
		if _, ok := keys[a.Key]; ok {
			return fmt.Errorf("omnichat scene state: duplicate actor %q", a.Key)
		}
		keys[a.Key] = struct{}{}
	}
	if !hasActor(keys, s.ActiveTurnActor) {
		return errors.New("omnichat scene state: active turn actor must reference an actor")
	}
	if !hasActor(keys, s.Event.Subject) || !hasActor(keys, s.Event.Target) || !validSceneText(s.Event.Action) {
		return errors.New("omnichat scene state: subject, action, and target are required actor/event facts")
	}
	if s.Status != OmniChatSceneStatusProposed && s.Status != OmniChatSceneStatusCompleted {
		return fmt.Errorf("omnichat scene state: invalid status %q", s.Status)
	}
	if !validSceneText(s.Location) {
		return errors.New("omnichat scene state: location is required and bounded")
	}
	// Setting, Staging, and per-actor Appearance are optional. Checkpoints
	// written before these fields existed are re-validated on load, so
	// requiring them here would make every stored checkpoint unreadable.
	for _, value := range []string{s.Setting.Place, s.Setting.Description, s.Setting.TimeOfDay, s.Setting.Lighting,
		s.Staging.PersonaPose, s.Staging.PersonaExpression, s.Staging.Mood, s.Staging.Proximity} {
		if !optionalSceneText(value) {
			return errors.New("omnichat scene state: setting and staging text must be bounded")
		}
	}
	if len(s.OwnershipFacts) > omniChatSceneMaxFacts || len(s.BoundaryFacts) > omniChatSceneMaxFacts {
		return fmt.Errorf("omnichat scene state: no more than %d facts of each kind are allowed", omniChatSceneMaxFacts)
	}
	ownersBySubject := make(map[string]string, len(s.OwnershipFacts))
	for _, f := range s.OwnershipFacts {
		if !validSceneText(f.Subject) || !hasActor(keys, f.Owner) {
			return errors.New("omnichat scene state: ownership fact must have a bounded subject and known owner")
		}
		subject := strings.ToLower(strings.TrimSpace(f.Subject))
		if owner, exists := ownersBySubject[subject]; exists && owner != f.Owner {
			return fmt.Errorf("omnichat scene state: conflicting ownership facts for %q", subject)
		}
		ownersBySubject[subject] = f.Owner
	}
	boundariesBySubjectAndKind := make(map[string]OmniChatSceneBoundaryValue, len(s.BoundaryFacts))
	for _, f := range s.BoundaryFacts {
		if !hasActor(keys, f.Subject) || (f.Kind != OmniChatSceneBoundaryConsent && f.Kind != OmniChatSceneBoundaryBoundary) || (f.Value != OmniChatSceneBoundaryAllowed && f.Value != OmniChatSceneBoundaryDeclined && f.Value != OmniChatSceneBoundaryRequired) {
			return errors.New("omnichat scene state: boundary value, kind, and subject must be valid")
		}
		key := strings.TrimSpace(f.Subject) + "\x00" + string(f.Kind)
		if value, exists := boundariesBySubjectAndKind[key]; exists && value != f.Value {
			return fmt.Errorf("omnichat scene state: conflicting boundary facts for %q", f.Subject)
		}
		boundariesBySubjectAndKind[key] = f.Value
	}
	return nil
}

// physicalContactActions are the tracked event verbs that actually put the
// user's body in the camera frame. Conversation, observation, and proximity do
// not: a scene image is shot from the user's point of view, so the default is
// the persona alone. Matching is substring-based against the extracted action,
// which is a short verb phrase such as "kneels between" or "grips the wrist of".
var physicalContactActions = []string{
	"touch", "hold", "grip", "grab", "pull", "push", "press", "pin", "straddle",
	"kneel between", "kiss", "lick", "suck", "bite", "stroke", "rub", "caress",
	"embrace", "hug", "carry", "bind", "tie", "cuff", "restrain", "spank", "slap",
	"whip", "flog", "penetrate", "thrust", "mount", "ride", "grind", "undress",
	"unbutton", "unzip", "lean over", "lie on", "sit on", "climb onto",
}

// UserBodyIsVisible reports whether a generated image should show the user's
// body alongside the persona.
//
// This replaces the worker's substring matching on raw transcript text, which
// forced a fixed two-person composition whenever certain words appeared and
// invented a second person for ordinary scenes.
func (s OmniChatConversationSceneState) UserBodyIsVisible() bool {
	if s.Event.Subject != "user" && s.Event.Target != "user" {
		return false
	}
	// A user acting on themselves is still self-directed, not a shared frame.
	if s.Event.Subject == "user" && s.Event.Target == "user" {
		return false
	}
	action := stemSceneAction(s.Event.Action)
	if action == "" {
		return false
	}
	for _, contact := range physicalContactActions {
		if strings.Contains(action, contact) {
			return true
		}
	}
	return false
}

// stemSceneAction lowercases an action phrase and drops third-person "s"
// endings so multi-word entries match conjugated text: the extractor writes
// "kneels between the legs of", not "kneel between".
func stemSceneAction(action string) string {
	fields := strings.Fields(strings.ToLower(strings.TrimSpace(action)))
	for index, word := range fields {
		if len(word) > 3 && strings.HasSuffix(word, "s") && !strings.HasSuffix(word, "ss") {
			fields[index] = strings.TrimSuffix(word, "s")
		}
	}
	return strings.Join(fields, " ")
}

type OmniChatConversationSceneStateRepository struct{ pool *pgxpool.Pool }

func NewOmniChatConversationSceneStateRepository(pool *pgxpool.Pool) *OmniChatConversationSceneStateRepository {
	return &OmniChatConversationSceneStateRepository{pool: pool}
}

func (r *OmniChatConversationSceneStateRepository) UpsertOwned(ctx context.Context, state OmniChatConversationSceneState) (*OmniChatConversationSceneState, error) {
	if r == nil || r.pool == nil {
		return nil, errors.New("omnichat scene state: repository is unavailable")
	}
	if err := state.Validate(); err != nil {
		return nil, err
	}
	payload, err := json.Marshal(state)
	if err != nil {
		return nil, fmt.Errorf("omnichat scene state: encode state: %w", err)
	}
	stored, err := scanCurrentSceneState(r.pool.QueryRow(ctx, `INSERT INTO omnichat_conversation_scene_states (conversation_id,owner_user_id,active_turn_actor,subject,action,target,action_status,location,state) SELECT $1,c.user_id,$3,$4,$5,$6,$7,$8,$9 FROM bot_conversations c WHERE c.id=$1 AND c.user_id=$2 AND c.archived_at IS NULL ON CONFLICT (conversation_id) DO UPDATE SET active_turn_actor=EXCLUDED.active_turn_actor,subject=EXCLUDED.subject,action=EXCLUDED.action,target=EXCLUDED.target,action_status=EXCLUDED.action_status,location=EXCLUDED.location,state=EXCLUDED.state,revision=omnichat_conversation_scene_states.revision+1,updated_at=CURRENT_TIMESTAMP WHERE omnichat_conversation_scene_states.owner_user_id=EXCLUDED.owner_user_id AND omnichat_conversation_scene_states.revision=$10 RETURNING owner_user_id,revision,created_at,updated_at,state`, state.ConversationID, state.OwnerUserID, state.ActiveTurnActor, state.Event.Subject, state.Event.Action, state.Event.Target, state.Status, state.Location, payload, state.Revision))
	if errors.Is(err, pgx.ErrNoRows) {
		var exists bool
		e := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM bot_conversations WHERE id=$1 AND user_id=$2 AND archived_at IS NULL)`, state.ConversationID, state.OwnerUserID).Scan(&exists)
		if e != nil {
			return nil, e
		}
		if !exists {
			return nil, ErrOmniChatConversationNotOwned
		}
		// A zero revision is valid only for the first insert. If a current
		// state row already exists, the update predicate can still produce
		// no RETURNING row when a historical branch starts without a
		// checkpoint revision; report a conflict so callers can persist that
		// branch without overwriting current state.
		var currentRevision int64
		currentErr := r.pool.QueryRow(ctx, `SELECT revision FROM omnichat_conversation_scene_states WHERE conversation_id=$1 AND owner_user_id=$2`, state.ConversationID, state.OwnerUserID).Scan(&currentRevision)
		if currentErr == nil {
			return nil, ErrOmniChatSceneStateConflict
		}
		if !errors.Is(currentErr, pgx.ErrNoRows) {
			return nil, currentErr
		}
		return nil, ErrOmniChatConversationNotOwned
	}
	if err != nil {
		return nil, err
	}
	stored.ConversationID = state.ConversationID
	return stored, nil
}
func (r *OmniChatConversationSceneStateRepository) GetOwned(ctx context.Context, owner, conversation int) (*OmniChatConversationSceneState, error) {
	if r == nil || r.pool == nil {
		return nil, errors.New("omnichat scene state: repository is unavailable")
	}
	s, e := scanCurrentSceneState(r.pool.QueryRow(ctx, `SELECT owner_user_id,revision,created_at,updated_at,state FROM omnichat_conversation_scene_states WHERE conversation_id=$1 AND owner_user_id=$2`, conversation, owner))
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, nil
	}
	if e == nil {
		s.ConversationID = conversation
	}
	return s, e
}
func (r *OmniChatConversationSceneStateRepository) SaveCheckpointOwned(ctx context.Context, state OmniChatConversationSceneState, messageID int) error {
	if r == nil || r.pool == nil {
		return errors.New("omnichat scene state: repository is unavailable")
	}
	if err := state.Validate(); err != nil {
		return err
	}
	if messageID < 1 {
		return errors.New("omnichat scene state: checkpoint message is required")
	}
	p, e := json.Marshal(state)
	if e != nil {
		return e
	}
	tag, e := r.pool.Exec(ctx, `INSERT INTO omnichat_conversation_scene_state_checkpoints (conversation_id,message_id,owner_user_id,source_revision,state) SELECT $1,m.id,c.user_id,$4,$5 FROM bot_messages m JOIN bot_conversations c ON c.id=m.conversation_id WHERE m.id=$2 AND m.conversation_id=$1 AND c.user_id=$3 AND c.archived_at IS NULL ON CONFLICT (conversation_id,message_id) DO UPDATE SET source_revision=EXCLUDED.source_revision,state=EXCLUDED.state,created_at=CURRENT_TIMESTAMP`, state.ConversationID, messageID, state.OwnerUserID, state.Revision, p)
	if e != nil {
		return e
	}
	if tag.RowsAffected() != 1 {
		return ErrOmniChatConversationNotOwned
	}
	return nil
}
func (r *OmniChatConversationSceneStateRepository) GetLatestCheckpointAtOrBeforeOwned(ctx context.Context, owner, conversation, message int) (*OmniChatConversationSceneState, error) {
	if r == nil || r.pool == nil {
		return nil, errors.New("omnichat scene state: repository is unavailable")
	}
	s, e := scanCheckpointSceneState(r.pool.QueryRow(ctx, `SELECT owner_user_id,source_revision,created_at,state,message_id FROM omnichat_conversation_scene_state_checkpoints WHERE conversation_id=$1 AND owner_user_id=$2 AND message_id<=$3 ORDER BY message_id DESC LIMIT 1`, conversation, owner, message))
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, nil
	}
	if e == nil {
		s.ConversationID = conversation
	}
	return s, e
}
func scanCurrentSceneState(scanner interface{ Scan(...any) error }) (*OmniChatConversationSceneState, error) {
	s := &OmniChatConversationSceneState{}
	var p []byte
	err := scanner.Scan(&s.OwnerUserID, &s.Revision, &s.CreatedAt, &s.UpdatedAt, &p)
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(p, s); err != nil {
		return nil, fmt.Errorf("omnichat scene state: decode state: %w", err)
	}
	return s, nil
}
func scanCheckpointSceneState(scanner interface{ Scan(...any) error }) (*OmniChatConversationSceneState, error) {
	s := &OmniChatConversationSceneState{}
	var p []byte
	err := scanner.Scan(&s.OwnerUserID, &s.Revision, &s.CreatedAt, &p, &s.CheckpointMessageID)
	if err != nil {
		return nil, err
	}
	// Checkpoints are immutable snapshots and only carry created_at. Keep the
	// in-memory scene-state contract explicit instead of pretending there is a
	// separate checkpoint update timestamp.
	s.UpdatedAt = s.CreatedAt
	if err = json.Unmarshal(p, s); err != nil {
		return nil, fmt.Errorf("omnichat scene state: decode state: %w", err)
	}
	return s, nil
}

const omniChatSceneMaxAccessories = 8

// optionalSceneText accepts an empty value but applies the same bounds and
// control-character rules as a required one.
func optionalSceneText(v string) bool {
	return strings.TrimSpace(v) == "" || validSceneText(v)
}

func validSceneAppearance(a OmniChatSceneAppearance) error {
	if !optionalSceneText(a.Outfit) || !optionalSceneText(a.BodyState) {
		return errors.New("appearance text must be bounded")
	}
	if len(a.Accessories) > omniChatSceneMaxAccessories {
		return fmt.Errorf("no more than %d accessories are allowed", omniChatSceneMaxAccessories)
	}
	for _, accessory := range a.Accessories {
		if !validSceneText(accessory) {
			return errors.New("each accessory must be a bounded non-empty noun")
		}
	}
	return nil
}

func validSceneText(v string) bool {
	trimmed := strings.TrimSpace(v)
	if len(trimmed) == 0 || utf8.RuneCountInString(trimmed) > omniChatSceneMaxText {
		return false
	}
	for _, r := range trimmed {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}
func hasActor(m map[string]struct{}, k string) bool { _, ok := m[k]; return ok }
func validActor(k OmniChatSceneActorKind) bool {
	return k == OmniChatSceneActorUser || k == OmniChatSceneActorPersona || k == OmniChatSceneActorNPC || k == OmniChatSceneActorSystem
}
func validSceneActorKey(key string, kind OmniChatSceneActorKind) bool {
	if !validSceneText(key) || strings.ContainsAny(key, " \t\r\n") {
		return false
	}
	switch kind {
	case OmniChatSceneActorUser:
		return key == "user"
	case OmniChatSceneActorPersona:
		return key == "persona"
	case OmniChatSceneActorNPC:
		return strings.HasPrefix(key, "npc:") && len(strings.TrimPrefix(key, "npc:")) > 0
	case OmniChatSceneActorSystem:
		return key == "system"
	default:
		return false
	}
}
