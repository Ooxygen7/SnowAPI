package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

type groupRateUserState struct {
	Requests    []time.Time
	Successes   []time.Time
	Concurrency int
}

var groupRateState = struct {
	sync.Mutex
	Users map[int]*groupRateUserState
}{Users: make(map[int]*groupRateUserState)}

func pruneRequestTimes(values []time.Time, cutoff time.Time) []time.Time {
	first := 0
	for first < len(values) && values[first].Before(cutoff) {
		first++
	}
	if first == 0 {
		return values
	}
	remaining := append([]time.Time(nil), values[first:]...)
	return remaining
}

func policyForRelayGroup(group string) (setting.GroupPolicy, bool) {
	if setting.GroupPoliciesConfigured() {
		if policy, ok := setting.GetGroupPolicy(group); ok {
			return policy, true
		}
	}
	if !setting.ModelRequestRateLimitEnabled {
		return setting.GroupPolicy{}, false
	}
	policy := setting.GroupPolicy{
		MaxRequests:           setting.ModelRequestRateLimitCount,
		MaxSuccessfulRequests: setting.ModelRequestRateLimitSuccessCount,
		PeriodMinutes:         setting.ModelRequestRateLimitDurationMinutes,
	}
	if total, success, ok := setting.GetGroupRateLimit(group); ok {
		policy.MaxRequests = total
		policy.MaxSuccessfulRequests = success
	}
	if policy.PeriodMinutes < 1 {
		policy.PeriodMinutes = 1
	}
	return policy, true
}

func enterGroupRateWindow(userID int, policy setting.GroupPolicy) (func(bool), string) {
	now := time.Now()
	cutoff := now.Add(-time.Duration(policy.PeriodMinutes) * time.Minute)
	groupRateState.Lock()
	state := groupRateState.Users[userID]
	if state == nil {
		state = &groupRateUserState{}
		groupRateState.Users[userID] = state
	}
	state.Requests = pruneRequestTimes(state.Requests, cutoff)
	state.Successes = pruneRequestTimes(state.Successes, cutoff)
	if policy.MaxRequests > 0 && len(state.Requests) >= policy.MaxRequests {
		groupRateState.Unlock()
		return nil, fmt.Sprintf("request limit reached: at most %d requests every %d minutes", policy.MaxRequests, policy.PeriodMinutes)
	}
	if policy.MaxSuccessfulRequests > 0 && len(state.Successes) >= policy.MaxSuccessfulRequests {
		groupRateState.Unlock()
		return nil, fmt.Sprintf("successful request limit reached: at most %d requests every %d minutes", policy.MaxSuccessfulRequests, policy.PeriodMinutes)
	}
	if policy.ConcurrencyLimit > 0 && state.Concurrency >= policy.ConcurrencyLimit {
		groupRateState.Unlock()
		return nil, fmt.Sprintf("concurrency limit reached: at most %d concurrent requests", policy.ConcurrencyLimit)
	}
	state.Requests = append(state.Requests, now)
	state.Concurrency++
	groupRateState.Unlock()

	var once sync.Once
	return func(success bool) {
		once.Do(func() {
			groupRateState.Lock()
			current := groupRateState.Users[userID]
			if current != nil {
				if current.Concurrency > 0 {
					current.Concurrency--
				}
				if success {
					current.Successes = append(current.Successes, time.Now())
				}
			}
			groupRateState.Unlock()
		})
	}, ""
}

func ModelRequestRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		group := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
		policy, enabled := policyForRelayGroup(group)
		if !enabled {
			c.Next()
			return
		}
		userID := c.GetInt("id")
		if policy.TPMLimit > 0 {
			usedTokens, err := model.SumUserTokensSince(userID, common.GetTimestamp()-60)
			if err != nil {
				common.SysError(fmt.Sprintf("failed to read TPM usage for user %d: %v", userID, err))
				abortWithOpenAiMessage(c, http.StatusInternalServerError, "rate_limit_check_failed")
				return
			}
			if usedTokens >= int64(policy.TPMLimit) {
				abortWithOpenAiMessage(c, http.StatusTooManyRequests, fmt.Sprintf("TPM limit reached: at most %d tokens per minute", policy.TPMLimit))
				return
			}
		}
		leave, message := enterGroupRateWindow(userID, policy)
		if leave == nil {
			abortWithOpenAiMessage(c, http.StatusTooManyRequests, message)
			return
		}
		defer func() { leave(c.Writer.Status() < http.StatusBadRequest) }()
		c.Next()
	}
}
