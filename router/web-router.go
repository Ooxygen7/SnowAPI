package router

import (
	"embed"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

const (
	externalFrontendHeader         = "X-SnowAPI-Static-Frontend"
	externalFrontendInternalPrefix = "/__snowapi_frontend__"
)

type externalFrontend struct {
	root string
}

// ThemeAssets holds the embedded frontend assets for both themes.
type ThemeAssets struct {
	DefaultBuildFS   embed.FS
	DefaultIndexPage []byte
	ClassicBuildFS   embed.FS
	ClassicIndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets ThemeAssets) {
	defaultFS := common.EmbedFolder(assets.DefaultBuildFS, "web/default/dist")
	classicFS := common.EmbedFolder(assets.ClassicBuildFS, "web/classic/dist")
	themeFS := common.NewThemeAwareFS(defaultFS, classicFS)
	external := newExternalFrontend(os.Getenv("EXTERNAL_FRONTEND_ROOT"))

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	if external != nil {
		router.Use(external.middleware())
	}
	router.Use(middleware.Cache())
	router.Use(static.Serve("/", themeFS))
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		if isRelayStylePath(c.Request.RequestURI) || (c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead) {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		if external != nil && external.requestEnabled(c) {
			if redirectURI, ok := external.redirectURI(common.GetTheme(), "/index.html"); ok {
				c.Header("X-Accel-Redirect", redirectURI)
			}
		}
		if common.GetTheme() == "classic" {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.ClassicIndexPage)
		} else {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.DefaultIndexPage)
		}
	})
}

func isRelayStylePath(requestURI string) bool {
	requestPath := strings.SplitN(requestURI, "?", 2)[0]
	for _, prefix := range []string{"/v1", "/api", "/assets", "/pg", "/mj", "/suno"} {
		if requestPath == prefix || strings.HasPrefix(requestPath, prefix+"/") {
			return true
		}
	}
	return strings.HasSuffix(requestPath, "/mj") || strings.Contains(requestPath, "/mj/")
}

func newExternalFrontend(root string) *externalFrontend {
	root = strings.TrimSpace(root)
	if root == "" {
		return nil
	}

	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return nil
	}
	if resolvedRoot, resolveErr := filepath.EvalSymlinks(absoluteRoot); resolveErr == nil {
		absoluteRoot = resolvedRoot
	}
	return &externalFrontend{root: absoluteRoot}
}

func (e *externalFrontend) requestEnabled(c *gin.Context) bool {
	if c.GetHeader(externalFrontendHeader) != "1" {
		return false
	}
	return c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead
}

func (e *externalFrontend) middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !e.requestEnabled(c) {
			c.Next()
			return
		}

		redirectURI, ok := e.redirectURI(common.GetTheme(), c.Request.URL.Path)
		if !ok {
			c.Next()
			return
		}

		c.Header("X-Accel-Redirect", redirectURI)
		c.Status(http.StatusOK)
		c.Abort()
	}
}

func (e *externalFrontend) redirectURI(theme string, requestPath string) (string, bool) {
	if theme != "default" && theme != "classic" {
		return "", false
	}

	relativePath := strings.TrimPrefix(requestPath, "/")
	if relativePath == "" || strings.Contains(relativePath, "\\") || !fs.ValidPath(relativePath) {
		return "", false
	}

	targetPath := filepath.Join(e.root, "current", theme, filepath.FromSlash(relativePath))
	resolvedTarget, err := filepath.EvalSymlinks(targetPath)
	if err != nil {
		return "", false
	}
	relativeToRoot, err := filepath.Rel(e.root, resolvedTarget)
	if err != nil || filepath.IsAbs(relativeToRoot) || relativeToRoot == ".." || strings.HasPrefix(relativeToRoot, ".."+string(os.PathSeparator)) {
		return "", false
	}
	info, err := os.Stat(resolvedTarget)
	if err != nil || !info.Mode().IsRegular() {
		return "", false
	}

	internalPath := path.Join(externalFrontendInternalPrefix, theme, relativePath)
	return (&url.URL{Path: internalPath}).EscapedPath(), true
}
