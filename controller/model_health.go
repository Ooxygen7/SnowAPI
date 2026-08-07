package controller

import (
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const modelHealthWindowHours = 24

type modelHealthBucketResponse struct {
	Hour         int64   `json:"hour"`
	TotalCount   int64   `json:"total_count"`
	SuccessCount int64   `json:"success_count"`
	ProbeCount   int64   `json:"probe_count"`
	SuccessRate  float64 `json:"success_rate"`
}

type modelHealthModelResponse struct {
	ModelName   string                      `json:"model_name"`
	DisplayName string                      `json:"display_name,omitempty"`
	ChannelID   int                         `json:"channel_id,omitempty"`
	Icon        string                      `json:"icon,omitempty"`
	Buckets     []modelHealthBucketResponse `json:"buckets"`
}

type modelHealthTarget struct {
	ModelName   string
	DisplayName string
	ChannelID   int
	Icon        string
}

func GetModelHealth(c *gin.Context) {
	user, err := model.GetUserCache(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	usableGroups := service.GetUserUsableGroups(user.Group)
	pricing := filterPricingByUsableGroups(model.GetPricing(), usableGroups)
	modelNames := make([]string, 0, len(pricing))
	pricingNames := make(map[string]struct{}, len(pricing))
	for _, item := range pricing {
		modelNames = append(modelNames, item.ModelName)
		pricingNames[item.ModelName] = struct{}{}
	}

	now := time.Now()
	endHour := now.UTC().Truncate(time.Hour).Unix()
	startHour := endHour - int64(modelHealthWindowHours-1)*int64(time.Hour/time.Second)

	abilities, err := model.GetAllEnableAbilityWithChannels()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	usableGroupSet := make(map[string]struct{}, len(usableGroups))
	for group := range usableGroups {
		usableGroupSet[group] = struct{}{}
	}
	channelModels := make(map[int]map[string]struct{})
	for _, ability := range abilities {
		if _, ok := usableGroupSet[ability.Group]; !ok {
			continue
		}
		if _, ok := pricingNames[ability.Model]; !ok {
			continue
		}
		if channelModels[ability.ChannelId] == nil {
			channelModels[ability.ChannelId] = make(map[string]struct{})
		}
		channelModels[ability.ChannelId][ability.Model] = struct{}{}
	}

	channelIDs := make([]int, 0, len(channelModels))
	for channelID := range channelModels {
		channelIDs = append(channelIDs, channelID)
	}
	sort.Ints(channelIDs)
	channels, err := model.GetChannelsByIds(channelIDs)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	sort.Slice(channels, func(i, j int) bool {
		return channels[i].Id < channels[j].Id
	})

	channelRows, err := model.GetModelChannelHealthHourly(channelIDs, modelNames, startHour, endHour)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	rowsByChannel := make(map[int]map[string]map[int64]model.ModelChannelHealthHourly, len(channelIDs))
	for _, row := range channelRows {
		if rowsByChannel[row.ChannelID] == nil {
			rowsByChannel[row.ChannelID] = make(map[string]map[int64]model.ModelChannelHealthHourly)
		}
		if rowsByChannel[row.ChannelID][row.ModelName] == nil {
			rowsByChannel[row.ChannelID][row.ModelName] = make(map[int64]model.ModelChannelHealthHourly)
		}
		rowsByChannel[row.ChannelID][row.ModelName][row.Hour] = row
	}

	overallRows, err := model.GetModelHealthHourly(modelNames, startHour, endHour)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	rowsByModel := make(map[string]map[int64]model.ModelHealthHourly, len(modelNames))
	for _, row := range overallRows {
		if rowsByModel[row.ModelName] == nil {
			rowsByModel[row.ModelName] = make(map[int64]model.ModelHealthHourly)
		}
		rowsByModel[row.ModelName][row.Hour] = row
	}

	vendorIcons := make(map[int]string)
	for _, vendor := range model.GetVendors() {
		vendorIcons[vendor.ID] = vendor.Icon
	}

	targets := make([]modelHealthTarget, 0, len(pricing)*max(1, len(channels)))
	for _, item := range pricing {
		icon := item.Icon
		if icon == "" {
			icon = vendorIcons[item.VendorID]
		}
		channelCount := 0
		for _, channel := range channels {
			if channel.Status != 1 {
				continue
			}
			if _, ok := channelModels[channel.Id][item.ModelName]; !ok {
				continue
			}
			displayName := strings.TrimSpace(channel.Name)
			if displayName == "" {
				displayName = item.ModelName
			}
			targets = append(targets, modelHealthTarget{
				ModelName:   item.ModelName,
				DisplayName: displayName,
				ChannelID:   channel.Id,
				Icon:        icon,
			})
			channelCount++
		}
		if channelCount == 0 {
			targets = append(targets, modelHealthTarget{
				ModelName: item.ModelName,
				Icon:      icon,
			})
		}
	}

	models := make([]modelHealthModelResponse, 0, len(targets))
	for _, target := range targets {
		buckets := make([]modelHealthBucketResponse, 0, modelHealthWindowHours)
		for hour := startHour; hour <= endHour; hour += int64(time.Hour / time.Second) {
			totalCount := int64(0)
			successCount := int64(0)
			probeCount := int64(0)
			if target.ChannelID > 0 {
				row := rowsByChannel[target.ChannelID][target.ModelName][hour]
				totalCount = row.TotalCount
				successCount = row.SuccessCount
				probeCount = row.ProbeCount
			} else {
				row := rowsByModel[target.ModelName][hour]
				totalCount = row.TotalCount
				successCount = row.SuccessCount
				probeCount = row.ProbeCount
			}
			rate := float64(0)
			if totalCount > 0 {
				rate = math.Round(float64(successCount)/float64(totalCount)*10000) / 100
			}
			buckets = append(buckets, modelHealthBucketResponse{
				Hour:         hour,
				TotalCount:   totalCount,
				SuccessCount: successCount,
				ProbeCount:   probeCount,
				SuccessRate:  rate,
			})
		}
		models = append(models, modelHealthModelResponse{
			ModelName:   target.ModelName,
			DisplayName: target.DisplayName,
			ChannelID:   target.ChannelID,
			Icon:        target.Icon,
			Buckets:     buckets,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"generated_at": now.Unix(),
			"start_hour":   startHour,
			"end_hour":     endHour,
			"window_hours": modelHealthWindowHours,
			"models":       models,
		},
	})
}
