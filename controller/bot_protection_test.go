package controller

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestBotProtectionPersistsValidatedSettingsAndPreservesSecrets(t *testing.T) {
	t.Setenv("SNOW_SHIELD_ENABLED", "true")
	t.Setenv("SNOW_SHIELD_HOSTNAME", "api.example.test")
	previousDB, previousOptions := model.DB, common.OptionMap
	oldSite, oldSecret, oldSecure, oldLogin := common.TurnstileSiteKey, common.TurnstileSecretKey, common.SessionCookieSecure, common.TurnstileCheckEnabled
	oldMaster, oldPath := common.IsMasterNode, common.SQLitePath
	oldMainType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
	t.Setenv("SQL_DSN", "local")
	t.Setenv("LOG_SQL_DSN", "")
	common.IsMasterNode = false
	common.SQLitePath = "file:bot-protection-settings?mode=memory&cache=shared"
	require.NoError(t, model.InitDB())
	db := model.DB
	common.OptionMap = map[string]string{}
	common.TurnstileSiteKey, common.TurnstileSecretKey, common.SessionCookieSecure = "saved-site", "saved-secret", true
	t.Cleanup(func() {
		model.DB, common.OptionMap = previousDB, previousOptions
		common.IsMasterNode, common.SQLitePath = oldMaster, oldPath
		common.SetDatabaseTypes(oldMainType, oldLogType)
		common.TurnstileSiteKey, common.TurnstileSecretKey, common.SessionCookieSecure, common.TurnstileCheckEnabled = oldSite, oldSecret, oldSecure, oldLogin
		sqlDB, closeErr := db.DB()
		require.NoError(t, closeErr)
		require.NoError(t, sqlDB.Close())
	})
	require.NoError(t, db.AutoMigrate(&model.Option{}))
	engine := gin.New()
	engine.PUT("/settings", UpdateBotProtection)
	engine.GET("/settings", GetOptions)
	engine.PUT("/generic", UpdateOption)
	assert.True(t, service.SnowShieldEnabled(), "existing environment protection must survive migration")
	for _, enabled := range []bool{false, true} {
		payload, marshalErr := common.Marshal(map[string]any{
			"SnowShieldEnabled": enabled, "SnowShieldHostname": "api.example.test",
			"SnowShieldTrustMinutes": 30, "TurnstileCheckEnabled": true,
			"TurnstileSiteKey": "", "TurnstileSecretKey": "",
		})
		require.NoError(t, marshalErr)
		writer := httptest.NewRecorder()
		engine.ServeHTTP(writer, httptest.NewRequest(http.MethodPut, "https://api.example.test/settings", bytes.NewReader(payload)))
		require.Contains(t, writer.Body.String(), `"success":true`)
		assert.Equal(t, enabled, service.SnowShieldEnabled())
		assert.Equal(t, 30, service.GetSnowShieldSettings().TrustMinutes)
		assert.True(t, common.TurnstileCheckEnabled, "login verification is independent")
		assert.Equal(t, "saved-secret", common.TurnstileSecretKey)
		assert.Equal(t, "saved-site", common.TurnstileSiteKey)
		var saved model.Option
		require.NoError(t, db.Where("key = ?", "SnowShieldSettings").First(&saved).Error)
		var config service.SnowShieldSettings
		require.NoError(t, common.UnmarshalJsonStr(saved.Value, &config))
		assert.Equal(t, enabled, config.Enabled)
	}
	writer := httptest.NewRecorder()
	engine.ServeHTTP(writer, httptest.NewRequest(http.MethodGet, "https://api.example.test/settings", nil))
	assert.Contains(t, writer.Body.String(), "SnowShieldReady")
	assert.NotContains(t, writer.Body.String(), "saved-secret")
	assert.NotContains(t, writer.Body.String(), "SnowShieldSettings")

	for _, tc := range []struct {
		name    string
		enabled bool
		host    string
		minutes any
	}{
		{"zero", true, "api.example.test", 0},
		{"too-long", true, "api.example.test", 1441},
		{"fraction", true, "api.example.test", 1.5},
		{"wrong-host", true, "other.example.test", 60},
		{"URL-not-host", true, "https://api.example.test", 60},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := service.GetSnowShieldSettings()
			payload, marshalErr := common.Marshal(map[string]any{"SnowShieldEnabled": tc.enabled, "SnowShieldHostname": tc.host, "SnowShieldTrustMinutes": tc.minutes, "TurnstileCheckEnabled": false})
			require.NoError(t, marshalErr)
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "https://api.example.test/settings", bytes.NewReader(payload)))
			assert.Contains(t, w.Body.String(), `"success":false`)
			assert.Equal(t, before, service.GetSnowShieldSettings())
			assert.True(t, common.TurnstileCheckEnabled)
		})
	}
	t.Run("generic-options-cannot-bypass-validation", func(t *testing.T) {
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "https://api.example.test/generic", bytes.NewBufferString(`{"key":"SnowShieldSettings","value":"{}"}`)))
		assert.Contains(t, w.Body.String(), `"success":false`)
		assert.True(t, service.SnowShieldEnabled())
	})
	t.Run("database-error-rolls-back-whole-save", func(t *testing.T) {
		before := service.GetSnowShieldSettings()
		require.NoError(t, db.Callback().Create().Before("gorm:create").Register("reject-provider-save", func(tx *gorm.DB) {
			if option, ok := tx.Statement.Dest.(*model.Option); ok && option.Key == "TurnstileSiteKey" {
				tx.AddError(errors.New("test database failure"))
			}
		}))
		defer db.Callback().Create().Remove("reject-provider-save")
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "https://api.example.test/settings", bytes.NewBufferString(`{"SnowShieldEnabled":false,"SnowShieldHostname":"api.example.test","SnowShieldTrustMinutes":10,"TurnstileCheckEnabled":false,"TurnstileSiteKey":"replacement-site"}`)))
		assert.Contains(t, w.Body.String(), `"success":false`)
		assert.Equal(t, before, service.GetSnowShieldSettings())
		assert.True(t, common.TurnstileCheckEnabled)
		assert.Equal(t, "saved-site", common.TurnstileSiteKey)
		var saved model.Option
		require.NoError(t, db.Where("key = ?", "SnowShieldSettings").First(&saved).Error)
		var config service.SnowShieldSettings
		require.NoError(t, common.UnmarshalJsonStr(saved.Value, &config))
		assert.Equal(t, before, config)
	})
}
