/**
 * Remark plugin: convert Obsidian [[wikilinks]] to HTML links.
 * Supports [[target]] and [[target|display]] syntax.
 */

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function toSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function visitText(node: any, parent: any, index: number) {
  if (node.type !== 'text') return;

  const value: string = node.value;
  if (!value.includes('[[')) return;

  const children: any[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(WIKILINK_RE)) {
    const [full, target, display] = match;
    const start = match.index!;

    // text before the wikilink
    if (start > lastIndex) {
      children.push({ type: 'text', value: value.slice(lastIndex, start) });
    }

    // the link itself
    children.push({
      type: 'link',
      url: `/surface/blog/${toSlug(target)}`,
      children: [{ type: 'text', value: display?.trim() || target.trim() }],
    });

    lastIndex = start + full.length;
  }

  if (children.length === 0) return;

  // trailing text
  if (lastIndex < value.length) {
    children.push({ type: 'text', value: value.slice(lastIndex) });
  }

  // splice new nodes in place of the original text node
  parent.children.splice(index, 1, ...children);
}

function walk(node: any, parent?: any, index?: number) {
  if (parent !== undefined && index !== undefined) {
    visitText(node, parent, index);
  }
  if (node.children) {
    // iterate backwards so splicing doesn't mess up indices
    for (let i = node.children.length - 1; i >= 0; i--) {
      walk(node.children[i], node, i);
    }
  }
}

export default function remarkObsidianWikilinks() {
  return (tree: any) => {
    walk(tree);
  };
}
