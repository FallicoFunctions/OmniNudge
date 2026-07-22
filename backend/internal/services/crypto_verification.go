package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/models"
)

const (
	BTCConfirmationThreshold = 3
	ETHConfirmationThreshold = 12

	// Satoshis per BTC
	satoshisPerBTC = 1e8
)

// CryptoVerifier is the interface satisfied by CryptoVerificationService.
// Extracted so workers and handlers can depend on the interface, not the concrete type.
type CryptoVerifier interface {
	Verify(ctx context.Context, txid, coin string) (*VerificationResult, error)
}

// VerificationResult holds the outcome of a transaction lookup.
type VerificationResult struct {
	AmountReceived float64
	Confirmations  int
	Confirmed      bool // true when confirmations >= threshold
}

// CryptoVerificationService validates submitted TXIDs against the blockchain.
// It uses Blockstream for BTC and Blockscout for ETH/CAH (no API key needed).
type CryptoVerificationService struct {
	btcWallet   string // Our BTC receiving address
	ethWallet   string // Our ETH receiving address (lowercase)
	cahContract string // CAH ERC-20 token contract (lowercase)
	btcBaseURL  string // Blockstream API base
	ethBaseURL  string // Blockscout API base
	client      *http.Client
}

// NewCryptoVerificationService constructs the service. In tests, pass stub
// server URLs for btcBaseURL and ethBaseURL instead of the defaults.
func NewCryptoVerificationService(btcWallet, ethWallet, cahContract, btcBaseURL, ethBaseURL string) *CryptoVerificationService {
	if btcBaseURL == "" {
		btcBaseURL = "https://blockstream.info/api"
	}
	if ethBaseURL == "" {
		ethBaseURL = "https://eth.blockscout.com/api/v2"
	}
	return &CryptoVerificationService{
		btcWallet:   btcWallet,
		ethWallet:   strings.ToLower(ethWallet),
		cahContract: strings.ToLower(cahContract),
		btcBaseURL:  btcBaseURL,
		ethBaseURL:  ethBaseURL,
		client:      &http.Client{Timeout: 15 * time.Second},
	}
}

// Verify fetches and validates a transaction. Returns an error if:
//   - The transaction cannot be found
//   - The transaction does not pay our wallet
//   - For CAH: no token transfer to our wallet from the CAH contract exists
func (s *CryptoVerificationService) Verify(ctx context.Context, txid, coin string) (*VerificationResult, error) {
	switch coin {
	case models.CoinBTC:
		return s.verifyBTC(ctx, txid)
	case models.CoinETH:
		return s.verifyETH(ctx, txid)
	case models.CoinCAH:
		return s.verifyCAH(ctx, txid)
	default:
		return nil, fmt.Errorf("unsupported coin: %s", coin)
	}
}

// --- BTC via Blockstream ---

type blockstreamTx struct {
	Status struct {
		Confirmed   bool  `json:"confirmed"`
		BlockHeight int64 `json:"block_height"`
	} `json:"status"`
	Vout []struct {
		Address string `json:"scriptpubkey_address"`
		Value   int64  `json:"value"` // satoshis
	} `json:"vout"`
}

func (s *CryptoVerificationService) verifyBTC(ctx context.Context, txid string) (*VerificationResult, error) {
	url := fmt.Sprintf("%s/tx/%s", s.btcBaseURL, txid)
	var tx blockstreamTx
	if err := s.get(ctx, url, &tx); err != nil {
		return nil, fmt.Errorf("fetch BTC tx %s: %w", txid, err)
	}

	var totalSatoshis int64
	for _, out := range tx.Vout {
		if out.Address == s.btcWallet {
			totalSatoshis += out.Value
		}
	}
	if totalSatoshis == 0 {
		return nil, fmt.Errorf("BTC tx %s has no outputs to our wallet", txid)
	}

	// Blockstream doesn't return a confirmation count directly; confirmed=true
	// means it's in a block. We treat confirmed=true as BTCConfirmationThreshold.
	confirmations := 0
	if tx.Status.Confirmed {
		confirmations = BTCConfirmationThreshold
	}

	return &VerificationResult{
		AmountReceived: float64(totalSatoshis) / satoshisPerBTC,
		Confirmations:  confirmations,
		Confirmed:      tx.Status.Confirmed,
	}, nil
}

// --- ETH via Blockscout ---

type blockscoutTx struct {
	Status string `json:"status"` // "ok" | "error"
	Result struct {
		ConfirmationsCount int    `json:"confirmations_count"`
		Status             string `json:"status"` // "ok" | "error"
		To                 struct {
			Hash string `json:"hash"`
		} `json:"to"`
		Value          string `json:"value"` // wei as decimal string
		TokenTransfers []struct {
			Token struct {
				Address string `json:"address"`
			} `json:"token"`
			To struct {
				Hash string `json:"hash"`
			} `json:"to"`
			Total struct {
				Value    string `json:"value"`
				Decimals string `json:"decimals"`
			} `json:"total"`
		} `json:"token_transfers"`
	} `json:"result"`
}

func (s *CryptoVerificationService) verifyETH(ctx context.Context, txid string) (*VerificationResult, error) {
	url := fmt.Sprintf("%s/transactions/%s", s.ethBaseURL, txid)
	var tx blockscoutTx
	if err := s.get(ctx, url, &tx); err != nil {
		return nil, fmt.Errorf("fetch ETH tx %s: %w", txid, err)
	}

	if strings.ToLower(tx.Result.To.Hash) != s.ethWallet {
		return nil, fmt.Errorf("ETH tx %s recipient %s is not our wallet", txid, tx.Result.To.Hash)
	}

	amount, err := weiToEther(tx.Result.Value, 18)
	if err != nil {
		return nil, fmt.Errorf("parse ETH value: %w", err)
	}

	confs := tx.Result.ConfirmationsCount
	return &VerificationResult{
		AmountReceived: amount,
		Confirmations:  confs,
		Confirmed:      confs >= ETHConfirmationThreshold,
	}, nil
}

func (s *CryptoVerificationService) verifyCAH(ctx context.Context, txid string) (*VerificationResult, error) {
	url := fmt.Sprintf("%s/transactions/%s/token-transfers", s.ethBaseURL, txid)
	var tx blockscoutTx
	if err := s.get(ctx, url, &tx); err != nil {
		// Fall back to main tx endpoint which also includes token_transfers
		url = fmt.Sprintf("%s/transactions/%s", s.ethBaseURL, txid)
		if err2 := s.get(ctx, url, &tx); err2 != nil {
			return nil, fmt.Errorf("fetch CAH tx %s: %w", txid, err2)
		}
	}

	// Find the CAH token transfer that goes to our wallet
	var totalAmount float64
	for _, transfer := range tx.Result.TokenTransfers {
		if strings.ToLower(transfer.Token.Address) != s.cahContract {
			continue
		}
		if strings.ToLower(transfer.To.Hash) != s.ethWallet {
			continue
		}
		amount, err := weiToEther(transfer.Total.Value, 18)
		if err != nil {
			continue
		}
		totalAmount += amount
	}

	if totalAmount == 0 {
		return nil, fmt.Errorf("CAH tx %s has no token transfers to our wallet", txid)
	}

	confs := tx.Result.ConfirmationsCount
	return &VerificationResult{
		AmountReceived: totalAmount,
		Confirmations:  confs,
		Confirmed:      confs >= ETHConfirmationThreshold,
	}, nil
}

// weiToEther converts a wei decimal string to a float64 ether value.
func weiToEther(weiStr string, decimals int) (float64, error) {
	if weiStr == "" {
		return 0, fmt.Errorf("empty wei value")
	}
	wei := new(big.Int)
	if _, ok := wei.SetString(weiStr, 10); !ok {
		return 0, fmt.Errorf("invalid wei value: %s", weiStr)
	}
	divisor := new(big.Float).SetInt(new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(decimals)), nil))
	result := new(big.Float).Quo(new(big.Float).SetInt(wei), divisor)
	f, _ := result.Float64()
	return f, nil
}

func (s *CryptoVerificationService) get(ctx context.Context, url string, dest interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("transaction not found (404)")
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API returned status %d", resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(dest)
}
