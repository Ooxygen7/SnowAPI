package openai

import (
	"encoding/json"
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

// unwrapChatCompletionEnvelope supports gateways that wrap a Chat Completion
// in {success, data}. Return the original bytes for ordinary OpenAI responses.
func unwrapChatCompletionEnvelope(body []byte) ([]byte, error) {
	var envelope struct {
		Success *bool           `json:"success"`
		Data    json.RawMessage `json:"data"`
	}
	if err := common.Unmarshal(body, &envelope); err != nil {
		return nil, err
	}
	if envelope.Success == nil {
		return body, nil
	}
	if !*envelope.Success {
		return nil, errors.New("upstream chat completion reported success=false")
	}
	var response dto.OpenAITextResponse
	if err := common.Unmarshal(envelope.Data, &response); err != nil {
		return nil, errors.New("upstream chat completion envelope has invalid data")
	}
	if response.GetOpenAIError() != nil || len(response.Choices) == 0 {
		return nil, errors.New("upstream chat completion envelope contains no valid completion")
	}
	// Preserve all upstream fields, including usage, reasoning and tool calls.
	return envelope.Data, nil
}
