package controller

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSelfRelayBanResponseDoesNotExposeAdministrativeEvidence(t *testing.T) {
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open("file:relay-ban-controller?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })
	require.NoError(t, db.AutoMigrate(&model.UserRelayBan{}))
	now := time.Now().Unix()
	require.NoError(t, db.Create(&model.UserRelayBan{
		UserID:    321,
		Source:    model.RelayBanSourceAutomatic,
		Reason:    "sensitive administrator reason",
		StartsAt:  now - 60,
		Evidence:  `{"observations":[{"ip":"8.8.8.8","country_iso":"US","asn_number":15169}]}`,
		Version:   1,
		CreatedAt: now - 60,
		UpdatedAt: now - 60,
	}).Error)

	gin.SetMode(gin.TestMode)
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Set("id", 321)
	GetSelfRelayBan(context)

	body := response.Body.String()
	assert.Contains(t, body, `"active":true`)
	assert.NotContains(t, body, `"evidence"`)
	assert.NotContains(t, body, `"country_iso"`)
	assert.NotContains(t, body, `"asn_number"`)
	assert.NotContains(t, body, `"reason"`)
	assert.NotContains(t, body, `"actor_user_id"`)
}
