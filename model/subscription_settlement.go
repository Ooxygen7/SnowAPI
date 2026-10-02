package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// QueueSubscriptionSettlement persists an absolute target before changing any
// counters. A process restart or a failed transaction can safely replay it.
func QueueSubscriptionSettlement(ref *SubscriptionUsageRef, quota int64, tokenId int, tokenPreConsumed int64) error {
	if ref == nil || !ref.Valid() || tokenId < 0 {
		return ErrSubscriptionQuotaInvalid
	}
	if err := validateSubscriptionQuotaValue("settlement quota", quota, true); err != nil {
		return err
	}
	if err := validateSubscriptionQuotaValue("token pre-consumed quota", tokenPreConsumed, true); err != nil {
		return err
	}
	return runSubscriptionQuotaTransaction(func(tx *gorm.DB) error {
		var record SubscriptionPreConsumeRecord
		if err := lockForUpdate(tx).Where("request_id = ?", ref.RequestId).First(&record).Error; err != nil {
			return err
		}
		if record.UserSubscriptionId != ref.UserSubscriptionId || record.PeriodWindowId != ref.PeriodWindowId || record.FiveHourWindowId != ref.FiveHourWindowId {
			return ErrSubscriptionQuotaInvalid
		}
		if record.SettlementPending {
			if record.SettlementQuota == quota && record.SettlementTokenId == tokenId && record.SettlementTokenPre == tokenPreConsumed {
				return nil
			}
			return ErrSubscriptionUsageFinalized
		}
		if record.Status == SubscriptionUsageStateSettled && record.FinalConsumed == quota {
			return nil
		}
		if record.Status != SubscriptionUsageStateReserved {
			return ErrSubscriptionUsageFinalized
		}
		if record.Version != ref.Version {
			return ErrSubscriptionQuotaConflict
		}
		return tx.Model(&record).Updates(map[string]interface{}{
			"settlement_pending": true, "settlement_quota": quota,
			"settlement_token_id": tokenId, "settlement_token_pre": tokenPreConsumed,
			"updated_at": getSubscriptionDBTimestampTx(tx),
		}).Error
	})
}

// CompleteSubscriptionSettlement commits the allowance and API-key adjustment
// in one primary-database transaction. Replaying it never repeats either debit.
func CompleteSubscriptionSettlement(requestId string) (SubscriptionUsageRef, error) {
	var ref SubscriptionUsageRef
	var tokenKey string
	var tokenDelta int64
	err := runSubscriptionQuotaTransaction(func(tx *gorm.DB) error {
		tokenKey, tokenDelta = "", 0
		var record SubscriptionPreConsumeRecord
		if err := lockForUpdate(tx).Where("request_id = ?", requestId).First(&record).Error; err != nil {
			return err
		}
		ref = SubscriptionUsageRef{RequestId: record.RequestId, UserSubscriptionId: record.UserSubscriptionId, PeriodWindowId: record.PeriodWindowId, FiveHourWindowId: record.FiveHourWindowId, Version: record.Version}
		if !record.SettlementPending {
			return nil
		}
		if record.Status != SubscriptionUsageStateReserved {
			return ErrSubscriptionUsageFinalized
		}
		if err := validateSubscriptionQuotaValue("token pre-consumed quota", record.SettlementTokenPre, true); err != nil {
			return err
		}
		now := getSubscriptionDBTimestampTx(tx)
		if err := adjustSubscriptionUsageTx(tx, &record, &ref, record.SettlementQuota, SubscriptionUsageStateSettled, now); err != nil {
			return err
		}
		if record.SettlementTokenId > 0 {
			var token Token
			err := lockForUpdate(tx).Where("id = ?", record.SettlementTokenId).First(&token).Error
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			// Deleted keys no longer have an allowance to adjust. Never apply
			// a historic charge to a key owned by a different account.
			if err == nil {
				if token.UserId != record.UserId {
					return ErrSubscriptionQuotaInvalid
				}
				tokenDelta = record.SettlementQuota - record.SettlementTokenPre
				tokenKey = token.Key
				if tokenDelta != 0 {
					if err := tx.Model(&Token{}).Where("id = ? AND user_id = ?", token.Id, record.UserId).Updates(map[string]interface{}{
						"remain_quota":  gorm.Expr("remain_quota - ?", tokenDelta),
						"used_quota":    gorm.Expr("used_quota + ?", tokenDelta),
						"accessed_time": now,
					}).Error; err != nil {
						return err
					}
				}
			}
		}
		return tx.Model(&record).Update("settlement_pending", false).Error
	})
	if err != nil {
		return ref, err
	}
	if common.RedisEnabled && tokenKey != "" && tokenDelta != 0 {
		if err := cacheDecrTokenQuota(tokenKey, tokenDelta); err != nil {
			_ = cacheDeleteToken(tokenKey)
			common.SysError("subscription settlement token cache refresh failed: " + err.Error())
		}
	}
	return ref, nil
}

// ReconcileSubscriptionSettlements also recovers pre-fix synchronous charges
// when exactly one matching consume log proves their final amount. Unknown,
// ambiguous and asynchronous requests are retained for manual review, not
// guessed or refunded. A keyset cursor keeps unresolved rows from starving
// later requests; each maintenance tick performs bounded work.
func ReconcileSubscriptionSettlements(afterId int, limit int) (int, int, error) {
	if limit <= 0 || limit > 300 {
		limit = 300
	}
	var records []SubscriptionPreConsumeRecord
	err := DB.Where("id > ? AND (settlement_pending = ? OR (status = ? AND updated_at < ?))", afterId, true, SubscriptionUsageStateReserved, GetDBTimestamp()-300).
		Order("id asc").Limit(limit).Find(&records).Error
	if err != nil {
		return 0, afterId, err
	}
	nextId := 0
	if len(records) == limit {
		nextId = records[len(records)-1].Id
	}
	completed := 0
	var firstErr error
	for _, record := range records {
		if !record.SettlementPending {
			var logs []Log
			err := LOG_DB.Select("quota", "token_id", "other").Where("request_id = ? AND user_id = ? AND type = ?", record.RequestId, record.UserId, LogTypeConsume).Limit(2).Find(&logs).Error
			if err != nil {
				if firstErr == nil {
					firstErr = err
				}
				continue
			}
			if len(logs) != 1 {
				continue
			}
			var details struct {
				BillingSource    string `json:"billing_source"`
				SubscriptionId   int    `json:"subscription_id"`
				PeriodWindowId   int    `json:"subscription_period_window_id"`
				FiveHourWindowId int    `json:"subscription_five_hour_window_id"`
				Consumed         *int64 `json:"subscription_consumed"`
				IsTask           bool   `json:"is_task"`
			}
			if common.UnmarshalJsonStr(logs[0].Other, &details) != nil || details.IsTask || details.BillingSource != "subscription" || details.SubscriptionId != record.UserSubscriptionId || details.PeriodWindowId != record.PeriodWindowId || details.FiveHourWindowId != record.FiveHourWindowId || details.Consumed == nil || *details.Consumed != record.FinalConsumed {
				continue
			}
			ref := SubscriptionUsageRef{RequestId: record.RequestId, UserSubscriptionId: record.UserSubscriptionId, PeriodWindowId: record.PeriodWindowId, FiveHourWindowId: record.FiveHourWindowId, Version: record.Version}
			if err := QueueSubscriptionSettlement(&ref, int64(logs[0].Quota), logs[0].TokenId, record.FinalConsumed); err != nil {
				if firstErr == nil {
					firstErr = err
				}
				continue
			}
		}
		if _, err := CompleteSubscriptionSettlement(record.RequestId); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			common.SysError(fmt.Sprintf("subscription settlement recovery failed (record=%d): %v", record.Id, err))
			continue
		}
		completed++
		common.SysLog(fmt.Sprintf("subscription settlement recovered (record=%d user=%d)", record.Id, record.UserId))
	}
	return completed, nextId, firstErr
}
