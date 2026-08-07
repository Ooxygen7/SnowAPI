package model

import "sync"

var minimalModeChannelOwnership sync.Map

// IsMinimalModeChannel reports whether the channel is still owned by a
// minimal-mode source. Detached channels intentionally return false so they
// retain the normal full-mode outbound behavior.
func IsMinimalModeChannel(channelId int) (bool, error) {
	if channelId <= 0 {
		return false, nil
	}
	if managed, ok := minimalModeChannelOwnership.Load(channelId); ok {
		return managed.(bool), nil
	}
	var count int64
	if err := DB.Model(&MinimalModeSource{}).Where("channel_id = ?", channelId).Count(&count).Error; err != nil {
		return false, err
	}
	managed := count > 0
	minimalModeChannelOwnership.Store(channelId, managed)
	return managed, nil
}

func cacheMinimalModeChannelOwnership(channelId int, managed bool) {
	if channelId > 0 {
		minimalModeChannelOwnership.Store(channelId, managed)
	}
}
