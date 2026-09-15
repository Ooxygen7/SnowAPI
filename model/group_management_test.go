package model

import (
	"errors"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupGroupManagementTest(t *testing.T) {
	t.Helper()
	originalDB := DB
	originalOptions := common.OptionMap
	common.OptionMap = make(map[string]string)
	originalDefault := setting.GetDefaultGroup()
	originalMemory, originalRedis := common.MemoryCacheEnabled, common.RedisEnabled
	saved, err := groupOptionsAfterRename("__absent__", "__absent_new__")
	require.NoError(t, err)
	saved["DefaultUserGroup"] = originalDefault
	testDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := testDB.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	DB = testDB
	common.MemoryCacheEnabled, common.RedisEnabled = false, false
	require.NoError(t, DB.AutoMigrate(&Option{}, &User{}, &Token{}, &Channel{}, &Ability{}, &SubscriptionPlan{}, &UserSubscription{}, &Redemption{}, &Model{}, &Vendor{}, &MinimalModeSource{}, &MinimalModeModel{}, &Task{}))
	require.NoError(t, ApplyOptionsRuntime(map[string]string{
		"DefaultUserGroup": "Free", "GroupRatio": `{"Free":1,"Light":0.5,"svip":1}`, "group_ratio_setting.group_ratio": `{"Free":1,"Light":0.5,"svip":1}`,
		"UserUsableGroups": `{"Free":"Free","Light":"Light label"}`, "GroupPolicies": `{"Free":{"period_minutes":1},"Light":{"period_minutes":5,"tpm_limit":9000}}`,
		"GroupGroupRatio": `{"Light":{"Light":0.8}}`, "group_ratio_setting.group_group_ratio": `{"Light":{"Light":0.8}}`,
		"group_ratio_setting.group_special_usable_group": `{"Light":{"+:Light":"Light","-:svip":"svip"}}`,
		"AutoGroups": `["Free","Light","svip"]`, "TopupGroupRatio": `{"Free":1,"Light":2,"svip":1}`, "ModelRequestRateLimitGroup": `{"Light":[15,10]}`,
	}))
	t.Cleanup(func() {
		DB = originalDB
		common.MemoryCacheEnabled, common.RedisEnabled = originalMemory, originalRedis
		require.NoError(t, ApplyOptionsRuntime(saved))
		common.OptionMap = originalOptions
		require.NoError(t, sqlDB.Close())
	})
}

func TestGroupRenamePreservesSubscriptionAndExistingKeyRouting(t *testing.T) {
	setupGroupManagementTest(t)
	plan := SubscriptionPlan{Title: "Light monthly", UpgradeGroup: "Light", DowngradeGroup: "Free"}
	require.NoError(t, DB.Create(&plan).Error)
	user := User{Username: "rename-user", Group: "Light", GroupRestore: "Light", Quota: 321}
	require.NoError(t, DB.Create(&user).Error)
	token := Token{UserId: user.Id, Key: "group-rename-test-key", Group: "Light", RemainQuota: 123}
	require.NoError(t, DB.Create(&token).Error)
	sub := UserSubscription{UserId: user.Id, PlanId: plan.Id, UpgradeGroup: "Light", PrevUserGroup: "Light", DowngradeGroup: "Light", Status: "active", EndTime: common.GetTimestamp() + 3600, AmountTotal: 900, AmountUsed: 150}
	require.NoError(t, DB.Create(&sub).Error)
	redemption := Redemption{Key: "group-rename-redemption", GroupName: "Light"}
	require.NoError(t, DB.Create(&redemption).Error)
	channel := Channel{Name: "rename-channel", Group: "Light,svip", Models: "rename-model"}
	require.NoError(t, DB.Create(&channel).Error)
	require.NoError(t, DB.Create(&Ability{Group: "Light", Model: "rename-model", ChannelId: channel.Id, Enabled: true}).Error)
	require.NoError(t, RenameManagedGroup("Light", "Starter"))
	require.NoError(t, DB.First(&plan, plan.Id).Error)
	assert.Equal(t, "Starter", plan.UpgradeGroup)
	require.NoError(t, DB.First(&sub, sub.Id).Error)
	assert.Equal(t, "Starter", sub.UpgradeGroup)
	assert.Equal(t, "Starter", sub.PrevUserGroup)
	assert.Equal(t, "Starter", sub.DowngradeGroup)
	assert.EqualValues(t, 150, sub.AmountUsed)
	assert.EqualValues(t, 900, sub.AmountTotal)
	require.NoError(t, DB.First(&user, user.Id).Error)
	assert.Equal(t, "Starter", user.Group)
	assert.Equal(t, "Starter", user.GroupRestore)
	assert.Equal(t, 321, user.Quota)
	require.NoError(t, DB.First(&token, token.Id).Error)
	assert.Equal(t, "Starter", token.Group)
	assert.Equal(t, 123, token.RemainQuota)
	require.NoError(t, DB.First(&channel, channel.Id).Error)
	assert.Equal(t, "Starter,svip", channel.Group)
	assert.Contains(t, GetGroupEnabledModels("Starter"), "rename-model")
	assert.Empty(t, GetGroupEnabledModels("Light"))
	require.NoError(t, DB.First(&redemption, redemption.Id).Error)
	assert.Equal(t, "Starter", redemption.GroupName)
	assert.Equal(t, 0.5, ratio_setting.GetGroupRatio("Starter"))
	policy, ok := setting.GetGroupPolicy("Starter")
	require.True(t, ok)
	assert.Equal(t, 9000, policy.TPMLimit)
	require.NoError(t, ReloadOptionsFromDatabase())
	assert.False(t, ratio_setting.ContainsGroupRatio("Light"))
	assert.Contains(t, ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.ReadAll()["Starter"], "+:Starter")
	var bound *GroupMutationError
	require.ErrorAs(t, DeleteManagedGroup("Starter"), &bound)
	assert.Equal(t, "group_bound_subscription", bound.Code)
	assert.Equal(t, []string{"Light monthly"}, bound.Names)
}

func TestGroupDiscoveryAndSafeDelete(t *testing.T) {
	setupGroupManagementTest(t)
	names, err := ListManagedGroupNames(DB)
	require.NoError(t, err)
	assert.Contains(t, names, "svip")
	require.NoError(t, DeleteManagedGroup("svip"))
	require.NoError(t, ReloadOptionsFromDatabase())
	names, err = ListManagedGroupNames(DB)
	require.NoError(t, err)
	assert.NotContains(t, names, "svip")
	assert.NotContains(t, setting.GetAutoGroups(), "svip")
	assert.NotContains(t, ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.ReadAll()["Light"], "-:svip")
	require.NoError(t, DB.Create(&User{Username: "in-use", Group: "Light"}).Error)
	var conflict *GroupMutationError
	require.ErrorAs(t, DeleteManagedGroup("Light"), &conflict)
	assert.Equal(t, "group_in_use", conflict.Code)
	require.ErrorAs(t, DeleteManagedGroup("Free"), &conflict)
	assert.Equal(t, "group_is_default", conflict.Code)
}

func TestGroupRenameRejectsNameCollisionAndOversizedChannelGroups(t *testing.T) {
	setupGroupManagementTest(t)
	channel := Channel{Name: "bounded-groups", Group: "Light,svip"}
	require.NoError(t, DB.Create(&channel).Error)
	var conflict *GroupMutationError
	require.ErrorAs(t, RenameManagedGroup("Light", "SVIP"), &conflict)
	assert.Equal(t, "group_name_exists", conflict.Code)
	require.ErrorAs(t, RenameManagedGroup("Light", strings.Repeat("a", 64)), &conflict)
	assert.Equal(t, "group_channel_names_too_long", conflict.Code)
	require.NoError(t, DB.First(&channel, channel.Id).Error)
	assert.Equal(t, "Light,svip", channel.Group)
	assert.True(t, ratio_setting.ContainsGroupRatio("Light"))
	require.NoError(t, DB.Create(&Task{Group: "Light", Status: TaskStatusInProgress}).Error)
	require.ErrorAs(t, RenameManagedGroup("Light", "Starter"), &conflict)
	assert.Equal(t, "group_has_pending_tasks", conflict.Code)
}

func TestDefaultGroupRenameSurvivesReloadAndNewUsers(t *testing.T) {
	setupGroupManagementTest(t)
	require.NoError(t, RenameManagedGroup("Free", "Basic"))
	setting.SetDefaultGroup("Free")
	loadOptionsFromDatabase()
	assert.Equal(t, "Basic", setting.GetDefaultGroup())
	user := User{Username: "new-default-user"}
	require.NoError(t, DB.Create(&user).Error)
	assert.Equal(t, "Basic", user.Group)
	assert.NoError(t, setting.ValidateGroupPolicies(setting.GetGroupPoliciesCopy()))
	var conflict *GroupMutationError
	require.ErrorAs(t, DeleteManagedGroup("Basic"), &conflict)
	assert.Equal(t, "group_is_default", conflict.Code)
}

func TestGroupRenameRollsBackReferencesWhenPersistenceFails(t *testing.T) {
	setupGroupManagementTest(t)
	user := User{Username: "rollback-user", Group: "Light"}
	require.NoError(t, DB.Create(&user).Error)
	require.NoError(t, DB.Callback().Update().Before("gorm:update").Register("fail-group-options", func(tx *gorm.DB) {
		if tx.Statement.Table == "options" {
			tx.AddError(errors.New("test persistence failure"))
		}
	}))
	t.Cleanup(func() { DB.Callback().Update().Remove("fail-group-options") })
	require.ErrorContains(t, RenameManagedGroup("Light", "Starter"), "test persistence failure")
	require.NoError(t, DB.First(&user, user.Id).Error)
	assert.Equal(t, "Light", user.Group)
	assert.True(t, ratio_setting.ContainsGroupRatio("Light"))
	assert.False(t, ratio_setting.ContainsGroupRatio("Starter"))
}

func TestGroupRenameRetriesTransientDatabaseLockWithoutPartialChanges(t *testing.T) {
	setupGroupManagementTest(t)
	user := User{Username: "retry-user", Group: "Light"}
	require.NoError(t, DB.Create(&user).Error)
	injected := false
	require.NoError(t, DB.Callback().Update().Before("gorm:update").Register("transient-group-lock", func(tx *gorm.DB) {
		if tx.Statement.Table == "options" && !injected {
			injected = true
			tx.AddError(errors.New("database is locked"))
		}
	}))
	t.Cleanup(func() { DB.Callback().Update().Remove("transient-group-lock") })
	require.NoError(t, RenameManagedGroup("Light", "Starter"))
	require.True(t, injected)
	require.NoError(t, DB.First(&user, user.Id).Error)
	assert.Equal(t, "Starter", user.Group)
	assert.True(t, ratio_setting.ContainsGroupRatio("Starter"))
	assert.False(t, ratio_setting.ContainsGroupRatio("Light"))
}

func TestGroupRenamePreservesMinimalModeSyncAndDetectsStaleEditor(t *testing.T) {
	setupGroupManagementTest(t)
	setupMinimalModeFixture(t)
	input := minimalModeSourceFixture()
	input.Groups = []string{"Light"}
	view, values, err := ReconcileMinimalModeSource(input)
	require.NoError(t, err)
	require.NoError(t, ApplyOptionsRuntime(values))
	require.NoError(t, RenameManagedGroup("Light", "Starter"))
	views, err := ListMinimalModeSources()
	require.NoError(t, err)
	require.Len(t, views, 1)
	assert.Equal(t, MinimalSyncInSync, views[0].SyncState)
	assert.Equal(t, []string{"Starter"}, views[0].Groups)
	assert.Equal(t, view.Revision+1, views[0].Revision)
	input.Id, input.ExpectedRevision = view.Id, view.Revision
	_, _, err = ReconcileMinimalModeSource(input)
	assert.ErrorIs(t, err, ErrMinimalRevision)
}
