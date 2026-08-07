package ipgeo

import (
	"errors"
	"fmt"
	"net"
	"net/netip"
	"strings"
	"sync"

	"github.com/oschwald/maxminddb-golang"
)

const (
	KindPublic      = "public"
	KindMalformed   = "malformed"
	KindPrivate     = "private"
	KindLoopback    = "loopback"
	KindLinkLocal   = "link_local"
	KindUnspecified = "unspecified"
	KindMulticast   = "multicast"
	KindReserved    = "reserved"
	KindUntrusted   = "untrusted"
)

var reservedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("192.88.99.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("64:ff9b:1::/48"),
	netip.MustParsePrefix("100::/64"),
	netip.MustParsePrefix("2001::/23"),
	netip.MustParsePrefix("2001:db8::/32"),
}

type Result struct {
	IP               string `json:"ip"`
	Kind             string `json:"kind"`
	CountryISO       string `json:"country_iso"`
	ASNNumber        int64  `json:"asn_number"`
	ASNOrganization  string `json:"asn_organization"`
	ResolverVersion  string `json:"resolver_version"`
	ResolverReady    bool   `json:"resolver_ready"`
	EvidenceEligible bool   `json:"evidence_eligible"`
}

type Status struct {
	Ready        bool   `json:"ready"`
	CountryReady bool   `json:"country_ready"`
	ASNReady     bool   `json:"asn_ready"`
	Version      string `json:"version"`
	ErrorCode    string `json:"error_code,omitempty"`
}

type Resolver struct {
	country *maxminddb.Reader
	asn     *maxminddb.Reader
	status  Status

	cacheMu   sync.RWMutex
	cache     map[string]Result
	cacheSize int
}

type countryRecord struct {
	Country struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"country"`
}

type asnRecord struct {
	AutonomousSystemNumber       uint32 `maxminddb:"autonomous_system_number"`
	AutonomousSystemOrganization string `maxminddb:"autonomous_system_organization"`
	Traits                       struct {
		AutonomousSystemNumber       uint32 `maxminddb:"autonomous_system_number"`
		AutonomousSystemOrganization string `maxminddb:"autonomous_system_organization"`
	} `maxminddb:"traits"`
}

func Open(countryPath string, asnPath string, cacheSize int) (*Resolver, error) {
	if strings.TrimSpace(countryPath) == "" || strings.TrimSpace(asnPath) == "" {
		return nil, errors.New("both country and ASN MMDB paths are required")
	}
	country, err := maxminddb.Open(countryPath)
	if err != nil {
		return nil, errors.New("country MMDB is unavailable")
	}
	asn, err := maxminddb.Open(asnPath)
	if err != nil {
		_ = country.Close()
		return nil, errors.New("ASN MMDB is unavailable")
	}
	if cacheSize <= 0 {
		cacheSize = 100_000
	}
	version := fmt.Sprintf("country-%d/asn-%d", country.Metadata.BuildEpoch, asn.Metadata.BuildEpoch)
	return &Resolver{
		country: country,
		asn:     asn,
		status: Status{
			Ready:        true,
			CountryReady: true,
			ASNReady:     true,
			Version:      version,
		},
		cache:     make(map[string]Result),
		cacheSize: cacheSize,
	}, nil
}

func (r *Resolver) Close() error {
	if r == nil {
		return nil
	}
	var countryErr error
	if r.country != nil {
		countryErr = r.country.Close()
	}
	var asnErr error
	if r.asn != nil {
		asnErr = r.asn.Close()
	}
	return errors.Join(countryErr, asnErr)
}

func (r *Resolver) Status() Status {
	if r == nil {
		return Status{ErrorCode: "not_initialized"}
	}
	return r.status
}

func (r *Resolver) Lookup(rawIP string) Result {
	address, kind := Normalize(rawIP)
	result := Result{IP: address, Kind: kind}
	if r == nil {
		return result
	}
	result.ResolverReady = r.status.Ready
	result.ResolverVersion = r.status.Version
	if kind != KindPublic || !r.status.Ready {
		return result
	}

	r.cacheMu.RLock()
	cached, ok := r.cache[address]
	r.cacheMu.RUnlock()
	if ok {
		return cached
	}

	parsed, parseErr := netip.ParseAddr(address)
	if parseErr != nil {
		result.Kind = KindMalformed
		return result
	}
	ip := net.IP(parsed.AsSlice())
	var country countryRecord
	if err := r.country.Lookup(ip, &country); err != nil {
		return result
	}
	var asn asnRecord
	if err := r.asn.Lookup(ip, &asn); err != nil {
		return result
	}
	if asn.AutonomousSystemNumber == 0 {
		asn.AutonomousSystemNumber = asn.Traits.AutonomousSystemNumber
		asn.AutonomousSystemOrganization = asn.Traits.AutonomousSystemOrganization
	}
	result.CountryISO = strings.ToUpper(strings.TrimSpace(country.Country.ISOCode))
	result.ASNNumber = int64(asn.AutonomousSystemNumber)
	result.ASNOrganization = strings.TrimSpace(asn.AutonomousSystemOrganization)
	result.EvidenceEligible = result.CountryISO != "" && result.ASNNumber > 0

	r.cacheMu.Lock()
	if len(r.cache) < r.cacheSize {
		r.cache[address] = result
	}
	r.cacheMu.Unlock()
	return result
}

func Normalize(rawIP string) (string, string) {
	address, err := netip.ParseAddr(strings.TrimSpace(rawIP))
	if err != nil {
		return "unknown", KindMalformed
	}
	address = address.Unmap()
	normalized := address.String()
	switch {
	case address.IsUnspecified():
		return normalized, KindUnspecified
	case address.IsLoopback():
		return normalized, KindLoopback
	case address.IsLinkLocalUnicast():
		return normalized, KindLinkLocal
	case address.IsMulticast():
		return normalized, KindMulticast
	case address.IsPrivate():
		return normalized, KindPrivate
	case isReserved(address) || !address.IsGlobalUnicast():
		return normalized, KindReserved
	default:
		return normalized, KindPublic
	}
}

func isReserved(address netip.Addr) bool {
	for _, prefix := range reservedPrefixes {
		if prefix.Addr().BitLen() == address.BitLen() && prefix.Contains(address) {
			return true
		}
	}
	return false
}

var defaultResolver struct {
	sync.RWMutex
	resolver *Resolver
	status   Status
}

func InitializeDefault(countryPath string, asnPath string, cacheSize int) error {
	resolver, err := Open(countryPath, asnPath, cacheSize)
	if err != nil {
		defaultResolver.Lock()
		defaultResolver.status = Status{ErrorCode: "open_failed"}
		defaultResolver.Unlock()
		return err
	}
	defaultResolver.Lock()
	previous := defaultResolver.resolver
	defaultResolver.resolver = resolver
	defaultResolver.status = resolver.Status()
	defaultResolver.Unlock()
	if previous != nil {
		_ = previous.Close()
	}
	return nil
}

func LookupDefault(rawIP string) Result {
	defaultResolver.RLock()
	defer defaultResolver.RUnlock()
	if defaultResolver.resolver == nil {
		address, kind := Normalize(rawIP)
		return Result{IP: address, Kind: kind}
	}
	return defaultResolver.resolver.Lookup(rawIP)
}

func DefaultStatus() Status {
	defaultResolver.RLock()
	defer defaultResolver.RUnlock()
	if defaultResolver.resolver == nil {
		status := defaultResolver.status
		if status.ErrorCode == "" {
			status.ErrorCode = "not_initialized"
		}
		return status
	}
	return defaultResolver.status
}
