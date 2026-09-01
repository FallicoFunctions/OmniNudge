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

// Creating an OmniAI (§34).
//
// Separate from CreatePersona, which writes a roleplay character out of the
// fields somebody typed. §13 is the reason: those two are different kinds of
// thing, and the writer underneath this one has no columns to put an
// instruction in.

// OmniChatCreateOmniAIRequest is what nine screens send.
//
// Picks and a name. There is no free-text field here beyond the name, and that
// is not an oversight -- a chooser cannot smuggle "you will never leave him"
// into a list of options, which is what makes the form safe rather than a
// validator that would have to be right every time.
type OmniChatCreateOmniAIRequest struct {
	RequestID    uuid.UUID `json:"request_id"`
	Name         string    `json:"name"`
	Temperaments []string  `json:"temperaments"`
	Interests    []string  `json:"interests"`
	Feeling      string    `json:"feeling"`
	Relationship string    `json:"relationship"`
	// Appearance is recorded now and drawn later (§34). Nothing renders her
	// yet, and the answers are kept so nobody has to give them twice.
	Appearance services.OmniAIAppearance `json:"appearance"`
}

// omniChatOmniAIMaxPicks bounds what the body may carry before anything looks at
// it. The converter already ignores extras, but a request arriving with ten
// thousand strings should be refused rather than iterated.
const omniChatOmniAIMaxPicks = 32

// OmniChatOmniAIMaker is what this handler needs from creation, which is one
// method.
//
// An interface rather than the concrete service, so the handler can be exercised
// over HTTP without a database behind it -- the same shape the media and billing
// handlers already use, and the reason those have HTTP tests and this did not.
type OmniChatOmniAIMaker interface {
	Create(ctx context.Context, creatorUserID int, answers services.OmniAIAnswers) (*models.BotPersona, error)
}

// SetOmniAICreator installs the maker of OmniAIs.
func (h *OmniChatHandler) SetOmniAICreator(creator OmniChatOmniAIMaker) *OmniChatHandler {
	h.omniAICreator = creator
	return h
}

// OmniAIOptions is every choice the nine screens may offer, plus the limits that
// decide whether they can be offered at all.
//
// Served rather than duplicated. The lists live in one place and the interface
// draws from them, so a temperament added on the server does not need a second
// edit on the client -- and cannot silently be offered as an option that
// converts to nothing.
type OmniAIOptions struct {
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

	MinimumAge          int `json:"minimum_age"`
	MaximumAge          int `json:"maximum_age"`
	MinimumHeightInches int `json:"minimum_height_inches"`
	MaximumHeightInches int `json:"maximum_height_inches"`
	OmniAILimit         int `json:"omniai_limit"`

	// How many the caller already keeps, so the interface can refuse before it
	// asks rather than after. The server refuses again at creation regardless:
	// this is what somebody is shown, not what enforces anything.
	OmniAIOwned        int            `json:"omniai_owned"`
	OmniAIAllowed      bool           `json:"omniai_allowed"`
	OmniAIRequiredPlan string         `json:"omniai_required_plan"`
	RoleplayLimits     map[string]int `json:"roleplay_limits"`
}

// GetOmniAIOptions answers what the creation flow may show.
func (h *OmniChatHandler) GetOmniAIOptions(c *gin.Context) {
	appearance := services.OmniAIAppearanceOptions()

	eyes := make(map[string][]string, len(appearance["style"]))
	hairStyles := make(map[string]map[string]map[string][]string, len(appearance["style"]))
	for _, style := range appearance["style"] {
		eyes[style] = services.OmniAIEyeColours(style)
		hairStyles[style] = make(map[string]map[string][]string, len(appearance["gender"]))
		for _, gender := range appearance["gender"] {
			byTexture := make(map[string][]string, len(appearance["hair_texture"]))
			for _, texture := range appearance["hair_texture"] {
				byTexture[texture] = services.OmniAIHairStyles(style, gender, texture)
			}
			hairStyles[style][gender] = byTexture
		}
	}

	builds := make(map[string][]string, len(appearance["gender"]))
	for _, gender := range appearance["gender"] {
		builds[gender] = services.OmniAIBuilds(gender)
	}

	minimumAge, maximumAge := services.OmniAIAgeRange()
	minimumHeight, maximumHeight := services.OmniAIHeightRange()
	omniAIAllowed, omniAILimit := h.omniAIState(c)
	c.JSON(http.StatusOK, OmniAIOptions{
		Temperaments:     services.OmniAITemperamentKeys(),
		TemperamentPicks: services.OmniAITemperamentPicks(),
		Feelings:         services.OmniAIFeelingKeys(),
		Relationships:    services.OmniAIRelationshipKeys(),
		Interests:        services.OmniAIInterestKeys(),
		InterestPicks:    services.OmniAIInterestPicks(),
		Appearance:       appearance,
		Eyes:             eyes,
		Builds:           builds,
		HairStyles:       hairStyles,

		MinimumAge:          minimumAge,
		MaximumAge:          maximumAge,
		MinimumHeightInches: minimumHeight,
		MaximumHeightInches: maximumHeight,
		OmniAILimit:         omniAILimit,
		OmniAIOwned:         h.omniAIOwned(c),
		OmniAIAllowed:       omniAIAllowed,
		OmniAIRequiredPlan:  services.OmniChatOmniAIRequiredPlan(),
		RoleplayLimits:      services.OmniChatRoleplayLimits(),
	})
}

// OmniAINameSuggestions is what the shuffle on screen eight draws from.
type OmniAINameSuggestions struct {
	Names []string `json:"names"`
}

// GetOmniAINames answers with the whole list, blended, rather than one name.
//
// One call when the screen opens; every shuffle after that is instant and
// offline. A name per press would put a round trip behind a button somebody
// presses idly, and would make the shuffle a rate-limit surface for nothing.
//
// The blend is not sent. The interface picks uniformly from what it is given
// and never learns the mixing rule, which is a judgement about how people are
// named rather than a detail -- and a rule sent to a client is a rule that can
// disagree with the server.
func (h *OmniChatHandler) GetOmniAINames(c *gin.Context) {
	c.JSON(http.StatusOK, OmniAINameSuggestions{
		Names: services.OmniAINames(c.Query("ethnicity"), c.Query("gender")),
	})
}

// CreateOmniAI turns the answers into somebody.
func (h *OmniChatHandler) CreateOmniAI(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	if h.omniAICreator == nil {
		RespondError(c, http.StatusServiceUnavailable, "Character creation is temporarily unavailable")
		return
	}

	var request OmniChatCreateOmniAIRequest
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid character creation request")
		return
	}
	if len(request.Temperaments) > omniChatOmniAIMaxPicks || len(request.Interests) > omniChatOmniAIMaxPicks {
		RespondError(c, http.StatusBadRequest, "Too many answers")
		return
	}

	// Nine screens end in one button, and a button gets pressed twice. Without
	// a claim the second press makes a second character -- which no longer
	// collides on anything, so it would succeed silently and leave somebody
	// with a duplicate of the person they just made.
	claim, ok := h.claimOmniChatRequest(c, userID, request.RequestID, "omniai_create", fmt.Sprintf("user:%d", userID), struct {
		Name         string                    `json:"name"`
		Temperaments []string                  `json:"temperaments"`
		Interests    []string                  `json:"interests"`
		Feeling      string                    `json:"feeling"`
		Relationship string                    `json:"relationship"`
		Appearance   services.OmniAIAppearance `json:"appearance"`
	}{request.Name, request.Temperaments, request.Interests, request.Feeling, request.Relationship, request.Appearance})
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

	persona, err := h.omniAICreator.Create(c.Request.Context(), userID, services.OmniAIAnswers{
		Name:         request.Name,
		Temperaments: request.Temperaments,
		Interests:    request.Interests,
		Feeling:      request.Feeling,
		Relationship: request.Relationship,
		Appearance:   request.Appearance,
	})
	if err != nil {
		if errors.Is(err, services.ErrOmniAICreationNotEntitled) {
			// Told plainly. §19 excludes free and the lowest tier, and an
			// account that cannot do this should learn why rather than meet a
			// generic failure.
			RespondErrorCoded(c, http.StatusForbidden, "omniai_requires_upgrade",
				"OmniAIs are available on the top tier.")
			return
		}
		if errors.Is(err, models.ErrOmniAILimitReached) {
			// One at a time (§34). Deleting her is how another is made, and the
			// interface should say that rather than report a failure.
			RespondErrorCoded(c, http.StatusConflict, "omniai_already_exists",
				"You already have an OmniAI. Delete her to make another.")
			return
		}
		if errors.Is(err, services.ErrOmniAIUnderage) {
			// Said plainly. A safety refusal hidden behind "cannot be created
			// as described" leaves somebody adjusting hair colour to find out
			// what went wrong.
			RespondErrorCoded(c, http.StatusBadRequest, "omniai_underage",
				"Characters must be 18 or older.")
			return
		}
		if errors.Is(err, services.ErrOmniAINameRequired) {
			RespondErrorCoded(c, http.StatusBadRequest, "omniai_name_required",
				"She needs a name.")
			return
		}
		if errors.Is(err, services.ErrOmniAINameTooLong) {
			RespondErrorCoded(c, http.StatusBadRequest, "omniai_name_too_long",
				"That name is too long.")
			return
		}
		if errors.Is(err, services.ErrOmniAINameInvalid) {
			// Told plainly, for the reason stated above the underage branch: a
			// name refused behind "cannot be created as described" leaves
			// somebody editing her appearance to find out what was wrong with
			// her name.
			RespondErrorCoded(c, http.StatusBadRequest, "omniai_name_invalid",
				"A name can use letters, digits, spaces, apostrophes and hyphens.")
			return
		}
		zlog.Error().Err(err).Int("user_id", userID).Msg("omnichat omniai: creation failed")
		RespondError(c, http.StatusInternalServerError, "Failed to create the character")
		return
	}

	// Her picture is asked for after she exists, off the request.
	//
	// Detached and in the background for the reason memory extraction already
	// is: this creates four job rows and puts four tasks on a queue, and a
	// Redis stall would otherwise hold up a creation that has already
	// succeeded. On the request's own context it was worse than slow -- a
	// client that disconnected cancelled it, and nothing ever asks again, so
	// somebody would be left with a character who has no face and no way to
	// get one.
	//
	// Its failure is logged rather than raised either way. She is made whether
	// or not a provider is reachable.
	if starter := h.likeness; starter != nil {
		detached := context.WithoutCancel(c.Request.Context())
		personaForRender := persona
		go func() {
			renderCtx, cancel := context.WithTimeout(detached, omniChatLikenessStartTimeout)
			defer cancel()
			started, likenessErr := starter.Start(renderCtx, personaForRender)
			if likenessErr != nil {
				zlog.Error().Err(likenessErr).Int("user_id", userID).
					Int("persona_id", personaForRender.ID).Int("started", len(started)).
					Msg("omnichat omniai: could not ask for every likeness candidate")
			}
		}()
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
			Msg("omnichat omniai: could not close the request claim for a created character")
	} else {
		completed = true
	}

	c.JSON(http.StatusCreated, persona)
}
