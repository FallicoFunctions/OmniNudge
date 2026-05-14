package handlers

import (
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/ports"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/omninudge/backend/internal/helpers"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
)

type HubWikiHandler struct {
	hubRepo      ports.HubRepository
	settingsRepo *repository.HubSettingsRepository
	wikiRepo     *repository.HubWikiRepository
}

func NewHubWikiHandler(
	hubRepo ports.HubRepository,
	settingsRepo *repository.HubSettingsRepository,
	wikiRepo *repository.HubWikiRepository,
) *HubWikiHandler {
	return &HubWikiHandler{
		hubRepo:      hubRepo,
		settingsRepo: settingsRepo,
		wikiRepo:     wikiRepo,
	}
}

// GetHubWikiPage handles GET /api/v1/hubs/:name/wiki/:pagePath.
// @Summary      Get hub wiki page
// @Tags         Hubs
// @Produce      json
// @Param        name      path      string  true  "Hub name"
// @Param        pagePath  path      string  false "Wiki page path"
// @Success      200       {object}  gin.H
// @Failure      404       {object}  gin.H
// @Router       /hubs/{name}/wiki/{pagePath} [get]
func (h *HubWikiHandler) GetHubWikiPage(c *gin.Context) {
	hubName := c.Param("name")
	pagePath := strings.TrimSpace(c.Param("pagePath"))
	if pagePath == "" {
		pagePath = "index"
	}

	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil || hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	settings, err := h.ensureHubSettings(c, hub)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch hub settings")
		return
	}
	if settings == nil || !settings.EnableWiki {
		RespondError(c, http.StatusNotFound, "Wiki not enabled")
		return
	}

	page, err := h.wikiRepo.GetByHubIDAndSlug(c.Request.Context(), hub.ID, pagePath)
	if err != nil && err != pgx.ErrNoRows {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch wiki page")
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

// UpdateHubWikiPage handles PUT /api/v1/hubs/:name/wiki/:pagePath.
// @Summary      Update hub wiki page
// @Tags         Hubs
// @Accept       json
// @Produce      json
// @Param        name      path      string  true  "Hub name"
// @Param        pagePath  path      string  false "Wiki page path"
// @Param        body      body      object  true  "Wiki page content"
// @Success      200       {object}  gin.H
// @Failure      400       {object}  gin.H
// @Failure      403       {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/wiki/{pagePath} [put]
func (h *HubWikiHandler) UpdateHubWikiPage(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	pagePath := strings.TrimSpace(c.Param("pagePath"))
	if pagePath == "" {
		pagePath = "index"
	}

	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil || hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	settings, err := h.ensureHubSettings(c, hub)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch hub settings")
		return
	}
	if settings == nil || !settings.EnableWiki {
		RespondError(c, http.StatusBadRequest, "Wiki not enabled")
		return
	}

	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hub.ID, userID)
		if err != nil || role == nil {
			RespondError(c, http.StatusForbidden, "Not a moderator")
			return
		}

		if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
			RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
			return
		}
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	if len(req.Content) > 500000 {
		RespondError(c, http.StatusBadRequest, "Wiki content exceeds maximum allowed size")
		return
	}

	page, err := h.wikiRepo.Upsert(c.Request.Context(), hub.ID, pagePath, req.Content, intPointer(userID))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update wiki page")
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
