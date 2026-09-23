package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

type MinimalModeBatchInput struct {
	model.MinimalModeSourceInput
	APIKeys []string `json:"api_keys"`
}

func normalizeMinimalModeBatch(input MinimalModeBatchInput) ([]model.MinimalModeSourceInput, error) {
	if input.Id != 0 || input.ExpectedRevision != 0 || input.APIKey != "" {
		return nil, errors.New("Batch creation cannot update existing channels")
	}
	if len(input.APIKeys) == 0 || len(input.APIKeys) > model.MaxMinimalModeBatchKeys {
		return nil, errors.New("Enter between 1 and 100 API keys")
	}
	keys := make([]string, 0, len(input.APIKeys))
	seen := make(map[string]bool, len(input.APIKeys))
	for _, raw := range input.APIKeys {
		key := normalizeMinimalAPIKey(raw)
		if key == "" {
			continue
		}
		if len(key) > 65536 || strings.ContainsAny(key, "\r\n") {
			return nil, errors.New("Each API key must be a single value of at most 65536 bytes")
		}
		if !seen[key] {
			seen[key] = true
			keys = append(keys, key)
		}
	}
	if len(keys) == 0 {
		return nil, errors.New("Enter between 1 and 100 API keys")
	}
	template := input.MinimalModeSourceInput
	template.APIKey = keys[0]
	template.Models = append([]model.MinimalModeModelInput(nil), template.Models...)
	template, err := NormalizeMinimalModeSourceInput(template)
	if err != nil {
		return nil, err
	}
	inputs := make([]model.MinimalModeSourceInput, 0, len(keys))
	for index, key := range keys {
		item := template
		item.APIKey = key
		if len(keys) > 1 {
			suffix := fmt.Sprintf(" #%d", index+1)
			name := []rune(template.Name)
			for len(string(name))+len(suffix) > 128 {
				name = name[:len(name)-1]
			}
			item.Name = string(name) + suffix
		}
		inputs = append(inputs, item)
	}
	return inputs, nil
}

func CreateMinimalModeSources(ctx context.Context, input MinimalModeBatchInput) ([]model.MinimalModeSourceView, error) {
	inputs, err := normalizeMinimalModeBatch(input)
	if err != nil {
		return nil, err
	}
	parsed, err := url.Parse(inputs[0].BaseURL)
	if err != nil {
		return nil, errors.New("base URL is invalid")
	}
	if err := validateMinimalHost(ctx, parsed.Hostname(), operation_setting.GetMinimalModeSetting()); err != nil {
		return nil, err
	}
	views, options, err := model.CreateMinimalModeSources(inputs)
	if err != nil {
		return nil, err
	}
	applyMinimalModeRuntime(options)
	return views, nil
}
