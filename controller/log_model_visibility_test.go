package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUsageLogActualModelVisibility(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	oldDB, oldLogDB := model.DB, model.LOG_DB
	oldMainType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
	settings := model_setting.GetGlobalSettings()
	oldSetting := settings.ShowActualModelInLogs
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		model.DB, model.LOG_DB = oldDB, oldLogDB
		common.SetDatabaseTypes(oldMainType, oldLogType)
		settings.ShowActualModelInLogs = oldSetting
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
	})
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Log{}, &model.Channel{}))
	const rawOther = `{"is_model_mapped":true,"upstream_model_name":"private/provider-model","model_ratio":2,"admin_info":{"secret":"hidden"}}`
	for _, role := range []int{common.RoleCommonUser, common.RoleAdminUser, common.RoleRootUser} {
		require.NoError(t, db.Table("users").Create(map[string]interface{}{
			"id": role, "username": fmt.Sprintf("log-viewer-%d", role), "role": role,
			"status": common.UserStatusEnabled, "group": "Free", "password": "",
		}).Error)
		require.NoError(t, db.Create(&model.Log{
			UserId: role, TokenId: role, Type: model.LogTypeConsume,
			ModelName: "public-model", Other: rawOther, Quota: 42,
		}).Error)
		require.NoError(t, db.Create(&model.Log{
			UserId: 9999, TokenId: role, Type: model.LogTypeConsume,
			ModelName: "another-users-historic-model", Other: rawOther,
		}).Error)
	}
	for _, enabled := range []bool{true, false} {
		for _, role := range []int{common.RoleCommonUser, common.RoleAdminUser, common.RoleRootUser} {
			for _, path := range []string{"/self", "/self?types=2", "/token"} {
				t.Run(fmt.Sprintf("enabled=%t/role=%d%s", enabled, role, path), func(t *testing.T) {
					settings.ShowActualModelInLogs = enabled
					router := gin.New()
					router.Use(func(c *gin.Context) {
						c.Set("id", role)
						c.Set("token_id", role)
						// Permission must use the persisted viewer, not a claimed role.
						c.Set("role", common.RoleRootUser)
					})
					router.GET("/self", GetUserLogs)
					router.GET("/token", GetLogByKey)
					response := httptest.NewRecorder()
					router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
					require.Equal(t, http.StatusOK, response.Code)
					var result struct {
						Success bool        `json:"success"`
						Data    interface{} `json:"data"`
					}
					require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
					require.True(t, result.Success)
					var logs []*model.Log
					if path == "/token" {
						raw, err := common.Marshal(result.Data)
						require.NoError(t, err)
						require.NoError(t, common.Unmarshal(raw, &logs))
					} else {
						page, ok := result.Data.(map[string]interface{})
						require.True(t, ok)
						raw, err := common.Marshal(page["items"])
						require.NoError(t, err)
						require.NoError(t, common.Unmarshal(raw, &logs))
					}
					require.Len(t, logs, 1)
					assert.Equal(t, "public-model", logs[0].ModelName)
					assert.Equal(t, 42, logs[0].Quota)
					other, err := common.StrToMap(logs[0].Other)
					require.NoError(t, err)
					if enabled || role >= common.RoleAdminUser {
						assert.Equal(t, "private/provider-model", other["upstream_model_name"])
						assert.Equal(t, true, other["is_model_mapped"])
					} else {
						assert.NotContains(t, other, "upstream_model_name")
						assert.NotContains(t, other, "is_model_mapped")
						assert.NotContains(t, response.Body.String(), "private/provider-model")
					}
					assert.Equal(t, float64(2), other["model_ratio"])
					assert.NotContains(t, other, "admin_info")
					var stored model.Log
					require.NoError(t, db.Where("user_id = ?", role).First(&stored).Error)
					assert.JSONEq(t, rawOther, stored.Other)
				})
			}
		}
	}
}
