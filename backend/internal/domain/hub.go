package domain

import "github.com/omninudge/backend/internal/models"

// Type aliases — domain.Hub IS models.Hub (zero cost, no conversion needed).
type Hub = models.Hub
type HubTarget = models.HubTarget

// Hub settings types
type HubSettings = models.HubSettings
type HubTheme = models.HubTheme

// Hub ban types
type HubBan = models.HubBan

// Hub moderator types
type ModeratorRole = models.ModeratorRole
type HubModerator = models.HubModerator
type HubModeratorUser = models.HubModeratorUser
type ModeratedHubSummary = models.ModeratedHubSummary

// Hub subscription types
type HubSubscription = models.HubSubscription

// Hub access request types
type AccessRequestStatus = models.AccessRequestStatus
type HubAccessRequest = models.HubAccessRequest
