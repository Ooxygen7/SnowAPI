package controller

import (
	"math"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const modelHealthWindowHours = 24

// A stream may have sent HTTP 200 before failing. Its final status, not just
// the response headers or the relay helper's return value, determines success.
func modelHealthRequestSucceeded(relaySucceeded bool, stream *relaycommon.StreamStatus) bool {
	return relaySucceeded && (stream == nil || (stream.IsNormalEnd() && stream.EndError == nil && !stream.HasErrors()))
}

type modelHealthBucketResponse struct {
	Hour         int64   `json:"hour"`
	TotalCount   int64   `json:"total_count"`
	SuccessCount int64   `json:"success_count"`
	ProbeCount   int64   `json:"probe_count"`
	SuccessRate  float64 `json:"success_rate"`
}
type modelHealthModelResponse struct {
	ModelName string                      `json:"model_name"`
	Icon      string                      `json:"icon,omitempty"`
	Buckets   []modelHealthBucketResponse `json:"buckets"`
}

func GetModelHealth(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	user, err := model.GetUserCache(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pricing := filterPricingByUsableGroups(model.GetPricing(), service.GetUserUsableGroups(user.Group))
	names := make([]string, 0, len(pricing))
	for _, item := range pricing {
		names = append(names, item.ModelName)
	}
	now := time.Now()
	end := now.UTC().Truncate(time.Hour).Unix()
	start := end - int64(modelHealthWindowHours-1)*3600
	rows, err := model.GetModelRequestHealthHourly(names, start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	byModel := make(map[string]map[int64]model.ModelRequestHealthHourly)
	for _, row := range rows {
		if byModel[row.ModelName] == nil {
			byModel[row.ModelName] = make(map[int64]model.ModelRequestHealthHourly)
		}
		byModel[row.ModelName][row.Hour] = row
	}
	vendorIcons := make(map[int]string)
	for _, vendor := range model.GetVendors() {
		vendorIcons[vendor.ID] = vendor.Icon
	}
	models := make([]modelHealthModelResponse, 0, len(pricing))
	for _, item := range pricing {
		icon := item.Icon
		if icon == "" {
			icon = vendorIcons[item.VendorID]
		}
		buckets := make([]modelHealthBucketResponse, 0, modelHealthWindowHours)
		for hour := start; hour <= end; hour += 3600 {
			row := byModel[item.ModelName][hour]
			rate := float64(0)
			if row.TotalCount > 0 {
				rate = math.Round(float64(row.SuccessCount)/float64(row.TotalCount)*10000) / 100
			}
			buckets = append(buckets, modelHealthBucketResponse{
				Hour: hour, TotalCount: row.TotalCount,
				SuccessCount: row.SuccessCount, SuccessRate: rate,
			})
		}
		models = append(models, modelHealthModelResponse{ModelName: item.ModelName, Icon: icon, Buckets: buckets})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"generated_at": now.Unix(), "start_hour": start, "end_hour": end,
		"window_hours": modelHealthWindowHours, "source": "user_requests", "models": models,
	}})
}
