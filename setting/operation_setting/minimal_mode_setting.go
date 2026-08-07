package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// MinimalModeSetting controls the reversible self-use orchestration workflow.
// Private upstreams remain disabled unless both the explicit switch and the
// host/CIDR allowlists authorize the destination.
type MinimalModeSetting struct {
	Enabled                 bool     `json:"enabled"`
	PrivateUpstreamsEnabled bool     `json:"private_upstreams_enabled"`
	PrivateHostAllowlist    []string `json:"private_host_allowlist"`
	PrivateCIDRAllowlist    []string `json:"private_cidr_allowlist"`
}

var minimalModeSetting = MinimalModeSetting{
	Enabled:                 false,
	PrivateUpstreamsEnabled: false,
	PrivateHostAllowlist:    []string{},
	PrivateCIDRAllowlist:    []string{},
}

func init() {
	config.GlobalConfig.Register("minimal_mode_setting", &minimalModeSetting)
}

func GetMinimalModeSetting() *MinimalModeSetting {
	return &minimalModeSetting
}
