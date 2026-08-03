package models

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
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

type OmniChatSceneActor struct {
	Key   string                 `json:"key"`
	Kind  OmniChatSceneActorKind `json:"kind"`
	Label string                 `json:"label"`
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
		if !validSceneText(a.Key) || !validSceneText(a.Label) || !validActor(a.Kind) {
			return errors.New("omnichat scene state: actor key, label, and kind are required")
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
	if len(s.OwnershipFacts) > omniChatSceneMaxFacts || len(s.BoundaryFacts) > omniChatSceneMaxFacts {
		return fmt.Errorf("omnichat scene state: no more than %d facts of each kind are allowed", omniChatSceneMaxFacts)
	}
	for _, f := range s.OwnershipFacts {
		if !validSceneText(f.Subject) || !hasActor(keys, f.Owner) {
			return errors.New("omnichat scene state: ownership fact must have a bounded subject and known owner")
		}
	}
	for _, f := range s.BoundaryFacts {
		if !hasActor(keys, f.Subject) || (f.Kind != OmniChatSceneBoundaryConsent && f.Kind != OmniChatSceneBoundaryBoundary) || (f.Value != OmniChatSceneBoundaryAllowed && f.Value != OmniChatSceneBoundaryDeclined && f.Value != OmniChatSceneBoundaryRequired) {
			return errors.New("omnichat scene state: boundary value, kind, and subject must be valid")
		}
	}
	return nil
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
		if state.Revision > 0 {
			return nil, ErrOmniChatSceneStateConflict
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
	s, e := scanCheckpointSceneState(r.pool.QueryRow(ctx, `SELECT owner_user_id,source_revision,created_at,created_at,state,message_id FROM omnichat_conversation_scene_state_checkpoints WHERE conversation_id=$1 AND owner_user_id=$2 AND message_id<=$3 ORDER BY message_id DESC LIMIT 1`, conversation, owner, message))
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
	err := scanner.Scan(&s.OwnerUserID, &s.Revision, &s.CreatedAt, &s.UpdatedAt, &p, &s.CheckpointMessageID)
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(p, s); err != nil {
		return nil, fmt.Errorf("omnichat scene state: decode state: %w", err)
	}
	return s, nil
}
func validSceneText(v string) bool {
	return len(strings.TrimSpace(v)) > 0 && utf8.RuneCountInString(v) <= omniChatSceneMaxText
}
func hasActor(m map[string]struct{}, k string) bool { _, ok := m[k]; return ok }
func validActor(k OmniChatSceneActorKind) bool {
	return k == OmniChatSceneActorUser || k == OmniChatSceneActorPersona || k == OmniChatSceneActorNPC || k == OmniChatSceneActorSystem
}
