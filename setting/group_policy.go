package setting

import (
	"fmt"
	"math"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// GroupPolicy contains the limits that apply to every relay request made by a
// user in a group. A zero limit means unlimited. PeriodMinutes is still kept
// positive so the same policy has unambiguous RPM and TPM semantics.
type GroupPolicy struct {
	MaxRequests           int `json:"max_requests"`
	MaxSuccessfulRequests int `json:"max_successful_requests"`
	PeriodMinutes         int `json:"period_minutes"`
	ConcurrencyLimit      int `json:"concurrency_limit"`
	TPMLimit              int `json:"tpm_limit"`
}

var (
	groupPolicies = map[string]GroupPolicy{
		"Free":  {PeriodMinutes: 1},
		"Light": {PeriodMinutes: 1},
	}
	groupPoliciesConfigured bool
	groupPoliciesMutex      sync.RWMutex
)

func GroupPoliciesConfigured() bool {
	groupPoliciesMutex.RLock()
	defer groupPoliciesMutex.RUnlock()
	return groupPoliciesConfigured
}

func GetGroupPoliciesCopy() map[string]GroupPolicy {
	groupPoliciesMutex.RLock()
	defer groupPoliciesMutex.RUnlock()

	result := make(map[string]GroupPolicy, len(groupPolicies))
	for name, policy := range groupPolicies {
		result[name] = policy
	}
	return result
}

func GetGroupPolicy(group string) (GroupPolicy, bool) {
	groupPoliciesMutex.RLock()
	defer groupPoliciesMutex.RUnlock()
	policy, ok := groupPolicies[group]
	return policy, ok
}

func GroupPolicies2JSONString() string {
	groupPoliciesMutex.RLock()
	defer groupPoliciesMutex.RUnlock()
	data, err := common.Marshal(groupPolicies)
	if err != nil {
		common.SysError("failed to marshal group policies: " + err.Error())
		return "{}"
	}
	return string(data)
}

func UpdateGroupPoliciesByJSONString(value string) error {
	policies := make(map[string]GroupPolicy)
	if err := common.UnmarshalJsonStr(value, &policies); err != nil {
		return err
	}
	if err := ValidateGroupPolicies(policies); err != nil {
		return err
	}
	groupPoliciesMutex.Lock()
	groupPolicies = policies
	groupPoliciesConfigured = true
	groupPoliciesMutex.Unlock()
	return nil
}

func ValidateGroupPolicies(policies map[string]GroupPolicy) error {
	if _, ok := policies["Free"]; !ok {
		return fmt.Errorf("Free group policy is required")
	}
	for name, policy := range policies {
		if name == "" {
			return fmt.Errorf("group name cannot be empty")
		}
		if policy.PeriodMinutes < 1 || policy.PeriodMinutes > 24*60 {
			return fmt.Errorf("group %s period must be between 1 and 1440 minutes", name)
		}
		limits := []int{
			policy.MaxRequests,
			policy.MaxSuccessfulRequests,
			policy.ConcurrencyLimit,
			policy.TPMLimit,
		}
		for _, limit := range limits {
			if limit < 0 || int64(limit) > math.MaxInt32 {
				return fmt.Errorf("group %s limit must be between 0 and %d", name, math.MaxInt32)
			}
		}
	}
	return nil
}
