package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var (
	ErrAdminUserPermission = errors.New("insufficient permission to manage this user")
	ErrSubscriptionBusy    = errors.New("subscription has pending requests; retry after they finish")
	ErrSubscriptionChanged = errors.New("subscription changed; refresh before saving")
)

// AdminSubscriptionState is a read-only, batched projection of the current ledger.
type AdminSubscriptionState struct {
	SubscriptionID    int    `json:"subscription_id"`
	PlanID            int    `json:"plan_id"`
	PlanTitle         string `json:"plan_title"`
	Source            string `json:"source"`
	Group             string `json:"group"`
	PeriodTotal       int64  `json:"period_total"`
	PeriodRemaining   int64  `json:"period_remaining"`
	FiveHourTotal     int64  `json:"five_hour_total"`
	FiveHourRemaining int64  `json:"five_hour_remaining"`
	EndTime           int64  `json:"end_time"`
	Version           int64  `json:"version"`
}

func GetAdminUserSubscriptionStates(userIDs []int) (map[int]*AdminSubscriptionState, error) {
	result := make(map[int]*AdminSubscriptionState, len(userIDs))
	if len(userIDs) == 0 {
		return result, nil
	}
	now := GetDBTimestamp()
	var subscriptions []UserSubscription
	if err := DB.Where("user_id IN ? AND status = ? AND end_time > ?", userIDs, "active", now).Order("id desc").Find(&subscriptions).Error; err != nil {
		return nil, err
	}
	planIDs := make([]int, 0, len(subscriptions))
	windowIDs := make([]int, 0, len(subscriptions)*2)
	for _, sub := range subscriptions {
		planIDs = append(planIDs, sub.PlanId)
		if sub.CurrentPeriodWindowId > 0 {
			windowIDs = append(windowIDs, sub.CurrentPeriodWindowId)
		}
		if sub.CurrentFiveHourWindowId > 0 {
			windowIDs = append(windowIDs, sub.CurrentFiveHourWindowId)
		}
	}
	var plans []SubscriptionPlan
	if len(planIDs) > 0 {
		if err := DB.Where("id IN ?", planIDs).Find(&plans).Error; err != nil {
			return nil, err
		}
	}
	titles := make(map[int]string, len(plans))
	for _, plan := range plans {
		titles[plan.Id] = plan.Title
	}
	var windows []SubscriptionQuotaWindow
	if len(windowIDs) > 0 {
		if err := DB.Where("id IN ?", windowIDs).Find(&windows).Error; err != nil {
			return nil, err
		}
	}
	byID := make(map[int]SubscriptionQuotaWindow, len(windows))
	for _, window := range windows {
		byID[window.Id] = window
	}
	for _, sub := range subscriptions {
		if result[sub.UserId] != nil {
			continue
		}
		periodUsed := sub.AmountUsed
		if window, ok := byID[sub.CurrentPeriodWindowId]; ok && window.UserSubscriptionId == sub.Id {
			periodUsed = window.AmountUsed
		}
		if sub.NextResetTime > 0 && sub.NextResetTime <= now {
			periodUsed = 0
		}
		fiveHourUsed := int64(0)
		if window, ok := byID[sub.CurrentFiveHourWindowId]; ok && window.UserSubscriptionId == sub.Id && window.EndTime > now && window.ClosedAt == 0 {
			fiveHourUsed = window.AmountUsed
		}
		result[sub.UserId] = &AdminSubscriptionState{
			SubscriptionID: sub.Id, PlanID: sub.PlanId, PlanTitle: titles[sub.PlanId], Source: sub.Source, Group: sub.UpgradeGroup,
			PeriodTotal: sub.AmountTotal, PeriodRemaining: max(0, sub.AmountTotal-periodUsed),
			FiveHourTotal: sub.FiveHourQuota, FiveHourRemaining: max(0, sub.FiveHourQuota-fiveHourUsed),
			EndTime: sub.EndTime, Version: sub.QuotaWindowVersion,
		}
	}
	return result, nil
}

type AdminSubscriptionChange struct {
	Action            string `json:"action"`
	SubscriptionID    int    `json:"subscription_id"`
	ExpectedVersion   int64  `json:"expected_version"`
	PlanID            int    `json:"plan_id"`
	PeriodRemaining   *int64 `json:"period_remaining"`
	FiveHourRemaining *int64 `json:"five_hour_remaining"`
}

// ChangeAdminUserSubscription does not charge the wallet or change an existing
// subscription's expiry. A Free user receives the selected plan's normal term.
func ChangeAdminUserSubscription(operatorID, userID int, change AdminSubscriptionChange) error {
	if operatorID <= 0 || userID <= 0 || change.SubscriptionID < 0 || change.ExpectedVersion < 0 {
		return errors.New("invalid subscription change")
	}
	if change.Action != "balance" && change.Action != "plan" && change.Action != "free" {
		return errors.New("invalid subscription action")
	}
	if change.Action == "balance" && change.PeriodRemaining == nil && change.FiveHourRemaining == nil {
		return errors.New("no balances specified")
	}
	for _, value := range []*int64{change.PeriodRemaining, change.FiveHourRemaining} {
		if value != nil {
			if err := validateSubscriptionQuotaValue("remaining quota", *value, true); err != nil {
				return err
			}
		}
	}
	err := runSubscriptionQuotaTransaction(func(tx *gorm.DB) error {
		var operator User
		if err := tx.Select("id", "role", "status").First(&operator, operatorID).Error; err != nil {
			return err
		}
		var user User
		if err := lockForUpdate(tx).Select("id", "role", "group").First(&user, userID).Error; err != nil {
			return err
		}
		if operator.Status != common.UserStatusEnabled || operator.Role < common.RoleAdminUser || (operator.Role != common.RoleRootUser && operator.Role <= user.Role) {
			return ErrAdminUserPermission
		}
		now := getSubscriptionDBTimestampTx(tx)
		selection, err := loadActiveSubscriptionSelectionTx(tx, userID, now, true)
		if err != nil {
			return err
		}
		sub := selection.Current
		if (sub == nil && change.SubscriptionID != 0) || (sub != nil && (sub.Id != change.SubscriptionID || sub.QuotaWindowVersion != change.ExpectedVersion)) {
			return ErrSubscriptionChanged
		}
		var pending int64
		if err := tx.Model(&SubscriptionPreConsumeRecord{}).Where("user_id = ? AND status IN ?", userID, []string{SubscriptionUsageStateReserved, "pre_consumed"}).Count(&pending).Error; err != nil {
			return err
		}
		if pending > 0 {
			return ErrSubscriptionBusy
		}
		switch change.Action {
		case "plan":
			plan, err := getSubscriptionPlanByIdTx(tx, change.PlanID)
			if err != nil {
				return err
			}
			if !plan.Enabled || strings.TrimSpace(plan.UpgradeGroup) == "" {
				return errors.New("select an enabled plan with a user group")
			}
			if sub != nil && sub.PlanId == plan.Id {
				return errors.New("user already has this plan")
			}
			// Purchase caps apply to checkout, not an explicit administrator assignment.
			assignedPlan := *plan
			assignedPlan.MaxPurchasePerUser = 0
			_, err = CreateUserSubscriptionFromPlanTx(tx, userID, &assignedPlan, "admin")
			return err
		case "free":
			for index := range selection.Subscriptions {
				current := &selection.Subscriptions[index]
				for _, pair := range []struct {
					id   int
					kind string
				}{{current.CurrentPeriodWindowId, SubscriptionQuotaWindowPeriod}, {current.CurrentFiveHourWindowId, SubscriptionQuotaWindowFiveHour}} {
					window, err := loadSubscriptionQuotaWindowTx(tx, pair.id, current.Id, pair.kind)
					if err != nil {
						return err
					}
					if err := closeSubscriptionQuotaWindowTx(tx, window, now); err != nil {
						return err
					}
				}
				if err := tx.Model(current).Updates(map[string]interface{}{"status": "cancelled", "end_time": now, "updated_at": now}).Error; err != nil {
					return err
				}
			}
			return tx.Model(&User{}).Where("id = ?", userID).Updates(map[string]interface{}{"group": "Free", "group_restore": "", "group_expires_at": 0}).Error
		case "balance":
			if sub == nil {
				return ErrNoActiveSubscription
			}
			plan, err := getSubscriptionPlanByIdTx(tx, sub.PlanId)
			if err != nil {
				return err
			}
			if err := maybeResetUserSubscriptionWithPlanTx(tx, sub, plan, now); err != nil {
				return err
			}
			if change.PeriodRemaining != nil {
				if sub.AmountTotal <= 0 || *change.PeriodRemaining > sub.AmountTotal {
					return errors.New("period balance must be within the plan limit")
				}
				window, err := ensurePeriodQuotaWindowTx(tx, sub, now)
				if err != nil {
					return err
				}
				sub.AmountUsed = sub.AmountTotal - *change.PeriodRemaining
				if err := updateSubscriptionQuotaWindowUsageTx(tx, window, sub.AmountUsed, now); err != nil {
					return err
				}
			}
			if change.FiveHourRemaining != nil {
				if sub.FiveHourQuota <= 0 || *change.FiveHourRemaining > sub.FiveHourQuota {
					return errors.New("five-hour balance must be within the plan limit")
				}
				window, expired, err := prepareFiveHourQuotaWindowTx(tx, sub, now)
				if err != nil {
					return err
				}
				if window == nil && *change.FiveHourRemaining < sub.FiveHourQuota {
					window, err = createFiveHourQuotaWindowTx(tx, sub, expired, now)
					if err != nil {
						return err
					}
				}
				if window != nil {
					if err := updateSubscriptionQuotaWindowUsageTx(tx, window, sub.FiveHourQuota-*change.FiveHourRemaining, now); err != nil {
						return err
					}
				}
			}
			return saveSubscriptionWindowStateTx(tx, sub, now)
		}
		return nil
	})
	if err == nil {
		if cacheErr := InvalidateUserCache(userID); cacheErr != nil {
			common.SysError(cacheErr.Error())
		}
		if cacheErr := InvalidateUserTokensCache(userID); cacheErr != nil {
			common.SysError(cacheErr.Error())
		}
	}
	return err
}
