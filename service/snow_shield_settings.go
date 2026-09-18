package service

import (
	"errors"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type SnowShieldSettings struct {
	Enabled      bool   `json:"enabled"`
	Hostname     string `json:"hostname"`
	TrustMinutes int    `json:"trust_minutes"`
}

// Database settings take precedence once saved. Environment variables remain
// the migration default so an existing protected deployment stays protected.
func GetSnowShieldSettings() SnowShieldSettings {
	settings := SnowShieldSettings{
		Enabled:      os.Getenv("SNOW_SHIELD_ENABLED") == "true",
		Hostname:     os.Getenv("SNOW_SHIELD_HOSTNAME"),
		TrustMinutes: 60,
	}
	common.OptionMapRWMutex.RLock()
	raw, saved := common.OptionMap["SnowShieldSettings"]
	common.OptionMapRWMutex.RUnlock()
	if saved && common.UnmarshalJsonStr(raw, &settings) != nil {
		// A corrupt saved setting must not silently disable the gate.
		return SnowShieldSettings{Enabled: true}
	}
	return settings
}

func ValidateSnowShieldConfiguration(settings SnowShieldSettings, siteKey, secretKey string) error {
	if settings.TrustMinutes < 1 || settings.TrustMinutes > 1440 {
		return errors.New("SnowShield trust duration must be between 1 and 1440 minutes")
	}
	if !settings.Enabled {
		return nil
	}
	if !common.SessionCookieSecure {
		return errors.New("SnowShield requires secure session cookies and HTTPS")
	}
	host := settings.Hostname
	if host == "" || len(host) > 253 || host != strings.ToLower(host) {
		return errors.New("Enter a valid SnowShield hostname without a URL scheme or path")
	}
	for _, label := range strings.Split(host, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return errors.New("Enter a valid SnowShield hostname without a URL scheme or path")
		}
		for _, character := range label {
			if !(character >= 'a' && character <= 'z') && !(character >= '0' && character <= '9') && character != '-' {
				return errors.New("Enter a valid SnowShield hostname without a URL scheme or path")
			}
		}
	}
	if strings.TrimSpace(siteKey) == "" || strings.TrimSpace(secretKey) == "" {
		return errors.New("Configure the Turnstile site key and secret key before enabling protection")
	}
	return nil
}
