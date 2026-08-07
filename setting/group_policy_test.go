package setting

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateGroupPoliciesByJSONStringPreservesConfiguredLimits(t *testing.T) {
	original := GroupPolicies2JSONString()
	originalConfigured := GroupPoliciesConfigured()
	t.Cleanup(func() {
		require.NoError(t, UpdateGroupPoliciesByJSONString(original))
		groupPoliciesMutex.Lock()
		groupPoliciesConfigured = originalConfigured
		groupPoliciesMutex.Unlock()
	})

	err := UpdateGroupPoliciesByJSONString(`{
		"Free": {
			"max_requests": 120,
			"max_successful_requests": 100,
			"period_minutes": 5,
			"concurrency_limit": 3,
			"tpm_limit": 9000,
			"recharge_threshold": 0
		}
	}`)
	require.NoError(t, err)

	policy, ok := GetGroupPolicy("Free")
	require.True(t, ok)
	assert.True(t, GroupPoliciesConfigured())
	assert.Equal(t, 120, policy.MaxRequests)
	assert.Equal(t, 100, policy.MaxSuccessfulRequests)
	assert.Equal(t, 5, policy.PeriodMinutes)
	assert.Equal(t, 3, policy.ConcurrencyLimit)
	assert.Equal(t, 9000, policy.TPMLimit)
	assert.False(t, strings.Contains(GroupPolicies2JSONString(), "recharge_threshold"))
}

func TestValidateGroupPoliciesRejectsUnsafeConfiguration(t *testing.T) {
	tests := []struct {
		name     string
		policies map[string]GroupPolicy
	}{
		{
			name:     "missing Free",
			policies: map[string]GroupPolicy{"Light": {PeriodMinutes: 1}},
		},
		{
			name:     "zero period",
			policies: map[string]GroupPolicy{"Free": {}},
		},
		{
			name: "negative limit",
			policies: map[string]GroupPolicy{
				"Free": {PeriodMinutes: 1, ConcurrencyLimit: -1},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Error(t, ValidateGroupPolicies(test.policies))
		})
	}
}
