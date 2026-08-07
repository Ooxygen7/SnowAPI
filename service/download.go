package service

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

func DoDownloadRequest(originUrl string, reason ...string) (resp *http.Response, err error) {
	if err := ValidateSSRFProtectedFetchURL(originUrl); err != nil {
		return nil, fmt.Errorf("request reject: %v", err)
	}

	common.SysLog(fmt.Sprintf("downloading from origin: %s, reason: %s", common.MaskSensitiveInfo(originUrl), strings.Join(reason, ", ")))
	return GetSSRFProtectedHTTPClient().Get(originUrl)
}
