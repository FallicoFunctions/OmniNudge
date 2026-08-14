package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

type omniChatBillingReaderFake struct {
	offers       []services.OmniChatBillingOffer
	wallet       *models.OmniCreditsWallet
	usage        []models.OmniCreditsUsageEntry
	usageOwner   int
	usageLimit   int
	videoAllowed bool
	videoCost    int64
}

func (f *omniChatBillingReaderFake) Catalog() []services.OmniChatBillingOffer {
	return append([]services.OmniChatBillingOffer(nil), f.offers...)
}
func (f *omniChatBillingReaderFake) UsageCosts() map[string]int64 {
	return map[string]int64{models.OmniCreditsUsageVideo: f.videoCost}
}
func (f *omniChatBillingReaderFake) UsageHistoryOwned(_ context.Context, userID, limit int) ([]models.OmniCreditsUsageEntry, error) {
	f.usageOwner, f.usageLimit = userID, limit
	return append([]models.OmniCreditsUsageEntry(nil), f.usage...), nil
}
func (f *omniChatBillingReaderFake) FindOffer(id string) (services.OmniChatBillingOffer, bool) {
	for _, offer := range f.offers {
		if offer.ID == id {
			return offer, true
		}
	}
	return services.OmniChatBillingOffer{}, false
}
func (f *omniChatBillingReaderFake) WalletOwned(_ context.Context, _ int) (*models.OmniCreditsWallet, error) {
	return f.wallet, nil
}
func (f *omniChatBillingReaderFake) CanReserveVideoOwned(context.Context, int) (bool, int64, error) {
	return f.videoAllowed, f.videoCost, nil
}

type omniChatCheckoutFake struct {
	userID      int
	idempotency uuid.UUID
	offer       services.OmniChatBillingOffer
}

func (f *omniChatCheckoutFake) CreateCheckout(_ context.Context, userID int, idempotency uuid.UUID, offer services.OmniChatBillingOffer) (string, error) {
	f.userID, f.idempotency, f.offer = userID, idempotency, offer
	return "https://checkout.example.test/session", nil
}

func newOmniChatBillingTestRouter(reader omniChatBillingReader, checkout OmniChatCheckoutProvider) *gin.Engine {
	gin.SetMode(gin.TestMode)
	handler := NewOmniChatBillingHandler(reader, checkout)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", 17)
		c.Next()
	})
	router.GET("/catalog", handler.Catalog)
	router.GET("/wallet", handler.Wallet)
	router.GET("/usage", handler.Usage)
	router.GET("/video-entitlement", handler.VideoEntitlement)
	router.POST("/checkout", handler.CreateCheckout)
	return router
}

func TestOmniChatBillingHandlerReturnsOwnerScopedUsageAndPerSessionEntitlement(t *testing.T) {
	reader := &omniChatBillingReaderFake{
		usage:        []models.OmniCreditsUsageEntry{{ID: 3, EntryType: models.OmniCreditsEntryUsageDebit}},
		videoAllowed: true,
		videoCost:    40,
	}
	router := newOmniChatBillingTestRouter(reader, nil)

	usageResponse := httptest.NewRecorder()
	router.ServeHTTP(usageResponse, httptest.NewRequest(http.MethodGet, "/usage?limit=25", nil))
	require.Equal(t, http.StatusOK, usageResponse.Code)
	require.Equal(t, 17, reader.usageOwner)
	require.Equal(t, 25, reader.usageLimit)

	entitlementResponse := httptest.NewRecorder()
	router.ServeHTTP(entitlementResponse, httptest.NewRequest(http.MethodGet, "/video-entitlement", nil))
	require.Equal(t, http.StatusOK, entitlementResponse.Code)
	var entitlement map[string]any
	require.NoError(t, json.Unmarshal(entitlementResponse.Body.Bytes(), &entitlement))
	require.Equal(t, "per_session", entitlement["unit"])
	require.Equal(t, float64(40), entitlement["credit_cost"])
}

func TestOmniChatBillingHandlerCheckoutUsesServerOfferAndOpaqueID(t *testing.T) {
	approved := services.OmniChatBillingOffer{
		ID: "premium-approved", Kind: "subscription", Plan: "premium",
		Credits: 500, PriceCents: 3499, Currency: "USD", PeriodDays: 30,
	}
	reader := &omniChatBillingReaderFake{offers: []services.OmniChatBillingOffer{approved}}
	checkout := &omniChatCheckoutFake{}
	router := newOmniChatBillingTestRouter(reader, checkout)
	idempotency := uuid.New()
	body := []byte(`{"offer_id":"premium-approved","idempotency_id":"` + idempotency.String() + `"}`)

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/checkout", bytes.NewReader(body)))

	require.Equal(t, http.StatusCreated, response.Code, response.Body.String())
	require.Equal(t, 17, checkout.userID)
	require.Equal(t, idempotency, checkout.idempotency)
	require.Equal(t, approved, checkout.offer)
}

func TestOmniChatBillingHandlerRejectsClientPriceAndFailsClosedWithoutCheckout(t *testing.T) {
	approved := services.OmniChatBillingOffer{
		ID: "credits-approved", Kind: "credits", Credits: 100,
		PriceCents: 499, Currency: "USD",
	}
	router := newOmniChatBillingTestRouter(&omniChatBillingReaderFake{
		offers: []services.OmniChatBillingOffer{approved},
	}, nil)
	idempotency := uuid.NewString()

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/checkout", bytes.NewBufferString(
		`{"offer_id":"credits-approved","idempotency_id":"`+idempotency+`","price_cents":1}`,
	)))
	require.Equal(t, http.StatusBadRequest, response.Code)

	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/checkout", bytes.NewBufferString(
		`{"offer_id":"credits-approved","idempotency_id":"`+idempotency+`"}`,
	)))
	require.Equal(t, http.StatusServiceUnavailable, response.Code)
}
