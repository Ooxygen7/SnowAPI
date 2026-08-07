package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupIPAuditFixture(t *testing.T) (User, User) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&IPAuditMinute{}))

	usernames := []string{"ip-audit-user-one", "ip-audit-user-two"}
	require.NoError(t, DB.Unscoped().Where("username IN ?", usernames).Delete(&User{}).Error)
	require.NoError(t, DB.Where("ip IN ?", []string{"203.0.113.10", "198.51.100.20"}).Delete(&IPAuditMinute{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Where("ip IN ?", []string{"203.0.113.10", "198.51.100.20"}).Delete(&IPAuditMinute{}).Error)
		require.NoError(t, DB.Unscoped().Where("username IN ?", usernames).Delete(&User{}).Error)
	})

	users := []User{
		{
			Username:    usernames[0],
			DisplayName: "IP Audit User One",
			Role:        common.RoleCommonUser,
			Status:      common.UserStatusEnabled,
			AffCode:     "ipaudit-one",
		},
		{
			Username:    usernames[1],
			DisplayName: "IP Audit User Two",
			Role:        common.RoleCommonUser,
			Status:      common.UserStatusEnabled,
			AffCode:     "ipaudit-two",
		},
	}
	for i := range users {
		require.NoError(t, DB.Create(&users[i]).Error)
	}

	return users[0], users[1]
}

func TestRecordIPAuditRequestAggregatesPerMinute(t *testing.T) {
	firstUser, secondUser := setupIPAuditFixture(t)
	base := time.Date(2026, 7, 20, 12, 0, 10, 0, time.UTC)

	require.NoError(t, RecordIPAuditRequest(firstUser.Id, firstUser.Username, "203.0.113.10", base))
	require.NoError(t, RecordIPAuditRequest(firstUser.Id, firstUser.Username, "203.0.113.10", base.Add(20*time.Second)))
	require.NoError(t, RecordIPAuditRequest(secondUser.Id, secondUser.Username, "203.0.113.10", base.Add(30*time.Second)))
	require.NoError(t, RecordIPAuditRequest(firstUser.Id, firstUser.Username, "203.0.113.10", base.Add(time.Minute)))
	require.NoError(t, RecordIPAuditRequest(firstUser.Id, firstUser.Username, "198.51.100.20", base.Add(2*time.Minute)))

	var rows []IPAuditMinute
	require.NoError(t, DB.Where("ip = ?", "203.0.113.10").Order("minute, user_id").Find(&rows).Error)
	require.Len(t, rows, 3)
	assert.Equal(t, int64(2), rows[0].RequestCount)

	result, err := GetIPAudit(IPAuditQuery{
		StartAt:          base.Add(-time.Minute).Unix(),
		EndAt:            base.Add(5 * time.Minute).Unix(),
		RequestThreshold: 4,
		UserThreshold:    2,
		RPMThreshold:     3,
		Page:             1,
		PageSize:         20,
		Anomaly:          IPAuditFilterAll,
		Sort:             "risk",
	})
	require.NoError(t, err)
	require.Len(t, result.Items, 2)

	item := result.Items[0]
	assert.Equal(t, "203.0.113.10", item.IP)
	assert.Equal(t, int64(4), item.RequestCount)
	assert.Equal(t, int64(2), item.UserCount)
	assert.Equal(t, int64(3), item.PeakRPM)
	assert.True(t, item.RequestCountAnomaly)
	assert.True(t, item.SharedUserAnomaly)
	assert.True(t, item.CountAnomaly)
	assert.True(t, item.RPMAnomaly)
	require.Len(t, item.Users, 2)
	assert.Equal(t, int64(3), item.Users[0].RequestCount)
	assert.Equal(t, firstUser.Username, item.Users[0].Username)

	assert.Equal(t, int64(2), result.Summary.TotalIPs)
	assert.Equal(t, int64(2), result.Summary.TotalUsers)
	assert.Equal(t, int64(5), result.Summary.TotalRequests)
	assert.Equal(t, int64(1), result.Summary.CountAnomalyIPs)
	assert.Equal(t, int64(1), result.Summary.RPMAnomalyIPs)
	assert.Equal(t, int64(1), result.Summary.AnyAnomalyIPs)
}

func TestGetIPAuditFiltersAndPaginates(t *testing.T) {
	firstUser, _ := setupIPAuditFixture(t)
	base := time.Date(2026, 7, 20, 13, 0, 0, 0, time.UTC)

	for index := 0; index < 3; index++ {
		require.NoError(t, RecordIPAuditRequest(firstUser.Id, firstUser.Username, "203.0.113.10", base))
	}
	require.NoError(t, RecordIPAuditRequest(firstUser.Id, firstUser.Username, "198.51.100.20", base))

	result, err := GetIPAudit(IPAuditQuery{
		StartAt:          base.Add(-time.Minute).Unix(),
		EndAt:            base.Add(time.Minute).Unix(),
		RequestThreshold: 3,
		UserThreshold:    5,
		RPMThreshold:     10,
		Page:             1,
		PageSize:         1,
		Keyword:          "203.0.113",
		Anomaly:          IPAuditFilterCount,
		Sort:             "requests",
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), result.Total)
	require.Len(t, result.Items, 1)
	assert.Equal(t, "203.0.113.10", result.Items[0].IP)
	assert.Equal(t, int64(2), result.Summary.TotalIPs)
	assert.Equal(t, int64(4), result.Summary.TotalRequests)
}
