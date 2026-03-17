# GAIVRT 部署指南

## 架构

```
Obsidian ──remotely-save──→ R2 bucket (obsidian)
                              │
                         R2 Event Notification
                              │
                     Cloudflare Worker (r2-rebuild-trigger)
                              │
                         POST Deploy Hook
                              │
                     Cloudflare Pages rebuild
                              │
                         yarn build → dist/ → CDN
```

内容在 Obsidian 中编写，通过 remotely-save 插件同步到 R2。R2 变更触发 Worker，Worker 调用 Pages Deploy Hook，Pages 自动重建拉取最新内容。

---

## Step 1: Cloudflare Pages 配置

### 1.1 创建 Pages 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Workers & Pages → Create → Pages → Connect to Git
3. 选择 GitHub 仓库 `gaivrt/gaivrt`
4. 配置 Build settings：

| 设置 | 值 |
|------|-----|
| Production branch | `main` |
| Build command | `yarn build` |
| Build output directory | `dist` |
| Root directory | `/` |

### 1.2 设置环境变量

Pages → Settings → Environment Variables → Production（同时设 Preview）：

| 变量名 | 值 |
|--------|-----|
| `NODE_VERSION` | `20` |
| `R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | `<你的 key>` |
| `R2_SECRET_ACCESS_KEY` | `<你的 secret>`（加密） |
| `R2_BUCKET` | `obsidian` |

> **注意**：不要设置 `proxy` 相关变量，Cloudflare 构建环境不需要代理。

### 1.3 首次部署

Push 任意 commit 到 `main` 分支即触发首次构建。构建日志在 Pages → Deployments 查看。

### 1.4 自定义域名（可选）

Pages → Custom domains → Add domain → 输入你的域名 → 按提示配置 DNS。

---

## Step 2: Deploy Hook

### 2.1 创建 Hook

1. Pages → Settings → Builds & Deployments → Deploy Hooks
2. Create hook，命名如 `r2-content-update`
3. 复制生成的 URL（形如 `https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/xxxxxxxx`）
4. **保存好这个 URL**，后面 GitHub Secrets 要用

### 2.2 手动触发测试

```bash
curl -X POST "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/xxxxxxxx"
```

应该能在 Pages → Deployments 看到新的构建。

---

## Step 3: 定时自动重建（GitHub Actions）

Cloudflare R2 Event Notification 需要付费的 Workers Paid plan。改用免费方案：GitHub Actions 每 6 小时自动 POST deploy hook 触发重建。

### 3.1 设置 GitHub Secret

1. GitHub → 仓库 Settings → Secrets and variables → Actions
2. New repository secret：
   - Name: `CF_DEPLOY_HOOK`
   - Value: Step 2 中复制的 deploy hook URL

### 3.2 Workflow 文件

已创建 `.github/workflows/scheduled-rebuild.yml`：
- **每 6 小时**自动触发 Cloudflare Pages 重建
- 也可在 GitHub Actions tab 手动点击 **Run workflow** 立即触发

### 3.3 验证

1. GitHub → Actions tab → Scheduled Rebuild → Run workflow（手动测试）
2. 检查 Cloudflare Pages → Deployments → 应该有新的构建
3. 日常使用：Obsidian 更新内容 → R2 同步 → 最多 6 小时后自动重建上线
4. 急需更新：GitHub Actions 手动触发 or `curl -X POST <deploy hook>`

---

## 故障排查

### 构建失败

```bash
# 查看 Pages 构建日志
# Cloudflare Dashboard → Pages → Deployments → 点击失败的 deployment
```

常见问题：
- **R2 凭证错误**：检查环境变量拼写和值
- **Node 版本**：确保 `NODE_VERSION=20`
- **yarn 版本**：Pages 默认使用 yarn 1.x（我们的项目用 yarn 1.22，兼容）

### 定时重建不触发

1. GitHub → Actions → 确认 workflow 显示为 enabled
2. 检查 `CF_DEPLOY_HOOK` secret 是否设置正确
3. 手动 Run workflow 测试

### 内容不更新

1. 确认 Obsidian remotely-save 同步成功
2. 确认 R2 中文件已更新（Dashboard → R2 → Browse）
3. 手动触发：`curl -X POST <deploy hook URL>`
4. 检查构建日志中 `[r2-loader]` 输出的文件数

---

## 架构成本

| 服务 | 免费额度 | 预估用量 |
|------|----------|----------|
| Cloudflare Pages | 500 builds/月 | ~4 builds/天 ≈ 120/月 |
| R2 | 10GB 存储, 10M 读取/月 | <100MB, <1K 读取 |
| GitHub Actions | 2000 min/月 | ~1 min × 4/天 ≈ 120 min/月 |

**全部免费。不需要 Workers Paid plan。**
