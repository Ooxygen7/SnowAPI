package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMinimalModeBatchCreatesIndependentCallableChannels(t *testing.T) {
	setupMinimalModeFixture(t)
	first, second := minimalModeSourceFixture(), minimalModeSourceFixture()
	second.Name += " #2"
	second.APIKey += "-second"
	views, options, err := CreateMinimalModeSources([]MinimalModeSourceInput{first, second})
	require.NoError(t, err)
	require.Len(t, views, 2)
	assert.NotEqual(t, views[0].ChannelId, views[1].ChannelId)
	for index, view := range views {
		var channel Channel
		require.NoError(t, DB.First(&channel, view.ChannelId).Error)
		assert.Equal(t, []string{first.APIKey, second.APIKey}[index], channel.Key)
		assert.Equal(t, first.BaseURL, channel.GetBaseURL())
		assert.ElementsMatch(t, first.Models, view.Models)
		config := channel.GetOtherSettings().AdvancedCustom
		require.NotNil(t, config)
		assert.True(t, config.SupportsPathForModel("/v1/responses", first.Models[0].DisplayModel))
		assert.True(t, config.SupportsPathForModel("/v1/messages", first.Models[1].DisplayModel))
	}
	var abilities []Ability
	require.NoError(t, DB.Where(commonGroupCol+" = ? AND model = ?", "Free", first.Models[0].DisplayModel).Find(&abilities).Error)
	require.Len(t, abilities, 2)
	assert.Equal(t, abilities[0].Weight, abilities[1].Weight)
	assert.Equal(t, abilities[0].Priority, abilities[1].Priority)
	sources, err := ListMinimalModeSources()
	require.NoError(t, err)
	for _, source := range sources {
		assert.Equal(t, MinimalSyncInSync, source.SyncState)
	}
	assert.Contains(t, options["ModelRatio"], first.Models[0].DisplayModel)
	serialized, err := common.Marshal(views)
	require.NoError(t, err)
	assert.NotContains(t, string(serialized), first.APIKey)
	// A repeat submission cannot create duplicate channels for the same key.
	_, _, err = CreateMinimalModeSources([]MinimalModeSourceInput{first})
	require.ErrorContains(t, err, "already configured")
}

func TestMinimalModeBatchRollsBackEarlierChannelsOnLaterConflict(t *testing.T) {
	setupMinimalModeFixture(t)
	first, second := minimalModeSourceFixture(), minimalModeSourceFixture()
	second.APIKey += "-second"
	differentPrice := 17.0
	second.Models[0].ModelRatio = &differentPrice
	views, options, err := CreateMinimalModeSources([]MinimalModeSourceInput{first, second})
	require.ErrorIs(t, err, ErrMinimalModelConflict)
	assert.Nil(t, views)
	assert.Nil(t, options)
	for table, predicate := range map[string]string{
		"channels": "name LIKE 'minimal-test-%'", "models": "model_name LIKE 'minimal-test-%'",
		"abilities": "model LIKE 'minimal-test-%'", "minimal_mode_sources": "1=1", "minimal_mode_models": "1=1",
	} {
		var count int64
		require.NoError(t, DB.Table(table).Where(predicate).Count(&count).Error)
		assert.Zero(t, count, table)
	}
	var option Option
	require.NoError(t, DB.Where(commonKeyCol+" = ?", "ModelRatio").First(&option).Error)
	assert.JSONEq(t, "{}", option.Value)
}
