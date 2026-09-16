package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGetSelfReportsPasswordAvailabilityWithoutExposingCredentials(t *testing.T) {
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open("file:profile-password?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		sqlDB, closeErr := db.DB()
		require.NoError(t, closeErr)
		require.NoError(t, sqlDB.Close())
	})
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserIDSequence{}, &model.TopUp{}))
	gin.SetMode(gin.TestMode)

	for index, tc := range []struct {
		name     string
		password string
		oauthID  string
		want     bool
	}{
		{"password account", "private-password-hash", "", true},
		{"OAuth only", "", "oauth-subject", false},
		{"password with OAuth binding", "private-password-hash", "bound-subject", true},
		{"passwordless account", "", "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			secret := "private-management-token"
			user := model.User{Id: index + 1, Username: tc.name, Password: tc.password,
				Role: common.RoleCommonUser, Status: common.UserStatusEnabled,
				Group: "Free", OidcId: tc.oauthID, AccessToken: &secret}
			require.NoError(t, db.Create(&user).Error)
			t.Cleanup(func() { require.NoError(t, db.Unscoped().Delete(&user).Error) })
			response := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(response)
			context.Set("id", user.Id)
			context.Set("role", user.Role)
			GetSelf(context)

			assert.Equal(t, http.StatusOK, response.Code)
			var result struct {
				Success bool           `json:"success"`
				Data    map[string]any `json:"data"`
			}
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
			require.True(t, result.Success, response.Body.String())
			assert.Equal(t, tc.want, result.Data["has_password"])
			assert.NotContains(t, result.Data, "password")
			assert.NotContains(t, result.Data, "access_token")
			assert.NotContains(t, response.Body.String(), secret)
			assert.NotContains(t, response.Body.String(), "private-password-hash")
		})
	}
}
