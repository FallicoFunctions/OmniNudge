package services

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/smtp"
	"strings"
	"time"

	zlog "github.com/rs/zerolog/log"
)

// httpClient is a shared HTTP client with a 15-second timeout used for all
// outbound email/API provider calls. Using http.DefaultClient (which has no
// timeout) would allow hung connections to block goroutines indefinitely.
var httpClient = &http.Client{Timeout: 15 * time.Second}

// EmailService handles sending emails via SendGrid, Mailgun HTTP API, or SMTP fallback.
// Provider selection order: SendGrid > Mailgun > SMTP.
type EmailService struct {
	// SendGrid REST API (highest priority)
	sendgridAPIKey string

	// Mailgun HTTP API (second priority)
	mailgunAPIKey string
	mailgunDomain string

	// SMTP fallback
	smtpHost     string
	smtpPort     string
	smtpUser     string
	smtpPassword string

	fromAddress string
	fromName    string
	frontendURL string // used to build default unsubscribe URLs

	// cb protects outbound email calls; opens after 5 consecutive failures,
	// half-opens after 60 seconds to probe service recovery.
	cb *CircuitBreaker
}

// EmailServiceConfig holds all configuration needed to create an EmailService.
type EmailServiceConfig struct {
	SendGridAPIKey string
	MailgunAPIKey  string
	MailgunDomain  string
	SMTPHost       string
	SMTPPort       string
	SMTPUser       string
	SMTPPassword   string
	FromAddress    string
	FromName       string
	FrontendURL    string
}

// NewEmailService creates a new email service with the given configuration.
// For backward compatibility with existing call sites the original 6-parameter
// signature is preserved via NewEmailServiceLegacy.
func NewEmailService(host, port, user, password, fromAddress, fromName string) *EmailService {
	return &EmailService{
		smtpHost:     host,
		smtpPort:     port,
		smtpUser:     user,
		smtpPassword: password,
		fromAddress:  fromAddress,
		fromName:     fromName,
		cb:           NewCircuitBreaker("email", 5, 60*time.Second),
	}
}

// NewEmailServiceFull creates an EmailService with full provider configuration.
func NewEmailServiceFull(cfg EmailServiceConfig) *EmailService {
	return &EmailService{
		sendgridAPIKey: cfg.SendGridAPIKey,
		mailgunAPIKey:  cfg.MailgunAPIKey,
		mailgunDomain:  cfg.MailgunDomain,
		smtpHost:       cfg.SMTPHost,
		smtpPort:       cfg.SMTPPort,
		smtpUser:       cfg.SMTPUser,
		smtpPassword:   cfg.SMTPPassword,
		fromAddress:    cfg.FromAddress,
		fromName:       cfg.FromName,
		frontendURL:    cfg.FrontendURL,
		cb:             NewCircuitBreaker("email", 5, 60*time.Second),
	}
}

// SendEmail sends an email using the configured provider.
// Selection order: SendGrid > Mailgun > SMTP.
// All outbound calls are protected by the email circuit breaker; if the
// breaker is open, ErrCircuitOpen is returned immediately without attempting
// to contact the provider.
func (s *EmailService) SendEmail(to []string, subject, body, htmlBody string) error {
	return s.cb.Do(func() error {
		return s.sendEmailDirect(to, subject, body, htmlBody)
	})
}

// sendEmailDirect performs the actual provider dispatch without circuit-breaker
// wrapping. Called by SendEmail via the circuit breaker.
func (s *EmailService) sendEmailDirect(to []string, subject, body, htmlBody string) error {
	// SendGrid (highest priority)
	if s.sendgridAPIKey != "" {
		return s.sendViaSendGrid(to, subject, body, htmlBody)
	}

	// Mailgun HTTP API (second priority)
	if s.mailgunAPIKey != "" && s.mailgunDomain != "" {
		return s.sendViaMailgunAPI(to, subject, body, htmlBody)
	}

	// SMTP fallback
	if s.smtpHost == "" || s.smtpPassword == "" {
		zlog.Warn().Strs("to", to).Str("subject", subject).Msg("email: skipping send (no provider configured)")
		return nil
	}

	return s.sendViaSMTP(to, subject, body, htmlBody)
}

// sendViaSendGrid sends email using the SendGrid REST API.
func (s *EmailService) sendViaSendGrid(to []string, subject, body, htmlBody string) error {
	type sgAddress struct {
		Email string `json:"email"`
	}
	type sgPersonalization struct {
		To []sgAddress `json:"to"`
	}
	type sgContent struct {
		Type  string `json:"type"`
		Value string `json:"value"`
	}

	toAddresses := make([]sgAddress, 0, len(to))
	for _, addr := range to {
		toAddresses = append(toAddresses, sgAddress{Email: addr})
	}

	content := []sgContent{
		{Type: "text/plain", Value: body},
	}
	if htmlBody != "" {
		content = append(content, sgContent{Type: "text/html", Value: htmlBody})
	}

	payload := map[string]interface{}{
		"personalizations": []sgPersonalization{
			{To: toAddresses},
		},
		"from": map[string]string{
			"email": s.fromAddress,
			"name":  s.fromName,
		},
		"subject": subject,
		"content": content,
	}

	rawBody, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("email: sendgrid marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "https://api.sendgrid.com/v3/mail/send", bytes.NewReader(rawBody))
	if err != nil {
		return fmt.Errorf("email: sendgrid create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.sendgridAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("email: sendgrid request: %w", err)
	}
	defer resp.Body.Close()

	// SendGrid returns 202 Accepted on success.
	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("email: sendgrid error (status %d): %s", resp.StatusCode, string(respBody))
	}

	zlog.Info().Strs("to", to).Str("subject", subject).Msg("email: sent via SendGrid")
	return nil
}

// sendViaMailgunAPI sends email using Mailgun's HTTP API.
func (s *EmailService) sendViaMailgunAPI(to []string, subject, body, htmlBody string) error {
	url := fmt.Sprintf("https://api.mailgun.net/v3/%s/messages", s.mailgunDomain)

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	from := s.fromAddress
	if s.fromName != "" {
		from = fmt.Sprintf("%s <%s>", s.fromName, s.fromAddress)
	}
	_ = writer.WriteField("from", from)

	for _, recipient := range to {
		_ = writer.WriteField("to", recipient)
	}
	_ = writer.WriteField("subject", subject)
	_ = writer.WriteField("text", body)
	if htmlBody != "" {
		_ = writer.WriteField("html", htmlBody)
	}
	writer.Close()

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, &buf)
	if err != nil {
		return fmt.Errorf("email: mailgun create request: %w", err)
	}
	req.SetBasicAuth("api", s.mailgunAPIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("email: mailgun request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("email: mailgun error (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	zlog.Info().Strs("to", to).Str("subject", subject).Msg("email: sent via Mailgun")
	return nil
}

// sendViaSMTP sends email using SMTP (fallback).
func (s *EmailService) sendViaSMTP(to []string, subject, body, htmlBody string) error {
	from := s.fromAddress
	if s.fromName != "" {
		from = fmt.Sprintf("%s <%s>", s.fromName, s.fromAddress)
	}

	message := s.buildMessage(from, to, subject, body, htmlBody)
	auth := smtp.PlainAuth("", s.smtpUser, s.smtpPassword, s.smtpHost)
	addr := fmt.Sprintf("%s:%s", s.smtpHost, s.smtpPort)

	if s.smtpPort == "465" {
		return s.sendWithTLS(addr, auth, message, to)
	}

	if err := smtp.SendMail(addr, auth, s.fromAddress, to, []byte(message)); err != nil {
		return fmt.Errorf("email: smtp send: %w", err)
	}

	zlog.Info().Strs("to", to).Str("subject", subject).Msg("email: sent via SMTP")
	return nil
}

// sendWithTLS sends email using direct TLS (for port 465).
func (s *EmailService) sendWithTLS(addr string, auth smtp.Auth, message string, to []string) error {
	tlsConfig := &tls.Config{
		ServerName: s.smtpHost,
	}

	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("email: tls dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, s.smtpHost)
	if err != nil {
		return fmt.Errorf("email: smtp new client: %w", err)
	}
	defer func() { _ = client.Quit() }()

	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("email: smtp auth: %w", err)
	}

	if err := client.Mail(s.fromAddress); err != nil {
		return fmt.Errorf("email: smtp set sender: %w", err)
	}

	for _, recipient := range to {
		if err := client.Rcpt(recipient); err != nil {
			return fmt.Errorf("email: smtp add recipient %s: %w", recipient, err)
		}
	}

	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("email: smtp data command: %w", err)
	}

	if _, err = writer.Write([]byte(message)); err != nil {
		writer.Close()
		return fmt.Errorf("email: smtp write message: %w", err)
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("email: smtp close message: %w", err)
	}

	zlog.Info().Strs("to", to).Msg("email: sent via SMTP/TLS")
	return nil
}

// buildMessage constructs the raw RFC 2822 email message with headers.
func (s *EmailService) buildMessage(from string, to []string, subject, body, htmlBody string) string {
	var msg strings.Builder

	msg.WriteString(fmt.Sprintf("From: %s\r\n", from))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", strings.Join(to, ", ")))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	msg.WriteString("MIME-Version: 1.0\r\n")

	if htmlBody != "" {
		boundary := "boundary-omninudge-email"
		msg.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"\r\n", boundary))
		msg.WriteString("\r\n")

		msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
		msg.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n")
		msg.WriteString("\r\n")
		msg.WriteString(body)
		msg.WriteString("\r\n\r\n")

		msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
		msg.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
		msg.WriteString("\r\n")
		msg.WriteString(htmlBody)
		msg.WriteString("\r\n\r\n")

		msg.WriteString(fmt.Sprintf("--%s--\r\n", boundary))
	} else {
		msg.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n")
		msg.WriteString("\r\n")
		msg.WriteString(body)
	}

	return msg.String()
}

// SendTemplatedEmail sends an email using a template, automatically injecting
// a default unsubscribe URL if the "unsubscribe_url" key is absent from data.
func (s *EmailService) SendTemplatedEmail(to []string, template EmailTemplate, data map[string]string) error {
	// Inject default unsubscribe URL if caller did not provide one.
	if _, ok := data["unsubscribe_url"]; !ok {
		baseURL := s.frontendURL
		if baseURL == "" {
			baseURL = "http://localhost:5176"
		}
		data["unsubscribe_url"] = baseURL + "/settings/notifications"
	}

	subject := s.fillTemplate(template.Subject, data)
	body := s.fillTemplate(template.Body, data)
	htmlBody := ""
	if template.HTMLBody != "" {
		htmlBody = s.fillTemplate(template.HTMLBody, data)
	}

	return s.SendEmail(to, subject, body, htmlBody)
}

// fillTemplate replaces {{key}} placeholders with values from data.
func (s *EmailService) fillTemplate(tmpl string, data map[string]string) string {
	result := tmpl
	for key, value := range data {
		placeholder := fmt.Sprintf("{{%s}}", key)
		result = strings.ReplaceAll(result, placeholder, value)
	}
	return result
}

// EmailTemplate represents an email template with optional HTML body.
type EmailTemplate struct {
	Subject  string
	Body     string
	HTMLBody string
}

// unsubscribeFooterHTML is the standard unsubscribe footer appended to all HTML emails.
const unsubscribeFooterHTML = `<p style="font-size:12px;color:#999;">To unsubscribe from these emails, <a href="{{unsubscribe_url}}">click here</a>.</p>`

// unsubscribeFooterText is the standard unsubscribe footer appended to all plain-text emails.
const unsubscribeFooterText = "\n\nTo unsubscribe from these emails, visit: {{unsubscribe_url}}"

// Common email templates.
var (
	AccountDeletionTemplate = EmailTemplate{
		Subject: "OmniNudge Account Deletion Confirmation",
		Body: `Hi {{username}},

Your OmniNudge account deletion has been scheduled.

Deletion Details:
- Username: {{username}}
- Scheduled deletion date: {{deletion_date}}
- Grace period: 30 days

What happens next:
1. Your account is now hidden and inaccessible to other users
2. You have 30 days to cancel this deletion by logging back in
3. After 30 days, all your data will be permanently deleted

To cancel deletion:
Simply log in to your account before {{deletion_date_short}} and navigate to Settings > Account.

If you did not request this deletion, please log in immediately to cancel it.

---
OmniNudge Team
This is an automated message. Please do not reply to this email.` + unsubscribeFooterText,
	}

	AccountDeletionCancelledTemplate = EmailTemplate{
		Subject: "OmniNudge Account Deletion Cancelled",
		Body: `Hi {{username}},

Your account deletion has been successfully cancelled.

Your account is now fully restored and active:
- Username: {{username}}
- Restored at: {{restored_at}}

Your account and all associated data have been preserved. You can continue using OmniNudge as normal.

If you did not cancel this deletion, please contact support immediately.

---
OmniNudge Team
This is an automated message. Please do not reply to this email.` + unsubscribeFooterText,
	}

	WelcomeEmailTemplate = EmailTemplate{
		Subject: "Welcome to OmniNudge!",
		Body: `Hi {{username}},

Welcome to OmniNudge! Your account has been successfully created.

Get started:
- Explore content from Reddit and other platforms
- Create your own hubs to organize content
- Connect with other users through messaging

Need help? Check out our documentation or contact support.

---
OmniNudge Team` + unsubscribeFooterText,
		HTMLBody: `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to OmniNudge!</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
        <h2 style="color: #3b82f6; margin-top: 0;">Welcome to OmniNudge!</h2>
        <p>Hi <strong>{{username}}</strong>,</p>
        <p>Your account has been successfully created. We're glad you're here!</p>
        <h3 style="color: #555;">Get started:</h3>
        <ul>
            <li>Explore content from Reddit and other platforms</li>
            <li>Create your own hubs to organize content</li>
            <li>Connect with other users through messaging</li>
        </ul>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{{app_url}}" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Explore OmniNudge</a>
        </div>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">OmniNudge Team<br>This is an automated message. Please do not reply to this email.</p>
        ` + unsubscribeFooterHTML + `
    </div>
</body>
</html>`,
	}

	PasswordResetTemplate = EmailTemplate{
		Subject: "Reset Your OmniNudge Password",
		Body: `Hi {{username}},

You requested to reset your password for your OmniNudge account.

Reset your password by clicking this link:
{{reset_url}}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.

---
OmniNudge Team
This is an automated message. Please do not reply to this email.` + unsubscribeFooterText,
		HTMLBody: `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
        <h2 style="color: #3b82f6; margin-top: 0;">Reset Your Password</h2>
        <p>Hi <strong>{{username}}</strong>,</p>
        <p>You requested to reset your password for your OmniNudge account.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{{reset_url}}" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
        </div>
        <p style="color: #666; font-size: 14px;">This link will expire in <strong>1 hour</strong> for security reasons.</p>
        <p style="color: #666; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">OmniNudge Team<br>This is an automated message. Please do not reply to this email.</p>
        ` + unsubscribeFooterHTML + `
    </div>
</body>
</html>`,
	}

	EmailVerificationTemplate = EmailTemplate{
		Subject: "Verify Your OmniNudge Email",
		Body: `Hi {{username}},

Please verify your email address by clicking the link below:
{{verify_url}}

This link will expire in 24 hours.

If you didn't create an OmniNudge account, you can safely ignore this email.

---
OmniNudge Team
This is an automated message. Please do not reply to this email.` + unsubscribeFooterText,
		HTMLBody: `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
        <h2 style="color: #3b82f6; margin-top: 0;">Verify Your Email</h2>
        <p>Hi <strong>{{username}}</strong>,</p>
        <p>Thank you for creating an OmniNudge account! Please verify your email address to complete your registration.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{{verify_url}}" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verify Email</a>
        </div>
        <p style="color: #666; font-size: 14px;">This link will expire in <strong>24 hours</strong>.</p>
        <p style="color: #666; font-size: 14px;">If you didn't create an OmniNudge account, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">OmniNudge Team<br>This is an automated message. Please do not reply to this email.</p>
        ` + unsubscribeFooterHTML + `
    </div>
</body>
</html>`,
	}

	EmailUpdateVerificationTemplate = EmailTemplate{
		Subject: "Verify Your New Email Address",
		Body: `Hi {{username}},

You recently updated your email address on OmniNudge. Please verify your new email by clicking the link below:
{{verify_url}}

This link will expire in 24 hours.

If you didn't request this change, please contact support immediately.

---
OmniNudge Team
This is an automated message. Please do not reply to this email.` + unsubscribeFooterText,
		HTMLBody: `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your New Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
        <h2 style="color: #3b82f6; margin-top: 0;">Verify Your New Email Address</h2>
        <p>Hi <strong>{{username}}</strong>,</p>
        <p>You recently updated your email address on OmniNudge. Please verify your new email to complete the update.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{{verify_url}}" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verify New Email</a>
        </div>
        <p style="color: #666; font-size: 14px;">This link will expire in <strong>24 hours</strong>.</p>
        <p style="color: #666; font-size: 14px;">If you didn't request this change, please contact support immediately.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">OmniNudge Team<br>This is an automated message. Please do not reply to this email.</p>
        ` + unsubscribeFooterHTML + `
    </div>
</body>
</html>`,
	}
)
