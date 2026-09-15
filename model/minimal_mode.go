package model

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
)

const (
	MinimalBillingToken      = "token"
	MinimalBillingRequest    = "request"
	MinimalEndpointChat      = string(constant.EndpointTypeOpenAI)
	MinimalEndpointResponses = string(constant.EndpointTypeOpenAIResponse)
	MinimalEndpointMessages  = string(constant.EndpointTypeAnthropic)

	MinimalSyncInSync  = "in_sync"
	MinimalSyncDrifted = "drifted"
	MinimalSyncMissing = "missing"
)

var (
	ErrMinimalSourceNotFound = errors.New("minimal mode source not found")
	ErrMinimalRevision       = errors.New("minimal mode source revision conflict")
	ErrMinimalDrifted        = errors.New("minimal mode source has drifted")
	ErrMinimalModelConflict  = errors.New("minimal mode model conflicts with an existing resource")
)

type MinimalModeSource struct {
	Id               int    `json:"id" gorm:"primaryKey"`
	ChannelId        int    `json:"channel_id" gorm:"not null;uniqueIndex"`
	ChannelType      int    `json:"channel_type"`
	ProviderName     string `json:"provider_name" gorm:"type:varchar(128)"`
	Revision         int64  `json:"revision" gorm:"not null"`
	LastSyncedDigest string `json:"last_synced_digest" gorm:"type:varchar(64);not null"`
	CreatedTime      int64  `json:"created_time" gorm:"bigint;not null"`
	UpdatedTime      int64  `json:"updated_time" gorm:"bigint;not null"`
}

type MinimalModeModel struct {
	Id                      int      `json:"id" gorm:"primaryKey"`
	SourceId                int      `json:"source_id" gorm:"not null;index;uniqueIndex:uk_minimal_source_display,priority:1"`
	ModelId                 int      `json:"model_id" gorm:"not null"`
	DisplayModel            string   `json:"display_model" gorm:"type:varchar(128);not null;index:idx_minimal_mode_models_display_lookup;uniqueIndex:uk_minimal_source_display,priority:2"`
	UpstreamModel           string   `json:"upstream_model" gorm:"type:varchar(255);not null"`
	IconKey                 string   `json:"icon_key" gorm:"type:varchar(128);not null"`
	EndpointType            string   `json:"endpoint_type" gorm:"type:varchar(32)"`
	BillingMode             string   `json:"billing_mode" gorm:"type:varchar(16);not null"`
	ModelRatio              *float64 `json:"model_ratio,omitempty"`
	CompletionRatio         *float64 `json:"completion_ratio,omitempty"`
	CacheRatio              *float64 `json:"cache_ratio,omitempty"`
	RequestPriceUSD         *float64 `json:"request_price_usd,omitempty"`
	PreviousPricingCaptured bool     `json:"-"`
	PreviousModelRatio      *float64 `json:"-"`
	PreviousCompletionRatio *float64 `json:"-"`
	PreviousCacheRatio      *float64 `json:"-"`
	PreviousRequestPriceUSD *float64 `json:"-"`
	CreatedTime             int64    `json:"created_time" gorm:"bigint;not null"`
	UpdatedTime             int64    `json:"updated_time" gorm:"bigint;not null"`
}

type MinimalModeModelInput struct {
	DisplayModel    string   `json:"display_model"`
	UpstreamModel   string   `json:"upstream_model"`
	IconKey         string   `json:"icon_key"`
	EndpointType    string   `json:"endpoint_type"`
	BillingMode     string   `json:"billing_mode"`
	ModelRatio      *float64 `json:"model_ratio,omitempty"`
	CompletionRatio *float64 `json:"completion_ratio,omitempty"`
	CacheRatio      *float64 `json:"cache_ratio,omitempty"`
	RequestPriceUSD *float64 `json:"request_price_usd,omitempty"`
}

type MinimalModeSourceInput struct {
	Id               int                     `json:"id"`
	ExpectedRevision int64                   `json:"expected_revision"`
	Name             string                  `json:"name"`
	ProviderName     string                  `json:"provider_name"`
	BaseURL          string                  `json:"base_url"`
	ChannelType      int                     `json:"channel_type"`
	APIKey           string                  `json:"api_key"`
	Groups           []string                `json:"groups"`
	Models           []MinimalModeModelInput `json:"models"`
}

type MinimalModeSourceView struct {
	Id           int                     `json:"id"`
	ChannelId    int                     `json:"channel_id"`
	Revision     int64                   `json:"revision"`
	Name         string                  `json:"name"`
	ProviderName string                  `json:"provider_name"`
	BaseURL      string                  `json:"base_url"`
	ChannelType  int                     `json:"channel_type"`
	Groups       []string                `json:"groups"`
	Models       []MinimalModeModelInput `json:"models"`
	HasAPIKey    bool                    `json:"has_api_key"`
	SyncState    string                  `json:"sync_state"`
}

type minimalPricingMaps struct {
	ModelRatio      map[string]float64
	CompletionRatio map[string]float64
	CacheRatio      map[string]float64
	ModelPrice      map[string]float64
}

type minimalDigestModel struct {
	DisplayModel    string   `json:"display_model"`
	UpstreamModel   string   `json:"upstream_model"`
	IconKey         string   `json:"icon_key"`
	EndpointType    string   `json:"endpoint_type,omitempty"`
	BillingMode     string   `json:"billing_mode"`
	ModelRatio      *float64 `json:"model_ratio"`
	CompletionRatio *float64 `json:"completion_ratio"`
	CacheRatio      *float64 `json:"cache_ratio,omitempty"`
	RequestPriceUSD *float64 `json:"request_price_usd"`
	ModelName       string   `json:"model_name"`
	Description     string   `json:"description"`
	Tags            string   `json:"tags"`
	VendorID        int      `json:"vendor_id"`
	Endpoints       string   `json:"endpoints"`
	Status          int      `json:"status"`
	SyncOfficial    int      `json:"sync_official"`
	NameRule        int      `json:"name_rule"`
}

type minimalDigestChannel struct {
	Type               int               `json:"type"`
	APIKeyHash         string            `json:"api_key_hash"`
	OpenAIOrganization *string           `json:"openai_organization"`
	TestModel          *string           `json:"test_model"`
	Status             int               `json:"status"`
	Name               string            `json:"name"`
	Weight             *uint             `json:"weight"`
	BaseURL            string            `json:"base_url"`
	Other              string            `json:"other"`
	Models             []string          `json:"models"`
	Groups             []string          `json:"groups"`
	ModelMapping       map[string]string `json:"model_mapping"`
	StatusCodeMapping  *string           `json:"status_code_mapping"`
	Priority           *int64            `json:"priority"`
	AutoBan            *int              `json:"auto_ban"`
	OtherInfo          string            `json:"other_info"`
	Tag                *string           `json:"tag"`
	Setting            *string           `json:"setting"`
	ParamOverride      *string           `json:"param_override"`
	HeaderOverride     *string           `json:"header_override"`
	Remark             *string           `json:"remark"`
	IsMultiKey         bool              `json:"is_multi_key"`
	MultiKeySize       int               `json:"multi_key_size"`
	MultiKeyMode       string            `json:"multi_key_mode"`
	OtherSettings      string            `json:"other_settings"`
}

type minimalDigestAbility struct {
	Group    string  `json:"group"`
	Model    string  `json:"model"`
	Enabled  bool    `json:"enabled"`
	Priority *int64  `json:"priority"`
	Weight   uint    `json:"weight"`
	Tag      *string `json:"tag"`
}

type minimalDigestSnapshot struct {
	Channel       minimalDigestChannel   `json:"channel"`
	Models        []minimalDigestModel   `json:"models"`
	Abilities     []minimalDigestAbility `json:"abilities"`
	SharedAliases []string               `json:"shared_aliases"`
}

func MinimalModeMigrationModels() []any {
	return []any{&MinimalModeSource{}, &MinimalModeModel{}}
}

func migrateMinimalModeSharedModelIndex() error {
	migrator := DB.Migrator()
	if !migrator.HasTable(&MinimalModeModel{}) ||
		!migrator.HasIndex(&MinimalModeModel{}, "idx_minimal_mode_models_display_model") {
		return nil
	}
	return migrator.DropIndex(&MinimalModeModel{}, "idx_minimal_mode_models_display_model")
}

func minimalEndpointType(endpointType string, channelType int) string {
	switch strings.TrimSpace(endpointType) {
	case MinimalEndpointChat:
		return MinimalEndpointChat
	case MinimalEndpointResponses:
		return MinimalEndpointResponses
	case MinimalEndpointMessages:
		return MinimalEndpointMessages
	}
	if channelType == constant.ChannelTypeAnthropic {
		return MinimalEndpointMessages
	}
	return MinimalEndpointChat
}

func minimalSourceChannelType(source *MinimalModeSource, channel *Channel) int {
	if source != nil && source.ChannelType != 0 {
		return source.ChannelType
	}
	if channel != nil && channel.Type != 0 && channel.Type != constant.ChannelTypeAdvancedCustom {
		return channel.Type
	}
	return constant.ChannelTypeOpenAI
}

func minimalEndpointRoutes(modelsByEndpoint map[string][]string) []dto.AdvancedCustomRoute {
	type endpointRoute struct {
		endpointType string
		path         string
	}
	endpointRoutes := []endpointRoute{
		{endpointType: MinimalEndpointChat, path: "/v1/chat/completions"},
		{endpointType: MinimalEndpointResponses, path: "/v1/responses"},
		{endpointType: MinimalEndpointMessages, path: "/v1/messages"},
	}
	routes := make([]dto.AdvancedCustomRoute, 0, len(endpointRoutes))
	for _, endpoint := range endpointRoutes {
		models := sortedMinimalList(modelsByEndpoint[endpoint.endpointType])
		if len(models) == 0 {
			continue
		}
		route := dto.AdvancedCustomRoute{
			IncomingPath: endpoint.path,
			UpstreamPath: endpoint.path,
			Converter:    "none",
			Models:       models,
		}
		if endpoint.endpointType == MinimalEndpointMessages {
			route.Auth = &dto.AdvancedCustomRouteAuth{
				Type:  dto.AdvancedCustomAuthTypeHeader,
				Name:  "x-api-key",
				Value: "{api_key}",
			}
		}
		routes = append(routes, route)
	}
	return routes
}

func runMinimalModeTransaction(fn func(tx *gorm.DB) error) error {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		lastErr = DB.Transaction(fn)
		if lastErr == nil || !isRetryableSQLiteLockError(lastErr) {
			return lastErr
		}
		time.Sleep(time.Duration(attempt+1) * 5 * time.Millisecond)
	}
	return lastErr
}

func splitMinimalList(value string) []string {
	seen := make(map[string]struct{})
	result := make([]string, 0)
	for _, item := range strings.Split(value, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		result = append(result, item)
	}
	return result
}

func sortedMinimalList(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func minimalMapping(channel *Channel) (map[string]string, error) {
	mapping := make(map[string]string)
	if channel.ModelMapping == nil || strings.TrimSpace(*channel.ModelMapping) == "" {
		return mapping, nil
	}
	if err := common.Unmarshal([]byte(*channel.ModelMapping), &mapping); err != nil {
		return nil, err
	}
	return mapping, nil
}

func minimalPricingOptionMaps(tx *gorm.DB, forUpdate bool) (minimalPricingMaps, error) {
	defaults := minimalPricingMaps{
		ModelRatio:      ratio_setting.GetModelRatioCopy(),
		CompletionRatio: ratio_setting.GetCompletionRatioCopy(),
		CacheRatio:      ratio_setting.GetCacheRatioCopy(),
		ModelPrice:      ratio_setting.GetModelPriceCopy(),
	}
	values := []struct {
		key    string
		target map[string]float64
	}{
		{key: "CompletionRatio", target: defaults.CompletionRatio},
		{key: "CacheRatio", target: defaults.CacheRatio},
		{key: "ModelPrice", target: defaults.ModelPrice},
		{key: "ModelRatio", target: defaults.ModelRatio},
	}
	for _, entry := range values {
		fallback, err := common.Marshal(entry.target)
		if err != nil {
			return minimalPricingMaps{}, err
		}
		option := Option{Key: entry.key, Value: string(fallback)}
		query := tx.Where(commonKeyCol+" = ?", entry.key)
		if forUpdate {
			if err := tx.FirstOrCreate(&option, Option{Key: entry.key}).Error; err != nil {
				return minimalPricingMaps{}, err
			}
			query = lockForUpdate(tx).Where(commonKeyCol+" = ?", entry.key)
		}
		if err := query.First(&option).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) && !forUpdate {
				continue
			}
			return minimalPricingMaps{}, err
		}
		fresh := make(map[string]float64)
		if strings.TrimSpace(option.Value) != "" {
			if err := common.Unmarshal([]byte(option.Value), &fresh); err != nil {
				return minimalPricingMaps{}, fmt.Errorf("invalid %s option: %w", entry.key, err)
			}
		}
		switch entry.key {
		case "ModelRatio":
			defaults.ModelRatio = fresh
		case "CompletionRatio":
			defaults.CompletionRatio = fresh
		case "CacheRatio":
			defaults.CacheRatio = fresh
		case "ModelPrice":
			defaults.ModelPrice = fresh
		}
	}
	return defaults, nil
}

func minimalOptionsJSON(pricing minimalPricingMaps) (map[string]string, error) {
	values := make(map[string]string, 4)
	entries := []struct {
		key   string
		value map[string]float64
	}{
		{key: "ModelRatio", value: pricing.ModelRatio},
		{key: "CompletionRatio", value: pricing.CompletionRatio},
		{key: "CacheRatio", value: pricing.CacheRatio},
		{key: "ModelPrice", value: pricing.ModelPrice},
	}
	for _, entry := range entries {
		encoded, err := common.Marshal(entry.value)
		if err != nil {
			return nil, err
		}
		values[entry.key] = string(encoded)
	}
	return values, nil
}

func defaultMinimalPricingMaps() minimalPricingMaps {
	return minimalPricingMaps{
		ModelRatio:      ratio_setting.GetDefaultModelRatioMap(),
		CompletionRatio: ratio_setting.GetDefaultCompletionRatioMap(),
		CacheRatio:      ratio_setting.GetDefaultCacheRatioMap(),
		ModelPrice:      ratio_setting.GetDefaultModelPriceMap(),
	}
}

func minimalPricingEntryConflicts(current, defaults map[string]float64, alias string) bool {
	value, exists := current[alias]
	if !exists {
		return false
	}
	defaultValue, isDefault := defaults[alias]
	return !isDefault || value != defaultValue
}

func minimalSharedPricingMatches(pricing minimalPricingMaps, item MinimalModeModelInput) bool {
	modelRatio, hasModelRatio := pricing.ModelRatio[item.DisplayModel]
	completionRatio, hasCompletionRatio := pricing.CompletionRatio[item.DisplayModel]
	cacheRatio, hasCacheRatio := pricing.CacheRatio[item.DisplayModel]
	requestPrice, hasRequestPrice := pricing.ModelPrice[item.DisplayModel]

	switch item.BillingMode {
	case MinimalBillingToken:
		if item.ModelRatio == nil || item.CompletionRatio == nil || hasRequestPrice ||
			!hasModelRatio || modelRatio != *item.ModelRatio ||
			!hasCompletionRatio || completionRatio != *item.CompletionRatio {
			return false
		}
		if item.CacheRatio == nil {
			return !hasCacheRatio
		}
		return hasCacheRatio && cacheRatio == *item.CacheRatio
	case MinimalBillingRequest:
		return item.RequestPriceUSD != nil && hasRequestPrice && requestPrice == *item.RequestPriceUSD &&
			!hasModelRatio && !hasCompletionRatio && !hasCacheRatio
	default:
		return false
	}
}

func restoreMinimalPricingEntry(target map[string]float64, alias string, previous *float64) {
	if previous == nil {
		delete(target, alias)
		return
	}
	target[alias] = *previous
}

func minimalDigest(snapshot minimalDigestSnapshot) (string, error) {
	sort.Strings(snapshot.Channel.Models)
	sort.Strings(snapshot.Channel.Groups)
	sort.Slice(snapshot.Models, func(i, j int) bool {
		return snapshot.Models[i].DisplayModel < snapshot.Models[j].DisplayModel
	})
	sort.Slice(snapshot.Abilities, func(i, j int) bool {
		if snapshot.Abilities[i].Model == snapshot.Abilities[j].Model {
			return snapshot.Abilities[i].Group < snapshot.Abilities[j].Group
		}
		return snapshot.Abilities[i].Model < snapshot.Abilities[j].Model
	})
	sort.Strings(snapshot.SharedAliases)
	encoded, err := common.Marshal(snapshot)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", sha256.Sum256(encoded)), nil
}

func minimalChannelSnapshot(channel *Channel, mapping map[string]string) minimalDigestChannel {
	return minimalDigestChannel{
		Type:               channel.Type,
		APIKeyHash:         fmt.Sprintf("%x", sha256.Sum256([]byte(channel.Key))),
		OpenAIOrganization: channel.OpenAIOrganization,
		TestModel:          channel.TestModel,
		Status:             channel.Status,
		Name:               channel.Name,
		Weight:             channel.Weight,
		BaseURL:            channel.GetBaseURL(),
		Other:              channel.Other,
		Models:             sortedMinimalList(splitMinimalList(channel.Models)),
		Groups:             sortedMinimalList(splitMinimalList(channel.Group)),
		ModelMapping:       mapping,
		StatusCodeMapping:  channel.StatusCodeMapping,
		Priority:           channel.Priority,
		AutoBan:            channel.AutoBan,
		OtherInfo:          channel.OtherInfo,
		Tag:                channel.Tag,
		Setting:            channel.Setting,
		ParamOverride:      channel.ParamOverride,
		HeaderOverride:     channel.HeaderOverride,
		Remark:             channel.Remark,
		IsMultiKey:         channel.ChannelInfo.IsMultiKey,
		MultiKeySize:       channel.ChannelInfo.MultiKeySize,
		MultiKeyMode:       string(channel.ChannelInfo.MultiKeyMode),
		OtherSettings:      channel.OtherSettings,
	}
}

func currentMinimalSnapshot(
	tx *gorm.DB,
	source *MinimalModeSource,
	channel *Channel,
	managed []MinimalModeModel,
	pricing minimalPricingMaps,
) (minimalDigestSnapshot, []MinimalModeModelInput, bool, error) {
	mapping, err := minimalMapping(channel)
	if err != nil {
		return minimalDigestSnapshot{}, nil, true, err
	}
	views := make([]MinimalModeModelInput, 0, len(managed))
	digestModels := make([]minimalDigestModel, 0, len(managed))
	missing := false
	channelType := minimalSourceChannelType(source, channel)
	groups := sortedMinimalList(splitMinimalList(channel.Group))
	ownedModels := make(map[string]struct{}, len(managed))
	for _, owned := range managed {
		ownedModels[owned.DisplayModel] = struct{}{}
		if !owned.PreviousPricingCaptured {
			missing = true
		}
	}
	channelModels := sortedMinimalList(splitMinimalList(channel.Models))
	channelModelSet := make(map[string]struct{}, len(channelModels))
	for _, name := range channelModels {
		channelModelSet[name] = struct{}{}
	}
	for display := range ownedModels {
		if _, exists := channelModelSet[display]; !exists {
			missing = true
		}
	}
	sharedAliases := make([]string, 0)
	for _, owned := range managed {
		meta := Model{}
		if err := tx.Where("id = ?", owned.ModelId).First(&meta).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				missing = true
				continue
			}
			return minimalDigestSnapshot{}, nil, true, err
		}
		upstream := owned.DisplayModel
		if mapped := strings.TrimSpace(mapping[owned.DisplayModel]); mapped != "" {
			upstream = mapped
		}
		view := MinimalModeModelInput{
			DisplayModel:  owned.DisplayModel,
			UpstreamModel: upstream,
			IconKey:       meta.Icon,
			EndpointType:  minimalEndpointType(owned.EndpointType, channelType),
		}
		modelRatio, hasModelRatio := pricing.ModelRatio[owned.DisplayModel]
		completionRatio, hasCompletionRatio := pricing.CompletionRatio[owned.DisplayModel]
		cacheRatio, hasCacheRatio := pricing.CacheRatio[owned.DisplayModel]
		requestPrice, hasRequestPrice := pricing.ModelPrice[owned.DisplayModel]
		if hasRequestPrice {
			priceCopy := requestPrice
			view.BillingMode = MinimalBillingRequest
			view.RequestPriceUSD = &priceCopy
		} else {
			if !hasModelRatio || !hasCompletionRatio {
				missing = true
			}
			modelCopy := modelRatio
			completionCopy := completionRatio
			view.BillingMode = MinimalBillingToken
			view.ModelRatio = &modelCopy
			view.CompletionRatio = &completionCopy
			if hasCacheRatio {
				cacheCopy := cacheRatio
				view.CacheRatio = &cacheCopy
			}
		}
		digestModel := minimalDigestModel{
			DisplayModel:  owned.DisplayModel,
			UpstreamModel: upstream,
			IconKey:       meta.Icon,
			EndpointType:  owned.EndpointType,
			BillingMode:   view.BillingMode,
			ModelName:     meta.ModelName,
			Description:   meta.Description,
			Tags:          meta.Tags,
			VendorID:      meta.VendorID,
			Endpoints:     meta.Endpoints,
			Status:        meta.Status,
			SyncOfficial:  meta.SyncOfficial,
			NameRule:      meta.NameRule,
		}
		if hasModelRatio {
			value := modelRatio
			digestModel.ModelRatio = &value
		}
		if hasCompletionRatio {
			value := completionRatio
			digestModel.CompletionRatio = &value
		}
		if hasCacheRatio {
			value := cacheRatio
			digestModel.CacheRatio = &value
		}
		if hasRequestPrice {
			priceCopy := requestPrice
			digestModel.RequestPriceUSD = &priceCopy
		}
		digestModels = append(digestModels, digestModel)
		views = append(views, view)

		var sharedAbilityCount int64
		managedChannelIDs := tx.Model(&MinimalModeSource{}).Select("channel_id")
		if err := tx.Model(&Ability{}).
			Where("LOWER(model) = LOWER(?) AND channel_id <> ?", owned.DisplayModel, channel.Id).
			Where("channel_id NOT IN (?)", managedChannelIDs).
			Count(&sharedAbilityCount).Error; err != nil {
			return minimalDigestSnapshot{}, nil, true, err
		}
		if sharedAbilityCount != 0 {
			sharedAliases = append(sharedAliases, owned.DisplayModel)
		}
	}

	var abilities []Ability
	if err := tx.Where("channel_id = ?", channel.Id).Order("model ASC").Order(commonGroupCol + " ASC").Find(&abilities).Error; err != nil {
		return minimalDigestSnapshot{}, nil, true, err
	}
	groupSet := make(map[string]struct{}, len(groups))
	for _, group := range groups {
		groupSet[group] = struct{}{}
	}
	digestAbilities := make([]minimalDigestAbility, 0, len(abilities))
	foundAbilityKeys := make(map[string]struct{}, len(abilities))
	for _, ability := range abilities {
		foundAbilityKeys[ability.Model+"\x00"+ability.Group] = struct{}{}
		digestAbilities = append(digestAbilities, minimalDigestAbility{
			Group: ability.Group, Model: ability.Model, Enabled: ability.Enabled,
			Priority: ability.Priority, Weight: ability.Weight, Tag: ability.Tag,
		})
	}
	for modelName := range ownedModels {
		for group := range groupSet {
			if _, exists := foundAbilityKeys[modelName+"\x00"+group]; !exists {
				missing = true
			}
		}
	}
	snapshot := minimalDigestSnapshot{
		Channel:       minimalChannelSnapshot(channel, mapping),
		Models:        digestModels,
		Abilities:     digestAbilities,
		SharedAliases: sharedAliases,
	}
	return snapshot, views, missing, nil
}

func minimalSnapshotCanBeAdopted(snapshot minimalDigestSnapshot) bool {
	if len(snapshot.SharedAliases) != 0 || snapshot.Channel.IsMultiKey ||
		len(snapshot.Models) == 0 || len(snapshot.Channel.Groups) == 0 ||
		len(snapshot.Channel.Models) != len(snapshot.Models) ||
		len(snapshot.Abilities) != len(snapshot.Models)*len(snapshot.Channel.Groups) {
		return false
	}
	models := make(map[string]struct{}, len(snapshot.Models))
	for _, item := range snapshot.Models {
		if item.ModelName != item.DisplayModel {
			return false
		}
		switch item.BillingMode {
		case MinimalBillingToken:
			if item.ModelRatio == nil || item.CompletionRatio == nil || item.RequestPriceUSD != nil {
				return false
			}
		case MinimalBillingRequest:
			if item.RequestPriceUSD == nil || item.ModelRatio != nil || item.CompletionRatio != nil || item.CacheRatio != nil {
				return false
			}
		default:
			return false
		}
		models[item.DisplayModel] = struct{}{}
	}
	for _, name := range snapshot.Channel.Models {
		if _, exists := models[name]; !exists {
			return false
		}
	}
	for display, upstream := range snapshot.Channel.ModelMapping {
		if _, exists := models[display]; !exists || strings.TrimSpace(upstream) == "" || display == upstream {
			return false
		}
	}
	groups := make(map[string]struct{}, len(snapshot.Channel.Groups))
	for _, group := range snapshot.Channel.Groups {
		groups[group] = struct{}{}
	}
	expectedWeight := uint(0)
	if snapshot.Channel.Weight != nil {
		expectedWeight = *snapshot.Channel.Weight
	}
	seen := make(map[string]struct{}, len(snapshot.Abilities))
	for _, ability := range snapshot.Abilities {
		if _, exists := models[ability.Model]; !exists {
			return false
		}
		if _, exists := groups[ability.Group]; !exists {
			return false
		}
		priorityMatches := (ability.Priority == nil && snapshot.Channel.Priority == nil) ||
			(ability.Priority != nil && snapshot.Channel.Priority != nil && *ability.Priority == *snapshot.Channel.Priority)
		tagMatches := (ability.Tag == nil && snapshot.Channel.Tag == nil) ||
			(ability.Tag != nil && snapshot.Channel.Tag != nil && *ability.Tag == *snapshot.Channel.Tag)
		if ability.Enabled != (snapshot.Channel.Status == common.ChannelStatusEnabled) ||
			!priorityMatches || ability.Weight != expectedWeight || !tagMatches {
			return false
		}
		key := ability.Model + "\x00" + ability.Group
		if _, duplicate := seen[key]; duplicate {
			return false
		}
		seen[key] = struct{}{}
	}
	return true
}

func ListMinimalModeSources() ([]MinimalModeSourceView, error) {
	var sources []MinimalModeSource
	if err := DB.Order("id ASC").Find(&sources).Error; err != nil {
		return nil, err
	}
	pricing, err := minimalPricingOptionMaps(DB, false)
	if err != nil {
		return nil, err
	}
	result := make([]MinimalModeSourceView, 0, len(sources))
	for _, source := range sources {
		view := MinimalModeSourceView{Id: source.Id, ChannelId: source.ChannelId, Revision: source.Revision, ProviderName: source.ProviderName, SyncState: MinimalSyncMissing}
		channel := Channel{}
		if err := DB.Where("id = ?", source.ChannelId).First(&channel).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				result = append(result, view)
				continue
			}
			return nil, err
		}
		var managed []MinimalModeModel
		if err := DB.Where("source_id = ?", source.Id).Order("display_model ASC").Find(&managed).Error; err != nil {
			return nil, err
		}
		snapshot, models, missing, err := currentMinimalSnapshot(DB, &source, &channel, managed, pricing)
		if err != nil {
			return nil, err
		}
		digest, err := minimalDigest(snapshot)
		if err != nil {
			return nil, err
		}
		view.Name = channel.Name
		if strings.TrimSpace(view.ProviderName) == "" {
			view.ProviderName = channel.Name
		}
		view.BaseURL = channel.GetBaseURL()
		view.ChannelType = minimalSourceChannelType(&source, &channel)
		view.Groups = sortedMinimalList(splitMinimalList(channel.Group))
		view.Models = models
		view.HasAPIKey = strings.TrimSpace(channel.Key) != ""
		switch {
		case missing:
			view.SyncState = MinimalSyncMissing
		case digest == source.LastSyncedDigest:
			view.SyncState = MinimalSyncInSync
		default:
			view.SyncState = MinimalSyncDrifted
		}
		result = append(result, view)
	}
	return result, nil
}

func GetMinimalModeSourceChannel(sourceId int) (*Channel, error) {
	var source MinimalModeSource
	if err := DB.Where("id = ?", sourceId).First(&source).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrMinimalSourceNotFound
		}
		return nil, err
	}
	var channel Channel
	if err := DB.Where("id = ?", source.ChannelId).First(&channel).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrMinimalSourceNotFound
		}
		return nil, err
	}
	return &channel, nil
}

func ReconcileMinimalModeSource(input MinimalModeSourceInput) (MinimalModeSourceView, map[string]string, error) {
	GroupSettingsMutex.Lock()
	defer GroupSettingsMutex.Unlock()
	for index := range input.Models {
		input.Models[index].EndpointType = minimalEndpointType(input.Models[index].EndpointType, input.ChannelType)
	}
	var source MinimalModeSource
	var channel Channel
	var committedView MinimalModeSourceView
	var runtimeOptions map[string]string
	now := GetDBTimestamp()
	err := runMinimalModeTransaction(func(tx *gorm.DB) error {
		source = MinimalModeSource{}
		channel = Channel{}
		runtimeOptions = nil
		var oldManaged []MinimalModeModel
		if input.Id != 0 {
			if err := lockForUpdate(tx).Where("id = ?", input.Id).First(&source).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrMinimalSourceNotFound
				}
				return err
			}
			if source.Revision != input.ExpectedRevision {
				return ErrMinimalRevision
			}
			if err := lockForUpdate(tx).Where("id = ?", source.ChannelId).First(&channel).Error; err != nil {
				return ErrMinimalDrifted
			}
			if err := lockForUpdate(tx).Where("source_id = ?", source.Id).Order("id ASC").Find(&oldManaged).Error; err != nil {
				return err
			}
		}

		pricing, err := minimalPricingOptionMaps(tx, true)
		if err != nil {
			return err
		}
		if input.Id != 0 {
			current, _, missing, err := currentMinimalSnapshot(tx, &source, &channel, oldManaged, pricing)
			if err != nil {
				return err
			}
			digest, err := minimalDigest(current)
			if err != nil {
				return err
			}
			if missing || digest != source.LastSyncedDigest {
				return ErrMinimalDrifted
			}
		}

		oldByDisplay := make(map[string]MinimalModeModel, len(oldManaged))
		for _, item := range oldManaged {
			oldByDisplay[strings.ToLower(item.DisplayModel)] = item
		}
		sharedByDisplay := make(map[string]MinimalModeModel)
		defaultPricing := defaultMinimalPricingMaps()
		for index := range input.Models {
			item := &input.Models[index]
			identity := strings.ToLower(item.DisplayModel)
			owned, ownedByCurrentSource := oldByDisplay[identity]
			if ownedByCurrentSource {
				item.DisplayModel = owned.DisplayModel
			}

			var sharedOwner MinimalModeModel
			sharedQuery := lockForUpdate(tx).
				Where("LOWER(display_model) = LOWER(?) AND source_id <> ?", item.DisplayModel, source.Id).
				Order("id ASC")
			hasSharedOwner := false
			if err := sharedQuery.First(&sharedOwner).Error; err == nil {
				hasSharedOwner = true
				item.DisplayModel = sharedOwner.DisplayModel
				identity = strings.ToLower(item.DisplayModel)
				sharedByDisplay[identity] = sharedOwner
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}

			var existing Model
			if err := lockForUpdate(tx).Where("LOWER(model_name) = LOWER(?)", item.DisplayModel).First(&existing).Error; err == nil {
				ownedModelMatches := ownedByCurrentSource && owned.ModelId == existing.Id
				sharedModelMatches := hasSharedOwner && sharedOwner.ModelId == existing.Id
				if !ownedModelMatches && !sharedModelMatches {
					return fmt.Errorf("%w: model %s already exists outside minimal mode", ErrMinimalModelConflict, item.DisplayModel)
				}
				if hasSharedOwner && existing.Icon != item.IconKey {
					return fmt.Errorf("%w: shared alias %s must use the same icon", ErrMinimalModelConflict, item.DisplayModel)
				}
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			} else if ownedByCurrentSource || hasSharedOwner {
				return ErrMinimalDrifted
			}
			var externalAbility Ability
			abilityQuery := lockForUpdate(tx).Where("LOWER(model) = LOWER(?)", item.DisplayModel)
			if channel.Id != 0 {
				abilityQuery = abilityQuery.Where("channel_id <> ?", channel.Id)
			}
			abilityQuery = abilityQuery.Where(
				"channel_id NOT IN (?)",
				tx.Model(&MinimalModeSource{}).Select("channel_id"),
			)
			if err := abilityQuery.First(&externalAbility).Error; err == nil {
				return fmt.Errorf("%w: alias %s already has an unmanaged routing ability", ErrMinimalModelConflict, item.DisplayModel)
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			if hasSharedOwner && !minimalSharedPricingMatches(pricing, *item) {
				return fmt.Errorf("%w: shared alias %s must use the same pricing", ErrMinimalModelConflict, item.DisplayModel)
			}
			if !ownedByCurrentSource && !hasSharedOwner &&
				(minimalPricingEntryConflicts(pricing.ModelRatio, defaultPricing.ModelRatio, item.DisplayModel) ||
					minimalPricingEntryConflicts(pricing.CompletionRatio, defaultPricing.CompletionRatio, item.DisplayModel) ||
					minimalPricingEntryConflicts(pricing.CacheRatio, defaultPricing.CacheRatio, item.DisplayModel) ||
					minimalPricingEntryConflicts(pricing.ModelPrice, defaultPricing.ModelPrice, item.DisplayModel)) {
				return fmt.Errorf("%w: alias %s already has manually managed pricing", ErrMinimalModelConflict, item.DisplayModel)
			}
		}

		oldOwnedSet := make(map[string]struct{}, len(oldManaged))
		for _, item := range oldManaged {
			oldOwnedSet[item.DisplayModel] = struct{}{}
		}
		unmanagedModels := make([]string, 0)
		if input.Id != 0 {
			for _, name := range splitMinimalList(channel.Models) {
				if _, owned := oldOwnedSet[name]; !owned {
					unmanagedModels = append(unmanagedModels, name)
				}
			}
		}
		newDisplays := make([]string, 0, len(input.Models))
		for _, item := range input.Models {
			newDisplays = append(newDisplays, item.DisplayModel)
		}
		channelModels := sortedMinimalList(append(unmanagedModels, newDisplays...))
		groups := sortedMinimalList(input.Groups)
		mapping := make(map[string]string)
		if input.Id != 0 {
			mapping, err = minimalMapping(&channel)
			if err != nil {
				return err
			}
			for display := range oldOwnedSet {
				delete(mapping, display)
			}
		}
		for _, item := range input.Models {
			if item.UpstreamModel != item.DisplayModel {
				mapping[item.DisplayModel] = item.UpstreamModel
			}
		}
		mappingJSON := ""
		if len(mapping) > 0 {
			encoded, err := common.Marshal(mapping)
			if err != nil {
				return err
			}
			mappingJSON = string(encoded)
		}
		modelsByEndpoint := map[string][]string{
			MinimalEndpointChat:      []string{},
			MinimalEndpointResponses: []string{},
			MinimalEndpointMessages:  []string{},
		}
		for _, item := range input.Models {
			modelsByEndpoint[item.EndpointType] = append(modelsByEndpoint[item.EndpointType], item.DisplayModel)
		}
		defaultEndpoint := minimalEndpointType("", input.ChannelType)
		for _, modelName := range unmanagedModels {
			modelsByEndpoint[defaultEndpoint] = append(modelsByEndpoint[defaultEndpoint], modelName)
		}
		otherSettings := dto.ChannelOtherSettings{}
		if strings.TrimSpace(channel.OtherSettings) != "" {
			if err := common.UnmarshalJsonStr(channel.OtherSettings, &otherSettings); err != nil {
				return ErrMinimalDrifted
			}
		}
		otherSettings.AdvancedCustom = &dto.AdvancedCustomConfig{
			Routes: minimalEndpointRoutes(modelsByEndpoint),
		}
		if err := otherSettings.AdvancedCustom.Validate(); err != nil {
			return err
		}
		otherSettingsJSON, err := common.Marshal(otherSettings)
		if err != nil {
			return err
		}
		baseURL := input.BaseURL
		priority := int64(0)
		weight := uint(0)
		autoBan := 1
		if input.Id == 0 {
			channel = Channel{
				Type:          constant.ChannelTypeAdvancedCustom,
				Key:           input.APIKey,
				Status:        common.ChannelStatusEnabled,
				Name:          input.Name,
				Weight:        &weight,
				CreatedTime:   now,
				BaseURL:       &baseURL,
				Models:        strings.Join(channelModels, ","),
				Group:         strings.Join(groups, ","),
				ModelMapping:  &mappingJSON,
				Priority:      &priority,
				AutoBan:       &autoBan,
				OtherSettings: string(otherSettingsJSON),
			}
			if err := tx.Create(&channel).Error; err != nil {
				return err
			}
		} else {
			updates := map[string]any{
				"type":          constant.ChannelTypeAdvancedCustom,
				"name":          input.Name,
				"base_url":      baseURL,
				"models":        strings.Join(channelModels, ","),
				"group":         strings.Join(groups, ","),
				"model_mapping": mappingJSON,
				"settings":      string(otherSettingsJSON),
			}
			if strings.TrimSpace(input.APIKey) != "" {
				updates["key"] = input.APIKey
				channel.Key = input.APIKey
			}
			if err := tx.Model(&Channel{}).Where("id = ?", channel.Id).Updates(updates).Error; err != nil {
				return err
			}
			channel.Type = constant.ChannelTypeAdvancedCustom
			channel.Name = input.Name
			channel.BaseURL = &baseURL
			channel.Models = strings.Join(channelModels, ",")
			channel.Group = strings.Join(groups, ",")
			channel.ModelMapping = &mappingJSON
			channel.OtherSettings = string(otherSettingsJSON)
		}
		if err := channel.UpdateAbilities(tx); err != nil {
			return err
		}

		newManaged := make([]MinimalModeModel, 0, len(input.Models))
		vendorsByName := make(map[string]Vendor)
		for _, item := range input.Models {
			providerName := strings.SplitN(item.IconKey, ".", 2)[0]
			vendor, ok := vendorsByName[providerName]
			if !ok {
				if err := lockForUpdate(tx).Where("LOWER(name) = LOWER(?)", providerName).First(&vendor).Error; err != nil {
					if !errors.Is(err, gorm.ErrRecordNotFound) {
						return err
					}
					vendor = Vendor{
						Name: providerName, Icon: item.IconKey, Status: 1,
						CreatedTime: now, UpdatedTime: now,
					}
					if err := tx.Create(&vendor).Error; err != nil {
						return err
					}
				}
				vendorsByName[providerName] = vendor
			}
			identity := strings.ToLower(item.DisplayModel)
			owned, exists := oldByDisplay[identity]
			sharedOwner, hasSharedOwner := sharedByDisplay[identity]
			meta := Model{}
			if exists {
				if err := lockForUpdate(tx).Where("id = ?", owned.ModelId).First(&meta).Error; err != nil {
					return err
				}
				if err := tx.Model(&Model{}).Where("id = ?", meta.Id).Updates(map[string]any{
					"icon": item.IconKey, "vendor_id": vendor.Id, "updated_time": now,
				}).Error; err != nil {
					return err
				}
			} else if hasSharedOwner {
				if err := lockForUpdate(tx).Where("id = ?", sharedOwner.ModelId).First(&meta).Error; err != nil {
					return ErrMinimalDrifted
				}
			} else {
				meta = Model{ModelName: item.DisplayModel, Icon: item.IconKey, VendorID: vendor.Id, Status: 1, SyncOfficial: 0, NameRule: NameRuleExact, CreatedTime: now, UpdatedTime: now}
				if err := tx.Create(&meta).Error; err != nil {
					return err
				}
				if err := tx.Model(&Model{}).Where("id = ?", meta.Id).Updates(map[string]any{"status": 1, "sync_official": 0}).Error; err != nil {
					return err
				}
			}
			managed := MinimalModeModel{
				Id:                      owned.Id,
				SourceId:                source.Id,
				ModelId:                 meta.Id,
				DisplayModel:            item.DisplayModel,
				UpstreamModel:           item.UpstreamModel,
				IconKey:                 item.IconKey,
				EndpointType:            item.EndpointType,
				BillingMode:             item.BillingMode,
				ModelRatio:              item.ModelRatio,
				CompletionRatio:         item.CompletionRatio,
				CacheRatio:              item.CacheRatio,
				RequestPriceUSD:         item.RequestPriceUSD,
				PreviousPricingCaptured: owned.PreviousPricingCaptured,
				PreviousModelRatio:      owned.PreviousModelRatio,
				PreviousCompletionRatio: owned.PreviousCompletionRatio,
				PreviousCacheRatio:      owned.PreviousCacheRatio,
				PreviousRequestPriceUSD: owned.PreviousRequestPriceUSD,
				CreatedTime:             owned.CreatedTime,
				UpdatedTime:             now,
			}
			if !exists {
				if hasSharedOwner {
					managed.PreviousPricingCaptured = sharedOwner.PreviousPricingCaptured
					managed.PreviousModelRatio = sharedOwner.PreviousModelRatio
					managed.PreviousCompletionRatio = sharedOwner.PreviousCompletionRatio
					managed.PreviousCacheRatio = sharedOwner.PreviousCacheRatio
					managed.PreviousRequestPriceUSD = sharedOwner.PreviousRequestPriceUSD
				} else {
					managed.PreviousPricingCaptured = true
					if value, ok := pricing.ModelRatio[item.DisplayModel]; ok {
						valueCopy := value
						managed.PreviousModelRatio = &valueCopy
					}
					if value, ok := pricing.CompletionRatio[item.DisplayModel]; ok {
						valueCopy := value
						managed.PreviousCompletionRatio = &valueCopy
					}
					if value, ok := pricing.CacheRatio[item.DisplayModel]; ok {
						valueCopy := value
						managed.PreviousCacheRatio = &valueCopy
					}
					if value, ok := pricing.ModelPrice[item.DisplayModel]; ok {
						valueCopy := value
						managed.PreviousRequestPriceUSD = &valueCopy
					}
				}
			}
			if managed.CreatedTime == 0 {
				managed.CreatedTime = now
			}
			newManaged = append(newManaged, managed)
			if item.BillingMode == MinimalBillingRequest {
				pricing.ModelPrice[item.DisplayModel] = *item.RequestPriceUSD
				delete(pricing.ModelRatio, item.DisplayModel)
				delete(pricing.CompletionRatio, item.DisplayModel)
				delete(pricing.CacheRatio, item.DisplayModel)
			} else {
				pricing.ModelRatio[item.DisplayModel] = *item.ModelRatio
				pricing.CompletionRatio[item.DisplayModel] = *item.CompletionRatio
				if item.CacheRatio == nil {
					delete(pricing.CacheRatio, item.DisplayModel)
				} else {
					pricing.CacheRatio[item.DisplayModel] = *item.CacheRatio
				}
				delete(pricing.ModelPrice, item.DisplayModel)
			}
		}

		newSet := make(map[string]struct{}, len(newManaged))
		for _, item := range newManaged {
			newSet[item.DisplayModel] = struct{}{}
		}
		for _, old := range oldManaged {
			if _, keep := newSet[old.DisplayModel]; keep {
				continue
			}
			var otherAbilities int64
			if err := tx.Model(&Ability{}).Where("LOWER(model) = LOWER(?) AND channel_id <> ?", old.DisplayModel, channel.Id).Count(&otherAbilities).Error; err != nil {
				return err
			}
			if otherAbilities == 0 {
				restoreMinimalPricingEntry(pricing.ModelRatio, old.DisplayModel, old.PreviousModelRatio)
				restoreMinimalPricingEntry(pricing.CompletionRatio, old.DisplayModel, old.PreviousCompletionRatio)
				restoreMinimalPricingEntry(pricing.CacheRatio, old.DisplayModel, old.PreviousCacheRatio)
				restoreMinimalPricingEntry(pricing.ModelPrice, old.DisplayModel, old.PreviousRequestPriceUSD)
				if err := tx.Delete(&Model{}, old.ModelId).Error; err != nil {
					return err
				}
			}
		}

		if input.Id == 0 {
			source = MinimalModeSource{ChannelId: channel.Id, ChannelType: input.ChannelType, ProviderName: input.ProviderName, Revision: 1, CreatedTime: now, UpdatedTime: now}
			if err := tx.Create(&source).Error; err != nil {
				return err
			}
		} else {
			source.Revision++
			source.ChannelType = input.ChannelType
			source.ProviderName = input.ProviderName
			source.UpdatedTime = now
		}
		if err := tx.Where("source_id = ?", source.Id).Delete(&MinimalModeModel{}).Error; err != nil {
			return err
		}
		for index := range newManaged {
			newManaged[index].Id = 0
			newManaged[index].SourceId = source.Id
		}
		if len(newManaged) > 0 {
			if err := tx.Create(&newManaged).Error; err != nil {
				return err
			}
		}
		snapshot, committedModels, missing, err := currentMinimalSnapshot(tx, &source, &channel, newManaged, pricing)
		if err != nil {
			return err
		}
		if missing {
			return ErrMinimalDrifted
		}
		digest, err := minimalDigest(snapshot)
		if err != nil {
			return err
		}
		source.LastSyncedDigest = digest
		if err := tx.Model(&MinimalModeSource{}).Where("id = ?", source.Id).Updates(map[string]any{
			"channel_type": source.ChannelType, "provider_name": source.ProviderName, "revision": source.Revision,
			"last_synced_digest": digest, "updated_time": now,
		}).Error; err != nil {
			return err
		}
		runtimeOptions, err = minimalOptionsJSON(pricing)
		if err != nil {
			return err
		}
		committedView = MinimalModeSourceView{
			Id: source.Id, ChannelId: channel.Id, Revision: source.Revision,
			Name: channel.Name, ProviderName: source.ProviderName,
			BaseURL: channel.GetBaseURL(), ChannelType: source.ChannelType,
			Groups: sortedMinimalList(splitMinimalList(channel.Group)), Models: committedModels,
			HasAPIKey: strings.TrimSpace(channel.Key) != "", SyncState: MinimalSyncInSync,
		}
		return UpdateOptionsWithTx(tx, runtimeOptions)
	})
	if err != nil {
		return MinimalModeSourceView{}, nil, err
	}
	cacheMinimalModeChannelOwnership(channel.Id, true)
	return committedView, runtimeOptions, nil
}

func AdoptMinimalModeSource(sourceId int, expectedRevision int64) (MinimalModeSourceView, error) {
	GroupSettingsMutex.Lock()
	defer GroupSettingsMutex.Unlock()
	var committedView MinimalModeSourceView
	now := GetDBTimestamp()
	err := runMinimalModeTransaction(func(tx *gorm.DB) error {
		source := MinimalModeSource{}
		if err := lockForUpdate(tx).Where("id = ?", sourceId).First(&source).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrMinimalSourceNotFound
			}
			return err
		}
		if source.Revision != expectedRevision {
			return ErrMinimalRevision
		}
		channel := Channel{}
		if err := lockForUpdate(tx).Where("id = ?", source.ChannelId).First(&channel).Error; err != nil {
			return ErrMinimalDrifted
		}
		var managed []MinimalModeModel
		if err := lockForUpdate(tx).Where("source_id = ?", source.Id).Order("id ASC").Find(&managed).Error; err != nil {
			return err
		}
		pricing, err := minimalPricingOptionMaps(tx, true)
		if err != nil {
			return err
		}
		snapshot, models, missing, err := currentMinimalSnapshot(tx, &source, &channel, managed, pricing)
		if err != nil {
			return err
		}
		if missing {
			return ErrMinimalDrifted
		}
		if !minimalSnapshotCanBeAdopted(snapshot) {
			return ErrMinimalDrifted
		}
		byDisplay := make(map[string]MinimalModeModelInput, len(models))
		for _, item := range models {
			byDisplay[item.DisplayModel] = item
		}
		for _, owned := range managed {
			item := byDisplay[owned.DisplayModel]
			if err := tx.Model(&MinimalModeModel{}).Where("id = ?", owned.Id).Updates(map[string]any{
				"upstream_model": item.UpstreamModel, "icon_key": item.IconKey, "billing_mode": item.BillingMode,
				"model_ratio": item.ModelRatio, "completion_ratio": item.CompletionRatio,
				"cache_ratio": item.CacheRatio, "request_price_usd": item.RequestPriceUSD, "updated_time": now,
			}).Error; err != nil {
				return err
			}
		}
		digest, err := minimalDigest(snapshot)
		if err != nil {
			return err
		}
		nextRevision := source.Revision + 1
		if err := tx.Model(&MinimalModeSource{}).Where("id = ?", source.Id).Updates(map[string]any{
			"revision": nextRevision, "last_synced_digest": digest, "updated_time": now,
		}).Error; err != nil {
			return err
		}
		committedView = MinimalModeSourceView{
			Id: source.Id, ChannelId: channel.Id, Revision: nextRevision,
			Name: channel.Name, ProviderName: source.ProviderName,
			BaseURL: channel.GetBaseURL(), ChannelType: minimalSourceChannelType(&source, &channel),
			Groups: sortedMinimalList(splitMinimalList(channel.Group)), Models: models,
			HasAPIKey: strings.TrimSpace(channel.Key) != "", SyncState: MinimalSyncInSync,
		}
		return nil
	})
	if err != nil {
		return MinimalModeSourceView{}, err
	}
	return committedView, nil
}

func DetachMinimalModeSource(sourceId int, expectedRevision int64) error {
	GroupSettingsMutex.Lock()
	defer GroupSettingsMutex.Unlock()
	channelId := 0
	err := runMinimalModeTransaction(func(tx *gorm.DB) error {
		source := MinimalModeSource{}
		if err := lockForUpdate(tx).Where("id = ?", sourceId).First(&source).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrMinimalSourceNotFound
			}
			return err
		}
		if source.Revision != expectedRevision {
			return ErrMinimalRevision
		}
		channelId = source.ChannelId
		if err := tx.Where("source_id = ?", source.Id).Delete(&MinimalModeModel{}).Error; err != nil {
			return err
		}
		return tx.Delete(&MinimalModeSource{}, source.Id).Error
	})
	if err == nil {
		cacheMinimalModeChannelOwnership(channelId, false)
	}
	return err
}

func DeleteMinimalModeSource(sourceId int, expectedRevision int64) (map[string]string, error) {
	GroupSettingsMutex.Lock()
	defer GroupSettingsMutex.Unlock()
	var runtimeOptions map[string]string
	channelId := 0
	err := runMinimalModeTransaction(func(tx *gorm.DB) error {
		runtimeOptions = nil
		source := MinimalModeSource{}
		if err := lockForUpdate(tx).Where("id = ?", sourceId).First(&source).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrMinimalSourceNotFound
			}
			return err
		}
		if source.Revision != expectedRevision {
			return ErrMinimalRevision
		}
		channelId = source.ChannelId
		channel := Channel{}
		if err := lockForUpdate(tx).Where("id = ?", source.ChannelId).First(&channel).Error; err != nil {
			return ErrMinimalDrifted
		}
		var managed []MinimalModeModel
		if err := lockForUpdate(tx).Where("source_id = ?", source.Id).Order("id ASC").Find(&managed).Error; err != nil {
			return err
		}
		pricing, err := minimalPricingOptionMaps(tx, true)
		if err != nil {
			return err
		}
		snapshot, _, missing, err := currentMinimalSnapshot(tx, &source, &channel, managed, pricing)
		if err != nil {
			return err
		}
		digest, err := minimalDigest(snapshot)
		if err != nil {
			return err
		}
		if missing || digest != source.LastSyncedDigest {
			return ErrMinimalDrifted
		}
		ownedModels := make(map[string]struct{}, len(managed))
		for _, item := range managed {
			ownedModels[item.DisplayModel] = struct{}{}
		}
		channelModels := splitMinimalList(channel.Models)
		if len(channelModels) != len(ownedModels) {
			return ErrMinimalDrifted
		}
		for _, name := range channelModels {
			if _, owned := ownedModels[name]; !owned {
				return ErrMinimalDrifted
			}
		}
		var abilityCount int64
		if err := tx.Model(&Ability{}).Where("channel_id = ?", channel.Id).Count(&abilityCount).Error; err != nil {
			return err
		}
		expectedAbilities := int64(len(managed) * len(splitMinimalList(channel.Group)))
		if abilityCount != expectedAbilities {
			return ErrMinimalDrifted
		}
		if err := tx.Where("channel_id = ?", channel.Id).Delete(&Ability{}).Error; err != nil {
			return err
		}
		for _, item := range managed {
			var otherAbilities int64
			if err := tx.Model(&Ability{}).Where("LOWER(model) = LOWER(?)", item.DisplayModel).Count(&otherAbilities).Error; err != nil {
				return err
			}
			if otherAbilities == 0 {
				restoreMinimalPricingEntry(pricing.ModelRatio, item.DisplayModel, item.PreviousModelRatio)
				restoreMinimalPricingEntry(pricing.CompletionRatio, item.DisplayModel, item.PreviousCompletionRatio)
				restoreMinimalPricingEntry(pricing.CacheRatio, item.DisplayModel, item.PreviousCacheRatio)
				restoreMinimalPricingEntry(pricing.ModelPrice, item.DisplayModel, item.PreviousRequestPriceUSD)
				if err := tx.Delete(&Model{}, item.ModelId).Error; err != nil {
					return err
				}
			}
		}
		if err := tx.Where("source_id = ?", source.Id).Delete(&MinimalModeModel{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&MinimalModeSource{}, source.Id).Error; err != nil {
			return err
		}
		if err := tx.Delete(&Channel{}, channel.Id).Error; err != nil {
			return err
		}
		runtimeOptions, err = minimalOptionsJSON(pricing)
		if err != nil {
			return err
		}
		return UpdateOptionsWithTx(tx, runtimeOptions)
	})
	if err == nil {
		cacheMinimalModeChannelOwnership(channelId, false)
	}
	return runtimeOptions, err
}
