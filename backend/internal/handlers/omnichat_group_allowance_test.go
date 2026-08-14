package handlers

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

type groupAllowanceActionsFake struct {
	responders []int
	created    bool
}

func (f *groupAllowanceActionsFake) SendMessage(_ context.Context, groupID uuid.UUID, userID int, _ uuid.UUID, content string, _ *uuid.UUID, responders []int) ([]*models.OmniChatGroupMessage, bool, error) {
	f.responders = append([]int(nil), responders...)
	messages := []*models.OmniChatGroupMessage{{GroupID: groupID, SenderType: "user", SenderUserID: &userID, Content: content}}
	for _, personaID := range responders {
		id := personaID
		messages = append(messages, &models.OmniChatGroupMessage{GroupID: groupID, SenderType: "persona", SenderPersonaID: &id, Content: "Reply"})
	}
	return messages, f.created, nil
}

func (*groupAllowanceActionsFake) CreateInvite(context.Context, uuid.UUID, int, *int, int) (string, *models.OmniChatGroupInvite, error) {
	return "", nil, nil
}
func (*groupAllowanceActionsFake) AcceptInvite(context.Context, string, int) (*models.OmniChatGroup, error) {
	return nil, nil
}

type groupAllowanceDataFake struct {
	personas []*models.OmniChatGroupPersona
}

func (*groupAllowanceDataFake) CreateGroup(context.Context, int, string, string, []int) (*models.OmniChatGroup, error) {
	return nil, nil
}
func (*groupAllowanceDataFake) GetGroupForMember(context.Context, uuid.UUID, int) (*models.OmniChatGroup, error) {
	return nil, nil
}
func (*groupAllowanceDataFake) ListGroupsForUser(context.Context, int, *models.OmniChatGroupCursor, int) ([]*models.OmniChatGroup, error) {
	return nil, nil
}
func (*groupAllowanceDataFake) ListMessagesForMember(context.Context, uuid.UUID, int, *models.OmniChatGroupMessageCursor, int) ([]*models.OmniChatGroupMessage, error) {
	return nil, nil
}
func (f *groupAllowanceDataFake) ListGroupPersonas(context.Context, uuid.UUID) ([]*models.OmniChatGroupPersona, error) {
	return f.personas, nil
}
func (*groupAllowanceDataFake) UpdateGroup(context.Context, uuid.UUID, int, string, string, string) (*models.OmniChatGroup, error) {
	return nil, nil
}
func (*groupAllowanceDataFake) LeaveGroup(context.Context, uuid.UUID, int) (bool, error) {
	return false, nil
}
func (*groupAllowanceDataFake) SetMemberRole(context.Context, uuid.UUID, int, int, string) (bool, error) {
	return false, nil
}
func (*groupAllowanceDataFake) RemoveMember(context.Context, uuid.UUID, int, int) (bool, error) {
	return false, nil
}
func (*groupAllowanceDataFake) TransferOwnership(context.Context, uuid.UUID, int, int) (bool, error) {
	return false, nil
}
func (*groupAllowanceDataFake) ListInvites(context.Context, uuid.UUID, int) ([]*models.OmniChatGroupInvite, error) {
	return nil, nil
}
func (*groupAllowanceDataFake) RevokeInvite(context.Context, uuid.UUID, uuid.UUID, int) (bool, error) {
	return false, nil
}
func (*groupAllowanceDataFake) ArchiveGroup(context.Context, uuid.UUID, int) (bool, error) {
	return false, nil
}
func (*groupAllowanceDataFake) DeleteGroup(context.Context, uuid.UUID, int) (bool, error) {
	return false, nil
}

func TestOmniChatGroupAllowanceCountsOnlyGeneratedCharacterReplies(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cache := services.NewMemoryCache()
	defer cache.Stop()
	allowance := services.NewOmniChatAllowance(cache, handlerAllowancePlanFake{plan: "free"})
	actions := &groupAllowanceActionsFake{created: true}
	data := &groupAllowanceDataFake{personas: []*models.OmniChatGroupPersona{{PersonaID: 9, Name: "Sadie Hart"}}}
	handler := NewOmniChatGroupHandler(actions, data, allowance)
	groupID := uuid.New()
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", 42); c.Next() })
	router.POST("/groups/:group_id/messages", handler.SendMessage)

	send := func(body string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, "/groups/"+groupID.String()+"/messages", bytes.NewBufferString(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}

	plain := send(`{"content":"Hello everyone","responder_persona_ids":[],"idempotency_key":"` + uuid.NewString() + `"}`)
	if plain.Code != http.StatusCreated {
		t.Fatalf("plain group message code=%d body=%s", plain.Code, plain.Body.String())
	}
	state, err := allowance.Status(context.Background(), groupAllowanceIntPointer(42), "")
	if err != nil || state.Used != 0 {
		t.Fatalf("plain group message consumed allowance: state=%+v err=%v", state, err)
	}

	mentioned := send(`{"content":"Sadie Hart, what do you think?","responder_persona_ids":[],"idempotency_key":"` + uuid.NewString() + `"}`)
	if mentioned.Code != http.StatusCreated {
		t.Fatalf("mentioned group message code=%d body=%s", mentioned.Code, mentioned.Body.String())
	}
	state, err = allowance.Status(context.Background(), groupAllowanceIntPointer(42), "")
	if err != nil || state.Used != 1 {
		t.Fatalf("generated group reply allowance: state=%+v err=%v", state, err)
	}
	if len(actions.responders) != 1 || actions.responders[0] != 9 {
		t.Fatalf("resolved responders = %v", actions.responders)
	}
}

func TestOmniChatGroupAllowanceDoesNotChargeIdempotentReplay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cache := services.NewMemoryCache()
	defer cache.Stop()
	allowance := services.NewOmniChatAllowance(cache, handlerAllowancePlanFake{plan: "free"})
	actions := &groupAllowanceActionsFake{created: false}
	data := &groupAllowanceDataFake{}
	handler := NewOmniChatGroupHandler(actions, data, allowance)
	groupID := uuid.New()
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", 42); c.Next() })
	router.POST("/groups/:group_id/messages", handler.SendMessage)

	request := httptest.NewRequest(
		http.MethodPost,
		"/groups/"+groupID.String()+"/messages",
		bytes.NewBufferString(`{"content":"Retry","responder_persona_ids":[9],"idempotency_key":"`+uuid.NewString()+`"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("idempotent replay code=%d body=%s", response.Code, response.Body.String())
	}
	state, err := allowance.Status(context.Background(), groupAllowanceIntPointer(42), "")
	if err != nil || state.Used != 0 {
		t.Fatalf("idempotent replay consumed allowance: state=%+v err=%v", state, err)
	}
}

func groupAllowanceIntPointer(value int) *int { return &value }
