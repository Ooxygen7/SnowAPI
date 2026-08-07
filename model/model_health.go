package model

import (
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const ModelHealthRetention = 30 * 24 * time.Hour

// ModelHealthHourly stores one UTC hourly aggregate for conversation requests
// and the lightweight health probes. The composite key keeps updates atomic
// across SQLite, MySQL, and PostgreSQL.
type ModelHealthHourly struct {
	ModelName    string `json:"model_name" gorm:"size:191;primaryKey"`
	Hour         int64  `json:"hour" gorm:"primaryKey;index"`
	TotalCount   int64  `json:"total_count" gorm:"default:0"`
	SuccessCount int64  `json:"success_count" gorm:"default:0"`
	ProbeCount   int64  `json:"probe_count" gorm:"default:0"`
	UpdatedAt    int64  `json:"updated_at" gorm:"bigint"`
}

func (ModelHealthHourly) TableName() string {
	return "model_health_hourly"
}

// ModelChannelHealthHourly keeps the same health counters split by the
// concrete channel that served the request. The original model-only table is
// retained for backwards compatibility and for failures that happen before a
// channel can be selected.
type ModelChannelHealthHourly struct {
	ChannelID    int    `json:"channel_id" gorm:"primaryKey;autoIncrement:false"`
	ModelName    string `json:"model_name" gorm:"size:191;primaryKey"`
	Hour         int64  `json:"hour" gorm:"primaryKey;index"`
	TotalCount   int64  `json:"total_count" gorm:"default:0"`
	SuccessCount int64  `json:"success_count" gorm:"default:0"`
	ProbeCount   int64  `json:"probe_count" gorm:"default:0"`
	UpdatedAt    int64  `json:"updated_at" gorm:"bigint"`
}

func (ModelChannelHealthHourly) TableName() string {
	return "model_channel_health_hourly"
}

func RecordModelHealth(modelName string, success bool, probe bool, now time.Time) error {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return nil
	}

	hour := now.UTC().Truncate(time.Hour).Unix()
	successCount := int64(0)
	if success {
		successCount = 1
	}
	probeCount := int64(0)
	if probe {
		probeCount = 1
	}

	row := &ModelHealthHourly{
		ModelName:    modelName,
		Hour:         hour,
		TotalCount:   1,
		SuccessCount: successCount,
		ProbeCount:   probeCount,
		UpdatedAt:    now.Unix(),
	}
	return DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "model_name"},
			{Name: "hour"},
		},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"total_count":   gorm.Expr("total_count + ?", 1),
			"success_count": gorm.Expr("success_count + ?", successCount),
			"probe_count":   gorm.Expr("probe_count + ?", probeCount),
			"updated_at":    now.Unix(),
		}),
	}).Create(row).Error
}

func RecordChannelModelHealth(channelID int, modelName string, success bool, probe bool, now time.Time) error {
	if err := RecordModelHealth(modelName, success, probe, now); err != nil {
		return err
	}
	if channelID <= 0 {
		return nil
	}

	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return nil
	}

	hour := now.UTC().Truncate(time.Hour).Unix()
	successCount := int64(0)
	if success {
		successCount = 1
	}
	probeCount := int64(0)
	if probe {
		probeCount = 1
	}

	row := &ModelChannelHealthHourly{
		ChannelID:    channelID,
		ModelName:    modelName,
		Hour:         hour,
		TotalCount:   1,
		SuccessCount: successCount,
		ProbeCount:   probeCount,
		UpdatedAt:    now.Unix(),
	}
	return DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "channel_id"},
			{Name: "model_name"},
			{Name: "hour"},
		},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"total_count":   gorm.Expr("total_count + ?", 1),
			"success_count": gorm.Expr("success_count + ?", successCount),
			"probe_count":   gorm.Expr("probe_count + ?", probeCount),
			"updated_at":    now.Unix(),
		}),
	}).Create(row).Error
}

func GetModelHealthHourly(modelNames []string, startHour int64, endHour int64) ([]ModelHealthHourly, error) {
	rows := make([]ModelHealthHourly, 0)
	if len(modelNames) == 0 {
		return rows, nil
	}
	err := DB.
		Where("model_name IN ? AND hour >= ? AND hour <= ?", modelNames, startHour, endHour).
		Order("model_name ASC, hour ASC").
		Find(&rows).Error
	return rows, err
}

func GetModelChannelHealthHourly(channelIDs []int, modelNames []string, startHour int64, endHour int64) ([]ModelChannelHealthHourly, error) {
	rows := make([]ModelChannelHealthHourly, 0)
	if len(channelIDs) == 0 || len(modelNames) == 0 {
		return rows, nil
	}
	err := DB.
		Where("channel_id IN ? AND model_name IN ? AND hour >= ? AND hour <= ?", channelIDs, modelNames, startHour, endHour).
		Order("channel_id ASC, model_name ASC, hour ASC").
		Find(&rows).Error
	return rows, err
}

func DeleteExpiredModelHealth(now time.Time) error {
	cutoff := now.UTC().Add(-ModelHealthRetention).Truncate(time.Hour).Unix()
	if err := DB.Where("hour < ?", cutoff).Delete(&ModelHealthHourly{}).Error; err != nil {
		return err
	}
	return DB.Where("hour < ?", cutoff).Delete(&ModelChannelHealthHourly{}).Error
}
