package services

import (
	"context"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/models"
	zlog "github.com/rs/zerolog/log"
)

// OmniChatUserReader loads the stored account facts an entitlement depends on.
type OmniChatUserReader interface {
	GetByID(ctx context.Context, id int) (*models.User, error)
}

// OmniChatContentEntitlement answers one question for every surface capable of
// producing adult content: may this account see it right now?
//
// Chat and media generation both consult it. Gating one without the other
// leaves the product's promise half kept -- explicit prose beside censored
// images, or the reverse -- and two copies of the rule drift the first time
// only one of them is edited.
type OmniChatContentEntitlement struct {
	users OmniChatUserReader
}

func NewOmniChatContentEntitlement(users OmniChatUserReader) *OmniChatContentEntitlement {
	return &OmniChatContentEntitlement{users: users}
}

// AllowsExplicit reports whether explicit content may be produced for a user.
//
// Two independent conditions, both required. The plan is the entitlement:
// explicit content is premium, and administrators are treated as premium so
// they can reproduce what a paying account sees. users.nsfw is the account's
// own preference, which a subscriber may switch off; the explore feed has
// always honoured it, and chat contradicting the feed would read as a bug.
//
// Every failure path denies. An unset reader, a missing user, or a lookup
// outage must never escalate an account. Denying is also cheap: the request
// still succeeds, it just produces the non-explicit variant.
func (e *OmniChatContentEntitlement) AllowsExplicit(ctx context.Context, userID int) bool {
	if e == nil || e.users == nil || userID <= 0 {
		return false
	}
	user, err := e.users.GetByID(ctx, userID)
	if err != nil {
		zlog.Warn().Err(err).Int("user_id", userID).
			Msg("omnichat: entitlement lookup failed; treating account as standard content")
		return false
	}
	if user == nil || !user.NSFW {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(user.Role), "admin") {
		return true
	}
	// A lapsed subscription is not a subscription. Free and plus never qualify.
	if user.PlanExpiresAt != nil && !user.PlanExpiresAt.After(time.Now()) {
		return false
	}
	return modelTierForStoredPlan(user.Plan) == OmniChatModelTierPremium
}
