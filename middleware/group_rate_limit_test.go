package middleware

import (
	"testing"

	"github.com/QuantumNous/new-api/setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func resetGroupRateState(t *testing.T) {
	t.Helper()
	groupRateState.Lock()
	groupRateState.Users = make(map[int]*groupRateUserState)
	groupRateState.Unlock()
	t.Cleanup(func() {
		groupRateState.Lock()
		groupRateState.Users = make(map[int]*groupRateUserState)
		groupRateState.Unlock()
	})
}

func TestEnterGroupRateWindowEnforcesConcurrencyAndSuccessLimits(t *testing.T) {
	resetGroupRateState(t)
	policy := setting.GroupPolicy{
		MaxRequests:           10,
		MaxSuccessfulRequests: 1,
		PeriodMinutes:         1,
		ConcurrencyLimit:      1,
	}

	leave, message := enterGroupRateWindow(42, policy)
	require.NotNil(t, leave)
	assert.Empty(t, message)

	blocked, message := enterGroupRateWindow(42, policy)
	assert.Nil(t, blocked)
	assert.Contains(t, message, "concurrency limit reached")

	leave(true)
	blocked, message = enterGroupRateWindow(42, policy)
	assert.Nil(t, blocked)
	assert.Contains(t, message, "successful request limit reached")
}

func TestEnterGroupRateWindowCountsFailedRequestsTowardTotal(t *testing.T) {
	resetGroupRateState(t)
	policy := setting.GroupPolicy{MaxRequests: 1, PeriodMinutes: 1}

	leave, message := enterGroupRateWindow(7, policy)
	require.NotNil(t, leave)
	assert.Empty(t, message)
	leave(false)

	blocked, message := enterGroupRateWindow(7, policy)
	assert.Nil(t, blocked)
	assert.Contains(t, message, "request limit reached")
}
