package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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

func newIAITestRouter(maker OmniChatIAIMaker, claims OmniChatRequestIdempotencyStore) *gin.Engine {
	gin.SetMode(gin.TestMode)
	handler := (&OmniChatHandler{}).SetRequestIdempotency(claims).SetIAICreator(maker)
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
		"appearance":{"style":"anime","gender":"woman","age":27,"hair":"curly"}}`)

	require.Equal(t, http.StatusCreated, response.Code)
	require.Equal(t, "anime", maker.answers.Appearance.Style)
	require.Equal(t, 27, maker.answers.Appearance.Age)
	require.Equal(t, "curly", maker.answers.Appearance.Hair)
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
