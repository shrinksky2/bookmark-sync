import browser from 'webextension-polyfill';
import { readBookmarkTree } from '@/core/bookmark/reader';
import { applyBookmarkTree } from '@/core/bookmark/writer';
import { hashBookmarks } from '@/utils/hash';
import { getSyncState, setSyncState } from './state';
import { createSnapshot } from './snapshot';
import { checkFailsafe } from './guard';
import { mergeBookmarks } from './conflict';
import { getProvider, checkProviderReady } from '@/core/providers';

// ========== 同步状态提示 ==========

/**
 * 同步成功：徽章 ✓（绿色）+ 控制台日志
 * 3 秒后自动清除徽章
 */
async function markSyncSuccess() {
  console.log('[Sync] ✓ 同步成功', new Date().toLocaleTimeString());

  try {
    await browser.action.setBadgeText({ text: '✓' });
    await browser.action.setBadgeBackgroundColor({ color: '#4caf50' });

    setTimeout(() => {
      browser.action.setBadgeText({ text: '' }).catch(() => { });
    }, 3000);
  } catch (e) {
    console.warn('[Sync] 无法设置徽章', e);
  }
}

/**
 * 同步失败：徽章 ✗（红色）+ 控制台日志
 * 5 秒后自动清除徽章
 */
async function markSyncFailure(message: string) {
  console.error('[Sync] ✗ 同步失败:', message);

  try {
    await browser.action.setBadgeText({ text: '✗' });
    await browser.action.setBadgeBackgroundColor({ color: '#f44336' });

    setTimeout(() => {
      browser.action.setBadgeText({ text: '' }).catch(() => { });
    }, 5000);
  } catch (e) {
    console.warn('[Sync] 无法设置徽章', e);
  }
}

/**
 * 记录最近一次同步的结果到 storage.local
 * 供 popup 显示"上次同步时间 / 操作类型 / 成功失败"
 */
async function recordSyncInfo(
  operation: 'sync' | 'upload' | 'download',
  success: boolean,
  error?: string
) {
  try {
    await browser.storage.local.set({
      lastSyncInfo: {
        time: Date.now(),
        operation,
        success,
        error,
      },
    });
  } catch (e) {
    console.warn('[Sync] 记录同步信息失败', e);
  }
}

// ========== 同步引擎 ==========

class SyncEngine {
  /**
   * 自动同步：出错不抛出，只打日志
   */
  async performAutoSync(): Promise<void> {
    try {
      await this.performManualSync();
    } catch (e) {
      // 已经记录过日志，这里只是防止未捕获的 Promise 异常
    }
  }

  /**
   * 手动同步：出错抛出，让 popup 能感知
   */
  async performManualSync(): Promise<void> {
    const state = await getSyncState();
    if (state.syncInProgress) {
      throw new Error('已有同步任务进行中，请稍候');
    }

    try {
      await browser.action.setBadgeText({ text: '' });
    } catch {
      /* 忽略 */
    }

    await setSyncState({ syncInProgress: true });
    let success = false;
    let errorMsg: string | undefined;

    try {
      await this.runFlow();
      await markSyncSuccess();
      success = true;
    } catch (e) {
      errorMsg = (e as Error).message;
      await markSyncFailure(errorMsg);
      throw e;
    } finally {
      await setSyncState({ syncInProgress: false });
      await recordSyncInfo('sync', success, errorMsg);
    }
  }

  /**
 * 覆盖上传：把本地书签直接覆盖远程
 * 不做合并，不做 Failsafe，用户已明确知道后果
 */
  async forceUpload(): Promise<void> {
    const state = await getSyncState();
    if (state.syncInProgress) {
      throw new Error('已有同步任务进行中，请稍候');
    }

    const readyErr = await checkProviderReady();
    if (readyErr) throw new Error(readyErr);

    const provider = await getProvider();
    if (!provider) throw new Error('Provider 未配置');

    await setSyncState({ syncInProgress: true });

    let success = false;
    let errorMsg: string | undefined;
    try {
      // 1. 先拉远程旧数据做快照（万一用户后悔能回滚）
      try {
        const oldRemote = await provider.download();
        if (oldRemote && oldRemote.bookmarks.length > 0) {
          await createSnapshot(oldRemote.bookmarks);
          console.log('[ForceUpload] 已保存远程旧数据快照');
        }
      } catch (e) {
        console.warn('[ForceUpload] 拉取远程快照失败，继续', e);
      }

      // 2. 读本地
      const localBookmarks = await readBookmarkTree();
      const localHash = await hashBookmarks(localBookmarks);

      // 3. 上传
      await provider.upload({
        version: 1,
        exportedAt: Date.now(),
        bookmarks: localBookmarks,
      });

      // 4. 更新状态
      await setSyncState({
        lastSyncTime: Date.now(),
        lastLocalHash: localHash,
        lastRemoteHash: localHash,
      });

      await markSyncSuccess();
      success = true;
    } catch (e) {
      errorMsg = (e as Error).message;
      await markSyncFailure(errorMsg);
      throw e;
    } finally {
      await setSyncState({ syncInProgress: false });
      await recordSyncInfo('upload', success, errorMsg);
    }
  }

  /**
   * 从云端下载：清空本地，用远程书签覆盖
   * 不做合并，不做 Failsafe，用户已明确知道后果
   */
  async forceDownload(): Promise<void> {
    const state = await getSyncState();
    if (state.syncInProgress) {
      throw new Error('已有同步任务进行中，请稍候');
    }

    const readyErr = await checkProviderReady();
    if (readyErr) throw new Error(readyErr);

    const provider = await getProvider();
    if (!provider) throw new Error('Provider 未配置');

    await setSyncState({ syncInProgress: true });
    let success = false;
    let errorMsg: string | undefined;
    try {
      // 1. 拉远程
      const remoteData = await provider.download();
      if (!remoteData) {
        throw new Error('远程没有数据，无法下载');
      }

      // 2. 本地快照
      const localBookmarks = await readBookmarkTree();
      if (localBookmarks.length > 0) {
        await createSnapshot(localBookmarks);
        console.log('[ForceDownload] 已保存本地旧数据快照');
      }

      // 3. 覆盖本地
      await applyBookmarkTree(remoteData.bookmarks);

      // 4. 更新状态
      const remoteHash = await hashBookmarks(remoteData.bookmarks);
      await setSyncState({
        lastSyncTime: Date.now(),
        lastLocalHash: remoteHash,
        lastRemoteHash: remoteHash,
      });

      await markSyncSuccess();
      success = true;
    } catch (e) {
      errorMsg = (e as Error).message;
      await markSyncFailure((e as Error).message);
      throw e;
    } finally {
      await setSyncState({ syncInProgress: false });
      await recordSyncInfo('download', success, errorMsg);
    }
  }

  private async runFlow(): Promise<void> {
    // 前置检查：配置是否完整（自动适配当前 Provider）
    const readyErr = await checkProviderReady();
    if (readyErr) throw new Error(readyErr);

    const provider = await getProvider();
    if (!provider) throw new Error('Provider 未配置，请先在设置页配置');

    // Step 1: 读本地
    const localBookmarks = await readBookmarkTree();
    const localHash = await hashBookmarks(localBookmarks);

    // Step 2: 读远程
    const remoteData = await provider.download();

    // 情况 A：远程为空（新建的 Gist）→ 直接上传
    if (!remoteData || remoteData.bookmarks.length === 0) {
      console.log('[Sync] 远程为空，上传本地书签');
      await provider.upload({
        version: 1,
        exportedAt: Date.now(),
        bookmarks: localBookmarks,
      });
      await setSyncState({
        lastSyncTime: Date.now(),
        lastLocalHash: localHash,
        lastRemoteHash: localHash,
      });
      return;
    }

    const remoteBookmarks = remoteData.bookmarks;
    const remoteHash = await hashBookmarks(remoteBookmarks);

    // Step 3: 判断变化
    const state = await getSyncState();
    const localChanged = localHash !== state.lastLocalHash;
    const remoteChanged = remoteHash !== state.lastRemoteHash;

    if (!localChanged && !remoteChanged) {
      console.log('[Sync] 无变化，跳过');
      return;
    }

    // 情况 C：只本地变了 → 上传
    if (localChanged && !remoteChanged) {
      console.log('[Sync] 只本地变化，上传');
      await provider.upload({
        version: 1,
        exportedAt: Date.now(),
        bookmarks: localBookmarks,
      });
      await setSyncState({
        lastSyncTime: Date.now(),
        lastLocalHash: localHash,
        lastRemoteHash: localHash,
      });
      return;
    }

    // 情况 D：只远程变了 → 下载
    if (!localChanged && remoteChanged) {
      console.log('[Sync] 只远程变化，下载');
      await createSnapshot(localBookmarks);
      await applyBookmarkTree(remoteBookmarks);
      await setSyncState({
        lastSyncTime: Date.now(),
        lastLocalHash: remoteHash,
        lastRemoteHash: remoteHash,
      });
      return;
    }

    // 情况 E：两边都变了 → 合并
    console.log('[Sync] 两边都变化，合并');
    const merged = mergeBookmarks(localBookmarks, remoteBookmarks);

    const mergedKeys = new Set(
      merged.map(b => `${b.parentId ?? ''}|${b.title}|${b.url ?? ''}`)
    );
    const deleteCount = localBookmarks.filter(
      b =>
        !mergedKeys.has(
          `${b.parentId ?? ''}|${b.title}|${b.url ?? ''}`
        )
    ).length;

    const level = checkFailsafe(localBookmarks.length, deleteCount);

    if (level === 'block' || level === 'severe') {
      console.warn(`[Sync] Failsafe 拦截：将删除 ${deleteCount} 个书签`);
      await browser.notifications.create('sync-blocked', {
        type: 'basic',
        iconUrl: '/icon/128.png',
        title: '同步已中止',
        message: `检测到将删除 ${deleteCount} 个书签，请检查后再试。`,
      });
      throw new Error(`Failsafe 拦截：将删除 ${deleteCount} 个书签`);
    }

    await createSnapshot(localBookmarks);
    await applyBookmarkTree(merged);
    await provider.upload({
      version: 1,
      exportedAt: Date.now(),
      bookmarks: merged,
    });

    const mergedHash = await hashBookmarks(merged);
    await setSyncState({
      lastSyncTime: Date.now(),
      lastLocalHash: mergedHash,
      lastRemoteHash: mergedHash,
    });

    console.log('[Sync] 合并完成');
  }
}

export const syncEngine = new SyncEngine();