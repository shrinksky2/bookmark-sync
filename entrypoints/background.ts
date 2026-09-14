import browser from 'webextension-polyfill';
import { syncEngine } from '@/core/sync/engine';
import type { BackgroundMessage } from '@/utils/types';

export default defineBackground(() => {
  // ① 安装/更新时创建闹钟
  browser.runtime.onInstalled.addListener(async () => {
    await createSyncAlarm();
  });

  // ② 浏览器启动时补建闹钟
  browser.runtime.onStartup.addListener(async () => {
    const existing = await browser.alarms.get('auto-sync');
    if (!existing) await createSyncAlarm();
  });

  // ③ 闹钟触发 → 自动同步
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'auto-sync') {
      console.log('[BG] 自动同步触发');
      await syncEngine.performAutoSync();
    }
  });

  // ④ 响应 popup 消息
  browser.runtime.onMessage.addListener((rawMessage: unknown) => {
    const message = rawMessage as BackgroundMessage;

    if (message?.type === 'SYNC_NOW') {
      return syncEngine
        .performManualSync()
        .then(() => ({ ok: true }))
        .catch((e) => ({ ok: false, error: (e as Error).message }));
    }

    if (message?.type === 'FORCE_UPLOAD') {
      return syncEngine
        .forceUpload()
        .then(() => ({ ok: true }))
        .catch((e) => ({ ok: false, error: (e as Error).message }));
    }

    if (message?.type === 'FORCE_DOWNLOAD') {
      return syncEngine
        .forceDownload()
        .then(() => ({ ok: true }))
        .catch((e) => ({ ok: false, error: (e as Error).message }));
    }

    if (message?.type === 'RECREATE_ALARM') {
      return createSyncAlarm()
        .then(() => ({ ok: true }))
        .catch((e) => ({ ok: false, error: (e as Error).message }));
    }

    return undefined;
  });
});

async function createSyncAlarm() {
  const { autoSync, syncInterval } = await browser.storage.sync.get([
    'autoSync',
    'syncInterval',
  ]);

  const enabled = autoSync !== false;
  const interval = (syncInterval as number) ?? 30;

  if (!enabled) {
    await browser.alarms.clear('auto-sync');
    return;
  }

  await browser.alarms.create('auto-sync', {
    periodInMinutes: interval,
  });
  console.log(`[BG] 闹钟已创建，每 ${interval} 分钟`);
}