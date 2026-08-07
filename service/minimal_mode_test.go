package service

import (
	"context"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeMinimalBaseURLRejectsCredentialAndEscapingTricks(t *testing.T) {
	valid, err := normalizeMinimalBaseURL("https://api.example.com/openai/v1/")
	require.NoError(t, err)
	assert.Equal(t, "https://api.example.com/openai/v1", valid)

	for _, value := range []string{
		"https://user:secret@example.com/v1",
		"https://example.com/v1?key=secret",
		"https://example.com/v1#fragment",
		"file:///etc/passwd",
		"https://example.com:99999/v1",
		"https://example.com/v1\r\nX-Injected: true",
	} {
		_, err := normalizeMinimalBaseURL(value)
		assert.Error(t, err, value)
	}
}

func TestNormalizeMinimalModeSourceInputEnforcesPricingAndIconContract(t *testing.T) {
	modelRatio := 1.25
	completionRatio := 2.0
	cacheRatio := 0.25
	input := model.MinimalModeSourceInput{
		Name:         "Personal upstream",
		ProviderName: "Ignored manual vendor",
		BaseURL:      "https://api.example.com/v1",
		ChannelType:  1,
		APIKey:       "Bearer secret",
		Groups:       []string{"Free"},
		Models: []model.MinimalModeModelInput{{
			DisplayModel:    "personal-model",
			UpstreamModel:   "upstream-model",
			IconKey:         "OpenAI.Color",
			EndpointType:    model.MinimalEndpointResponses,
			BillingMode:     model.MinimalBillingToken,
			ModelRatio:      &modelRatio,
			CompletionRatio: &completionRatio,
			CacheRatio:      &cacheRatio,
		}},
	}
	normalized, err := NormalizeMinimalModeSourceInput(input)
	require.NoError(t, err)
	assert.Equal(t, "https://api.example.com", normalized.BaseURL)
	assert.Equal(t, "secret", normalized.APIKey)
	assert.Equal(t, "OpenAI", normalized.ProviderName)
	assert.Equal(t, model.MinimalEndpointResponses, normalized.Models[0].EndpointType)
	assert.Nil(t, normalized.Models[0].RequestPriceUSD)
	require.NotNil(t, normalized.Models[0].CacheRatio)
	assert.Equal(t, 0.25, *normalized.Models[0].CacheRatio)

	badIcon := input
	badIcon.Models = append([]model.MinimalModeModelInput(nil), input.Models...)
	badIcon.Models[0].IconKey = "../../arbitrary-module"
	_, err = NormalizeMinimalModeSourceInput(badIcon)
	assert.ErrorContains(t, err, "unsupported Lobe icon key")

	badRatio := input
	badRatio.Models = append([]model.MinimalModeModelInput(nil), input.Models...)
	nan := math.NaN()
	badRatio.Models[0].ModelRatio = &nan
	_, err = NormalizeMinimalModeSourceInput(badRatio)
	assert.ErrorContains(t, err, "finite positive")

	requestMode := input
	requestMode.Models = append([]model.MinimalModeModelInput(nil), input.Models...)
	requestMode.Models[0].BillingMode = model.MinimalBillingRequest
	requestMode.Models[0].RequestPriceUSD = nil
	_, err = NormalizeMinimalModeSourceInput(requestMode)
	assert.ErrorContains(t, err, "finite positive USD price")

	badEndpoint := input
	badEndpoint.Models = append([]model.MinimalModeModelInput(nil), input.Models...)
	badEndpoint.Models[0].EndpointType = "openai-responses-v2"
	_, err = NormalizeMinimalModeSourceInput(badEndpoint)
	assert.ErrorContains(t, err, "endpoint type must be")
}

func TestNormalizeMinimalChannelBaseURLAcceptsBaseAndEndpointForms(t *testing.T) {
	tests := []struct {
		name        string
		channelType int
		input       string
		expected    string
	}{
		{name: "OpenAI version base", channelType: 1, input: "https://api.example.com/gateway/v1", expected: "https://api.example.com/gateway"},
		{name: "OpenAI completion endpoint", channelType: 1, input: "https://api.example.com/gateway/v1/chat/completions", expected: "https://api.example.com/gateway"},
		{name: "Anthropic messages endpoint on mixed upstream", channelType: 1, input: "https://api.example.com/gateway/v1/messages", expected: "https://api.example.com/gateway"},
		{name: "Gemini model endpoint", channelType: constant.ChannelTypeGemini, input: "https://generativelanguage.googleapis.com/v1beta/models", expected: "https://generativelanguage.googleapis.com"},
		{name: "Ollama tags endpoint", channelType: constant.ChannelTypeOllama, input: "https://ollama.example.com/api/tags", expected: "https://ollama.example.com"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := normalizeMinimalChannelBaseURL(test.input, test.channelType)
			require.NoError(t, err)
			assert.Equal(t, test.expected, actual)
		})
	}
}

type minimalDiscoveryRoundTripper func(*http.Request) (*http.Response, error)

func (roundTrip minimalDiscoveryRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return roundTrip(request)
}

func TestFetchMinimalDiscoveredModelsFallsBackToCompatibleModelsPath(t *testing.T) {
	requestURLs, err := minimalDiscoveryURLs("https://api.example.com/gateway", 1)
	require.NoError(t, err)
	assert.Equal(t, []string{
		"https://api.example.com/gateway/v1/models",
		"https://api.example.com/gateway/models",
	}, requestURLs)

	paths := make([]string, 0, 2)
	client := &http.Client{Transport: minimalDiscoveryRoundTripper(func(request *http.Request) (*http.Response, error) {
		paths = append(paths, request.URL.Path)
		assert.Equal(t, "Bearer secret", request.Header.Get("Authorization"))
		if request.URL.Path == "/gateway/v1/models" {
			return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader("not found"))}, nil
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"data":[{"id":"model-b"},{"id":"model-a"}]}`))}, nil
	})}

	models, err := fetchMinimalDiscoveredModels(context.Background(), client, requestURLs, 1, "secret")
	require.NoError(t, err)
	assert.Equal(t, []string{"model-a", "model-b"}, models)
	assert.Equal(t, []string{"/gateway/v1/models", "/gateway/models"}, paths)
}

func TestFetchMinimalDiscoveredModelsReportsUpstreamAuthenticationFailure(t *testing.T) {
	requestURLs, err := minimalDiscoveryURLs("https://api.example.com", 1)
	require.NoError(t, err)
	requestCount := 0
	client := &http.Client{Transport: minimalDiscoveryRoundTripper(func(request *http.Request) (*http.Response, error) {
		requestCount++
		return &http.Response{StatusCode: http.StatusUnauthorized, Body: io.NopCloser(strings.NewReader("unauthorized"))}, nil
	})}

	_, err = fetchMinimalDiscoveredModels(context.Background(), client, requestURLs, 1, "invalid")
	assert.ErrorContains(t, err, "rejected the API key (HTTP 401)")
	assert.Equal(t, 1, requestCount)
}

func TestAllowedMinimalIPsRequiresExplicitPrivateOptInAndAlwaysBlocksMetadata(t *testing.T) {
	public, err := allowedMinimalIPs(context.Background(), "8.8.8.8", &operation_setting.MinimalModeSetting{})
	require.NoError(t, err)
	require.Len(t, public, 1)
	assert.Equal(t, "8.8.8.8", public[0].String())

	_, err = allowedMinimalIPs(context.Background(), "10.20.30.40", &operation_setting.MinimalModeSetting{})
	assert.ErrorContains(t, err, "not explicitly allowlisted")

	privateSettings := &operation_setting.MinimalModeSetting{
		PrivateUpstreamsEnabled: true,
		PrivateHostAllowlist:    []string{"10.20.30.40"},
		PrivateCIDRAllowlist:    []string{"10.20.0.0/16"},
	}
	private, err := allowedMinimalIPs(context.Background(), "10.20.30.40", privateSettings)
	require.NoError(t, err)
	require.Len(t, private, 1)
	assert.Equal(t, "10.20.30.40", private[0].String())

	metadataSettings := &operation_setting.MinimalModeSetting{
		PrivateUpstreamsEnabled: true,
		PrivateHostAllowlist:    []string{"169.254.169.254"},
		PrivateCIDRAllowlist:    []string{"169.254.0.0/16"},
	}
	_, err = allowedMinimalIPs(context.Background(), "169.254.169.254", metadataSettings)
	assert.ErrorContains(t, err, "blocked address")

	ipv6MetadataSettings := &operation_setting.MinimalModeSetting{
		PrivateUpstreamsEnabled: true,
		PrivateHostAllowlist:    []string{"fd00:ec2::254"},
		PrivateCIDRAllowlist:    []string{"fd00:ec2::/64"},
	}
	_, err = allowedMinimalIPs(context.Background(), "fd00:ec2::254", ipv6MetadataSettings)
	assert.ErrorContains(t, err, "blocked address")

	ulaSettings := &operation_setting.MinimalModeSetting{
		PrivateUpstreamsEnabled: true,
		PrivateHostAllowlist:    []string{"fd12:3456::10"},
		PrivateCIDRAllowlist:    []string{"fd12:3456::/64"},
	}
	ula, err := allowedMinimalIPs(context.Background(), "fd12:3456::10", ulaSettings)
	require.NoError(t, err)
	require.Len(t, ula, 1)
	assert.Equal(t, "fd12:3456::10", ula[0].String())
}

func TestSaveMinimalModeSourceRejectsBlockedUpstreamBeforeDatabaseMutation(t *testing.T) {
	modelRatio := 1.0
	completionRatio := 1.0
	_, err := SaveMinimalModeSource(context.Background(), model.MinimalModeSourceInput{
		Name:         "blocked upstream",
		ProviderName: "OpenAI",
		BaseURL:      "http://169.254.169.254/v1",
		ChannelType:  1,
		APIKey:       "secret",
		Groups:       []string{"Free"},
		Models: []model.MinimalModeModelInput{{
			DisplayModel:    "blocked-model",
			UpstreamModel:   "blocked-model",
			IconKey:         "OpenAI",
			BillingMode:     model.MinimalBillingToken,
			ModelRatio:      &modelRatio,
			CompletionRatio: &completionRatio,
		}},
	})
	assert.ErrorContains(t, err, "blocked address")
}

func TestMinimalRedirectPolicyRejectsHostChangesAndSpecialTargets(t *testing.T) {
	settings := &operation_setting.MinimalModeSetting{}
	client := minimalHTTPClient(settings, "api.example.com")
	request := &http.Request{URL: &url.URL{Scheme: "https", Host: "other.example.com", Path: "/v1/models"}}
	err := client.CheckRedirect(request, []*http.Request{{URL: &url.URL{Scheme: "https", Host: "api.example.com"}}})
	assert.ErrorContains(t, err, "cross-host")

	request.URL = &url.URL{Scheme: "file", Host: "api.example.com", Path: "/etc/passwd"}
	err = client.CheckRedirect(request, nil)
	assert.ErrorContains(t, err, "scheme")
}

func TestParseMinimalDiscoveredModelsSupportsOpenAIAndGeminiShapes(t *testing.T) {
	models, err := parseMinimalDiscoveredModels([]byte(`{
		"data":[{"id":"z-model"},{"id":"a-model"},{"id":"a-model"}],
		"models":[{"name":"models/gemini-pro"},{"model":"fallback-model"}]
	}`))
	require.NoError(t, err)
	assert.Equal(t, []string{"a-model", "fallback-model", "gemini-pro", "z-model"}, models)

	_, err = parseMinimalDiscoveredModels([]byte(`{"data":`))
	assert.ErrorContains(t, err, "not valid JSON")

	items := make([]string, 0, minimalDiscoveryModelCap+1)
	for index := 0; index <= minimalDiscoveryModelCap; index++ {
		items = append(items, fmt.Sprintf(`{"id":"model-%d"}`, index))
	}
	_, err = parseMinimalDiscoveredModels([]byte(`{"data":[` + strings.Join(items, ",") + `]}`))
	assert.ErrorContains(t, err, "too many models")
}
