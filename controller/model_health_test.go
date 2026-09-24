package controller

import (
	"errors"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
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

func TestModelHealthNeverSchedulesSyntheticProbes(t *testing.T) {
	assert.False(t, (modelHealthProbeHandler{}).Enabled())
}

func TestModelHealthRequestSucceeded(t *testing.T) {
	cases := []struct {
		name           string
		relaySucceeded bool
		stream         *relaycommon.StreamStatus
		want           bool
	}{
		{"completed non-stream request", true, nil, true},
		{"upstream HTTP error", false, nil, false},
		{"completed stream", true, &relaycommon.StreamStatus{EndReason: relaycommon.StreamEndReasonDone}, true},
		{"provider ends at EOF", true, &relaycommon.StreamStatus{EndReason: relaycommon.StreamEndReasonEOF}, true},
		{"provider finish handler", true, &relaycommon.StreamStatus{EndReason: relaycommon.StreamEndReasonHandlerStop}, true},
		{"timeout after HTTP 200", true, &relaycommon.StreamStatus{EndReason: relaycommon.StreamEndReasonTimeout}, false},
		{"stream decode error", true, &relaycommon.StreamStatus{EndReason: relaycommon.StreamEndReasonDone, ErrorCount: 1}, false},
		{"stream end error", true, &relaycommon.StreamStatus{EndReason: relaycommon.StreamEndReasonEOF, EndError: errors.New("connection reset")}, false},
		{"unfinished stream", true, &relaycommon.StreamStatus{}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, modelHealthRequestSucceeded(tc.relaySucceeded, tc.stream))
		})
	}
}
