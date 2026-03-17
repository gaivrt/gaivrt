# GAIVRT 网站开发 Walkthrough

记录本次开发会话中完成的所有工作。

---

## Phase 1: 粒子扉页 (Layer 0)

**Commit:** `c9fdb0d`

### 需求
网站需要一个扉页——打开时整页一个颜色，正中间有名字，点击后进入正式内容。盖尔提供了一个 HTML demo (`assets/particle_text_master_cycle.html`)，包含名画调色板驱动的粒子文字效果。

### 实现
将单文件 demo "工业化"为模块化 TypeScript 架构：

```
src/lib/particles/
├── types.ts           → 接口定义 (Particle, Palette, Config)
├── noise.ts           → Perlin 2D 噪声工厂
├── palettes.ts        → 5 套名画调色板 + smoothstep 混合
└── ParticleText.ts    → 核心引擎 class (构建→start→stop→dispose)

src/components/entrance/
└── ParticleEntrance.tsx → Solid.js island 组件
```

**核心特性：**
- 文字 "GAIVRT" 由粒子组成，鼠标排斥交互
- 5 套名画调色板循环（莫奈、维米尔、葛饰北斋、克里姆特、吉田）
- 物理系统：弹簧归位 + 鼠标排斥 + 阻尼
- 粒子大小根据视口自适应（`sizeScale = min(W,H) / 1000`）
- 首次访客：4s 动画后显示 "click anywhere to enter"
- 回访者（>3次）：25% 概率重现入口动画，75% 直接跳过
- 复用现有 `PerformanceMonitor` 做性能降级

**踩过的坑：**
- Canvas 高度为 0：Astro 的 `<astro-island>` 没有继承高度，改用 `window.innerWidth/Height` 直接设尺寸
- 粒子跳过概率写反：`Math.random() > 0.78` vs `Math.random() > (1 - 0.78)`

### 配置
`src/lib/constants.ts` 新增 `ENTRANCE` 块，所有物理参数集中管理。包含 `REAPPEAR_CHANCE: 0.25` 控制回访重现概率。

---

## Phase 2: 暖色统一重设计

**Commit:** `519dee8`

### 需求
粒子扉页引入了名画暖色调，但 Surface 层是冷白学术风、Depths 层是纯黑——三层像三个不同的网站。需要以扉页暖色为锚点统一全站。

### 色彩体系重建

**Layer 1 (Surface):**
```
#fafafa → #f5f0e8 (暖纸张白)
#1a1a1a → #2a2420 (深棕黑)
#666    → #8a7e72 (棕灰，提亮拉开层级)
#333    → #8b5e3c (温暖赭色 accent，真正的强调)
```

**Layer 2 (Depths):**
```
#000    → #0a0806 (深暖黑)
白色文字 → rgba(235, 220, 200, ...) (暖白)
```

### 字体更换
- Inter/Noto Serif SC → **Cormorant Garamond** (display) + **华文中宋** (body)
- 只保留 JetBrains Mono 给代码块

### 纸张纹理
尝试了两个方案：
1. ❌ CSS `filter: url(#svg-filter)` — 空伪元素上的 filter 不渲染
2. ✅ SVG data URI `background-image` — feTurbulence 在 SVG 内自渲染，`mix-blend-mode: soft-light`，`opacity: 0.12`

### Surface 主页重设计
从"学术模板"（头像+名字+三卡片 grid）→ "书卷扉页"：
- 居中 hero：avatar (88px 方形圆角) + 名字 (Cormorant Garamond 300) + italic 副标题
- 装饰线用 CSS 伪元素（渐变淡出线），不用 Unicode hack
- 书籍目录式 TOC（CSS Grid 两列：标题左/描述右）
- Staggered reveal 入场动画（hero 1.2s ease, TOC 0.6s translateX）
- 首页去掉 NavBar（TOC 就是导航）

### 子页面导航
Sticky NavBar → 轻盈的 `← GAIVRT` 返回链接 (`BackLink.astro`)

### WebGL Ripple 调暖
- Shader 叠加色从纯黑 → 暖棕 `vec4(0.04, 0.03, 0.02, alpha)`
- CSS fallback 调暖

### 涉及文件（16 个）
`global.css`, `layer1.css`, `layer2.css`, `typography.css`, `ripple.frag.glsl`, `RippleCanvas.tsx`, `NavBar.astro`, `BackLink.astro`(新), `BaseLayout.astro`, `Layer1Layout.astro`, 6 个页面文件

---

## Phase 3: 暖光鼠标效果

**Commit:** `725e8e3`

### 需求
暗色水波纹（露出底层深渊）与暖色书卷风格不搭。

### 改动
把 ripple 从"暗色覆盖"改为"烛光照纸"：
- `ripple.frag.glsl`：颜色 `(0.04, 0.03, 0.02)` → `(1.0, 0.95, 0.85)`，alpha 0.55 → 0.35
- `rippleSim.frag.glsl`：鼠标能量减半 (0.03→0.015)，衰减加快 (0.96→0.94)
- `Layer1Layout.astro`：ripple 容器加 `mix-blend-mode: soft-light`
- CSS fallback 改为暖光色

---

## Phase 4: 收尾打磨

**Commits:** `77f62a2`, `fa550c8`

- 首页锁定 `100dvh` + `overflow: hidden`，禁止滚动
- 改用 flexbox 垂直居中（去掉固定 vh padding），响应式适配任何设备
- 关闭 Astro dev toolbar (`devToolbar: { enabled: false }`)
- 更新 CLAUDE.md 反映重设计后的架构

---

## Phase 5: 墨渍渗透过渡 (Layer 1 → Layer 2)

**Commits:** `ba91482`, `42f8adf`

### 需求
三层叙事缺少关键一环：从 Surface（暖纸面）到 Depths（深暖黑）的过渡。设计哲学是"你要剥开我"。

### 迭代过程
经历了三个方案：
1. ❌ **SVG 裂纹** — 看起来像黑色树根，不锐利
2. ❌ **圆形 blob + metaball** — 三个孤立圆泡，无论怎么调参都不自然
3. ✅ **噪声阈值渐进揭示** — feTurbulence 噪声本身就是渍痕图案

### 最终方案：噪声阈值
```
src/lib/inkbleed/
├── types.ts              → InkBleedConfig 接口
└── InkBleedEngine.ts     → 核心引擎 (lifecycle: start→stop→dispose)

src/components/surface/
└── InkBleedOverlay.tsx    → Solid.js island
```

**SVG filter chain:**
1. `feTurbulence` (fractalNoise, 随机 seed)
2. `feColorMatrix` (luminanceToAlpha)
3. `feComponentTransfer` + `feFuncA` (动画阈值控制)
4. `feComposite` (与边缘权重渐变相交)
5. `feGaussianBlur` (纸纤维吸收)

**"怕人的"交互模型：**
- 鼠标不动 30 秒 → 渍痕从边缘渐现（噪声阈值逐步降低）
- 鼠标一动 → 渍痕 250ms 消失，idle timer 重置
- 静止时点击 → flood 过渡（纯色 div 淡入 #0a0806）→ 跳转 `/depths/`
- 页面不 focused 时不计时

**关键修复：**
- `mix-blend-mode: multiply` 从容器 CSS 移到 SVG inline style，避免空 div 改变背景色
- flood 用纯色 `<div>` opacity transition 替代 SVG filter 动画，消除椭圆空洞 + 卡顿
- focus/blur listener 替代 visibilitychange，严格 idle 检测

### 配置
`src/lib/constants.ts`：`INK_BLEED` 块（噪声频率、octaves、渐现时长、颜色、opacity）+ `TIMING.INK_BLEED_DELAY: 30_000`

---

## Phase 6: Depths 层重设计

**Commits:** `054b129`, `4f78a82`

### 需求
Depths 首页碎片布局有四个问题：聚在一块、无抖动、重叠遮挡 core link、碎片内容固化。

### 碎片布局：3×3 Zone Grid
```
┌─────────┬─────────┬─────────┐
│  zone 0 │  zone 1 │  zone 2 │  top
├─────────┼─────────┼─────────┤
│  zone 3 │  zone 4 │  zone 5 │  middle
├─────────┼─────────┼─────────┤
│  zone 6 │ RESERVED│  zone 8 │  bottom
└─────────┴─────────┴─────────┘
              ↑ core link 保护区
```

- 碎片分配到不同 zone，zone 内随机偏移
- `#depths-root` 改为 `position: fixed; inset: 0`（全 viewport 布局，非 720px 容器）
- `@keyframes drift` 微抖动动画（±2.5px 位移 + ±0.3° 旋转，6-12s 周期）

### 碎片语料库
从 `assets/THE NOTES.md`（个人笔记 ~600 行）提取 50 条碎片，分三层：

| 层级 | 解锁条件 | 语料量 | 每次展示 |
|------|----------|--------|----------|
| BASE_POOL | 始终 | 15 条 | 随机 5 条 |
| EXTRA_POOL | visits ≥ 3 | 15 条 | 随机 4 条 |
| DEEP_POOL | visits ≥ 6 | 20 条 | 随机 4 条 |

每次刷新 `pickRandom()` Fisher-Yates shuffle 选取不同组合。

编辑位置：`src/pages/depths/index.astro` 顶部有清晰标注。

---

## 当前状态

## Phase 7: 全内容 R2 化

**Commit:** `1dd783e`

### 需求
R2 bucket 已配置 6 个前缀（Blog/, Projects/, Publications/, Research/, Thoughts/, CV/），但只有 blog 和 thoughts 接入 R2，其余页面是静态占位符。

### 改动

**`src/content/config.ts`** 新增 4 个 collection：projects, publications, research, cv。所有 prefix 加了 `gaivrt/` 前缀（匹配更新后的 R2 bucket 结构）。

**页面架构改为智能单/多切换：**
- 0 篇 → 显示"暂无内容"
- 1 篇 → 直接在页面内渲染全文
- 多篇 → 列表页 + 详情页

**新建文件结构：**
```
src/pages/surface/
├── projects/index.astro + [...slug].astro
├── publications/index.astro + [...slug].astro
├── research/index.astro + [...slug].astro
└── cv.astro (单页渲染)
```

**Depths Core 升级：**
`/depths/core` 不再只有"你来了"。5s 后显示消息，8s 后 thoughts 完整索引淡入——到达最深处的人才能看到全部私人文字目录。

### R2 拉取状态（首次 build）
| Collection | R2 文件数 |
|-----------|----------|
| research | 3 ✅ |
| blog | 0（待填充） |
| thoughts | 0（待填充） |
| projects | 0（待填充） |
| publications | 0（待填充） |
| cv | 0（待填充） |

---

## 当前状态

### ✅ 已完成
| 模块 | 状态 |
|------|------|
| Layer 0 粒子扉页 | 完成，25% 回访重现 |
| Surface 主页 | 书卷风格，居中布局 |
| 暖色统一 | 三层色彩一致 |
| 纸张纹理 | SVG noise + soft-light |
| WebGL ripple | 暖光烛光效果 |
| 字体系统 | Cormorant Garamond + 华文中宋 |
| 导航系统 | 首页 TOC + 子页面 BackLink |
| 响应式 | flexbox 居中，设备自适应 |
| 墨渍渗透过渡 | 噪声阈值 + 怕人交互 |
| Depths 碎片 | 50 条语料库 + zone 布局 + drift 动画 |
| R2 内容管线 | 6 个 collection 全部接入 R2 |
| Depths Core | thoughts 索引 + 分阶段淡入 |
| 子页面 | projects/publications/research 支持列表+详情 |

### 🔲 待完成
| 模块 | 说明 |
|------|------|
| R2 内容填充 | Blog/Projects/Publications/Thoughts/CV 需要在 Obsidian 中放 markdown |
| 移动端适配 | 三层体验在手机上需要测试 |
| 部署 | 未部署 |
| favicon / OG meta | SEO 基础设施 |
