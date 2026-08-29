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
	Relationship string    `json:"relationship"`
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

// IAIOptions is every choice the nine screens may offer, plus the limits that
// decide whether they can be offered at all.
//
// Served rather than duplicated. The lists live in one place and the interface
// draws from them, so a temperament added on the server does not need a second
// edit on the client -- and cannot silently be offered as an option that
// converts to nothing.
type IAIOptions struct {
	Temperaments     []string            `json:"temperaments"`
	TemperamentPicks int                 `json:"temperament_picks"`
	Feelings         []string            `json:"feelings"`
	Relationships    []string            `json:"relationships"`
	Interests        []string            `json:"interests"`
	InterestPicks    int                 `json:"interest_picks"`
	Appearance       map[string][]string `json:"appearance"`

	// Three of the appearance answers depend on an earlier one, so they cannot
	// be flat lists. They are served as every answer already worked out, indexed
	// by what they depend on, rather than as a rule the interface applies for
	// itself -- a rule sent to the client is a rule that can disagree with the
	// server, which is the whole reason this endpoint exists.
	//
	// Eyes are indexed by drawing style: violet is offered to a drawing and not
	// to a character claiming to be a person. Builds are indexed by gender, and
	// hair shapes by drawing style, then gender, then texture.
	Eyes       map[string][]string                       `json:"eyes"`
	Builds     map[string][]string                       `json:"builds"`
	HairStyles map[string]map[string]map[string][]string `json:"hair_styles"`

	MinimumAge          int            `json:"minimum_age"`
	MaximumAge          int            `json:"maximum_age"`
	MinimumHeightInches int            `json:"minimum_height_inches"`
	MaximumHeightInches int            `json:"maximum_height_inches"`
	IAILimit            int            `json:"iai_limit"`

	// How many the caller already keeps, so the interface can refuse before it
	// asks rather than after. The server refuses again at creation regardless:
	// this is what somebody is shown, not what enforces anything.
	IAIOwned            int            `json:"iai_owned"`
	IAIRequiredPlan     string         `json:"iai_required_plan"`
	RoleplayLimits      map[string]int `json:"roleplay_limits"`
}

// GetIAIOptions answers what the creation flow may show.
func (h *OmniChatHandler) GetIAIOptions(c *gin.Context) {
	appearance := services.IAIAppearanceOptions()

	eyes := make(map[string][]string, len(appearance["style"]))
	hairStyles := make(map[string]map[string]map[string][]string, len(appearance["style"]))
	for _, style := range appearance["style"] {
		eyes[style] = services.IAIEyeColours(style)
		hairStyles[style] = make(map[string]map[string][]string, len(appearance["gender"]))
		for _, gender := range appearance["gender"] {
			byTexture := make(map[string][]string, len(appearance["hair_texture"]))
			for _, texture := range appearance["hair_texture"] {
				byTexture[texture] = services.IAIHairStyles(style, gender, texture)
			}
			hairStyles[style][gender] = byTexture
		}
	}

	builds := make(map[string][]string, len(appearance["gender"]))
	for _, gender := range appearance["gender"] {
		builds[gender] = services.IAIBuilds(gender)
	}

	minimumAge, maximumAge := services.IAIAgeRange()
	minimumHeight, maximumHeight := services.IAIHeightRange()
	c.JSON(http.StatusOK, IAIOptions{
		Temperaments:     services.IAITemperamentKeys(),
		TemperamentPicks: services.IAITemperamentPicks(),
		Feelings:         services.IAIFeelingKeys(),
		Relationships:    services.IAIRelationshipKeys(),
		Interests:        services.IAIInterestKeys(),
		InterestPicks:    services.IAIInterestPicks(),
		Appearance:       appearance,
		Eyes:             eyes,
		Builds:           builds,
		HairStyles:       hairStyles,

		MinimumAge:          minimumAge,
		MaximumAge:          maximumAge,
		MinimumHeightInches: minimumHeight,
		MaximumHeightInches: maximumHeight,
		IAILimit:            h.iaiLimit(c),
		IAIOwned:            h.iaiOwned(c),
		IAIRequiredPlan:     services.OmniChatIAIRequiredPlan(),
		RoleplayLimits:      services.OmniChatRoleplayLimits(),
	})
}

// IAINameSuggestions is what the shuffle on screen eight draws from.
type IAINameSuggestions struct {
	Names []string `json:"names"`
}

// GetIAINames answers with the whole list, blended, rather than one name.
//
// One call when the screen opens; every shuffle after that is instant and
// offline. A name per press would put a round trip behind a button somebody
// presses idly, and would make the shuffle a rate-limit surface for nothing.
//
// The blend is not sent. The interface picks uniformly from what it is given
// and never learns the mixing rule, which is a judgement about how people are
// named rather than a detail -- and a rule sent to a client is a rule that can
// disagree with the server.
func (h *OmniChatHandler) GetIAINames(c *gin.Context) {
	c.JSON(http.StatusOK, IAINameSuggestions{
		Names: services.IAINames(c.Query("ethnicity"), c.Query("gender")),
	})
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
		Relationship string   `json:"relationship"`
	}{request.Name, request.Temperaments, request.Interests, request.Feeling, request.Relationship})
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
		Relationship: request.Relationship,
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
		if errors.Is(err, models.ErrIAILimitReached) {
			// One at a time (§34). Deleting her is how another is made, and the
			// interface should say that rather than report a failure.
			RespondErrorCoded(c, http.StatusConflict, "iai_already_exists",
				"You already have an independent character. Delete her to make another.")
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
