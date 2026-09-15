package setting

import (
	"strings"
	"sync"
)

var defaultGroup = "Free"
var defaultGroupMutex sync.RWMutex

func GetDefaultGroup() string {
	defaultGroupMutex.RLock()
	defer defaultGroupMutex.RUnlock()
	return defaultGroup
}

func SetDefaultGroup(name string) {
	if strings.TrimSpace(name) == "" {
		return
	}
	defaultGroupMutex.Lock()
	defaultGroup = name
	defaultGroupMutex.Unlock()
}
