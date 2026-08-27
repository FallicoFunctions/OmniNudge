package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

// Who may make a character, and how many.
//
// This resolver had no test of its own. It was exercised only through a handler,
// which meant the admin override, the lapsed subscription and the unrecognised
// plan were all asserted by nothing -- and the number it returns is now the
// difference between a paid feature and a free one.

type creationLimitsUserFake struct {
	user *models.User
	err  error
}

func (f *creationLimitsUserFake) GetByID(context.Context, int) (*models.User, error) {
	return f.user, f.err
}

func roleplayLimitFor(t *testing.T, user *models.User, err error) int {
	t.Helper()
	return NewOmniChatCreationLimits(&creationLimitsUserFake{user: user, err: err}).
		RoleplayLimit(context.Background(), 7)
}

func TestWritingCharactersIsAPaidFeature(t *testing.T) {
	// Zero is not a small allowance. A free account cannot make one at all, of
	// either kind: an independent character needs premium on top of this, which
	// the creator's own entitlement check enforces separately.
	require.Equal(t, 0, roleplayLimitFor(t, &models.User{Plan: models.PlanFree}, nil))
	require.Equal(t, 5, roleplayLimitFor(t, &models.User{Plan: models.PlanPlus}, nil))
	require.Equal(t, 10, roleplayLimitFor(t, &models.User{Plan: models.PlanPremium}, nil))
}

func TestTheOfferedNumbersAreTheEnforcedOnes(t *testing.T) {
	// The interface reads this table to say what each tier gets. If it could
	// differ from what the resolver returns, somebody would be sold a number
	// nobody enforces.
	offered := OmniChatRoleplayLimits()

	for plan, limit := range offered {
		require.Equal(t, limit, roleplayLimitFor(t, &models.User{Plan: plan}, nil), "plan %q", plan)
	}
	require.Equal(t, 0, offered[models.PlanFree])
}

func TestEveryFailurePathRefuses(t *testing.T) {
	// The same rule the IAI entitlement applies. Somebody briefly told to
	// upgrade can try again; a character handed out by mistake cannot be taken
	// back.
	require.Equal(t, 0, roleplayLimitFor(t, nil, errors.New("database is down")))
	require.Equal(t, 0, roleplayLimitFor(t, nil, nil), "no such account")
	require.Equal(t, 0, (*OmniChatCreationLimits)(nil).RoleplayLimit(context.Background(), 7),
		"an unwired resolver denies rather than allowing everything")
	require.Equal(t, 0, NewOmniChatCreationLimits(nil).RoleplayLimit(context.Background(), 7))

	limits := NewOmniChatCreationLimits(&creationLimitsUserFake{user: &models.User{Plan: models.PlanPremium}})
	require.Equal(t, 0, limits.RoleplayLimit(context.Background(), 0), "no user is not a user")
}

func TestAnUnrecognisedPlanIsNotAWayToGetMore(t *testing.T) {
	require.Equal(t, 0, roleplayLimitFor(t, &models.User{Plan: "enterprise"}, nil))
	require.Equal(t, 0, roleplayLimitFor(t, &models.User{Plan: ""}, nil))
}

func TestALapsedSubscriptionIsNotASubscription(t *testing.T) {
	// Same rule the content entitlement applies, so a plan column left behind by
	// a cancelled subscription does not keep paying out.
	expired := time.Now().Add(-time.Hour)
	require.Equal(t, 0, roleplayLimitFor(t,
		&models.User{Plan: models.PlanPremium, PlanExpiresAt: &expired}, nil))

	current := time.Now().Add(time.Hour)
	require.Equal(t, 10, roleplayLimitFor(t,
		&models.User{Plan: models.PlanPremium, PlanExpiresAt: &current}, nil))
}

func TestAnAdminIsNotLockedOutOfTheirOwnProduct(t *testing.T) {
	require.Equal(t, 10, roleplayLimitFor(t, &models.User{Plan: models.PlanFree, Role: "admin"}, nil))
	require.Equal(t, 10, roleplayLimitFor(t, &models.User{Plan: models.PlanFree, Role: " Admin "}, nil))
}

func TestTheTableHandedOutIsACopy(t *testing.T) {
	OmniChatRoleplayLimits()[models.PlanPremium] = 9999

	require.Equal(t, 10, OmniChatRoleplayLimits()[models.PlanPremium])
	require.Equal(t, 10, roleplayLimitFor(t, &models.User{Plan: models.PlanPremium}, nil))
}

func TestThePlanNamedIsThePlanEnforced(t *testing.T) {
	// The endpoint tells the interface which plan an independent character
	// needs, and the creator checks a model tier. Those are two different things
	// that happen to correspond, so something has to hold them together -- other
	// than a comment claiming they cannot drift.
	required := OmniChatIAIRequiredPlan()

	require.Equal(t, models.PlanPremium, required)
	require.Equal(t, omniChatIAIRequiredTier, modelTierForStoredPlan(required),
		"the plan shown to somebody must be one the entitlement actually accepts")

	for _, refused := range []string{models.PlanPlus, models.PlanFree, "", "enterprise"} {
		require.NotEqual(t, omniChatIAIRequiredTier, modelTierForStoredPlan(refused),
			"plan %q must not satisfy the independent-character tier", refused)
	}
}
