package domain

import "github.com/omninudge/backend/internal/models"

// Type aliases — domain.User IS models.User (zero cost, no conversion needed).
// When models/ is eventually deleted these become concrete struct definitions.
type User = models.User
type UserRoleContact = models.UserRoleContact
type BanStatus = models.BanStatus
type BanHistory = models.BanHistory
