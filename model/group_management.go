package model

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Serialize administrative group mutations, including policy edits. Database
// changes and configuration references are committed together before caches refresh.
var GroupSettingsMutex sync.Mutex

type GroupMutationError struct {
	Code  string
	Names []string
}

func (e *GroupMutationError) Error() string { return e.Code }

type groupReference struct {
	model  any
	column string
}

func operationalGroupReferences() []groupReference {
	return []groupReference{
		{&User{}, "group"}, {&User{}, "group_restore"},
		{&Token{}, "group"}, {&Ability{}, "group"},
		{&SubscriptionPlan{}, "upgrade_group"}, {&SubscriptionPlan{}, "downgrade_group"},
		{&Redemption{}, "group_name"},
	}
}

// ListManagedGroupNames includes ratio-only legacy groups (for example svip)
// and groups referenced by live configuration, not only the display-name map.
func ListManagedGroupNames(tx *gorm.DB) ([]string, error) {
	names := map[string]bool{setting.GetDefaultGroup(): true}
	for name := range ratio_setting.GetGroupRatioCopy() {
		names[name] = true
	}
	for name := range setting.GetUserUsableGroupsCopy() {
		names[name] = true
	}
	for name := range setting.GetGroupPoliciesCopy() {
		names[name] = true
	}
	for _, ref := range operationalGroupReferences() {
		var values []string
		if err := tx.Model(ref.model).Distinct().Pluck(ref.column, &values).Error; err != nil {
			return nil, err
		}
		for _, name := range values {
			names[strings.TrimSpace(name)] = true
		}
	}
	var channels []string
	if err := tx.Model(&Channel{}).Distinct().Pluck("group", &channels).Error; err != nil {
		return nil, err
	}
	for _, groups := range channels {
		for _, name := range strings.Split(groups, ",") {
			names[strings.TrimSpace(name)] = true
		}
	}
	delete(names, "")
	delete(names, "auto")
	result := make([]string, 0, len(names))
	for name := range names {
		result = append(result, name)
	}
	sort.Strings(result)
	return result, nil
}

// groupOptionsAfterRename handles exact group keys, including nested pricing
// and +/- visibility keys. It never performs substring replacement on JSON.
func groupOptionsAfterRename(oldName, newName string) (map[string]string, error) {
	values := map[string]string{
		"GroupRatio":                 ratio_setting.GroupRatio2JSONString(),
		"GroupGroupRatio":            ratio_setting.GroupGroupRatio2JSONString(),
		"UserUsableGroups":           setting.UserUsableGroups2JSONString(),
		"GroupPolicies":              setting.GroupPolicies2JSONString(),
		"ModelRequestRateLimitGroup": setting.ModelRequestRateLimitGroup2JSONString(),
		"TopupGroupRatio":            common.TopupGroupRatio2JSONString(),
		"group_ratio_setting.group_special_usable_group": ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.MarshalJSONString(),
	}
	for key, value := range values {
		var entries map[string]json.RawMessage
		if err := common.UnmarshalJsonStr(value, &entries); err != nil {
			return nil, err
		}
		if entry, exists := entries[oldName]; exists {
			delete(entries, oldName)
			if newName != "" {
				entries[newName] = entry
			}
		}
		if key == "GroupGroupRatio" || key == "group_ratio_setting.group_special_usable_group" {
			for parent, raw := range entries {
				var children map[string]json.RawMessage
				if err := common.Unmarshal(raw, &children); err != nil {
					return nil, err
				}
				for _, prefix := range []string{"", "+:", "-:"} {
					if entry, exists := children[prefix+oldName]; exists {
						delete(children, prefix+oldName)
						if newName != "" {
							children[prefix+newName] = entry
						}
					}
				}
				encoded, err := common.Marshal(children)
				if err != nil {
					return nil, err
				}
				entries[parent] = encoded
			}
		}
		encoded, err := common.Marshal(entries)
		if err != nil {
			return nil, err
		}
		values[key] = string(encoded)
	}
	// Persist both compatibility and modern keys so a periodic reload cannot
	// resurrect an old group from a stale duplicate option.
	values["group_ratio_setting.group_ratio"] = values["GroupRatio"]
	values["group_ratio_setting.group_group_ratio"] = values["GroupGroupRatio"]
	autoGroups := make([]string, 0)
	for _, name := range setting.GetAutoGroups() {
		if name == oldName {
			name = newName
		}
		if name != "" {
			autoGroups = append(autoGroups, name)
		}
	}
	encoded, err := common.Marshal(autoGroups)
	if err != nil {
		return nil, err
	}
	values["AutoGroups"] = string(encoded)
	if oldName == setting.GetDefaultGroup() && newName != "" {
		values["DefaultUserGroup"] = newName
	}
	return values, nil
}

// RenameManagedGroup keeps subscriptions, their expiry snapshots, users,
// existing API keys and channel routing attached to the same logical group.
func RenameManagedGroup(oldName, newName string) error {
	GroupSettingsMutex.Lock()
	defer GroupSettingsMutex.Unlock()
	var values map[string]string
	var users []int
	var planIDs []int
	err := DB.Transaction(func(tx *gorm.DB) error {
		var pendingTasks int64
		if err := tx.Model(&Task{}).Where(clause.Eq{Column: "group", Value: oldName}).Where("status NOT IN ?", []TaskStatus{TaskStatusSuccess, TaskStatusFailure}).Count(&pendingTasks).Error; err != nil {
			return err
		}
		if pendingTasks > 0 {
			return &GroupMutationError{Code: "group_has_pending_tasks"}
		}
		names, err := ListManagedGroupNames(tx)
		if err != nil {
			return err
		}
		found := false
		for _, name := range names {
			if name == oldName {
				found = true
			}
			if strings.EqualFold(name, newName) && name != oldName {
				return &GroupMutationError{Code: "group_name_exists"}
			}
		}
		if !found {
			return &GroupMutationError{Code: "group_not_found"}
		}
		if oldName == newName {
			return &GroupMutationError{Code: "group_name_unchanged"}
		}
		values, err = groupOptionsAfterRename(oldName, newName)
		if err != nil {
			return err
		}
		if err := tx.Model(&User{}).Where(commonGroupCol+" = ? OR group_restore = ?", oldName, oldName).Pluck("id", &users).Error; err != nil {
			return err
		}
		var tokenUsers []int
		if err := tx.Model(&Token{}).Where(clause.Eq{Column: "group", Value: oldName}).Distinct().Pluck("user_id", &tokenUsers).Error; err != nil {
			return err
		}
		users = append(users, tokenUsers...)
		if err := tx.Model(&SubscriptionPlan{}).Where("upgrade_group = ? OR downgrade_group = ?", oldName, oldName).Pluck("id", &planIDs).Error; err != nil {
			return err
		}
		// Capture managed source digests before changing channel/ability rows.
		var channels []Channel
		if err := lockForUpdate(tx).Find(&channels).Error; err != nil {
			return err
		}
		for i := range channels {
			channel := &channels[i]
			groups := strings.Split(channel.Group, ",")
			changed := false
			for j, name := range groups {
				if strings.TrimSpace(name) == oldName {
					groups[j] = newName
					changed = true
				}
			}
			if !changed {
				continue
			}
			if len(strings.Join(groups, ",")) > 64 {
				return &GroupMutationError{Code: "group_channel_names_too_long"}
			}
			var source MinimalModeSource
			sourceErr := lockForUpdate(tx).Where("channel_id = ?", channel.Id).First(&source).Error
			if sourceErr != nil && !errors.Is(sourceErr, gorm.ErrRecordNotFound) {
				return sourceErr
			}
			var managed []MinimalModeModel
			var pricing minimalPricingMaps
			inSync := false
			if sourceErr == nil {
				if err := tx.Where("source_id = ?", source.Id).Order("display_model ASC").Find(&managed).Error; err != nil {
					return err
				}
				pricing, err = minimalPricingOptionMaps(tx, false)
				if err != nil {
					return err
				}
				snapshot, _, missing, err := currentMinimalSnapshot(tx, &source, channel, managed, pricing)
				if err != nil {
					return err
				}
				digest, err := minimalDigest(snapshot)
				if err != nil {
					return err
				}
				inSync = !missing && digest == source.LastSyncedDigest
			}
			channel.Group = strings.Join(groups, ",")
			if err := tx.Model(channel).Update("group", channel.Group).Error; err != nil {
				return err
			}
			if err := tx.Model(&Ability{}).Where("channel_id = ?", channel.Id).Where(clause.Eq{Column: "group", Value: oldName}).Update("group", newName).Error; err != nil {
				return err
			}
			if sourceErr == nil {
				updates := map[string]any{"revision": source.Revision + 1, "updated_time": common.GetTimestamp()}
				if inSync {
					snapshot, _, _, err := currentMinimalSnapshot(tx, &source, channel, managed, pricing)
					if err != nil {
						return err
					}
					digest, err := minimalDigest(snapshot)
					if err != nil {
						return err
					}
					updates["last_synced_digest"] = digest
				}
				if err := tx.Model(&source).Updates(updates).Error; err != nil {
					return err
				}
			}
		}
		refs := append(operationalGroupReferences(), groupReference{&UserSubscription{}, "upgrade_group"}, groupReference{&UserSubscription{}, "downgrade_group"}, groupReference{&UserSubscription{}, "prev_user_group"})
		for _, ref := range refs {
			if err := tx.Unscoped().Model(ref.model).Where(clause.Eq{Column: ref.column, Value: oldName}).Update(ref.column, newName).Error; err != nil {
				return err
			}
		}
		return UpdateOptionsWithTx(tx, values)
	})
	if err != nil {
		return err
	}
	if err := ApplyOptionsRuntime(values); err != nil {
		return err
	}
	for _, id := range users {
		if err := InvalidateUserCache(id); err != nil {
			common.SysError("group rename user cache: " + err.Error())
		}
		if err := InvalidateUserTokensCache(id); err != nil {
			common.SysError("group rename token cache: " + err.Error())
		}
	}
	for _, id := range planIDs {
		InvalidateSubscriptionPlanCache(id)
	}
	InitChannelCache()
	return nil
}

func DeleteManagedGroup(name string) error {
	GroupSettingsMutex.Lock()
	defer GroupSettingsMutex.Unlock()
	var values map[string]string
	err := DB.Transaction(func(tx *gorm.DB) error {
		var plans []SubscriptionPlan
		activeBindings := tx.Model(&UserSubscription{}).Select("plan_id").Where("status = ? AND end_time > ?", "active", common.GetTimestamp()).Where("upgrade_group = ? OR downgrade_group = ? OR prev_user_group = ?", name, name, name)
		if err := lockForUpdate(tx).Where("upgrade_group = ? OR downgrade_group = ? OR id IN (?)", name, name, activeBindings).Order("id ASC").Find(&plans).Error; err != nil {
			return err
		}
		if len(plans) > 0 {
			titles := make([]string, 0, len(plans))
			for _, plan := range plans {
				titles = append(titles, plan.Title)
			}
			return &GroupMutationError{Code: "group_bound_subscription", Names: titles}
		}
		if name == setting.GetDefaultGroup() {
			return &GroupMutationError{Code: "group_is_default"}
		}
		var pendingTasks int64
		if err := tx.Model(&Task{}).Where(clause.Eq{Column: "group", Value: name}).Where("status NOT IN ?", []TaskStatus{TaskStatusSuccess, TaskStatusFailure}).Count(&pendingTasks).Error; err != nil {
			return err
		}
		if pendingTasks > 0 {
			return &GroupMutationError{Code: "group_has_pending_tasks"}
		}
		names, err := ListManagedGroupNames(tx)
		if err != nil {
			return err
		}
		found := false
		for _, existing := range names {
			if existing == name {
				found = true
			}
		}
		if !found {
			return &GroupMutationError{Code: "group_not_found"}
		}
		refs := append(operationalGroupReferences(), groupReference{&UserSubscription{}, "upgrade_group"}, groupReference{&UserSubscription{}, "downgrade_group"}, groupReference{&UserSubscription{}, "prev_user_group"})
		for _, ref := range refs {
			query := tx.Model(ref.model).Where(clause.Eq{Column: ref.column, Value: name})
			if _, ok := ref.model.(*UserSubscription); ok {
				query = query.Where("status = ? AND end_time > ?", "active", common.GetTimestamp())
			}
			var count int64
			if err := query.Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				return &GroupMutationError{Code: "group_in_use"}
			}
		}
		var channels []Channel
		if err := tx.Select("id", commonGroupCol).Find(&channels).Error; err != nil {
			return err
		}
		for _, channel := range channels {
			for _, group := range strings.Split(channel.Group, ",") {
				if strings.TrimSpace(group) == name {
					return &GroupMutationError{Code: "group_in_use"}
				}
			}
		}
		values, err = groupOptionsAfterRename(name, "")
		if err != nil {
			return err
		}
		return UpdateOptionsWithTx(tx, values)
	})
	if err != nil {
		return err
	}
	if err := ApplyOptionsRuntime(values); err != nil {
		return fmt.Errorf("refresh group settings: %w", err)
	}
	InitChannelCache()
	return nil
}
