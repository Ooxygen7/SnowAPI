package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMinimalModeChannelOwnershipEndsOnDetach(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(MinimalModeMigrationModels()...))
	const channelId = 987654321
	minimalModeChannelOwnership.Delete(channelId)
	require.NoError(t, DB.Where("channel_id = ?", channelId).Delete(&MinimalModeSource{}).Error)
	source := MinimalModeSource{
		ChannelId:        channelId,
		Revision:         1,
		LastSyncedDigest: "runtime-ownership-test",
		CreatedTime:      1,
		UpdatedTime:      1,
	}
	require.NoError(t, DB.Create(&source).Error)
	t.Cleanup(func() {
		minimalModeChannelOwnership.Delete(channelId)
		require.NoError(t, DB.Where("channel_id = ?", channelId).Delete(&MinimalModeSource{}).Error)
	})

	managed, err := IsMinimalModeChannel(channelId)
	require.NoError(t, err)
	assert.True(t, managed)

	require.NoError(t, DetachMinimalModeSource(source.Id, source.Revision))
	managed, err = IsMinimalModeChannel(channelId)
	require.NoError(t, err)
	assert.False(t, managed)
}
