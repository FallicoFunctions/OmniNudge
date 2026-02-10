package services

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/smtp"
	"strings"
)

// EmailService handles sending emails via Mailgun HTTP API or SMTP
type EmailService struct {
	// Mailgun HTTP API (preferred)
	mailgunAPIKey string
	mailgunDomain string

	// SMTP fallback
	smtpHost     string
	smtpPort     string
	smtpUser     string
	smtpPassword string

	fromAddress  string
	fromName     string
}

// NewEmailService creates a new email service
// For Mailgun HTTP API: pass apiKey as host, domain as user
// For SMTP: pass host, port, user, password as usual
func NewEmailService(host, port, user, password, fromAddress, fromName string) *EmailService {
	return &EmailService{
		mailgunAPIKey: host,     // Reuse host param for API key
		mailgunDomain: user,     // Reuse user param for domain
		smtpHost:      host,
		smtpPort:      port,
		smtpUser:      user,
		smtpPassword:  password,
		fromAddress:   fromAddress,
		fromName:      fromName,
	}
}

// SendEmail sends an email using Mailgun HTTP API (preferred) or SMTP fallback
func (s *EmailService) SendEmail(to []string, subject, body, htmlBody string) error {
	// Try Mailgun HTTP API first (if configured)
	if s.mailgunAPIKey != "" && s.mailgunDomain != "" {
		return s.sendViaMailgunAPI(to, subject, body, htmlBody)
	}

	// Fallback to SMTP
	if s.smtpHost == "" || s.smtpPassword == "" {
		fmt.Printf("[EMAIL] Skipping email send (not configured): to=%v subject=%s\n", to, subject)
		return nil
	}

	return s.sendViaSMTP(to, subject, body, htmlBody)
}

// sendViaMailgunAPI sends email using Mailgun's HTTP API
func (s *EmailService) sendViaMailgunAPI(to []string, subject, body, htmlBody string) error {
	url := fmt.Sprintf("https://api.mailgun.net/v3/%s/messages", s.mailgunDomain)

	// Prepare multipart form data
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// From
	from := s.fromAddress
	if s.fromName != "" {
		from = fmt.Sprintf("%s <%s>", s.fromName, s.fromAddress)
	}
	writer.WriteField("from", from)

	// To (multiple recipients)
	for _, recipient := range to {
		writer.WriteField("to", recipient)
	}

	// Subject and body
	writer.WriteField("subject", subject)
	writer.WriteField("text", body)
	if htmlBody != "" {
		writer.WriteField("html", htmlBody)
	}

	writer.Close()

	// Create HTTP request
	req, err := http.NewRequest("POST", url, &buf)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.SetBasicAuth("api", s.mailgunAPIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Send request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send email via Mailgun API: %w", err)
	}
	defer resp.Body.Close()

	// Check response
	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mailgun API error (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	fmt.Printf("[EMAIL] Successfully sent email via Mailgun API: to=%v subject=%s\n", to, subject)
	return nil
}

// sendViaSMTP sends email using SMTP (fallback)
func (s *EmailService) sendViaSMTP(to []string, subject, body, htmlBody string) error {
	// Determine from header
	from := s.fromAddress
	if s.fromName != "" {
		from = fmt.Sprintf("%s <%s>", s.fromName, s.fromAddress)
	}

	// Build email message
	message := s.buildMessage(from, to, subject, body, htmlBody)

	// Connect to SMTP server
	auth := smtp.PlainAuth("", s.smtpUser, s.smtpPassword, s.smtpHost)
	addr := fmt.Sprintf("%s:%s", s.smtpHost, s.smtpPort)

	// For port 587, use STARTTLS; for port 465, use direct TLS
	if s.smtpPort == "465" {
		// Direct TLS connection
		return s.sendWithTLS(addr, auth, message, to)
	}

	// Use standard SMTP with STARTTLS (port 587)
	err := smtp.SendMail(addr, auth, s.fromAddress, to, []byte(message))
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	fmt.Printf("[EMAIL] Successfully sent email via SMTP: to=%v\n", to)
	return nil
}

// sendWithTLS sends email using direct TLS (for port 465)
func (s *EmailService) sendWithTLS(addr string, auth smtp.Auth, message string, to []string) error {
	tlsConfig := &tls.Config{
		ServerName: s.smtpHost,
	}

	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("failed to connect to SMTP server: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, s.smtpHost)
	if err != nil {
		return fmt.Errorf("failed to create SMTP client: %w", err)
	}
	defer client.Quit()

	// Authenticate
	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("SMTP authentication failed: %w", err)
	}

	// Set sender
	if err := client.Mail(s.fromAddress); err != nil {
		return fmt.Errorf("failed to set sender: %w", err)
	}

	// Set recipients
	for _, recipient := range to {
		if err := client.Rcpt(recipient); err != nil {
			return fmt.Errorf("failed to add recipient %s: %w", recipient, err)
		}
	}

	// Send message
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("failed to send DATA command: %w", err)
	}

	_, err = writer.Write([]byte(message))
	if err != nil {
		writer.Close()
		return fmt.Errorf("failed to write message: %w", err)
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("failed to close message: %w", err)
	}

	fmt.Printf("[EMAIL] Successfully sent email: to=%v\n", to)
	return nil
}

// buildMessage constructs the email message with headers
func (s *EmailService) buildMessage(from string, to []string, subject, body, htmlBody string) string {
	var msg strings.Builder

	msg.WriteString(fmt.Sprintf("From: %s\r\n", from))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", strings.Join(to, ", ")))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	msg.WriteString("MIME-Version: 1.0\r\n")

	// If HTML body provided, use multipart/alternative
	if htmlBody != "" {
		boundary := "boundary-omninudge-email"
		msg.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"\r\n", boundary))
		msg.WriteString("\r\n")

		// Plain text part
		msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
		msg.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n")
		msg.WriteString("\r\n")
		msg.WriteString(body)
		msg.WriteString("\r\n\r\n")

		// HTML part
		msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
		msg.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
		msg.WriteString("\r\n")
		msg.WriteString(htmlBody)
		msg.WriteString("\r\n\r\n")

		msg.WriteString(fmt.Sprintf("--%s--\r\n", boundary))
	} else {
		// Plain text only
		msg.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n")
		msg.WriteString("\r\n")
		msg.WriteString(body)
	}

	return msg.String()
}

// SendTemplatedEmail sends an email using a template
func (s *EmailService) SendTemplatedEmail(to []string, template EmailTemplate, data map[string]string) error {
	subject := s.fillTemplate(template.Subject, data)
	body := s.fillTemplate(template.Body, data)
	htmlBody := ""
	if template.HTMLBody != "" {
		htmlBody = s.fillTemplate(template.HTMLBody, data)
	}

	return s.SendEmail(to, subject, body, htmlBody)
}

// fillTemplate replaces {{key}} placeholders with values from data
func (s *EmailService) fillTemplate(template string, data map[string]string) string {
	result := template
	for key, value := range data {
		placeholder := fmt.Sprintf("{{%s}}", key)
		result = strings.ReplaceAll(result, placeholder, value)
	}
	return result
}

// EmailTemplate represents an email template
type EmailTemplate struct {
	Subject  string
	Body     string
	HTMLBody string
}

// Common email templates
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
This is an automated message. Please do not reply to this email.`,
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
This is an automated message. Please do not reply to this email.`,
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
OmniNudge Team`,
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
This is an automated message. Please do not reply to this email.`,
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
This is an automated message. Please do not reply to this email.`,
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
This is an automated message. Please do not reply to this email.`,
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
    </div>
</body>
</html>`,
	}
)
