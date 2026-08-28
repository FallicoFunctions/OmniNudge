package services

import (
	"context"
	"strings"
	"time"

	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/models"
)

// How many characters one account may have.
//
// Two different limits for two different reasons. A roleplay character is a
// part somebody wrote, and how many parts they may keep is a tier benefit. An
// IAI is a person, and the limit there is not about generosity: keeping one
// alive is what makes her relationship, her memory and her drift mean anything.
// Somebody cycling through twenty of them is not living with any of them.

// OmniChatIAILimit is one, on every tier that has access at all.
//
// Deleting her is how you make another, and that is deliberately a decision
// rather than a slot freeing up. §16 covers what deletion actually takes with
// it.
const OmniChatIAILimit = 1

// OmniChatIAIAdminLimit is the exception, and not unlimited for its own sake:
// an admin is the only account that has to be able to make a second one to see
// what the second one does.
const OmniChatIAIAdminLimit = 1000

// omniChatRoleplayLimits is how many roleplay characters a plan may own.
//
// A table, so changing the offer is a row rather than a branch. The taper is a
// product decision rather than a technical one -- these numbers are a starting
// position, not a finding.
//
// Free is zero, and zero is not a small allowance: making a character is a paid
// feature outright. An independent one needs premium, which entitled() enforces
// separately, so the two kinds are gated at different heights on purpose.
var omniChatRoleplayLimits = map[string]int{
	models.PlanPremium: 10,
	models.PlanPlus:    5,
	models.PlanFree:    0,
}

// omniChatDefaultRoleplayLimit applies to a plan nobody has listed, and to any
// lookup that fails. Zero, so an unrecognised plan and a database outage both
// refuse rather than hand out something nobody paid for.
const omniChatDefaultRoleplayLimit = 0

// OmniChatCreationLimits answers how many of each kind an account may own.
type OmniChatCreationLimits struct {
	users OmniChatUserReader
}

func NewOmniChatCreationLimits(users OmniChatUserReader) *OmniChatCreationLimits {
	return &OmniChatCreationLimits{users: users}
}

// RoleplayLimit is how many roleplay characters this account may keep.
//
// A lookup failure returns zero rather than the highest limit. Somebody briefly
// told to upgrade can try again; the other way hands out characters nobody paid
// for and there is no taking them back. It is the same rule the IAI entitlement
// applies: every failure path denies.
func (l *OmniChatCreationLimits) RoleplayLimit(ctx context.Context, userID int) int {
	if l == nil || l.users == nil || userID <= 0 {
		return omniChatDefaultRoleplayLimit
	}
	user, err := l.users.GetByID(ctx, userID)
	if err != nil {
		zlog.Warn().Err(err).Int("user_id", userID).
			Msg("omnichat: plan lookup failed; applying the lowest creation limit")
		return omniChatDefaultRoleplayLimit
	}
	if user == nil {
		return omniChatDefaultRoleplayLimit
	}
	if strings.EqualFold(strings.TrimSpace(user.Role), "admin") {
		return omniChatRoleplayLimits[models.PlanPremium]
	}
	// A lapsed subscription is not a subscription, which is the same rule the
	// content entitlement applies.
	if user.PlanExpiresAt != nil && !user.PlanExpiresAt.After(time.Now()) {
		return omniChatDefaultRoleplayLimit
	}
	if limit, listed := omniChatRoleplayLimits[strings.TrimSpace(strings.ToLower(user.Plan))]; listed {
		return limit
	}
	return omniChatDefaultRoleplayLimit
}

// IAILimit is how many independent characters this account may keep.
//
// One for everybody who has access at all, and that is the rule rather than a
// shortage: keeping one alive is what makes her memory and her drift mean
// anything. An admin is the exception, because an admin is the only account
// that has to be able to make a second one to see what a second one does.
//
// The creator works the same number out from its own lookup, since it needs the
// entitlement from the same read. A test holds the two together rather than a
// comment claiming they agree.
func (l *OmniChatCreationLimits) IAILimit(ctx context.Context, userID int) int {
	if l == nil || l.users == nil || userID <= 0 {
		return OmniChatIAILimit
	}
	user, err := l.users.GetByID(ctx, userID)
	if err != nil || user == nil {
		// The count is not an entitlement -- the creator refuses separately --
		// so a lookup failure reports the ordinary number rather than denying.
		return OmniChatIAILimit
	}
	if strings.EqualFold(strings.TrimSpace(user.Role), "admin") {
		return OmniChatIAIAdminLimit
	}
	return OmniChatIAILimit
}

// OmniChatRoleplayLimits exposes the table so the interface can say what each
// tier gets without keeping its own copy of the numbers.
func OmniChatRoleplayLimits() map[string]int {
	listed := make(map[string]int, len(omniChatRoleplayLimits))
	for plan, limit := range omniChatRoleplayLimits {
		listed[plan] = limit
	}
	return listed
}
