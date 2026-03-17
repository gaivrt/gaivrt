---
title: "Hello World"
date: 2025-01-15
description: "第一篇测试文章，验证 blog 管线、wikilinks 和 callouts。"
tags: ["meta", "test"]
---

# Hello World

这是 GAIVRT 的第一篇 blog 文章，用来验证内容管线是否正常工作。

## Wikilinks 测试

这里有一个 wikilink：[[Hello World]]，以及一个带 display text 的：[[Hello World|回到本文]]。

## Callout 测试

> [!note] 备注
> 这是一个 note callout，用来展示重要信息。

> [!warning]
> 这是一个 warning callout，没有自定义标题。

> [!tip] 小技巧
> Obsidian 的 callout 语法很方便，可以直接在 markdown 里写。

## 代码块

```js
console.log('Hello from GAIVRT');
```

## 表格测试

| 功能 | 状态 | 备注 |
|------|------|------|
| Wikilinks | 已完成 | Obsidian 兼容 |
| Callouts | 已完成 | 支持多种类型 |
| 表格 | 已完成 | GFM 语法 |
| 数学公式 | 已完成 | KaTeX 渲染 |

## 数学公式

行内公式：质能方程 $$E = mc^2$$，以及欧拉公式 $$e^{i\pi} + 1 = 0$$。

行间公式：

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

## 任务列表

- [x] 搭建 Astro 项目
- [x] 实现 blog 管线
- [ ] 添加搜索功能
- [ ] 部署到生产环境

## 高亮测试

这段文字中有 ==高亮内容== ，用来测试 mark 语法。

## 脚注测试

这是一段带脚注的文字[^1]，还有另一个脚注[^2]。

[^1]: 这是第一个脚注的内容。
[^2]: 这是第二个脚注，支持 GFM 脚注语法。

## 删除线

这是 ~~被删除的文字~~ 测试。

---

普通段落收尾。
