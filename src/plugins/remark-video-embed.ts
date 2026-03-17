/**
 * Remark plugin: auto-embed video URLs in standalone paragraphs.
 * Supports YouTube, Bilibili, and direct video files (.mp4, .webm, .ogg).
 */

const YOUTUBE_RE = /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/;
const BILIBILI_RE = /^https?:\/\/(?:www\.)?bilibili\.com\/video\/(BV[\w]+)/;
const VIDEO_EXT_RE = /\.(mp4|webm|ogg)$/i;

function getEmbedHtml(url: string): string | null {
  let match: RegExpMatchArray | null;

  match = url.match(YOUTUBE_RE);
  if (match) {
    return `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${match[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  }

  match = url.match(BILIBILI_RE);
  if (match) {
    return `<div class="video-embed"><iframe src="https://player.bilibili.com/player.html?bvid=${match[1]}&high_quality=1" frameborder="0" allowfullscreen loading="lazy" scrolling="no"></iframe></div>`;
  }

  if (VIDEO_EXT_RE.test(url)) {
    return `<div class="video-embed"><video controls preload="metadata"><source src="${url}" /></video></div>`;
  }

  return null;
}

function isStandaloneLink(paragraph: any): string | null {
  if (paragraph.type !== 'paragraph') return null;
  if (paragraph.children.length !== 1) return null;

  const child = paragraph.children[0];

  // bare URL as text node (autolinked by GFM or just raw text)
  if (child.type === 'text') {
    const trimmed = child.value.trim();
    if (/^https?:\/\//.test(trimmed)) return trimmed;
  }

  // link node wrapping the URL
  if (child.type === 'link') return child.url;

  return null;
}

export default function remarkVideoEmbed() {
  return (tree: any) => {
    if (!tree.children) return;

    for (let i = tree.children.length - 1; i >= 0; i--) {
      const node = tree.children[i];
      const url = isStandaloneLink(node);
      if (!url) continue;

      const html = getEmbedHtml(url);
      if (!html) continue;

      tree.children.splice(i, 1, { type: 'html', value: html });
    }
  };
}
