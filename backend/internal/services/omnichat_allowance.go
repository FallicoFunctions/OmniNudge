package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
)

const (
	OmniChatGuestReplyLimit = 30
	OmniChatFreeReplyLimit  = 250
	OmniChatAllowanceWindow = 24 * time.Hour

	OmniChatAllowanceTierGuest = "guest"
	OmniChatAllowanceTierFree  = "free"
	OmniChatAllowanceTierPaid  = "paid"
)

type OmniChatAllowanceState struct {
	Tier            string     `json:"tier"`
	Allowed         bool       `json:"allowed"`
	Unlimited       bool       `json:"unlimited"`
	Limit           int        `json:"limit,omitempty"`
	Used            int        `json:"used,omitempty"`
	Remaining       int        `json:"remaining,omitempty"`
	ResetAt         *time.Time `json:"reset_at,omitempty"`
	WindowSeconds   int64      `json:"window_seconds,omitempty"`
	PaidWithCredits bool       `json:"paid_with_credits,omitempty"`
	CreditCost      int64      `json:"credit_cost,omitempty"`
	CreditsRequired bool       `json:"credits_required,omitempty"`
}

type OmniChatAllowanceLease struct {
	State     OmniChatAllowanceState
	key       string
	memberIDs []string
	userID    int
	creditOps []uuid.UUID
}

type OmniChatAllowanceBilling interface {
	ReserveOwned(context.Context, int, uuid.UUID, string) (*models.OmniCreditsUsageReservation, error)
	CaptureOwned(context.Context, int, uuid.UUID) error
	RefundOwned(context.Context, int, uuid.UUID) error
}

type OmniChatAllowance struct {
	store       RollingWindowStore
	plans       OmniChatPlanReader
	billing     OmniChatAllowanceBilling
	adminReader OmniChatAdminReader
	now         func() time.Time
}

func NewOmniChatAllowance(cache Cache, plans OmniChatPlanReader) *OmniChatAllowance {
	store, _ := cache.(RollingWindowStore)
	return &OmniChatAllowance{store: store, plans: plans, now: time.Now}
}

func (a *OmniChatAllowance) SetBilling(billing OmniChatAllowanceBilling) *OmniChatAllowance {
	a.billing = billing
	return a
}

// SetAdminReader makes the rolling allowance unlimited for persisted admin
// accounts. The check happens before Redis access so administrators are not
// blocked when the free-tier allowance store is unavailable.
func (a *OmniChatAllowance) SetAdminReader(reader OmniChatAdminReader) *OmniChatAllowance {
	a.adminReader = reader
	return a
}

func (a *OmniChatAllowance) Reserve(ctx context.Context, userID *int, guestIP string, count int) (*OmniChatAllowanceLease, error) {
	if count < 1 {
		return nil, errors.New("allowance reservation count must be positive")
	}
	subject, err := a.subject(ctx, userID, guestIP)
	if err != nil {
		return nil, err
	}
	if subject.unlimited {
		return &OmniChatAllowanceLease{State: unlimitedAllowanceState()}, nil
	}
	if a.store == nil {
		return nil, errors.New("rolling allowance storage is unavailable")
	}
	members := make([]string, count)
	for index := range members {
		members[index] = uuid.NewString()
	}
	now := a.now().UTC()
	snapshot, err := a.store.ReserveRollingWindow(ctx, subject.key, members, now, OmniChatAllowanceWindow, subject.limit)
	if err != nil {
		return nil, fmt.Errorf("reserve OmniChat allowance: %w", err)
	}
	state := allowanceState(subject.tier, subject.limit, snapshot, now)
	lease := &OmniChatAllowanceLease{State: state}
	if snapshot.Allowed {
		lease.key = subject.key
		lease.memberIDs = members
		return lease, nil
	}
	if userID == nil || a.billing == nil {
		return lease, nil
	}

	lease.userID = *userID
	lease.creditOps = make([]uuid.UUID, 0, count)
	var totalCost int64
	for range count {
		operationID := uuid.New()
		reservation, reserveErr := a.billing.ReserveOwned(ctx, *userID, operationID, models.OmniCreditsUsageChat)
		if reserveErr != nil {
			refundErr := a.refundCreditOps(ctx, *userID, lease.creditOps)
			lease.creditOps = nil
			if errors.Is(reserveErr, models.ErrOmniCreditsInsufficient) {
				lease.State.CreditsRequired = true
				if refundErr != nil {
					return nil, errors.Join(reserveErr, refundErr)
				}
				return lease, nil
			}
			return nil, errors.Join(fmt.Errorf("reserve OmniChat overage credits: %w", reserveErr), refundErr)
		}
		lease.creditOps = append(lease.creditOps, operationID)
		totalCost += reservation.Cost
	}
	lease.State.Allowed = true
	lease.State.PaidWithCredits = true
	lease.State.CreditCost = totalCost
	return lease, nil
}

func (a *OmniChatAllowance) Status(ctx context.Context, userID *int, guestIP string) (OmniChatAllowanceState, error) {
	subject, err := a.subject(ctx, userID, guestIP)
	if err != nil {
		return OmniChatAllowanceState{}, err
	}
	if subject.unlimited {
		return unlimitedAllowanceState(), nil
	}
	if a.store == nil {
		return OmniChatAllowanceState{}, errors.New("rolling allowance storage is unavailable")
	}
	now := a.now().UTC()
	snapshot, err := a.store.InspectRollingWindow(ctx, subject.key, now, OmniChatAllowanceWindow)
	if err != nil {
		return OmniChatAllowanceState{}, fmt.Errorf("inspect OmniChat allowance: %w", err)
	}
	snapshot.Allowed = snapshot.Used < subject.limit
	return allowanceState(subject.tier, subject.limit, snapshot, now), nil
}

// Commit keeps successful reservations and refunds every unused or failed one.
func (a *OmniChatAllowance) Commit(ctx context.Context, lease *OmniChatAllowanceLease, successfulReplies int) error {
	if lease == nil || lease.State.Unlimited {
		return nil
	}
	reservedCount := len(lease.memberIDs)
	if len(lease.creditOps) > reservedCount {
		reservedCount = len(lease.creditOps)
	}
	if successfulReplies < 0 || successfulReplies > reservedCount {
		return errors.New("successful reply count exceeds allowance reservation")
	}
	if len(lease.creditOps) > 0 {
		var transitionErrors []error
		for index, operationID := range lease.creditOps {
			var err error
			action := "refund"
			if index < successfulReplies {
				action = "capture"
				err = a.billing.CaptureOwned(ctx, lease.userID, operationID)
			} else {
				err = a.billing.RefundOwned(ctx, lease.userID, operationID)
			}
			if err != nil {
				transitionErrors = append(transitionErrors, fmt.Errorf(
					"%s OmniChat allowance credits for user_id=%d operation_id=%s: %w",
					action, lease.userID, operationID, err,
				))
			}
		}
		return errors.Join(transitionErrors...)
	}
	if len(lease.memberIDs) == 0 {
		return nil
	}
	if successfulReplies == len(lease.memberIDs) {
		return nil
	}
	if a.store == nil {
		return errors.New("rolling allowance storage is unavailable")
	}
	if err := a.store.ReleaseRollingWindow(ctx, lease.key, lease.memberIDs[successfulReplies:]); err != nil {
		return fmt.Errorf("release OmniChat allowance: %w", err)
	}
	return nil
}

func (a *OmniChatAllowance) refundCreditOps(ctx context.Context, userID int, operationIDs []uuid.UUID) error {
	if a.billing == nil {
		return nil
	}
	var refundErrors []error
	for _, operationID := range operationIDs {
		if err := a.billing.RefundOwned(ctx, userID, operationID); err != nil {
			refundErrors = append(refundErrors, err)
		}
	}
	return errors.Join(refundErrors...)
}

type omniChatAllowanceSubject struct {
	tier      string
	key       string
	limit     int
	unlimited bool
}

func (a *OmniChatAllowance) subject(ctx context.Context, userID *int, guestIP string) (omniChatAllowanceSubject, error) {
	if userID == nil {
		guestIP = strings.TrimSpace(guestIP)
		if guestIP == "" {
			return omniChatAllowanceSubject{}, errors.New("guest network identity is unavailable")
		}
		digest := sha256.Sum256([]byte(guestIP))
		return omniChatAllowanceSubject{
			tier:  OmniChatAllowanceTierGuest,
			key:   "allowance:omnichat:guest:" + hex.EncodeToString(digest[:]),
			limit: OmniChatGuestReplyLimit,
		}, nil
	}
	if *userID <= 0 {
		return omniChatAllowanceSubject{}, errors.New("registered allowance plan lookup is unavailable")
	}
	admin, err := isOmniChatAdmin(ctx, a.adminReader, *userID)
	if err != nil {
		return omniChatAllowanceSubject{}, fmt.Errorf("load allowance administrator entitlement: %w", err)
	}
	if admin {
		return omniChatAllowanceSubject{tier: OmniChatAllowanceTierPaid, unlimited: true}, nil
	}
	if a.plans == nil {
		return omniChatAllowanceSubject{}, errors.New("registered allowance plan lookup is unavailable")
	}
	plan, expiresAt, err := a.plans.GetPlan(ctx, *userID)
	if err != nil {
		return omniChatAllowanceSubject{}, fmt.Errorf("load allowance plan: %w", err)
	}
	paid := modelTierForStoredPlan(plan) != OmniChatModelTierFree
	if expiresAt != nil && !expiresAt.After(a.now()) {
		paid = false
	}
	if paid {
		return omniChatAllowanceSubject{tier: OmniChatAllowanceTierPaid, unlimited: true}, nil
	}
	return omniChatAllowanceSubject{
		tier:  OmniChatAllowanceTierFree,
		key:   fmt.Sprintf("allowance:omnichat:user:%d", *userID),
		limit: OmniChatFreeReplyLimit,
	}, nil
}

func allowanceState(tier string, limit int, snapshot RollingWindowSnapshot, now time.Time) OmniChatAllowanceState {
	remaining := limit - snapshot.Used
	if remaining < 0 {
		remaining = 0
	}
	var resetAt *time.Time
	if snapshot.OldestAt != nil {
		value := snapshot.OldestAt.Add(OmniChatAllowanceWindow)
		if value.After(now) {
			resetAt = &value
		}
	}
	return OmniChatAllowanceState{
		Tier:          tier,
		Allowed:       snapshot.Allowed,
		Limit:         limit,
		Used:          snapshot.Used,
		Remaining:     remaining,
		ResetAt:       resetAt,
		WindowSeconds: int64(OmniChatAllowanceWindow / time.Second),
	}
}

func unlimitedAllowanceState() OmniChatAllowanceState {
	return OmniChatAllowanceState{Tier: OmniChatAllowanceTierPaid, Allowed: true, Unlimited: true}
}
