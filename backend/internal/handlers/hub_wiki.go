package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/omninudge/backend/internal/helpers"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
)

type HubWikiHandler struct {
	hubRepo      *models.HubRepository
	settingsRepo *repository.HubSettingsRepository
	wikiRepo     *repository.HubWikiRepository
}

func NewHubWikiHandler(
	hubRepo *models.HubRepository,
	settingsRepo *repository.HubSettingsRepository,
	wikiRepo *repository.HubWikiRepository,
) *HubWikiHandler {
	return &HubWikiHandler{
		hubRepo:      hubRepo,
		settingsRepo: settingsRepo,
		wikiRepo:     wikiRepo,
	}
}

// GetHubWikiPage handles GET /api/v1/hubs/:name/wiki/:pagePath
func (h *HubWikiHandler) GetHubWikiPage(c *gin.Context) {
	hubName := c.Param("name")
	pagePath := strings.TrimSpace(c.Param("pagePath"))
	if pagePath == "" {
		pagePath = "index"
	}

	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil || hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	settings, err := h.ensureHubSettings(c, hub)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub settings"})
		return
	}
	if settings == nil || !settings.EnableWiki {
		c.JSON(http.StatusNotFound, gin.H{"error": "Wiki not enabled"})
		return
	}

	page, err := h.wikiRepo.GetByHubIDAndSlug(c.Request.Context(), hub.ID, pagePath)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch wiki page"})
		return
	}
	if err == pgx.ErrNoRows {
		c.JSON(http.StatusOK, gin.H{
			"hub_id":  hub.ID,
			"slug":    pagePath,
			"content": "",
			"exists":  false,
		})
		return
	}

	c.JSON(http.StatusOK, page)
}

// UpdateHubWikiPage handles PUT /api/v1/hubs/:name/wiki/:pagePath
func (h *HubWikiHandler) UpdateHubWikiPage(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	pagePath := strings.TrimSpace(c.Param("pagePath"))
	if pagePath == "" {
		pagePath = "index"
	}

	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil || hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	settings, err := h.ensureHubSettings(c, hub)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub settings"})
		return
	}
	if settings == nil || !settings.EnableWiki {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Wiki not enabled"})
		return
	}

	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hub.ID, userID.(int))
		if err != nil || role == nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not a moderator"})
			return
		}

		if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
			c.JSON(http.StatusForbidden, gin.H{"error": "Requires owner or full_moderator role"})
			return
		}
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	page, err := h.wikiRepo.Upsert(c.Request.Context(), hub.ID, pagePath, req.Content, intPointer(userID.(int)))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update wiki page"})
		return
	}

	c.JSON(http.StatusOK, page)
}

func (h *HubWikiHandler) ensureHubSettings(c *gin.Context, hub *models.Hub) (*models.HubSettings, error) {
	settings, err := h.settingsRepo.GetByHubID(c.Request.Context(), hub.ID)
	if err == nil {
		return settings, nil
	}
	if err != pgx.ErrNoRows {
		return nil, err
	}

	allowText, allowLink, allowImage, allowVideo := mapContentOptions(hub.ContentOptions)
	defaults := buildDefaultHubSettings(hub.ID, hub.Type, allowText, allowLink, allowImage, allowVideo)
	var createdBy *int
	if hub.CreatedBy != nil {
		createdBy = hub.CreatedBy
	}
	if err := h.settingsRepo.EnsureDefaults(c.Request.Context(), defaults, createdBy); err != nil {
		return nil, err
	}
	return h.settingsRepo.GetByHubID(c.Request.Context(), hub.ID)
}

func intPointer(value int) *int {
	return &value
}
