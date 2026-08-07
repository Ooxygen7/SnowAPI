package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/assert"
)

func TestShouldRecordModelHealth(t *testing.T) {
	tests := []struct {
		name        string
		relayFormat types.RelayFormat
		path        string
		want        bool
	}{
		{"chat completions", types.RelayFormatOpenAI, "/v1/chat/completions", true},
		{"legacy completions", types.RelayFormatOpenAI, "/v1/completions", true},
		{"moderations", types.RelayFormatOpenAI, "/v1/moderations", false},
		{"responses", types.RelayFormatOpenAIResponses, "/v1/responses", true},
		{"responses compact", types.RelayFormatOpenAIResponsesCompaction, "/v1/responses/compact", true},
		{"claude", types.RelayFormatClaude, "/v1/messages", true},
		{"gemini generate", types.RelayFormatGemini, "/v1beta/models/gemini:generateContent", true},
		{"gemini embed", types.RelayFormatGemini, "/v1beta/models/gemini:embedContent", false},
		{"embedding", types.RelayFormatEmbedding, "/v1/embeddings", false},
		{"image", types.RelayFormatOpenAIImage, "/v1/images/generations", false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.want, shouldRecordModelHealth(test.relayFormat, test.path))
		})
	}
}

func TestSelectModelHealthProbeEndpoint(t *testing.T) {
	endpoint, ok := selectModelHealthProbeEndpoint([]constant.EndpointType{
		constant.EndpointTypeGemini,
		constant.EndpointTypeOpenAIResponse,
	})
	assert.True(t, ok)
	assert.Equal(t, constant.EndpointTypeOpenAIResponse, endpoint)

	_, ok = selectModelHealthProbeEndpoint([]constant.EndpointType{
		constant.EndpointTypeImageGeneration,
	})
	assert.False(t, ok)
}

func TestSelectModelHealthProbeGroup(t *testing.T) {
	assert.Equal(t, "Light", selectModelHealthProbeGroup([]string{"Free", "Light"}, "Light"))
	assert.Equal(t, "Light", selectModelHealthProbeGroup([]string{"all"}, "Light"))
	assert.Equal(t, "Free", selectModelHealthProbeGroup([]string{"Free", "Light"}, "guest"))
	assert.Equal(t, "first", selectModelHealthProbeGroup([]string{"first", "second"}, "guest"))
}
