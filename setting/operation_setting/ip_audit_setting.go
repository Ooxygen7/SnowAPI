package operation_setting

import (
	"os"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

const (
	IPAuditEnforcementDisabled = "disabled"
	IPAuditEnforcementShadow   = "shadow"
	IPAuditEnforcementEnforced = "enforced"
)

// IPAuditSetting controls local enrichment and automatic relay-ban decisions.
// Enforcement is deliberately disabled by default. The runtime also requires
// both resolver and trusted-proxy readiness before "enforced" becomes active.
type IPAuditSetting struct {
	EnforcementMode string `json:"enforcement_mode"`
	CountryMMDBPath string `json:"country_mmdb_path"`
	ASNMMDBPath     string `json:"asn_mmdb_path"`
	CacheEntries    int    `json:"cache_entries"`
}

var ipAuditSetting = IPAuditSetting{
	EnforcementMode: IPAuditEnforcementDisabled,
	CacheEntries:    100_000,
}

func init() {
	config.GlobalConfig.Register("ip_audit_setting", &ipAuditSetting)
}

func GetIPAuditSetting() *IPAuditSetting {
	return &ipAuditSetting
}

func GetIPAuditEnforcementMode() string {
	switch strings.ToLower(strings.TrimSpace(ipAuditSetting.EnforcementMode)) {
	case IPAuditEnforcementShadow:
		return IPAuditEnforcementShadow
	case IPAuditEnforcementEnforced:
		return IPAuditEnforcementEnforced
	default:
		return IPAuditEnforcementDisabled
	}
}

func GetIPAuditMMDBPaths() (countryPath string, asnPath string) {
	countryPath = strings.TrimSpace(os.Getenv("IP_AUDIT_COUNTRY_MMDB"))
	if countryPath == "" {
		countryPath = strings.TrimSpace(ipAuditSetting.CountryMMDBPath)
	}
	asnPath = strings.TrimSpace(os.Getenv("IP_AUDIT_ASN_MMDB"))
	if asnPath == "" {
		asnPath = strings.TrimSpace(ipAuditSetting.ASNMMDBPath)
	}
	return countryPath, asnPath
}

func GetIPAuditCacheEntries() int {
	if ipAuditSetting.CacheEntries <= 0 {
		return 100_000
	}
	if ipAuditSetting.CacheEntries > 1_000_000 {
		return 1_000_000
	}
	return ipAuditSetting.CacheEntries
}
