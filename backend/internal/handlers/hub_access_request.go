package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
)

type AccessRequestHandler struct {
	accessReqRepo *models.HubAccessRequestRepository
	hubRepo       *models.HubRepository
	settingsRepo  *repository.HubSettingsRepository
	userRepo      *models.UserRepository
}

func NewAccessRequestHandler(
	accessReqRepo *models.HubAccessRequestRepository,
	hubRepo *models.HubRepository,
	settingsRepo *repository.HubSettingsRepository,
	userRepo *models.UserRepository,
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

func (h *AccessRequestHandler) CreateRequest(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	settings, err := h.settingsRepo.GetByHubID(c.Request.Context(), hub.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub settings", "details": err.Error()})
		return
	}

	if settings.PrivacyType != "private" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hub is not private"})
		return
	}

	var req CreateAccessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	hasPending, err := h.accessReqRepo.HasPendingRequest(c.Request.Context(), hub.ID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check existing requests", "details": err.Error()})
		return
	}
	if hasPending {
		c.JSON(http.StatusConflict, gin.H{"error": "You already have a pending request for this hub"})
		return
	}

	if settings.AccessRequestCooldownDays > 0 {
		accessReq, err := h.accessReqRepo.GetByUserAndHub(c.Request.Context(), hub.ID, userID.(int))
		if err == nil && accessReq != nil && accessReq.Status == "denied" {
			cooldown := time.Duration(settings.AccessRequestCooldownDays) * 24 * time.Hour
			nextAllowed := accessReq.UpdatedAt.Add(cooldown)
			if time.Now().Before(nextAllowed) {
				c.JSON(http.StatusTooManyRequests, gin.H{
					"error":            "Access request cooldown active",
					"next_allowed_at":  nextAllowed,
					"cooldown_days":    settings.AccessRequestCooldownDays,
				})
				return
			}
		}
	}

	accessReq := &models.HubAccessRequest{
		HubID:  hub.ID,
		UserID: userID.(int),
	}
	if req.Message != nil {
		accessReq.Message = req.Message
	}

	if err := h.accessReqRepo.Create(c.Request.Context(), accessReq); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create access request", "details": err.Error()})
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

func (h *AccessRequestHandler) GetPendingRequests(c *gin.Context) {
	hubName := c.Param("hub_name")
	if hubName == "" {
		hubName = c.Param("name")
	}
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	requests, err := h.accessReqRepo.GetPendingByHub(c.Request.Context(), hub.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch requests", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"requests": requests,
		"count":    len(requests),
	})
}

func (h *AccessRequestHandler) ApproveRequest(c *gin.Context) {
	requestIDStr := c.Param("request_id")
	requestID, err := strconv.Atoi(requestIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request ID"})
		return
	}

	accessReq, err := h.accessReqRepo.GetByID(c.Request.Context(), requestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Request not found"})
		return
	}

	if err := h.accessReqRepo.Approve(c.Request.Context(), accessReq.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to approve request", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Request approved"})
}

func (h *AccessRequestHandler) DenyRequest(c *gin.Context) {
	requestIDStr := c.Param("request_id")
	requestID, err := strconv.Atoi(requestIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request ID"})
		return
	}

	accessReq, err := h.accessReqRepo.GetByID(c.Request.Context(), requestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Request not found"})
		return
	}

	if err := h.accessReqRepo.Deny(c.Request.Context(), accessReq.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to deny request", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Request denied"})
}

func (h *AccessRequestHandler) AddUserAccessByUsername(c *gin.Context) {
	hubName := c.Param("hub_name")
	if hubName == "" {
		hubName = c.Param("name")
	}
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	settings, err := h.settingsRepo.GetByHubID(c.Request.Context(), hub.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub settings", "details": err.Error()})
		return
	}
	if settings.PrivacyType != "private" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hub is not private"})
		return
	}

	var req AddUserAccessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	user, err := h.userRepo.GetByUsername(c.Request.Context(), req.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user", "details": err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	existing, err := h.accessReqRepo.GetByUserAndHub(c.Request.Context(), hub.ID, user.ID)
	if err == nil && existing != nil {
		if err := h.accessReqRepo.Approve(c.Request.Context(), existing.ID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to approve request", "details": err.Error()})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to grant access", "details": err.Error()})
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

func (h *AccessRequestHandler) GetUserRequests(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	requests, err := h.accessReqRepo.GetUserAccessRequests(c.Request.Context(), userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch requests", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"requests": requests,
		"count":    len(requests),
	})
}

func (h *AccessRequestHandler) CheckRequestStatus(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	accessReq, err := h.accessReqRepo.GetByUserAndHub(c.Request.Context(), hub.ID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check request status", "details": err.Error()})
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
