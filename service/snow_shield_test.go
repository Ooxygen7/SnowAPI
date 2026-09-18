package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type shieldTestTransport func(*http.Request) (*http.Response, error)

func (f shieldTestTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSnowShieldClearanceIsSignedExpiringAndSeparateFromChallenge(t *testing.T) {
	t.Setenv("SNOW_SHIELD_ENABLED", "true")
	request := httptest.NewRequest("GET", "https://example.test/", nil)
	request.Header.Set("User-Agent", "browser-A")
	for _, tc := range []struct {
		name, purpose, agent string
		ttl                  time.Duration
		tamper, want         bool
	}{
		{"valid", "clearance", "browser-A", time.Hour, false, true},
		{"challenge-is-not-clearance", "challenge", "browser-A", time.Hour, false, false},
		{"expired", "clearance", "browser-A", -time.Minute, false, false},
		{"modified", "clearance", "browser-A", time.Hour, true, false},
		{"other-browser", "clearance", "browser-B", time.Hour, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			value, _ := IssueSnowShieldTicket(request, tc.purpose, tc.ttl, "test-request")
			if tc.tamper {
				value = "x" + value
			}
			r := httptest.NewRequest("GET", "https://example.test/", nil)
			r.Header.Set("User-Agent", tc.agent)
			r.AddCookie(&http.Cookie{Name: SnowShieldClearanceCookie, Value: value})
			assert.Equal(t, tc.want, HasSnowShieldClearance(r))
		})
	}
}

func TestSnowShieldRequiresAllProviderBindings(t *testing.T) {
	t.Setenv("SNOW_SHIELD_HOSTNAME", "api.example.test")
	oldClient := snowShieldHTTPClient
	t.Cleanup(func() { snowShieldHTTPClient = oldClient })
	for _, tc := range []struct {
		name, result string
		status       int
		valid        bool
	}{
		{"valid", `{"success":true,"hostname":"api.example.test","action":"snow_shield","cdata":"request-id"}`, 200, true},
		{"provider-rejected", `{"success":false}`, 200, false},
		{"wrong-host", `{"success":true,"hostname":"evil.test","action":"snow_shield","cdata":"request-id"}`, 200, false},
		{"wrong-action", `{"success":true,"hostname":"api.example.test","action":"login","cdata":"request-id"}`, 200, false},
		{"wrong-challenge", `{"success":true,"hostname":"api.example.test","action":"snow_shield","cdata":"another-id"}`, 200, false},
		{"unavailable", `{}`, 503, false},
		{"malformed", `<html>error</html>`, 200, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			snowShieldHTTPClient = &http.Client{Transport: shieldTestTransport(func(r *http.Request) (*http.Response, error) {
				assert.Equal(t, "https://challenges.cloudflare.com/turnstile/v0/siteverify", r.URL.String())
				require.NoError(t, r.ParseForm())
				assert.Equal(t, "test-token", r.Form.Get("response"))
				return &http.Response{StatusCode: tc.status, Body: io.NopCloser(strings.NewReader(tc.result)), Header: make(http.Header)}, nil
			})}
			err := VerifySnowShieldToken(context.Background(), "test-token", "request-id", "127.0.0.1")
			if tc.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
	require.Error(t, VerifySnowShieldToken(context.Background(), strings.Repeat("a", 2049), "request-id", ""))
}

func TestSnowShieldDistinguishesOutagesWithoutLoggingRawProviderData(t *testing.T) {
	oldClient := snowShieldHTTPClient
	t.Cleanup(func() { snowShieldHTTPClient = oldClient })
	for _, tc := range []struct {
		body, want string
	}{
		{`{"success":false,"error-codes":["internal-error"]}`, ErrSnowShieldUnavailable.Error()},
		{`{"success":false,"error-codes":["timeout-or-duplicate"]}`, "provider: timeout-or-duplicate"},
		{`{"success":false,"error-codes":["untrusted provider content"]}`, "verification rejected"},
		{`not JSON`, ErrSnowShieldUnavailable.Error()},
	} {
		t.Run(tc.want+tc.body, func(t *testing.T) {
			snowShieldHTTPClient = &http.Client{Transport: shieldTestTransport(func(r *http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(tc.body)), Header: make(http.Header)}, nil
			})}
			err := VerifySnowShieldToken(context.Background(), "test-token", "request-id", "127.0.0.1")
			require.EqualError(t, err, tc.want)
			if tc.want == ErrSnowShieldUnavailable.Error() {
				assert.ErrorIs(t, err, ErrSnowShieldUnavailable)
			}
		})
	}
}

func TestSnowShieldCookiesUseSecureBrowserScope(t *testing.T) {
	r := httptest.NewRequest("GET", "https://example.test/", nil)
	value, ticket := IssueSnowShieldTicket(r, "clearance", time.Hour, "")
	require.NotEmpty(t, ticket.ID)
	writer := httptest.NewRecorder()
	SetSnowShieldCookie(writer, SnowShieldClearanceCookie, value, 3600)
	cookies := writer.Result().Cookies()
	require.Len(t, cookies, 1)
	assert.True(t, cookies[0].HttpOnly)
	assert.True(t, cookies[0].Secure)
	assert.Equal(t, http.SameSiteLaxMode, cookies[0].SameSite)
	assert.Empty(t, cookies[0].Domain)
	assert.Equal(t, "/", cookies[0].Path)
}
