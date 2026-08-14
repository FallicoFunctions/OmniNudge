package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/omninudge/backend/internal/services"
)

// ErrPersonaNotAdmissible is the single answer to every reason a character may
// not enter a world. The caller turns it into one generic refusal, so a holder
// of an admission credential learns nothing about which characters exist.
var ErrPersonaNotAdmissible = errors.New("omnigame: persona is not admissible")

// AdmissionService turns a validated admission credential into a world token
// for one character.
//
// It never writes anything. Admission is a read plus a signature; the runtime
// persists what the character does through the existing profile endpoints, and
// keeping the write out of here means a refused or replayed admission leaves
// no trace behind.
type AdmissionService struct {
	personas repository.PersonaRepository
	profiles repository.ProfileRepository
	tokens   GameSessionTokenIssuer
}

func NewAdmissionService(
	personas repository.PersonaRepository,
	profiles repository.ProfileRepository,
	tokens GameSessionTokenIssuer,
) *AdmissionService {
	return &AdmissionService{personas: personas, profiles: profiles, tokens: tokens}
}

func (s *AdmissionService) AdmitPersona(ctx context.Context, personaID int64) (*model.PersonaAdmission, error) {
	if s == nil || s.personas == nil {
		// No eligibility source means nothing can be shown to be admissible,
		// which is a refusal rather than a pass.
		return nil, ErrPersonaNotAdmissible
	}

	persona, err := s.personas.FindAdmissiblePersona(ctx, personaID)
	if err != nil {
		return nil, err
	}
	if persona == nil {
		return nil, ErrPersonaNotAdmissible
	}

	// UserID stays nil and that is now safe to state rather than infer: the
	// kind says persona outright, so nothing downstream has to read the absent
	// user id as "guest".
	identity := model.PlayerIdentity{
		Kind:     model.SubjectKindPersona,
		Username: persona.Name,
	}

	loadout := map[string]string{}
	var returnPoint *model.SavedPoint
	if s.profiles != nil {
		profile, err := s.profiles.GetProfileBySubject(ctx, model.ResidentRef{
			Kind: model.SubjectKindPersona,
			ID:   persona.ID,
		})
		if err != nil {
			return nil, err
		}
		if profile != nil {
			if profile.Loadout != nil {
				loadout = profile.Loadout
			}
			returnPoint = profile.ReturnPoint
		}
	}

	if s.tokens == nil {
		return nil, fmt.Errorf("omnigame: no token issuer configured for persona admission")
	}

	admission := &model.PersonaAdmission{
		PlayerID:   fmt.Sprintf("persona-%d", persona.ID),
		PlayerName: persona.Name,
	}

	worldToken, err := s.tokens.GenerateOmniRaveWorldJWT(services.OmniRaveWorldTokenInput{
		Username:    identity.Username,
		SubjectKind: identity.ResolvedKind(),
		PlayerID:    admission.PlayerID,
		PlayerName:  admission.PlayerName,
		// Named rather than reusing the account or guest mode, so the world can
		// tell how this subject arrived without inspecting the player id.
		Mode:        "persona",
		Loadout:     loadout,
		ReturnPoint: returnPoint,
	})
	if err != nil {
		return nil, err
	}
	admission.WorldSessionToken = worldToken

	return admission, nil
}
