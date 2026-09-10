package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGroupRateMiddlewareReleasesFailedAdmission(t *testing.T) {
	previousDB := model.DB
	previousPolicies := setting.GroupPolicies2JSONString()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.GroupRateLease{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		_ = sqlDB.Close()
		_ = setting.UpdateGroupPoliciesByJSONString(previousPolicies)
	})
	require.NoError(t, db.Create(&model.User{Id: 42, Username: "rate-user", Group: "Light"}).Error)
	require.NoError(t, setting.UpdateGroupPoliciesByJSONString(`{"Free":{"period_minutes":1},"Light":{"max_requests":10,"max_successful_requests":1,"period_minutes":1,"concurrency_limit":1,"tpm_limit":0}}`))
	engine := gin.New()
	engine.Use(func(c *gin.Context) { c.Set("id", 42); common.SetContextKey(c, constant.ContextKeyUserGroup, "Light") })
	engine.GET("/request", ModelRequestRateLimit(), func(c *gin.Context) {
		if c.Query("fail") == "1" {
			c.Status(500)
			return
		}
		c.Status(200)
	})
	engine.GET("/task", TaskSubmissionRateLimit(), func(c *gin.Context) { c.Status(200) })
	engine.POST("/task", TaskSubmissionRateLimit(), func(c *gin.Context) { c.Status(200) })
	for _, test := range []struct {
		path   string
		status int
	}{{"/request?fail=1", 500}, {"/request", 200}, {"/request", 429}} {
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, test.path, nil))
		assert.Equal(t, test.status, recorder.Code)
	}
	for method, status := range map[string]int{http.MethodGet: 200, http.MethodPost: 429} {
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, httptest.NewRequest(method, "/task", nil))
		assert.Equal(t, status, recorder.Code, "exhausted users can still fetch existing task results")
	}
}
