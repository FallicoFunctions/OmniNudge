package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

type iaiMakerFake struct {
	calls   int
	answers services.IAIAnswers
	persona *models.BotPersona
	err     error
}

func (f *iaiMakerFake) Create(_ context.Context, _ int, answers services.IAIAnswers) (*models.BotPersona, error) {
	f.calls++
	f.answers = answers
	return f.persona, f.err
}

// likenessStarterFake stands in for what asks a render provider for her
// pictures. It records the call and can refuse, which is the case that matters:
// a provider outage must not cost somebody the character they just made.
type likenessStarterFake struct {
	mu      sync.Mutex
	calls   int
	persona *models.BotPersona
	err     error
	// called closes when Start has run. The handler asks for her pictures in
	// the background, so a test that read calls straight after the response
	// would be racing the goroutine rather than checking it.
	called chan struct{}
	// release, when non-nil, holds Start until the test lets it go. That is how
	// "creation does not wait for the render queue" is checked: if the handler
	// were on the request path, the response could not arrive first.
	release chan struct{}
}

func newLikenessStarterFake(err error) *likenessStarterFake {
	return &likenessStarterFake{err: err, called: make(chan struct{})}
}

func (f *likenessStarterFake) Start(_ context.Context, persona *models.BotPersona) ([]uuid.UUID, error) {
	f.mu.Lock()
	f.calls++
	f.persona = persona
	f.mu.Unlock()
	close(f.called)
	if f.release != nil {
		<-f.release
	}
	if f.err != nil {
		return nil, f.err
	}
	return []uuid.UUID{uuid.New()}, nil
}

// waitForStart blocks until her pictures have been asked for, or fails.
func (f *likenessStarterFake) waitForStart(t *testing.T) {
	t.Helper()
	select {
	case <-f.called:
	case <-time.After(2 * time.Second):
		t.Fatal("her picture was never asked for")
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	require.Equal(t, 1, f.calls)
}

func newIAITestRouter(maker OmniChatIAIMaker, claims OmniChatRequestIdempotencyStore) *gin.Engine {
	return newIAITestRouterWithLikeness(maker, claims, nil)
}

func newIAITestRouterWithLikeness(maker OmniChatIAIMaker, claims OmniChatRequestIdempotencyStore,
	likeness OmniChatLikenessStarter) *gin.Engine {
	gin.SetMode(gin.TestMode)
	handler := (&OmniChatHandler{}).SetRequestIdempotency(claims).SetIAICreator(maker)
	if likeness != nil {
		handler = handler.SetLikenessStarter(likeness)
	}
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", 9)
		c.Next()
	})
	router.POST("/api/v1/omnichat/iai", handler.CreateIAI)
	return router
}

func postIAI(t *testing.T, router *gin.Engine, body string) *httptest.ResponseRecorder {
	t.Helper()
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/omnichat/iai", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(response, request)
	return response
}

func TestTheFormIsToldWhatTheServerWillAccept(t *testing.T) {
	// Served rather than duplicated. An option the interface offers that this
	// endpoint does not list is one the server drops on the way in, and the
	// person gets a blanker character than the one they chose.
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/omnichat/iai/options", (&OmniChatHandler{}).GetIAIOptions)

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/omnichat/iai/options", nil))
	require.Equal(t, http.StatusOK, response.Code)

	var options IAIOptions
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &options))

	require.Equal(t, services.IAITemperamentKeys(), options.Temperaments)
	require.Equal(t, services.IAIFeelingKeys(), options.Feelings)
	require.Equal(t, services.IAIInterestKeys(), options.Interests)
	require.Equal(t, services.IAIAppearanceOptions(), options.Appearance)
	require.Equal(t, services.IAITemperamentPicks(), options.TemperamentPicks)
	require.Equal(t, services.IAIInterestPicks(), options.InterestPicks)

	minimumAge, maximumAge := services.IAIAgeRange()
	require.Equal(t, minimumAge, options.MinimumAge)
	require.Equal(t, maximumAge, options.MaximumAge)

	minimumHeight, maximumHeight := services.IAIHeightRange()
	require.Equal(t, minimumHeight, options.MinimumHeightInches)
	require.Equal(t, maximumHeight, options.MaximumHeightInches)

	// The three answers that depend on an earlier one arrive worked out, not as
	// a rule for the interface to apply. Every one of these was missing from the
	// payload after the schema changed, which left screens three and four with
	// nothing to draw.
	require.Equal(t, services.IAIEyeColours("anime"), options.Eyes["anime"])
	require.Equal(t, services.IAIEyeColours("realistic"), options.Eyes["realistic"])
	require.NotContains(t, options.Eyes["realistic"], "violet")
	require.Contains(t, options.Eyes["anime"], "violet")

	require.Equal(t, services.IAIBuilds("woman"), options.Builds["woman"])
	require.Equal(t, services.IAIBuilds("man"), options.Builds["man"])
	require.Contains(t, options.Builds["woman"], "curvy")
	require.NotContains(t, options.Builds["man"], "curvy")

	// Every drawing style, gender and texture is indexed, so the interface looks
	// its answer up rather than working it out.
	for _, style := range options.Appearance["style"] {
		for _, gender := range options.Appearance["gender"] {
			for _, texture := range options.Appearance["hair_texture"] {
				require.Equal(t, services.IAIHairStyles(style, gender, texture),
					options.HairStyles[style][gender][texture],
					"%s %s %s hair", style, gender, texture)
			}
		}
	}
	require.NotContains(t, options.HairStyles["realistic"]["woman"]["straight"], "afro")
	require.Contains(t, options.HairStyles["anime"]["woman"]["straight"], "afro")
	require.Contains(t, options.HairStyles["realistic"]["man"]["straight"], "man_bun",
		"length does not decide which shapes exist")
	require.Equal(t, services.OmniChatIAILimit, options.IAILimit)

	// One is the count. Which tier may have one is the other half, and without
	// it the interface has to hold its own copy of a rule the server enforces.
	require.Equal(t, services.OmniChatIAIRequiredPlan(), options.IAIRequiredPlan)
	require.Equal(t, "premium", options.IAIRequiredPlan)
	require.Equal(t, 0, options.RoleplayLimits["free"], "writing one is a paid feature too")
	require.Equal(t, services.OmniChatRoleplayLimits(), options.RoleplayLimits)

	// Every list has to arrive as a list. A map or a count would still pass the
	// equality checks above while being useless to render from.
	body := response.Body.String()
	require.Contains(t, body, `"temperaments":["warm"`)
	require.Contains(t, body, `"appearance":{`)
	require.NotContains(t, body, "null", "an empty list renders as [] or the form has nothing to draw")
}

func TestCreatingAnIAIAnswersWithHer(t *testing.T) {
	maker := &iaiMakerFake{persona: &models.BotPersona{ID: 12, Name: "Sam", Slug: "sam-12"}}
	router := newIAITestRouter(maker, &omniChatRequestIdempotencyFake{})

	response := postIAI(t, router, `{"request_id":"`+uuid.NewString()+`","name":"Sam",
		"temperaments":["warm","playful"],"interests":["games"],"feeling":"besotted"}`)

	require.Equal(t, http.StatusCreated, response.Code)
	var created models.BotPersona
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &created))
	require.Equal(t, "sam-12", created.Slug)

	// The answers reach the maker as given, rather than being reinterpreted on
	// the way through.
	require.Equal(t, "Sam", maker.answers.Name)
	require.Equal(t, []string{"warm", "playful"}, maker.answers.Temperaments)
	require.Equal(t, "besotted", maker.answers.Feeling)
}

func TestPressingTheButtonTwiceMakesOneCharacter(t *testing.T) {
	// Nine screens end in one button. Without the claim the second press makes
	// a second character, and since her slug carries her own id there is
	// nothing left to collide -- so it would succeed quietly and leave somebody
	// with a duplicate of the person they just made.
	maker := &iaiMakerFake{persona: &models.BotPersona{ID: 12, Name: "Sam", Slug: "sam-12"}}
	claims := &omniChatRequestIdempotencyFake{
		claim: &models.OmniChatRequestClaim{Replay: true, Response: json.RawMessage(`{"id":12,"slug":"sam-12"}`)},
	}
	router := newIAITestRouter(maker, claims)

	response := postIAI(t, router, `{"request_id":"`+uuid.NewString()+`","name":"Sam"}`)

	require.Equal(t, http.StatusOK, response.Code)
	require.Contains(t, response.Body.String(), "sam-12")
	require.Zero(t, maker.calls, "a replay must not reach creation at all")
}

func TestAnAccountThatCannotMakeOneIsToldWhy(t *testing.T) {
	// §19 excludes free and the lowest tier. Somebody who cannot do this should
	// learn that rather than meet a generic failure they cannot act on.
	maker := &iaiMakerFake{err: services.ErrIAICreationNotEntitled}
	router := newIAITestRouter(maker, &omniChatRequestIdempotencyFake{})

	response := postIAI(t, router, `{"request_id":"`+uuid.NewString()+`","name":"Sam"}`)

	require.Equal(t, http.StatusForbidden, response.Code)
	require.Contains(t, response.Body.String(), "iai_requires_upgrade")
}

func TestTheCallersMistakeIsNotOurOutage(t *testing.T) {
	// Answering 400 to a database that would not write sends somebody off to
	// fix a form that was fine.
	theirs := &iaiMakerFake{err: services.ErrIAINameRequired}
	response := postIAI(t, newIAITestRouter(theirs, &omniChatRequestIdempotencyFake{}),
		`{"request_id":"`+uuid.NewString()+`","name":"  "}`)
	require.Equal(t, http.StatusBadRequest, response.Code)

	ours := &iaiMakerFake{err: context.DeadlineExceeded}
	response = postIAI(t, newIAITestRouter(ours, &omniChatRequestIdempotencyFake{}),
		`{"request_id":"`+uuid.NewString()+`","name":"Sam"}`)
	require.Equal(t, http.StatusInternalServerError, response.Code)
}

func TestAnUnderageRefusalSaysWhatItIs(t *testing.T) {
	// Hidden behind "cannot be created as described", somebody adjusts hair
	// colour trying to work out what went wrong.
	maker := &iaiMakerFake{err: services.ErrIAIUnderage}
	router := newIAITestRouter(maker, &omniChatRequestIdempotencyFake{})

	response := postIAI(t, router,
		`{"request_id":"`+uuid.NewString()+`","name":"Sam","appearance":{"age":16}}`)

	require.Equal(t, http.StatusBadRequest, response.Code)
	require.Contains(t, response.Body.String(), "iai_underage")
	require.Contains(t, response.Body.String(), "18 or older")
}

func TestWhatSheLooksLikeReachesTheMaker(t *testing.T) {
	maker := &iaiMakerFake{persona: &models.BotPersona{ID: 1}}
	router := newIAITestRouter(maker, &omniChatRequestIdempotencyFake{})

	response := postIAI(t, router, `{"request_id":"`+uuid.NewString()+`","name":"Sam",
		"appearance":{"style":"anime","gender":"woman","age":27,"height_inches":65,
			"hair_length":"long","hair_texture":"curly","hair_style":"high_ponytail"}}`)

	require.Equal(t, http.StatusCreated, response.Code)
	require.Equal(t, "anime", maker.answers.Appearance.Style)
	require.Equal(t, 27, maker.answers.Appearance.Age)
	require.Equal(t, 65, maker.answers.Appearance.HeightInches)

	// Hair arrives as the three answers it is, rather than one word standing in
	// for all of them.
	require.Equal(t, "long", maker.answers.Appearance.HairLength)
	require.Equal(t, "curly", maker.answers.Appearance.HairTexture)
	require.Equal(t, "high_ponytail", maker.answers.Appearance.HairStyle)
}

func TestAnAvalancheOfAnswersIsRefusedBeforeAnythingReadsIt(t *testing.T) {
	maker := &iaiMakerFake{persona: &models.BotPersona{ID: 1}}
	router := newIAITestRouter(maker, &omniChatRequestIdempotencyFake{})

	picks := make([]string, omniChatIAIMaxPicks+1)
	for index := range picks {
		picks[index] = "warm"
	}
	encoded, err := json.Marshal(picks)
	require.NoError(t, err)

	response := postIAI(t, router,
		`{"request_id":"`+uuid.NewString()+`","name":"Sam","temperaments":`+string(encoded)+`}`)

	require.Equal(t, http.StatusBadRequest, response.Code)
	require.Zero(t, maker.calls)
}

func TestCreationUnavailableIsNotACharacterQuietlyNotMade(t *testing.T) {
	router := newIAITestRouter(nil, &omniChatRequestIdempotencyFake{})
	response := postIAI(t, router, `{"request_id":"`+uuid.NewString()+`","name":"Sam"}`)
	require.Equal(t, http.StatusServiceUnavailable, response.Code)
}

func TestTheNameShuffleIsGivenAListRatherThanARule(t *testing.T) {
	// One call when the screen opens; every shuffle after it is local. The blend
	// is not sent, because how people are named across cultures is a judgement
	// rather than a detail, and a rule sent to a client is a rule that can
	// disagree with the server.
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/omnichat/iai/names", (&OmniChatHandler{}).GetIAINames)

	ask := func(query string) []string {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/omnichat/iai/names"+query, nil))
		require.Equal(t, http.StatusOK, response.Code)
		var body IAINameSuggestions
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
		return body.Names
	}

	latina := ask("?ethnicity=latino&gender=woman")
	require.Equal(t, services.IAINames("latino", "woman"), latina)
	require.Contains(t, latina, "Camila")
	require.Contains(t, latina, "Anna", "and a name from anywhere, which is the point")
	require.NotContains(t, latina, "Mateo", "an answered question still narrows")

	// Asked before those screens, or by something that skipped them. Neither
	// unanswered question is answered on somebody's behalf.
	unanswered := ask("")
	require.Equal(t, services.IAINames("mixed", ""), unanswered)
	require.Greater(t, len(unanswered), len(latina))
	require.Contains(t, unanswered, "Camila")
	require.Contains(t, unanswered, "Mateo")

	// Nothing about the mixing rule is on the wire.
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/omnichat/iai/names?ethnicity=latino", nil))
	require.NotContains(t, response.Body.String(), "shared")
	require.NotContains(t, response.Body.String(), "weight")
}

func TestARenderOutageDoesNotCostSomebodyTheirCharacter(t *testing.T) {
	// The property this wiring exists to have. She is made whether or not
	// anything can draw her, so a provider that is down must not fail the ten
	// screens somebody just answered.
	maker := &iaiMakerFake{persona: &models.BotPersona{ID: 12, Name: "Sam", Slug: "sam-12"}}
	likeness := newLikenessStarterFake(errors.New("runpod is unreachable"))
	router := newIAITestRouterWithLikeness(maker, &omniChatRequestIdempotencyFake{}, likeness)

	response := postIAI(t, router, `{"request_id":"`+uuid.NewString()+`","name":"Sam",
		"temperaments":["warm"],"interests":["games"],"feeling":"fond"}`)

	require.Equal(t, http.StatusCreated, response.Code, "she exists either way")
	var created models.BotPersona
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &created))
	require.Equal(t, "sam-12", created.Slug)
	likeness.waitForStart(t)
}

func TestHerPictureIsAskedForWithHer(t *testing.T) {
	maker := &iaiMakerFake{persona: &models.BotPersona{ID: 12, Name: "Sam", Slug: "sam-12"}}
	likeness := newLikenessStarterFake(nil)
	router := newIAITestRouterWithLikeness(maker, &omniChatRequestIdempotencyFake{}, likeness)

	response := postIAI(t, router, `{"request_id":"`+uuid.NewString()+`","name":"Sam",
		"temperaments":["warm"],"interests":["games"],"feeling":"fond"}`)

	require.Equal(t, http.StatusCreated, response.Code)
	likeness.waitForStart(t)
	require.NotNil(t, likeness.persona)
	require.Equal(t, 12, likeness.persona.ID, "for the character that was just made")
}

func TestCreationSurvivesHavingNothingToDrawWith(t *testing.T) {
	// No likeness starter installed at all, which is a deployment with no
	// render provider configured. Creation is not allowed to depend on it.
	maker := &iaiMakerFake{persona: &models.BotPersona{ID: 12, Name: "Sam", Slug: "sam-12"}}
	router := newIAITestRouter(maker, &omniChatRequestIdempotencyFake{})

	response := postIAI(t, router, `{"request_id":"`+uuid.NewString()+`","name":"Sam",
		"temperaments":["warm"],"interests":["games"],"feeling":"fond"}`)

	require.Equal(t, http.StatusCreated, response.Code)
}

func TestCreationDoesNotWaitForTheRenderQueue(t *testing.T) {
	// The control for the previous version of this was blind: putting the call
	// back on the request path still passed, because the test only checked that
	// it happened. A queue that stalls would have held up a creation that had
	// already succeeded, and a client that disconnected would have cancelled
	// her pictures outright.
	//
	// So the starter is held open here. If the handler waited for it, the
	// response could not arrive.
	maker := &iaiMakerFake{persona: &models.BotPersona{ID: 12, Name: "Sam", Slug: "sam-12"}}
	likeness := newLikenessStarterFake(nil)
	likeness.release = make(chan struct{})
	router := newIAITestRouterWithLikeness(maker, &omniChatRequestIdempotencyFake{}, likeness)

	responded := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		responded <- postIAI(t, router, `{"request_id":"`+uuid.NewString()+`","name":"Sam",
			"temperaments":["warm"],"interests":["games"],"feeling":"fond"}`)
	}()

	select {
	case response := <-responded:
		require.Equal(t, http.StatusCreated, response.Code)
	case <-time.After(2 * time.Second):
		close(likeness.release)
		t.Fatal("creation waited for the render queue")
	}

	close(likeness.release)
	likeness.waitForStart(t)
}
