package advancedcustom

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/service/relayconvert"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChatCompletionEnvelopeAcrossClientProtocols(t *testing.T) {
	protocols := []struct {
		name, path, converter string
		format                types.RelayFormat
	}{
		{"chat", "/v1/chat/completions", relayconvert.ConverterNone, types.RelayFormatOpenAI},
		{"messages", "/v1/messages", relayconvert.ConverterClaudeMessagesToOpenAIChat, types.RelayFormatClaude},
		{"responses", "/v1/responses", relayconvert.ConverterOpenAIResponsesToOpenAIChat, types.RelayFormatOpenAIResponses},
	}
	fixtures := []struct {
		name, body string
		rejected   bool
	}{
		{"wrapped text", `{"success":true,"data":{"id":"chatcmpl-test","object":"chat.completion","model":"gpt-test","choices":[{"index":0,"message":{"role":"assistant","content":"OK"},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}}`, false},
		{"native text", `{"id":"chatcmpl-test","object":"chat.completion","model":"gpt-test","choices":[{"index":0,"message":{"role":"assistant","content":"OK"},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}`, false},
		{"wrapped tool call", `{"success":true,"data":{"id":"chatcmpl-test","object":"chat.completion","model":"gpt-test","choices":[{"index":0,"message":{"role":"assistant","content":null,"tool_calls":[{"id":"call_test","type":"function","function":{"name":"lookup","arguments":"{\"q\":\"x\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}}`, false},
		{"upstream failure", `{"success":false,"data":null}`, true},
		{"missing completion", `{"success":true,"data":{}}`, true},
		{"null completion", `{"success":true,"data":null}`, true},
		{"nested error", `{"success":true,"data":{"error":{"type":"upstream_error","message":"failed"}}}`, true},
	}
	for _, protocol := range protocols {
		for _, fixture := range fixtures {
			t.Run(protocol.name+"/"+fixture.name, func(t *testing.T) {
				info := advancedCustomRelayInfo(&dto.AdvancedCustomConfig{Routes: []dto.AdvancedCustomRoute{{
					IncomingPath: protocol.path, UpstreamPath: "/v1/chat/completions", Converter: protocol.converter,
				}}})
				info.RelayFormat = protocol.format
				info.RequestURLPath = protocol.path
				if protocol.format == types.RelayFormatOpenAIResponses {
					info.RelayMode = relayconstant.RelayModeResponses
				}
				recorder := httptest.NewRecorder()
				c, _ := gin.CreateTestContext(recorder)
				c.Request = httptest.NewRequest(http.MethodPost, protocol.path, nil)
				c.Set(common.RequestIdKey, "envelope-test")
				adaptor := &Adaptor{}
				usage, apiErr := adaptor.DoResponse(c, &http.Response{
					StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}},
					Body: io.NopCloser(bytes.NewBufferString(fixture.body)),
				}, info)
				if fixture.rejected {
					require.NotNil(t, apiErr)
					assert.Equal(t, http.StatusBadGateway, apiErr.StatusCode)
					assert.Empty(t, recorder.Body.String())
					return
				}
				require.Nil(t, apiErr)
				actualUsage, ok := usage.(*dto.Usage)
				require.True(t, ok)
				assert.Equal(t, 12, actualUsage.PromptTokens)
				assert.Equal(t, 3, actualUsage.CompletionTokens)
				assert.Equal(t, 15, actualUsage.TotalTokens)
				var response map[string]any
				require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
				assert.NotContains(t, response, "success")
				assert.NotContains(t, response, "data")
				if fixture.name == "wrapped tool call" {
					assert.Contains(t, recorder.Body.String(), `"lookup"`)
					assert.Contains(t, recorder.Body.String(), `call_test`)
				} else {
					assert.Contains(t, recorder.Body.String(), `"OK"`)
				}
				switch protocol.format {
				case types.RelayFormatOpenAI:
					assert.Contains(t, response, "choices")
				case types.RelayFormatClaude:
					assert.Equal(t, "message", response["type"])
					assert.Contains(t, response, "content")
				case types.RelayFormatOpenAIResponses:
					assert.Equal(t, "response", response["object"])
					assert.Contains(t, response, "output")
				}
			})
		}
	}
}
