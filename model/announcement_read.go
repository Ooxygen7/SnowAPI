package model

import (
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"gorm.io/gorm"
)

type ConsoleAnnouncement struct {
	Id          int    `json:"id"`
	Content     string `json:"content"`
	PublishDate string `json:"publishDate"`
	Type        string `json:"type,omitempty"`
	Extra       string `json:"extra,omitempty"`
	Revision    int64  `json:"revision"`
}

type UserAnnouncementRead struct {
	UserId   int   `gorm:"primaryKey;autoIncrement:false"`
	Revision int64 `gorm:"type:bigint;not null"`
}

func announcementRevision(item ConsoleAnnouncement) int64 {
	if item.Revision > 0 {
		return item.Revision
	}
	published, err := time.Parse(time.RFC3339, item.PublishDate)
	if err != nil {
		return 0
	}
	return max(published.UnixMilli(), 1)
}

// Published revisions are assigned by the server under the option row lock.
// Editing a notice publishes a new revision; reorder and client-supplied
// revision numbers do not reset readers' acknowledgements.
func prepareAnnouncementRevisions(previous, incoming string, now int64) (string, int64, error) {
	var old, next []ConsoleAnnouncement
	if strings.TrimSpace(previous) != "" {
		if err := common.UnmarshalJsonStr(previous, &old); err != nil {
			return "", 0, err
		}
	}
	if err := common.UnmarshalJsonStr(incoming, &next); err != nil {
		return "", 0, err
	}
	byID := make(map[int]ConsoleAnnouncement, len(old))
	revision := now
	for _, item := range old {
		byID[item.Id] = item
		revision = max(revision, announcementRevision(item))
	}
	for i := range next {
		item := &next[i]
		prior, exists := byID[item.Id]
		if exists && prior.Content == item.Content && prior.PublishDate == item.PublishDate && prior.Extra == item.Extra {
			item.Revision = announcementRevision(prior)
		} else {
			revision++
			item.Revision = revision
		}
	}
	encoded, err := common.Marshal(next)
	return string(encoded), revision, err
}

func latestConsoleAnnouncement(tx *gorm.DB) (*ConsoleAnnouncement, error) {
	var option Option
	if err := tx.Where(&Option{Key: "console_setting.announcements"}).Find(&option).Error; err != nil {
		return nil, err
	}
	if strings.TrimSpace(option.Value) == "" {
		return nil, nil
	}
	var items []ConsoleAnnouncement
	if err := common.UnmarshalJsonStr(option.Value, &items); err != nil {
		return nil, err
	}
	var latest *ConsoleAnnouncement
	for i := range items {
		item := &items[i]
		item.Revision = announcementRevision(*item)
		if strings.TrimSpace(item.Content) != "" && (latest == nil || item.Revision > latest.Revision) {
			latest = item
		}
	}
	return latest, nil
}

func GetUnreadConsoleAnnouncement(userID int) (*ConsoleAnnouncement, error) {
	if !console_setting.GetConsoleSetting().AnnouncementsEnabled {
		return nil, nil
	}
	latest, err := latestConsoleAnnouncement(DB)
	if err != nil || latest == nil {
		return latest, err
	}
	var read UserAnnouncementRead
	if err := DB.Where("user_id = ?", userID).Find(&read).Error; err != nil {
		return nil, err
	}
	if read.Revision >= latest.Revision {
		return nil, nil
	}
	return latest, nil
}

func AcknowledgeConsoleAnnouncement(userID int, revision int64) error {
	if userID <= 0 || revision <= 0 {
		return errors.New("invalid announcement acknowledgement")
	}
	return runSubscriptionQuotaTransaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id").First(&user, userID).Error; err != nil {
			return err
		}
		latest, err := latestConsoleAnnouncement(tx)
		if err != nil {
			return err
		}
		if latest == nil || revision > latest.Revision {
			return errors.New("unknown announcement revision")
		}
		var read UserAnnouncementRead
		if err := tx.Where("user_id = ?", userID).Find(&read).Error; err != nil {
			return err
		}
		if read.Revision >= revision {
			return nil
		}
		if read.UserId == 0 {
			return tx.Create(&UserAnnouncementRead{UserId: userID, Revision: revision}).Error
		}
		return tx.Model(&read).Update("revision", revision).Error
	})
}
