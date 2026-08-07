package router

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExternalFrontendRedirectURI(t *testing.T) {
	root := t.TempDir()
	defaultRoot := filepath.Join(root, "current", "default")
	classicRoot := filepath.Join(root, "current", "classic")
	require.NoError(t, os.MkdirAll(defaultRoot, 0o755))
	require.NoError(t, os.MkdirAll(classicRoot, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(defaultRoot, "index.html"), []byte("default"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(defaultRoot, "logo space.png"), []byte("logo"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(classicRoot, "index.html"), []byte("classic"), 0o644))

	external := newExternalFrontend(root)
	require.NotNil(t, external)

	redirectURI, ok := external.redirectURI("default", "/index.html")
	assert.True(t, ok)
	assert.Equal(t, "/__snowapi_frontend__/default/index.html", redirectURI)

	redirectURI, ok = external.redirectURI("classic", "/index.html")
	assert.True(t, ok)
	assert.Equal(t, "/__snowapi_frontend__/classic/index.html", redirectURI)

	redirectURI, ok = external.redirectURI("default", "/logo space.png")
	assert.True(t, ok)
	assert.Equal(t, "/__snowapi_frontend__/default/logo%20space.png", redirectURI)

	_, ok = external.redirectURI("default", "/missing.js")
	assert.False(t, ok)
	_, ok = external.redirectURI("default", "/../index.html")
	assert.False(t, ok)
	_, ok = external.redirectURI("other", "/index.html")
	assert.False(t, ok)
}

func TestExternalFrontendMiddlewareRequiresActivationHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	root := t.TempDir()
	defaultRoot := filepath.Join(root, "current", "default")
	require.NoError(t, os.MkdirAll(defaultRoot, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(defaultRoot, "logo.png"), []byte("logo"), 0o644))

	originalTheme := common.GetTheme()
	common.SetTheme("default")
	t.Cleanup(func() { common.SetTheme(originalTheme) })

	external := newExternalFrontend(root)
	require.NotNil(t, external)
	engine := gin.New()
	engine.Use(external.middleware())
	engine.GET("/logo.png", func(c *gin.Context) {
		c.Status(http.StatusTeapot)
	})

	disabledRequest := httptest.NewRequest(http.MethodGet, "/logo.png", nil)
	disabledRecorder := httptest.NewRecorder()
	engine.ServeHTTP(disabledRecorder, disabledRequest)
	assert.Equal(t, http.StatusTeapot, disabledRecorder.Code)
	assert.Empty(t, disabledRecorder.Header().Get("X-Accel-Redirect"))

	enabledRequest := httptest.NewRequest(http.MethodGet, "/logo.png", nil)
	enabledRequest.Header.Set(externalFrontendHeader, "1")
	enabledRecorder := httptest.NewRecorder()
	engine.ServeHTTP(enabledRecorder, enabledRequest)
	assert.Equal(t, http.StatusOK, enabledRecorder.Code)
	assert.Equal(t, "/__snowapi_frontend__/default/logo.png", enabledRecorder.Header().Get("X-Accel-Redirect"))
}

func TestRelayStylePathIncludesRetiredRelayNamespaces(t *testing.T) {
	tests := map[string]bool{
		"/api/status":          true,
		"/v1/files":            true,
		"/pg/chat/completions": true,
		"/mj/submit/imagine":   true,
		"/relax/mj/task/1":     true,
		"/suno/fetch/1":        true,
		"/models":              false,
		"/mjpeg":               false,
	}

	for requestURI, expected := range tests {
		t.Run(requestURI, func(t *testing.T) {
			assert.Equal(t, expected, isRelayStylePath(requestURI))
		})
	}
}
