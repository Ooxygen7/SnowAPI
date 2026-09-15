package controller

import (
	"errors"
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
	IsDefault             bool   `json:"is_default"`
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
	groupNames, err := model.ListManagedGroupNames(model.DB)
	if err != nil {
		common.ApiError(c, err)
		return
	}
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
	names, err := model.ListManagedGroupNames(model.DB)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	profiles := make([]GroupProfile, 0, len(names))
	for _, name := range names {
		description := descriptions[name]
		if description == "" {
			description = name
		}
		policy, ok := policies[name]
		if !ok {
			policy = setting.GroupPolicy{PeriodMinutes: 1}
		}
		profiles = append(profiles, GroupProfile{
			Name: name, Description: description, IsDefault: name == setting.GetDefaultGroup(),
			MaxRequests:           policy.MaxRequests,
			MaxSuccessfulRequests: policy.MaxSuccessfulRequests,
			PeriodMinutes:         policy.PeriodMinutes,
			ConcurrencyLimit:      policy.ConcurrencyLimit,
			TPMLimit:              policy.TPMLimit,
		})
	}
	sort.Slice(profiles, func(i, j int) bool {
		if profiles[i].IsDefault {
			return true
		}
		if profiles[j].IsDefault {
			return false
		}
		return profiles[i].Name < profiles[j].Name
	})
	common.ApiSuccess(c, profiles)
}

func UpdateGroupProfiles(c *gin.Context) {
	model.GroupSettingsMutex.Lock()
	defer model.GroupSettingsMutex.Unlock()
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
	seenNames := make(map[string]bool, len(request.Groups))
	policies := make(map[string]setting.GroupPolicy, len(request.Groups))
	legacyLimits := make(map[string][2]int, len(request.Groups))
	for _, profile := range request.Groups {
		profile.Name = strings.TrimSpace(profile.Name)
		profile.Description = strings.TrimSpace(profile.Description)
		if !groupNamePattern.MatchString(profile.Name) || strings.EqualFold(profile.Name, "auto") || profile.Description == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid group name or description"})
			return
		}
		if seenNames[strings.ToLower(profile.Name)] {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "duplicate group name"})
			return
		}
		seenNames[strings.ToLower(profile.Name)] = true
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
	existingNames, err := model.ListManagedGroupNames(model.DB)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	for _, existing := range existingNames {
		if _, ok := descriptions[existing]; !ok {
			c.JSON(http.StatusConflict, gin.H{"success": false, "message": "Group settings changed. Refresh before saving; use the rename or delete action to modify existing groups."})
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
		"GroupPolicies":                   string(policyJSON),
		"UserUsableGroups":                string(descriptionJSON),
		"GroupRatio":                      string(ratioJSON),
		"group_ratio_setting.group_ratio": string(ratioJSON),
		"ModelRequestRateLimitGroup":      string(legacyJSON),
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	GetGroupProfiles(c)
}

func groupMutationResponse(c *gin.Context, err error) {
	if err == nil {
		GetGroupProfiles(c)
		return
	}
	var conflict *model.GroupMutationError
	if errors.As(err, &conflict) {
		message := conflict.Code
		if conflict.Code == "group_bound_subscription" {
			message = "该分组已被订阅" + strings.Join(conflict.Names, "、") + "绑定。"
		}
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": message, "code": conflict.Code, "names": conflict.Names})
		return
	}
	common.ApiError(c, err)
}

func RenameGroup(c *gin.Context) {
	var request struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiError(c, err)
		return
	}
	name := strings.TrimSpace(request.Name)
	if !groupNamePattern.MatchString(name) || strings.EqualFold(name, "auto") {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid group name", "code": "invalid_group_name"})
		return
	}
	groupMutationResponse(c, model.RenameManagedGroup(c.Param("name"), name))
}

func DeleteGroup(c *gin.Context) {
	groupMutationResponse(c, model.DeleteManagedGroup(c.Param("name")))
}
