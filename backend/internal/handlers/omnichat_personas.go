package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/charactercard"
)

const (
	maxPersonaNameRunes                = 100
	maxPersonaDescriptionRunes         = 4000
	maxPersonaPromptFieldRunes         = 12000
	maxPersonaAlternateGreetings       = 12
	maxPersonaTags                     = 32
	maxPersonaImportBytes        int64 = 16 << 20
)

var personaSlugUnsafePattern = regexp.MustCompile(`[^a-z0-9]+`)

type personaDefinitionRequest struct {
	Name                    string          `json:"name"`
	Description             string          `json:"description"`
	Category                string          `json:"category"`
	Visibility              string          `json:"visibility"`
	SystemPrompt            string          `json:"system_prompt"`
	Personality             string          `json:"personality"`
	Scenario                string          `json:"scenario"`
	FirstMessage            string          `json:"first_message"`
	ExampleDialogue         string          `json:"example_dialogue"`
	ResponseStyleProfile    string          `json:"response_style_profile"`
	PostHistoryInstructions string          `json:"post_history_instructions"`
	AlternateGreetings      []string        `json:"alternate_greetings"`
	CreatorNotes            string          `json:"creator_notes"`
	Tags                    []string        `json:"tags"`
	CreatorName             string          `json:"creator_name"`
	CharacterVersion        string          `json:"character_version"`
	AvatarURL               *string         `json:"avatar_url"`
	PreviewVideoURL         *string         `json:"preview_video_url"`
	GalleryURLs             []string        `json:"gallery_urls"`
	IsNSFW                  bool            `json:"is_nsfw"`
	CharacterBookJSON       json.RawMessage `json:"character_book_json"`
	ExtensionsJSON          json.RawMessage `json:"extensions_json"`
}

type personaDefinitionResponse struct {
	ID                      int             `json:"id"`
	Slug                    string          `json:"slug"`
	Name                    string          `json:"name"`
	Description             string          `json:"description,omitempty"`
	Category                string          `json:"category"`
	OwnerUserID             *int            `json:"owner_user_id,omitempty"`
	Visibility              string          `json:"visibility"`
	SourceFormat            string          `json:"source_format"`
	SystemPrompt            string          `json:"system_prompt"`
	Personality             string          `json:"personality"`
	Scenario                string          `json:"scenario"`
	FirstMessage            string          `json:"first_message"`
	ExampleDialogue         string          `json:"example_dialogue"`
	ResponseStyleProfile    string          `json:"response_style_profile"`
	PostHistoryInstructions string          `json:"post_history_instructions"`
	AlternateGreetings      []string        `json:"alternate_greetings"`
	CreatorNotes            string          `json:"creator_notes"`
	Tags                    []string        `json:"tags"`
	CreatorName             string          `json:"creator_name"`
	CharacterVersion        string          `json:"character_version"`
	AvatarURL               *string         `json:"avatar_url,omitempty"`
	PreviewVideoURL         *string         `json:"preview_video_url,omitempty"`
	GalleryURLs             []string        `json:"gallery_urls"`
	IsNSFW                  bool            `json:"is_nsfw"`
	IsActive                bool            `json:"is_active"`
	CharacterBookJSON       json.RawMessage `json:"character_book_json,omitempty"`
	ExtensionsJSON          json.RawMessage `json:"extensions_json"`
	ImportSourceFilename    *string         `json:"import_source_filename,omitempty"`
	CreatedAt               string          `json:"created_at"`
	UpdatedAt               string          `json:"updated_at"`
}

func (h *OmniChatHandler) ListMyPersonas(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	personas, err := h.personaRepo.ListOwnedByUser(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to list personas")
		return
	}

	c.JSON(http.StatusOK, gin.H{"personas": personas})
}

func (h *OmniChatHandler) GetPersonaDefinition(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	personaID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid persona ID")
		return
	}

	persona, err := h.personaRepo.GetAccessibleByID(c.Request.Context(), personaID, &userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load persona")
		return
	}
	if persona == nil {
		RespondError(c, http.StatusNotFound, "Persona not found")
		return
	}

	c.JSON(http.StatusOK, gin.H{"persona": buildPersonaDefinitionResponse(persona)})
}

func (h *OmniChatHandler) CreatePersona(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req personaDefinitionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	persona, err := normalizePersonaDefinitionRequest(userID, nil, &req, "native", nil)
	if err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	created, err := h.personaRepo.CreateOwned(c.Request.Context(), userID, persona)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create persona")
		return
	}

	c.JSON(http.StatusCreated, gin.H{"persona": buildPersonaDefinitionResponse(created)})
}

func (h *OmniChatHandler) UpdatePersona(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	personaID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid persona ID")
		return
	}

	existing, err := h.personaRepo.GetOwnedByUserAndID(c.Request.Context(), userID, personaID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load persona")
		return
	}
	if existing == nil {
		RespondError(c, http.StatusNotFound, "Persona not found")
		return
	}

	var req personaDefinitionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	persona, err := normalizePersonaDefinitionRequest(userID, existing, &req, existing.SourceFormat, existing.ImportSourceFilename)
	if err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	updated, err := h.personaRepo.UpdateOwned(c.Request.Context(), userID, personaID, persona)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update persona")
		return
	}
	if updated == nil {
		RespondError(c, http.StatusNotFound, "Persona not found")
		return
	}

	c.JSON(http.StatusOK, gin.H{"persona": buildPersonaDefinitionResponse(updated)})
}

func (h *OmniChatHandler) DeletePersona(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	personaID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid persona ID")
		return
	}

	deleted, err := h.personaRepo.DeleteOwned(c.Request.Context(), userID, personaID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete persona")
		return
	}
	if !deleted {
		RespondError(c, http.StatusNotFound, "Persona not found")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "persona deleted"})
}

func (h *OmniChatHandler) ImportPersona(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	if err := c.Request.ParseMultipartForm(maxPersonaImportBytes); err != nil {
		RespondError(c, http.StatusBadRequest, "Failed to parse upload")
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Character card file is required")
		return
	}
	defer file.Close()

	raw, err := io.ReadAll(io.LimitReader(file, maxPersonaImportBytes))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Failed to read upload")
		return
	}

	card, err := charactercard.Parse(header.Filename, header.Header.Get("Content-Type"), raw)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Unsupported character card file")
		return
	}

	req := personaDefinitionRequest{
		Name:                    card.Name,
		Description:             card.Description,
		Category:                inferPersonaCategory(card),
		Visibility:              "private",
		SystemPrompt:            card.SystemPrompt,
		Personality:             card.Personality,
		Scenario:                card.Scenario,
		FirstMessage:            card.FirstMessage,
		ExampleDialogue:         card.ExampleDialogue,
		ResponseStyleProfile:    models.ResponseStyleProfileCharacterOnly,
		PostHistoryInstructions: card.PostHistoryInstructions,
		AlternateGreetings:      card.AlternateGreetings,
		CreatorNotes:            card.CreatorNotes,
		Tags:                    card.Tags,
		CreatorName:             card.Creator,
		CharacterVersion:        card.CharacterVersion,
		IsNSFW:                  c.PostForm("is_nsfw") == "true",
		CharacterBookJSON:       cloneJSON(card.CharacterBook),
		ExtensionsJSON:          cloneJSON(card.Extensions),
	}
	if avatar := strings.TrimSpace(c.PostForm("avatar_url")); avatar != "" {
		req.AvatarURL = &avatar
	}

	persona, err := normalizePersonaDefinitionRequest(userID, nil, &req, card.Spec, &header.Filename)
	if err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}
	persona.RawCardJSON = append(json.RawMessage(nil), bytes.TrimSpace(card.Raw)...)

	created, err := h.personaRepo.CreateOwned(c.Request.Context(), userID, persona)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to import persona")
		return
	}

	c.JSON(http.StatusCreated, gin.H{"persona": buildPersonaDefinitionResponse(created)})
}

func (h *OmniChatHandler) ExportPersonaJSON(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	personaID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid persona ID")
		return
	}

	persona, err := h.personaRepo.GetOwnedByUserAndID(c.Request.Context(), userID, personaID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load persona")
		return
	}
	if persona == nil {
		RespondError(c, http.StatusNotFound, "Persona not found")
		return
	}

	payload, err := charactercard.BuildV2Export(&charactercard.Card{
		Name:                    persona.Name,
		Description:             derefString(persona.Description),
		Personality:             persona.Personality,
		Scenario:                persona.Scenario,
		FirstMessage:            persona.FirstMessage,
		ExampleDialogue:         persona.ExampleDialogue,
		SystemPrompt:            persona.SystemPrompt,
		PostHistoryInstructions: persona.PostHistoryInstructions,
		AlternateGreetings:      persona.AlternateGreetings,
		CreatorNotes:            persona.CreatorNotes,
		Tags:                    persona.Tags,
		Creator:                 persona.CreatorName,
		CharacterVersion:        persona.CharacterVersion,
		Extensions:              cloneJSON(persona.ExtensionsJSON),
		CharacterBook:           cloneJSON(persona.CharacterBookJSON),
	})
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to export persona")
		return
	}

	filename := sanitizePersonaSlug(persona.Name) + ".json"
	c.Header("Content-Type", "application/json")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Writer.WriteHeader(http.StatusOK)
	_, _ = c.Writer.Write(payload)
}

func buildPersonaDefinitionResponse(persona *models.BotPersona) personaDefinitionResponse {
	description := ""
	if persona.Description != nil {
		description = *persona.Description
	}
	return personaDefinitionResponse{
		ID:                      persona.ID,
		Slug:                    persona.Slug,
		Name:                    persona.Name,
		Description:             description,
		Category:                persona.Category,
		OwnerUserID:             persona.OwnerUserID,
		Visibility:              persona.Visibility,
		SourceFormat:            persona.SourceFormat,
		SystemPrompt:            persona.SystemPrompt,
		Personality:             persona.Personality,
		Scenario:                persona.Scenario,
		FirstMessage:            persona.FirstMessage,
		ExampleDialogue:         persona.ExampleDialogue,
		ResponseStyleProfile:    persona.ResponseStyleProfile,
		PostHistoryInstructions: persona.PostHistoryInstructions,
		AlternateGreetings:      cloneStrings(persona.AlternateGreetings),
		CreatorNotes:            persona.CreatorNotes,
		Tags:                    cloneStrings(persona.Tags),
		CreatorName:             persona.CreatorName,
		CharacterVersion:        persona.CharacterVersion,
		AvatarURL:               persona.AvatarURL,
		PreviewVideoURL:         persona.PreviewVideoURL,
		GalleryURLs:             cloneStrings(persona.GalleryURLs),
		IsNSFW:                  persona.IsNSFW,
		IsActive:                persona.IsActive,
		CharacterBookJSON:       cloneJSON(persona.CharacterBookJSON),
		ExtensionsJSON:          ensureJSONObject(persona.ExtensionsJSON),
		ImportSourceFilename:    persona.ImportSourceFilename,
		CreatedAt:               persona.CreatedAt.Format(time.RFC3339),
		UpdatedAt:               persona.UpdatedAt.Format(time.RFC3339),
	}
}

func normalizePersonaDefinitionRequest(userID int, existing *models.BotPersona, req *personaDefinitionRequest, sourceFormat string, importFilename *string) (*models.BotPersona, error) {
	name, err := normalizePersonaField(req.Name, maxPersonaNameRunes, true)
	if err != nil {
		return nil, fmt.Errorf("name is required")
	}
	description, err := normalizePersonaField(req.Description, maxPersonaDescriptionRunes, false)
	if err != nil {
		return nil, fmt.Errorf("description is too long")
	}
	personality, err := normalizePersonaField(req.Personality, maxPersonaPromptFieldRunes, false)
	if err != nil {
		return nil, fmt.Errorf("personality is too long")
	}
	scenario, err := normalizePersonaField(req.Scenario, maxPersonaPromptFieldRunes, false)
	if err != nil {
		return nil, fmt.Errorf("scenario is too long")
	}
	firstMessage, err := normalizePersonaField(req.FirstMessage, maxPersonaPromptFieldRunes, false)
	if err != nil {
		return nil, fmt.Errorf("first message is too long")
	}
	exampleDialogue, err := normalizePersonaField(req.ExampleDialogue, maxPersonaPromptFieldRunes, false)
	if err != nil {
		return nil, fmt.Errorf("example dialogue is too long")
	}
	systemPrompt, err := normalizePersonaField(req.SystemPrompt, maxPersonaPromptFieldRunes, false)
	if err != nil {
		return nil, fmt.Errorf("system prompt is too long")
	}
	postHistoryInstructions, err := normalizePersonaField(req.PostHistoryInstructions, maxPersonaPromptFieldRunes, false)
	if err != nil {
		return nil, fmt.Errorf("post-history instructions are too long")
	}
	creatorNotes, err := normalizePersonaField(req.CreatorNotes, maxPersonaPromptFieldRunes, false)
	if err != nil {
		return nil, fmt.Errorf("creator notes are too long")
	}
	creatorName, err := normalizePersonaField(req.CreatorName, maxPersonaNameRunes, false)
	if err != nil {
		return nil, fmt.Errorf("creator name is too long")
	}
	characterVersion, err := normalizePersonaField(req.CharacterVersion, 100, false)
	if err != nil {
		return nil, fmt.Errorf("character version is too long")
	}
	responseStyleProfile, err := normalizeResponseStyleProfile(req.ResponseStyleProfile, existing, sourceFormat)
	if err != nil {
		return nil, err
	}

	category := strings.TrimSpace(req.Category)
	if !isValidPersonaCategory(category) {
		category = models.PersonaCategoryOriginal
	}

	// User-created personas remain creator-only until a future publish feature exists.
	visibility := "private"

	avatarURL, ok := normalizePersonaImageURL(req.AvatarURL)
	if !ok {
		return nil, fmt.Errorf("avatar URL must be an uploaded image")
	}
	previewVideoURL, ok := normalizePersonaVideoURL(req.PreviewVideoURL)
	if !ok {
		return nil, fmt.Errorf("preview video URL must be an uploaded video")
	}

	gallery := make([]string, 0, len(req.GalleryURLs))
	if len(req.GalleryURLs) > maxOmniChatPersonaGalleryURLs {
		return nil, fmt.Errorf("gallery cannot exceed %d images", maxOmniChatPersonaGalleryURLs)
	}
	for _, rawURL := range req.GalleryURLs {
		normalized, ok := normalizePersonaImageURL(&rawURL)
		if !ok {
			return nil, fmt.Errorf("gallery URL must be an uploaded image")
		}
		if normalized != nil {
			gallery = append(gallery, *normalized)
		}
	}

	alternateGreetings := normalizeStringList(req.AlternateGreetings, maxPersonaAlternateGreetings)
	tags := normalizeStringList(req.Tags, maxPersonaTags)

	extensionsJSON, err := normalizeJSONObject(req.ExtensionsJSON, true)
	if err != nil {
		return nil, fmt.Errorf("extensions JSON must be a valid object")
	}
	characterBookJSON, err := normalizeJSONObject(req.CharacterBookJSON, false)
	if err != nil {
		return nil, fmt.Errorf("character book JSON must be a valid object")
	}

	slug := generateOwnedPersonaSlug(name, userID)
	if existing != nil {
		slug = existing.Slug
	}

	persona := &models.BotPersona{
		Slug:                    slug,
		Name:                    name,
		Category:                category,
		Visibility:              visibility,
		SourceFormat:            sourceFormat,
		SystemPrompt:            systemPrompt,
		Personality:             personality,
		Scenario:                scenario,
		FirstMessage:            firstMessage,
		ExampleDialogue:         exampleDialogue,
		ResponseStyleProfile:    responseStyleProfile,
		PostHistoryInstructions: postHistoryInstructions,
		AlternateGreetings:      alternateGreetings,
		CreatorNotes:            creatorNotes,
		Tags:                    tags,
		CreatorName:             creatorName,
		CharacterVersion:        characterVersion,
		ExtensionsJSON:          extensionsJSON,
		CharacterBookJSON:       characterBookJSON,
		ImportSourceFilename:    importFilename,
		AvatarURL:               avatarURL,
		PreviewVideoURL:         previewVideoURL,
		GalleryURLs:             gallery,
		IsNSFW:                  req.IsNSFW,
	}
	if description != "" {
		persona.Description = &description
	}
	return persona, nil
}

func normalizeResponseStyleProfile(raw string, existing *models.BotPersona, sourceFormat string) (string, error) {
	profile := strings.TrimSpace(raw)
	if profile == "" {
		if existing != nil && existing.ResponseStyleProfile != "" {
			return existing.ResponseStyleProfile, nil
		}
		if sourceFormat != "" && sourceFormat != "native" {
			return models.ResponseStyleProfileCharacterOnly, nil
		}
		return models.ResponseStyleProfileInherit, nil
	}

	switch profile {
	case models.ResponseStyleProfileInherit,
		models.ResponseStyleProfileNaturalDialogue,
		models.ResponseStyleProfileLeanNarrative,
		models.ResponseStyleProfileProfessional,
		models.ResponseStyleProfileCharacterOnly:
		return profile, nil
	default:
		return "", fmt.Errorf("response style profile is invalid")
	}
}

func normalizePersonaField(value string, maxRunes int, required bool) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		if required {
			return "", fmt.Errorf("required")
		}
		return "", nil
	}
	if utf8.RuneCountInString(trimmed) > maxRunes {
		return "", fmt.Errorf("too long")
	}
	return trimmed, nil
}

func normalizeStringList(values []string, maxItems int) []string {
	if len(values) == 0 {
		return []string{}
	}
	normalized := make([]string, 0, minInt(len(values), maxItems))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, trimmed)
		if len(normalized) == maxItems {
			break
		}
	}
	return normalized
}

func normalizeJSONObject(raw json.RawMessage, requiredObject bool) (json.RawMessage, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		if requiredObject {
			return json.RawMessage(`{}`), nil
		}
		return nil, nil
	}
	var decoded any
	if err := json.Unmarshal(trimmed, &decoded); err != nil {
		return nil, err
	}
	if decoded == nil && !requiredObject {
		return nil, nil
	}
	if _, ok := decoded.(map[string]any); !ok {
		return nil, fmt.Errorf("must be object")
	}
	return append(json.RawMessage(nil), trimmed...), nil
}

func generateOwnedPersonaSlug(name string, userID int) string {
	base := sanitizePersonaSlug(name)
	if base == "" {
		base = "persona"
	}
	return fmt.Sprintf("u%d-%s-%s", userID, base, uuid.NewString()[:8])
}

func sanitizePersonaSlug(value string) string {
	base := strings.ToLower(strings.TrimSpace(value))
	base = personaSlugUnsafePattern.ReplaceAllString(base, "-")
	base = strings.Trim(base, "-")
	return base
}

func isValidPersonaCategory(category string) bool {
	switch category {
	case models.PersonaCategoryRoleplay, models.PersonaCategoryHelper, models.PersonaCategoryRomance,
		models.PersonaCategoryOriginal, models.PersonaCategoryAnimeGame, models.PersonaCategoryFictionMedia:
		return true
	default:
		return false
	}
}

func inferPersonaCategory(card *charactercard.Card) string {
	searchBlob := strings.ToLower(strings.Join(append([]string{card.Description, card.Personality, card.Scenario}, card.Tags...), " "))
	switch {
	case strings.Contains(searchBlob, "romance"), strings.Contains(searchBlob, "boyfriend"), strings.Contains(searchBlob, "girlfriend"):
		return models.PersonaCategoryRomance
	case strings.Contains(searchBlob, "anime"), strings.Contains(searchBlob, "game"), strings.Contains(searchBlob, "rpg"):
		return models.PersonaCategoryAnimeGame
	case strings.Contains(searchBlob, "assistant"), strings.Contains(searchBlob, "helper"), strings.Contains(searchBlob, "coach"):
		return models.PersonaCategoryHelper
	case strings.Contains(searchBlob, "fiction"), strings.Contains(searchBlob, "movie"), strings.Contains(searchBlob, "book"):
		return models.PersonaCategoryFictionMedia
	default:
		return models.PersonaCategoryOriginal
	}
}

func cloneJSON(raw json.RawMessage) json.RawMessage {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil
	}
	return append(json.RawMessage(nil), trimmed...)
}

func ensureJSONObject(raw json.RawMessage) json.RawMessage {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return json.RawMessage(`{}`)
	}
	return append(json.RawMessage(nil), trimmed...)
}

func cloneStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	out := make([]string, len(values))
	copy(out, values)
	return out
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func nonEmptyString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func detectImportFormat(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".png":
		return "chara_card_v2"
	case ".json":
		return "native"
	default:
		return "native"
	}
}
