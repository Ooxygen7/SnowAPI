package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelRequestHealthSeparatesLegacyProbesAndCountsRequests(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&ModelRequestHealthHourly{}, &ModelHealthHourly{}))
	name := t.Name()
	base := time.Date(2026, 9, 25, 8, 0, 0, 0, time.UTC)
	require.NoError(t, RecordModelHealth(name, false, true, base))
	require.NoError(t, RecordModelHealth(name, true, true, base))
	rows, err := GetModelRequestHealthHourly([]string{name}, base.Unix(), base.Add(time.Hour).Unix())
	require.NoError(t, err)
	assert.Empty(t, rows, "legacy probes must not invent request health")
	require.NoError(t, RecordModelRequestHealth(name, true, base))
	require.NoError(t, RecordModelRequestHealth(name, false, base.Add(time.Minute)))
	require.NoError(t, RecordModelRequestHealth(name, true, base.Add(time.Hour)))
	rows, err = GetModelRequestHealthHourly([]string{name}, base.Unix(), base.Add(time.Hour).Unix())
	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.Equal(t, int64(2), rows[0].TotalCount)
	assert.Equal(t, int64(1), rows[0].SuccessCount)
	assert.Equal(t, int64(1), rows[1].TotalCount)
	assert.Equal(t, int64(1), rows[1].SuccessCount)
	rows, err = GetModelRequestHealthHourly([]string{name}, base.Add(2*time.Hour).Unix(), base.Add(3*time.Hour).Unix())
	require.NoError(t, err)
	assert.Empty(t, rows)
}
