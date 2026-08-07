package service

import (
	"fmt"
	"net/netip"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/ipgeo"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const (
	IPBanWindowSeconds = int64(600)
	IPBanRapidSeconds  = int64(180)

	ipBanEvaluationStripeCount = 256
	ipBanEvaluationCacheLimit  = 4096
	maxTrustedProxyEntries     = 64
)

var (
	ipAuditTrustedProxyConfigured atomic.Bool
	ipAuditProxyChainVerified     atomic.Bool
	ipBanEvaluationStripes        [ipBanEvaluationStripeCount]sync.Mutex
	ipBanEvaluationCache          = newIPBanResultCache()
)

type IPBanReadiness struct {
	ConfiguredMode     string       `json:"configured_mode"`
	EffectiveMode      string       `json:"effective_mode"`
	ProxyConfigured    bool         `json:"proxy_configured"`
	ProxyChainVerified bool         `json:"proxy_chain_verified"`
	ProxyReady         bool         `json:"proxy_ready"`
	Resolver           ipgeo.Status `json:"resolver"`
	EnforcedReady      bool         `json:"enforced_ready"`
	Blocking           []string     `json:"blocking"`
}

type RelayBanDecision struct {
	Ban          *model.UserRelayBan
	NewlyApplied bool
}

type automaticBanEvidence struct {
	WindowStartExclusive int64                 `json:"window_start_exclusive"`
	WindowEndInclusive   int64                 `json:"window_end_inclusive"`
	CountryCount         int                   `json:"country_count"`
	ASNCount             int                   `json:"asn_count"`
	EligibleIPs          int                   `json:"eligible_ips"`
	MinimumGapSeconds    int64                 `json:"minimum_gap_seconds"`
	ResolverVersion      string                `json:"resolver_version"`
	InputTruncated       bool                  `json:"input_truncated"`
	Observations         []model.IPAuditMinute `json:"observations"`
}

type ipBanResultCacheEntry struct {
	IP                   string
	ObservedAt           int64
	WindowStartExclusive int64
	ResolverVersion      string
}

type ipBanResultCacheStore struct {
	mu      sync.Mutex
	entries map[int]ipBanResultCacheEntry
}

func newIPBanResultCache() *ipBanResultCacheStore {
	return &ipBanResultCacheStore{entries: make(map[int]ipBanResultCacheEntry)}
}

func (cache *ipBanResultCacheStore) matches(userID int, expected ipBanResultCacheEntry) bool {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	entry, ok := cache.entries[userID]
	return ok && entry == expected
}

func (cache *ipBanResultCacheStore) rememberNoMatch(userID int, entry ipBanResultCacheEntry) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if len(cache.entries) >= ipBanEvaluationCacheLimit {
		clear(cache.entries)
	}
	cache.entries[userID] = entry
}

func InitializeIPBanResolver() error {
	countryPath, asnPath := operation_setting.GetIPAuditMMDBPaths()
	return ipgeo.InitializeDefault(countryPath, asnPath, operation_setting.GetIPAuditCacheEntries())
}

// ParseIPAuditTrustedProxySetting accepts either "direct" or an explicit list
// of immediate proxy hosts. Network-wide CIDRs are rejected because every host
// in such a range would otherwise be allowed to forge the client IP headers.
func ParseIPAuditTrustedProxySetting(setting string) ([]string, bool, error) {
	setting = strings.TrimSpace(setting)
	if setting == "" {
		return nil, false, nil
	}
	if strings.EqualFold(setting, "direct") {
		return []string{}, true, nil
	}
	entries := strings.Split(setting, ",")
	if len(entries) > maxTrustedProxyEntries {
		return nil, false, fmt.Errorf("at most %d trusted proxy hosts are allowed", maxTrustedProxyEntries)
	}
	trustedProxies := make([]string, 0, len(entries))
	seen := make(map[string]struct{}, len(entries))
	for _, entry := range entries {
		entry = strings.TrimSpace(entry)
		if entry == "" || strings.EqualFold(entry, "direct") {
			return nil, false, fmt.Errorf("trusted proxy entries must be non-empty IP hosts")
		}
		prefix, err := netip.ParsePrefix(entry)
		if err != nil {
			address, addressErr := netip.ParseAddr(entry)
			if addressErr != nil {
				return nil, false, fmt.Errorf("invalid trusted proxy %q", entry)
			}
			address = address.Unmap()
			prefix = netip.PrefixFrom(address, address.BitLen())
		}
		address := prefix.Addr().Unmap()
		if prefix.Bits() != prefix.Addr().BitLen() {
			return nil, false, fmt.Errorf("trusted proxy %q is an unsafe network-wide CIDR; configure the immediate proxy host", entry)
		}
		if !address.IsValid() || address.IsUnspecified() || address.IsMulticast() || (!address.IsGlobalUnicast() && !address.IsLoopback() && !address.IsPrivate()) {
			return nil, false, fmt.Errorf("trusted proxy %q is not a usable unicast host", entry)
		}
		canonical := netip.PrefixFrom(address, address.BitLen()).String()
		if _, ok := seen[canonical]; ok {
			continue
		}
		seen[canonical] = struct{}{}
		trustedProxies = append(trustedProxies, canonical)
	}
	if len(trustedProxies) == 0 {
		return nil, false, fmt.Errorf("no trusted proxy hosts configured")
	}
	return trustedProxies, true, nil
}

func SetIPAuditTrustedProxyConfigured(configured bool) {
	ipAuditTrustedProxyConfigured.Store(configured)
}

// SetIPAuditProxyChainVerified is the deployment validation latch. It must only
// be enabled after the observed ClientIP has been checked through the real
// forwarding chain; it deliberately defaults to false on every deployment.
func SetIPAuditProxyChainVerified(verified bool) {
	ipAuditProxyChainVerified.Store(verified)
}

func GetIPBanReadiness() IPBanReadiness {
	configuredMode := operation_setting.GetIPAuditEnforcementMode()
	resolverStatus := ipgeo.DefaultStatus()
	proxyConfigured := ipAuditTrustedProxyConfigured.Load()
	proxyChainVerified := ipAuditProxyChainVerified.Load()
	proxyReady := proxyConfigured && proxyChainVerified
	blocking := make([]string, 0, 3)
	if !resolverStatus.Ready {
		blocking = append(blocking, "resolver_not_ready")
	}
	if !proxyConfigured {
		blocking = append(blocking, "trusted_proxy_not_configured")
	}
	if !proxyChainVerified {
		blocking = append(blocking, "trusted_proxy_chain_not_verified")
	}
	ready := resolverStatus.Ready && proxyReady
	effectiveMode := configuredMode
	if !ready && configuredMode != operation_setting.IPAuditEnforcementDisabled {
		effectiveMode = operation_setting.IPAuditEnforcementDisabled
	}
	return IPBanReadiness{
		ConfiguredMode:     configuredMode,
		EffectiveMode:      effectiveMode,
		ProxyConfigured:    proxyConfigured,
		ProxyChainVerified: proxyChainVerified,
		ProxyReady:         proxyReady,
		Resolver:           resolverStatus,
		EnforcedReady:      ready,
		Blocking:           blocking,
	}
}

// AuditAndEvaluateRelayRequest runs synchronously after token identity is
// resolved and before distribution, quota reservation, or upstream I/O.
func AuditAndEvaluateRelayRequest(userID int, username string, rawClientIP string) (*RelayBanDecision, error) {
	now := model.GetDBTimestamp()
	activeBan, err := model.GetActiveUserRelayBan(userID, now)
	if err != nil {
		return nil, err
	}
	if activeBan != nil {
		return &RelayBanDecision{Ban: activeBan}, nil
	}

	lookup := ipgeo.Result{IP: "unknown", Kind: ipgeo.KindUntrusted}
	if ipAuditTrustedProxyConfigured.Load() && ipAuditProxyChainVerified.Load() {
		lookup = ipgeo.LookupDefault(rawClientIP)
	}
	if err := model.RecordIPAuditObservation(model.IPAuditObservation{
		UserID:           userID,
		Username:         username,
		IP:               lookup.IP,
		CountryISO:       lookup.CountryISO,
		ASNNumber:        lookup.ASNNumber,
		ASNOrganization:  lookup.ASNOrganization,
		ResolverVersion:  lookup.ResolverVersion,
		IPKind:           lookup.Kind,
		EvidenceEligible: lookup.EvidenceEligible,
		ObservedAt:       time.Unix(now, 0).UTC(),
	}); err != nil {
		return nil, fmt.Errorf("record relay IP audit: %w", err)
	}

	readiness := GetIPBanReadiness()
	if readiness.EffectiveMode == operation_setting.IPAuditEnforcementDisabled {
		return recheckActiveRelayBan(userID, now)
	}

	stripe := &ipBanEvaluationStripes[uint(userID)%ipBanEvaluationStripeCount]
	stripe.Lock()
	defer stripe.Unlock()
	if activeBan, err := model.GetActiveUserRelayBan(userID, now); err != nil {
		return nil, err
	} else if activeBan != nil {
		return &RelayBanDecision{Ban: activeBan}, nil
	}
	windowStart := now - IPBanWindowSeconds
	state, err := model.GetUserRelayBanState(userID)
	if err != nil {
		return nil, err
	}
	if state != nil && state.EvaluationFloor() > windowStart {
		windowStart = state.EvaluationFloor()
	}
	cacheEntry := ipBanResultCacheEntry{
		IP:                   lookup.IP,
		ObservedAt:           now,
		WindowStartExclusive: windowStart,
		ResolverVersion:      lookup.ResolverVersion,
	}
	if ipBanEvaluationCache.matches(userID, cacheEntry) {
		return recheckActiveRelayBan(userID, now)
	}
	rows, err := model.GetIPAuditRowsForEvaluation(userID, windowStart, now)
	if err != nil {
		return nil, err
	}
	risk := model.BuildIPAuditRiskEvidence(rows, windowStart, now)
	if !risk.TriggersBan {
		ipBanEvaluationCache.rememberNoMatch(userID, cacheEntry)
		return recheckActiveRelayBan(userID, now)
	}
	observations := risk.Observations
	if len(observations) > 100 {
		observations = observations[:100]
	}
	evidenceBytes, err := common.Marshal(automaticBanEvidence{
		WindowStartExclusive: windowStart,
		WindowEndInclusive:   now,
		CountryCount:         risk.CountryCount,
		ASNCount:             risk.ASNCount,
		EligibleIPs:          risk.EligibleIPs,
		MinimumGapSeconds:    risk.MinimumGapSeconds,
		ResolverVersion:      readiness.Resolver.Version,
		InputTruncated:       risk.InputTruncated,
		Observations:         observations,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal relay-ban evidence: %w", err)
	}
	evidence := string(evidenceBytes)
	if readiness.EffectiveMode == operation_setting.IPAuditEnforcementShadow {
		if err := model.RecordRelayBanShadowMatch(userID, evidence, now); err != nil {
			return nil, err
		}
		return recheckActiveRelayBan(userID, now)
	}

	ban, applied, err := model.ApplyAutomaticRelayBan(
		userID,
		"country/ASN relay concurrency rule matched",
		evidence,
		windowStart,
	)
	if err != nil {
		return nil, err
	}
	return &RelayBanDecision{Ban: ban, NewlyApplied: applied}, nil
}

func recheckActiveRelayBan(userID int, now int64) (*RelayBanDecision, error) {
	ban, err := model.GetActiveUserRelayBan(userID, now)
	if err != nil {
		return nil, err
	}
	return &RelayBanDecision{Ban: ban}, nil
}
