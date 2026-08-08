package model

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"gorm.io/gorm"
)

const (
	RedemptionTypeQuota = "quota"
	RedemptionTypeGroup = "group"
)

type Redemption struct {
	Id                   int            `json:"id"`
	UserId               int            `json:"user_id"`
	Key                  string         `json:"key" gorm:"type:char(32);uniqueIndex"`
	Status               int            `json:"status" gorm:"default:1"`
	Name                 string         `json:"name" gorm:"index"`
	Quota                int            `json:"quota" gorm:"default:100"`
	Type                 string         `json:"type" gorm:"type:varchar(16);column:type"`
	GroupName            string         `json:"group_name" gorm:"type:varchar(64);column:group_name"`
	GroupDurationMinutes int64          `json:"group_duration_minutes" gorm:"column:group_duration_minutes"`
	CreatedTime          int64          `json:"created_time" gorm:"bigint"`
	RedeemedTime         int64          `json:"redeemed_time" gorm:"bigint"`
	Count                int            `json:"count" gorm:"-:all"`
	UsedUserId           int            `json:"used_user_id"`
	DeletedAt            gorm.DeletedAt `gorm:"index"`
	ExpiredTime          int64          `json:"expired_time" gorm:"bigint"`
}

type RedemptionResult struct {
	Type           string `json:"type"`
	Quota          int    `json:"quota"`
	GroupName      string `json:"group_name,omitempty"`
	GroupExpiresAt int64  `json:"group_expires_at,omitempty"`
}

func GetAllRedemptions(startIdx int, num int) (redemptions []*Redemption, total int64, err error) {
	query := DB.Model(&Redemption{})
	if err = query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&redemptions).Error
	return redemptions, total, err
}

func SearchRedemptions(keyword string, status string, startIdx int, num int) (redemptions []*Redemption, total int64, err error) {
	query := DB.Model(&Redemption{})
	if keyword != "" {
		if id, parseErr := strconv.Atoi(keyword); parseErr == nil {
			query = query.Where("id = ? OR name LIKE ?", id, keyword+"%")
		} else {
			query = query.Where("name LIKE ?", keyword+"%")
		}
	}
	if status != "" {
		now := common.GetTimestamp()
		switch status {
		case "expired":
			query = query.Where("status = ? AND expired_time != 0 AND expired_time < ?", common.RedemptionCodeStatusEnabled, now)
		case strconv.Itoa(common.RedemptionCodeStatusEnabled):
			query = query.Where("status = ? AND (expired_time = 0 OR expired_time >= ?)", common.RedemptionCodeStatusEnabled, now)
		case strconv.Itoa(common.RedemptionCodeStatusDisabled):
			query = query.Where("status = ?", common.RedemptionCodeStatusDisabled)
		case strconv.Itoa(common.RedemptionCodeStatusUsed):
			query = query.Where("status = ?", common.RedemptionCodeStatusUsed)
		}
	}
	if err = query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&redemptions).Error
	return redemptions, total, err
}

func GetRedemptionById(id int) (*Redemption, error) {
	if id == 0 {
		return nil, errors.New("redemption id is required")
	}
	redemption := &Redemption{}
	if err := DB.First(redemption, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return redemption, nil
}

func Redeem(key string, userID int) (result RedemptionResult, err error) {
	if key == "" {
		return result, errors.New("redemption key is required")
	}
	if userID == 0 {
		return result, errors.New("invalid user id")
	}
	redemption := &Redemption{}
	common.RandomSleep()
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where(commonKeyCol+" = ?", key).First(redemption).Error; err != nil {
			return errors.New("invalid redemption code")
		}
		if redemption.Status != common.RedemptionCodeStatusEnabled {
			return errors.New("redemption code is unavailable")
		}
		if redemption.ExpiredTime != 0 && redemption.ExpiredTime < common.GetTimestamp() {
			return errors.New("redemption code has expired")
		}
		redemptionType := redemption.Type
		if redemptionType == "" {
			redemptionType = RedemptionTypeQuota
		}
		if redemptionType != RedemptionTypeQuota && redemptionType != RedemptionTypeGroup {
			return errors.New("unsupported redemption type")
		}
		if redemptionType == RedemptionTypeGroup {
			var activeSubscription UserSubscription
			err := lockForUpdate(tx).
				Select("id").
				Where("user_id = ? AND status = ? AND end_time > ?", userID, "active", common.GetTimestamp()).
				Order("id asc").
				First(&activeSubscription).Error
			switch {
			case err == nil:
				return ErrActiveSubscriptionRedemptionDenied
			case errors.Is(err, gorm.ErrRecordNotFound):
			default:
				return err
			}
		}
		update := tx.Model(&Redemption{}).
			Where("id = ? AND status = ?", redemption.Id, common.RedemptionCodeStatusEnabled).
			Updates(map[string]interface{}{
				"redeemed_time": common.GetTimestamp(),
				"status":        common.RedemptionCodeStatusUsed,
				"used_user_id":  userID,
			})
		if update.Error != nil {
			return update.Error
		}
		if update.RowsAffected == 0 {
			return errors.New("redemption code is unavailable")
		}
		result.Type = redemptionType
		switch redemptionType {
		case RedemptionTypeQuota:
			if redemption.Quota <= 0 {
				return errors.New("invalid redemption quota")
			}
			result.Quota = redemption.Quota
			return tx.Model(&User{}).Where("id = ?", userID).Update("quota", gorm.Expr("quota + ?", redemption.Quota)).Error
		case RedemptionTypeGroup:
			expiresAt, err := applyUserGroupEntitlementTx(
				tx,
				userID,
				redemption.GroupName,
				redemption.GroupDurationMinutes,
				common.GetTimestamp(),
			)
			if err != nil {
				return err
			}
			if expiresAt > 0 {
				var activePaidCount int64
				if err := tx.Model(&UserSubscription{}).
					Where("user_id = ? AND status = ? AND end_time > ? AND source <> ?", userID, "active", common.GetTimestamp(), "redemption").
					Count(&activePaidCount).Error; err != nil {
					return err
				}
				if activePaidCount == 0 {
					var plan SubscriptionPlan
					if err := tx.Where("enabled = ? AND upgrade_group = ?", true, redemption.GroupName).
						Order("sort_order asc, id asc").
						First(&plan).Error; err != nil {
						if errors.Is(err, gorm.ErrRecordNotFound) {
							return errors.New("no enabled subscription plan matches the redemption group")
						}
						return err
					}
					plan.NormalizeDefaults()
					// The temporary user group is managed by the redemption entitlement.
					// Keep the subscription snapshot focused on quota funding so both
					// records expire independently without applying the group twice.
					plan.UpgradeGroup = ""
					plan.DowngradeGroup = ""
					if _, err := CreateUserSubscriptionFromPlanTx(tx, userID, &plan, "redemption", expiresAt); err != nil {
						return err
					}
				}
			}
			result.GroupName = redemption.GroupName
			result.GroupExpiresAt = expiresAt
			return nil
		default:
			return errors.New("unsupported redemption type")
		}
	})
	if err != nil {
		common.SysError("redemption failed: " + err.Error())
		return result, ErrRedeemFailed
	}
	if err := invalidateUserCache(userID); err != nil {
		common.SysError("failed to invalidate user cache after redemption: " + err.Error())
	}
	if result.Type == RedemptionTypeGroup {
		duration := "permanent"
		if redemption.GroupDurationMinutes > 0 {
			duration = fmt.Sprintf("%d minutes", redemption.GroupDurationMinutes)
		}
		RecordLog(userID, LogTypeTopup, fmt.Sprintf("Redeemed group entitlement %s (%s), redemption ID %d", redemption.GroupName, duration, redemption.Id))
	} else {
		RecordLog(userID, LogTypeTopup, fmt.Sprintf("Redeemed quota %s, redemption ID %d", logger.LogQuota(redemption.Quota), redemption.Id))
	}
	return result, nil
}

func (redemption *Redemption) Insert() error {
	return DB.Create(redemption).Error
}

func (redemption *Redemption) SelectUpdate() error {
	return DB.Model(redemption).Select("redeemed_time", "status").Updates(redemption).Error
}

func (redemption *Redemption) Update() error {
	return DB.Model(redemption).
		Select("name", "status", "quota", "type", "group_name", "group_duration_minutes", "redeemed_time", "expired_time").
		Updates(redemption).Error
}

func (redemption *Redemption) Delete() error {
	return DB.Delete(redemption).Error
}

func DeleteRedemptionById(id int) error {
	if id == 0 {
		return errors.New("redemption id is required")
	}
	redemption := &Redemption{}
	if err := DB.First(redemption, "id = ?", id).Error; err != nil {
		return err
	}
	return redemption.Delete()
}

func DeleteInvalidRedemptions() (int64, error) {
	now := common.GetTimestamp()
	result := DB.Where(
		"status IN ? OR (status = ? AND expired_time != 0 AND expired_time < ?)",
		[]int{common.RedemptionCodeStatusUsed, common.RedemptionCodeStatusDisabled},
		common.RedemptionCodeStatusEnabled,
		now,
	).Delete(&Redemption{})
	return result.RowsAffected, result.Error
}
