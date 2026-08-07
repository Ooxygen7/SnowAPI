package service

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type minimalModeResolverFunc func(context.Context, string) ([]net.IPAddr, error)

func (resolve minimalModeResolverFunc) LookupIPAddr(ctx context.Context, host string) ([]net.IPAddr, error) {
	return resolve(ctx, host)
}

func TestMinimalModeRelayClientChecksEveryResolvedAddressBeforeDial(t *testing.T) {
	var dialCalls atomic.Int32
	client := newMinimalModeRelayHTTPClient(
		minimalModeResolverFunc(func(context.Context, string) ([]net.IPAddr, error) {
			return []net.IPAddr{{IP: net.ParseIP("8.8.8.8")}, {IP: net.ParseIP("169.254.169.254")}}, nil
		}),
		func(context.Context, string, string) (net.Conn, error) {
			dialCalls.Add(1)
			return nil, assert.AnError
		},
		func() *operation_setting.MinimalModeSetting { return &operation_setting.MinimalModeSetting{} },
	)

	response, err := client.Get("http://mixed-answer.example/v1/models")
	if response != nil {
		response.Body.Close()
	}
	require.Error(t, err)
	assert.ErrorContains(t, err, "blocked address")
	assert.Equal(t, int32(0), dialCalls.Load())
}

func TestMinimalModeRelayClientPinsDNSAndReadsCurrentAllowlistOnEveryDial(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(response, "ok")
	}))
	defer server.Close()
	serverURL, err := url.Parse(server.URL)
	require.NoError(t, err)

	var privateAllowed atomic.Bool
	privateAllowed.Store(true)
	var dialCalls atomic.Int32
	client := newMinimalModeRelayHTTPClient(
		minimalModeResolverFunc(func(context.Context, string) ([]net.IPAddr, error) {
			return []net.IPAddr{{IP: net.ParseIP("10.20.30.40")}}, nil
		}),
		func(ctx context.Context, network, address string) (net.Conn, error) {
			dialCalls.Add(1)
			assert.True(t, strings.HasPrefix(address, "10.20.30.40:"), address)
			return (&net.Dialer{}).DialContext(ctx, network, serverURL.Host)
		},
		func() *operation_setting.MinimalModeSetting {
			if !privateAllowed.Load() {
				return &operation_setting.MinimalModeSetting{}
			}
			return &operation_setting.MinimalModeSetting{
				PrivateUpstreamsEnabled: true,
				PrivateHostAllowlist:    []string{"private.example"},
				PrivateCIDRAllowlist:    []string{"10.20.0.0/16"},
			}
		},
	)

	response, err := client.Get("http://private.example/first")
	require.NoError(t, err)
	require.NoError(t, response.Body.Close())
	assert.Equal(t, int32(1), dialCalls.Load())

	client.CloseIdleConnections()
	privateAllowed.Store(false)
	response, err = client.Get("http://private.example/second")
	if response != nil {
		response.Body.Close()
	}
	require.Error(t, err)
	assert.ErrorContains(t, err, "not explicitly allowlisted")
	assert.Equal(t, int32(1), dialCalls.Load(), "blocked DNS changes must not reach the network dialer")
}

func TestMinimalModeRelayClientRevalidatesRedirectBeforeFollowing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/start" {
			http.Redirect(response, request, "/redirected", http.StatusTemporaryRedirect)
			return
		}
		response.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	serverURL, err := url.Parse(server.URL)
	require.NoError(t, err)

	var lookups atomic.Int32
	var dialCalls atomic.Int32
	client := newMinimalModeRelayHTTPClient(
		minimalModeResolverFunc(func(context.Context, string) ([]net.IPAddr, error) {
			if lookups.Add(1) == 1 {
				return []net.IPAddr{{IP: net.ParseIP("8.8.8.8")}}, nil
			}
			return []net.IPAddr{{IP: net.ParseIP("169.254.169.254")}}, nil
		}),
		func(ctx context.Context, network, _ string) (net.Conn, error) {
			dialCalls.Add(1)
			return (&net.Dialer{}).DialContext(ctx, network, serverURL.Host)
		},
		func() *operation_setting.MinimalModeSetting { return &operation_setting.MinimalModeSetting{} },
	)

	response, err := client.Get("http://redirect.example/start")
	if response != nil {
		response.Body.Close()
	}
	require.Error(t, err)
	assert.ErrorContains(t, err, "blocked address")
	assert.Equal(t, int32(1), dialCalls.Load())
	assert.GreaterOrEqual(t, lookups.Load(), int32(2))
}

func TestMinimalModeRelayClientRejectsCrossHostAndTLSDowngradeRedirects(t *testing.T) {
	client := newMinimalModeRelayHTTPClient(
		minimalModeResolverFunc(func(context.Context, string) ([]net.IPAddr, error) {
			return []net.IPAddr{{IP: net.ParseIP("8.8.8.8")}}, nil
		}),
		nil,
		func() *operation_setting.MinimalModeSetting { return &operation_setting.MinimalModeSetting{} },
	)

	origin := &http.Request{URL: &url.URL{Scheme: "https", Host: "api.example", Path: "/v1/chat/completions"}}
	crossHost := &http.Request{URL: &url.URL{Scheme: "https", Host: "other.example", Path: "/redirected"}}
	err := client.CheckRedirect(crossHost, []*http.Request{origin})
	assert.ErrorContains(t, err, "cross-host")

	downgrade := &http.Request{URL: &url.URL{Scheme: "http", Host: "api.example", Path: "/redirected"}}
	err = client.CheckRedirect(downgrade, []*http.Request{origin})
	assert.ErrorContains(t, err, "downgrade TLS")
}

func TestRelayClientSelectionScopesProtectionToMinimalModeOwnership(t *testing.T) {
	t.Cleanup(ResetMinimalModeRelayClient)
	originalDB := model.DB
	database, err := gorm.Open(sqlite.Open("file:minimal-relay-selection?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := database.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	model.DB = database
	t.Cleanup(func() { model.DB = originalDB })
	require.NoError(t, database.AutoMigrate(&model.MinimalModeSource{}))

	originalHTTPClient := httpClient
	manualClient := &http.Client{}
	httpClient = manualClient
	t.Cleanup(func() { httpClient = originalHTTPClient })
	target, err := url.Parse("https://8.8.8.8/v1/models")
	require.NoError(t, err)

	selected, err := GetRelayHTTPClient(701, "", target)
	require.NoError(t, err)
	assert.Same(t, manualClient, selected)
	websocketTarget, err := url.Parse("wss://8.8.8.8/v1/realtime")
	require.NoError(t, err)
	websocketDialer, managed, err := GetRelayWebsocketDialer(701, "", websocketTarget)
	require.NoError(t, err)
	assert.False(t, managed)
	assert.Nil(t, websocketDialer)

	require.NoError(t, database.Create(&model.MinimalModeSource{
		ChannelId:        702,
		Revision:         1,
		LastSyncedDigest: "digest",
		CreatedTime:      1,
		UpdatedTime:      1,
	}).Error)
	selected, err = GetRelayHTTPClient(702, "", target)
	require.NoError(t, err)
	assert.NotSame(t, manualClient, selected)
	ResetMinimalModeRelayClient()
	refreshed, err := GetRelayHTTPClient(702, "", target)
	require.NoError(t, err)
	assert.NotSame(t, selected, refreshed)
	websocketDialer, managed, err = GetRelayWebsocketDialer(702, "", websocketTarget)
	require.NoError(t, err)
	assert.True(t, managed)
	assert.NotNil(t, websocketDialer.NetDialContext)

	_, err = GetRelayHTTPClient(702, "http://proxy.example", target)
	assert.ErrorContains(t, err, "cannot use an outbound proxy")
	blockedWebsocketTarget, err := url.Parse("ws://169.254.169.254/v1/realtime")
	require.NoError(t, err)
	_, managed, err = GetRelayWebsocketDialer(702, "", blockedWebsocketTarget)
	assert.True(t, managed)
	assert.ErrorContains(t, err, "blocked address")
}
