package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

const priceCacheTTL = 5 * time.Minute

// coinGeckoIDs maps our coin tickers to CoinGecko API IDs.
var coinGeckoIDs = map[string]string{
	"BTC": "bitcoin",
	"ETH": "ethereum",
	"CAH": "moon-tropica-cah",
}

type cachedPrice struct {
	price     float64
	fetchedAt time.Time
}

// PriceOracleService fetches live USD prices from CoinGecko and caches
// them for 5 minutes to avoid hammering the free-tier rate limit.
type PriceOracleService struct {
	baseURL string
	client  *http.Client
	mu      sync.Mutex
	cache   map[string]cachedPrice
}

// NewPriceOracleService creates a PriceOracleService. baseURL defaults to
// CoinGecko's API root; pass an alternative URL in tests to use a stub server.
func NewPriceOracleService(baseURL string) *PriceOracleService {
	if baseURL == "" {
		baseURL = "https://api.coingecko.com/api/v3"
	}
	return &PriceOracleService{
		baseURL: baseURL,
		client:  &http.Client{Timeout: 10 * time.Second},
		cache:   make(map[string]cachedPrice),
	}
}

// GetUSDPrice returns the current USD price for the given coin ticker.
// Results are cached for 5 minutes.
func (s *PriceOracleService) GetUSDPrice(ctx context.Context, coin string) (float64, error) {
	geckoID, ok := coinGeckoIDs[coin]
	if !ok {
		return 0, fmt.Errorf("unsupported coin: %s", coin)
	}

	s.mu.Lock()
	if cached, ok := s.cache[coin]; ok && time.Since(cached.fetchedAt) < priceCacheTTL {
		s.mu.Unlock()
		return cached.price, nil
	}
	s.mu.Unlock()

	url := fmt.Sprintf("%s/simple/price?ids=%s&vs_currencies=usd", s.baseURL, geckoID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, fmt.Errorf("build price request: %w", err)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("fetch price for %s: %w", coin, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("price API returned %d for %s", resp.StatusCode, coin)
	}

	// Response shape: {"bitcoin":{"usd":65000.5}}
	var data map[string]map[string]float64
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, fmt.Errorf("decode price response: %w", err)
	}

	coinData, ok := data[geckoID]
	if !ok {
		return 0, fmt.Errorf("coin %s not in price response", geckoID)
	}
	price, ok := coinData["usd"]
	if !ok {
		return 0, fmt.Errorf("usd price missing for %s", geckoID)
	}
	if price <= 0 {
		return 0, fmt.Errorf("invalid price %.4f for %s", price, coin)
	}

	s.mu.Lock()
	s.cache[coin] = cachedPrice{price: price, fetchedAt: time.Now()}
	s.mu.Unlock()

	return price, nil
}
