package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"testing"
)

func TestAnnouncementAcknowledgementIsUserScopedAndDoesNotHideNewerPublications(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Option{}, &UserAnnouncementRead{}))
	oldEnabled := console_setting.GetConsoleSetting().AnnouncementsEnabled
	console_setting.GetConsoleSetting().AnnouncementsEnabled = true
	users := []User{{Username: "notice-a", AffCode: "notice-a"}, {Username: "notice-b", AffCode: "notice-b"}}
	require.NoError(t, DB.Create(&users).Error)
	t.Cleanup(func() {
		console_setting.GetConsoleSetting().AnnouncementsEnabled = oldEnabled
		for _, user := range users {
			require.NoError(t, DB.Where("user_id = ?", user.Id).Delete(&UserAnnouncementRead{}).Error)
			require.NoError(t, DB.Unscoped().Delete(&user).Error)
		}
		require.NoError(t, DB.Where(&Option{Key: "console_setting.announcements"}).Delete(&Option{}).Error)
		require.NoError(t, DB.Where(&Option{Key: "console_setting.announcement_revision"}).Delete(&Option{}).Error)
	})
	notices := []ConsoleAnnouncement{{Id: 1, Content: "first", PublishDate: "2026-09-01T00:00:00Z"}}
	publish := func() int64 {
		encoded, err := common.Marshal(notices)
		require.NoError(t, err)
		values := map[string]string{"console_setting.announcements": string(encoded)}
		require.NoError(t, DB.Transaction(func(tx *gorm.DB) error { return UpdateOptionsWithTx(tx, values) }))
		require.NoError(t, common.UnmarshalJsonStr(values["console_setting.announcements"], &notices))
		if len(notices) == 0 {
			return 0
		}
		return notices[len(notices)-1].Revision
	}
	first := publish()
	notice, err := GetUnreadConsoleAnnouncement(users[0].Id)
	require.NoError(t, err)
	require.NotNil(t, notice)
	assert.Equal(t, first, notice.Revision)
	// Same content/reordered saves do not re-notify; forged client revision ignored.
	notices[0].Revision = first + 99999999
	assert.Equal(t, first, publish())
	notices = append(notices, ConsoleAnnouncement{Id: 2, Content: "second", PublishDate: "2026-09-01T00:00:00Z"})
	second := publish()
	require.Greater(t, second, first)
	require.NoError(t, AcknowledgeConsoleAnnouncement(users[0].Id, first))
	notice, err = GetUnreadConsoleAnnouncement(users[0].Id)
	require.NoError(t, err)
	require.NotNil(t, notice)
	assert.Equal(t, second, notice.Revision)
	require.NoError(t, AcknowledgeConsoleAnnouncement(users[0].Id, second))
	require.NoError(t, AcknowledgeConsoleAnnouncement(users[0].Id, first))
	notice, err = GetUnreadConsoleAnnouncement(users[0].Id)
	require.NoError(t, err)
	assert.Nil(t, notice)
	other, err := GetUnreadConsoleAnnouncement(users[1].Id)
	require.NoError(t, err)
	require.NotNil(t, other)
	assert.Equal(t, second, other.Revision)
	assert.Error(t, AcknowledgeConsoleAnnouncement(users[0].Id, second+9999999))
	// Clearing and re-adding an ID remains a new publication.
	notices = nil
	publish()
	notices = []ConsoleAnnouncement{{Id: 1, Content: "new", PublishDate: "2026-09-01T00:00:00Z"}}
	require.Greater(t, publish(), second)
	console_setting.GetConsoleSetting().AnnouncementsEnabled = false
	notice, err = GetUnreadConsoleAnnouncement(users[0].Id)
	require.NoError(t, err)
	assert.Nil(t, notice)
}
