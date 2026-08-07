package ipgeo

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeRejectsNonPublicEvidenceAddresses(t *testing.T) {
	tests := []struct {
		name       string
		input      string
		normalized string
		kind       string
	}{
		{name: "public IPv4", input: "8.8.8.8", normalized: "8.8.8.8", kind: KindPublic},
		{name: "mapped IPv4", input: "::ffff:8.8.4.4", normalized: "8.8.4.4", kind: KindPublic},
		{name: "public IPv6", input: "2606:4700:4700::1111", normalized: "2606:4700:4700::1111", kind: KindPublic},
		{name: "private", input: "10.0.0.1", normalized: "10.0.0.1", kind: KindPrivate},
		{name: "loopback", input: "127.0.0.1", normalized: "127.0.0.1", kind: KindLoopback},
		{name: "link local", input: "169.254.10.20", normalized: "169.254.10.20", kind: KindLinkLocal},
		{name: "unspecified", input: "::", normalized: "::", kind: KindUnspecified},
		{name: "multicast", input: "224.0.0.1", normalized: "224.0.0.1", kind: KindMulticast},
		{name: "documentation", input: "203.0.113.10", normalized: "203.0.113.10", kind: KindReserved},
		{name: "malformed", input: "not-an-ip", normalized: "unknown", kind: KindMalformed},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			normalized, kind := Normalize(test.input)
			assert.Equal(t, test.normalized, normalized)
			assert.Equal(t, test.kind, kind)
		})
	}
}

func TestLookupWithoutResolverNeverProducesAutomaticEvidence(t *testing.T) {
	result := (*Resolver)(nil).Lookup("8.8.8.8")
	assert.Equal(t, KindPublic, result.Kind)
	assert.False(t, result.ResolverReady)
	assert.False(t, result.EvidenceEligible)
	assert.Empty(t, result.CountryISO)
	assert.Zero(t, result.ASNNumber)
}

func TestOpenErrorDoesNotExposeMMDBPaths(t *testing.T) {
	countryPath := "/sensitive/mmdb/location/country.mmdb"
	_, err := Open(countryPath, "/sensitive/mmdb/location/asn.mmdb", 10)
	require.Error(t, err)
	assert.NotContains(t, err.Error(), countryPath)
}
