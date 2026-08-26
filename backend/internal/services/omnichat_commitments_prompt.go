package services

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/omninudge/backend/internal/models"
	zlog "github.com/rs/zerolog/log"
)

const omniChatCommitmentsMaxRunes = 600

const omniChatCommitmentLookupTimeout = 2 * time.Second

// loadOutstandingCommitments is what these two still owe each other.
//
// Unlike recall this is not cued by anything. A memory surfaces because
// something reminded her of it; an unkept promise is not waiting to be reminded
// of, it is simply outstanding, and a character who only remembers she is owed
// something when you happen to mention it is not holding you to anything.
func (s *ChatbotService) loadOutstandingCommitments(
	ctx context.Context, persona *models.BotPersona, userID int,
) []*models.OmniChatCommitment {
	if s == nil || s.commitments == nil || persona == nil || userID < 1 {
		return nil
	}
	lookupCtx, cancel := context.WithTimeout(ctx, omniChatCommitmentLookupTimeout)
	defer cancel()

	commitments, err := s.commitments.Outstanding(lookupCtx, persona.ID, userID, models.OmniChatMaxOpenCommitments)
	if err != nil {
		// Generating without them is a character who forgot a promise. Failing
		// the turn is a character who stopped talking, which is worse.
		zlog.Warn().Err(err).Int("persona_id", persona.ID).
			Msg("omnichat commitment: outstanding unavailable, generating without it")
		return nil
	}
	return commitments
}

// renderOutstandingCommitments writes what is owed in each direction.
//
// Split by direction rather than listed flat, because the two mean opposite
// things and a character who confuses them is worse than one who mentions
// neither: being chased for something you are actually owed is a specific and
// memorable kind of infuriating.
//
// It says nothing about what to do with them. A person carrying an unkept
// promise does not raise it every time they speak -- sometimes it colours the
// tone and never gets mentioned, sometimes it comes out weeks later. Telling
// her to bring them up would produce a character who does nothing else.
func renderOutstandingCommitments(commitments []*models.OmniChatCommitment) string {
	if len(commitments) == 0 {
		return ""
	}

	var hers, theirs []string
	for _, commitment := range commitments {
		if commitment == nil || strings.TrimSpace(commitment.Summary) == "" {
			continue
		}
		line := "- " + strings.TrimSpace(commitment.Summary)
		if commitment.IsHers() {
			hers = append(hers, line)
		} else {
			theirs = append(theirs, line)
		}
	}
	if len(hers) == 0 && len(theirs) == 0 {
		return ""
	}

	var builder strings.Builder
	builder.WriteString("\n\n[Still Outstanding]\n")
	builder.WriteString("Things between you and this person that are not settled. ")
	builder.WriteString("They are not instructions and not a list to work through: ")
	builder.WriteString("let them sit where a person's would, and raise one only if it would come up naturally.\n")

	remaining := omniChatCommitmentsMaxRunes
	writeSection := func(heading string, lines []string) {
		if len(lines) == 0 {
			return
		}
		if cost := utf8.RuneCountInString(heading); cost <= remaining {
			builder.WriteString(heading)
			remaining -= cost
		}
		for _, line := range lines {
			cost := utf8.RuneCountInString(line) + 1
			if cost > remaining {
				continue
			}
			builder.WriteString(line + "\n")
			remaining -= cost
		}
	}

	writeSection("You said you would:\n", hers)
	writeSection("They said they would:\n", theirs)

	return strings.TrimRight(builder.String(), "\n")
}
