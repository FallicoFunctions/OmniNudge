package services

import (
	"context"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"strings"
	"time"

	zlog "github.com/rs/zerolog/log"
)

// smsHTTPClient is a shared HTTP client with a 15-second timeout used for all
// outbound Twilio API calls. http.DefaultClient has no timeout and would allow
// hung connections to block goroutines indefinitely.
var smsHTTPClient = &http.Client{Timeout: 15 * time.Second}

// SMSProvider identifies the SMS delivery backend.
type SMSProvider string

const (
	// SMSProviderTwilio uses the Twilio REST API to send real SMS messages.
	SMSProviderTwilio SMSProvider = "twilio"
	// SMSProviderStub logs messages instead of sending them (used when credentials are absent).
	SMSProviderStub SMSProvider = "stub"
)

// SMSService handles sending SMS messages.
// When Twilio credentials are not configured it operates in stub mode:
// messages are logged at DEBUG level and no network call is made.
type SMSService struct {
	provider   SMSProvider
	accountSID string
	authToken  string
	fromNumber string
	enabled    bool
}

// NewSMSService creates a new SMSService.
// If any of accountSID, authToken, or fromNumber is empty the service falls
// back to stub mode (no real SMS sent — log only).
func NewSMSService(accountSID, authToken, fromNumber string) *SMSService {
	enabled := accountSID != "" && authToken != "" && fromNumber != ""
	provider := SMSProviderStub
	if enabled {
		provider = SMSProviderTwilio
	}

	if !enabled {
		zlog.Info().Msg("sms: running in stub mode (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER not configured)")
	} else {
		zlog.Info().Str("from", fromNumber).Msg("sms: Twilio provider configured")
	}

	return &SMSService{
		provider:   provider,
		accountSID: accountSID,
		authToken:  authToken,
		fromNumber: fromNumber,
		enabled:    enabled,
	}
}

// SendSMS sends an SMS message to the given phone number.
// In stub mode it logs the message at DEBUG level and returns nil.
// Returns an error if to or message are empty regardless of mode.
func (s *SMSService) SendSMS(ctx context.Context, to, message string) error {
	if to == "" {
		return fmt.Errorf("sms: recipient phone number must not be empty")
	}
	if message == "" {
		return fmt.Errorf("sms: message body must not be empty")
	}
	if !s.enabled {
		zlog.Debug().Str("to", to).Str("message", message).Msg("sms stub: would send message")
		return nil
	}
	return s.sendViaTwilio(ctx, to, message)
}

// sendViaTwilio sends an SMS via the Twilio REST API.
func (s *SMSService) sendViaTwilio(ctx context.Context, to, message string) error {
	apiURL := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", s.accountSID)

	formData := neturl.Values{}
	formData.Set("To", to)
	formData.Set("From", s.fromNumber)
	formData.Set("Body", message)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return fmt.Errorf("sms: create request: %w", err)
	}
	req.SetBasicAuth(s.accountSID, s.authToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := smsHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("sms: twilio request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("sms: twilio error (status %d): %s", resp.StatusCode, string(body))
	}

	zlog.Info().Str("to", to).Msg("sms: message sent via Twilio")
	return nil
}
