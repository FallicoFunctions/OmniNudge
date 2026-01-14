package handlers

import "github.com/omninudge/backend/internal/models"

func mapContentOptions(option string) (allowText, allowLink, allowImage, allowVideo bool) {
	switch option {
	case "text_only":
		return true, false, false, false
	case "links_only":
		return false, true, false, false
	case "images_only":
		return false, false, true, false
	case "videos_only":
		return false, false, false, true
	default:
		return true, true, true, true
	}
}

func buildDefaultHubSettings(hubID int, privacyType string, allowText, allowLink, allowImage, allowVideo bool) *models.HubSettings {
	return &models.HubSettings{
		HubID:                hubID,
		PrivacyType:          privacyType,
		AllowTextPosts:       allowText,
		AllowLinkPosts:       allowLink,
		AllowImagePosts:      allowImage,
		AllowVideoPosts:      allowVideo,
		AllowPollPosts:       true,
		AllowMediaInComments: true,
		RequirePostFlair:     false,
		SpamFilterStrength:   "medium",
		AllowSpoilers:        true,
		ShowThumbnails:       true,
		EnableWiki:           false,
	}
}
