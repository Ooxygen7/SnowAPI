package model

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupMinimalModeFixture(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&Option{}, &Channel{}, &Ability{}, &Model{}, &Vendor{}))
	require.NoError(t, DB.AutoMigrate(MinimalModeMigrationModels()...))

	var savedOptions []Option
	pricingKeys := []string{"ModelRatio", "CompletionRatio", "CacheRatio", "ModelPrice"}
	require.NoError(t, DB.Where(commonKeyCol+" IN ?", pricingKeys).Find(&savedOptions).Error)
	require.NoError(t, DB.Where(commonKeyCol+" IN ?", pricingKeys).Delete(&Option{}).Error)
	for _, key := range pricingKeys {
		require.NoError(t, DB.Create(&Option{Key: key, Value: "{}"}).Error)
	}

	require.NoError(t, DB.Exec("DELETE FROM minimal_mode_models").Error)
	require.NoError(t, DB.Exec("DELETE FROM minimal_mode_sources").Error)
	require.NoError(t, DB.Where("model LIKE ?", "minimal-test-%").Delete(&Ability{}).Error)
	require.NoError(t, DB.Where("name LIKE ?", "minimal-test-%").Delete(&Channel{}).Error)
	require.NoError(t, DB.Where("model_name LIKE ?", "minimal-test-%").Delete(&Model{}).Error)
	require.NoError(t, DB.Unscoped().Where("name = ?", "minimal-test-provider").Delete(&Vendor{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Exec("DELETE FROM minimal_mode_models").Error)
		require.NoError(t, DB.Exec("DELETE FROM minimal_mode_sources").Error)
		require.NoError(t, DB.Where("model LIKE ?", "minimal-test-%").Delete(&Ability{}).Error)
		require.NoError(t, DB.Where("name LIKE ?", "minimal-test-%").Delete(&Channel{}).Error)
		require.NoError(t, DB.Unscoped().Where("model_name LIKE ?", "minimal-test-%").Delete(&Model{}).Error)
		require.NoError(t, DB.Unscoped().Where("name = ?", "minimal-test-provider").Delete(&Vendor{}).Error)
		require.NoError(t, DB.Where(commonKeyCol+" IN ?", pricingKeys).Delete(&Option{}).Error)
		if len(savedOptions) > 0 {
			require.NoError(t, DB.Create(&savedOptions).Error)
		}
	})
}

func minimalModeSourceFixture() MinimalModeSourceInput {
	modelRatio := 2.0
	completionRatio := 3.0
	cacheRatio := 0.5
	requestPrice := 0.04
	return MinimalModeSourceInput{
		Name:         "minimal-test-source",
		ProviderName: "minimal-test-provider",
		BaseURL:      "https://upstream.example/v1",
		ChannelType:  constant.ChannelTypeOpenAI,
		APIKey:       "minimal-test-secret",
		Groups:       []string{"Free"},
		Models: []MinimalModeModelInput{
			{
				DisplayModel:    "minimal-test-token-model",
				UpstreamModel:   "upstream-token-model",
				IconKey:         "OpenAI",
				EndpointType:    MinimalEndpointResponses,
				BillingMode:     MinimalBillingToken,
				ModelRatio:      &modelRatio,
				CompletionRatio: &completionRatio,
				CacheRatio:      &cacheRatio,
			},
			{
				DisplayModel:    "minimal-test-request-model",
				UpstreamModel:   "upstream-request-model",
				IconKey:         "Claude",
				EndpointType:    MinimalEndpointMessages,
				BillingMode:     MinimalBillingRequest,
				RequestPriceUSD: &requestPrice,
			},
		},
	}
}

func TestReconcileMinimalModeSourceCreatesAtomicCallableResources(t *testing.T) {
	setupMinimalModeFixture(t)
	input := minimalModeSourceFixture()

	view, runtimeOptions, err := ReconcileMinimalModeSource(input)
	require.NoError(t, err)
	assert.Equal(t, int64(1), view.Revision)
	assert.Equal(t, MinimalSyncInSync, view.SyncState)
	assert.True(t, view.HasAPIKey)
	require.Len(t, view.Models, 2)
	assert.Equal(t, constant.ChannelTypeOpenAI, view.ChannelType)
	viewEndpoints := make(map[string]string, len(view.Models))
	for _, item := range view.Models {
		viewEndpoints[item.DisplayModel] = item.EndpointType
	}
	assert.Equal(t, MinimalEndpointResponses, viewEndpoints["minimal-test-token-model"])
	assert.Equal(t, MinimalEndpointMessages, viewEndpoints["minimal-test-request-model"])

	var channel Channel
	require.NoError(t, DB.First(&channel, view.ChannelId).Error)
	assert.Equal(t, constant.ChannelTypeAdvancedCustom, channel.Type)
	assert.Equal(t, "minimal-test-secret", channel.Key)
	assert.Equal(t, "minimal-test-request-model,minimal-test-token-model", channel.Models)
	assert.Equal(t, "Free", channel.Group)
	require.NotNil(t, channel.ModelMapping)
	assert.JSONEq(t, `{"minimal-test-request-model":"upstream-request-model","minimal-test-token-model":"upstream-token-model"}`, *channel.ModelMapping)
	advancedConfig := channel.GetOtherSettings().AdvancedCustom
	require.NotNil(t, advancedConfig)
	assert.True(t, advancedConfig.SupportsPathForModel("/v1/responses", "minimal-test-token-model"))
	assert.False(t, advancedConfig.SupportsPathForModel("/v1/chat/completions", "minimal-test-token-model"))
	assert.True(t, advancedConfig.SupportsPathForModel("/v1/messages", "minimal-test-request-model"))
	messagesRoute, found := advancedConfig.MatchPathForModel("/v1/messages", "minimal-test-request-model")
	require.True(t, found)
	require.NotNil(t, messagesRoute.Auth)
	assert.Equal(t, dto.AdvancedCustomAuthTypeHeader, messagesRoute.Auth.Type)
	assert.Equal(t, "x-api-key", messagesRoute.Auth.Name)

	var abilityCount int64
	require.NoError(t, DB.Model(&Ability{}).Where("channel_id = ?", channel.Id).Count(&abilityCount).Error)
	assert.Equal(t, int64(2), abilityCount)
	var modelCount int64
	require.NoError(t, DB.Model(&Model{}).Where("model_name LIKE ?", "minimal-test-%").Count(&modelCount).Error)
	assert.Equal(t, int64(2), modelCount)
	var vendor Vendor
	require.NoError(t, DB.Where("name = ?", "OpenAI").First(&vendor).Error)
	var tokenModel Model
	require.NoError(t, DB.Where("model_name = ?", "minimal-test-token-model").First(&tokenModel).Error)
	assert.Equal(t, vendor.Id, tokenModel.VendorID)

	var modelRatios map[string]float64
	require.NoError(t, common.UnmarshalJsonStr(runtimeOptions["ModelRatio"], &modelRatios))
	assert.Equal(t, 2.0, modelRatios["minimal-test-token-model"])
	var cacheRatios map[string]float64
	require.NoError(t, common.UnmarshalJsonStr(runtimeOptions["CacheRatio"], &cacheRatios))
	assert.Equal(t, 0.5, cacheRatios["minimal-test-token-model"])
	var requestPrices map[string]float64
	require.NoError(t, common.UnmarshalJsonStr(runtimeOptions["ModelPrice"], &requestPrices))
	assert.Equal(t, 0.04, requestPrices["minimal-test-request-model"])
}

func TestReconcileMinimalModeSourceSharesAliasAcrossManagedChannels(t *testing.T) {
	setupMinimalModeFixture(t)
	firstInput := minimalModeSourceFixture()
	firstInput.Models = append([]MinimalModeModelInput(nil), firstInput.Models[:1]...)
	first, _, err := ReconcileMinimalModeSource(firstInput)
	require.NoError(t, err)

	secondInput := minimalModeSourceFixture()
	secondInput.Name = "minimal-test-source-secondary"
	secondInput.BaseURL = "https://secondary-upstream.example/v1"
	secondInput.APIKey = "minimal-test-secondary-secret"
	secondInput.Models = append([]MinimalModeModelInput(nil), secondInput.Models[:1]...)
	secondInput.Models[0].UpstreamModel = "secondary-upstream-token-model"
	second, _, err := ReconcileMinimalModeSource(secondInput)
	require.NoError(t, err)

	var owners []MinimalModeModel
	require.NoError(t, DB.Where("display_model = ?", "minimal-test-token-model").Order("source_id ASC").Find(&owners).Error)
	require.Len(t, owners, 2)
	assert.Equal(t, owners[0].ModelId, owners[1].ModelId)

	var abilities []Ability
	require.NoError(t, DB.Where(commonGroupCol+" = ? AND model = ?", "Free", "minimal-test-token-model").Find(&abilities).Error)
	require.Len(t, abilities, 2)
	channelIDs := []int{abilities[0].ChannelId, abilities[1].ChannelId}
	assert.ElementsMatch(t, []int{first.ChannelId, second.ChannelId}, channelIDs)
	for _, ability := range abilities {
		var channel Channel
		require.NoError(t, DB.First(&channel, ability.ChannelId).Error)
		config := channel.GetOtherSettings().AdvancedCustom
		require.NotNil(t, config)
		assert.True(t, config.SupportsPathForModel("/v1/responses", "minimal-test-token-model"))
	}

	sources, err := ListMinimalModeSources()
	require.NoError(t, err)
	require.Len(t, sources, 2)
	assert.Equal(t, MinimalSyncInSync, sources[0].SyncState)
	assert.Equal(t, MinimalSyncInSync, sources[1].SyncState)

	_, err = DeleteMinimalModeSource(first.Id, first.Revision)
	require.NoError(t, err)
	var remainingAbilities int64
	require.NoError(t, DB.Model(&Ability{}).Where("model = ?", "minimal-test-token-model").Count(&remainingAbilities).Error)
	assert.Equal(t, int64(1), remainingAbilities)
	var remainingModels int64
	require.NoError(t, DB.Model(&Model{}).Where("model_name = ?", "minimal-test-token-model").Count(&remainingModels).Error)
	assert.Equal(t, int64(1), remainingModels)

	runtimeOptions, err := DeleteMinimalModeSource(second.Id, second.Revision)
	require.NoError(t, err)
	assert.NotContains(t, runtimeOptions["ModelRatio"], "minimal-test-token-model")
	require.NoError(t, DB.Model(&Model{}).Where("model_name = ?", "minimal-test-token-model").Count(&remainingModels).Error)
	assert.Zero(t, remainingModels)
}

func TestReconcileMinimalModeSourceRejectsSharedAliasConfigurationMismatch(t *testing.T) {
	t.Run("pricing", func(t *testing.T) {
		setupMinimalModeFixture(t)
		firstInput := minimalModeSourceFixture()
		firstInput.Models = append([]MinimalModeModelInput(nil), firstInput.Models[:1]...)
		_, _, err := ReconcileMinimalModeSource(firstInput)
		require.NoError(t, err)

		secondInput := minimalModeSourceFixture()
		secondInput.Name = "minimal-test-source-secondary"
		secondInput.APIKey = "minimal-test-secondary-secret"
		secondInput.Models = append([]MinimalModeModelInput(nil), secondInput.Models[:1]...)
		differentRatio := 7.0
		secondInput.Models[0].ModelRatio = &differentRatio
		_, _, err = ReconcileMinimalModeSource(secondInput)
		assert.ErrorIs(t, err, ErrMinimalModelConflict)
		assert.ErrorContains(t, err, "same pricing")
	})

	t.Run("icon", func(t *testing.T) {
		setupMinimalModeFixture(t)
		firstInput := minimalModeSourceFixture()
		firstInput.Models = append([]MinimalModeModelInput(nil), firstInput.Models[:1]...)
		_, _, err := ReconcileMinimalModeSource(firstInput)
		require.NoError(t, err)

		secondInput := minimalModeSourceFixture()
		secondInput.Name = "minimal-test-source-secondary"
		secondInput.APIKey = "minimal-test-secondary-secret"
		secondInput.Models = append([]MinimalModeModelInput(nil), secondInput.Models[:1]...)
		secondInput.Models[0].IconKey = "Claude"
		_, _, err = ReconcileMinimalModeSource(secondInput)
		assert.ErrorIs(t, err, ErrMinimalModelConflict)
		assert.ErrorContains(t, err, "same icon")
	})
}

func TestReconcileMinimalModeSourceRetainsBlankSecretAndDetectsDrift(t *testing.T) {
	setupMinimalModeFixture(t)
	input := minimalModeSourceFixture()
	view, _, err := ReconcileMinimalModeSource(input)
	require.NoError(t, err)

	input.Id = view.Id
	input.ExpectedRevision = view.Revision
	input.APIKey = ""
	input.Name = "minimal-test-renamed"
	updated, _, err := ReconcileMinimalModeSource(input)
	require.NoError(t, err)
	assert.Equal(t, int64(2), updated.Revision)
	var channel Channel
	require.NoError(t, DB.First(&channel, updated.ChannelId).Error)
	assert.Equal(t, "minimal-test-secret", channel.Key)

	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", channel.Id).Update("name", "minimal-test-manual-drift").Error)
	sources, err := ListMinimalModeSources()
	require.NoError(t, err)
	require.Len(t, sources, 1)
	assert.Equal(t, MinimalSyncDrifted, sources[0].SyncState)
	input.ExpectedRevision = updated.Revision
	_, _, err = ReconcileMinimalModeSource(input)
	assert.ErrorIs(t, err, ErrMinimalDrifted)
}

func TestReconcileMinimalModeSourceRollsBackEveryResourceOnFailure(t *testing.T) {
	setupMinimalModeFixture(t)
	callbackName := "minimal_mode_test:reject_ownership"
	require.NoError(t, DB.Callback().Create().Before("gorm:create").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement != nil && tx.Statement.Table == "minimal_mode_models" {
			tx.AddError(errors.New("injected ownership failure"))
		}
	}))
	t.Cleanup(func() {
		require.NoError(t, DB.Callback().Create().Remove(callbackName))
	})

	_, _, err := ReconcileMinimalModeSource(minimalModeSourceFixture())
	require.ErrorContains(t, err, "injected ownership failure")
	for table, pattern := range map[string]string{
		"channels":             "name LIKE 'minimal-test-%'",
		"models":               "model_name LIKE 'minimal-test-%'",
		"minimal_mode_sources": "1 = 1",
		"minimal_mode_models":  "1 = 1",
	} {
		var count int64
		require.NoError(t, DB.Table(table).Where(pattern).Count(&count).Error)
		assert.Zero(t, count, table)
	}
	for _, key := range []string{"ModelRatio", "CompletionRatio", "CacheRatio", "ModelPrice"} {
		var option Option
		require.NoError(t, DB.Where(commonKeyCol+" = ?", key).First(&option).Error)
		assert.JSONEq(t, `{}`, option.Value)
	}
}

func TestDetachMinimalModeSourcePreservesGeneratedResources(t *testing.T) {
	setupMinimalModeFixture(t)
	view, _, err := ReconcileMinimalModeSource(minimalModeSourceFixture())
	require.NoError(t, err)
	require.NoError(t, DetachMinimalModeSource(view.Id, view.Revision))

	var sourceCount int64
	require.NoError(t, DB.Model(&MinimalModeSource{}).Count(&sourceCount).Error)
	assert.Zero(t, sourceCount)
	var channelCount int64
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", view.ChannelId).Count(&channelCount).Error)
	assert.Equal(t, int64(1), channelCount)
	var modelCount int64
	require.NoError(t, DB.Model(&Model{}).Where("model_name LIKE ?", "minimal-test-%").Count(&modelCount).Error)
	assert.Equal(t, int64(2), modelCount)
}

func TestDeleteMinimalModeSourceRemovesOnlyExclusiveInSyncResources(t *testing.T) {
	setupMinimalModeFixture(t)
	view, _, err := ReconcileMinimalModeSource(minimalModeSourceFixture())
	require.NoError(t, err)
	runtimeOptions, err := DeleteMinimalModeSource(view.Id, view.Revision)
	require.NoError(t, err)

	var channelCount int64
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", view.ChannelId).Count(&channelCount).Error)
	assert.Zero(t, channelCount)
	var modelCount int64
	require.NoError(t, DB.Model(&Model{}).Where("model_name LIKE ?", "minimal-test-%").Count(&modelCount).Error)
	assert.Zero(t, modelCount)
	assert.NotContains(t, runtimeOptions["ModelRatio"], "minimal-test-token-model")
	assert.NotContains(t, runtimeOptions["ModelPrice"], "minimal-test-request-model")
}

func TestDeleteMinimalModeSourceRefusesChannelWithManualResources(t *testing.T) {
	setupMinimalModeFixture(t)
	view, _, err := ReconcileMinimalModeSource(minimalModeSourceFixture())
	require.NoError(t, err)
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", view.ChannelId).Update("models", "minimal-test-request-model,minimal-test-token-model,manual-model").Error)

	_, err = DeleteMinimalModeSource(view.Id, view.Revision)
	assert.ErrorIs(t, err, ErrMinimalDrifted)
	var channelCount int64
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", view.ChannelId).Count(&channelCount).Error)
	assert.Equal(t, int64(1), channelCount)
}

func TestReconcileMinimalModeSourceRejectsUnmanagedAbility(t *testing.T) {
	setupMinimalModeFixture(t)
	external := Channel{
		Name: "minimal-test-external", Key: "external-secret",
		Status: common.ChannelStatusEnabled,
	}
	require.NoError(t, DB.Create(&external).Error)
	require.NoError(t, DB.Create(&Ability{
		Group: "Free", Model: "minimal-test-token-model", ChannelId: external.Id, Enabled: true,
	}).Error)

	_, _, err := ReconcileMinimalModeSource(minimalModeSourceFixture())
	assert.ErrorIs(t, err, ErrMinimalModelConflict)
	assert.ErrorContains(t, err, "unmanaged routing ability")
}

func TestReconcileMinimalModeSourceRejectsManualPricing(t *testing.T) {
	setupMinimalModeFixture(t)
	encoded, err := common.Marshal(map[string]float64{"minimal-test-token-model": 9})
	require.NoError(t, err)
	require.NoError(t, DB.Model(&Option{}).Where(commonKeyCol+" = ?", "ModelRatio").Update("value", string(encoded)).Error)

	_, _, err = ReconcileMinimalModeSource(minimalModeSourceFixture())
	assert.ErrorIs(t, err, ErrMinimalModelConflict)
	assert.ErrorContains(t, err, "manually managed pricing")
}

func TestDeleteMinimalModeSourceRestoresPreexistingDefaultPricing(t *testing.T) {
	setupMinimalModeFixture(t)
	const alias = "gpt-4o"
	defaultRatio, exists := ratio_setting.GetDefaultModelRatioMap()[alias]
	require.True(t, exists)
	t.Cleanup(func() {
		require.NoError(t, DB.Where("model = ?", alias).Delete(&Ability{}).Error)
		require.NoError(t, DB.Unscoped().Where("model_name = ?", alias).Delete(&Model{}).Error)
	})
	encoded, err := common.Marshal(map[string]float64{alias: defaultRatio})
	require.NoError(t, err)
	require.NoError(t, DB.Model(&Option{}).Where(commonKeyCol+" = ?", "ModelRatio").Update("value", string(encoded)).Error)
	requestPrice := 0.04
	input := minimalModeSourceFixture()
	input.Models = []MinimalModeModelInput{{
		DisplayModel: alias, UpstreamModel: alias, IconKey: "OpenAI",
		BillingMode: MinimalBillingRequest, RequestPriceUSD: &requestPrice,
	}}

	view, _, err := ReconcileMinimalModeSource(input)
	require.NoError(t, err)
	runtimeOptions, err := DeleteMinimalModeSource(view.Id, view.Revision)
	require.NoError(t, err)
	var restoredRatios map[string]float64
	require.NoError(t, common.UnmarshalJsonStr(runtimeOptions["ModelRatio"], &restoredRatios))
	assert.Equal(t, defaultRatio, restoredRatios[alias])
	var restoredPrices map[string]float64
	require.NoError(t, common.UnmarshalJsonStr(runtimeOptions["ModelPrice"], &restoredPrices))
	assert.NotContains(t, restoredPrices, alias)
}

func TestMinimalModeOwnershipDigestDetectsChannelModelAndAbilityEdits(t *testing.T) {
	t.Run("channel configuration", func(t *testing.T) {
		setupMinimalModeFixture(t)
		view, _, err := ReconcileMinimalModeSource(minimalModeSourceFixture())
		require.NoError(t, err)
		headerOverride := `{"X-Manual":"true"}`
		require.NoError(t, DB.Model(&Channel{}).Where("id = ?", view.ChannelId).Update("header_override", headerOverride).Error)

		sources, err := ListMinimalModeSources()
		require.NoError(t, err)
		require.Len(t, sources, 1)
		assert.Equal(t, MinimalSyncDrifted, sources[0].SyncState)
		_, err = DeleteMinimalModeSource(view.Id, view.Revision)
		assert.ErrorIs(t, err, ErrMinimalDrifted)
	})

	t.Run("model metadata", func(t *testing.T) {
		setupMinimalModeFixture(t)
		view, _, err := ReconcileMinimalModeSource(minimalModeSourceFixture())
		require.NoError(t, err)
		require.NoError(t, DB.Model(&Model{}).
			Where("model_name = ?", "minimal-test-token-model").
			Update("description", "manual description").Error)

		sources, err := ListMinimalModeSources()
		require.NoError(t, err)
		require.Len(t, sources, 1)
		assert.Equal(t, MinimalSyncDrifted, sources[0].SyncState)
		_, _, err = ReconcileMinimalModeSource(MinimalModeSourceInput{
			Id: view.Id, ExpectedRevision: view.Revision,
		})
		assert.ErrorIs(t, err, ErrMinimalDrifted)
		adopted, err := AdoptMinimalModeSource(view.Id, view.Revision)
		require.NoError(t, err)
		input := minimalModeSourceFixture()
		input.Id = adopted.Id
		input.ExpectedRevision = adopted.Revision
		input.APIKey = ""
		_, _, err = ReconcileMinimalModeSource(input)
		require.NoError(t, err)
		var preserved Model
		require.NoError(t, DB.Where("model_name = ?", "minimal-test-token-model").First(&preserved).Error)
		assert.Equal(t, "manual description", preserved.Description)
	})

	t.Run("ability policy", func(t *testing.T) {
		setupMinimalModeFixture(t)
		view, _, err := ReconcileMinimalModeSource(minimalModeSourceFixture())
		require.NoError(t, err)
		require.NoError(t, DB.Model(&Ability{}).
			Where("channel_id = ? AND model = ?", view.ChannelId, "minimal-test-token-model").
			Update("weight", 7).Error)

		sources, err := ListMinimalModeSources()
		require.NoError(t, err)
		require.Len(t, sources, 1)
		assert.Equal(t, MinimalSyncDrifted, sources[0].SyncState)
		_, err = AdoptMinimalModeSource(view.Id, view.Revision)
		assert.ErrorIs(t, err, ErrMinimalDrifted)
	})

	t.Run("pricing option", func(t *testing.T) {
		setupMinimalModeFixture(t)
		view, _, err := ReconcileMinimalModeSource(minimalModeSourceFixture())
		require.NoError(t, err)
		var option Option
		require.NoError(t, DB.Where(commonKeyCol+" = ?", "ModelRatio").First(&option).Error)
		var ratios map[string]float64
		require.NoError(t, common.UnmarshalJsonStr(option.Value, &ratios))
		ratios["minimal-test-token-model"] = 11
		encoded, err := common.Marshal(ratios)
		require.NoError(t, err)
		require.NoError(t, DB.Model(&Option{}).Where(commonKeyCol+" = ?", "ModelRatio").Update("value", string(encoded)).Error)

		sources, err := ListMinimalModeSources()
		require.NoError(t, err)
		require.Len(t, sources, 1)
		assert.Equal(t, MinimalSyncDrifted, sources[0].SyncState)
		_, err = DeleteMinimalModeSource(view.Id, view.Revision)
		assert.ErrorIs(t, err, ErrMinimalDrifted)
	})
}
