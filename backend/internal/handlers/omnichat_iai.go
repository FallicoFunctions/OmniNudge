package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// Creating an independent character (§34).
//
// Separate from CreatePersona, which writes a roleplay character out of the
// fields somebody typed. §13 is the reason: those two are different kinds of
// thing, and the writer underneath this one has no columns to put an
// instruction in.

// OmniChatCreateIAIRequest is what nine screens send.
//
// Picks and a name. There is no free-text field here beyond the name, and that
// is not an oversight -- a chooser cannot smuggle "you will never leave him"
// into a list of options, which is what makes the form safe rather than a
// validator that would have to be right every time.
type OmniChatCreateIAIRequest struct {
	RequestID    uuid.UUID `json:"request_id"`
	Name         string    `json:"name"`
	Temperaments []string  `json:"temperaments"`
	Interests    []string  `json:"interests"`
	Feeling      string    `json:"feeling"`
	// Appearance is recorded now and drawn later (§34). Nothing renders her
	// yet, and the answers are kept so nobody has to give them twice.
	Appearance services.IAIAppearance `json:"appearance"`
}

// omniChatIAIMaxPicks bounds what the body may carry before anything looks at
// it. The converter already ignores extras, but a request arriving with ten
// thousand strings should be refused rather than iterated.
const omniChatIAIMaxPicks = 32

// OmniChatIAIMaker is what this handler needs from creation, which is one
// method.
//
// An interface rather than the concrete service, so the handler can be exercised
// over HTTP without a database behind it -- the same shape the media and billing
// handlers already use, and the reason those have HTTP tests and this did not.
type OmniChatIAIMaker interface {
	Create(ctx context.Context, creatorUserID int, answers services.IAIAnswers) (*models.BotPersona, error)
}

// SetIAICreator installs the maker of independent characters.
func (h *OmniChatHandler) SetIAICreator(creator OmniChatIAIMaker) *OmniChatHandler {
	h.iaiCreator = creator
	return h
}

// CreateIAI turns the answers into somebody.
func (h *OmniChatHandler) CreateIAI(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	if h.iaiCreator == nil {
		RespondError(c, http.StatusServiceUnavailable, "Character creation is temporarily unavailable")
		return
	}

	var request OmniChatCreateIAIRequest
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid character creation request")
		return
	}
	if len(request.Temperaments) > omniChatIAIMaxPicks || len(request.Interests) > omniChatIAIMaxPicks {
		RespondError(c, http.StatusBadRequest, "Too many answers")
		return
	}

	// Nine screens end in one button, and a button gets pressed twice. Without
	// a claim the second press makes a second character -- which no longer
	// collides on anything, so it would succeed silently and leave somebody
	// with a duplicate of the person they just made.
	claim, ok := h.claimOmniChatRequest(c, userID, request.RequestID, "iai_create", fmt.Sprintf("user:%d", userID), struct {
		Name         string   `json:"name"`
		Temperaments []string `json:"temperaments"`
		Interests    []string `json:"interests"`
		Feeling      string   `json:"feeling"`
	}{request.Name, request.Temperaments, request.Interests, request.Feeling})
	if !ok {
		return
	}
	if claim.Replay {
		c.Data(http.StatusOK, "application/json", claim.Response)
		return
	}
	completed := false
	defer func() {
		if !completed {
			h.failOmniChatRequest(userID, request.RequestID)
		}
	}()

	persona, err := h.iaiCreator.Create(c.Request.Context(), userID, services.IAIAnswers{
		Name:         request.Name,
		Temperaments: request.Temperaments,
		Interests:    request.Interests,
		Feeling:      request.Feeling,
		Appearance:   request.Appearance,
	})
	if err != nil {
		if errors.Is(err, services.ErrIAICreationNotEntitled) {
			// Told plainly. §19 excludes free and the lowest tier, and an
			// account that cannot do this should learn why rather than meet a
			// generic failure.
			RespondErrorCoded(c, http.StatusForbidden, "iai_requires_upgrade",
				"Independent characters are available on the top tier.")
			return
		}
		if errors.Is(err, services.ErrIAIUnderage) {
			// Said plainly. A safety refusal hidden behind "cannot be created
			// as described" leaves somebody adjusting hair colour to find out
			// what went wrong.
			RespondErrorCoded(c, http.StatusBadRequest, "iai_underage",
				"Characters must be 18 or older.")
			return
		}
		if isOmniChatIAIRequestFault(err) {
			RespondError(c, http.StatusBadRequest, "That character cannot be created as described")
			return
		}
		zlog.Error().Err(err).Int("user_id", userID).Msg("omnichat iai: creation failed")
		RespondError(c, http.StatusInternalServerError, "Failed to create the character")
		return
	}

	payload, marshalErr := json.Marshal(persona)
	if marshalErr == nil {
		marshalErr = h.completeOmniChatRequest(userID, request.RequestID, payload)
	}
	if marshalErr != nil {
		// She exists, so the request is not failed back to the caller. The
		// claim is left to the deferred failure instead, which releases it for
		// a retry rather than holding it pending -- and the retry cannot make a
		// second character, because it carries the same request id.
		zlog.Warn().Err(marshalErr).Int("user_id", userID).
			Msg("omnichat iai: could not close the request claim for a created character")
	} else {
		completed = true
	}

	c.JSON(http.StatusCreated, persona)
}

// isOmniChatIAIRequestFault separates what the caller got wrong from what we
// did. A missing name is theirs; a database that would not write is ours, and
// answering 400 to our own outage sends somebody to fix a form that is fine.
func isOmniChatIAIRequestFault(err error) bool {
	return errors.Is(err, services.ErrIAINameRequired) || errors.Is(err, services.ErrIAINameTooLong)
}
