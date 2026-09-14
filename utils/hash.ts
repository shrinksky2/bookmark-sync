import type { UnifiedBookmark } from './types';

export async function hashBookmarks(
  bookmarks: UnifiedBookmark[]
): Promise<string> {
  // 只取关键字段，排序保证稳定
  const normalized = bookmarks
    .map(b => `${b.id}|${b.parentId ?? ''}|${b.title}|${b.url ?? ''}`)
    .sort()
    .join('\n');

  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}