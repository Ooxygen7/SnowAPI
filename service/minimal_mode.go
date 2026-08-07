package service

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

const (
	minimalDiscoveryBodyLimit = 2 << 20
	minimalDiscoveryModelCap  = 2000
	minimalRatioLimit         = 1_000_000
	minimalRequestPriceLimit  = 1_000_000
)

type MinimalModeState struct {
	Enabled                 bool                          `json:"enabled"`
	PrivateUpstreamsEnabled bool                          `json:"private_upstreams_enabled"`
	PrivateHostAllowlist    []string                      `json:"private_host_allowlist"`
	PrivateCIDRAllowlist    []string                      `json:"private_cidr_allowlist"`
	CacheDegraded           bool                          `json:"cache_degraded"`
	ChannelTypes            []MinimalModeChannelType      `json:"channel_types"`
	IconKeys                []string                      `json:"icon_keys"`
	Groups                  []string                      `json:"groups"`
	Sources                 []model.MinimalModeSourceView `json:"sources"`
}

type MinimalModeChannelType struct {
	Id   int    `json:"id"`
	Name string `json:"name"`
}

type MinimalModeSettingsInput struct {
	Enabled                 bool     `json:"enabled"`
	PrivateUpstreamsEnabled bool     `json:"private_upstreams_enabled"`
	PrivateHostAllowlist    []string `json:"private_host_allowlist"`
	PrivateCIDRAllowlist    []string `json:"private_cidr_allowlist"`
}

type MinimalModeDiscoveryInput struct {
	SourceId    int    `json:"source_id"`
	BaseURL     string `json:"base_url"`
	ChannelType int    `json:"channel_type"`
	APIKey      string `json:"api_key"`
}

var minimalModeCacheDegraded atomic.Bool

var minimalModeChannelTypes = map[int]string{
	constant.ChannelTypeOpenAI:      "OpenAI Compatible",
	constant.ChannelTypeOllama:      "Ollama",
	constant.ChannelTypeAnthropic:   "Anthropic",
	constant.ChannelTypeOpenRouter:  "OpenRouter",
	constant.ChannelTypeGemini:      "Gemini",
	constant.ChannelTypeMoonshot:    "Moonshot",
	constant.ChannelTypePerplexity:  "Perplexity",
	constant.ChannelTypeLingYiWanWu: "LingYiWanWu",
	constant.ChannelTypeSiliconFlow: "SiliconFlow",
	constant.ChannelTypeMistral:     "Mistral",
	constant.ChannelTypeDeepSeek:    "DeepSeek",
	constant.ChannelTypeXai:         "xAI",
}

var minimalModeIconKeys = []string{
	"Alibaba", "Anthropic", "Aws", "Azure", "Bedrock", "ChatGLM", "Claude",
	"ClaudeCode", "Cohere", "DeepSeek", "Doubao", "Gemini", "Google", "Grok",
	"Meta", "Mistral", "Moonshot", "Ollama", "OpenAI", "OpenRouter", "Perplexity",
	"Qwen", "SiliconCloud", "VolcEngine", "XAI", "Zhipu",
}

var minimalNeverAllowedCIDRs = []string{
	"0.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
	"192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24",
	"203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "::/128", "::1/128",
	"fe80::/10", "ff00::/8", "2001:db8::/32", "fd00:ec2::254/128",
}

func AllowedMinimalModeChannelTypes() []MinimalModeChannelType {
	ids := make([]int, 0, len(minimalModeChannelTypes))
	for id := range minimalModeChannelTypes {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	result := make([]MinimalModeChannelType, 0, len(ids))
	for _, id := range ids {
		result = append(result, MinimalModeChannelType{Id: id, Name: minimalModeChannelTypes[id]})
	}
	return result
}

func AllowedMinimalModeIconKeys() []string {
	result := append([]string(nil), minimalModeIconKeys...)
	sort.Strings(result)
	return result
}

func normalizeMinimalBaseURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.Contains(raw, "#") {
		return "", errors.New("base URL is required and cannot contain a fragment")
	}
	for _, char := range raw {
		if char <= 0x20 || char == 0x7f {
			return "", errors.New("base URL cannot contain whitespace or control characters")
		}
	}
	parsed, err := url.ParseRequestURI(raw)
	if err != nil || parsed == nil || parsed.Host == "" {
		return "", errors.New("base URL is invalid")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("base URL must use http or https")
	}
	if parsed.User != nil || parsed.Fragment != "" || parsed.RawQuery != "" || parsed.ForceQuery {
		return "", errors.New("base URL cannot contain credentials, query, or fragment")
	}
	if parsed.Hostname() == "" {
		return "", errors.New("base URL host is required")
	}
	if port := parsed.Port(); port != "" {
		value, err := strconv.Atoi(port)
		if err != nil || value < 1 || value > 65535 {
			return "", errors.New("base URL port is invalid")
		}
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.RawPath = ""
	return parsed.String(), nil
}

func normalizeMinimalChannelBaseURL(raw string, channelType int) (string, error) {
	normalized, err := normalizeMinimalBaseURL(raw)
	if err != nil {
		return "", err
	}
	parsed, err := url.Parse(normalized)
	if err != nil {
		return "", errors.New("base URL is invalid")
	}

	path := strings.TrimRight(parsed.Path, "/")
	var suffixes []string
	switch channelType {
	case constant.ChannelTypeOllama:
		suffixes = []string{"/api/generate", "/api/chat", "/api/embed", "/api/tags", "/api"}
	case constant.ChannelTypeGemini:
		suffixes = []string{"/v1beta/models", "/v1beta"}
	case constant.ChannelTypeAnthropic:
		suffixes = []string{"/v1/chat/completions", "/v1/responses", "/v1/messages", "/v1"}
	default:
		suffixes = []string{
			"/v1/chat/completions",
			"/v1/completions",
			"/v1/embeddings",
			"/v1/responses",
			"/v1/messages",
			"/v1/models",
			"/v1",
		}
	}
	for _, suffix := range suffixes {
		if strings.HasSuffix(path, suffix) {
			path = strings.TrimSuffix(path, suffix)
			break
		}
	}
	parsed.Path = strings.TrimRight(path, "/")
	parsed.RawPath = ""
	return parsed.String(), nil
}

func normalizeMinimalAPIKey(raw string) string {
	key := strings.TrimSpace(raw)
	if len(key) >= len("Bearer ") && strings.EqualFold(key[:len("Bearer ")], "Bearer ") {
		key = strings.TrimSpace(key[len("Bearer "):])
	}
	return key
}

func normalizeMinimalHosts(values []string) ([]string, error) {
	seen := make(map[string]struct{})
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.ToLower(strings.TrimSpace(strings.TrimSuffix(value, ".")))
		if value == "" {
			continue
		}
		candidate := strings.TrimPrefix(value, "*.")
		if candidate == "" || strings.ContainsAny(candidate, "/:@?#\r\n") {
			return nil, fmt.Errorf("invalid private host allowlist entry %q", value)
		}
		if net.ParseIP(candidate) == nil {
			for _, label := range strings.Split(candidate, ".") {
				if label == "" || strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
					return nil, fmt.Errorf("invalid private host allowlist entry %q", value)
				}
				for _, char := range label {
					if (char < 'a' || char > 'z') && (char < '0' || char > '9') && char != '-' {
						return nil, fmt.Errorf("invalid private host allowlist entry %q", value)
					}
				}
			}
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Strings(result)
	return result, nil
}

func normalizeMinimalCIDRs(values []string) ([]string, error) {
	seen := make(map[string]struct{})
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		_, network, err := net.ParseCIDR(value)
		if err != nil {
			return nil, fmt.Errorf("invalid private CIDR allowlist entry %q", value)
		}
		canonical := network.String()
		if _, ok := seen[canonical]; ok {
			continue
		}
		seen[canonical] = struct{}{}
		result = append(result, canonical)
	}
	sort.Strings(result)
	return result, nil
}

func NormalizeMinimalModeSourceInput(input model.MinimalModeSourceInput) (model.MinimalModeSourceInput, error) {
	if _, ok := minimalModeChannelTypes[input.ChannelType]; !ok {
		return input, errors.New("unsupported minimal-mode channel type")
	}
	baseURL, err := normalizeMinimalChannelBaseURL(input.BaseURL, input.ChannelType)
	if err != nil {
		return input, err
	}
	input.BaseURL = baseURL
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" {
		parsed, _ := url.Parse(baseURL)
		input.Name = "Minimal " + parsed.Hostname()
	}
	if len(input.Name) > 128 || strings.ContainsAny(input.Name, "\r\n") {
		return input, errors.New("source name must be at most 128 characters")
	}
	input.APIKey = normalizeMinimalAPIKey(input.APIKey)
	if input.Id == 0 && input.APIKey == "" {
		return input, errors.New("API key is required when creating a source")
	}
	if len(input.APIKey) > 65536 || strings.ContainsAny(input.APIKey, "\r\n") {
		return input, errors.New("API key must be a single value")
	}
	groups := make([]string, 0, len(input.Groups))
	knownGroups := ratio_setting.GetGroupRatioCopy()
	seenGroups := make(map[string]struct{})
	for _, group := range input.Groups {
		group = strings.TrimSpace(group)
		if group == "" {
			continue
		}
		if _, ok := knownGroups[group]; !ok {
			return input, fmt.Errorf("routing group %q does not exist", group)
		}
		if _, ok := seenGroups[group]; ok {
			continue
		}
		seenGroups[group] = struct{}{}
		groups = append(groups, group)
	}
	if len(groups) == 0 {
		return input, errors.New("at least one routing group is required")
	}
	sort.Strings(groups)
	if len(strings.Join(groups, ",")) > 64 {
		return input, errors.New("combined routing groups exceed 64 bytes")
	}
	input.Groups = groups
	if len(input.Models) == 0 || len(input.Models) > 200 {
		return input, errors.New("one to 200 models are required")
	}
	allowedIcons := make(map[string]struct{}, len(minimalModeIconKeys)*2)
	for _, key := range minimalModeIconKeys {
		allowedIcons[key] = struct{}{}
		allowedIcons[key+".Color"] = struct{}{}
	}
	seenModels := make(map[string]struct{}, len(input.Models))
	for index := range input.Models {
		item := &input.Models[index]
		item.DisplayModel = strings.TrimSpace(item.DisplayModel)
		item.UpstreamModel = strings.TrimSpace(item.UpstreamModel)
		item.IconKey = strings.TrimSpace(item.IconKey)
		if item.DisplayModel == "" || item.UpstreamModel == "" || len(item.DisplayModel) > 128 || len(item.UpstreamModel) > 255 {
			return input, errors.New("display and upstream model names are required and bounded")
		}
		if strings.ContainsAny(item.DisplayModel, ",\r\n") || strings.ContainsAny(item.UpstreamModel, ",\r\n") {
			return input, errors.New("model names cannot contain commas or line breaks")
		}
		identity := strings.ToLower(item.DisplayModel)
		if _, ok := seenModels[identity]; ok {
			return input, fmt.Errorf("duplicate display model %q", item.DisplayModel)
		}
		seenModels[identity] = struct{}{}
		if _, ok := allowedIcons[item.IconKey]; !ok {
			return input, fmt.Errorf("unsupported Lobe icon key %q", item.IconKey)
		}
		item.EndpointType = strings.TrimSpace(item.EndpointType)
		if item.EndpointType == "" {
			if input.ChannelType == constant.ChannelTypeAnthropic {
				item.EndpointType = model.MinimalEndpointMessages
			} else {
				item.EndpointType = model.MinimalEndpointChat
			}
		}
		switch item.EndpointType {
		case model.MinimalEndpointChat, model.MinimalEndpointResponses, model.MinimalEndpointMessages:
		default:
			return input, errors.New("endpoint type must be OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages")
		}
		switch item.BillingMode {
		case model.MinimalBillingToken:
			if item.ModelRatio == nil || item.CompletionRatio == nil || !finitePositive(*item.ModelRatio, minimalRatioLimit) || !finitePositive(*item.CompletionRatio, minimalRatioLimit) {
				return input, errors.New("token pricing requires finite positive model and completion ratios")
			}
			if item.CacheRatio != nil && !finitePositive(*item.CacheRatio, minimalRatioLimit) {
				return input, errors.New("cache pricing requires a finite positive ratio")
			}
			item.RequestPriceUSD = nil
		case model.MinimalBillingRequest:
			if item.RequestPriceUSD == nil || !finitePositive(*item.RequestPriceUSD, minimalRequestPriceLimit) {
				return input, errors.New("request pricing requires a finite positive USD price")
			}
			item.ModelRatio = nil
			item.CompletionRatio = nil
			item.CacheRatio = nil
		default:
			return input, errors.New("billing mode must be token or request")
		}
	}
	sort.Slice(input.Models, func(i, j int) bool { return input.Models[i].DisplayModel < input.Models[j].DisplayModel })
	input.ProviderName = strings.SplitN(input.Models[0].IconKey, ".", 2)[0]
	return input, nil
}

func finitePositive(value float64, maximum float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value > 0 && value <= maximum
}

func GetMinimalModeState() (MinimalModeState, error) {
	settings := operation_setting.GetMinimalModeSetting()
	sources, err := model.ListMinimalModeSources()
	if err != nil {
		return MinimalModeState{}, err
	}
	groupRatios := ratio_setting.GetGroupRatioCopy()
	groups := make([]string, 0, len(groupRatios))
	for group := range groupRatios {
		groups = append(groups, group)
	}
	sort.Strings(groups)
	return MinimalModeState{
		Enabled:                 settings.Enabled,
		PrivateUpstreamsEnabled: settings.PrivateUpstreamsEnabled,
		PrivateHostAllowlist:    append([]string{}, settings.PrivateHostAllowlist...),
		PrivateCIDRAllowlist:    append([]string{}, settings.PrivateCIDRAllowlist...),
		CacheDegraded:           minimalModeCacheDegraded.Load(),
		ChannelTypes:            AllowedMinimalModeChannelTypes(),
		IconKeys:                AllowedMinimalModeIconKeys(),
		Groups:                  groups,
		Sources:                 sources,
	}, nil
}

func UpdateMinimalModeSettings(input MinimalModeSettingsInput) error {
	hosts, err := normalizeMinimalHosts(input.PrivateHostAllowlist)
	if err != nil {
		return err
	}
	cidrs, err := normalizeMinimalCIDRs(input.PrivateCIDRAllowlist)
	if err != nil {
		return err
	}
	if input.PrivateUpstreamsEnabled && (len(hosts) == 0 || len(cidrs) == 0) {
		return errors.New("private upstreams require both host and CIDR allowlists")
	}
	hostJSON, err := common.Marshal(hosts)
	if err != nil {
		return err
	}
	cidrJSON, err := common.Marshal(cidrs)
	if err != nil {
		return err
	}
	err = model.UpdateOptionsBulk(map[string]string{
		"minimal_mode_setting.enabled":                   strconv.FormatBool(input.Enabled),
		"minimal_mode_setting.private_upstreams_enabled": strconv.FormatBool(input.PrivateUpstreamsEnabled),
		"minimal_mode_setting.private_host_allowlist":    string(hostJSON),
		"minimal_mode_setting.private_cidr_allowlist":    string(cidrJSON),
	})
	if err == nil {
		ResetMinimalModeRelayClient()
	}
	return err
}

func SaveMinimalModeSource(ctx context.Context, input model.MinimalModeSourceInput) (model.MinimalModeSourceView, error) {
	normalized, err := NormalizeMinimalModeSourceInput(input)
	if err != nil {
		return model.MinimalModeSourceView{}, err
	}
	parsed, err := url.Parse(normalized.BaseURL)
	if err != nil {
		return model.MinimalModeSourceView{}, errors.New("base URL is invalid")
	}
	if err := validateMinimalHost(ctx, parsed.Hostname(), operation_setting.GetMinimalModeSetting()); err != nil {
		return model.MinimalModeSourceView{}, err
	}
	view, runtimeOptions, err := model.ReconcileMinimalModeSource(normalized)
	if err != nil {
		return model.MinimalModeSourceView{}, err
	}
	applyMinimalModeRuntime(runtimeOptions)
	return view, nil
}

func applyMinimalModeRuntime(values map[string]string) {
	minimalModeCacheDegraded.Store(false)
	for attempt := 0; attempt < 3; attempt++ {
		if err := model.ApplyOptionsRuntime(values); err == nil {
			model.InitChannelCache()
			model.InvalidatePricingCache()
			ratio_setting.InvalidateExposedDataCache()
			ResetProxyClientCache()
			return
		}
		if err := model.ReloadOptionsFromDatabase(); err == nil {
			model.InitChannelCache()
			model.InvalidatePricingCache()
			ratio_setting.InvalidateExposedDataCache()
			ResetProxyClientCache()
			return
		}
	}
	minimalModeCacheDegraded.Store(true)
}

func AdoptMinimalModeSource(sourceId int, expectedRevision int64) (model.MinimalModeSourceView, error) {
	return model.AdoptMinimalModeSource(sourceId, expectedRevision)
}

func DetachMinimalModeSource(sourceId int, expectedRevision int64) error {
	return model.DetachMinimalModeSource(sourceId, expectedRevision)
}

func DeleteMinimalModeSource(sourceId int, expectedRevision int64) error {
	runtimeOptions, err := model.DeleteMinimalModeSource(sourceId, expectedRevision)
	if err != nil {
		return err
	}
	applyMinimalModeRuntime(runtimeOptions)
	return nil
}

func DiscoverMinimalModeModels(ctx context.Context, input MinimalModeDiscoveryInput) ([]string, error) {
	if input.SourceId > 0 {
		channel, err := model.GetMinimalModeSourceChannel(input.SourceId)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(input.BaseURL) == "" {
			input.BaseURL = channel.GetBaseURL()
		}
		if input.ChannelType == 0 {
			input.ChannelType = channel.Type
		}
		if strings.TrimSpace(input.APIKey) == "" {
			input.APIKey = channel.Key
		}
	}
	if _, ok := minimalModeChannelTypes[input.ChannelType]; !ok {
		return nil, errors.New("unsupported minimal-mode channel type")
	}
	baseURL, err := normalizeMinimalChannelBaseURL(input.BaseURL, input.ChannelType)
	if err != nil {
		return nil, err
	}
	apiKey := normalizeMinimalAPIKey(input.APIKey)
	if input.ChannelType != constant.ChannelTypeOllama && apiKey == "" {
		return nil, errors.New("API key is required for model discovery")
	}
	requestURLs, err := minimalDiscoveryURLs(baseURL, input.ChannelType)
	if err != nil {
		return nil, err
	}
	parsed, _ := url.Parse(requestURLs[0])
	settings := operation_setting.GetMinimalModeSetting()
	if err := validateMinimalHost(ctx, parsed.Hostname(), settings); err != nil {
		return nil, err
	}
	client := minimalHTTPClient(settings, parsed.Hostname())
	defer client.CloseIdleConnections()
	return fetchMinimalDiscoveredModels(ctx, client, requestURLs, input.ChannelType, apiKey)
}

func fetchMinimalDiscoveredModels(ctx context.Context, client *http.Client, requestURLs []string, channelType int, apiKey string) ([]string, error) {
	var lastErr error
	for index, requestURL := range requestURLs {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
		if err != nil {
			return nil, errors.New("failed to create model discovery request")
		}
		request.Header.Set("Accept", "application/json")
		switch channelType {
		case constant.ChannelTypeGemini:
			request.Header.Set("x-goog-api-key", apiKey)
		case constant.ChannelTypeOllama:
			if apiKey != "" {
				request.Header.Set("Authorization", "Bearer "+apiKey)
			}
		default:
			request.Header.Set("Authorization", "Bearer "+apiKey)
		}

		response, err := client.Do(request)
		if err != nil {
			if response != nil && response.Body != nil {
				response.Body.Close()
			}
			return nil, errors.New("upstream model discovery failed")
		}
		path := request.URL.EscapedPath()
		if path == "" {
			path = "/"
		}
		if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
			response.Body.Close()
			switch response.StatusCode {
			case http.StatusUnauthorized, http.StatusForbidden:
				return nil, fmt.Errorf("upstream rejected the API key (HTTP %d) at %s", response.StatusCode, path)
			case http.StatusBadRequest, http.StatusNotFound, http.StatusMethodNotAllowed:
				lastErr = fmt.Errorf("upstream model endpoint returned HTTP %d at %s", response.StatusCode, path)
				if index+1 < len(requestURLs) {
					continue
				}
			default:
				return nil, fmt.Errorf("upstream model discovery returned HTTP %d at %s", response.StatusCode, path)
			}
			break
		}

		body, readErr := io.ReadAll(io.LimitReader(response.Body, minimalDiscoveryBodyLimit+1))
		response.Body.Close()
		if readErr != nil || len(body) > minimalDiscoveryBodyLimit {
			lastErr = fmt.Errorf("upstream model response at %s is invalid or too large", path)
			if index+1 < len(requestURLs) {
				continue
			}
			break
		}
		result, parseErr := parseMinimalDiscoveredModels(body)
		if parseErr == nil {
			return result, nil
		}
		lastErr = fmt.Errorf("upstream model response at %s: %w", path, parseErr)
		if index+1 >= len(requestURLs) {
			break
		}
	}
	if lastErr == nil {
		lastErr = errors.New("upstream model discovery has no usable endpoint")
	}
	return nil, lastErr
}

func parseMinimalDiscoveredModels(body []byte) ([]string, error) {
	var payload struct {
		Data []struct {
			Id string `json:"id"`
		} `json:"data"`
		Models []struct {
			Name  string `json:"name"`
			Model string `json:"model"`
		} `json:"models"`
	}
	if err := common.Unmarshal(body, &payload); err != nil {
		return nil, errors.New("upstream model response is not valid JSON")
	}
	models := make([]string, 0, len(payload.Data)+len(payload.Models))
	for _, item := range payload.Data {
		models = append(models, item.Id)
	}
	for _, item := range payload.Models {
		name := item.Name
		if name == "" {
			name = item.Model
		}
		models = append(models, strings.TrimPrefix(name, "models/"))
	}
	seen := make(map[string]struct{})
	result := make([]string, 0, len(models))
	for _, name := range models {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		result = append(result, name)
		if len(result) > minimalDiscoveryModelCap {
			return nil, errors.New("upstream returned too many models")
		}
	}
	sort.Strings(result)
	return result, nil
}

func minimalDiscoveryURLs(baseURL string, channelType int) ([]string, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return nil, errors.New("base URL is invalid")
	}
	var suffixes []string
	switch channelType {
	case constant.ChannelTypeOllama:
		suffixes = []string{"/api/tags"}
	case constant.ChannelTypeGemini:
		suffixes = []string{"/v1beta/models"}
	case constant.ChannelTypeAnthropic:
		return nil, errors.New("this channel type requires manual upstream model entry")
	default:
		suffixes = []string{"/v1/models", "/models"}
	}

	basePath := strings.TrimRight(parsed.Path, "/")
	result := make([]string, 0, len(suffixes))
	for _, suffix := range suffixes {
		candidate := *parsed
		candidate.Path = basePath + suffix
		candidate.RawPath = ""
		result = append(result, candidate.String())
	}
	return result, nil
}

func minimalHTTPClient(settings *operation_setting.MinimalModeSetting, originalHost string) *http.Client {
	dialer := &net.Dialer{Timeout: 5 * time.Second, KeepAlive: 15 * time.Second}
	transport := &http.Transport{
		Proxy:                 nil,
		ForceAttemptHTTP2:     true,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 8 * time.Second,
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
	}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, errors.New("upstream address is invalid")
		}
		ips, err := allowedMinimalIPs(ctx, host, settings)
		if err != nil {
			return nil, err
		}
		return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
	}
	return &http.Client{
		Transport: transport,
		Timeout:   12 * time.Second,
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("too many upstream redirects")
			}
			if !strings.EqualFold(strings.TrimSuffix(request.URL.Hostname(), "."), strings.TrimSuffix(originalHost, ".")) {
				return errors.New("cross-host upstream redirect is not allowed")
			}
			if request.URL.Scheme != "http" && request.URL.Scheme != "https" {
				return errors.New("upstream redirect scheme is not allowed")
			}
			if request.URL.User != nil || request.URL.Fragment != "" {
				return errors.New("upstream redirect is invalid")
			}
			return validateMinimalHost(request.Context(), request.URL.Hostname(), settings)
		},
	}
}

func validateMinimalHost(ctx context.Context, host string, settings *operation_setting.MinimalModeSetting) error {
	_, err := allowedMinimalIPs(ctx, host, settings)
	return err
}

func allowedMinimalIPs(ctx context.Context, host string, settings *operation_setting.MinimalModeSetting) ([]net.IP, error) {
	return allowedMinimalIPsWithResolver(ctx, host, settings, net.DefaultResolver)
}

func minimalIPNeverAllowed(ip net.IP) bool {
	if ip == nil || ip.IsUnspecified() || ip.IsLoopback() || ip.IsLinkLocalMulticast() || ip.IsLinkLocalUnicast() || ip.IsMulticast() {
		return true
	}
	for _, raw := range minimalNeverAllowedCIDRs {
		_, network, _ := net.ParseCIDR(raw)
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

func minimalHostAllowed(host string, allowlist []string) bool {
	for _, entry := range allowlist {
		entry = strings.ToLower(strings.TrimSpace(strings.TrimSuffix(entry, ".")))
		if host == entry {
			return true
		}
		if strings.HasPrefix(entry, "*.") {
			suffix := strings.TrimPrefix(entry, "*")
			if strings.HasSuffix(host, suffix) && host != strings.TrimPrefix(suffix, ".") {
				return true
			}
		}
	}
	return false
}

func minimalIPInAllowlist(ip net.IP, allowlist []string) bool {
	for _, entry := range allowlist {
		_, network, err := net.ParseCIDR(entry)
		if err == nil && network.Contains(ip) {
			return true
		}
	}
	return false
}
