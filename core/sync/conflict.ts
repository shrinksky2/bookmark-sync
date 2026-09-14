import type { UnifiedBookmark } from '@/utils/types';

/**
 * 去重 key 生成：
 * - 有 url 的书签：用 url 作为 key（跨浏览器绝对稳定）
 * - 文件夹：用 parentId + title（因为文件夹没有 url）
 */
function keyOf(b: UnifiedBookmark): string {
  if (b.url) return `url:${b.url}`;
  return `folder:${b.parentId ?? ''}|${b.title}`;
}

export function mergeBookmarks(
  local: UnifiedBookmark[],
  remote: UnifiedBookmark[]
): UnifiedBookmark[] {
  const map = new Map<string, UnifiedBookmark>();

  // 1. 远程先放入
  for (const b of remote) {
    map.set(keyOf(b), b);
  }

  // 2. 本地独有的补进去
  for (const b of local) {
    const k = keyOf(b);
    if (!map.has(k)) {
      map.set(k, b);
    }
  }

  const result = Array.from(map.values());
  console.log(
    `[merge] local=${local.length}, remote=${remote.length}, merged=${result.length}`
  );
  return result;
}