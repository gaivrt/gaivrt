# GAIVRT 个人网站实现方案

## Context

盖尔需要一个兼具学术主页功能和沉浸式探索体验的个人网站。核心哲学："你要剥开我"——表面是专业的学术主页，深层是隐藏的私密空间，只有愿意探索的人才能发现。

三层架构：Layer 0（粒子入场）→ Layer 1（白色学术表面，WebGL 涟漪透出黑色）→ Layer 2（黑色深渊，渐进解锁）。

## 技术栈

- **框架**: Astro + Solid.js (client islands)
- **WebGL**: Three.js + 自定义 GLSL shader
- **样式**: 纯 CSS（Astro scoped styles）
- **内容**: Obsidian Markdown → Astro Content Collections（symlink）
- **部署**: 待定（先按纯静态输出构建，兼容所有平台）

## 项目结构

```
gaivrt/
├── astro.config.mjs
├── tsconfig.json
├── package.json
├── public/
│   └── fonts/
├── src/
│   ├── layouts/
│   │   ├── BaseLayout.astro        # head, meta, fonts, global styles
│   │   ├── Layer1Layout.astro      # 白色表面 + WebGL canvas
│   │   └── Layer2Layout.astro      # 黑色深渊
│   ├── pages/
│   │   ├── index.astro             # Layer 0 入场
│   │   ├── surface/
│   │   │   ├── index.astro         # 学术主页
│   │   │   ├── research.astro
│   │   │   ├── publications.astro
│   │   │   ├── projects.astro
│   │   │   ├── cv.astro
│   │   │   └── blog/
│   │   │       ├── index.astro
│   │   │       └── [...slug].astro
│   │   └── depths/
│   │       ├── index.astro         # 漂浮碎片空间
│   │       ├── thoughts/[...slug].astro
│   │       └── core.astro          # 终点："你来了"
│   ├── components/
│   │   ├── entrance/
│   │   │   └── ParticleEntrance.tsx    # 粒子→GAIVRT 动画 (Solid, client:only)
│   │   ├── surface/
│   │   │   ├── RippleCanvas.tsx        # WebGL 涟漪 (Solid, client:only)
│   │   │   ├── CrackSystem.tsx         # SVG 裂缝 (Solid, client:load)
│   │   │   ├── ObserverText.astro      # 第四面墙文字
│   │   │   ├── BreathingCard.astro     # 呼吸微动画
│   │   │   └── NavBar.astro
│   │   ├── depths/
│   │   │   ├── FloatingText.tsx        # 漂浮文字碎片 (Solid, client:only)
│   │   │   └── CoreReveal.tsx          # 终点动画
│   │   └── shared/
│   │       └── VisitTracker.astro      # inline script, localStorage
│   ├── shaders/
│   │   ├── ripple.vert.glsl        # fullscreen quad 顶点
│   │   ├── ripple.frag.glsl        # 白揭黑合成 pass
│   │   └── rippleSim.frag.glsl     # FBO 水波模拟 pass
│   ├── lib/
│   │   ├── webgl/
│   │   │   ├── RippleEffect.ts     # Three.js scene, FBO ping-pong, render loop
│   │   │   ├── CrackGenerator.ts   # 有机裂缝路径算法
│   │   │   └── performanceMonitor.ts
│   │   ├── particles/
│   │   │   └── ParticleSystem.ts   # 粒子→文字 morphing 逻辑
│   │   ├── visitStore.ts           # localStorage 访问追踪 + 解锁状态
│   │   └── constants.ts            # 阈值、时间参数
│   ├── content/
│   │   ├── config.ts               # collection schemas (Zod)
│   │   ├── blog/                   # ← symlink to Obsidian vault
│   │   └── thoughts/               # Layer 2 碎片内容
│   ├── plugins/
│   │   ├── remark-obsidian-wikilinks.ts
│   │   └── remark-obsidian-callouts.ts
│   └── styles/
│       ├── global.css
│       ├── layer1.css
│       ├── layer2.css
│       └── typography.css
```

## 核心实现细节

### 1. Layer 0：粒子 → GAIVRT

- Canvas 2D 或 Three.js 粒子系统（~500-800 个粒子）
- 初始状态：粒子随机分布，缓慢漂浮
- 1s 后粒子开始向目标位置聚合，形成 "GAIVRT" 字样
- 字形目标坐标：用隐藏 canvas 绘制文字 → `getImageData` 采样像素点作为粒子目标
- 聚合完成后停留 1s → 粒子再次散开/淡出 → View Transition 进入 Layer 1
- 回访用户（localStorage 检测）：缩短为 1.5s 快速版或直接跳过

### 2. Layer 1：WebGL 涟漪

**Shader 架构：双 FBO ping-pong 水波模拟**

```
Mouse → rippleSim.frag (FBO A↔B) → ripple.frag (fullscreen quad overlay)
```

- `rippleSim.frag`：水波方程 `next = 2*current - prev + laplacian`，鼠标位置注入能量，衰减系数 ~0.97
- `ripple.frag`：波纹强度映射为白→黑的揭示程度，`alpha` 控制透明度让 HTML 内容可见
- Canvas 叠加策略：`position:fixed; pointer-events:none; z-index:10`，鼠标事件在 document 级别捕获传给 shader
- 性能监控：FPS < 30 降分辨率，< 15 关闭 WebGL 用 CSS fallback；tab 不可见时暂停 rAF

### 3. 裂缝系统（SVG）

- 30s 后触发，从页面边缘生长 3-5 条有机裂缝
- 算法：random walk + 角度偏移 + 概率分叉，输出 SVG `<path>` d 属性
- 动画：`stroke-dashoffset` 从全长到 0，模拟裂缝"生长"
- 点击裂缝 → 碎裂扩散动画（~800ms）→ `navigate('/depths')`
- 使用 `astro:before-preparation` 事件延迟导航等碎裂动画完成

### 4. Layer 2：深渊

- 纯黑背景，文字碎片用 CSS transform + rAF 缓慢漂浮
- 渐进解锁（visitStore.ts）：
  - 1-2 次访问：3-4 个基础碎片
  - 3 次：更多碎片 + 第一篇 thought
  - 5 次：全部 thoughts
  - 8 次：Core 入口微弱闪烁
  - 10 次：Core 完全可访问
- Core 页面：纯黑，停留 5s 后显示 "你来了"，别无他物

### 5. 第四面墙 Observer

- 纯 inline script，无框架依赖
- 18s 无操作后在页面边缘淡入半透明文字
- 文字池随机选取："你在找什么？" / "还在看？" / "你在这里停留了 {n} 秒"

### 6. Obsidian 集成

- `ln -s ~/ObsidianVault/blog src/content/blog`
- 自定义 remark 插件处理 `[[wikilinks]]` → `<a href="/surface/blog/slug">`
- 自定义 remark 插件处理 `> [!type]` callouts → styled div
- CI/部署时用 copy 替代 symlink

### 7. View Transitions

- Astro `<ClientRouter />` 启用页面间过渡
- L0→L1：标准 fade
- L1→L2：自定义碎裂动画 + fade to black
- L2 内部：subtle crossfade

## 实现阶段

### Phase 1：骨架搭建
- Astro 项目初始化 + 文件结构
- BaseLayout + Layer1Layout + 静态学术主页
- 路由结构 + View Transitions 配置
- 全局 CSS 变量（白/黑双色系统）

### Phase 2：内容管线
- Content Collections schema 定义
- Obsidian symlink + remark 插件（wikilinks, callouts）
- Blog 列表页 + 详情页渲染

### Phase 3：WebGL 涟漪
- Three.js scene + FBO ping-pong 水波模拟
- rippleSim.frag + ripple.frag shader
- RippleCanvas Solid island + canvas overlay 集成
- 性能监控 + 移动端 fallback

### Phase 4：裂缝 + Layer 2
- CrackGenerator 算法 + SVG 渲染 + 生长动画
- 裂缝点击 → 碎裂过渡 → Layer 2
- FloatingText 漂浮碎片 + visitStore 渐进解锁
- Core 页面

### Phase 5：Layer 0 + 微交互
- 粒子系统 → GAIVRT morphing 动画
- ObserverText 第四面墙
- BreathingCard 呼吸微动画
- 全流程联调 + 性能优化

### Phase 6：部署
- 静态构建验证
- 部署配置（届时根据盖尔选择的平台）
- SEO meta + OG image

## 验证方式

1. `yarn dev` 本地启动，走完 L0→L1→L2→Core 全流程
2. 检查 WebGL 涟漪在鼠标移动时正确显示白揭黑效果
3. 等待 30s 验证裂缝出现并可点击进入 Layer 2
4. 手动修改 localStorage 中 visit count 验证渐进解锁
5. 在移动端浏览器测试 fallback 效果
6. `yarn build` 验证静态输出无报错
7. Lighthouse 检查性能分数
