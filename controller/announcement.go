package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetUnreadAnnouncement(c *gin.Context) {
	notice, err := model.GetUnreadConsoleAnnouncement(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, notice)
}

func AcknowledgeAnnouncement(c *gin.Context) {
	var request struct {
		Revision int64 `json:"revision" binding:"required,gt=0"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.AcknowledgeConsoleAnnouncement(c.GetInt("id"), request.Revision); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
