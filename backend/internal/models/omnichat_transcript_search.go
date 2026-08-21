package models

import (
	"context"
	"fmt"
	"strings"
)

// SearchOlderThan finds messages in a conversation that bear on a cue and are
// older than the turns already in front of the character.
//
// The `beforeID` bound is what makes this worth doing rather than duplicating
// the context window. She already holds the most recent turns verbatim; a
// search that returned those would spend prompt budget telling her what she can
// already see. This covers precisely what the window does not reach.
//
// The tsquery ORs the cue's lexemes rather than using plainto_tsquery, which
// ANDs them -- a conversational cue like "do you remember what you said about my
// hands" would then require every one of those words in a single message and
// match nothing. The same construction is used by memory recall, for the same
// reason.
func (r *BotMessageRepository) SearchOlderThan(
	ctx context.Context, conversationID, beforeID int, cue string, limit int,
) ([]*BotMessage, error) {
	if conversationID < 1 || beforeID < 1 || strings.TrimSpace(cue) == "" {
		return nil, nil
	}
	if limit < 1 || limit > 20 {
		limit = 4
	}

	rows, err := r.pool.Query(ctx, `
		WITH cue_query AS (
			SELECT NULLIF(
				array_to_string(ARRAY(
					SELECT lexeme FROM unnest(to_tsvector('english', $3::text))
				), ' | '),
				''
			)::tsquery AS tsq
		)
		SELECT m.id, m.conversation_id, m.role, m.content, m.failed, m.created_at
		FROM bot_messages m, cue_query q
		WHERE m.conversation_id = $1
		  AND m.id < $2
		  AND NOT m.failed
		  AND q.tsq IS NOT NULL
		  AND to_tsvector('english', m.content) @@ q.tsq
		ORDER BY ts_rank_cd(to_tsvector('english', m.content), q.tsq) DESC, m.id DESC
		LIMIT $4
	`, conversationID, beforeID, cue, limit)
	if err != nil {
		return nil, fmt.Errorf("omnichat transcript: search: %w", err)
	}
	defer rows.Close()

	messages := []*BotMessage{}
	for rows.Next() {
		message := &BotMessage{}
		if err := rows.Scan(
			&message.ID, &message.ConversationID, &message.Role,
			&message.Content, &message.Failed, &message.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("omnichat transcript: scan: %w", err)
		}
		messages = append(messages, message)
	}
	return messages, rows.Err()
}
