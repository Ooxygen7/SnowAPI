package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	InvitationCodeStatusEnabled  = 1
	InvitationCodeStatusDisabled = 2
	InvitationCodeStatusUsed     = 3
)

var (
	ErrInvitationCodeInvalid = errors.New("邀请码无效或不存在")
	ErrInvitationCodeUsed    = errors.New("邀请码已被使用")
	ErrInvitationCodeOff     = errors.New("邀请码已被停用")
	ErrInvitationCodeLocked  = errors.New("已使用的邀请码不能修改或删除")
	ErrInvitationUserExists  = errors.New("用户名已存在")
)

type InvitationCode struct {
	Id              int            `json:"id"`
	Name            string         `json:"name" gorm:"type:varchar(40);index"`
	CodeHash        string         `json:"-" gorm:"type:char(64);uniqueIndex"`
	CodePrefix      string         `json:"code_prefix" gorm:"type:varchar(32)"`
	Status          int            `json:"status" gorm:"type:int;default:1;index"`
	CreatedBy       int            `json:"created_by" gorm:"index"`
	UsedBy          int            `json:"used_by" gorm:"index"`
	CreatedAt       int64          `json:"created_at" gorm:"autoCreateTime;column:created_at"`
	UsedAt          int64          `json:"used_at" gorm:"default:0;column:used_at"`
	CreatorUsername string         `json:"creator_username" gorm:"-:all"`
	UsedUsername    string         `json:"used_username" gorm:"-:all"`
	DeletedAt       gorm.DeletedAt `json:"-" gorm:"index"`
}

func normalizeInvitationCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

func hashInvitationCode(code string) string {
	return common.GenerateHMAC(normalizeInvitationCode(code))
}

func maskInvitationCode(code string) string {
	code = normalizeInvitationCode(code)
	if len(code) <= 12 {
		return code
	}
	return code[:8] + "••••" + code[len(code)-4:]
}

func CreateInvitationCodes(name string, count int, createdBy int) ([]string, error) {
	codes := make([]string, 0, count)
	err := DB.Transaction(func(tx *gorm.DB) error {
		for i := 0; i < count; i++ {
			randomPart, err := common.GenerateRandomCharsKey(20)
			if err != nil {
				return err
			}
			randomPart = strings.ToUpper(randomPart)
			code := fmt.Sprintf("INV-%s-%s", randomPart[:10], randomPart[10:])
			record := InvitationCode{
				Name:       name,
				CodeHash:   hashInvitationCode(code),
				CodePrefix: maskInvitationCode(code),
				Status:     InvitationCodeStatusEnabled,
				CreatedBy:  createdBy,
				CreatedAt:  common.GetTimestamp(),
			}
			if err := tx.Create(&record).Error; err != nil {
				return err
			}
			codes = append(codes, code)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return codes, nil
}

func GetInvitationCodes(keyword string, status int, startIdx int, num int) ([]*InvitationCode, int64, error) {
	query := DB.Model(&InvitationCode{})
	keyword = strings.TrimSpace(keyword)
	if keyword != "" {
		query = query.Where("invitation_codes.name LIKE ? OR invitation_codes.code_prefix LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}
	if status != 0 {
		query = query.Where("invitation_codes.status = ?", status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var codes []*InvitationCode
	err := query.
		Select("invitation_codes.*, creators.username AS creator_username, users.username AS used_username").
		Joins("LEFT JOIN users AS creators ON creators.id = invitation_codes.created_by").
		Joins("LEFT JOIN users AS users ON users.id = invitation_codes.used_by").
		Order("invitation_codes.id DESC").
		Limit(num).
		Offset(startIdx).
		Scan(&codes).Error
	return codes, total, err
}

func UpdateInvitationCodeStatus(id int, status int) error {
	if status != InvitationCodeStatusEnabled && status != InvitationCodeStatusDisabled {
		return errors.New("无效的邀请码状态")
	}
	result := DB.Model(&InvitationCode{}).
		Where("id = ? AND status <> ?", id, InvitationCodeStatusUsed).
		Update("status", status)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrInvitationCodeLocked
	}
	return nil
}

func DeleteInvitationCode(id int) error {
	result := DB.Where("id = ? AND status <> ?", id, InvitationCodeStatusUsed).Delete(&InvitationCode{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrInvitationCodeLocked
	}
	return nil
}

func UseInvitationCodeWithTx(tx *gorm.DB, code string, userId int) error {
	if normalizeInvitationCode(code) == "" {
		return ErrInvitationCodeInvalid
	}

	codeHash := hashInvitationCode(code)
	var invitation InvitationCode
	if err := lockForUpdate(tx).Where("code_hash = ?", codeHash).First(&invitation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrInvitationCodeInvalid
		}
		return err
	}
	switch invitation.Status {
	case InvitationCodeStatusUsed:
		return ErrInvitationCodeUsed
	case InvitationCodeStatusDisabled:
		return ErrInvitationCodeOff
	case InvitationCodeStatusEnabled:
	default:
		return ErrInvitationCodeInvalid
	}

	result := tx.Model(&InvitationCode{}).
		Where("id = ? AND status = ?", invitation.Id, InvitationCodeStatusEnabled).
		Updates(map[string]interface{}{
			"status":  InvitationCodeStatusUsed,
			"used_by": userId,
			"used_at": common.GetTimestamp(),
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrInvitationCodeUsed
	}
	return nil
}

func RegisterWithInvitationCode(code string, user *User) error {
	err := DB.Transaction(func(tx *gorm.DB) error {
		var existing int64
		if err := tx.Unscoped().Model(&User{}).Where("username = ?", user.Username).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ErrInvitationUserExists
		}
		if err := user.InsertWithTx(tx, 0); err != nil {
			return err
		}

		return UseInvitationCodeWithTx(tx, code, user.Id)
	})
	if err != nil {
		return err
	}
	user.FinishInsert(0)
	return nil
}

func IsInvitationAccount(userId int) (bool, error) {
	var count int64
	err := DB.Model(&InvitationCode{}).
		Where("used_by = ? AND status = ?", userId, InvitationCodeStatusUsed).
		Count(&count).Error
	return count > 0, err
}
