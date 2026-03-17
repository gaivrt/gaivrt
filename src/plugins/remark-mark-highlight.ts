/**
 * Remark plugin: convert ==highlighted text== to <mark> tags.
 * Matches Obsidian's highlight syntax.
 */

const MARK_RE = /==(.*?)==/g;

function visitText(node: any, parent: any, index: number) {
  if (node.type !== 'text') return;

  const value: string = node.value;
  if (!value.includes('==')) return;

  const children: any[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(MARK_RE)) {
    const [full, content] = match;
    const start = match.index!;

    if (start > lastIndex) {
      children.push({ type: 'text', value: value.slice(lastIndex, start) });
    }

    children.push({ type: 'html', value: `<mark>${content}</mark>` });
    lastIndex = start + full.length;
  }

  if (children.length === 0) return;

  if (lastIndex < value.length) {
    children.push({ type: 'text', value: value.slice(lastIndex) });
  }

  parent.children.splice(index, 1, ...children);
}

function walk(node: any, parent?: any, index?: number) {
  if (parent !== undefined && index !== undefined) {
    visitText(node, parent, index);
  }
  if (node.children) {
    for (let i = node.children.length - 1; i >= 0; i--) {
      walk(node.children[i], node, i);
    }
  }
}

export default function remarkMarkHighlight() {
  return (tree: any) => {
    walk(tree);
  };
}
