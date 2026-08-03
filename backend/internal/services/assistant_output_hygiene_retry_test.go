package services

import (
	"testing"

	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

func TestAssistantHygieneRetryReassertsActiveQuestionBudgetWithoutChangingUserContent(t *testing.T) {
	const userContent = "Why do you keep asking what I want to discuss next?"
	messages := []openrouter.Message{
		{Role: openrouter.RoleSystem, Content: "server-owned prompt\n\n" + naturalDialogueQuestionBudgetV1},
		{Role: openrouter.RoleUser, Content: userContent},
	}

	retry := messagesWithAssistantHygieneRetry(messages)

	require.Len(t, retry, 2)
	require.Equal(t, userContent, retry[1].Content)
	require.Contains(t, retry[0].Content, naturalDialogueQuestionBudgetV1)
	require.Contains(t, retry[0].Content, "[Provider Output Retry]")
	require.Contains(t, retry[0].Content, "follow the active Platform Response Style's question budget and ending rule exactly")
	require.Contains(t, retry[0].Content, "Do not default to a closing question when that style says questions are optional")
	require.NotContains(t, messages[0].Content, "[Provider Output Retry]", "retry assembly must not mutate the original prompt")
}
