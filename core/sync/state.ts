import browser from 'webextension-polyfill';
import type { SyncState } from '@/utils/types';

const DEFAULT_STATE: SyncState = {
  lastSyncTime: 0,
  lastLocalHash: '',
  lastRemoteHash: '',
  syncInProgress: false,
};

export async function getSyncState(): Promise<SyncState> {
  const { syncState } = await browser.storage.local.get('syncState');
  return (syncState as SyncState) ?? { ...DEFAULT_STATE };
}

export async function setSyncState(
  patch: Partial<SyncState>
): Promise<void> {
  const current = await getSyncState();
  await browser.storage.local.set({
    syncState: { ...current, ...patch },
  });
}