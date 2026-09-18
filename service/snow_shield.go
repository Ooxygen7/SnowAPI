package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/google/uuid"
)

const SnowShieldAction = "snow_shield"
const SnowShieldClearanceCookie = "__Host-snow_shield"
const SnowShieldChallengeCookie = "__Host-snow_challenge"
const SnowShieldClearanceTTL = time.Hour
const SnowShieldChallengeTTL = 5 * time.Minute

type SnowShieldTicket struct {
	ID      string `json:"id"`
	Expires int64  `json:"expires"`
	Agent   string `json:"agent"`
}

var snowShieldHTTPClient = &http.Client{Timeout: 10 * time.Second}

func SnowShieldEnabled() bool {
	return os.Getenv("SNOW_SHIELD_ENABLED") == "true"
}

func ValidateSnowShieldSettings() error {
	if !SnowShieldEnabled() {
		return nil
	}
	host := os.Getenv("SNOW_SHIELD_HOSTNAME")
	if host == "" || strings.ContainsAny(host, "/:@?# ") || !common.SessionCookieSecure {
		return errors.New("SnowShield requires SNOW_SHIELD_HOSTNAME and secure session cookies")
	}
	if common.TurnstileSiteKey == "" || common.TurnstileSecretKey == "" {
		return errors.New("SnowShield requires configured Turnstile keys")
	}
	return nil
}

func snowShieldAgent(request *http.Request) string {
	sum := sha256.Sum256([]byte(request.UserAgent()))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// These purpose-bound cookies prove a browser check, never an account identity.
func IssueSnowShieldTicket(request *http.Request, purpose string, ttl time.Duration, id string) (string, SnowShieldTicket) {
	if id == "" {
		id = uuid.NewString()
	}
	ticket := SnowShieldTicket{ID: id, Expires: time.Now().Add(ttl).Unix(), Agent: snowShieldAgent(request)}
	encoded, _ := common.Marshal(ticket)
	payload := base64.RawURLEncoding.EncodeToString(encoded)
	mac := hmac.New(sha256.New, []byte(common.SessionSecret))
	mac.Write([]byte("snow-shield:v1:" + purpose + ":" + payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), ticket
}

func ReadSnowShieldTicket(request *http.Request, cookieName, purpose string) (SnowShieldTicket, bool) {
	var ticket SnowShieldTicket
	cookie, err := request.Cookie(cookieName)
	if err != nil || len(cookie.Value) > 1024 {
		return ticket, false
	}
	parts := strings.Split(cookie.Value, ".")
	if len(parts) != 2 {
		return ticket, false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ticket, false
	}
	mac := hmac.New(sha256.New, []byte(common.SessionSecret))
	mac.Write([]byte("snow-shield:v1:" + purpose + ":" + parts[0]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return ticket, false
	}
	data, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || common.Unmarshal(data, &ticket) != nil {
		return ticket, false
	}
	return ticket, ticket.ID != "" && ticket.Expires > time.Now().Unix() && ticket.Agent == snowShieldAgent(request)
}

func HasSnowShieldClearance(request *http.Request) bool {
	if !SnowShieldEnabled() {
		return false
	}
	_, ok := ReadSnowShieldTicket(request, SnowShieldClearanceCookie, "clearance")
	return ok
}

func SetSnowShieldCookie(writer http.ResponseWriter, name, value string, maxAge int) {
	http.SetCookie(writer, &http.Cookie{Name: name, Value: value, Path: "/", Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
}

// Verify the hostname, action, and challenge ID as well as the provider verdict.
func VerifySnowShieldToken(ctx context.Context, token, challengeID, remoteIP string) error {
	if len(token) == 0 || len(token) > 2048 {
		return errors.New("invalid token")
	}
	form := url.Values{"secret": {common.TurnstileSecretKey}, "response": {token}, "remoteip": {remoteIP}}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://challenges.cloudflare.com/turnstile/v0/siteverify", strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := snowShieldHTTPClient.Do(request)
	if err != nil {
		return errors.New("verification service unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return errors.New("verification service unavailable")
	}
	var result struct {
		Success  bool   `json:"success"`
		Hostname string `json:"hostname"`
		Action   string `json:"action"`
		CData    string `json:"cdata"`
	}
	if common.DecodeJson(io.LimitReader(response.Body, 16384), &result) != nil || !result.Success || !strings.EqualFold(result.Hostname, os.Getenv("SNOW_SHIELD_HOSTNAME")) || result.Action != SnowShieldAction || result.CData != challengeID {
		return errors.New("verification rejected")
	}
	return nil
}
