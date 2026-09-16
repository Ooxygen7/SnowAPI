package model

import (
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDeletedAccountIdentityIsNeverReassigned(t *testing.T) {
	truncateTables(t)
	old := User{Username: "identity-old", AffCode: "identity-old", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(&old).Error)
	require.NoError(t, DB.Create(&Token{UserId: old.Id, Key: "identity-token", Status: common.TokenStatusEnabled}).Error)
	require.NoError(t, DB.Create(&UserSubscription{UserId: old.Id, PlanId: 1, Status: "active", EndTime: common.GetTimestamp() + 3600}).Error)
	require.NoError(t, DB.Create(&PasskeyCredential{UserID: old.Id, CredentialID: "identity-passkey", PublicKey: "fixture"}).Error)
	require.NoError(t, DB.Create(&UserOAuthBinding{UserId: old.Id, ProviderId: 1, ProviderUserId: "identity-oauth"}).Error)
	require.NoError(t, HardDeleteUserById(old.Id))

	current := User{Username: "identity-new", AffCode: "identity-new", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(&current).Error)
	assert.Greater(t, current.Id, old.Id)
	assert.NotEmpty(t, current.SessionNonce)
	assert.NotEqual(t, current.SessionNonce, old.SessionNonce)
	_, err := ValidateSessionUser(old.Id, old.SessionNonce)
	assert.ErrorIs(t, err, ErrSessionIdentityInvalid)
	var token Token
	require.NoError(t, DB.Where("user_id = ?", old.Id).First(&token).Error)
	assert.Equal(t, common.TokenStatusDisabled, token.Status)
	var subscription UserSubscription
	require.NoError(t, DB.Where("user_id = ?", old.Id).First(&subscription).Error)
	assert.Equal(t, "cancelled", subscription.Status)
	var passkeys, bindings int64
	require.NoError(t, DB.Unscoped().Model(&PasskeyCredential{}).Where("user_id = ?", old.Id).Count(&passkeys).Error)
	require.NoError(t, DB.Model(&UserOAuthBinding{}).Where("user_id = ?", old.Id).Count(&bindings).Error)
	assert.Zero(t, passkeys)
	assert.Zero(t, bindings)
}

func TestIdentityMigrationPreservesHistoricalUserIDHighWaterMark(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.Create(&Log{UserId: 20000, Username: "historically-deleted", Type: LogTypeLogin}).Error)
	require.NoError(t, InitializeUserIdentities())
	user := User{Username: "identity-migrated", AffCode: "identity-migrated", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(&user).Error)
	assert.Greater(t, user.Id, 20000)
	nonce := user.SessionNonce
	require.NoError(t, InitializeUserIdentities())
	require.NoError(t, DB.First(&user, user.Id).Error)
	assert.Equal(t, nonce, user.SessionNonce)
}

func TestSessionIncarnationRejectsRecreatedUsernameAndID(t *testing.T) {
	truncateTables(t)
	old := User{Username: "identity-recreated", AffCode: "identity-recreated", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(&old).Error)
	// Simulate a legacy/manual restore that bypasses the production allocator.
	require.NoError(t, DB.Unscoped().Delete(&old).Error)
	current := User{Id: old.Id, Username: old.Username, AffCode: old.AffCode, Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(&current).Error)
	_, err := ValidateSessionUser(current.Id, old.SessionNonce)
	assert.ErrorIs(t, err, ErrSessionIdentityInvalid)
	_, err = ValidateSessionUser(current.Id, "")
	assert.ErrorIs(t, err, ErrSessionIdentityInvalid)
	_, err = ValidateSessionUser(current.Id, current.SessionNonce)
	require.NoError(t, err)
}

func TestConcurrentAccountCreationCannotShareAnIdentity(t *testing.T) {
	truncateTables(t)
	start := make(chan struct{})
	var wg sync.WaitGroup
	users := []User{{Username: "identity-parallel-a", AffCode: "parallel-a"}, {Username: "identity-parallel-b", AffCode: "parallel-b"}}
	errors := make([]error, len(users))
	for index := range users {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			errors[index] = DB.Create(&users[index]).Error
		}(index)
	}
	close(start)
	wg.Wait()
	for _, err := range errors {
		require.NoError(t, err)
	}
	assert.NotEqual(t, users[0].Id, users[1].Id)
	assert.NotEqual(t, users[0].SessionNonce, users[1].SessionNonce)
}

func TestCachedTokenCannotAuthenticateDeletedOrRecreatedOwner(t *testing.T) {
	truncateTables(t)
	owner := User{Username: "token-owner", AffCode: "token-owner", Status: common.UserStatusEnabled, CreatedAt: 100}
	require.NoError(t, DB.Create(&owner).Error)
	token := &Token{UserId: owner.Id, CreatedTime: 101}
	require.NoError(t, ValidateTokenOwner(token))
	require.NoError(t, HardDeleteUserById(owner.Id))
	assert.ErrorIs(t, ValidateTokenOwner(token), ErrTokenInvalid)
	replacement := User{Id: owner.Id, Username: "token-replacement", AffCode: "token-replacement", Status: common.UserStatusEnabled, CreatedAt: 200}
	require.NoError(t, DB.Create(&replacement).Error)
	assert.ErrorIs(t, ValidateTokenOwner(token), ErrTokenInvalid)
}
