package model

import (
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupRelayBanFixture(t *testing.T) User {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(IPBanMigrationModels()...))
	username := "relay-ban-test-user"
	DB.Session(&gorm.Session{SkipHooks: true}).Where("user_id IN (SELECT id FROM users WHERE username = ?)", username).Delete(&UserRelayBanEvent{})
	DB.Where("user_id IN (SELECT id FROM users WHERE username = ?)", username).Delete(&UserRelayBan{})
	DB.Where("username = ?", username).Delete(&IPAuditMinute{})
	DB.Unscoped().Where("username = ?", username).Delete(&User{})
	user := User{
		Username:    username,
		DisplayName: "Relay Ban Test User",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		AffCode:     "relay-ban-test",
	}
	require.NoError(t, DB.Create(&user).Error)
	t.Cleanup(func() {
		DB.Session(&gorm.Session{SkipHooks: true}).Where("user_id = ?", user.Id).Delete(&UserRelayBanEvent{})
		DB.Where("user_id = ?", user.Id).Delete(&UserRelayBan{})
		DB.Where("user_id = ?", user.Id).Delete(&IPAuditMinute{})
		DB.Unscoped().Where("id = ?", user.Id).Delete(&User{})
	})
	return user
}

func TestIPBanMigrationModelsIncludeAuditStateAndEvents(t *testing.T) {
	models := IPBanMigrationModels()
	require.Len(t, models, 3)
	assert.IsType(t, &IPAuditMinute{}, models[0])
	assert.IsType(t, &UserRelayBan{}, models[1])
	assert.IsType(t, &UserRelayBanEvent{}, models[2])
}

func TestRecordIPAuditObservationPreservesOutOfOrderBounds(t *testing.T) {
	user := setupRelayBanFixture(t)
	base := time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC)
	observation := IPAuditObservation{
		UserID:           user.Id,
		Username:         user.Username,
		IP:               "8.8.8.8",
		CountryISO:       "US",
		ASNNumber:        15169,
		ASNOrganization:  "Google LLC",
		ResolverVersion:  "fixture-v1",
		IPKind:           "public",
		EvidenceEligible: true,
		ObservedAt:       base.Add(50 * time.Second),
	}
	require.NoError(t, RecordIPAuditObservation(observation))
	observation.ObservedAt = base.Add(10 * time.Second)
	require.NoError(t, RecordIPAuditObservation(observation))
	observation.ObservedAt = base.Add(30 * time.Second)
	require.NoError(t, RecordIPAuditObservation(observation))

	var row IPAuditMinute
	require.NoError(t, DB.Where("user_id = ? AND ip = ?", user.Id, observation.IP).First(&row).Error)
	assert.Equal(t, int64(3), row.RequestCount)
	assert.Equal(t, base.Add(10*time.Second).Unix(), row.FirstSeenAt)
	assert.Equal(t, base.Add(50*time.Second).Unix(), row.LastSeenAt)
	assert.True(t, row.EvidenceEligible)
}

func TestRecordIPAuditObservationRepairsLegacyNullFirstSeenAt(t *testing.T) {
	user := setupRelayBanFixture(t)
	observedAt := time.Date(2026, 8, 5, 12, 0, 30, 0, time.UTC)
	legacy := IPAuditMinute{
		UserID:       user.Id,
		IP:           "1.1.1.1",
		Minute:       observedAt.Truncate(time.Minute).Unix(),
		Username:     user.Username,
		RequestCount: 1,
		LastSeenAt:   observedAt.Add(-10 * time.Second).Unix(),
	}
	require.NoError(t, DB.Create(&legacy).Error)
	require.NoError(t, DB.Model(&IPAuditMinute{}).
		Where("user_id = ? AND ip = ? AND minute = ?", legacy.UserID, legacy.IP, legacy.Minute).
		UpdateColumn("first_seen_at", nil).Error)

	require.NoError(t, RecordIPAuditObservation(IPAuditObservation{
		UserID:     user.Id,
		Username:   user.Username,
		IP:         legacy.IP,
		ObservedAt: observedAt,
	}))

	var row IPAuditMinute
	require.NoError(t, DB.Where(
		"user_id = ? AND ip = ? AND minute = ?", legacy.UserID, legacy.IP, legacy.Minute,
	).First(&row).Error)
	assert.Equal(t, observedAt.Unix(), row.FirstSeenAt)
	assert.Equal(t, int64(2), row.RequestCount)
}

func TestBuildIPAuditRiskEvidenceStrictBoundaries(t *testing.T) {
	rows := []IPAuditMinute{
		{IP: "8.8.8.8", IPKind: "public", CountryISO: "US", ASNNumber: 15169, EvidenceEligible: true, FirstSeenAt: 901, LastSeenAt: 901},
		{IP: "1.1.1.1", IPKind: "public", CountryISO: "AU", ASNNumber: 13335, EvidenceEligible: true, FirstSeenAt: 1080, LastSeenAt: 1080},
		{IP: "9.9.9.9", IPKind: "public", CountryISO: "CH", ASNNumber: 19281, EvidenceEligible: true, FirstSeenAt: 1400, LastSeenAt: 1400},
	}
	risk := BuildIPAuditRiskEvidence(rows, 900, 1500)
	assert.Equal(t, int64(179), risk.MinimumGapSeconds)
	assert.True(t, risk.RapidIPSwitch)
	assert.True(t, risk.TriggersBan)

	rows[1].FirstSeenAt = 1081
	rows[1].LastSeenAt = 1081
	risk = BuildIPAuditRiskEvidence(rows, 900, 1500)
	assert.Equal(t, int64(180), risk.MinimumGapSeconds)
	assert.False(t, risk.RapidIPSwitch)
	assert.False(t, risk.TriggersBan)

	rows[1].FirstSeenAt = 1080
	rows[1].LastSeenAt = 1080
	rows[2].EvidenceEligible = false
	risk = BuildIPAuditRiskEvidence(rows, 900, 1500)
	assert.Equal(t, 2, risk.CountryCount)
	assert.Equal(t, 2, risk.ASNCount)
	assert.False(t, risk.TriggersBan)
}

func TestIPAuditEvaluationHasDeterministicInputBoundary(t *testing.T) {
	user := setupRelayBanFixture(t)
	rows := make([]IPAuditMinute, 0, IPAuditMaxEvaluationRows+2)
	countries := []string{"US", "AU", "CH"}
	for index := 0; index < IPAuditMaxEvaluationRows+2; index++ {
		observedAt := int64(1001 + index%500)
		rows = append(rows, IPAuditMinute{
			UserID:           user.Id,
			IP:               fmt.Sprintf("2001:db8:%x::1", index),
			Minute:           int64(index),
			Username:         user.Username,
			RequestCount:     1,
			FirstSeenAt:      observedAt,
			LastSeenAt:       observedAt,
			CountryISO:       countries[index%len(countries)],
			ASNNumber:        int64(64512 + index%3),
			IPKind:           "public",
			EvidenceEligible: true,
		})
	}
	require.NoError(t, DB.CreateInBatches(rows, 100).Error)

	queried, err := GetIPAuditRowsForEvaluation(user.Id, 1000, 2000)
	require.NoError(t, err)
	require.Len(t, queried, IPAuditMaxEvaluationRows+1)
	risk := BuildIPAuditRiskEvidence(queried, 1000, 2000)
	assert.True(t, risk.InputTruncated)
	assert.Len(t, risk.Observations, IPAuditMaxEvaluationRows)
	assert.Equal(t, 3, risk.CountryCount)
	assert.Equal(t, 3, risk.ASNCount)
	assert.Zero(t, risk.MinimumGapSeconds)
	assert.True(t, risk.TriggersBan)
}

func TestIPAuditCleanupRetriesAfterDeleteFailure(t *testing.T) {
	user := setupRelayBanFixture(t)
	now := time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC)
	day := now.Unix() / int64((24 * time.Hour).Seconds())
	previousDay := ipAuditCleanupDay.Load()
	ipAuditCleanupDay.Store(day - 1)
	t.Cleanup(func() {
		ipAuditCleanupDay.Store(previousDay)
	})

	oldRow := IPAuditMinute{
		UserID:       user.Id,
		IP:           "192.0.2.10",
		Minute:       now.AddDate(0, 0, -IPAuditRetentionDays-1).Unix(),
		Username:     user.Username,
		RequestCount: 1,
		FirstSeenAt:  now.AddDate(0, 0, -IPAuditRetentionDays-1).Unix(),
		LastSeenAt:   now.AddDate(0, 0, -IPAuditRetentionDays-1).Unix(),
	}
	require.NoError(t, DB.Create(&oldRow).Error)

	callbackName := "test:ip_audit_cleanup_failure"
	callbackRegistered := true
	require.NoError(t, DB.Callback().Delete().Before("gorm:delete").Register(callbackName, func(tx *gorm.DB) {
		tx.AddError(errors.New("injected cleanup failure"))
	}))
	t.Cleanup(func() {
		if callbackRegistered {
			require.NoError(t, DB.Callback().Delete().Remove(callbackName))
		}
	})

	require.Error(t, cleanupIPAuditIfNeeded(now))
	assert.Equal(t, day-1, ipAuditCleanupDay.Load())
	var count int64
	require.NoError(t, DB.Model(&IPAuditMinute{}).Where("user_id = ? AND ip = ?", user.Id, oldRow.IP).Count(&count).Error)
	assert.Equal(t, int64(1), count)

	require.NoError(t, DB.Callback().Delete().Remove(callbackName))
	callbackRegistered = false
	require.NoError(t, cleanupIPAuditIfNeeded(now))
	assert.Equal(t, day, ipAuditCleanupDay.Load())
	require.NoError(t, DB.Model(&IPAuditMinute{}).Where("user_id = ? AND ip = ?", user.Id, oldRow.IP).Count(&count).Error)
	assert.Zero(t, count)
}

func TestManualRelayBanWinsAndRevokeAdvancesEvaluationFloor(t *testing.T) {
	user := setupRelayBanFixture(t)
	manual, err := ApplyManualRelayBan(user.Id, 99, "support decision", 0)
	require.NoError(t, err)
	require.True(t, manual.ActiveAt(GetDBTimestamp()))
	assert.Equal(t, RelayBanSourceManual, manual.Source)

	automatic, applied, err := ApplyAutomaticRelayBan(user.Id, "automatic", `{"fixture":true}`, 0)
	require.NoError(t, err)
	assert.False(t, applied)
	assert.Equal(t, RelayBanSourceManual, automatic.Source)
	assert.Equal(t, manual.Version, automatic.Version)

	revoked, err := RevokeUserRelayBan(user.Id, 99, "review complete")
	require.NoError(t, err)
	assert.NotZero(t, revoked.RevokedAt)
	assert.Equal(t, revoked.RevokedAt, revoked.EvaluationAfter)
	assert.False(t, revoked.ActiveAt(GetDBTimestamp()))

	events, err := GetUserRelayBanEvents(user.Id, 10)
	require.NoError(t, err)
	require.Len(t, events, 2)
	assert.Equal(t, RelayBanEventRevoke, events[0].EventType)
	assert.Equal(t, RelayBanEventApply, events[1].EventType)
}

func TestManualApplyOverridesActiveAutomaticRelayBan(t *testing.T) {
	user := setupRelayBanFixture(t)
	automatic, applied, err := ApplyAutomaticRelayBan(user.Id, "automatic", `{"fixture":true}`, 0)
	require.NoError(t, err)
	require.True(t, applied)
	require.Equal(t, RelayBanSourceAutomatic, automatic.Source)

	manual, err := ApplyManualRelayBan(user.Id, 99, "administrator decision", 0)
	require.NoError(t, err)
	assert.Equal(t, RelayBanSourceManual, manual.Source)
	assert.Equal(t, "administrator decision", manual.Reason)
	assert.Greater(t, manual.Version, automatic.Version)
	assert.Empty(t, manual.Evidence)

	events, err := GetUserRelayBanEvents(user.Id, 10)
	require.NoError(t, err)
	require.Len(t, events, 2)
	assert.Equal(t, RelayBanSourceManual, events[0].Source)
	assert.Equal(t, RelayBanSourceAutomatic, events[1].Source)
}

func TestExpiredRelayBanCreatesOneImmutableLifecycleEvent(t *testing.T) {
	user := setupRelayBanFixture(t)
	now := GetDBTimestamp()
	ban := UserRelayBan{
		UserID:          user.Id,
		Source:          RelayBanSourceManual,
		Reason:          "temporary review",
		StartsAt:        now - 60,
		ExpiresAt:       now,
		EvaluationAfter: now - 60,
		Version:         1,
		CreatedAt:       now - 60,
		UpdatedAt:       now - 60,
	}
	require.NoError(t, DB.Create(&ban).Error)
	require.NoError(t, DB.Create(&UserRelayBanEvent{
		UserID:          user.Id,
		EventType:       RelayBanEventApply,
		Source:          RelayBanSourceManual,
		Reason:          ban.Reason,
		StartsAt:        ban.StartsAt,
		ExpiresAt:       ban.ExpiresAt,
		EvaluationAfter: ban.EvaluationAfter,
		ActorUserID:     99,
		StateVersion:    1,
		CreatedAt:       ban.CreatedAt,
	}).Error)
	assert.False(t, ban.ActiveAt(now))

	active, err := GetActiveUserRelayBan(user.Id, now)
	require.NoError(t, err)
	assert.Nil(t, active)
	active, err = GetActiveUserRelayBan(user.Id, now)
	require.NoError(t, err)
	assert.Nil(t, active)

	events, err := GetUserRelayBanEvents(user.Id, 10)
	require.NoError(t, err)
	require.Len(t, events, 2)
	assert.Equal(t, RelayBanEventExpire, events[0].EventType)
	assert.Equal(t, RelayBanEventApply, events[1].EventType)
	assert.Equal(t, now, events[0].EvaluationAfter)
}

func TestConcurrentAutomaticRelayBanCreatesOneEvent(t *testing.T) {
	user := setupRelayBanFixture(t)
	const workers = 4
	results := make(chan bool, workers)
	errorsByWorker := make(chan error, workers)
	start := make(chan struct{})
	var wait sync.WaitGroup
	wait.Add(workers)
	for index := 0; index < workers; index++ {
		go func() {
			defer wait.Done()
			<-start
			_, applied, err := ApplyAutomaticRelayBan(user.Id, "automatic", `{"fixture":true}`, 0)
			results <- applied
			errorsByWorker <- err
		}()
	}
	close(start)
	wait.Wait()
	close(results)
	close(errorsByWorker)
	for err := range errorsByWorker {
		require.NoError(t, err)
	}
	appliedCount := 0
	for applied := range results {
		if applied {
			appliedCount++
		}
	}
	assert.Equal(t, 1, appliedCount)

	var eventCount int64
	require.NoError(t, DB.Model(&UserRelayBanEvent{}).Where("user_id = ? AND event_type = ?", user.Id, RelayBanEventApply).Count(&eventCount).Error)
	assert.Equal(t, int64(1), eventCount)
}
