package handlers

import (
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/ports"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
)

type AccessRequestHandler struct {
	accessReqRepo ports.HubAccessRequestRepository
	hubRepo       ports.HubRepository
	settingsRepo  *repository.HubSettingsRepository
	userRepo      ports.UserRepository
}

func NewAccessRequestHandler(
	accessReqRepo ports.HubAccessRequestRepository,
	hubRepo ports.HubRepository,
	settingsRepo *repository.HubSettingsRepository,
	userRepo ports.UserRepository,
) *AccessRequestHandler {
	return &AccessRequestHandler{
		accessReqRepo: accessReqRepo,
		hubRepo:       hubRepo,
		settingsRepo:  settingsRepo,
		userRepo:      userRepo,
	}
}

type CreateAccessRequest struct {
	Message *string `json:"message"`
}

type AddUserAccessRequest struct {
	Username string `json:"username" binding:"required"`
}

// CreateRequest submits a hub access request for a private hub.
// @Summary      Create hub access request
// @Tags         Hubs
// @Accept       json
// @Produce      json
// @Param        name  path      string               true  "Hub name"
// @Param        body  body      CreateAccessRequest  false "Optional message"
// @Success      201   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Failure      404   {object}  gin.H
// @Failure      409   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/access-request [post]
func (h *AccessRequestHandler) CreateRequest(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch hub")
		return
	}
	if hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	settings, err := h.settingsRepo.GetByHubID(c.Request.Context(), hub.ID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch hub settings")
		return
	}

	if settings.PrivacyType != "private" {
		RespondError(c, http.StatusBadRequest, "Hub is not private")
		return
	}

	var req CreateAccessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	hasPending, err := h.accessReqRepo.HasPendingRequest(c.Request.Context(), hub.ID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check existing requests")
		return
	}
	if hasPending {
		RespondError(c, http.StatusConflict, "You already have a pending request for this hub")
		return
	}

	if settings.AccessRequestCooldownDays > 0 {
		accessReq, err := h.accessReqRepo.GetByUserAndHub(c.Request.Context(), hub.ID, userID)
		if err == nil && accessReq != nil && accessReq.Status == "denied" {
			cooldown := time.Duration(settings.AccessRequestCooldownDays) * 24 * time.Hour
			nextAllowed := accessReq.UpdatedAt.Add(cooldown)
			if time.Now().Before(nextAllowed) {
				RespondError(c, http.StatusTooManyRequests, "Access request cooldown active")
				return
			}
		}
	}

	accessReq := &models.HubAccessRequest{
		HubID:  hub.ID,
		UserID: userID,
	}
	if req.Message != nil {
		accessReq.Message = req.Message
	}

	if err := h.accessReqRepo.Create(c.Request.Context(), accessReq); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create access request")
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Access request submitted successfully",
		"request": gin.H{
			"id":         accessReq.ID,
			"hub_id":     accessReq.HubID,
			"status":     accessReq.Status,
			"message":    accessReq.Message,
			"created_at": accessReq.CreatedAt,
		},
	})
}

// GetPendingRequests returns all pending access requests for a hub.
// @Summary      Get pending access requests
// @Tags         Moderation
// @Produce      json
// @Param        hub_name  path      string  true  "Hub name"
// @Success      200       {object}  gin.H
// @Failure      404       {object}  gin.H
// @Security     BearerAuth
// @Router       /mod/hubs/{hub_name}/access-requests [get]
func (h *AccessRequestHandler) GetPendingRequests(c *gin.Context) {
	hubName := c.Param("hub_name")
	if hubName == "" {
		hubName = c.Param("name")
	}
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch hub")
		return
	}
	if hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	requests, err := h.accessReqRepo.GetPendingByHub(c.Request.Context(), hub.ID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch requests")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"requests": requests,
		"count":    len(requests),
	})
}

// ApproveRequest approves a hub access request.
// @Summary      Approve access request
// @Tags         Moderation
// @Produce      json
// @Param        request_id  path      int  true  "Request ID"
// @Success      200         {object}  gin.H
// @Failure      400         {object}  gin.H
// @Failure      404         {object}  gin.H
// @Security     BearerAuth
// @Router       /access-requests/{request_id}/approve [post]
func (h *AccessRequestHandler) ApproveRequest(c *gin.Context) {
	requestIDStr := c.Param("request_id")
	requestID, err := strconv.Atoi(requestIDStr)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request ID")
		return
	}

	accessReq, err := h.accessReqRepo.GetByID(c.Request.Context(), requestID)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Request not found")
		return
	}

	if err := h.accessReqRepo.Approve(c.Request.Context(), accessReq.ID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to approve request")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Request approved"})
}

// DenyRequest denies a hub access request.
// @Summary      Deny access request
// @Tags         Moderation
// @Produce      json
// @Param        request_id  path      int  true  "Request ID"
// @Success      200         {object}  gin.H
// @Failure      400         {object}  gin.H
// @Failure      404         {object}  gin.H
// @Security     BearerAuth
// @Router       /access-requests/{request_id}/deny [post]
func (h *AccessRequestHandler) DenyRequest(c *gin.Context) {
	requestIDStr := c.Param("request_id")
	requestID, err := strconv.Atoi(requestIDStr)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request ID")
		return
	}

	accessReq, err := h.accessReqRepo.GetByID(c.Request.Context(), requestID)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Request not found")
		return
	}

	if err := h.accessReqRepo.Deny(c.Request.Context(), accessReq.ID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to deny request")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Request denied"})
}

// AddUserAccessByUsername grants hub access directly to a user by username.
// @Summary      Add user access by username
// @Tags         Moderation
// @Accept       json
// @Produce      json
// @Param        hub_name  path      string               true  "Hub name"
// @Param        body      body      AddUserAccessRequest true  "Username"
// @Success      200       {object}  gin.H
// @Failure      400       {object}  gin.H
// @Failure      404       {object}  gin.H
// @Security     BearerAuth
// @Router       /mod/hubs/{hub_name}/access-requests/add-user [post]
func (h *AccessRequestHandler) AddUserAccessByUsername(c *gin.Context) {
	hubName := c.Param("hub_name")
	if hubName == "" {
		hubName = c.Param("name")
	}
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch hub")
		return
	}
	if hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	settings, err := h.settingsRepo.GetByHubID(c.Request.Context(), hub.ID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch hub settings")
		return
	}
	if settings.PrivacyType != "private" {
		RespondError(c, http.StatusBadRequest, "Hub is not private")
		return
	}

	var req AddUserAccessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	viewerID, _ := middleware.GetOptionalUserID(c)
	user, err := h.userRepo.GetByUsername(c.Request.Context(), req.Username)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch user")
		return
	}
	if user == nil || isPendingDeletionHiddenFromViewer(user, viewerID) {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	existing, err := h.accessReqRepo.GetByUserAndHub(c.Request.Context(), hub.ID, user.ID)
	if err == nil && existing != nil {
		if err := h.accessReqRepo.Approve(c.Request.Context(), existing.ID); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to approve request")
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message": "Access granted",
			"request": gin.H{
				"id":         existing.ID,
				"hub_id":     existing.HubID,
				"user_id":    existing.UserID,
				"status":     "approved",
				"updated_at": time.Now(),
			},
		})
		return
	}

	accessReq := &models.HubAccessRequest{
		HubID:  hub.ID,
		UserID: user.ID,
	}
	if err := h.accessReqRepo.CreateApproved(c.Request.Context(), accessReq); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to grant access")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Access granted",
		"request": gin.H{
			"id":         accessReq.ID,
			"hub_id":     accessReq.HubID,
			"user_id":    accessReq.UserID,
			"status":     "approved",
			"created_at": accessReq.CreatedAt,
		},
	})
}

// GetUserRequests returns the current user's hub access requests.
// @Summary      Get my access requests
// @Tags         Hubs
// @Produce      json
// @Success      200  {object}  gin.H
// @Security     BearerAuth
// @Router       /users/me/access-requests [get]
func (h *AccessRequestHandler) GetUserRequests(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	requests, err := h.accessReqRepo.GetUserAccessRequests(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch requests")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"requests": requests,
		"count":    len(requests),
	})
}

// CheckRequestStatus returns the current user's access request status for a hub.
// @Summary      Check access request status
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Success      200   {object}  gin.H
// @Failure      404   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/access-request/status [get]
func (h *AccessRequestHandler) CheckRequestStatus(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch hub")
		return
	}
	if hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	accessReq, err := h.accessReqRepo.GetByUserAndHub(c.Request.Context(), hub.ID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check request status")
		return
	}

	if accessReq == nil {
		c.JSON(http.StatusOK, gin.H{
			"has_request": false,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"has_request": true,
		"status":      accessReq.Status,
		"request_id":  accessReq.ID,
	})
}
