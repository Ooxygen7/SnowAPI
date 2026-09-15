package controller

import (
	"context"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// RegisterScheduledSystemTasks wires the periodic channel test, upstream model
// update, and async video task polling jobs into the
// system task framework so a DB lease dedups execution across multiple master
// instances and each run is recorded as one task row. Call this before
// service.StartSystemTaskRunner.
func RegisterScheduledSystemTasks() {
	service.RegisterSystemTaskHandler(channelTestHandler{})
	service.RegisterSystemTaskHandler(modelHealthProbeHandler{})
	service.RegisterSystemTaskHandler(modelUpdateHandler{})
	service.RegisterSystemTaskHandler(asyncTaskPollHandler{})
}

// modelHealthProbeHandler sends one tiny request to each chat-capable model in
// the model square. The system task lease ensures only one node probes every
// model during each 12-minute interval.
type modelHealthProbeHandler struct{}

func (modelHealthProbeHandler) Type() string { return model.SystemTaskTypeModelHealth }

func (modelHealthProbeHandler) Enabled() bool { return true }

func (modelHealthProbeHandler) Interval() time.Duration { return 12 * time.Minute }

func (modelHealthProbeHandler) NewPayload() any { return nil }

type modelHealthProbeSummary struct {
	Tested    int `json:"tested"`
	Succeeded int `json:"succeeded"`
	Failed    int `json:"failed"`
	Skipped   int `json:"skipped"`
}

func (modelHealthProbeHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	testUserID, err := resolveChannelTestUserID(nil)
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	user, err := model.GetUserCache(testUserID)
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}

	summary := modelHealthProbeSummary{}
	for _, pricing := range model.GetPricing() {
		if ctx.Err() != nil {
			finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, summary, ctx.Err())
			return
		}

		endpointType, ok := selectModelHealthProbeEndpoint(pricing.SupportedEndpointTypes)
		if !ok {
			summary.Skipped++
			continue
		}
		group := selectModelHealthProbeGroup(pricing.EnableGroup, user.Group)
		endpointInfo, _ := common.GetDefaultEndpointInfo(endpointType)
		channel, channelErr := model.GetChannel(group, pricing.ModelName, 0, endpointInfo.Path)
		summary.Tested++
		if channelErr != nil || channel == nil {
			summary.Failed++
			if recordErr := model.RecordChannelModelHealth(0, pricing.ModelName, false, true, time.Now()); recordErr != nil {
				common.SysError(fmt.Sprintf("failed to record model health probe for %s: %v", pricing.ModelName, recordErr))
			}
			continue
		}

		probeCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
		result := testChannel(probeCtx, channel, testUserID, pricing.ModelName, string(endpointType), false)
		cancel()
		success := result.localErr == nil && result.newAPIError == nil
		if success {
			summary.Succeeded++
		} else {
			summary.Failed++
		}
		if recordErr := model.RecordChannelModelHealth(channel.Id, pricing.ModelName, success, true, time.Now()); recordErr != nil {
			common.SysError(fmt.Sprintf("failed to record model health probe for %s: %v", pricing.ModelName, recordErr))
		}
	}

	if err := model.DeleteExpiredModelHealth(time.Now()); err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, summary, err)
		return
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

func selectModelHealthProbeEndpoint(endpoints []constant.EndpointType) (constant.EndpointType, bool) {
	preferred := []constant.EndpointType{
		constant.EndpointTypeOpenAI,
		constant.EndpointTypeOpenAIResponse,
		constant.EndpointTypeOpenAIResponseCompact,
		constant.EndpointTypeAnthropic,
		constant.EndpointTypeGemini,
	}
	for _, candidate := range preferred {
		for _, endpoint := range endpoints {
			if endpoint == candidate {
				return candidate, true
			}
		}
	}
	return "", false
}

func selectModelHealthProbeGroup(groups []string, userGroup string) string {
	for _, group := range groups {
		if group == userGroup {
			return group
		}
	}
	for _, group := range groups {
		if group == "all" {
			if userGroup != "" {
				return userGroup
			}
			return setting.GetDefaultGroup()
		}
	}
	for _, group := range groups {
		if group == setting.GetDefaultGroup() {
			return group
		}
	}
	if len(groups) > 0 {
		return groups[0]
	}
	if userGroup != "" {
		return userGroup
	}
	return setting.GetDefaultGroup()
}

// channelTestHandler runs the scheduled "test all channels" job. Enablement and
// cadence still come from the monitor settings; only the execution path moved
// into the system task runner.
type channelTestHandler struct{}

func (channelTestHandler) Type() string { return model.SystemTaskTypeChannelTest }

func (channelTestHandler) Enabled() bool {
	return operation_setting.GetMonitorSetting().AutoTestChannelEnabled
}

func (channelTestHandler) Interval() time.Duration {
	minutes := operation_setting.GetMonitorSetting().AutoTestChannelMinutes
	if minutes <= 0 {
		minutes = 10
	}
	return time.Duration(minutes * float64(time.Minute))
}

func (channelTestHandler) NewPayload() any { return nil }

// channelTestTaskPayload controls one channel_test run. A nil/empty payload is a
// scheduled run, which uses the configured monitor ChannelTestMode and does not
// notify. A manual "test all channels" trigger sets Mode=scheduled_all and
// Notify=true to reproduce the legacy manual behavior (test every channel and
// notify root on completion).
type channelTestTaskPayload struct {
	Mode   string `json:"mode,omitempty"`
	Notify bool   `json:"notify,omitempty"`
}

func (channelTestHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	payload := channelTestTaskPayload{}
	if err := task.DecodePayload(&payload); err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	summary, err := runChannelTestTask(ctx, payload.Mode, payload.Notify, service.NewSystemTaskProgressReporter(task, runnerID))
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

// modelUpdateHandler runs the scheduled upstream model update detection job.
type modelUpdateHandler struct{}

func (modelUpdateHandler) Type() string { return model.SystemTaskTypeModelUpdate }

func (modelUpdateHandler) Enabled() bool {
	return common.GetEnvOrDefaultBool("CHANNEL_UPSTREAM_MODEL_UPDATE_TASK_ENABLED", true)
}

func (modelUpdateHandler) Interval() time.Duration {
	intervalMinutes := common.GetEnvOrDefault(
		"CHANNEL_UPSTREAM_MODEL_UPDATE_TASK_INTERVAL_MINUTES",
		channelUpstreamModelUpdateTaskDefaultIntervalMinutes,
	)
	if intervalMinutes < 1 {
		intervalMinutes = channelUpstreamModelUpdateTaskDefaultIntervalMinutes
	}
	return time.Duration(intervalMinutes) * time.Minute
}

func (modelUpdateHandler) NewPayload() any { return nil }

// modelUpdateTaskPayload controls one model_update run. A scheduled run
// (Manual=false) respects the per-channel minimum check interval and may
// auto-apply detected models when a channel has auto-sync enabled. A manual
// "detect all" trigger sets Manual=true to reproduce the legacy detect-all
// semantics: force a re-check regardless of the interval and never auto-apply,
// so the admin reviews and applies changes explicitly.
type modelUpdateTaskPayload struct {
	Manual bool `json:"manual,omitempty"`
}

func (modelUpdateHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	payload := modelUpdateTaskPayload{}
	if err := task.DecodePayload(&payload); err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	summary := runChannelUpstreamModelUpdateTaskOnce(ctx, payload.Manual, !payload.Manual, service.NewSystemTaskProgressReporter(task, runnerID))
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

// asyncTaskPollHandler runs one async video-task polling pass per
// scheduled run. Enabled() folds in the unfinished
// task existence check so an idle system schedules no rows.
type asyncTaskPollHandler struct{}

func (asyncTaskPollHandler) Type() string { return model.SystemTaskTypeAsyncTaskPoll }

func (asyncTaskPollHandler) Enabled() bool {
	return constant.UpdateTask && model.HasUnfinishedSyncTasks()
}

func (asyncTaskPollHandler) Interval() time.Duration { return 15 * time.Second }

func (asyncTaskPollHandler) NewPayload() any { return nil }

func (asyncTaskPollHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	summary := service.RunTaskPollingOnce(ctx, service.NewSystemTaskProgressReporter(task, runnerID))
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

func finishSystemTaskHandler(task *model.SystemTask, runnerID string, status model.SystemTaskStatus, result any, runErr error) {
	errorMessage := ""
	if runErr != nil {
		errorMessage = runErr.Error()
	}
	if err := model.FinishSystemTask(task.TaskID, runnerID, status, result, errorMessage); err != nil {
		common.SysLog(fmt.Sprintf("system task %s failed to persist result: %v", task.TaskID, err))
	}
}
