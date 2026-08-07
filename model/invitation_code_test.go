package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupInvitationFixture(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&InvitationCode{}, &User{}))
	require.NoError(t, DB.Unscoped().Where("name = ?", "invitation-test").Delete(&InvitationCode{}).Error)
	require.NoError(t, DB.Unscoped().Where("username IN ?", []string{"invite-user-one", "invite-user-two", "oauth-invite-user"}).Delete(&User{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Unscoped().Where("name = ?", "invitation-test").Delete(&InvitationCode{}).Error)
		require.NoError(t, DB.Unscoped().Where("username IN ?", []string{"invite-user-one", "invite-user-two", "oauth-invite-user"}).Delete(&User{}).Error)
	})
}

func TestInvitationCodeRegistersExactlyOneAccount(t *testing.T) {
	setupInvitationFixture(t)

	codes, err := CreateInvitationCodes("invitation-test", 1, 0)
	require.NoError(t, err)
	require.Len(t, codes, 1)

	var stored InvitationCode
	require.NoError(t, DB.Where("name = ?", "invitation-test").First(&stored).Error)
	assert.NotEqual(t, codes[0], stored.CodeHash)
	assert.NotContains(t, stored.CodePrefix, codes[0])

	firstUser := &User{
		Username:    "invite-user-one",
		Password:    "password123",
		DisplayName: "invite-user-one",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	require.NoError(t, RegisterWithInvitationCode(codes[0], firstUser))
	assert.NotZero(t, firstUser.Id)
	assert.True(t, common.ValidatePasswordAndHash("password123", firstUser.Password))

	require.NoError(t, DB.First(&stored, stored.Id).Error)
	assert.Equal(t, InvitationCodeStatusUsed, stored.Status)
	assert.Equal(t, firstUser.Id, stored.UsedBy)
	assert.NotZero(t, stored.UsedAt)

	isInvited, err := IsInvitationAccount(firstUser.Id)
	require.NoError(t, err)
	assert.True(t, isInvited)

	secondUser := &User{
		Username:    "invite-user-two",
		Password:    "password123",
		DisplayName: "invite-user-two",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	err = RegisterWithInvitationCode(codes[0], secondUser)
	require.ErrorIs(t, err, ErrInvitationCodeUsed)

	var secondCount int64
	require.NoError(t, DB.Unscoped().Model(&User{}).Where("username = ?", secondUser.Username).Count(&secondCount).Error)
	assert.Zero(t, secondCount)
	assert.ErrorIs(t, UpdateInvitationCodeStatus(stored.Id, InvitationCodeStatusEnabled), ErrInvitationCodeLocked)
	assert.ErrorIs(t, DeleteInvitationCode(stored.Id), ErrInvitationCodeLocked)
}

func TestDisabledInvitationCodeCannotRegister(t *testing.T) {
	setupInvitationFixture(t)

	codes, err := CreateInvitationCodes("invitation-test", 1, 0)
	require.NoError(t, err)
	var stored InvitationCode
	require.NoError(t, DB.Where("name = ?", "invitation-test").First(&stored).Error)
	require.NoError(t, UpdateInvitationCodeStatus(stored.Id, InvitationCodeStatusDisabled))

	user := &User{
		Username:    "invite-user-one",
		Password:    "password123",
		DisplayName: "invite-user-one",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	assert.ErrorIs(t, RegisterWithInvitationCode(codes[0], user), ErrInvitationCodeOff)

	var userCount int64
	require.NoError(t, DB.Unscoped().Model(&User{}).Where("username = ?", user.Username).Count(&userCount).Error)
	assert.Zero(t, userCount)

	require.NoError(t, UpdateInvitationCodeStatus(stored.Id, InvitationCodeStatusEnabled))
	require.NoError(t, DeleteInvitationCode(stored.Id))
	require.Error(t, DB.First(&InvitationCode{}, stored.Id).Error)
}

func TestInvalidInvitationRollsBackOAuthStyleUserCreation(t *testing.T) {
	setupInvitationFixture(t)

	user := &User{
		Username:    "oauth-invite-user",
		DisplayName: "oauth-invite-user",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := user.InsertWithTx(tx, 0); err != nil {
			return err
		}
		return UseInvitationCodeWithTx(tx, "not-a-real-code", user.Id)
	})
	require.ErrorIs(t, err, ErrInvitationCodeInvalid)

	var userCount int64
	require.NoError(t, DB.Unscoped().Model(&User{}).Where("username = ?", user.Username).Count(&userCount).Error)
	assert.Zero(t, userCount)
}
