package controller

import (
	"errors"
	"io"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const maxManualRelayBanDurationSeconds = int64(10 * 365 * 24 * 60 * 60)

type manualRelayBanRequest struct {
	Reason          string `json:"reason"`
	Permanent       bool   `json:"permanent"`
	DurationSeconds int64  `json:"duration_seconds"`
}

type revokeRelayBanRequest struct {
	Reason string `json:"reason"`
}

func GetSelfRelayBan(c *gin.Context) {
	now := model.GetDBTimestamp()
	ban, err := model.GetActiveUserRelayBan(c.GetInt("id"), now)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if ban == nil {
		common.ApiSuccess(c, gin.H{
			"active": false,
			"code":   "user_relay_banned",
		})
		return
	}
	// Deliberately omit IP, country, ASN, evidence, reason, and actor data from
	// the ordinary-user response.
	common.ApiSuccess(c, gin.H{
		"active":     true,
		"code":       "user_relay_banned",
		"starts_at":  ban.StartsAt,
		"expires_at": ban.ExpiresAt,
	})
}

func ListUserRelayBans(c *gin.Context) {
	page := boundedPositiveIntQuery(c, "page", 1, 1, 1_000_000)
	pageSize := boundedPositiveIntQuery(c, "page_size", 20, 1, 100)
	result, err := model.ListUserRelayBans(model.UserRelayBanListQuery{
		Page:     page,
		PageSize: pageSize,
		Keyword:  c.Query("query"),
		Status:   c.Query("status"),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func GetRelayBanEvents(c *gin.Context) {
	userID, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userID <= 0 {
		common.ApiErrorMsg(c, "invalid user ID")
		return
	}
	limit := boundedPositiveIntQuery(c, "limit", 100, 1, 500)
	events, err := model.GetUserRelayBanEvents(userID, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, events)
}

func GetRelayBanReadiness(c *gin.Context) {
	common.ApiSuccess(c, service.GetIPBanReadiness())
}

func ApplyManualRelayBan(c *gin.Context) {
	userID, ok := relayBanTargetUser(c)
	if !ok {
		return
	}
	var request manualRelayBanRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiErrorMsg(c, "invalid request")
		return
	}
	expiresAt, ok := manualRelayBanExpiry(c, request)
	if !ok {
		return
	}
	reason := strings.TrimSpace(request.Reason)
	if reason == "" {
		reason = "manual administrator relay ban"
	}
	ban, err := model.ApplyManualRelayBan(userID, c.GetInt("id"), reason, expiresAt)
	if err != nil {
		relayBanMutationError(c, err)
		return
	}
	recordManageAuditFor(c, userID, "relay_ban.apply", map[string]interface{}{
		"target_user_id": userID,
		"expires_at":     ban.ExpiresAt,
		"source":         ban.Source,
		"version":        ban.Version,
	})
	common.ApiSuccess(c, ban)
}

func ExtendRelayBan(c *gin.Context) {
	userID, ok := relayBanTargetUser(c)
	if !ok {
		return
	}
	var request manualRelayBanRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiErrorMsg(c, "invalid request")
		return
	}
	if !request.Permanent && (request.DurationSeconds <= 0 || request.DurationSeconds > maxManualRelayBanDurationSeconds) {
		common.ApiErrorMsg(c, "duration_seconds is out of range")
		return
	}
	ban, err := model.ExtendUserRelayBan(
		userID,
		c.GetInt("id"),
		request.DurationSeconds,
		request.Permanent,
		request.Reason,
	)
	if err != nil {
		relayBanMutationError(c, err)
		return
	}
	recordManageAuditFor(c, userID, "relay_ban.extend", map[string]interface{}{
		"target_user_id": userID,
		"expires_at":     ban.ExpiresAt,
		"version":        ban.Version,
	})
	common.ApiSuccess(c, ban)
}

func RevokeRelayBan(c *gin.Context) {
	userID, ok := relayBanTargetUser(c)
	if !ok {
		return
	}
	var request revokeRelayBanRequest
	if err := c.ShouldBindJSON(&request); err != nil && !errors.Is(err, io.EOF) {
		common.ApiErrorMsg(c, "invalid request")
		return
	}
	ban, err := model.RevokeUserRelayBan(userID, c.GetInt("id"), request.Reason)
	if err != nil {
		relayBanMutationError(c, err)
		return
	}
	recordManageAuditFor(c, userID, "relay_ban.revoke", map[string]interface{}{
		"target_user_id": userID,
		"revoked_at":     ban.RevokedAt,
		"version":        ban.Version,
	})
	common.ApiSuccess(c, ban)
}

func relayBanTargetUser(c *gin.Context) (int, bool) {
	userID, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userID <= 0 {
		common.ApiErrorMsg(c, "invalid user ID")
		return 0, false
	}
	if _, err := model.GetUserById(userID, false); err != nil {
		common.ApiErrorMsg(c, "user not found")
		return 0, false
	}
	return userID, true
}

func manualRelayBanExpiry(c *gin.Context, request manualRelayBanRequest) (int64, bool) {
	if request.Permanent || request.DurationSeconds == 0 {
		return 0, true
	}
	if request.DurationSeconds < 0 || request.DurationSeconds > maxManualRelayBanDurationSeconds {
		common.ApiErrorMsg(c, "duration_seconds is out of range")
		return 0, false
	}
	return model.GetDBTimestamp() + request.DurationSeconds, true
}

func relayBanMutationError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, model.ErrRelayBanAlreadyActive):
		common.ApiErrorMsg(c, "user already has an active relay ban")
	case errors.Is(err, model.ErrRelayBanNotActive):
		common.ApiErrorMsg(c, "user does not have an active relay ban")
	case errors.Is(err, model.ErrRelayBanConflict):
		common.ApiErrorMsg(c, "relay ban changed concurrently; refresh and retry")
	default:
		common.ApiError(c, err)
	}
}
