<div align="center">
  <img src="./deploy/theme/unsnow-favicon.png" alt="SnowAPI" width="88" height="88" />

  # SnowAPI

  **面向多模型服务的统一 API 网关、计费平台与运营控制台。**

  将不同供应商、协议和计费方式收敛到一套稳定、清晰、可运营的基础设施中。

  [![GitHub Stars](https://img.shields.io/github/stars/Ooxygen7/SnowAPI?style=flat&color=111111)](https://github.com/Ooxygen7/SnowAPI/stargazers)
  [![Go](https://img.shields.io/badge/Go-1.25%2B-00ADD8?logo=go&logoColor=white)](https://go.dev/)
  [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111111)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
  [![License](https://img.shields.io/badge/License-AGPL--3.0-663399)](LICENSE)

  [在线控制台](https://api.unsnow.org) · [快速开始](#快速开始) · [功能概览](#功能概览) · [部署指南](#生产部署) · [参与贡献](#参与贡献)
</div>

---

## SnowAPI 是什么

SnowAPI 是为 AI 模型聚合、分发和商业化而设计的一体化平台。它在统一入口后连接不同上游供应商，为应用提供 OpenAI Chat Completions、OpenAI Responses 与 Anthropic Messages 等常用协议，同时覆盖渠道调度、模型定价、额度结算、订阅权益、访问控制、日志审计和运营管理。

项目包含完整的 Go 后端、React 控制台、数据库模型、协议转换层、Docker 构建与生产部署示例，可用于个人模型网关、团队共享服务或面向用户的 API 平台。

## 功能概览

### 统一模型网关

- 统一管理多家上游供应商、渠道、模型映射和 API 凭据。
- 支持 `/v1/chat/completions`、`/v1/responses` 与 `/v1/messages` 等协议入口。
- 可按模型选择实际端点和接口类型，并在兼容协议之间完成请求转换。
- 同名模型可跨渠道组成调度池，支持优先级、权重、自动故障转移与负载均衡。
- 覆盖流式响应、用量统计、错误映射和上游响应审计。

### 极简运维模式

- 通过 Base URL、API Key、接口类型和上游模型名称快速建立模型服务。
- 为每个模型独立配置展示名称、图标、用户分组、输入价格、输出价格和缓存输入价格。
- 从上游获取模型列表后直接选择，无需在多个后台模块之间重复录入。
- 保留完整渠道模式，适配更复杂的供应商策略和运营场景。

### 用户、订阅与计费

- 用户、API 密钥、额度、分组和访问权限统一管理。
- 支持按 Token 或按请求计费，并记录输入、输出、缓存与总消费。
- 支持周期额度、5 小时滚动窗口、套餐有效期和订阅升级。
- 支持兑换码额度与权益发放，以及订阅驱动的用户分组升级。
- 支持 Linux Do Credit 余额充值和订单状态回调。

### 运营与安全

- 使用日志、账单日志、系统日志和管理操作统一检索。
- 模型健康度、成功率、请求量、Token 消耗和小时趋势可视化。
- IP 审计可识别短时间内的多国家、多 ASN 重叠调用，并执行自动或人工封禁。
- 支持邀请码注册、Cloudflare Turnstile、OAuth、权限控制和速率限制。
- 管理员可配置用户分组的 RPM、成功请求数、并发数、TPM 和统计周期。

### SnowAPI 控制台

- 极简黑白灰视觉体系，适配桌面与移动设备。
- 模型列表、模型详情、健康度、价格和供应商信息集中呈现。
- SnowEvent 订阅展示、钱包、个人资料、公告和数据概览采用统一交互语言。
- 内置中文、英文、日文、法文、俄文、越南文与繁体中文界面。
- 支持浅色、深色主题和具备无障碍降级的动画效果。

## 架构

```text
Client / SDK
     │
     ▼
Gin Router ── Authentication ── Rate Limit ── Audit
     │
     ▼
Relay & Protocol Conversion
     │
     ├── OpenAI compatible providers
     ├── Anthropic / Claude
     ├── Gemini / Vertex AI
     ├── Azure OpenAI / AWS Bedrock
     └── Other model providers
     │
     ▼
Billing · Quota · Logs · Metrics
     │
     ├── SQLite / MySQL / PostgreSQL
     └── Redis cache
```

后端采用 Router → Controller → Service → Model 的分层结构。模型请求由 Relay 层完成协议识别、渠道选择、格式转换、预扣费和结算；控制台通过独立前端工程管理用户与运营数据。

## 快速开始

### 环境要求

- Docker Engine 24+
- Docker Compose v2
- 至少 2 GB 可用内存
- 生产环境建议准备域名、HTTPS 证书和反向代理

### 使用 Docker Compose

```bash
git clone https://github.com/Ooxygen7/SnowAPI.git
cd SnowAPI

cp deploy/.env.example deploy/.env
```

生成两个不同的随机密钥，并写入 `deploy/.env`：

```bash
openssl rand -hex 32
openssl rand -hex 32
```

构建并启动服务：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

确认运行状态：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
curl http://127.0.0.1:3000/api/status
```

默认服务监听 `127.0.0.1:3000`。首次访问控制台时，按照初始化向导创建管理员账户并完成数据库配置。

## 调用 API

创建 API 密钥后，即可通过 SnowAPI 的统一地址调用模型。

### Chat Completions

```bash
curl https://your-domain.example/v1/chat/completions \
  -H "Authorization: Bearer sk-your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model",
    "messages": [
      {"role": "user", "content": "Hello"}
    ],
    "stream": true
  }'
```

### Responses

```bash
curl https://your-domain.example/v1/responses \
  -H "Authorization: Bearer sk-your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model",
    "input": "Explain SnowAPI in one sentence."
  }'
```

### Anthropic Messages

```bash
curl https://your-domain.example/v1/messages \
  -H "x-api-key: sk-your-key" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model",
    "max_tokens": 256,
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }'
```

## 配置

### 核心环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `SESSION_SECRET` | 会话签名密钥，生产环境必须设置 | 无 |
| `CRYPTO_SECRET` | 敏感配置加密密钥，生产环境必须设置 | 无 |
| `SQL_DSN` | MySQL 或 PostgreSQL 连接字符串 | SQLite |
| `SQLITE_PATH` | SQLite 数据库路径 | `/data/one-api.db` |
| `REDIS_CONN_STRING` | Redis 连接地址 | 无 |
| `TZ` | 服务时区 | `Asia/Shanghai` |
| `ERROR_LOG_ENABLED` | 是否记录错误日志 | `true` |

更多设置可在管理员控制台中完成。`config/snowapi-settings.example.json` 提供了一套站点功能配置参考。

### 数据库

SnowAPI 同时支持 SQLite、MySQL 5.7.8+ 和 PostgreSQL 9.6+。

```text
SQLite:
  SQLITE_PATH=/data/one-api.db

MySQL:
  SQL_DSN=user:password@tcp(mysql:3306)/snowapi?charset=utf8mb4&parseTime=True&loc=Local

PostgreSQL:
  SQL_DSN=postgresql://user:password@postgres:5432/snowapi

Redis:
  REDIS_CONN_STRING=redis://:password@redis:6379/0
```

## 生产部署

仓库提供以下部署资源：

```text
deploy/
├── compose.yaml
├── .env.example
├── nginx/
│   └── api.unsnow.org.conf
└── theme/
    ├── monochrome.css
    └── unsnow-favicon.png
```

推荐的生产拓扑为：

```text
Internet → CDN / WAF → Nginx → SnowAPI → Database / Redis
```

上线前应完成以下工作：

1. 使用独立随机值配置 `SESSION_SECRET` 和 `CRYPTO_SECRET`。
2. 仅向反向代理开放 SnowAPI 监听端口。
3. 为域名启用 HTTPS，并配置可信代理头。
4. 持久化 `/data`，建立数据库与配置备份策略。
5. 根据业务规模配置 Redis、速率限制、日志轮转和监控。

更新服务：

```bash
git pull
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

Compose 使用命名卷 `snowapi_data` 保存运行数据。升级前应先验证备份可恢复性。

## 本地开发

### 后端

```bash
go mod download
go test ./...
go run .
```

### 默认前端

```bash
cd web
bun install --frozen-lockfile

cd default
bun run typecheck
bun run lint
bun run build
```

启动开发服务器：

```bash
cd web/default
bun run dev
```

默认前端基于 React 19、TypeScript、Rsbuild、Tailwind CSS、TanStack Router、TanStack Query、Base UI、Zustand 与 i18next。Classic 前端保留在 `web/classic/`。

## 项目结构

```text
controller/             HTTP 控制器
model/                  数据模型、迁移与数据库访问
service/                业务逻辑、计费与任务处理
relay/                  协议转换与供应商适配器
router/                 API、控制台和中继路由
middleware/             认证、限流、日志和安全中间件
setting/                系统、模型、性能与计费设置
common/                 公共工具、缓存和额度计算
web/default/            SnowAPI 默认前端
web/classic/            Classic 前端
config/                 站点配置示例
deploy/                 Compose、Nginx 与主题资源
docs/                   上游文档与补充资料
```

## 质量保证

提交前建议至少运行：

```bash
go test ./...

cd web/default
bun run format:check
bun run lint
bun run typecheck
bun run build
```

涉及数据库、计费或协议转换的改动，应同时覆盖 SQLite、MySQL、PostgreSQL 兼容性以及非流式、流式请求路径。

## 安全

请勿通过公开 Issue 披露未修复的安全问题。安全报告方式与响应范围见 [SECURITY.md](SECURITY.md)。

生产环境应使用密钥管理系统或受限环境变量保存数据库、OAuth、支付和上游渠道凭据，并定期轮换会话与加密密钥。

## 参与贡献

欢迎提交 Issue、功能建议和 Pull Request。开始开发前请先：

1. 确认改动不会破坏现有 API 兼容性。
2. 为可观察行为和回归路径补充测试。
3. 保持 SQLite、MySQL 与 PostgreSQL 的一致支持。
4. 为新增界面文本补齐所有前端语言。
5. 在提交前完成格式、Lint、类型检查和构建。

## 上游与许可证

SnowAPI 是 [QuantumNous/new-api](https://github.com/QuantumNous/new-api) 的修改版本，并持续保留 New API、QuantumNous 及原贡献者的项目归属与版权信息。

- 上游项目：[QuantumNous/new-api](https://github.com/QuantumNous/new-api)
- 上游作者：QuantumNous 与 New API contributors
- 上游基线提交：`a63364d156cf2a64f1c3d1ee4923d73d5f3222a1`
- 项目许可证：[GNU Affero General Public License v3.0](LICENSE)
- 附加声明：[NOTICE](NOTICE)
- 第三方许可证：[THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md)
- 上游 README 归档：[docs/UPSTREAM_README.md](docs/UPSTREAM_README.md)

使用、修改或通过网络提供本软件时，必须遵守 AGPL-3.0、`NOTICE` 与第三方许可证中的相关要求。

---

<div align="center">
  Built for reliable model access at scale.
</div>
