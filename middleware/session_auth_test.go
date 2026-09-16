package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupSessionAuthUser(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	previous := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previous; _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserIDSequence{}))
	require.NoError(t, db.Create(&model.User{Id: 1, Username: "tester", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "Free"}).Error)
	return db
}

func TestSessionAuthUsesCurrentAccountState(t *testing.T) {
	for _, test := range []struct {
		name    string
		change  map[string]interface{}
		deleted bool
		allowed bool
	}{
		{name: "group changed", change: map[string]interface{}{"role": common.RoleAdminUser, "group": "Heavy"}, allowed: true},
		{name: "demoted", change: map[string]interface{}{"role": common.RoleCommonUser}},
		{name: "disabled", change: map[string]interface{}{"role": common.RoleAdminUser, "status": common.UserStatusDisabled}},
		{name: "deleted", deleted: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			db := setupSessionAuthUser(t)
			gin.SetMode(gin.TestMode)
			r := gin.New()
			r.Use(sessions.Sessions("session", cookie.NewStore([]byte("session-auth-test-secret"))))
			r.GET("/login", func(c *gin.Context) {
				s := sessions.Default(c)
				var user model.User
				require.NoError(t, db.First(&user, 1).Error)
				s.Set("identity", user.SessionNonce)
				for key, value := range map[string]interface{}{"id": 1, "username": "tester", "role": common.RoleAdminUser, "status": common.UserStatusEnabled, "group": "Free"} {
					s.Set(key, value)
				}
				require.NoError(t, s.Save())
				c.Status(http.StatusNoContent)
			})
			called := false
			r.GET("/admin", AdminAuth(), func(c *gin.Context) { called = true; c.JSON(200, gin.H{"group": c.GetString("group")}) })
			login := httptest.NewRecorder()
			r.ServeHTTP(login, httptest.NewRequest("GET", "/login", nil))
			if test.deleted {
				require.NoError(t, db.Unscoped().Delete(&model.User{}, 1).Error)
			} else {
				require.NoError(t, db.Model(&model.User{}).Where("id = ?", 1).Updates(test.change).Error)
			}
			request := httptest.NewRequest("GET", "/admin", nil)
			request.Header.Set("New-Api-User", "1")
			for _, cookie := range login.Result().Cookies() {
				request.AddCookie(cookie)
			}
			response := httptest.NewRecorder()
			r.ServeHTTP(response, request)
			assert.Equal(t, test.allowed, called)
			if test.allowed {
				assert.JSONEq(t, `{"group":"Heavy"}`, response.Body.String())
			}
			if test.deleted {
				assert.Equal(t, http.StatusUnauthorized, response.Code)
			}
		})
	}
}

func TestAllSessionAuthPathsRejectReusedUserID(t *testing.T) {
	for _, path := range []string{"user", "admin", "optional", "token-or-session"} {
		t.Run(path, func(t *testing.T) {
			db := setupSessionAuthUser(t)
			var original model.User
			require.NoError(t, db.First(&original, 1).Error)
			router := gin.New()
			router.Use(sessions.Sessions("session", cookie.NewStore([]byte("isolation-regression-secret"))))
			router.GET("/login", func(c *gin.Context) {
				s := sessions.Default(c)
				for key, value := range map[string]interface{}{"id": 1, "identity": original.SessionNonce, "username": "tester", "role": common.RoleAdminUser, "status": common.UserStatusEnabled} {
					s.Set(key, value)
				}
				require.NoError(t, s.Save())
			})
			middleware := UserAuth()
			switch path {
			case "admin":
				middleware = AdminAuth()
			case "optional":
				middleware = TryUserAuth()
			case "token-or-session":
				middleware = TokenOrUserAuth()
			}
			resolvedID := 0
			router.GET("/target", middleware, func(c *gin.Context) { resolvedID = c.GetInt("id"); c.Status(http.StatusNoContent) })
			login := httptest.NewRecorder()
			router.ServeHTTP(login, httptest.NewRequest("GET", "/login", nil))
			require.NoError(t, db.Unscoped().Delete(&original).Error)
			require.NoError(t, db.Create(&model.User{Id: 1, Username: "replacement", Role: common.RoleAdminUser, Status: common.UserStatusEnabled}).Error)
			request := httptest.NewRequest("GET", "/target", nil)
			request.Header.Set("New-Api-User", "1")
			for _, cookie := range login.Result().Cookies() {
				request.AddCookie(cookie)
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			assert.Zero(t, resolvedID, "old cookie must never resolve the replacement account")
			if path != "optional" {
				assert.Equal(t, http.StatusUnauthorized, response.Code)
			}
		})
	}
}
