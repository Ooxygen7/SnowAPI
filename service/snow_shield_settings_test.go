package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSnowShieldConfigurationFailsClosedAndValidatesPrerequisites(t *testing.T) {
	previous, oldSecure := common.OptionMap, common.SessionCookieSecure
	common.OptionMap = map[string]string{}
	common.SessionCookieSecure = true
	t.Cleanup(func() { common.OptionMap, common.SessionCookieSecure = previous, oldSecure })
	t.Setenv("SNOW_SHIELD_ENABLED", "true")
	t.Setenv("SNOW_SHIELD_HOSTNAME", "api.example.test")
	config := GetSnowShieldSettings()
	require.NoError(t, ValidateSnowShieldConfiguration(config, "site", "secret"))
	require.Error(t, ValidateSnowShieldConfiguration(config, "site", ""))
	common.SessionCookieSecure = false
	require.Error(t, ValidateSnowShieldConfiguration(config, "site", "secret"))
	config.Enabled = false
	require.NoError(t, ValidateSnowShieldConfiguration(config, "", ""), "admins must always be able to disable protection")
	common.OptionMap["SnowShieldSettings"] = "malformed"
	assert.True(t, GetSnowShieldSettings().Enabled, "corrupt saved settings must not fail open")
	require.Error(t, ValidateSnowShieldSettings())
}
