package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRecordModelHealthAggregatesHourly(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&ModelHealthHourly{}))
	require.NoError(t, DB.Where("model_name = ?", "health-test-model").Delete(&ModelHealthHourly{}).Error)

	base := time.Date(2026, 7, 17, 14, 5, 0, 0, time.UTC)
	require.NoError(t, RecordModelHealth("health-test-model", true, false, base))
	require.NoError(t, RecordModelHealth("health-test-model", false, true, base.Add(20*time.Minute)))
	require.NoError(t, RecordModelHealth("health-test-model", true, true, base.Add(time.Hour)))

	rows, err := GetModelHealthHourly(
		[]string{"health-test-model"},
		base.Truncate(time.Hour).Unix(),
		base.Add(time.Hour).Truncate(time.Hour).Unix(),
	)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.Equal(t, int64(2), rows[0].TotalCount)
	assert.Equal(t, int64(1), rows[0].SuccessCount)
	assert.Equal(t, int64(1), rows[0].ProbeCount)
	assert.Equal(t, int64(1), rows[1].TotalCount)
	assert.Equal(t, int64(1), rows[1].SuccessCount)
	assert.Equal(t, int64(1), rows[1].ProbeCount)
}

func TestRecordChannelModelHealthAggregatesByChannel(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&ModelHealthHourly{}, &ModelChannelHealthHourly{}))
	require.NoError(t, DB.Where("model_name = ?", "channel-health-test-model").Delete(&ModelHealthHourly{}).Error)
	require.NoError(t, DB.Where("model_name = ?", "channel-health-test-model").Delete(&ModelChannelHealthHourly{}).Error)

	base := time.Date(2026, 7, 18, 16, 5, 0, 0, time.UTC)
	require.NoError(t, RecordChannelModelHealth(1, "channel-health-test-model", true, false, base))
	require.NoError(t, RecordChannelModelHealth(2, "channel-health-test-model", false, false, base.Add(10*time.Minute)))
	require.NoError(t, RecordChannelModelHealth(1, "channel-health-test-model", true, true, base.Add(20*time.Minute)))

	rows, err := GetModelChannelHealthHourly(
		[]int{1, 2},
		[]string{"channel-health-test-model"},
		base.Truncate(time.Hour).Unix(),
		base.Truncate(time.Hour).Unix(),
	)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.Equal(t, 1, rows[0].ChannelID)
	assert.Equal(t, int64(2), rows[0].TotalCount)
	assert.Equal(t, int64(2), rows[0].SuccessCount)
	assert.Equal(t, int64(1), rows[0].ProbeCount)
	assert.Equal(t, 2, rows[1].ChannelID)
	assert.Equal(t, int64(1), rows[1].TotalCount)
	assert.Zero(t, rows[1].SuccessCount)
}

func TestDeleteExpiredModelHealth(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&ModelHealthHourly{}, &ModelChannelHealthHourly{}))
	now := time.Date(2026, 7, 17, 14, 0, 0, 0, time.UTC)
	old := now.Add(-ModelHealthRetention - time.Hour)
	require.NoError(t, RecordModelHealth("expired-health-model", true, true, old))
	require.NoError(t, RecordModelHealth("retained-health-model", true, true, now))

	require.NoError(t, DeleteExpiredModelHealth(now))

	var expiredCount int64
	require.NoError(t, DB.Model(&ModelHealthHourly{}).
		Where("model_name = ?", "expired-health-model").
		Count(&expiredCount).Error)
	assert.Zero(t, expiredCount)

	var retainedCount int64
	require.NoError(t, DB.Model(&ModelHealthHourly{}).
		Where("model_name = ?", "retained-health-model").
		Count(&retainedCount).Error)
	assert.Equal(t, int64(1), retainedCount)
}
