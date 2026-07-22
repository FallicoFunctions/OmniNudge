package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/utils"
)

type AccountDeletionHandler struct {
	db    *pgxpool.Pool
	queue *queue.QueueClient
}

func NewAccountDeletionHandler(db *pgxpool.Pool, queueClient *queue.QueueClient) *AccountDeletionHandler {
	return &AccountDeletionHandler{
		db:    db,
		queue: queueClient,
	}
}

// RequestAccountDeletion schedules account deletion with a 30-day grace period.
// @Summary      Request account deletion
// @Tags         Account
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /account/delete [post]
func (h *AccountDeletionHandler) RequestAccountDeletion(c *gin.Context) {
	userID := c.GetInt("user_id")
	ctx := c.Request.Context()

	var req struct {
		Password string `json:"password" binding:"required"`
		Confirm  string `json:"confirm" binding:"required"` // Must type "DELETE MY ACCOUNT"
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	// Verify confirmation text
	if req.Confirm != "DELETE MY ACCOUNT" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Please type 'DELETE MY ACCOUNT' to confirm",
		})
		return
	}

	// Verify password and get user details
	var storedPasswordHash string
	var storedEmail *string
	var emailEncrypted bool
	var email *string
	var username string
	err := h.db.QueryRow(ctx, `
		SELECT password_hash, email, email_encrypted, username FROM users WHERE id = $1
	`, userID).Scan(&storedPasswordHash, &storedEmail, &emailEncrypted, &username)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to verify user")
		return
	}

	// Verify password using bcrypt
	if err := utils.CheckPassword(storedPasswordHash, req.Password); err != nil {
		RespondError(c, http.StatusUnauthorized, "Invalid password")
		return
	}
	if storedEmail != nil {
		if emailEncrypted {
			if decrypted, decryptErr := utils.DecryptEmail(*storedEmail); decryptErr == nil {
				email = &decrypted
			}
		} else {
			email = storedEmail
		}
	}

	// Mark the account for deletion without mutating identity fields so it can be restored cleanly.
	deletionDate := time.Now().Add(30 * 24 * time.Hour) // 30 days from now
	tx, err := h.db.Begin(ctx)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete account")
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	result, err := tx.Exec(ctx, `
		UPDATE users
		SET 
			deleted_at = NOW(),
			permanent_deletion_at = $1,
			token_version = token_version + 1
		WHERE id = $2 AND deleted_at IS NULL
	`, deletionDate, userID)

	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete account")
		return
	}
	if result.RowsAffected() == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Account is already scheduled for deletion",
		})
		return
	}

	// Log deletion request atomically with the lifecycle transition.
	if _, err := tx.Exec(ctx, `
		INSERT INTO account_deletion_log (user_id, requested_at, deletion_date, reason)
		VALUES ($1, NOW(), $2, 'user_requested')
	`, userID, deletionDate); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete account")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete account")
		return
	}

	// Send confirmation email if user has email (P0-017: Account deletion email confirmation)
	if email != nil && *email != "" && h.queue != nil {
		subject := "OmniNudge Account Deletion Confirmation"
		body := fmt.Sprintf(`Hi %s,

Your OmniNudge account deletion has been scheduled.

Deletion Details:
- Username: %s
- Scheduled deletion date: %s
- Grace period: 30 days

What happens next:
1. Your account is now hidden and inaccessible to other users
2. You have 30 days to cancel this deletion by logging back in
3. After 30 days, all your data will be permanently deleted

To cancel deletion:
Simply log in to your account before %s. A successful sign-in automatically cancels the pending deletion.

If you did not request this deletion, please log in immediately to cancel it.

---
OmniNudge Team
This is an automated message. Please do not reply to this email.`,
			username,
			username,
			deletionDate.Format("January 2, 2006 at 3:04 PM MST"),
			deletionDate.Format("January 2, 2006"),
		)

		// Enqueue email job
		_ = h.queue.EnqueueEmail(ctx, []string{*email}, subject, body)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":               "Account scheduled for deletion",
		"deletion_date":         deletionDate.Format(time.RFC3339),
		"grace_period_days":     30,
		"recovery_instructions": "To cancel deletion, log in before " + deletionDate.Format("2006-01-02"),
		"email_sent":            email != nil && *email != "",
	})
}
