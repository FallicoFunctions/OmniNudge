package services_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	testBTCWallet = "31yyvq2asepMEJLqtuka7oSoVCRrnoeG2K"
	testETHWallet = "0xc308f275a03bad6c3ba3b75e2d024d258cba586f"
	testCAHContract = "0x8e0e57dcb1ce8d9091df38ec1bfc3b224529754a"
)

// btcTxResponse is a valid Blockstream response for a confirmed BTC tx
// paying testBTCWallet 0.0001 BTC (10000 satoshis).
const btcTxResponse = `{
  "txid": "abc123",
  "status": {"confirmed": true, "block_height": 800000},
  "vout": [
    {"scriptpubkey_address": "31yyvq2asepMEJLqtuka7oSoVCRrnoeG2K", "value": 10000},
    {"scriptpubkey_address": "some_change_address", "value": 50000}
  ]
}`

// ethTxResponse is a valid Blockscout response for a confirmed ETH tx.
const ethTxResponse = `{
  "status": "ok",
  "result": {
    "confirmations_count": 15,
    "status": "ok",
    "to": {"hash": "0xc308f275a03bad6c3ba3b75e2d024d258cba586f"},
    "value": "1196000000000000"
  }
}`

// cahTxResponse is a Blockscout token-transfers response for CAH.
const cahTxResponse = `{
  "status": "ok",
  "result": {
    "confirmations_count": 20,
    "status": "ok",
    "token_transfers": [
      {
        "token": {"address": "0x8e0e57dcb1ce8d9091df38ec1bfc3b224529754a"},
        "to": {"hash": "0xc308f275a03bad6c3ba3b75e2d024d258cba586f"},
        "total": {"value": "39800000000000000000", "decimals": "18"}
      }
    ]
  }
}`

func newVerificationService(t *testing.T, btcResp, ethResp string) (*services.CryptoVerificationService, *httptest.Server, *httptest.Server) {
	t.Helper()

	btcServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if btcResp == "" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(btcResp))
	}))

	ethServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ethResp == "" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(ethResp))
	}))

	svc := services.NewCryptoVerificationService(
		testBTCWallet,
		testETHWallet,
		testCAHContract,
		btcServer.URL,
		ethServer.URL,
	)
	return svc, btcServer, ethServer
}

func TestCryptoVerificationService_VerifyBTC(t *testing.T) {
	tests := []struct {
		name          string
		btcResp       string
		wantAmount    float64
		wantConf      int
		wantConfirmed bool
		wantErr       bool
	}{
		{
			name:          "confirmed tx paying our wallet",
			btcResp:       btcTxResponse,
			wantAmount:    0.0001,
			wantConf:      services.BTCConfirmationThreshold,
			wantConfirmed: true,
		},
		{
			name:    "tx not found",
			btcResp: "",
			wantErr: true,
		},
		{
			name: "no outputs to our wallet",
			btcResp: `{
				"txid":"abc","status":{"confirmed":true,"block_height":800000},
				"vout":[{"scriptpubkey_address":"someone_else","value":10000}]
			}`,
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc, btcSrv, ethSrv := newVerificationService(t, tc.btcResp, "")
			defer btcSrv.Close()
			defer ethSrv.Close()

			result, err := svc.Verify(context.Background(), "anytxid", models.CoinBTC)
			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.InDelta(t, tc.wantAmount, result.AmountReceived, 0.000001)
			assert.Equal(t, tc.wantConfirmed, result.Confirmed)
		})
	}
}

func TestCryptoVerificationService_VerifyETH(t *testing.T) {
	tests := []struct {
		name       string
		ethResp    string
		wantAmount float64
		wantErr    bool
	}{
		{
			name:       "confirmed ETH tx to our wallet",
			ethResp:    ethTxResponse,
			wantAmount: 0.001196, // 1196000000000000 wei / 1e18
		},
		{
			name:    "tx not found",
			ethResp: "",
			wantErr: true,
		},
		{
			name: "tx to wrong address",
			ethResp: `{
				"status":"ok","result":{
					"confirmations_count":15,"status":"ok",
					"to":{"hash":"0xsomeoneelse"},
					"value":"1196000000000000"
				}
			}`,
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc, btcSrv, ethSrv := newVerificationService(t, "", tc.ethResp)
			defer btcSrv.Close()
			defer ethSrv.Close()

			result, err := svc.Verify(context.Background(), "anytxid", models.CoinETH)
			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.InDelta(t, tc.wantAmount, result.AmountReceived, 0.000001)
		})
	}
}

func TestCryptoVerificationService_VerifyCAH(t *testing.T) {
	tests := []struct {
		name       string
		ethResp    string
		wantAmount float64
		wantErr    bool
	}{
		{
			name:       "confirmed CAH token transfer to our wallet",
			ethResp:    cahTxResponse,
			wantAmount: 39.8, // 39800000000000000000 / 1e18
		},
		{
			name:    "tx not found",
			ethResp: "",
			wantErr: true,
		},
		{
			name: "no CAH transfer to our wallet in token transfers",
			ethResp: `{
				"status":"ok","result":{
					"confirmations_count":20,"status":"ok",
					"token_transfers":[
						{"token":{"address":"0x8e0e57dcb1ce8d9091df38ec1bfc3b224529754a"},
						 "to":{"hash":"0xsomeoneelse"},
						 "total":{"value":"39800000000000000000","decimals":"18"}}
					]
				}
			}`,
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc, btcSrv, ethSrv := newVerificationService(t, "", tc.ethResp)
			defer btcSrv.Close()
			defer ethSrv.Close()

			result, err := svc.Verify(context.Background(), "anytxid", models.CoinCAH)
			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.InDelta(t, tc.wantAmount, result.AmountReceived, 0.0001)
		})
	}
}
