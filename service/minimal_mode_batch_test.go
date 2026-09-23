package service

import (
	"context"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func minimalBatchFixture() MinimalModeBatchInput {
	price := 0.1
	return MinimalModeBatchInput{
		MinimalModeSourceInput: model.MinimalModeSourceInput{
			Name: "Batch source", BaseURL: "https://api.example.com/v1", ChannelType: 1,
			Groups: []string{"Free"},
			Models: []model.MinimalModeModelInput{{DisplayModel: "batch-model", UpstreamModel: "actual-model", IconKey: "OpenAI", EndpointType: model.MinimalEndpointResponses, BillingMode: model.MinimalBillingRequest, RequestPriceUSD: &price}},
		},
		APIKeys: []string{" Bearer first-key ", "", "first-key", "second-key"},
	}
}

func TestMinimalModeBatchNormalizesKeysAndPreservesConfiguration(t *testing.T) {
	input := minimalBatchFixture()
	input.Name = strings.Repeat("源", 42)
	items, err := normalizeMinimalModeBatch(input)
	require.NoError(t, err)
	require.Len(t, items, 2)
	assert.Equal(t, "first-key", items[0].APIKey)
	assert.Equal(t, "second-key", items[1].APIKey)
	for i, item := range items {
		assert.LessOrEqual(t, len(item.Name), 128)
		assert.True(t, utf8.ValidString(item.Name))
		assert.Zero(t, item.Id)
		assert.Equal(t, "https://api.example.com", item.BaseURL)
		assert.Equal(t, input.Groups, item.Groups)
		assert.Equal(t, input.Models, item.Models)
		assert.Contains(t, item.Name, []string{"#1", "#2"}[i])
	}
}

func TestMinimalModeBatchRejectsInvalidKeysAndUpdateAttempts(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(*MinimalModeBatchInput)
	}{
		{"empty", func(v *MinimalModeBatchInput) { v.APIKeys = []string{"", " "} }},
		{"too many", func(v *MinimalModeBatchInput) { v.APIKeys = make([]string, 101) }},
		{"oversize key", func(v *MinimalModeBatchInput) { v.APIKeys = []string{strings.Repeat("x", 65537)} }},
		{"embedded newline", func(v *MinimalModeBatchInput) { v.APIKeys = []string{"a\nb"} }},
		{"update id", func(v *MinimalModeBatchInput) { v.Id = 1 }},
		{"revision", func(v *MinimalModeBatchInput) { v.ExpectedRevision = 1 }},
		{"ambiguous secret", func(v *MinimalModeBatchInput) { v.APIKey = "another-key" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			input := minimalBatchFixture()
			tc.change(&input)
			items, err := normalizeMinimalModeBatch(input)
			require.Error(t, err)
			assert.Nil(t, items)
			assert.NotContains(t, err.Error(), "first-key")
		})
	}
}

func TestMinimalModeBatchRejectsBlockedHostBeforeWriting(t *testing.T) {
	input := minimalBatchFixture()
	input.BaseURL = "http://169.254.169.254"
	_, err := CreateMinimalModeSources(context.Background(), input)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "blocked")
}
