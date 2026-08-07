package controller

import (
	"errors"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

type invitationCodeCreateRequest struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type invitationCodeStatusRequest struct {
	Status int `json:"status"`
}

type invitationRegisterRequest struct {
	InvitationCode string `json:"invitation_code"`
	Username       string `json:"username"`
	Password       string `json:"password"`
}

func GetInvitationCodes(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	status, _ := strconv.Atoi(c.Query("status"))
	codes, total, err := model.GetInvitationCodes(
		c.Query("keyword"),
		status,
		pageInfo.GetStartIdx(),
		pageInfo.GetPageSize(),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(codes)
	common.ApiSuccess(c, pageInfo)
}

func AddInvitationCodes(c *gin.Context) {
	var req invitationCodeCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "请求参数无效")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if utf8.RuneCountInString(req.Name) < 1 || utf8.RuneCountInString(req.Name) > 40 {
		common.ApiErrorMsg(c, "邀请码名称长度应为 1 到 40 个字符")
		return
	}
	if req.Count < 1 || req.Count > 100 {
		common.ApiErrorMsg(c, "每次可创建 1 到 100 个邀请码")
		return
	}
	codes, err := model.CreateInvitationCodes(req.Name, req.Count, c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "invitation.create", map[string]interface{}{
		"name":  req.Name,
		"count": req.Count,
	})
	common.ApiSuccess(c, codes)
}

func UpdateInvitationCodeStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "邀请码 ID 无效")
		return
	}
	var req invitationCodeStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "请求参数无效")
		return
	}
	if err := model.UpdateInvitationCodeStatus(id, req.Status); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "invitation.status", map[string]interface{}{
		"invitation_id": id,
		"status":        req.Status,
	})
	common.ApiSuccess(c, nil)
}

func DeleteInvitationCode(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "邀请码 ID 无效")
		return
	}
	if err := model.DeleteInvitationCode(id); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "invitation.delete", map[string]interface{}{
		"invitation_id": id,
	})
	common.ApiSuccess(c, nil)
}

func InvitationRegister(c *gin.Context) {
	var req invitationRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "请求参数无效")
		return
	}
	req.InvitationCode = strings.TrimSpace(req.InvitationCode)
	req.Username = strings.TrimSpace(req.Username)
	if req.InvitationCode == "" || req.Username == "" || req.Password == "" {
		common.ApiErrorMsg(c, "邀请码、账号和密码均不能为空")
		return
	}

	user := model.User{
		Username:    req.Username,
		Password:    req.Password,
		DisplayName: req.Username,
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	if err := common.Validate.Struct(&user); err != nil {
		common.ApiErrorMsg(c, "账号最多 20 个字符，密码长度应为 8 到 20 个字符")
		return
	}
	if err := model.RegisterWithInvitationCode(req.InvitationCode, &user); err != nil {
		if errors.Is(err, model.ErrInvitationUserExists) {
			common.ApiErrorMsg(c, "用户名已存在")
			return
		}
		common.ApiError(c, err)
		return
	}

	if constant.GenerateDefaultToken {
		key, err := common.GenerateKey()
		if err != nil {
			common.ApiErrorMsg(c, "账号已创建，但默认令牌生成失败")
			return
		}
		token := model.Token{
			UserId:             user.Id,
			Name:               user.Username + " 的初始令牌",
			Key:                key,
			CreatedTime:        common.GetTimestamp(),
			AccessedTime:       common.GetTimestamp(),
			ExpiredTime:        -1,
			RemainQuota:        500000,
			UnlimitedQuota:     true,
			ModelLimitsEnabled: false,
		}
		if setting.DefaultUseAutoGroup {
			token.Group = "auto"
		}
		if err := token.Insert(); err != nil {
			common.ApiErrorMsg(c, "账号已创建，但默认令牌保存失败")
			return
		}
	}
	common.ApiSuccess(c, nil)
}
