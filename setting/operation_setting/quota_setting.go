package operation_setting

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

const ModelFundingSourcesOption = "quota_setting.model_funding_sources"

type QuotaSetting struct {
	EnableFreeModelPreConsume bool              `json:"enable_free_model_pre_consume"` // 是否对免费模型启用预消耗
	ModelFundingSources       map[string]string `json:"model_funding_sources"`
}

// 默认配置
var quotaSetting = QuotaSetting{
	EnableFreeModelPreConsume: true,
	ModelFundingSources:       map[string]string{},
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("quota_setting", &quotaSetting)
}

func GetQuotaSetting() *QuotaSetting {
	return &quotaSetting
}

// Exact public model IDs are used, before upstream model mapping. The option
// map lock is also held by runtime configuration updates and database reloads.
func GetModelFundingSource(modelName string) string {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	return quotaSetting.ModelFundingSources[modelName]
}

func ParseModelFundingSources(value string) (map[string]string, error) {
	var rules map[string]string
	if err := common.UnmarshalJsonStr(value, &rules); err != nil || rules == nil {
		return nil, fmt.Errorf("model funding rules must be a JSON object")
	}
	for name, source := range rules {
		if name == "" || strings.TrimSpace(name) != name {
			return nil, fmt.Errorf("model funding rules require non-empty, exact model IDs")
		}
		if source != "subscription_only" && source != "wallet_only" {
			return nil, fmt.Errorf("invalid funding source for model %q", name)
		}
	}
	return rules, nil
}
