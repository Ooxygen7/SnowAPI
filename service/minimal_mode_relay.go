package service

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gorilla/websocket"
)

type minimalModeResolver interface {
	LookupIPAddr(ctx context.Context, host string) ([]net.IPAddr, error)
}

type minimalModeSettingsProvider func() *operation_setting.MinimalModeSetting

var (
	minimalModeRelayClientLock sync.Mutex
	minimalModeRelayClient     *http.Client
)

func IsMinimalModeManagedChannel(channelId int) (bool, error) {
	return model.IsMinimalModeChannel(channelId)
}

// GetRelayHTTPClient selects the outbound client for a channel. Manual
// full-mode channels retain the existing proxy/general client behavior. A
// channel still owned by MinimalModeSource always uses the protected direct
// transport, whose DNS result is checked and pinned on every new connection.
func GetRelayHTTPClient(channelId int, proxyURL string, target *url.URL) (*http.Client, error) {
	managed, err := model.IsMinimalModeChannel(channelId)
	if err != nil {
		return nil, fmt.Errorf("check minimal-mode channel ownership: %w", err)
	}
	if !managed {
		return GetHttpClientWithProxy(proxyURL)
	}
	if strings.TrimSpace(proxyURL) != "" {
		return nil, errors.New("minimal-mode managed channels cannot use an outbound proxy")
	}
	if err := validateMinimalRelayURL(context.Background(), target, currentMinimalModeSettings()); err != nil {
		return nil, err
	}
	minimalModeRelayClientLock.Lock()
	if minimalModeRelayClient == nil {
		minimalModeRelayClient = newMinimalModeRelayHTTPClient(nil, nil, currentMinimalModeSettings)
	}
	client := minimalModeRelayClient
	minimalModeRelayClientLock.Unlock()
	return client, nil
}

// ResetMinimalModeRelayClient retires the whole transport so requests started
// after an allowlist change cannot reuse an active HTTP/2 connection that was
// established under the previous policy. In-flight requests may finish on the
// retired client, while the next request creates a fresh protected transport.
func ResetMinimalModeRelayClient() {
	minimalModeRelayClientLock.Lock()
	defer minimalModeRelayClientLock.Unlock()
	if minimalModeRelayClient != nil {
		minimalModeRelayClient.CloseIdleConnections()
		minimalModeRelayClient = nil
	}
}

// GetRelayWebsocketDialer applies the same per-dial policy to realtime relay
// connections. The bool result is false for manual channels so callers can
// preserve the pre-existing websocket.DefaultDialer behavior exactly.
func GetRelayWebsocketDialer(channelId int, proxyURL string, target *url.URL) (*websocket.Dialer, bool, error) {
	managed, err := model.IsMinimalModeChannel(channelId)
	if err != nil {
		return nil, false, fmt.Errorf("check minimal-mode channel ownership: %w", err)
	}
	if !managed {
		return nil, false, nil
	}
	if strings.TrimSpace(proxyURL) != "" {
		return nil, true, errors.New("minimal-mode managed channels cannot use an outbound proxy")
	}
	if target == nil || (target.Scheme != "ws" && target.Scheme != "wss") {
		return nil, true, errors.New("minimal-mode websocket URL is invalid")
	}
	httpTarget := *target
	if httpTarget.Scheme == "ws" {
		httpTarget.Scheme = "http"
	} else {
		httpTarget.Scheme = "https"
	}
	if err := validateMinimalRelayURL(context.Background(), &httpTarget, currentMinimalModeSettings()); err != nil {
		return nil, true, err
	}
	dialer := *websocket.DefaultDialer
	dialer.Proxy = nil
	dialer.NetDial = nil
	dialer.NetDialTLSContext = nil
	dialer.NetDialContext = newMinimalModeDialContext(nil, nil, currentMinimalModeSettings)
	dialer.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	return &dialer, true, nil
}

func currentMinimalModeSettings() *operation_setting.MinimalModeSetting {
	settings := operation_setting.GetMinimalModeSetting()
	if settings == nil {
		return &operation_setting.MinimalModeSetting{}
	}
	return &operation_setting.MinimalModeSetting{
		Enabled:                 settings.Enabled,
		PrivateUpstreamsEnabled: settings.PrivateUpstreamsEnabled,
		PrivateHostAllowlist:    append([]string(nil), settings.PrivateHostAllowlist...),
		PrivateCIDRAllowlist:    append([]string(nil), settings.PrivateCIDRAllowlist...),
	}
}

func newMinimalModeRelayHTTPClient(resolver minimalModeResolver, dialContext func(context.Context, string, string) (net.Conn, error), getSettings minimalModeSettingsProvider) *http.Client {
	if resolver == nil {
		resolver = net.DefaultResolver
	}
	if getSettings == nil {
		getSettings = currentMinimalModeSettings
	}
	transport := &http.Transport{
		MaxIdleConns:          common.RelayMaxIdleConns,
		MaxIdleConnsPerHost:   common.RelayMaxIdleConnsPerHost,
		IdleConnTimeout:       time.Duration(common.RelayIdleConnTimeout) * time.Second,
		ForceAttemptHTTP2:     true,
		Proxy:                 nil,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 0,
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
	}
	transport.DialContext = newMinimalModeDialContext(resolver, dialContext, getSettings)
	client := &http.Client{
		Transport: transport,
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("too many minimal-mode upstream redirects")
			}
			if len(via) == 0 || via[0] == nil || via[0].URL == nil {
				return errors.New("minimal-mode upstream redirect has no origin")
			}
			if !strings.EqualFold(normalizeMinimalRelayHost(request.URL.Hostname()), normalizeMinimalRelayHost(via[0].URL.Hostname())) {
				return errors.New("cross-host minimal-mode upstream redirect is not allowed")
			}
			if via[0].URL.Scheme == "https" && request.URL.Scheme != "https" {
				return errors.New("minimal-mode upstream redirect cannot downgrade TLS")
			}
			return validateMinimalRelayURLWithResolver(request.Context(), request.URL, getSettings(), resolver)
		},
	}
	if common.RelayTimeout > 0 {
		client.Timeout = time.Duration(common.RelayTimeout) * time.Second
	}
	return client
}

func newMinimalModeDialContext(resolver minimalModeResolver, dialContext func(context.Context, string, string) (net.Conn, error), getSettings minimalModeSettingsProvider) func(context.Context, string, string) (net.Conn, error) {
	if resolver == nil {
		resolver = net.DefaultResolver
	}
	if dialContext == nil {
		dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
		dialContext = dialer.DialContext
	}
	if getSettings == nil {
		getSettings = currentMinimalModeSettings
	}
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil || strings.TrimSpace(port) == "" {
			return nil, errors.New("minimal-mode upstream address is invalid")
		}
		ips, err := allowedMinimalIPsWithResolver(ctx, host, getSettings(), resolver)
		if err != nil {
			return nil, err
		}
		var lastErr error
		for _, ip := range ips {
			connection, dialErr := dialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			if dialErr == nil {
				return connection, nil
			}
			lastErr = dialErr
		}
		if lastErr == nil {
			lastErr = errors.New("minimal-mode upstream has no allowed address")
		}
		return nil, lastErr
	}
}

func validateMinimalRelayURL(ctx context.Context, target *url.URL, settings *operation_setting.MinimalModeSetting) error {
	return validateMinimalRelayURLWithResolver(ctx, target, settings, net.DefaultResolver)
}

func validateMinimalRelayURLWithResolver(ctx context.Context, target *url.URL, settings *operation_setting.MinimalModeSetting, resolver minimalModeResolver) error {
	if target == nil || (target.Scheme != "http" && target.Scheme != "https") || target.Hostname() == "" {
		return errors.New("minimal-mode upstream URL is invalid")
	}
	if target.User != nil || target.Fragment != "" {
		return errors.New("minimal-mode upstream URL contains credentials or a fragment")
	}
	_, err := allowedMinimalIPsWithResolver(ctx, target.Hostname(), settings, resolver)
	return err
}

func normalizeMinimalRelayHost(host string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
}

func allowedMinimalIPsWithResolver(ctx context.Context, host string, settings *operation_setting.MinimalModeSetting, resolver minimalModeResolver) ([]net.IP, error) {
	host = normalizeMinimalRelayHost(host)
	if host == "" {
		return nil, errors.New("upstream host is missing")
	}
	if settings == nil {
		settings = &operation_setting.MinimalModeSetting{}
	}
	var ips []net.IP
	if literal := net.ParseIP(host); literal != nil {
		ips = []net.IP{literal}
	} else {
		lookupCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		resolved, err := resolver.LookupIPAddr(lookupCtx, host)
		if err != nil || len(resolved) == 0 {
			return nil, errors.New("upstream host could not be resolved")
		}
		for _, item := range resolved {
			ips = append(ips, item.IP)
		}
	}
	for _, ip := range ips {
		if minimalIPNeverAllowed(ip) {
			return nil, errors.New("upstream resolved to a blocked address")
		}
		if ip.IsPrivate() && (!settings.PrivateUpstreamsEnabled || !minimalHostAllowed(host, settings.PrivateHostAllowlist) || !minimalIPInAllowlist(ip, settings.PrivateCIDRAllowlist)) {
			return nil, errors.New("private upstream is not explicitly allowlisted")
		}
	}
	return ips, nil
}
