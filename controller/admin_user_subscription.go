package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type adminUserListItem struct {
	*model.User
	Subscription *model.AdminSubscriptionState `json:"subscription"`
}

func buildAdminUserList(users []*model.User) ([]adminUserListItem, error) {
	ids := make([]int, 0, len(users))
	for _, user := range users {
		ids = append(ids, user.Id)
	}
	states, err := model.GetAdminUserSubscriptionStates(ids)
	if err != nil {
		return nil, err
	}
	items := make([]adminUserListItem, 0, len(users))
	for _, user := range users {
		items = append(items, adminUserListItem{User: user, Subscription: states[user.Id]})
	}
	return items, nil
}

func GetAdminUserSubscription(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "Invalid user ID")
		return
	}
	states, err := model.GetAdminUserSubscriptionStates([]int{id})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, states[id])
}

func UpdateAdminUserSubscription(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	var change model.AdminSubscriptionChange
	if err != nil || id <= 0 || c.ShouldBindJSON(&change) != nil {
		common.ApiErrorMsg(c, "Invalid subscription change")
		return
	}
	if err := model.ChangeAdminUserSubscription(c.GetInt("id"), id, change); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, model.ErrAdminUserPermission) {
			status = http.StatusForbidden
		}
		if errors.Is(err, model.ErrSubscriptionChanged) || errors.Is(err, model.ErrSubscriptionBusy) {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordManageAuditFor(c, id, "subscription.admin_change", map[string]interface{}{"target_user_id": id, "action": change.Action, "subscription_id": change.SubscriptionID, "plan_id": change.PlanID, "period_remaining": change.PeriodRemaining, "five_hour_remaining": change.FiveHourRemaining})
	common.ApiSuccess(c, nil)
}

func BatchDeleteUsers(c *gin.Context) {
	var request struct {
		IDs []int `json:"ids"`
	}
	if c.ShouldBindJSON(&request) != nil {
		common.ApiErrorMsg(c, "Invalid user selection")
		return
	}
	ids, err := model.BatchHardDeleteUsers(c.GetInt("id"), request.IDs)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, model.ErrAdminUserPermission) {
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordManageAudit(c, "user.batch_delete", map[string]interface{}{"user_ids": ids, "count": len(ids)})
	common.ApiSuccess(c, gin.H{"deleted_ids": ids, "count": len(ids)})
}
