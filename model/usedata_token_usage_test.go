package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetGlobalTokenUsageSummaryIncludesPersistedAndPendingHours(t *testing.T) {
	truncateTables(t)
	CacheQuotaDataLock.Lock()
	CacheQuotaData = make(map[string]*QuotaData)
	CacheQuotaDataLock.Unlock()
	t.Cleanup(func() {
		CacheQuotaDataLock.Lock()
		CacheQuotaData = make(map[string]*QuotaData)
		CacheQuotaDataLock.Unlock()
	})

	now := int64(1_800_010_123)
	currentHour := now - now%3600
	require.NoError(t, DB.Create(&[]QuotaData{
		{
			UserID:    1,
			Username:  "alice",
			ModelName: "grok-a",
			CreatedAt: currentHour - 25*3600,
			TokenUsed: 100,
			Count:     1,
		},
		{
			UserID:    1,
			Username:  "alice",
			ModelName: "grok-a",
			CreatedAt: currentHour - 2*3600,
			TokenUsed: 200,
			Count:     1,
		},
		{
			UserID:    2,
			Username:  "bob",
			ModelName: "grok-b",
			CreatedAt: currentHour,
			TokenUsed: 300,
			Count:     1,
		},
	}).Error)

	LogQuotaData(QuotaDataLogParams{
		UserID:    1,
		Username:  "alice",
		ModelName: "grok-a",
		CreatedAt: currentHour - 2*3600 + 120,
		TokenUsed: 50,
	})
	LogQuotaData(QuotaDataLogParams{
		UserID:    2,
		Username:  "bob",
		ModelName: "grok-b",
		CreatedAt: currentHour + 300,
		TokenUsed: 25,
	})

	summary, err := GetGlobalTokenUsageSummary(now)
	require.NoError(t, err)
	require.Len(t, summary.Hourly, 24)
	assert.Equal(t, int64(675), summary.TotalTokens)
	assert.Equal(t, int64(575), summary.Last24HoursTokens)
	assert.Equal(t, currentHour-23*3600, summary.Hourly[0].Timestamp)
	assert.Equal(t, currentHour, summary.Hourly[23].Timestamp)
	assert.Equal(t, int64(250), summary.Hourly[21].Tokens)
	assert.Equal(t, int64(325), summary.Hourly[23].Tokens)
}
