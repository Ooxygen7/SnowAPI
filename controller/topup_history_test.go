package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestAdminTopUpHistoryUserIsolation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	originalDB := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = originalDB
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
	})
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}))
	for _, user := range []struct{ id, role int }{{11, common.RoleAdminUser}, {12, common.RoleCommonUser}} {
		require.NoError(t, db.Table("users").Create(map[string]interface{}{
			"id": user.id, "username": fmt.Sprintf("wallet-test-%d", user.id),
			"role": user.role, "status": common.UserStatusEnabled, "group": "Free", "password": "",
			"session_nonce": fmt.Sprintf("wallet-identity-%d", user.id),
		}).Error)
	}
	now := common.GetTimestamp()
	require.NoError(t, db.Create(&[]model.TopUp{
		{Id: 1, UserId: 21, TradeNo: "target-old", CreateTime: now - 60*86400, Status: common.TopUpStatusSuccess, Amount: 5, Money: 50},
		{Id: 2, UserId: 12, TradeNo: "other-target", CreateTime: now, Status: common.TopUpStatusSuccess},
		{Id: 3, UserId: 21, TradeNo: "target-new", CreateTime: now, Status: common.TopUpStatusPending},
		{Id: 4, UserId: 21, TradeNo: "literal%value", CreateTime: now, Status: common.TopUpStatusExpired},
	}).Error)
	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("wallet-history-test-session-key"))))
	router.GET("/session/:id", func(c *gin.Context) {
		id := 11
		role := common.RoleAdminUser
		if c.Param("id") == "12" {
			id, role = 12, common.RoleCommonUser
		}
		session := sessions.Default(c)
		session.Set("id", id)
		session.Set("username", fmt.Sprintf("wallet-test-%d", id))
		session.Set("role", role)
		session.Set("status", common.UserStatusEnabled)
		session.Set("group", "Free")
		session.Set("identity", fmt.Sprintf("wallet-identity-%d", id))
		require.NoError(t, session.Save())
		c.Status(http.StatusOK)
	})
	router.GET("/api/user/topup", middleware.AdminAuth(), GetAllTopUps)
	router.GET("/api/user/topup/self", middleware.UserAuth(), GetUserTopUps)
	type historyResponse struct {
		Success bool `json:"success"`
		Data    struct {
			Total int           `json:"total"`
			Items []model.TopUp `json:"items"`
		} `json:"data"`
	}
	for _, test := range []struct {
		name, path            string
		viewer, status, total int
		success               bool
		ids                   []int
	}{
		{"target only including old orders", "/api/user/topup?user_id=21", 11, 200, 3, true, []int{4, 3, 1}},
		{"scoped pagination", "/api/user/topup?user_id=21&p=2&page_size=1", 11, 200, 3, true, []int{3}},
		{"scoped search", "/api/user/topup?user_id=21&keyword=target%25", 11, 200, 2, true, []int{3, 1}},
		{"exact order search", "/api/user/topup?user_id=21&keyword=target-new", 11, 200, 1, true, []int{3}},
		{"broad wildcard rejected", "/api/user/topup?user_id=21&keyword=%25", 11, 200, 0, false, nil},
		{"empty user history", "/api/user/topup?user_id=99", 11, 200, 0, true, nil},
		{"all users unchanged", "/api/user/topup", 11, 200, 4, true, []int{4, 3, 2, 1}},
		{"invalid empty filter", "/api/user/topup?user_id=", 11, 200, 0, false, nil},
		{"invalid zero filter", "/api/user/topup?user_id=0", 11, 200, 0, false, nil},
		{"invalid negative filter", "/api/user/topup?user_id=-1", 11, 200, 0, false, nil},
		{"invalid noninteger filter", "/api/user/topup?user_id=abc", 11, 200, 0, false, nil},
		{"ambiguous filter", "/api/user/topup?user_id=21&user_id=12", 11, 200, 0, false, nil},
		{"admin authentication required", "/api/user/topup?user_id=21", 0, 401, 0, false, nil},
		{"ordinary user denied", "/api/user/topup?user_id=21", 12, 200, 0, false, nil},
		{"self history ignores target", "/api/user/topup/self?user_id=21", 12, 200, 1, true, []int{2}},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, test.path, nil)
			if test.viewer != 0 {
				login := httptest.NewRecorder()
				router.ServeHTTP(login, httptest.NewRequest(http.MethodGet, fmt.Sprintf("/session/%d", test.viewer), nil))
				for _, cookie := range login.Result().Cookies() {
					request.AddCookie(cookie)
				}
				request.Header.Set("New-Api-User", fmt.Sprint(test.viewer))
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			require.Equal(t, test.status, response.Code)
			var body historyResponse
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &body))
			assert.Equal(t, test.success, body.Success)
			assert.Equal(t, test.total, body.Data.Total)
			var ids []int
			for _, order := range body.Data.Items {
				ids = append(ids, order.Id)
			}
			assert.Equal(t, test.ids, ids)
		})
	}
}
