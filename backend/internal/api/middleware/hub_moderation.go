package middleware

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/permissions"
)

func RequireHubModeratorOrAdmin(
	hubRepo *models.HubRepository,
	hubModRepo *models.HubModeratorRepository,
	postRepo *models.PlatformPostRepository,
	commentRepo *models.PostCommentRepository,
	removalReasonRepo *models.RemovalReasonRepository,
) gin.HandlerFunc {
	return func(c *gin.Context) {
		hubID, err := resolveHubIDForModeration(c, hubRepo, postRepo, commentRepo, removalReasonRepo)
		if err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, errUnknownHubScope) || errors.Is(err, errMissingHubAssociation) {
				status = http.StatusBadRequest
			}
			c.JSON(status, gin.H{"error": err.Error()})
			c.Abort()
			return
		}
		if hubID == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
			c.Abort()
			return
		}

		c.Set("hub_id", hubID)

		if permissions.IsAdminContext(c) {
			c.Next()
			return
		}

		userIDVal, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}

		isMod, err := hubModRepo.IsModerator(c.Request.Context(), hubID, userIDVal.(int))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify moderator permissions"})
			c.Abort()
			return
		}
		if !isMod {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not a moderator"})
			c.Abort()
			return
		}

		c.Next()
	}
}

var errUnknownHubScope = errors.New("unsupported moderation route")
var errMissingHubAssociation = errors.New("moderation target is not associated with a hub")

func resolveHubIDForModeration(
	c *gin.Context,
	hubRepo *models.HubRepository,
	postRepo *models.PlatformPostRepository,
	commentRepo *models.PostCommentRepository,
	removalReasonRepo *models.RemovalReasonRepository,
) (int, error) {
	fullPath := c.FullPath()

	switch {
	case strings.HasPrefix(fullPath, "/api/v1/mod/hubs/"):
		hubName := c.Param("hub_name")
		if hubName == "" {
			return 0, errUnknownHubScope
		}
		hub, err := hubRepo.GetByName(c.Request.Context(), hubName)
		if err != nil {
			return 0, err
		}
		if hub == nil {
			return 0, nil
		}
		return hub.ID, nil
	case strings.HasPrefix(fullPath, "/api/v1/mod/posts/"):
		postID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			return 0, errors.New("invalid post id")
		}
		post, err := postRepo.GetByID(c.Request.Context(), postID)
		if err != nil {
			return 0, err
		}
		if post == nil {
			return 0, nil
		}
		if post.HubID == nil {
			return 0, errMissingHubAssociation
		}
		return *post.HubID, nil
	case strings.HasPrefix(fullPath, "/api/v1/mod/comments/"):
		commentID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			return 0, errors.New("invalid comment id")
		}
		comment, err := commentRepo.GetByID(c.Request.Context(), commentID)
		if err != nil {
			return 0, err
		}
		if comment == nil {
			return 0, nil
		}
		post, err := postRepo.GetByID(c.Request.Context(), comment.PostID)
		if err != nil {
			return 0, err
		}
		if post == nil {
			return 0, nil
		}
		if post.HubID == nil {
			return 0, errMissingHubAssociation
		}
		return *post.HubID, nil
	case strings.HasPrefix(fullPath, "/api/v1/mod/removal-reasons/"):
		reasonID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			return 0, errors.New("invalid removal reason id")
		}
		reason, err := removalReasonRepo.GetByID(c.Request.Context(), reasonID)
		if err != nil {
			return 0, err
		}
		if reason == nil {
			return 0, nil
		}
		return reason.HubID, nil
	default:
		return 0, errUnknownHubScope
	}
}
