package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelCatalogFundingRulesRefreshWithoutPricingCacheMutation(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.Create(&model.Ability{Group: "all", Model: "gpt-4o", ChannelId: 1, Enabled: true}).Error)
	model.InvalidatePricingCache()
	common.OptionMapRWMutex.Lock()
	previous := operation_setting.GetQuotaSetting().ModelFundingSources
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		operation_setting.GetQuotaSetting().ModelFundingSources = previous
		common.OptionMapRWMutex.Unlock()
		model.InvalidatePricingCache()
	})
	for _, source := range []string{"subscription_only", "wallet_only", ""} {
		common.OptionMapRWMutex.Lock()
		operation_setting.GetQuotaSetting().ModelFundingSources = map[string]string{"gpt-4o": source}
		common.OptionMapRWMutex.Unlock()
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/user/model-catalog", nil)
		GetPricing(ctx)
		require.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, "no-store", recorder.Header().Get("Cache-Control"))
		var payload struct {
			Success bool            `json:"success"`
			Data    []model.Pricing `json:"data"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
		require.True(t, payload.Success)
		require.Len(t, payload.Data, 1)
		assert.Equal(t, source, payload.Data[0].FundingSource)
		if source == "" {
			assert.NotContains(t, recorder.Body.String(), "funding_source")
		}
		for _, cached := range model.GetPricing() {
			assert.Empty(t, cached.FundingSource)
		}
	}
}
