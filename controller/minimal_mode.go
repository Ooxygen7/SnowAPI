package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type minimalModeRevisionRequest struct {
	ExpectedRevision int64 `json:"expected_revision"`
}

func minimalModeError(c *gin.Context, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, model.ErrMinimalRevision) ||
		errors.Is(err, model.ErrMinimalDrifted) ||
		errors.Is(err, model.ErrMinimalModelConflict) {
		status = http.StatusConflict
	} else if errors.Is(err, model.ErrMinimalSourceNotFound) {
		status = http.StatusNotFound
	}
	c.JSON(status, gin.H{
		"success": false,
		"message": err.Error(),
	})
}

func GetMinimalMode(c *gin.Context) {
	state, err := service.GetMinimalModeState()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    state,
	})
}

func UpdateMinimalMode(c *gin.Context) {
	var input service.MinimalModeSettingsInput
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		minimalModeError(c, errors.New("invalid minimal-mode settings"))
		return
	}
	if err := service.UpdateMinimalModeSettings(input); err != nil {
		minimalModeError(c, err)
		return
	}
	recordManageAudit(c, "minimal_mode.settings_update", map[string]interface{}{
		"enabled": input.Enabled,
	})
	state, err := service.GetMinimalModeState()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    state,
	})
}

func DiscoverMinimalModeModels(c *gin.Context) {
	var input service.MinimalModeDiscoveryInput
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		minimalModeError(c, errors.New("invalid model discovery request"))
		return
	}
	models, err := service.DiscoverMinimalModeModels(c.Request.Context(), input)
	if err != nil {
		minimalModeError(c, err)
		return
	}
	recordManageAudit(c, "minimal_mode.models_discover", map[string]interface{}{
		"source_id": input.SourceId,
		"count":     len(models),
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    models,
	})
}

func CreateMinimalModeSource(c *gin.Context) {
	var input model.MinimalModeSourceInput
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		minimalModeError(c, errors.New("invalid minimal-mode source"))
		return
	}
	input.Id = 0
	input.ExpectedRevision = 0
	view, err := service.SaveMinimalModeSource(c.Request.Context(), input)
	if err != nil {
		minimalModeError(c, err)
		return
	}
	recordManageAudit(c, "minimal_mode.source_create", map[string]interface{}{
		"source_id":   view.Id,
		"channel_id":  view.ChannelId,
		"model_count": len(view.Models),
	})
	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"message": "",
		"data":    view,
	})
}

func UpdateMinimalModeSource(c *gin.Context) {
	sourceID, err := strconv.Atoi(c.Param("id"))
	if err != nil || sourceID <= 0 {
		minimalModeError(c, errors.New("invalid minimal-mode source id"))
		return
	}
	var input model.MinimalModeSourceInput
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		minimalModeError(c, errors.New("invalid minimal-mode source"))
		return
	}
	input.Id = sourceID
	view, err := service.SaveMinimalModeSource(c.Request.Context(), input)
	if err != nil {
		minimalModeError(c, err)
		return
	}
	recordManageAudit(c, "minimal_mode.source_update", map[string]interface{}{
		"source_id":   view.Id,
		"channel_id":  view.ChannelId,
		"model_count": len(view.Models),
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    view,
	})
}

func AdoptMinimalModeSource(c *gin.Context) {
	sourceID, err := strconv.Atoi(c.Param("id"))
	if err != nil || sourceID <= 0 {
		minimalModeError(c, errors.New("invalid minimal-mode source id"))
		return
	}
	var input minimalModeRevisionRequest
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		minimalModeError(c, errors.New("invalid source revision"))
		return
	}
	view, err := service.AdoptMinimalModeSource(sourceID, input.ExpectedRevision)
	if err != nil {
		minimalModeError(c, err)
		return
	}
	recordManageAudit(c, "minimal_mode.source_adopt", map[string]interface{}{
		"source_id":  view.Id,
		"channel_id": view.ChannelId,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    view,
	})
}

func DetachMinimalModeSource(c *gin.Context) {
	sourceID, err := strconv.Atoi(c.Param("id"))
	if err != nil || sourceID <= 0 {
		minimalModeError(c, errors.New("invalid minimal-mode source id"))
		return
	}
	var input minimalModeRevisionRequest
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		minimalModeError(c, errors.New("invalid source revision"))
		return
	}
	if err := service.DetachMinimalModeSource(sourceID, input.ExpectedRevision); err != nil {
		minimalModeError(c, err)
		return
	}
	recordManageAudit(c, "minimal_mode.source_detach", map[string]interface{}{
		"source_id": sourceID,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func DeleteMinimalModeSource(c *gin.Context) {
	sourceID, err := strconv.Atoi(c.Param("id"))
	if err != nil || sourceID <= 0 {
		minimalModeError(c, errors.New("invalid minimal-mode source id"))
		return
	}
	var input minimalModeRevisionRequest
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		minimalModeError(c, errors.New("invalid source revision"))
		return
	}
	if err := service.DeleteMinimalModeSource(sourceID, input.ExpectedRevision); err != nil {
		minimalModeError(c, err)
		return
	}
	recordManageAudit(c, "minimal_mode.source_delete", map[string]interface{}{
		"source_id": sourceID,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}
