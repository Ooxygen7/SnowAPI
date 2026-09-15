package i18n

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

func TestJapaneseMessagesCoverPublicMessageCatalog(t *testing.T) {
	require.NoError(t, Init())
	english, err := localeFS.ReadFile("locales/en.yaml")
	require.NoError(t, err)
	japanese, err := localeFS.ReadFile("locales/ja.yaml")
	require.NoError(t, err)
	var expected, actual map[string]string
	require.NoError(t, yaml.Unmarshal(english, &expected))
	require.NoError(t, yaml.Unmarshal(japanese, &actual))
	require.Len(t, actual, len(expected))
	for key := range expected {
		assert.NotEmpty(t, actual[key], "Japanese translation missing: %s", key)
	}
	assert.Equal(t, LangJa, ParseAcceptLanguage("ja-JP,ja;q=0.9,en;q=0.5"))
	assert.Equal(t, "ユーザー名またはパスワードが正しくないか、ユーザーが利用停止中です", Translate(LangJa, "user.username_or_password_error"))
	assert.Equal(t, "リクエスト上限に達しました：5 分間に最大 30 件です", Translate(LangJa, "rate_limit.reached", map[string]any{"Max": 30, "Minutes": 5}))
	assert.Equal(t, "この GitHub アカウントはすでに連携されています", Translate(LangJa, "oauth.already_bound", map[string]any{"Provider": "GitHub"}))
}
