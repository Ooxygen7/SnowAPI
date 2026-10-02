package controller

import (
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSubscriptionSelfReportsDatabaseFailuresInsteadOfEmptySuccess(t *testing.T) {
	for _, failedTable := range []string{"users", "user_subscriptions", "subscription_quota_windows", ""} {
		t.Run("failure_"+failedTable, func(t *testing.T) {
			db := setupModelListControllerTestDB(t)
			require.NoError(t, db.AutoMigrate(&model.UserSubscription{}, &model.SubscriptionQuotaWindow{}))
			require.NoError(t, db.Create(&model.User{Id: 81002, Username: "audit-subscriber", Status: 1}).Error)
			sub := model.UserSubscription{UserId: 81002, PlanId: 1, Status: "active", FiveHourQuota: 1000, EndTime: model.GetDBTimestamp() + 3600}
			require.NoError(t, db.Create(&sub).Error)
			window := model.SubscriptionQuotaWindow{UserSubscriptionId: sub.Id, WindowType: model.SubscriptionQuotaWindowFiveHour, AmountTotal: 1000, EndTime: sub.EndTime}
			require.NoError(t, db.Create(&window).Error)
			require.NoError(t, db.Model(&sub).Update("current_five_hour_window_id", window.Id).Error)
			require.NoError(t, db.Callback().Query().Before("gorm:query").Register("test:db_failure", func(tx *gorm.DB) {
				if tx.Statement.Table == failedTable {
					tx.AddError(errors.New("injected database failure"))
				}
			}))
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Set("id", 81002)
			GetSubscriptionSelf(ctx)
			var response struct {
				Success bool `json:"success"`
				Data    struct {
					Subscriptions []model.SubscriptionSummary `json:"subscriptions"`
				} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			if failedTable == "" {
				assert.True(t, response.Success)
				require.Len(t, response.Data.Subscriptions, 1)
				assert.Equal(t, sub.Id, response.Data.Subscriptions[0].Subscription.Id)
			} else {
				assert.False(t, response.Success, recorder.Body.String())
			}
		})
	}
}
