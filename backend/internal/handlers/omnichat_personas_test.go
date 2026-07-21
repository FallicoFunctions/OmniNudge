package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func setupOmniChatPersonaTestEnv(t *testing.T) (*gin.Engine, *models.UserRepository, *models.BotPersonaRepository, *pgxpool.Pool, func()) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	personaRepo := models.NewBotPersonaRepository(db.Pool)
	handler := NewOmniChatHandler(personaRepo, nil, nil, &services.ChatbotService{})

	router := gin.New()
	router.Use(func(c *gin.Context) {
		if userID := c.GetHeader("X-Test-User-ID"); userID != "" {
			if id, err := strconv.Atoi(userID); err == nil {
				c.Set("user_id", id)
			}
		}
		c.Next()
	})

	omnichat := router.Group("/api/v1/omnichat")
	{
		omnichat.GET("/personas", handler.ListPersonas)
		omnichat.GET("/my-personas", handler.ListMyPersonas)
		omnichat.POST("/personas", handler.CreatePersona)
		omnichat.POST("/personas/import", handler.ImportPersona)
		omnichat.GET("/personas/:id", handler.GetPersonaDefinition)
		omnichat.PUT("/personas/:id", handler.UpdatePersona)
		omnichat.DELETE("/personas/:id", handler.DeletePersona)
		omnichat.GET("/personas/:id/export", handler.ExportPersonaJSON)
	}

	cleanup := func() {
		_ = database.ResetTestData(ctx, db)
	}

	return router, userRepo, personaRepo, db.Pool, cleanup
}

func createOmniChatPersonaTestUser(t *testing.T, repo *models.UserRepository, username string) *models.User {
	t.Helper()
	user := &models.User{
		Username:     username,
		PasswordHash: "test-hash",
		Role:         "user",
	}
	require.NoError(t, repo.Create(context.Background(), user))
	return user
}

func TestNormalizeResponseStyleProfileDefaultsBySource(t *testing.T) {
	native, err := normalizeResponseStyleProfile("", nil, "native")
	require.NoError(t, err)
	require.Equal(t, models.ResponseStyleProfileInherit, native)

	imported, err := normalizeResponseStyleProfile("", nil, "chara_card_v2")
	require.NoError(t, err)
	require.Equal(t, models.ResponseStyleProfileCharacterOnly, imported)

	_, err = normalizeResponseStyleProfile("performative_human", nil, "native")
	require.EqualError(t, err, "response style profile is invalid")
}

func TestNormalizePersonaDefinitionRequiresPreparedOpening(t *testing.T) {
	base := &personaDefinitionRequest{
		Name:       "Quiet Guide",
		Category:   models.PersonaCategoryOriginal,
		Visibility: "private",
	}

	_, err := normalizePersonaDefinitionRequest(7, nil, base, "native", nil)
	require.EqualError(t, err, "first message is required")

	base.AlternateGreetings = []string{"  This way.  "}
	persona, err := normalizePersonaDefinitionRequest(7, nil, base, "chara_card_v2", nil)
	require.NoError(t, err)
	require.Equal(t, "This way.", persona.FirstMessage)
}

func TestNormalizePersonaDefinitionRejectsOversizedListItems(t *testing.T) {
	base := &personaDefinitionRequest{
		Name:         "Bounded Guide",
		Category:     models.PersonaCategoryOriginal,
		FirstMessage: "Hello.",
		Tags:         []string{strings.Repeat("x", maxPersonaTagRunes+1)},
	}
	_, err := normalizePersonaDefinitionRequest(7, nil, base, "native", nil)
	require.EqualError(t, err, "tags contain an invalid value")
}

func seedPublicOmniChatPersona(t *testing.T, pool *pgxpool.Pool, repo *models.BotPersonaRepository, slug, name string) *models.BotPersona {
	t.Helper()
	var personaID int
	err := pool.QueryRow(context.Background(), `
		INSERT INTO bot_personas (slug, name, description, category, visibility, source_format, system_prompt, is_nsfw, is_active)
		VALUES ($1, $2, $3, $4, 'public', 'native', $5, false, true)
		RETURNING id
	`, slug, name, "public persona", models.PersonaCategoryOriginal, "stay public").Scan(&personaID)
	require.NoError(t, err)

	persona, err := repo.GetByID(context.Background(), personaID)
	require.NoError(t, err)
	require.NotNil(t, persona)
	return persona
}

func setOmniChatPersonaTestUser(req *http.Request, userID int) {
	req.Header.Set("X-Test-User-ID", strconv.Itoa(userID))
}

func TestOmniChatPersonaHandler_CreatePersonaForcesPrivateAndListsOwned(t *testing.T) {
	router, userRepo, _, pool, cleanup := setupOmniChatPersonaTestEnv(t)
	defer cleanup()

	owner := createOmniChatPersonaTestUser(t, userRepo, "persona_owner")
	other := createOmniChatPersonaTestUser(t, userRepo, "persona_other")
	seedPublicOmniChatPersona(t, pool, models.NewBotPersonaRepository(pool), "public-guide", "Public Guide")

	body := []byte(`{
		"name":"Owner Bot",
		"description":"Private bot",
		"category":"original",
		"visibility":"public",
		"system_prompt":"Be concise.",
		"personality":"Calm",
		"scenario":"A quiet room",
		"first_message":"Hello.",
		"example_dialogue":"",
		"post_history_instructions":"",
		"alternate_greetings":["Hi again."],
		"creator_notes":"",
		"tags":["test"],
		"creator_name":"Owner",
		"character_version":"1.0",
		"gallery_urls":[],
		"is_nsfw":false,
		"extensions_json":{},
		"character_book_json":{}
	}`)
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/omnichat/personas", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	setOmniChatPersonaTestUser(req, owner.ID)

	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, req)
	require.Equal(t, http.StatusCreated, createW.Code)

	var createdResp struct {
		Persona struct {
			ID                   int    `json:"id"`
			OwnerUserID          *int   `json:"owner_user_id"`
			Visibility           string `json:"visibility"`
			Name                 string `json:"name"`
			ResponseStyleProfile string `json:"response_style_profile"`
		} `json:"persona"`
	}
	require.NoError(t, json.Unmarshal(createW.Body.Bytes(), &createdResp))
	require.Equal(t, "Owner Bot", createdResp.Persona.Name)
	require.Equal(t, "private", createdResp.Persona.Visibility)
	require.NotNil(t, createdResp.Persona.OwnerUserID)
	require.Equal(t, owner.ID, *createdResp.Persona.OwnerUserID)
	require.Equal(t, models.ResponseStyleProfileInherit, createdResp.Persona.ResponseStyleProfile)

	myReq, _ := http.NewRequest(http.MethodGet, "/api/v1/omnichat/my-personas", nil)
	setOmniChatPersonaTestUser(myReq, owner.ID)
	myW := httptest.NewRecorder()
	router.ServeHTTP(myW, myReq)
	require.Equal(t, http.StatusOK, myW.Code)

	var myResp struct {
		Personas []models.BotPersona `json:"personas"`
	}
	require.NoError(t, json.Unmarshal(myW.Body.Bytes(), &myResp))
	require.Len(t, myResp.Personas, 1)
	require.Equal(t, createdResp.Persona.ID, myResp.Personas[0].ID)
	require.Equal(t, "private", myResp.Personas[0].Visibility)

	publicReq, _ := http.NewRequest(http.MethodGet, "/api/v1/omnichat/personas", nil)
	publicW := httptest.NewRecorder()
	router.ServeHTTP(publicW, publicReq)
	require.Equal(t, http.StatusOK, publicW.Code)

	var publicResp struct {
		Personas []models.BotPersona `json:"personas"`
	}
	require.NoError(t, json.Unmarshal(publicW.Body.Bytes(), &publicResp))
	require.Len(t, publicResp.Personas, 1)
	require.Equal(t, "Public Guide", publicResp.Personas[0].Name)

	ownerCatalogReq, _ := http.NewRequest(http.MethodGet, "/api/v1/omnichat/personas", nil)
	setOmniChatPersonaTestUser(ownerCatalogReq, owner.ID)
	ownerCatalogW := httptest.NewRecorder()
	router.ServeHTTP(ownerCatalogW, ownerCatalogReq)
	require.Equal(t, http.StatusOK, ownerCatalogW.Code)

	var ownerCatalogResp struct {
		Personas []models.BotPersona `json:"personas"`
	}
	require.NoError(t, json.Unmarshal(ownerCatalogW.Body.Bytes(), &ownerCatalogResp))
	require.Len(t, ownerCatalogResp.Personas, 2)

	otherCatalogReq, _ := http.NewRequest(http.MethodGet, "/api/v1/omnichat/personas", nil)
	setOmniChatPersonaTestUser(otherCatalogReq, other.ID)
	otherCatalogW := httptest.NewRecorder()
	router.ServeHTTP(otherCatalogW, otherCatalogReq)
	require.Equal(t, http.StatusOK, otherCatalogW.Code)

	var otherCatalogResp struct {
		Personas []models.BotPersona `json:"personas"`
	}
	require.NoError(t, json.Unmarshal(otherCatalogW.Body.Bytes(), &otherCatalogResp))
	require.Len(t, otherCatalogResp.Personas, 1)
	require.Equal(t, "Public Guide", otherCatalogResp.Personas[0].Name)
}

func TestOmniChatPersonaHandlerRejectsForeignUploadURLs(t *testing.T) {
	router, userRepo, _, pool, cleanup := setupOmniChatPersonaTestEnv(t)
	defer cleanup()
	owner := createOmniChatPersonaTestUser(t, userRepo, "persona_media_owner")
	other := createOmniChatPersonaTestUser(t, userRepo, "persona_media_other")

	insertMedia := func(userID int, name, scanStatus string) string {
		t.Helper()
		url := "/uploads/" + name
		_, err := pool.Exec(context.Background(), `
			INSERT INTO media_files (user_id,filename,original_filename,file_type,file_size,storage_url,storage_path,scan_status)
			VALUES ($1,$2,$2,'image/png',1,$3,$4,$5)
		`, userID, name, "https://cdn.example.test/"+name, "uploads/"+name, scanStatus)
		require.NoError(t, err)
		return url
	}
	foreignURL := insertMedia(other.ID, "foreign-persona.png", models.MediaScanStatusClean)
	ownedURL := insertMedia(owner.ID, "owned-persona.png", models.MediaScanStatusPending)
	requestBody := func(avatarURL string) []byte {
		return []byte(`{"name":"Media Guide","category":"original","first_message":"Hello.","avatar_url":"` + avatarURL + `","gallery_urls":[],"extensions_json":{}}`)
	}
	foreignRequest := httptest.NewRequest(http.MethodPost, "/api/v1/omnichat/personas", bytes.NewReader(requestBody(foreignURL)))
	foreignRequest.Header.Set("Content-Type", "application/json")
	setOmniChatPersonaTestUser(foreignRequest, owner.ID)
	foreignResponse := httptest.NewRecorder()
	router.ServeHTTP(foreignResponse, foreignRequest)
	require.Equal(t, http.StatusBadRequest, foreignResponse.Code)

	ownedRequest := httptest.NewRequest(http.MethodPost, "/api/v1/omnichat/personas", bytes.NewReader(requestBody(ownedURL)))
	ownedRequest.Header.Set("Content-Type", "application/json")
	setOmniChatPersonaTestUser(ownedRequest, owner.ID)
	ownedResponse := httptest.NewRecorder()
	router.ServeHTTP(ownedResponse, ownedRequest)
	require.Equal(t, http.StatusCreated, ownedResponse.Code, "a just-uploaded pending file must be attachable while serving remains scan-gated")
}

func TestOmniChatPersonaHandler_ImportPersonaOwnerOnlyAccess(t *testing.T) {
	router, userRepo, _, _, cleanup := setupOmniChatPersonaTestEnv(t)
	defer cleanup()

	owner := createOmniChatPersonaTestUser(t, userRepo, "import_owner")
	other := createOmniChatPersonaTestUser(t, userRepo, "import_other")

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "archivist.json")
	require.NoError(t, err)
	_, err = part.Write([]byte(`{
		"spec":"chara_card_v2",
		"spec_version":"2.0",
		"data":{
			"name":"Archivist",
			"description":"Knows every shelf.",
			"personality":"Measured.",
			"scenario":"After midnight.",
			"first_mes":"Welcome back.",
			"mes_example":"<START>\nArchivist: Quiet, please.",
			"system_prompt":"Stay in role.",
			"post_history_instructions":"Keep the tone tense.",
			"alternate_greetings":["You returned."],
			"creator":"Tester",
			"character_version":"1.0",
			"extensions":{}
		}
	}`))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	importReq, _ := http.NewRequest(http.MethodPost, "/api/v1/omnichat/personas/import", &body)
	importReq.Header.Set("Content-Type", writer.FormDataContentType())
	setOmniChatPersonaTestUser(importReq, owner.ID)
	importW := httptest.NewRecorder()
	router.ServeHTTP(importW, importReq)
	require.Equal(t, http.StatusCreated, importW.Code)

	var importResp struct {
		Persona struct {
			ID                   int    `json:"id"`
			Name                 string `json:"name"`
			Visibility           string `json:"visibility"`
			OwnerUserID          *int   `json:"owner_user_id"`
			ResponseStyleProfile string `json:"response_style_profile"`
		} `json:"persona"`
	}
	require.NoError(t, json.Unmarshal(importW.Body.Bytes(), &importResp))
	require.Equal(t, "Archivist", importResp.Persona.Name)
	require.Equal(t, "private", importResp.Persona.Visibility)
	require.NotNil(t, importResp.Persona.OwnerUserID)
	require.Equal(t, owner.ID, *importResp.Persona.OwnerUserID)
	require.Equal(t, models.ResponseStyleProfileCharacterOnly, importResp.Persona.ResponseStyleProfile)

	ownerReq, _ := http.NewRequest(http.MethodGet, "/api/v1/omnichat/personas/"+strconv.Itoa(importResp.Persona.ID), nil)
	setOmniChatPersonaTestUser(ownerReq, owner.ID)
	ownerW := httptest.NewRecorder()
	router.ServeHTTP(ownerW, ownerReq)
	require.Equal(t, http.StatusOK, ownerW.Code)

	otherReq, _ := http.NewRequest(http.MethodGet, "/api/v1/omnichat/personas/"+strconv.Itoa(importResp.Persona.ID), nil)
	setOmniChatPersonaTestUser(otherReq, other.ID)
	otherW := httptest.NewRecorder()
	router.ServeHTTP(otherW, otherReq)
	require.Equal(t, http.StatusNotFound, otherW.Code)
}

func TestOmniChatPersonaHandler_GetPersonaDefinitionAllowsPublicAndOwnerPrivateOnly(t *testing.T) {
	router, userRepo, personaRepo, pool, cleanup := setupOmniChatPersonaTestEnv(t)
	defer cleanup()

	owner := createOmniChatPersonaTestUser(t, userRepo, "definition_owner")
	other := createOmniChatPersonaTestUser(t, userRepo, "definition_other")
	privateDescription := "private persona"

	publicPersona := seedPublicOmniChatPersona(t, pool, personaRepo, "lorekeeper", "Lorekeeper")

	privatePersona, err := personaRepo.CreateOwned(context.Background(), owner.ID, &models.BotPersona{
		Slug:               "private-lorekeeper",
		Name:               "Private Lorekeeper",
		Description:        &privateDescription,
		Category:           models.PersonaCategoryOriginal,
		Visibility:         "private",
		SourceFormat:       "native",
		SystemPrompt:       "keep quiet",
		Personality:        "",
		Scenario:           "",
		FirstMessage:       "",
		AlternateGreetings: []string{},
		Tags:               []string{},
		ExtensionsJSON:     []byte(`{}`),
		CharacterBookJSON:  []byte(`{}`),
		IsNSFW:             false,
		IsActive:           true,
	})
	require.NoError(t, err)

	publicReq, _ := http.NewRequest(http.MethodGet, "/api/v1/omnichat/personas/"+strconv.Itoa(publicPersona.ID), nil)
	setOmniChatPersonaTestUser(publicReq, other.ID)
	publicW := httptest.NewRecorder()
	router.ServeHTTP(publicW, publicReq)
	require.Equal(t, http.StatusOK, publicW.Code)

	ownerReq, _ := http.NewRequest(http.MethodGet, "/api/v1/omnichat/personas/"+strconv.Itoa(privatePersona.ID), nil)
	setOmniChatPersonaTestUser(ownerReq, owner.ID)
	ownerW := httptest.NewRecorder()
	router.ServeHTTP(ownerW, ownerReq)
	require.Equal(t, http.StatusOK, ownerW.Code)

	otherReq, _ := http.NewRequest(http.MethodGet, "/api/v1/omnichat/personas/"+strconv.Itoa(privatePersona.ID), nil)
	setOmniChatPersonaTestUser(otherReq, other.ID)
	otherW := httptest.NewRecorder()
	router.ServeHTTP(otherW, otherReq)
	require.Equal(t, http.StatusNotFound, otherW.Code)
}

func TestOmniChatPersonaHandler_UpdateDeleteAndExportRemainOwnerOnly(t *testing.T) {
	router, userRepo, personaRepo, _, cleanup := setupOmniChatPersonaTestEnv(t)
	defer cleanup()

	owner := createOmniChatPersonaTestUser(t, userRepo, "persona_editor_owner")
	other := createOmniChatPersonaTestUser(t, userRepo, "persona_editor_other")

	privatePersona, err := personaRepo.CreateOwned(context.Background(), owner.ID, &models.BotPersona{
		Slug:               "owner-only-bot",
		Name:               "Owner Only Bot",
		Category:           models.PersonaCategoryOriginal,
		Visibility:         "private",
		SourceFormat:       "native",
		SystemPrompt:       "Stay helpful.",
		Personality:        "Measured",
		Scenario:           "Quiet archive",
		FirstMessage:       "Hello there.",
		AlternateGreetings: []string{},
		Tags:               []string{},
		ExtensionsJSON:     []byte(`{}`),
		CharacterBookJSON:  []byte(`{}`),
		IsNSFW:             false,
		IsActive:           true,
	})
	require.NoError(t, err)

	updateBody := []byte(`{
		"name":"Updated Owner Bot",
		"description":"Still private",
		"category":"helper",
		"visibility":"public",
		"system_prompt":"Keep responses short.",
		"personality":"Crisp",
		"scenario":"Launch prep",
		"first_message":"Ready.",
		"example_dialogue":"",
		"post_history_instructions":"",
		"alternate_greetings":["Hi"],
		"creator_notes":"",
		"tags":["launch"],
		"creator_name":"Owner",
		"character_version":"2.0",
		"gallery_urls":[],
		"is_nsfw":false,
		"extensions_json":{},
		"character_book_json":{}
	}`)

	otherUpdateReq, _ := http.NewRequest(
		http.MethodPut,
		"/api/v1/omnichat/personas/"+strconv.Itoa(privatePersona.ID),
		bytes.NewReader(updateBody),
	)
	otherUpdateReq.Header.Set("Content-Type", "application/json")
	setOmniChatPersonaTestUser(otherUpdateReq, other.ID)
	otherUpdateW := httptest.NewRecorder()
	router.ServeHTTP(otherUpdateW, otherUpdateReq)
	require.Equal(t, http.StatusNotFound, otherUpdateW.Code)

	ownerUpdateReq, _ := http.NewRequest(
		http.MethodPut,
		"/api/v1/omnichat/personas/"+strconv.Itoa(privatePersona.ID),
		bytes.NewReader(updateBody),
	)
	ownerUpdateReq.Header.Set("Content-Type", "application/json")
	setOmniChatPersonaTestUser(ownerUpdateReq, owner.ID)
	ownerUpdateW := httptest.NewRecorder()
	router.ServeHTTP(ownerUpdateW, ownerUpdateReq)
	require.Equal(t, http.StatusOK, ownerUpdateW.Code)

	var updateResp struct {
		Persona struct {
			Name       string `json:"name"`
			Visibility string `json:"visibility"`
			Category   string `json:"category"`
		} `json:"persona"`
	}
	require.NoError(t, json.Unmarshal(ownerUpdateW.Body.Bytes(), &updateResp))
	require.Equal(t, "Updated Owner Bot", updateResp.Persona.Name)
	require.Equal(t, "private", updateResp.Persona.Visibility)
	require.Equal(t, models.PersonaCategoryHelper, updateResp.Persona.Category)

	otherExportReq, _ := http.NewRequest(
		http.MethodGet,
		"/api/v1/omnichat/personas/"+strconv.Itoa(privatePersona.ID)+"/export",
		nil,
	)
	setOmniChatPersonaTestUser(otherExportReq, other.ID)
	otherExportW := httptest.NewRecorder()
	router.ServeHTTP(otherExportW, otherExportReq)
	require.Equal(t, http.StatusNotFound, otherExportW.Code)

	ownerExportReq, _ := http.NewRequest(
		http.MethodGet,
		"/api/v1/omnichat/personas/"+strconv.Itoa(privatePersona.ID)+"/export",
		nil,
	)
	setOmniChatPersonaTestUser(ownerExportReq, owner.ID)
	ownerExportW := httptest.NewRecorder()
	router.ServeHTTP(ownerExportW, ownerExportReq)
	require.Equal(t, http.StatusOK, ownerExportW.Code)
	require.Equal(t, "application/json", ownerExportW.Header().Get("Content-Type"))
	require.Contains(t, ownerExportW.Header().Get("Content-Disposition"), "updated-owner-bot.json")
	require.Contains(t, ownerExportW.Body.String(), `"name":"Updated Owner Bot"`)

	otherDeleteReq, _ := http.NewRequest(
		http.MethodDelete,
		"/api/v1/omnichat/personas/"+strconv.Itoa(privatePersona.ID),
		nil,
	)
	setOmniChatPersonaTestUser(otherDeleteReq, other.ID)
	otherDeleteW := httptest.NewRecorder()
	router.ServeHTTP(otherDeleteW, otherDeleteReq)
	require.Equal(t, http.StatusNotFound, otherDeleteW.Code)

	ownerDeleteReq, _ := http.NewRequest(
		http.MethodDelete,
		"/api/v1/omnichat/personas/"+strconv.Itoa(privatePersona.ID),
		nil,
	)
	setOmniChatPersonaTestUser(ownerDeleteReq, owner.ID)
	ownerDeleteW := httptest.NewRecorder()
	router.ServeHTTP(ownerDeleteW, ownerDeleteReq)
	require.Equal(t, http.StatusOK, ownerDeleteW.Code)

	lookup, err := personaRepo.GetOwnedByUserAndID(context.Background(), owner.ID, privatePersona.ID)
	require.NoError(t, err)
	require.Nil(t, lookup)
}
