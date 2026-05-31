package services_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPriceOracleService_GetUSDPrice(t *testing.T) {
	tests := []struct {
		name       string
		coin       string
		body       string
		statusCode int
		wantPrice  float64
		wantErr    bool
	}{
		{
			name:      "returns BTC price",
			coin:      "BTC",
			body:      `{"bitcoin":{"usd":65000.50}}`,
			wantPrice: 65000.50,
		},
		{
			name:      "returns ETH price",
			coin:      "ETH",
			body:      `{"ethereum":{"usd":3200.75}}`,
			wantPrice: 3200.75,
		},
		{
			name:      "returns CAH price",
			coin:      "CAH",
			body:      `{"moon-tropica-cah":{"usd":0.0523}}`,
			wantPrice: 0.0523,
		},
		{
			name:       "errors on non-200 response",
			coin:       "BTC",
			statusCode: http.StatusTooManyRequests,
			wantErr:    true,
		},
		{
			name:    "errors on unknown coin",
			coin:    "UNKNOWN",
			wantErr: true,
		},
		{
			name:    "errors on malformed JSON",
			coin:    "BTC",
			body:    `not json`,
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			statusCode := tc.statusCode
			if statusCode == 0 {
				statusCode = http.StatusOK
			}

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(statusCode)
				if tc.body != "" {
					_, _ = w.Write([]byte(tc.body))
				}
			}))
			defer server.Close()

			svc := services.NewPriceOracleService(server.URL)
			price, err := svc.GetUSDPrice(context.Background(), tc.coin)

			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.InDelta(t, tc.wantPrice, price, 0.0001)
		})
	}
}

func TestPriceOracleService_CachesPrice(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"bitcoin":{"usd":65000.00}}`))
	}))
	defer server.Close()

	svc := services.NewPriceOracleService(server.URL)
	ctx := context.Background()

	_, err := svc.GetUSDPrice(ctx, "BTC")
	require.NoError(t, err)

	_, err = svc.GetUSDPrice(ctx, "BTC")
	require.NoError(t, err)

	assert.Equal(t, 1, callCount, "expected only one HTTP call due to caching")
}
