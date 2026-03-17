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
4. **保存好这个 URL**，后面 Worker 要用

### 2.2 手动触发测试

```bash
curl -X POST "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/xxxxxxxx"
```

应该能在 Pages → Deployments 看到新的构建。

---

## Step 3: R2 Event Notification → 自动重建

当 Obsidian 同步内容到 R2 时，自动触发 Pages 重建。

### 3.1 创建 Queue

1. Workers & Pages → Queues → Create Queue
2. 命名 `r2-rebuild-queue`

### 3.2 创建 Worker

1. Workers & Pages → Create Worker
2. 命名 `r2-rebuild-trigger`
3. 编辑代码：

```javascript
export default {
  async queue(batch, env) {
    // 防抖：R2 批量同步可能触发很多事件，只调一次
    // Queue 会自动 batch，所以这里直接调用即可
    const response = await fetch(env.DEPLOY_HOOK_URL, {
      method: 'POST',
    });
    console.log(`Deploy hook triggered: ${response.status}`);
  },
};
```

4. Settings → Variables → 添加：
   - `DEPLOY_HOOK_URL` = Step 2 中复制的 deploy hook URL（加密）

5. Settings → Queue Bindings → Add：
   - 类型：Consumer
   - Queue：`r2-rebuild-queue`

6. **设置 Queue Consumer 配置**（重要，防抖）：
   - Max batch size: `100`（攒满 100 个事件或等 30 秒才触发一次）
   - Max wait time: `30` 秒
   - 这样 Obsidian 一次同步多个文件只触发一次重建

### 3.3 配置 R2 Event Notification

1. R2 → 选择 bucket `obsidian`
2. Settings → Event Notifications → Add notification
3. 配置：

| 设置 | 值 |
|------|-----|
| Events | `object-create`, `object-delete` |
| Prefix filter | `gaivrt/` |
| Destination | Queue → `r2-rebuild-queue` |

4. Save

### 3.4 验证

1. 在 Obsidian 修改一篇文章并保存（触发 remotely-save 同步）
2. 等待 ~30 秒（Queue batch wait time）
3. 检查 Pages → Deployments → 应该有新的构建
4. 构建完成后访问网站确认内容更新

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

### R2 Event 不触发

1. 确认 Event Notification 的 prefix filter 正确（`gaivrt/`）
2. 确认 Queue 和 Worker 绑定正确
3. 检查 Worker 日志：Workers & Pages → r2-rebuild-trigger → Logs
4. 确认 deploy hook URL 有效（手动 curl 测试）

### 内容不更新

1. 确认 Obsidian remotely-save 同步成功
2. 确认 R2 中文件已更新（Dashboard → R2 → Browse）
3. 手动触发 deploy hook 测试
4. 检查构建日志中 `[r2-loader]` 输出的文件数

---

## 架构成本

| 服务 | 免费额度 | 预估用量 |
|------|----------|----------|
| Cloudflare Pages | 500 builds/月 | ~30 builds/月 |
| R2 | 10GB 存储, 10M 读取/月 | <100MB, <1K 读取 |
| Workers | 100K 请求/天 | <100 请求/天 |
| Queues | 1M ops/月 | <1K ops/月 |

**全部在免费额度内。**
