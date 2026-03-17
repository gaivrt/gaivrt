import { defineConfig } from 'astro/config';
import solidJs from '@astrojs/solid-js';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import remarkObsidianWikilinks from './src/plugins/remark-obsidian-wikilinks';
import remarkObsidianCallouts from './src/plugins/remark-obsidian-callouts';
import remarkMarkHighlight from './src/plugins/remark-mark-highlight';
import remarkVideoEmbed from './src/plugins/remark-video-embed';

export default defineConfig({
  integrations: [solidJs()],
  output: 'static',
  markdown: {
    remarkPlugins: [
      remarkGfm,
      [remarkMath, { singleDollarTextMath: false }],
      remarkObsidianWikilinks,
      remarkObsidianCallouts,
      remarkMarkHighlight,
      remarkVideoEmbed,
    ],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, {
        behavior: 'prepend',
        properties: { className: ['heading-anchor'] },
      }],
      rehypeKatex,
    ],
  },
  vite: {
    assetsInclude: ['**/*.glsl'],
  },
});
