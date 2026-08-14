package services

import (
	"context"
	"strings"

	"github.com/omninudge/backend/internal/models"
)

// OmniChatAdminReader is the narrow, server-owned role lookup used by
// entitlement services. It deliberately reads the persisted user role rather
// than accepting a browser-supplied flag or plan value.
type OmniChatAdminReader interface {
	GetByID(context.Context, int) (*models.User, error)
}

// isOmniChatAdmin reports whether a user has the persisted administrator role.
// Missing readers and missing users fail closed; lookup errors are returned so
// callers never turn an authorization outage into an entitlement grant.
func isOmniChatAdmin(ctx context.Context, reader OmniChatAdminReader, userID int) (bool, error) {
	if reader == nil || userID <= 0 {
		return false, nil
	}
	user, err := reader.GetByID(ctx, userID)
	if err != nil {
		return false, err
	}
	return user != nil && strings.EqualFold(strings.TrimSpace(user.Role), "admin"), nil
}
