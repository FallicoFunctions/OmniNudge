package handlers

import (
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

const (
	maxOmniChatHistoryMessages = 40
	maxImportedMessages        = 200
	maxOmniChatMessageRunes    = 4000
	maxConversationNameRunes   = 80
	maxConversationTitleRunes  = 200
)

var (
	conversationNamePattern = regexp.MustCompile(`^[\p{L}][\p{L}'\-]{0,23}(?: [\p{L}][\p{L}'\-]{0,23}){0,3}$`)
	conversationAgePattern  = regexp.MustCompile(`^\d{1,3}$`)
	promptWordPattern       = regexp.MustCompile(`(?i)\b(ignore|instruction|instructions|system|assistant|developer|prompt|override|reveal|follow)\b`)
)

func normalizeOmniChatContent(content string) (string, error) {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return "", fmt.Errorf("content is required")
	}
	if utf8.RuneCountInString(trimmed) > maxOmniChatMessageRunes {
		return "", fmt.Errorf("content too long")
	}
	return trimmed, nil
}

func normalizeConversationSettings(settings *models.ConversationSettings) (*models.ConversationSettings, error) {
	if settings == nil {
		return &models.ConversationSettings{}, nil
	}

	name := strings.TrimSpace(settings.UserName)
	if name != "" {
		if utf8.RuneCountInString(name) > maxConversationNameRunes {
			return nil, fmt.Errorf("name too long")
		}
		if !conversationNamePattern.MatchString(name) || promptWordPattern.MatchString(name) {
			return nil, fmt.Errorf("invalid name")
		}
	}

	age := strings.TrimSpace(settings.UserAge)
	if age != "" && !conversationAgePattern.MatchString(age) {
		return nil, fmt.Errorf("invalid age")
	}

	gender := strings.ToUpper(strings.TrimSpace(settings.UserGender))
	switch gender {
	case "", "M", "F", "T", "A":
	default:
		return nil, fmt.Errorf("invalid gender")
	}

	return &models.ConversationSettings{
		UserName:   name,
		UserAge:    age,
		UserGender: gender,
	}, nil
}

func normalizeConversationTitle(title *string) (*string, error) {
	if title == nil {
		return nil, nil
	}
	normalized := strings.TrimSpace(*title)
	if normalized == "" {
		return nil, nil
	}
	if utf8.RuneCountInString(normalized) > maxConversationTitleRunes {
		return nil, fmt.Errorf("title too long")
	}
	return &normalized, nil
}

func normalizePreviewHistory(history []previewMessage) ([]services.ChatMessage, error) {
	if len(history) > maxOmniChatHistoryMessages {
		history = history[len(history)-maxOmniChatHistoryMessages:]
	}

	normalized := make([]services.ChatMessage, 0, len(history))
	for _, m := range history {
		if m.Role != models.BotMessageRoleUser && m.Role != models.BotMessageRoleAssistant {
			return nil, fmt.Errorf("invalid role")
		}
		content, err := normalizeOmniChatContent(m.Content)
		if err != nil {
			return nil, err
		}
		normalized = append(normalized, services.ChatMessage{
			Role:    m.Role,
			Content: content,
		})
	}
	return normalized, nil
}

func normalizeImportedMessages(messages []*models.BotMessage) ([]*models.BotMessage, error) {
	if len(messages) > maxImportedMessages {
		messages = messages[len(messages)-maxImportedMessages:]
	}

	normalized := make([]*models.BotMessage, 0, len(messages))
	for _, m := range messages {
		if m == nil || m.Failed {
			continue
		}
		if m.Role != models.BotMessageRoleUser && m.Role != models.BotMessageRoleAssistant {
			return nil, fmt.Errorf("invalid role")
		}
		content, err := normalizeOmniChatContent(m.Content)
		if err != nil {
			return nil, err
		}
		normalized = append(normalized, &models.BotMessage{
			Role:    m.Role,
			Content: content,
			Failed:  false,
		})
	}
	return normalized, nil
}
