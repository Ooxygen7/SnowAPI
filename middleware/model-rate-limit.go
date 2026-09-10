package middleware

import (
	"errors"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

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

const GroupRateLeaseIDKey = "group_rate_lease_id"
const GroupRateTPMLimitKey = model.GroupRateTPMLimitKey

// Task polling does not create a new generation and must remain available
// when the submission allowance is exhausted. Provider converters run first
// and normalize result queries (including Jimeng's POST query) to GET.
func TaskSubmissionRateLimit() gin.HandlerFunc {
	limit := ModelRequestRateLimit()
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead {
			c.Next()
			return
		}
		limit(c)
	}
}

func ModelRequestRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		group := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
		policy, enabled := policyForRelayGroup(group)
		if !enabled || (policy.MaxRequests == 0 && policy.MaxSuccessfulRequests == 0 && policy.ConcurrencyLimit == 0 && policy.TPMLimit == 0) {
			c.Next()
			return
		}
		lease, err := model.AcquireGroupRateLease(c.GetInt("id"), policy)
		if err != nil {
			if errors.Is(err, model.ErrGroupRateLimited) {
				abortWithOpenAiMessage(c, http.StatusTooManyRequests, err.Error())
			} else {
				common.SysError("group rate admission failed: " + err.Error())
				abortWithOpenAiMessage(c, http.StatusInternalServerError, "rate_limit_check_failed")
			}
			return
		}
		c.Set(GroupRateLeaseIDKey, lease.Id)
		c.Set(GroupRateTPMLimitKey, policy.TPMLimit)
		// Reject an already exhausted TPM window even for non-text task routes.
		if policy.TPMLimit > 0 {
			err = model.ReserveGroupRateTokens(lease.Id, lease.UserId, 0, int64(policy.TPMLimit))
			if err != nil {
				_ = model.CompleteGroupRateLease(lease, false, nil, policy.PeriodMinutes)
				if errors.Is(err, model.ErrGroupRateLimited) {
					abortWithOpenAiMessage(c, http.StatusTooManyRequests, err.Error())
				} else {
					abortWithOpenAiMessage(c, http.StatusInternalServerError, "rate_limit_check_failed")
				}
				return
			}
		}
		done := make(chan struct{})
		go func() {
			ticker := time.NewTicker(30 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					if err := model.RenewGroupRateLease(lease.Id); err != nil {
						common.SysError("group rate lease renewal failed: " + err.Error())
					}
				}
			}
		}()
		defer func() {
			close(done)
			var actual *int64
			if value, exists := c.Get(model.GroupRateActualTokensKey); exists {
				if tokens, ok := value.(int64); ok {
					actual = &tokens
				}
			}
			if err := model.CompleteGroupRateLease(lease, c.Writer.Status() < http.StatusBadRequest, actual, policy.PeriodMinutes); err != nil {
				common.SysError("group rate completion failed: " + err.Error())
			}
		}()
		c.Next()
	}
}
