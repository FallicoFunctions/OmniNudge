package handlers

import (
	"net/http"
	"strconv"

	"github.com/chatreddit/backend/internal/models"
	"github.com/gin-gonic/gin"
)

// AdminHandler handles admin-level actions
type AdminHandler struct {
	userRepo *models.UserRepository
}

// NewAdminHandler creates a new admin handler
func NewAdminHandler(userRepo *models.UserRepository) *AdminHandler {
	return &AdminHandler{userRepo: userRepo}
}

// PromoteUser handles POST /api/v1/admin/users/:id/role
func (h *AdminHandler) PromoteUser(c *gin.Context) {
	targetID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	switch req.Role {
	case "user", "moderator", "admin":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid role"})
		return
	}

	if err := h.userRepo.UpdateRole(c.Request.Context(), targetID, req.Role); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update role", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Role updated", "user_id": targetID, "role": req.Role})
}
