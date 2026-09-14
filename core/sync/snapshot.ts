import browser from 'webextension-polyfill';
import type { Snapshot, UnifiedBookmark } from '@/utils/types';
import { applyBookmarkTree } from '@/core/bookmark/writer';

const MAX_SNAPSHOTS = 5;

export async function createSnapshot(
  bookmarks: UnifiedBookmark[]
): Promise<void> {
  const { snapshots } = await browser.storage.local.get('snapshots');
  const list: Snapshot[] = (snapshots as Snapshot[]) ?? [];

  list.unshift({ data: bookmarks, createdAt: Date.now() });

  await browser.storage.local.set({
    snapshots: list.slice(0, MAX_SNAPSHOTS),
  });
}

export async function restoreSnapshot(index = 0): Promise<boolean> {
  const { snapshots } = await browser.storage.local.get('snapshots');
  const list: Snapshot[] = (snapshots as Snapshot[]) ?? [];
  if (!list[index]) return false;

  await applyBookmarkTree(list[index].data);
  return true;
}