/**
 * Remark plugin: convert Obsidian callouts to styled divs.
 * Matches blockquote first-line pattern: [!type] optional title
 * Supported types: note, tip, warning, important, quote
 */

const CALLOUT_RE = /^\[!(\w+)\]\s*(.*)?$/;

function transformBlockquote(node: any): any[] | false {
  if (node.type !== 'blockquote' || !node.children?.length) return false;

  const firstChild = node.children[0];
  if (firstChild.type !== 'paragraph' || !firstChild.children?.length) return false;

  const firstText = firstChild.children[0];
  if (firstText.type !== 'text') return false;

  const lines = firstText.value.split('\n');
  const match = lines[0].match(CALLOUT_RE);
  if (!match) return false;

  const type = match[1].toLowerCase();
  const title = match[2]?.trim() || type.charAt(0).toUpperCase() + type.slice(1);

  // remove the callout marker line
  if (lines.length > 1) {
    firstText.value = lines.slice(1).join('\n');
  } else {
    firstChild.children.shift();
    if (firstChild.children.length === 0) {
      node.children.shift();
    }
  }

  // wrap children with HTML open/close nodes
  return [
    { type: 'html', value: `<div class="callout callout-${type}"><p class="callout-title">${title}</p>` },
    ...node.children,
    { type: 'html', value: '</div>' },
  ];
}

function walk(node: any) {
  if (!node.children) return;

  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    const result = transformBlockquote(child);
    if (result) {
      node.children.splice(i, 1, ...result);
    } else {
      walk(child);
    }
  }
}

export default function remarkObsidianCallouts() {
  return (tree: any) => {
    walk(tree);
  };
}
