package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
)

// WorldEventContextKey holds the persona a validated world-event credential is
// good for.
const WorldEventContextKey = "world_event_persona_id"

// RequireWorldEvent authenticates the world, and nothing else.
//
// It reads the Authorization header and never looks at cookies, for the same
// reason admission does not: a browser sends its cookies automatically, so any
// path that consults them is a path a logged-in user's browser can be made to
// walk by a page they did not write. Writing a character's own memory has to
// be unreachable that way. The self tier is read by everyone who talks to that
// character, so a user who could write it could put words in its mouth for
// every other user.
//
// Nor does it fall back to anonymous. A caller that cannot prove it is the
// world is refused.
func RequireWorldEvent(worldEvents *services.WorldEventAuth) gin.HandlerFunc {
	return func(c *gin.Context) {
		if worldEvents == nil {
			// The service was started without a world-event secret. Refusing is
			// the honest answer: recording without a credential is the thing
			// this middleware exists to prevent.
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"error":   "world events are not configured",
				"code":    "world_event_unavailable",
				"message": "world events are not configured",
			})
			return
		}

		header := c.GetHeader("Authorization")
		parts := strings.Split(header, " ")
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") || parts[1] == "" {
			abortWorldEvent(c)
			return
		}

		claims, err := worldEvents.Validate(parts[1])
		if err != nil {
			abortWorldEvent(c)
			return
		}

		c.Set(WorldEventContextKey, claims.PersonaID)
		c.Next()
	}
}

// abortWorldEvent answers every failure the same way. The caller is either the
// world or it is not, and telling an unauthenticated caller which part of its
// credential was wrong only helps it guess.
func abortWorldEvent(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
		"error":   "Unauthorized",
		"code":    "unauthorized",
		"message": "Unauthorized",
	})
}
