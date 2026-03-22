# Particle Entrance 粒子入场系统

全屏 Canvas 2D 粒子动画，粒子从随机位置聚合成文字 "GAIVRT"，配色取自五幅经典画作，鼠标交互产生排斥力场。

## 文件结构

```
src/
├── pages/index.astro                        # 入口页，挂载 Solid.js island
├── components/entrance/ParticleEntrance.tsx  # Solid.js 组件，生命周期管理
├── lib/particles/
│   ├── ParticleText.ts    # 核心引擎（采样、物理、渲染）
│   ├── palettes.ts        # 5 套画作配色 + smoothstep 混合
│   ├── noise.ts           # Perlin 2D 噪声（色彩分布）
│   └── types.ts           # 类型定义
├── lib/constants.ts       # 所有可调参数集中管理
├── lib/visitStore.ts      # localStorage 访问计数
└── lib/webgl/performanceMonitor.ts  # FPS 监控与降级
```

## 1. 文字采样：从像素到粒子

将文字渲染到离屏 canvas，逐像素扫描 alpha 通道提取粒子位置。完整的 `buildParticles()` 实现：

```typescript
private buildParticles(): void {
  const { W, H, config } = this;
  this.particles = [];

  // 1. 离屏 canvas 绘制文字
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const o = off.getContext('2d')!;

  const fs = Math.min(W * config.fontSizeRatio, config.maxFontSize);
  // fontSizeRatio=0.18, maxFontSize=280 → 1920px 宽时 fs=280px
  o.font = `${config.fontWeight} ${fs}px ${config.fontFamily}`;
  // fontWeight=700, fontFamily='Georgia, serif'
  o.fillStyle = '#000';
  o.textAlign = 'center';
  o.textBaseline = 'middle';
  o.fillText(config.text, W / 2, H / 2);

  // 2. 扫描像素，提取粒子
  const data = o.getImageData(0, 0, W, H).data;
  const gap = Math.max(3, Math.round(W / 280));
  // 1920px → gap=7, 1440px → gap=5, 768px → gap=3
  const sizeScale = Math.min(W, H) / 1000;  // 基准：短边 1000px

  for (let y = 0; y < H; y += gap) {
    for (let x = 0; x < W; x += gap) {
      if (data[(y * W + x) * 4 + 3] > 128) {   // alpha 通道 > 128
        if (Math.random() > config.skipProbability) continue;
        // skipProbability=0.78 → 78% 保留，22% 丢弃

        // 三级大小分布
        const r = Math.random();
        const size = (r < 0.05
          ? 12 + Math.random() * 8     // 5%: 大粒子 12-20px（视觉锚点）
          : r < 0.25
            ? 8 + Math.random() * 5    // 20%: 中粒子 8-13px
            : 5 + Math.random() * 4    // 75%: 小粒子 5-9px（填充细节）
        ) * sizeScale;

        this.particles.push({
          hx: x, hy: y,                                    // home 位置
          x: x + (Math.random() - 0.5) * W * 0.5,          // 初始散布 ±25% 视口
          y: y + (Math.random() - 0.5) * H * 0.5,
          vx: 0, vy: 0,
          size,
          jh: (Math.random() - 0.5) * 15,   // 色相 jitter ±7.5
          js: (Math.random() - 0.5) * 8,    // 饱和度 jitter ±4
          jl: (Math.random() - 0.5) * 10,   // 明度 jitter ±5
          alpha: 0.45 + Math.random() * 0.30, // 基础透明度 [0.45, 0.75]
          phase: Math.random() * Math.PI * 2,  // 呼吸初相（随机）
          breathSpeed: 0.006 + Math.random() * 0.011, // 呼吸频率 0.006-0.017
        });
      }
    }
  }

  // 大粒子先画（底层），小粒子后画（顶层）
  this.particles.sort((a, b) => b.size - a.size);
}
```

### 采样参数要点

- **gap**：`Math.max(3, Math.round(W / 280))`。视口越宽 gap 越大，保持粒子总数可控（1920px 时 gap≈7）
- **字体**：Georgia, serif, weight 700。`fs = min(W × 0.18, 280)` 确保大屏不超 280px
- **sizeScale**：`min(W, H) / 1000`，短边 1000px 为基准，移动端粒子自动缩小

### 粒子大小分布

| 概率 | 基础大小 (px) | 说明 |
|------|---------------|------|
| 5%   | 12 – 20       | 大粒子，视觉锚点 |
| 20%  | 8 – 13        | 中粒子 |
| 75%  | 5 – 9         | 小粒子，填充细节 |

渲染顺序：按 size 降序排列（大粒子先画，小粒子覆盖在上层）。

### 基础透明度

```typescript
alpha: 0.45 + Math.random() * 0.30   // 范围 [0.45, 0.75]
```

半透明粒子叠加产生油画般的深度感。没有粒子是完全不透明的。

### 粒子数量估算

以 1920×1080 为例：
- 文字 "GAIVRT"（font-size ≈ 280px）覆盖的像素区域约 1200×280 ≈ 336,000 px²
- gap = 7px → 采样网格 ≈ 336,000 / 49 ≈ 6,857 个候选点
- skipProbability 0.78 保留 ≈ 5,349 个粒子
- 实际数量随字体渲染和 alpha 阈值略有浮动，通常在 **4,000–6,000** 之间

### 渲染方式

每个粒子渲染为一个填充圆（`ctx.arc` + `ctx.fill`）：
- 颜色格式：`hsla(h, s%, l%, alpha)` — 色相/饱和度/明度由噪声和配色决定，alpha 由呼吸脉动调制
- 无描边（stroke）、无阴影（shadow）、无模糊（blur）
- Canvas `globalCompositeOperation` 保持默认 `source-over`：后画的粒子叠在先画的上面

### 层叠与深度

粒子按 size **降序**排列后渲染：

```
底层：大粒子（12-20px）—— 色块感强、alpha 偏低，像远处的色团
中层：中粒子（8-13px）—— 细化轮廓
顶层：小粒子（5-9px）—— 锐利细节点，alpha 偏高时产生高光感
```

这种大底小顶的叠画法模拟了油画"先铺色块、再点细节"的层次。由于所有粒子都半透明，底层大粒子的颜色会透过上层小粒子渗出，形成丰富的色彩混合。

### 覆盖密度与重叠

粒子间距 gap=7px，但粒子直径 10–40px（半径 5–20px），远大于间距。聚合到 home 位置后粒子之间**高度重叠**——每个像素点平均被 3–5 个粒子覆盖。

这种密集重叠是效果的关键：
- 半透明圆叠加形成渐变色过渡，消除了"单个圆点"的颗粒感
- 文字内部呈现厚实的"涂抹"质感，像颜料堆叠
- 重叠区域的 alpha 累积使文字中心比边缘更浓密

### 文字边缘质感

文字边缘不是锐利的直线，而是自然的"毛边"：
- **alpha 阈值 > 128**：字体抗锯齿产生的半透明边缘像素被过滤掉，边界本身就不规则
- **skipProbability 0.78**：22% 的候选点被随机丢弃，在边缘处形成稀疏空洞
- **粒子大小随机**：边缘处的粒子可能很大（伸出文字外）或很小（缩进文字内）
- 综合效果：文字像是用粗毛笔写的，边缘有有机的毛刺和呼吸感

## 2. 入场散布动画

粒子的 home 位置 `(hx, hy)` 是文字采样点，初始位置随机偏移：

```typescript
x: hx + (Math.random() - 0.5) * W * 0.5   // ±25% 视口宽
y: hy + (Math.random() - 0.5) * H * 0.5   // ±25% 视口高
```

页面加载后，弹簧力将每个粒子拉向 home 位置，形成从混沌到文字的聚合动画。

## 3. 物理模型

每帧（requestAnimationFrame）对每个粒子执行。完整 `update()` 实现：

```typescript
private update(): void {
  this.frame++;
  const { config, mouse, particles } = this;
  const mr2 = config.mouseRadius * config.mouseRadius;  // 80² = 6400

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // ① 弹簧回弹力：位移 × springForce(0.028)
    //    位移越大回弹越强——这是粒子聚合成文字的驱动力
    let fx = (p.hx - p.x) * config.springForce;
    let fy = (p.hy - p.y) * config.springForce;

    // ② 鼠标排斥力：inverse-square + force softening
    const dx = p.x - mouse.x;
    const dy = p.y - mouse.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < mr2 && d2 > 1) {  // 在 mouseRadius(80px) 内
      const floor2 = config.repulsionFloor * config.repulsionFloor; // 20² = 400
      const f = config.repulsion / Math.max(d2, floor2);
      // repulsion=1500, d=40px → f=1500/1600=0.94
      // d=10px → 无 softening: f=1500/100=15（爆炸）
      //        → 有 softening: f=1500/400=3.75（钳制）
      const d = Math.sqrt(d2);
      fx += (dx / d) * f;   // 方向：从鼠标指向粒子
      fy += (dy / d) * f;
    }

    // ③ 速度更新：阻尼衰减
    //    damping=0.87 → 每帧保留 87% 速度，~5 帧后速度减半
    p.vx = (p.vx + fx) * config.damping;
    p.vy = (p.vy + fy) * config.damping;
    p.x += p.vx;
    p.y += p.vy;
  }
}
```

### Force softening 原理

鼠标快速移动时，帧间位置跳跃大，某些粒子突然处于 d≈5px 的极近距离。不加 softening 时 `f = 1500/25 = 60`，瞬间将粒子弹飞到屏幕边缘。

`repulsionFloor = 20px` 将距离平方钳制到 `max(d², 400)`，d < 20px 时力不超过 3.75。d ≥ 20px 时完全不受影响，正常交互手感不变。

### 参数一览

| 参数 | 值 | 作用 |
|------|-----|------|
| `SPRING_FORCE` | 0.028 | 回弹力系数 |
| `DAMPING` | 0.87 | 速度衰减率（每帧保留 87%） |
| `MOUSE_RADIUS` | 80px | 排斥力作用范围 |
| `REPULSION` | 1500 | 排斥力强度（inverse-square 分子） |
| `REPULSION_FLOOR` | 20px | 力场软化最小距离 |

## 4. 配色系统：五幅画作

五套配色分别取自经典画作的色调，每套包含背景色 (RGB) 和 8 个 HSL 色相：

| 序号 | 画作 | 主色调 | 背景 RGB |
|------|------|--------|----------|
| 0 | Monet · Water Lilies | 青绿、淡蓝、薰衣草 | (240, 237, 228) |
| 1 | Vermeer · Pearl Earring | 钴蓝、赭黄、暖棕 | (242, 237, 226) |
| 2 | Hokusai · The Great Wave | 靛蓝、深蓝、沙金 | (244, 240, 229) |
| 3 | Klimt · The Kiss | 金黄、琥珀、铜绿 | (242, 237, 224) |
| 4 | Yoshida · Misty Landscapes | 雾绿、灰蓝、暖米 | (240, 237, 230) |

所有背景色都在暖白纸色范围 `rgb(240±4, 237±3, 224–230)` 内，确保任何过渡时刻都不会出现突兀色差。

### 配色数据完整代码

```typescript
// palettes.ts — 每套配色包含 bg(RGB) + 8 个 HSL 色相
export const PALETTES: Palette[] = [
  {
    name: 'Monet · Water Lilies',
    bg: [240, 237, 228],
    hues: [
      { h: 160, s: 18, l: 62 }, { h: 175, s: 15, l: 68 },
      { h: 210, s: 20, l: 65 }, { h: 195, s: 16, l: 72 },
      { h: 50, s: 22, l: 72 }, { h: 140, s: 14, l: 58 },
      { h: 280, s: 10, l: 70 }, { h: 30, s: 18, l: 75 },
    ],
  },
  {
    name: 'Vermeer · Pearl Earring',
    bg: [242, 237, 226],
    hues: [
      { h: 215, s: 28, l: 52 }, { h: 220, s: 18, l: 62 },
      { h: 42, s: 30, l: 65 }, { h: 35, s: 22, l: 72 },
      { h: 25, s: 16, l: 60 }, { h: 200, s: 12, l: 70 },
      { h: 15, s: 18, l: 68 }, { h: 180, s: 10, l: 65 },
    ],
  },
  {
    name: 'Hokusai · The Great Wave',
    bg: [244, 240, 229],
    hues: [
      { h: 215, s: 30, l: 55 }, { h: 220, s: 22, l: 62 },
      { h: 210, s: 18, l: 68 }, { h: 228, s: 20, l: 58 },
      { h: 42, s: 25, l: 74 }, { h: 38, s: 18, l: 70 },
      { h: 200, s: 16, l: 64 }, { h: 195, s: 14, l: 72 },
    ],
  },
  {
    name: 'Klimt · The Kiss',
    bg: [242, 237, 224],
    hues: [
      { h: 42, s: 35, l: 58 }, { h: 35, s: 28, l: 55 },
      { h: 48, s: 22, l: 68 }, { h: 28, s: 30, l: 52 },
      { h: 80, s: 15, l: 58 }, { h: 55, s: 18, l: 62 },
      { h: 18, s: 20, l: 58 }, { h: 120, s: 10, l: 62 },
    ],
  },
  {
    name: 'Yoshida · Misty Landscapes',
    bg: [240, 237, 230],
    hues: [
      { h: 150, s: 14, l: 65 }, { h: 160, s: 10, l: 72 },
      { h: 200, s: 15, l: 62 }, { h: 210, s: 12, l: 68 },
      { h: 40, s: 14, l: 74 }, { h: 30, s: 10, l: 70 },
      { h: 170, s: 12, l: 58 }, { h: 100, s: 8, l: 68 },
    ],
  },
];
```

### 配色过渡：smoothstep 混合

5 套配色以 smoothstep 曲线循环过渡，周期 54000 帧（约 15 分钟 @60fps）：

```typescript
export function getBlendedPalette(t: number): BlendedPalette {
  const total = PALETTES.length;  // 5
  const phase = (t % 1) * total;   // t ∈ [0,1) → phase ∈ [0,5)
  const i = Math.floor(phase) % total;
  const j = (i + 1) % total;
  const f = phase - Math.floor(phase);
  const sm = f * f * (3 - 2 * f);  // smoothstep：消除线性插值的棱角

  const A = PALETTES[i];
  const B = PALETTES[j];
  const hues: HSL[] = [];
  for (let k = 0; k < A.hues.length; k++) {
    hues.push(lerpHSL(A.hues[k], B.hues[k], sm));  // 8 个色相逐一插值
  }
  const bg: [number, number, number] = [
    lerpNum(A.bg[0], B.bg[0], sm),
    lerpNum(A.bg[1], B.bg[1], sm),
    lerpNum(A.bg[2], B.bg[2], sm),
  ];
  return { hues, bg, nameA: A.name, nameB: B.name };
}

// 调用侧：cycleT = (frame / 54000) % 1
```

其中 `lerpHSL` 和 `lerpNum` 是简单的线性插值：

```typescript
function lerpHSL(a: HSL, b: HSL, t: number): HSL {
  return { h: a.h + (b.h - a.h) * t, s: a.s + (b.s - a.s) * t, l: a.l + (b.l - a.l) * t };
}
function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
```

smoothstep `f²(3-2f)` 使得在每套配色的"中心时段"几乎纯净呈现，只在过渡区段平滑混合。

### 五段过渡的视觉特征

完整周期 54000 帧（~15 分钟 @60fps），每段约 10800 帧（~3 分钟）。下面是每对相邻配色的过渡分析，包含主要色相变化和中间态特征。

#### ① Monet → Vermeer（池塘绿光 → 蓝金对比）

```
Monet 主色域:  h=140–210（青绿/蓝绿）+ h=50(黄) + h=280(紫) + h=30(橙)
Vermeer 主色域: h=215–220（钴蓝）+ h=15–42(赭黄/橙) + h=180–200(青)

关键色相迁移:
  hue[0]: 160→215  青绿 → 钴蓝（+55°）
  hue[4]:  50→25   黄 → 暖橙（-25°）
  hue[5]: 140→200  翠绿 → 青灰（+60°）
  hue[6]: 280→15   薰衣草紫 → 暖红橙（-265°，跨越色环）

中间态: 绿色调退场，蓝色加深，暖黄变为赭橙。过渡中段出现
       蓝绿与赭黄并存的"傍晚水面"感——Monet 的朦胧与 Vermeer
       的戏剧光影交汇。饱和度从 10–22% 提升到 12–30%，画面变浓。
```

#### ② Vermeer → Hokusai（蓝金光影 → 深蓝浪涛）

```
Vermeer 主色域: h=215–220（蓝）+ h=15–42(暖) + h=180–200(青)
Hokusai 主色域: h=195–228（蓝）+ h=38–42(金沙) 几乎纯蓝

关键色相迁移:
  hue[2]:  42→210  赭黄 → 蓝灰（+168°，最大跨度）
  hue[3]:  35→228  琥珀 → 靛蓝（+193°）
  hue[5]: 200→38   青 → 金沙（-162°，反向大跨度）
  hue[6]:  15→200  暖红 → 青灰（+185°）

中间态: Vermeer 的暖色调被蓝色吞没。这段过渡最"动荡"——4 个色相
       跨越 >160°，中间态经过大片绿色区域（h≈100–130），产生一种
       短暂的"翡翠"过渡色，随后迅速沉入 Hokusai 的深蓝。
       背景从 (242,237,226) 微移至 (244,240,229)，略微变亮。
```

#### ③ Hokusai → Klimt（蓝色浪涛 → 金色拥吻）

```
Hokusai 主色域: h=195–228（蓝）+ h=38–42(点缀金)
Klimt 主色域:   h=18–80（金/琥珀/橄榄）+ h=120(铜绿)

关键色相迁移（最剧烈的一段过渡）:
  hue[0]: 215→42   蓝 → 金（-173°）
  hue[1]: 220→35   蓝 → 琥珀（-185°）
  hue[2]: 210→48   蓝 → 金（-162°）
  hue[3]: 228→28   靛 → 橙（-200°）

中间态: 全部 8 个色相中有 6 个发生 >100° 的迁移，是最戏剧性的过渡。
       中间态经过 h≈128（蓝绿/青铜），产生一种短暂的"铜锈"或"古铜绿"
       质感——恰好呼应 Klimt 金箔画中金属氧化的肌理。
       饱和度从 14–30% 跃升至 15–35%，明度从 55–74 降至 52–68，
       画面变得更浓郁厚重。
```

#### ④ Klimt → Yoshida（金色热烈 → 雾中静谧）

```
Klimt 主色域:   h=18–80（暖金）+ h=120(铜绿)
Yoshida 主色域: h=100–210（雾绿/灰蓝）+ h=30–40(微暖)

关键色相迁移:
  hue[0]: 42→150   金 → 灰绿（+108°）
  hue[1]: 35→160   琥珀 → 薄荷（+125°）
  hue[2]: 48→200   金 → 灰蓝（+152°）
  hue[3]: 28→210   橙 → 雾蓝（+182°）

中间态: 金色逐渐被绿色稀释。中间态在 h≈90–100（黄绿/橄榄），
       产生"初秋"的感觉——Klimt 的金叶褪色为 Yoshida 的山间薄雾。
       饱和度从 15–35% 降至 8–15%，是全周期中最显著的"降饱和"过渡，
       画面从浓烈变为素淡。
```

#### ⑤ Yoshida → Monet（雾中山水 → 池塘绿光，循环回起点）

```
Yoshida 主色域: h=100–210（雾绿/灰蓝）+ h=30–40(微暖)
Monet 主色域:   h=140–210（青绿/蓝绿）+ h=50(黄) + h=280(紫)

关键色相迁移（最柔和的一段）:
  hue[0]: 150→160   灰绿 → 青绿（仅 +10°）
  hue[1]: 160→175   薄荷 → 蓝绿（+15°）
  hue[6]: 170→280   青 → 薰衣草紫（+110°，唯一大跨度）
  hue[7]: 100→30    橄榄 → 暖橙（-70°）

中间态: 最平静的过渡。两套配色共享大量蓝绿色域，大部分色相仅微移
       10–30°。唯一的惊喜是 hue[6] 从青色跃迁到薰衣草紫——像雾气
       散去后池塘里透出一缕紫色倒影。循环完成，回到 Monet 起点。
```

### 过渡时间轴总览

```
0:00  ──── Monet（青绿朦胧）────────────  3:00
3:00  ──── Vermeer（蓝金戏剧）──────────  6:00
6:00  ──── Hokusai（深蓝浪涛）──────────  9:00
9:00  ──── Klimt（金色拥吻）──────────── 12:00
12:00 ──── Yoshida（雾中静谧）────────── 15:00 → 循环

每段约 3 分钟。smoothstep 使得每段中间 ~60% 的时间呈现纯净配色，
前后各 ~20% 是与相邻配色的渐变过渡区。
```

## 5. Perlin 2D 噪声

噪声场决定粒子的空间色彩分布。完整实现：

```typescript
// noise.ts
export function createNoise2D(): (x: number, y: number) => number {
  // 生成随机排列表（permutation table）
  const p: number[] = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 256; i++) p[256 + i] = p[i]; // 复制一倍避免越界

  // 5 阶 Hermite 插值（比 3 阶更平滑）
  function fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function lerp(a: number, b: number, t: number) {
    return a + t * (b - a);
  }
  // 4 方向梯度（简化版，仅用 2 个低位选方向）
  function grad(h: number, x: number, y: number) {
    const v = h & 3;
    return ((v & 1) ? -x : x) + ((v & 2) ? -y : y);
  }

  return (x: number, y: number): number => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const A = p[X] + Y;
    const B = p[X + 1] + Y;
    return lerp(
      lerp(grad(p[A], x, y), grad(p[B], x - 1, y), u),
      lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u),
      v,
    );
  };
}
```

输出范围 [-1, 1]。`noiseScale = 0.012` → 一个噪声周期约 83px，形成肉眼可见的"色域"。`noiseDrift = 0.0004`/帧使色域缓慢蠕动（完整流动周期 ~57 分钟 @60fps）。

## 6. 渲染：噪声上色 + 呼吸 + 绘制

完整的 `render()` 实现，包含噪声色彩分布、呼吸脉动和最终绘制：

```typescript
private render(): void {
  const { ctx, W, H, frame, config, noise, particles } = this;
  const cycleT = (frame / config.cycleFrames) % 1;
  const blend = getBlendedPalette(cycleT);  // 当前混合配色

  // ① 绘制背景（含 dark mode 适配）
  const bgR = this.darkMode ? blend.bg[0] * 0.07 + 6 : blend.bg[0];
  const bgG = this.darkMode ? blend.bg[1] * 0.07 + 4 : blend.bg[1];
  const bgB = this.darkMode ? blend.bg[2] * 0.07 + 2 : blend.bg[2];
  ctx.fillStyle = `rgb(${Math.round(bgR)},${Math.round(bgG)},${Math.round(bgB)})`;
  ctx.fillRect(0, 0, W, H);

  const timeOff = frame * config.noiseDrift;  // 0.0004/帧，色彩缓慢流动
  const hueCount = blend.hues.length;          // 8 个色相

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // ② Perlin 噪声采样 → 色相插值
    const nv = noise(
      p.hx * config.noiseScale + timeOff,        // noiseScale=0.012
      p.hy * config.noiseScale + timeOff * 0.7    // y 轴漂移稍慢，避免对称
    );
    const v = (nv + 1) / 2;                       // [-1,1] → [0,1]
    const idx = v * (hueCount - 1);                // → [0,7]
    const ii = Math.floor(idx);
    const ff = idx - ii;                           // 小数部分用于插值

    // 在相邻两个色相之间线性插值 + 粒子 jitter
    const ca = blend.hues[Math.min(ii, hueCount - 1)];
    const cb = blend.hues[Math.min(ii + 1, hueCount - 1)];
    const ch = ca.h + (cb.h - ca.h) * ff + p.jh;  // 色相 + jitter(±7.5)
    const cs = ca.s + (cb.s - ca.s) * ff + p.js;  // 饱和度 + jitter(±4)
    const cl = ca.l + (cb.l - ca.l) * ff + p.jl;  // 明度 + jitter(±5)

    // ③ 呼吸脉动
    const br = Math.sin(p.phase + frame * p.breathSpeed);
    const s = p.size * (0.86 + br * 0.14);         // 大小 ±14%
    const dh = Math.sqrt((p.x - p.hx) ** 2 + (p.y - p.hy) ** 2);
    const al = p.alpha * (
      0.85 + br * 0.15                              // 透明度 ±15%
      + Math.min(1, dh / 50) * 0.3                  // 离 home 越远越亮
    );

    // ④ 绘制填充圆
    ctx.beginPath();
    ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${Math.round(ch)},${Math.round(cs + br * 5)}%,${Math.round(cl + br * 5)}%,${al.toFixed(3)})`;
    // 饱和度/明度额外 ±5 的呼吸调制
    ctx.fill();
  }
}
```

### 色彩 jitter

每个粒子创建时获得随机偏移，打破噪声场的均匀感：

| 属性 | 范围 | 作用 |
|------|------|------|
| `jh` | ±7.5 | 色相偏移 |
| `js` | ±4   | 饱和度偏移 |
| `jl` | ±5   | 明度偏移 |

### 呼吸脉动细节

- `phase`：随机初相 `[0, 2π)`，确保粒子不同步
- `breathSpeed`：0.006–0.017 随机，避免整体节奏感
- **距离激活项**：`min(1, distFromHome / 50) × 0.3` — 粒子被鼠标推离 home 位置时变亮，50px 处达到最大增益 +0.3，增强交互的视觉反馈

## 7. 性能监控与降级

`PerformanceMonitor` 滑动窗口（60 帧）统计平均 FPS：

| 阈值 | 动作 |
|------|------|
| FPS < 30 | 触发 `onLowFps`（当前入场页未做额外处理） |
| FPS < 15 | 触发 `onCriticalFps` → 销毁引擎 → 直接跳转 `/surface/` |

页面 `visibilitychange` 时暂停/恢复引擎，恢复时重置 monitor 避免误判。

## 8. 访问计数与入场跳过

基于 localStorage 的访问计数（`visitStore.ts`）控制入场行为：

```
visits ≤ 1  → 完整入场，4s 后显示 "click anywhere to enter"
visits 2-3  → 入场，1.5s 后显示提示
visits > 3  → 75% 概率直接跳转 /surface/，25% 概率仍显示入场
```

退出动画：click/keydown → opacity 0（0.35s ease-out）→ `location.replace('/surface/')`。

## 9. 响应式与触摸

- Canvas 尺寸 = `window.innerWidth × innerHeight`，乘以 `devicePixelRatio` 保证 Retina 清晰
- `window.resize` → 300ms debounce → 重新 setupSize + buildParticles
- 触摸设备：`touchmove`（passive: false，阻止滚动）映射到鼠标坐标，`touchend` 清除鼠标位置

## 10. 引擎生命周期

`ParticleText` 遵循 `constructor → start → stop → dispose` 模式（与 `RippleEffect` 一致）：

```
constructor(canvas, config?)  → 获取 2D context，合并配置
start()                       → 等待字体加载 → setupSize → buildParticles → 启动 rAF 循环
stop()                        → 暂停 rAF（可恢复）
dispose()                     → stop + 清空粒子数组 + 清除 resize timer
```

组件层（`ParticleEntrance.tsx`）在 `onMount` 中创建引擎，`onCleanup` 中 dispose。

### 主循环帧结构

```typescript
private loop = (time: number): void => {
  if (!this.running) return;
  this.onFrame?.(time);    // ① 性能监控 hook
  this.update();            // ② 物理（弹簧 + 排斥）
  this.render();            // ③ 清屏 + 逐粒子绘制
  this.rafId = requestAnimationFrame(this.loop);
};
```

箭头函数绑定 `this`，确保 rAF 回调中 `this` 指向引擎实例。每帧固定顺序：监控 → 物理 → 渲染。

### 字体加载等待

```typescript
async start(): Promise<void> {
  if (this.running) return;
  this.running = true;
  await document.fonts.ready;   // 关键：等字体加载完成
  this.setupSize();
  this.buildParticles();
  this.loop(performance.now());
}
```

`buildParticles()` 在离屏 canvas 上 `fillText` 采样文字像素。如果字体尚未加载，浏览器会用 fallback 字体渲染，导致采样出的粒子形状与最终字体不匹配。`await document.fonts.ready` 确保 Georgia 字体就绪后才开始采样。

## 11. 页面集成

### 页面级 CSS（index.astro）

```css
#entrance {
  background: #f0ede4;      /* 暖白，与 palette 背景色协调 */
  position: fixed;
  inset: 0;                  /* 全屏铺满 */
}
:global([data-theme="dark"]) #entrance {
  background: #141210;       /* 深暖黑 */
}
```

Canvas 在 `#entrance` 内全屏渲染，无边距无滚动。背景色 `#f0ede4` 与 Monet 配色的 `rgb(240,237,228)` 接近，确保 canvas 首帧渲染前不会闪白。

### Dark mode 检测

```typescript
engine.darkMode = document.documentElement.getAttribute('data-theme') === 'dark';
```

通过 `<html data-theme="dark">` 属性判断，而非 `prefers-color-scheme` 媒体查询。引擎根据 `darkMode` 标志调整背景色（见 render 中的 `×0.07 + 偏移` 公式）。

### Astro 挂载方式

```astro
<ParticleEntrance client:only="solid-js" />
```

`client:only="solid-js"` 表示此组件仅在客户端渲染（无 SSR），因为 Canvas API 在服务端不可用。

## 12. 退出过渡与交互

### 退出触发

- **Click**：任意位置点击
- **Keyboard**：除 Tab / Shift / Control / Alt / Meta 外的任意键

触发后：
1. `setExiting(true)` → 容器 `opacity: 0`（CSS `transition: 0.35s ease-out`）
2. 350ms 后 `location.replace('/surface/')` — 用 replace 确保浏览器后退键不会回到入场页

### 提示文字

"click anywhere to enter"，绝对定位于底部 12%，居中：
- 字体：Inter, system-ui, 14px, letter-spacing 0.1em
- 颜色：`rgba(80, 75, 65, 0.5)`（暗色模式 `rgba(200, 190, 175, 0.45)`）
- 淡入时机：首次访问 4s 后，回访 1.5s 后
- `pointer-events: none; user-select: none` — 不干扰点击事件

### Canvas DPR 适配

```typescript
const dpr = window.devicePixelRatio || 1;
canvas.width  = W * dpr;    // 物理像素
canvas.height = H * dpr;
canvas.style.width  = W + 'px';   // CSS 像素
canvas.style.height = H + 'px';
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);  // 缩放绘图坐标
```

所有绘图逻辑使用 CSS 像素坐标，DPR 仅影响 canvas buffer 分辨率。

### Noscript fallback

```html
<noscript><meta http-equiv="refresh" content="0;url=/surface/" /></noscript>
```

无 JS 环境直接跳转到主站。

### 事件监听层

所有事件绑定在 `document` 级别（非 canvas 级别），确保全屏任意位置的交互都能被捕获。`touchmove` 使用 `{ passive: false }` 以阻止 iOS Safari 的默认滚动行为。

## 13. 复现指南

要在其他项目中复现此效果，核心步骤：

1. **文字采样**：离屏 canvas 绘制文字 → getImageData → 扫描 alpha > 128 的像素点
2. **弹簧-阻尼物理**：每个粒子有 home 位置 + 当前位置，弹簧力驱动聚合，阻尼控制稳定性
3. **鼠标排斥**：inverse-square 力场，加 force softening 防止极端值
4. **Perlin 噪声上色**：用粒子的 home 坐标采样噪声 → 映射到配色 palette 插值
5. **配色循环**：多套配色用 smoothstep 插值循环过渡
6. **呼吸脉动**：独立正弦周期控制 size / alpha / saturation，随机初相和频率

关键数值参考 `src/lib/constants.ts` 的 `ENTRANCE` block。
