# 扫描程序与定时运行 / Scanner and schedule

仓库现在包含无需官方账号登录的只读扫描程序 `monitor/scanner.py`。
Python 3.9+，仅使用标准库；支持 Linux/macOS。它从你部署的网站读取球场和时段设置，
查询官方公开周历，再按账户回写结果和健康状态。不会预约、付款、登录或操作预约队列。

## 支持范围

- 东京都立公园：使用仓库球场目录中的公园/运动项目编号。
- 麻布运动场已移出球场目录和监控目标。
- 只检查 **先到先得公开空位**，不检查抽选申请、会员资格或最终预约是否成功。
- 默认检查日本时间当天起 7 天，可选 14、21、28 天。不是所有未来开放日期。
- 每次最多 8 个不同球场、50 个账户；超过限制会报错，不会静默漏掉其他球场。
- 每个球场必须读完全部设施和全部请求日期，才能更新该球场。只更新检查日期范围内的
  `first_come` 记录；范围外和其他账户的记录保留。面板展示检查日期，旧记录单独判断新鲜度。
- 2026-10-05 已对芝公园、日比谷公园和有明室内场做公开读取验证。
  目录中其他场地使用同一适配器，但尚未逐一现场验证。官网页面改版会使扫描报错，需更新适配器。

## 1. 先部署自己的网页和数据库

按 [README](../README.md#部署与配置) 部署应用、绑定 D1 并应用迁移。
**必须部署包含 `protocolVersion: 2` 的本版本 API**；旧 API 不理解日期范围，扫描程序会拒绝回写。

生成自己的随机 `MONITOR_INGEST_KEY`（例如 `openssl rand -hex 32`），分别配置在网页后台和
扫描运行环境。两个值必须相同。切勿放进前端、仓库、截图、Issue 或日志。
`MONITOR_SITE_ORIGIN` 是自己站点的 HTTPS 根地址，不包含路径或查询参数。
站点网关必须允许持正确 `x-monitor-key` 的程序访问这两个监控 API；
若请求被网关跳转到登录页，程序会拒绝跳转。不要因此公开其他受保护的 API。

## 2. 先在本机试运行

在终端设置环境变量；避免把真实密钥写进 shell 历史，可用交互输入：

```bash
export MONITOR_SITE_ORIGIN=https://your-courts.example.com
read -s MONITOR_INGEST_KEY
export MONITOR_INGEST_KEY
# 按需设置账户 ID；默认 owner。all 表示全部活跃账户。
export MONITOR_USER_ID=owner
python3 monitor/scanner.py --days 7
```

默认是 **dry run**：读取配置和官网，打印球场、日期范围、空位数量和状态，
不写空位、不发送邮件、不写远程健康记录。本地阻断状态文件仍会更新。
看到每个球场的 `dry_run` 后，正式运行：

```bash
python3 monitor/scanner.py --days 7 --write
```

程序通过 API 写入后再次读取进行比对，才报告 `written_and_verified`。
API 按已有邮件订阅设置排队和发送提醒，**`--write` 可能发送真实邮件**；
程序本身不提供 Telegram 提醒，也不把发送尝试等同于邮件实际到达。

`MONITOR_USER_ID=all` 时，各账户分别读写健康与设置；相同球场的公开查询在单次运行中复用。
只运行一个负责该部署的扫描程序，避免与其他机器或其他仓库的扫描器重复扫描。
本地进程锁只保护使用同一状态文件路径的进程，GitHub 并发锁只保护同一仓库。

## 3. GitHub Actions 定时运行

进入自己仓库的 **Settings → Secrets and variables → Actions**：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Secret | `MONITOR_SITE_ORIGIN` | 自己网站的 HTTPS 根地址 |
| Secret | `MONITOR_INGEST_KEY` | 与后台相同的监控密钥 |
| Variable | `MONITOR_USER_ID` | 可选：默认 `owner`，也可设账户 ID 或 `all` |
| Variable | `MONITOR_DAYS` | 可选：`7`（默认）、`14`、`21`、`28` |
| Variable | `MONITOR_ENABLED` | 确认手动检查成功后设为 `true` |

1. 在 **Actions → Availability monitor → Run workflow** 手动运行，先保持 `write=false`。
2. 查看每个球场结果；成功后再次运行，选 `write=true`，核对自己的面板和通知。
3. 最后设置 `MONITOR_ENABLED=true`，启用每 5 分钟的计划。设为 `false` 可暂停计划扫描。

手动运行只允许默认分支，`clear_block=none` 是普通运行。默认不填 Secrets、不启用变量，
不会向任何私人站点写入，也不会自动查询官网。仓库测试不访问官网。

GitHub 的定时运行可能延迟或丢弃；公开仓库连续 60 天没有活动时可能自动停用。
它不是准点监控保证。面板十分钟的新鲜度阈值仍然有效，不会为了掩盖延迟而延长。
参见 [GitHub 官方 schedule 文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。

## 4. 故障与恢复

- 官方请求逐个执行，间隔至少 3 秒，单次网络超时 20 秒，整个程序限时 7 分钟。
  不自动重放写入请求。错误、超时、缺列、日期错位、未知状态、读取不完整，都不能报告“无空位”。
- 遇到 401/403/429 或可识别的验证页，将对应系统持久标记为阻断。后续运行不再请求这个系统。
  本地状态文件只保存系统名称；Actions 通过缓存保留它，写入模式还会保存在后台健康记录中。
  缓存丢失时会从后台恢复阻断；dry run 的阻断仅依赖本地文件/缓存。
- 在浏览器中人工检查官方提示、访问限制和恢复情况。确认可以恢复后，本地执行：

```bash
python3 monitor/scanner.py --clear-block tokyo
# 港区系统使用 --clear-block minato
```

这会清除当前配置账户的该系统健康阻断和本地阻断，只更新健康，不执行扫描或预约。
GitHub 上可手动 Run workflow，选择对应 `clear_block`，下一次运行才恢复扫描。
- 官网返回新格式或未知状态时，先停用计划任务并修复解析器，不要把未知数据改成零。
- 网站认证失败、写入失败或回读不一致，Actions 会显示失败。突然断电或作业被终止可能来不及
  写健康，但旧时间戳仍会过期。用户应检查实际运行记录；本仓库未提供独立离线告警服务。
- 官方网站提醒避免过于频繁的访问；按实际需求控制球场数、日期范围和频率。
  [都立系统公告](https://kouen.sports.metro.tokyo.lg.jp/web/)。

## English quick start

The standard-library Python scanner supports public Tokyo park calendars. It monitors **first-come availability only**, over a rolling
7-day window (14/21/28 optional), without official credentials or booking actions.
At most 8 unique venues and 50 accounts are accepted per run. Other catalog venues
share the adapter but have not all been live-tested.

Deploy this version of the app first (monitor protocol 2). Set `MONITOR_SITE_ORIGIN`
and `MONITOR_INGEST_KEY` in the runner, matching the key in the deployed Worker.
`MONITOR_USER_ID` defaults to `owner`; `all` enumerates active accounts.
Run `python3 monitor/scanner.py` for a dry run, then add `--write` to ingest verified
results; the existing API may send opted-in email notifications. Never publish secrets.

For Actions, add the two repository Secrets above, test the **Availability monitor**
manual workflow first, then set repository Variable `MONITOR_ENABLED=true`.
Schedules run approximately every five minutes and may be delayed or disabled by
GitHub. Only default-branch runs are accepted. Use one writer per deployment.

Partial calendars never replace saved observations. Scoped ingestion preserves dates
outside the window and lottery observations. Failures keep previous success timestamps;
slots are labeled historical individually when old or outside the reported scan window.
Official access/rate-limit blocks persist until explicitly cleared using
`--clear-block tokyo|minato` or the manual workflow input, after human investigation.
No CAPTCHA bypass, reservation, payment, Telegram delivery or independent watchdog
is included. Offline tests: `npm run test:scanner` or `python3 -m unittest discover -s monitor`.
