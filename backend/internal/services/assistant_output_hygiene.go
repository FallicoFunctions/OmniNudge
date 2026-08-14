package services

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
)

// ErrAssistantOutputHygiene means the upstream response contained provider
// protocol text or controls and must not be shown or saved as an assistant turn.
var ErrAssistantOutputHygiene = errors.New("chatbot: assistant output failed hygiene validation")

var (
	providerTemplateDelimiterPattern = regexp.MustCompile(`(?i)(?:<\|(?:end|eot(?:_id)?|im_end|im_start|assistant|user|system|start_header_id|end_header_id|begin_of_text|end_of_text|endoftext)\|>|\[/?INST\]|<</?SYS>>|</?think>)`)
	providerMetaLeakPattern          = regexp.MustCompile(`(?i)\b(?:opening|starting|beginning)\s+(?:a\s+)?new\s+(?:response|reply|completion|message)\b`)
	providerPlanningLeadPattern      = regexp.MustCompile(`(?is)^\s*"?\s*(?:we|i)\s+need\s+to\s+(?:continue|write|generate|produce|answer|respond)\b.{0,200}\b(?:dialogue|response|reply|character|user)\b`)
	serverPromptMarkerPattern        = regexp.MustCompile(`(?i)\[(?:platform response style|conversation integrity|post-history instructions|character definition|example dialogue|actor and state continuity|personal conversation mode|server scene continuity state|user profile metadata|character lorebook|additional lorebook context|provider output retry|personal response shape retry|personal length-only recovery|personal dialogue-only recovery)(?:\s*:[^\]]*)?\]`)
)

// validateAssistantOutputHygiene deliberately detects only high-confidence
// provider artifacts. It does not attempt spelling or prose quality judging,
// which would be both brittle and inappropriate for user-authored personas.
func validateAssistantOutputHygiene(content string) (bool, string) {
	if strings.TrimSpace(content) == "" {
		return false, "response is empty"
	}
	if !utf8.ValidString(content) {
		return false, "response contains invalid UTF-8"
	}
	if providerTemplateDelimiterPattern.MatchString(content) {
		return false, "response contains a provider template delimiter"
	}
	if providerMetaLeakPattern.MatchString(content) {
		return false, "response contains provider generation meta-text"
	}
	if providerPlanningLeadPattern.MatchString(content) {
		return false, "response contains provider planning text"
	}
	if serverPromptMarkerPattern.MatchString(content) {
		return false, "response contains a server prompt marker"
	}
	for _, r := range content {
		if unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t' {
			return false, fmt.Sprintf("response contains a disallowed control character U+%04X", r)
		}
	}
	return true, "assistant output passed hygiene validation"
}

// filterArtifactContaminatedAssistantHistory keeps legacy leaked provider
// delimiters from becoming few-shot examples in future requests. User content
// remains untouched because it is intentionally retained as untrusted context.
func filterArtifactContaminatedAssistantHistory(history []*models.BotMessage) []*models.BotMessage {
	filtered := make([]*models.BotMessage, 0, len(history))
	for _, message := range history {
		if message == nil {
			continue
		}
		if message.Role == models.BotMessageRoleAssistant {
			// Failed assistant rows are UI-visible placeholders, not character
			// replies. Feeding them back to a provider pollutes the persona's
			// transcript and can make a temporary failure self-reinforcing.
			if message.Failed {
				continue
			}
			if valid, _ := validateAssistantOutputHygiene(message.Content); !valid {
				continue
			}
		}
		filtered = append(filtered, message)
	}
	return filtered
}

func filterArtifactContaminatedPreviewHistory(history []ChatMessage) []ChatMessage {
	filtered := make([]ChatMessage, 0, len(history))
	for _, message := range history {
		if message.Role == "assistant" {
			if valid, _ := validateAssistantOutputHygiene(message.Content); !valid {
				continue
			}
		}
		filtered = append(filtered, message)
	}
	return filtered
}

func filterArtifactContaminatedGroupHistory(history []*models.OmniChatGroupMessage) []*models.OmniChatGroupMessage {
	filtered := make([]*models.OmniChatGroupMessage, 0, len(history))
	for _, message := range history {
		if message == nil {
			continue
		}
		if message.SenderType == "persona" {
			if valid, _ := validateAssistantOutputHygiene(message.Content); !valid {
				continue
			}
		}
		filtered = append(filtered, message)
	}
	return filtered
}

const assistantHygieneRetryInstruction = `[Provider Output Retry]
Return only the character's final reply. Do not include chat-template delimiters, role labels, hidden reasoning, or comments about generating a response. Re-check and follow the active Platform Response Style's question budget and ending rule exactly. Do not default to a closing question when that style says questions are optional.`

func messagesWithAssistantHygieneRetry(messages []openrouter.Message) []openrouter.Message {
	retryMessages := append([]openrouter.Message(nil), messages...)
	for index := range retryMessages {
		if retryMessages[index].Role == openrouter.RoleSystem {
			retryMessages[index].Content += "\n\n" + assistantHygieneRetryInstruction
			return retryMessages
		}
	}
	return append([]openrouter.Message{{Role: openrouter.RoleSystem, Content: assistantHygieneRetryInstruction}}, retryMessages...)
}
