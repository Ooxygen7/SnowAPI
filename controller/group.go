package controller

import (
	"net/http"
	"regexp"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

var groupNamePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`)

type GroupProfile struct {
	Name                  string `json:"name"`
	Description           string `json:"description"`
	MaxRequests           int    `json:"max_requests"`
	MaxSuccessfulRequests int    `json:"max_successful_requests"`
	PeriodMinutes         int    `json:"period_minutes"`
	ConcurrencyLimit      int    `json:"concurrency_limit"`
	TPMLimit              int    `json:"tpm_limit"`
}

type updateGroupProfilesRequest struct {
	Groups []GroupProfile `json:"groups"`
}

func GetGroups(c *gin.Context) {
	groupNames := make([]string, 0)
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		groupNames = append(groupNames, groupName)
	}
	sort.Strings(groupNames)
	common.ApiSuccess(c, groupNames)
}

func GetUserGroups(c *gin.Context) {
	usableGroups := make(map[string]map[string]interface{})
	userGroup, _ := model.GetUserGroup(c.GetInt("id"), false)
	userUsableGroups := service.GetUserUsableGroups(userGroup)
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		if desc, ok := userUsableGroups[groupName]; ok {
			usableGroups[groupName] = map[string]interface{}{
				"ratio": service.GetUserGroupRatio(userGroup, groupName),
				"desc":  desc,
			}
		}
	}
	if _, ok := userUsableGroups["auto"]; ok {
		usableGroups["auto"] = map[string]interface{}{
			"ratio": "auto",
			"desc":  setting.GetUsableGroupDescription("auto"),
		}
	}
	common.ApiSuccess(c, usableGroups)
}

func GetGroupProfiles(c *gin.Context) {
	descriptions := setting.GetUserUsableGroupsCopy()
	policies := setting.GetGroupPoliciesCopy()
	profiles := make([]GroupProfile, 0, len(descriptions))
	for name, description := range descriptions {
		policy, ok := policies[name]
		if !ok {
			policy = setting.GroupPolicy{PeriodMinutes: 1}
		}
		profiles = append(profiles, GroupProfile{
			Name: name, Description: description,
			MaxRequests:           policy.MaxRequests,
			MaxSuccessfulRequests: policy.MaxSuccessfulRequests,
			PeriodMinutes:         policy.PeriodMinutes,
			ConcurrencyLimit:      policy.ConcurrencyLimit,
			TPMLimit:              policy.TPMLimit,
		})
	}
	sort.Slice(profiles, func(i, j int) bool {
		if profiles[i].Name == "Free" {
			return true
		}
		if profiles[j].Name == "Free" {
			return false
		}
		return profiles[i].Name < profiles[j].Name
	})
	common.ApiSuccess(c, profiles)
}

func UpdateGroupProfiles(c *gin.Context) {
	request := updateGroupProfilesRequest{}
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiError(c, err)
		return
	}
	if len(request.Groups) == 0 || len(request.Groups) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "group count must be between 1 and 100"})
		return
	}
	descriptions := make(map[string]string, len(request.Groups))
	policies := make(map[string]setting.GroupPolicy, len(request.Groups))
	legacyLimits := make(map[string][2]int, len(request.Groups))
	for _, profile := range request.Groups {
		profile.Name = strings.TrimSpace(profile.Name)
		profile.Description = strings.TrimSpace(profile.Description)
		if !groupNamePattern.MatchString(profile.Name) || profile.Description == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid group name or description"})
			return
		}
		if _, exists := descriptions[profile.Name]; exists {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "duplicate group name"})
			return
		}
		descriptions[profile.Name] = profile.Description
		policies[profile.Name] = setting.GroupPolicy{
			MaxRequests:           profile.MaxRequests,
			MaxSuccessfulRequests: profile.MaxSuccessfulRequests,
			PeriodMinutes:         profile.PeriodMinutes,
			ConcurrencyLimit:      profile.ConcurrencyLimit,
			TPMLimit:              profile.TPMLimit,
		}
		legacyLimits[profile.Name] = [2]int{profile.MaxRequests, profile.MaxSuccessfulRequests}
	}
	if err := setting.ValidateGroupPolicies(policies); err != nil {
		common.ApiError(c, err)
		return
	}
	for existing := range setting.GetUserUsableGroupsCopy() {
		if _, ok := descriptions[existing]; !ok {
			c.JSON(http.StatusConflict, gin.H{"success": false, "message": "existing groups cannot be removed while compatibility data is retained"})
			return
		}
	}
	ratios := ratio_setting.GetGroupRatioCopy()
	for name := range descriptions {
		if _, ok := ratios[name]; !ok {
			ratios[name] = 1
		}
	}
	policyJSON, err := common.Marshal(policies)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	descriptionJSON, err := common.Marshal(descriptions)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	ratioJSON, err := common.Marshal(ratios)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	legacyJSON, err := common.Marshal(legacyLimits)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOptionsBulk(map[string]string{
		"GroupPolicies":              string(policyJSON),
		"UserUsableGroups":           string(descriptionJSON),
		"GroupRatio":                 string(ratioJSON),
		"ModelRequestRateLimitGroup": string(legacyJSON),
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	GetGroupProfiles(c)
}
