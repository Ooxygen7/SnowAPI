package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseIPAuditTrustedProxySettingRequiresImmediateHosts(t *testing.T) {
	tests := []struct {
		name       string
		setting    string
		expected   []string
		configured bool
		wantError  bool
	}{
		{name: "unset", setting: "", configured: false},
		{name: "direct", setting: "direct", expected: []string{}, configured: true},
		{name: "explicit hosts", setting: "127.0.0.1, 172.18.0.2/32, 2001:db8::1", expected: []string{"127.0.0.1/32", "172.18.0.2/32", "2001:db8::1/128"}, configured: true},
		{name: "duplicates canonicalized", setting: "127.0.0.1,127.0.0.1/32", expected: []string{"127.0.0.1/32"}, configured: true},
		{name: "reject any IPv4 source", setting: "0.0.0.0/0", wantError: true},
		{name: "reject broad private network", setting: "10.0.0.0/8", wantError: true},
		{name: "reject broad public network", setting: "203.0.113.0/24", wantError: true},
		{name: "reject multicast host", setting: "224.0.0.1", wantError: true},
		{name: "reject mixed direct", setting: "direct,127.0.0.1", wantError: true},
		{name: "reject malformed", setting: "proxy.internal", wantError: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			proxies, configured, err := ParseIPAuditTrustedProxySetting(test.setting)
			if test.wantError {
				require.Error(t, err)
				assert.False(t, configured)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, test.expected, proxies)
			assert.Equal(t, test.configured, configured)
		})
	}
}

func TestIPBanReadinessSeparatesProxyConfigurationAndVerification(t *testing.T) {
	previousConfigured := ipAuditTrustedProxyConfigured.Load()
	previousVerified := ipAuditProxyChainVerified.Load()
	t.Cleanup(func() {
		ipAuditTrustedProxyConfigured.Store(previousConfigured)
		ipAuditProxyChainVerified.Store(previousVerified)
	})

	ipAuditTrustedProxyConfigured.Store(true)
	ipAuditProxyChainVerified.Store(false)
	readiness := GetIPBanReadiness()
	assert.True(t, readiness.ProxyConfigured)
	assert.False(t, readiness.ProxyChainVerified)
	assert.False(t, readiness.ProxyReady)
	assert.False(t, readiness.EnforcedReady)
	assert.Contains(t, readiness.Blocking, "trusted_proxy_chain_not_verified")
	assert.NotContains(t, readiness.Blocking, "trusted_proxy_not_configured")

	ipAuditProxyChainVerified.Store(true)
	readiness = GetIPBanReadiness()
	assert.True(t, readiness.ProxyConfigured)
	assert.True(t, readiness.ProxyChainVerified)
	assert.True(t, readiness.ProxyReady)
	assert.NotContains(t, readiness.Blocking, "trusted_proxy_chain_not_verified")
}

func TestIPBanNoMatchCacheReusesOnlyIdenticalObservationState(t *testing.T) {
	cache := newIPBanResultCache()
	entry := ipBanResultCacheEntry{
		IP:                   "8.8.8.8",
		ObservedAt:           1000,
		WindowStartExclusive: 400,
		ResolverVersion:      "fixture-v1",
	}
	cache.rememberNoMatch(42, entry)
	assert.True(t, cache.matches(42, entry))

	changedIP := entry
	changedIP.IP = "1.1.1.1"
	assert.False(t, cache.matches(42, changedIP))
	changedSecond := entry
	changedSecond.ObservedAt++
	assert.False(t, cache.matches(42, changedSecond))
	changedFloor := entry
	changedFloor.WindowStartExclusive++
	assert.False(t, cache.matches(42, changedFloor))
	changedResolver := entry
	changedResolver.ResolverVersion = "fixture-v2"
	assert.False(t, cache.matches(42, changedResolver))
	assert.False(t, cache.matches(43, entry))
}
