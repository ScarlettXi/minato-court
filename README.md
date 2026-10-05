# Minato Court · 东京都网球场监控面板

[English](#english) · [MIT License](LICENSE)

一个把东京网球场监控条件、空位结果和扫描健康状态放在同一处的网页项目。
由 ScarlettXi 发起，通过与 AI 协作开发并持续改进。

## 能做什么

- 中文、English、日本語界面。
- 按地区、球场和各球场独立时间范围设置监控条件。
- 按账户隔离设置、空位、扫描记录、预约请求和邮件通知。
- 接收外部监控程序通过 API 提交的空位与健康状态，标记过期或未验证的数据。
- 提供邮件/手机验证码登录接口及邮件发件队列；需要自行配置服务商。
- 保留人工确认预约的流程和官方预约入口。

**项目包含网页、后台 API、数据库、公开空位扫描程序、GitHub Actions 定时运行配置和测试。
部署者需要配置自己的网站地址和密钥并启用任务，才会开始监控。私人会话及生产数据不在仓库中。**
仪表盘刷新读取已保存的结果，不等于重新扫描官网。可预约状态以官网当前结果为准。

## 技术与结构

React 19 · TypeScript · Vinext / Vite · Cloudflare Workers / D1 · Drizzle

```text
app/                     网页与后台 API
lib/                     账户、认证、球场筛选、通知与健康状态逻辑
data/                    官方公开球场目录快照
db/                      数据库结构和查询辅助函数
drizzle/                 SQL 迁移，不含用户数据
worker/                  Worker 入口
.openai/hosting.json      通用 Sites 存储绑定配置，不含生产项目 ID
tests/                   离线逻辑与构建产物测试
monitor/                 Python 只读扫描程序与离线测试
.github/workflows/       代码检查与可选定时扫描
docs/                    账户、通知与扫描部署说明
```

## 本地运行

需要 **Node.js 24 或更新版本**，以及 npm。建议使用 Node.js 24。

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev
```

按终端输出打开本地地址。未配置身份服务或数据库时，账户数据和通知功能不会完整可用。
`.dev.vars` 是本地 Worker 的环境绑定文件；运行中的秘密值不要写入代码。

需要数据库功能时，为本地 D1 应用 `drizzle/` 下全部迁移。
本地模拟绑定的名称是 `DB`，数据库名是 `site-creator-d1`；
其占位数据库 ID 仅用于本地开发。生产环境使用自己创建的 D1 数据库。
完整应用需要身份认证、正确的数据库绑定与迁移，不能只用 GitHub Pages 运行。

## 检查

```bash
npm run typecheck
npm run test:unit
npm test
```

`npm test` 依次执行离线逻辑测试、生产构建和渲染测试。
离线测试使用内存数据库和模拟服务，不访问官方预约网站、不发送真实邮件。
`tests/tenant-api.test.mjs` 是单独的本地集成测试，依赖专用预览和数据库路径，
不在默认测试中执行。参见 [贡献说明](CONTRIBUTING.md)。

## 部署与配置

当前项目沿用 Sites 的运行和身份接入方式。部署自己的副本时，在 Sites 中创建自己的项目，
为 `.openai/hosting.json` 配置新项目 ID，绑定 `DB`，应用 SQL 迁移并设置运行环境变量。
不要使用原作者的项目、账号、数据库或密钥。

| 变量 | 用途 |
| --- | --- |
| `MONITOR_INGEST_KEY` | 仅供可信监控程序使用的后台密钥 |
| `SITE_ORIGIN` | 自己的网站准确来源地址，例如 `https://courts.example.com` |
| `OWNER_BOOTSTRAP_EMAIL` | 用于绑定初始 owner 数据的已验证 Sites 账户邮箱 |
| `SUPABASE_URL`、`SUPABASE_ANON_KEY` | 可选的邮箱/手机号验证码认证服务 |
| `PHONE_LOGIN_ENABLED` | 配置短信服务后才设为 `true` |
| `INVITE_ONLY` | 设为 `true` 后，朋友首次邮箱登录须使用站点所有者生成的一次性邀请码 |
| `RESEND_API_KEY`、`RESEND_FROM_EMAIL` | 可选邮件提醒服务及已验证发件地址 |

认证细节与通知配置见 [账户与邮件说明](docs/account-email-setup.md)。
邀请码默认七天有效，领取后可用原邮箱继续登录，所有者可撤销访问。朋友无需 ChatGPT 账户的前提是已接通邮箱验证码服务，并经所有者批准解除 Sites 外层访问限制；仅部署这段代码不会自动完成服务配置或开放站点。
**在 Sites 以外部署时，必须先替换或验证身份接入层。当前代码信任 Sites 网关注入的身份头，
不可将可伪造该请求头的裸 Worker 直接开放给公众。** 参见 [安全说明](SECURITY.md)。

## 接入监控程序

仓库自带 Python 3.9+ 标准库扫描程序，默认只检查公开先到先得空位，
日期范围为日本时间当天起 7 天（可配置 14、21、28 天）。无需官方账号登录。
芝公园、日比谷公园和有明室内场已进行公开读取验证；目录中的其他场地使用同一适配器，
尚未全部逐一现场验证。麻布运动场已从目录、默认选择和监控目标中移除。

```bash
# 配好自己部署的 MONITOR_SITE_ORIGIN、MONITOR_INGEST_KEY 后：
python3 monitor/scanner.py            # 先只读验证
python3 monitor/scanner.py --write    # 回写核实结果；可能触发已配置的邮件提醒
```

按 [扫描与定时运行指南](docs/monitor-setup.md) 设置 GitHub Secrets，
先手动验证，再启用每 5 分钟的定时任务。任务默认关闭，GitHub 调度可能延迟。
失败或不完整的扫描保留旧结果；只有完整检查的日期范围会更新。

## 当前边界

- 目录文件是公开信息快照，球场规则、官网页面和开放时间可能变化。
- 实际登录、短信、邮件到达和后台连续运行，需要在自己的部署中验证。
- 预约、付款和账户验证始终需要相应用户操作；此仓库不提供绕过验证码的功能。
- 测试通过不等于完整安全审计；依赖状态与运行恢复约束见 [RELIABILITY.md](RELIABILITY.md)。
- 私人配置、数据文件、凭据及原站点的 Git 历史未包含在这个公开导出中。

## 贡献与许可

欢迎通过 Issue 或 Pull Request 提出改进。请勿在公开内容中上传账号、验证码、
Cookie、密钥、真实预约记录或个人信息。参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

项目代码采用 [MIT License](LICENSE)。依赖保留各自许可证；
官方球场资料和外部服务不因本项目的许可而改变其使用条件。

---

## English

Minato Court is a Tokyo tennis-court availability dashboard initiated by ScarlettXi
and developed with AI assistance. It provides Chinese, English and Japanese UI,
per-court time preferences, account-scoped results, monitor ingestion endpoints,
freshness indicators, and optional authentication/email integrations.

**Included:** web application, API routes, D1 schema/migrations, public court-catalog
snapshot, a public-calendar Python scanner, an opt-in GitHub Actions schedule, and
automated tests. **Setup required:** your own deployment, secrets, database and
notification providers. The schedule is disabled until explicitly enabled.
Refreshing the dashboard only reads saved results; it does not scan booking websites.
No private sessions, live records, production project IDs or prior Git history are included.

### Development

Use Node.js 24+ and npm:

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev
```

Apply the SQL migrations in `drizzle/` to your local D1 database before using data
features. The local binding is `DB`, with database name `site-creator-d1`.
The placeholder database ID is for local emulation only. Configure your own identity
provider and runtime environment. Run `npm run typecheck` and `npm test` to validate.

### Deployment and authentication

The current integration targets Sites with Cloudflare Workers and D1. Create your
own Site and database, set your own project ID in `.openai/hosting.json`, apply all
migrations, and configure the variables listed above. `SITE_ORIGIN` must match your
HTTPS origin. GitHub Pages alone cannot run the application's backend and database.

Do not expose this Worker outside a trusted Sites identity gateway without adapting
its authentication: client-controlled `oai-authenticated-user-*` headers must never
be accepted as verified identity. Keep `MONITOR_INGEST_KEY` server-side.
See [SECURITY.md](SECURITY.md) and [account setup](docs/account-email-setup.md).

The included scanner checks public first-come calendars over a rolling 7-day window
(14/21/28 optional), posts date-scoped observations, verifies readback and reports
health. See [scanner setup](docs/monitor-setup.md) for local dry runs and Actions
configuration. Failed checks remain unverified; bookings remain user-controlled.
Azabu has been removed from the catalog, default selection and monitoring targets.

### Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md), [RELIABILITY.md](RELIABILITY.md) and
[MIT License](LICENSE). External services, dependencies and public-source data retain
their own terms. Tests use synthetic data; live delivery and continuous operation
require separate validation.
