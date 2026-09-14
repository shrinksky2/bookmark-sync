import browser from 'webextension-polyfill';
import type { UnifiedBookmark } from '@/utils/types';

/**
 * 浏览器根节点下固定的几个位置，按索引映射为统一的逻辑名。
 * 无论浏览器语言如何，位置不变，以此保证跨浏览器对齐。
 */
export const ROOT_KEYS = ['书签栏', '其他书签', '移动设备书签'];

export async function readBookmarkTree(): Promise<UnifiedBookmark[]> {
  const tree = await browser.bookmarks.getTree();
  const result: UnifiedBookmark[] = [];

  function walk(
    node: browser.Bookmarks.BookmarkTreeNode,
    parentPath: string
  ) {
    const path = parentPath ? `${parentPath}/${node.title}` : node.title;

    result.push({
      id: path,
      parentId: parentPath || null,
      title: node.title,
      url: node.url,
      index: node.index ?? 0,
    });

    for (const child of node.children ?? []) {
      walk(child, path);
    }
  }

  const root = tree[0];
  if (!root) return result;

  const children = root.children ?? [];
  children.forEach((child, i) => {
    // 用逻辑名代替真实标题（"书签栏"/"收藏夹栏"/"书签工具栏" → "书签栏"）
    const logicalName = ROOT_KEYS[i] ?? `__root_${i}__`;
    const logicalChild: browser.Bookmarks.BookmarkTreeNode = {
      ...child,
      title: logicalName,
    };
    walk(logicalChild, '');
  });

  return result;
}