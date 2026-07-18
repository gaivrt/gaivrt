# GAIVRT 部署指南

## 架构

```text
Obsidian ──remotely-save──→ R2 bucket
                              │
                    R2 Event Notification
                              │
                     Queue（最多等待 60s）
                              │
              Worker（每个 batch 调一次 Deploy Hook）
                              │
                     Cloudflare Pages rebuild
                              │
                         yarn build → dist/ → CDN
```

R2 事件链路负责快速更新；GitHub Actions 每 6 小时调用同一个 Deploy Hook，作为兜底。

## 1. Cloudflare Pages

Pages 项目连接 GitHub 仓库 `gaivrt/gaivrt`，使用以下设置：

| 设置 | 值 |
|---|---|
| Production branch | `main` |
| Build command | `yarn build` |
| Build output directory | `dist` |
| Root directory | `/` |

Production 和 Preview 环境均设置：

| 变量 | 用途 |
|---|---|
| `NODE_VERSION=20` | 构建运行时 |
| `R2_ENDPOINT` | R2 S3 endpoint |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET` | Obsidian bucket 名称 |

不要在 Cloudflare 构建环境设置代理变量。四个 R2 变量中任何一个缺失时，Astro loader 会回退到仓库内的本地 Markdown。

## 2. Pages Deploy Hook

在 Pages → Settings → Builds & Deployments → Deploy Hooks 创建 `r2-content-update`。Hook URL 同时保存为：

- Worker secret `CF_DEPLOY_HOOK`：事件主链路使用；
- GitHub Actions repository secret `CF_DEPLOY_HOOK`：定时兜底使用。

URL 不得写入 Git、普通环境变量或日志。

## 3. R2 事件自动重建

Cloudflare Queues 自 2026-02-04 起支持 Workers Free plan。本项目配置：

- Queue：`r2-rebuild-queue`
- Worker：`r2-rebuild-trigger`
- R2 prefix：`gaivrt/`
- 事件：`object-create`、`object-delete`
- batching：最多 100 条或等待 60 秒
- retry：Deploy Hook 非 2xx 时最多重试 3 次

实现、部署命令、验证与回滚见 [`workers/r2-rebuild-trigger/README.md`](../workers/r2-rebuild-trigger/README.md)。

## 4. GitHub Actions 兜底

`.github/workflows/scheduled-rebuild.yml` 每 6 小时 POST Deploy Hook，也支持手动运行。GitHub 会在 public repository 连续 60 天无活动后禁用 scheduled workflow；定期检查它是否仍为 enabled。

## 验证

1. 修改一篇 Obsidian Markdown 并等待 remotely-save 完成。
2. R2 → Settings → Event notifications：确认 `gaivrt/` 的 create/delete 规则存在。
3. Queues → `r2-rebuild-queue`：确认 consumer 已连接且消息被消费。
4. Worker Logs：确认 Queue invocation 成功。
5. Pages → Deployments：应在约一分钟后出现一次新 deployment。
6. 构建日志应显示各 content collection 从 R2 读取的文件数。

## 故障排查

- 没有 Queue 消息：检查 remotely-save、bucket、prefix 和 notification rules。
- Queue 重试：检查 Worker secret 和 Deploy Hook 是否仍有效。
- Pages 构建成功但内容没更新：检查 Pages 的四个 R2 环境变量和 loader 文件数。
- 事件链路失效：手动运行 GitHub `Scheduled Rebuild`，再检查 Worker/Queue。
- 定时兜底失效：在 GitHub Actions 重新启用 workflow，并确认 secret 存在。

## 免费额度

个人博客用量通常落在 Workers、Queues 和 R2 Free plan 内。Pages Free plan 每月最多 500 次构建；Queue batching 用于避免一次 Obsidian 同步为每个文件分别触发构建。
