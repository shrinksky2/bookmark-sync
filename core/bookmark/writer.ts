import browser from 'webextension-polyfill';
import type { UnifiedBookmark } from '@/utils/types';
import { ROOT_KEYS } from './reader';

/**
 * 清空所有用户书签（保留浏览器自带的根节点）
 */
async function clearAllBookmarks() {
  const tree = await browser.bookmarks.getTree();
  const root = tree[0];
  if (!root) return;

  // 第一轮：逐个删除
  for (const topLevel of root.children ?? []) {
    for (const child of topLevel.children ?? []) {
      try {
        await browser.bookmarks.removeTree(child.id);
      } catch (e) {
        console.warn('[writer] remove failed', child.id, e);
      }
    }
  }

  // 验证：读取清空后的数量
  const after = await browser.bookmarks.getTree();
  const afterRoot = after[0];
  if (!afterRoot) return;

  const remaining: string[] = [];
  for (const topLevel of afterRoot.children ?? []) {
    for (const child of topLevel.children ?? []) {
      remaining.push(child.id);
    }
  }

  if (remaining.length > 0) {
    console.warn(`[writer] 第一次清空后仍有 ${remaining.length} 个书签，重试`);
    for (const id of remaining) {
      try {
        await browser.bookmarks.removeTree(id);
      } catch (e) {
        console.warn('[writer] retry remove failed', id, e);
      }
    }
  }
}

/**
 * 建立 逻辑根名 → 真实根节点 id 的映射
 * 例如：{ '书签栏': '1', '其他书签': '2', '移动设备书签': '3' }
 */
async function getRootMap(): Promise<Map<string, string>> {
  const tree = await browser.bookmarks.getTree();
  const root = tree[0];
  const map = new Map<string, string>();
  if (!root) return map;

  const children = root.children ?? [];
  children.forEach((child, i) => {
    const logicalName = ROOT_KEYS[i] ?? `__root_${i}__`;
    map.set(logicalName, child.id);
  });

  return map;
}

/**
 * 用新的书签列表替换本地所有书签
 */
export async function applyBookmarkTree(
  next: UnifiedBookmark[]
): Promise<void> {
  const rootMap = await getRootMap();
  const defaultParentId =
    rootMap.get('书签栏') ??
    rootMap.values().next().value ??
    '1';

  // 1. 清空
  await clearAllBookmarks();

  // 2. 按 parentId 分组
  const byParent = new Map<string | null, UnifiedBookmark[]>();
  for (const b of next) {
    const key = b.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(b);
  }

  // 3. idMap: 逻辑路径 → 真实浏览器节点 id
  const idMap = new Map<string, string>();
  idMap.set('', defaultParentId);

  // 4. 顶层节点（书签栏/其他书签/...）已存在，不需要创建，直接映射
  const topLevel = byParent.get(null) ?? [];
  for (const b of topLevel) {
    const realId = rootMap.get(b.id);
    if (realId) {
      idMap.set(b.id, realId);
    }
  }

  // 5. 递归创建：从每个顶层节点开始，只创建它们下面的内容
  async function createLevel(parentKey: string) {
    const items = byParent.get(parentKey) ?? [];
    items.sort((a, b) => a.index - b.index);

    for (const b of items) {
      const realParentId = idMap.get(parentKey);
      if (!realParentId) {
        console.warn('[writer] 找不到父节点', parentKey);
        continue;
      }

      try {
        const created = await browser.bookmarks.create({
          parentId: realParentId,
          title: b.title,
          url: b.url,
        });
        idMap.set(b.id, created.id);
      } catch (e) {
        console.warn('[writer] create failed', b.id, e);
        continue;
      }

      // 递归创建子节点
      await createLevel(b.id);
    }
  }

  for (const b of topLevel) {
    await createLevel(b.id);
  }
}