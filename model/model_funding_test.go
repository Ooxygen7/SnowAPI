package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelFundingOptionsValidatePersistAndClear(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Option{}, &Ability{}))
	const key = operation_setting.ModelFundingSourcesOption
	common.OptionMapRWMutex.Lock()
	previousRules := operation_setting.GetQuotaSetting().ModelFundingSources
	previousMap := common.OptionMap
	common.OptionMap = map[string]string{}
	operation_setting.GetQuotaSetting().ModelFundingSources = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		require.NoError(t, DB.Where("channel_id = ?", 990001).Delete(&Ability{}).Error)
		require.NoError(t, DB.Where(commonKeyCol+" IN ?", []string{key, "funding_test_atomic"}).Delete(&Option{}).Error)
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousMap
		operation_setting.GetQuotaSetting().ModelFundingSources = previousRules
		common.OptionMapRWMutex.Unlock()
	})
	require.NoError(t, DB.Create(&Ability{Group: "default", Model: "funding-a", ChannelId: 990001, Enabled: true}).Error)
	require.NoError(t, DB.Create(&Ability{Group: "default", Model: "funding-b", ChannelId: 990001, Enabled: false}).Error)
	raw := `{"funding-a":"subscription_only","funding-b":"wallet_only"}`
	require.NoError(t, UpdateOption(key, raw))
	assert.Equal(t, "subscription_only", operation_setting.GetModelFundingSource("funding-a"))
	assert.Equal(t, "wallet_only", operation_setting.GetModelFundingSource("funding-b"))
	for _, invalid := range []string{`null`, `[]`, `{"funding-a":"wallet_first"}`, `{"funding-a":["wallet_only","subscription_only"]}`, `{" funding-a":"wallet_only"}`, `{"not-configured":"wallet_only"}`} {
		require.Error(t, UpdateOptionsBulk(map[string]string{key: invalid, "funding_test_atomic": "must-not-be-committed"}))
		var saved Option
		require.NoError(t, DB.Where(commonKeyCol+" = ?", key).First(&saved).Error)
		assert.JSONEq(t, raw, saved.Value)
		assert.Equal(t, "subscription_only", operation_setting.GetModelFundingSource("funding-a"))
		var count int64
		require.NoError(t, DB.Model(&Option{}).Where(commonKeyCol+" = ?", "funding_test_atomic").Count(&count).Error)
		assert.Zero(t, count)
	}
	// Removing a channel must not prevent saving or removing an existing rule.
	require.NoError(t, DB.Where("channel_id = ?", 990001).Delete(&Ability{}).Error)
	require.NoError(t, UpdateOption(key, raw))
	require.NoError(t, UpdateOption(key, `{"funding-b":"wallet_only"}`))
	assert.Empty(t, operation_setting.GetModelFundingSource("funding-a"))
	require.NoError(t, UpdateOption(key, `{}`))
	assert.Empty(t, operation_setting.GetModelFundingSource("funding-b"))
}
