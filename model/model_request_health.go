package model

import (
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ModelRequestHealthHourly contains only completed user relay attempts, across
// all accounts and channels. Legacy probe counters are intentionally separate:
// their successful probes cannot be reliably subtracted from old aggregates.
type ModelRequestHealthHourly struct {
	ModelName    string `gorm:"size:191;primaryKey"`
	Hour         int64  `gorm:"primaryKey;index"`
	TotalCount   int64
	SuccessCount int64
}

func (ModelRequestHealthHourly) TableName() string { return "model_request_health_hourly" }

func RecordModelRequestHealth(modelName string, success bool, now time.Time) error {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return nil
	}
	succeeded := int64(0)
	if success {
		succeeded = 1
	}
	row := ModelRequestHealthHourly{ModelName: modelName, Hour: now.UTC().Truncate(time.Hour).Unix(), TotalCount: 1, SuccessCount: succeeded}
	return DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "model_name"}, {Name: "hour"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"total_count":   gorm.Expr("? + ?", clause.Column{Table: row.TableName(), Name: "total_count"}, 1),
			"success_count": gorm.Expr("? + ?", clause.Column{Table: row.TableName(), Name: "success_count"}, succeeded),
		}),
	}).Create(&row).Error
}

func GetModelRequestHealthHourly(names []string, start, end int64) ([]ModelRequestHealthHourly, error) {
	rows := make([]ModelRequestHealthHourly, 0)
	if len(names) == 0 {
		return rows, nil
	}
	err := DB.Where("model_name IN ? AND hour >= ? AND hour <= ?", names, start, end).Order("model_name, hour").Find(&rows).Error
	return rows, err
}
