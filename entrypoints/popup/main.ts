import browser from 'webextension-polyfill';
import { readBookmarkTree } from '@/core/bookmark/reader';
import { getProvider } from '@/core/providers';
import type { BackgroundMessage } from '@/utils/types';

function getEl(id: string): HTMLElement {
  return document.getElementById(id)!;
}

interface Config {
  token?: string;
  gistId?: string;
}

interface LastSyncInfo {
  time: number;
  operation: 'sync' | 'upload' | 'download';
  success: boolean;
  error?: string;
}

async function getConfig(): Promise<Config> {
  const cfg = await browser.storage.sync.get(['token', 'gistId']);
  return cfg as Config;
}

function showNotice(text: string) {
  getEl('notice-text').textContent = text;
  getEl('notice').classList.add('show');
}

function hideNotice() {
  getEl('notice').classList.remove('show');
}

async function checkBound(): Promise<string | null> {
  const cfg = await getConfig();
  if (!cfg.token) return '尚未填写 GitHub Token，请先绑定设备。';
  if (!cfg.gistId) return '尚未创建或填写 Gist ID，请先绑定设备。';
  return null;
}

// ========== 数量显示 ==========

async function updateCounts() {
  const local = await readBookmarkTree();
  const localUrlCount = local.filter(b => b.url).length;
  getEl('local-count').textContent = String(localUrlCount);

  try {
    const provider = await getProvider();
    if (!provider) {
      getEl('remote-count').textContent = '未绑定';
      return;
    }
    const remote = await provider.download();
    const remoteCount =
      remote?.bookmarks.filter(b => b.url).length ?? 0;
    getEl('remote-count').textContent = String(remoteCount);
  } catch {
    getEl('remote-count').textContent = '读取失败';
  }
}

// ========== 同步信息显示 ==========

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;

  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000)
    return `${Math.floor(diff / 3600000)} 小时前`;

  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const OP_TEXT: Record<LastSyncInfo['operation'], string> = {
  sync: '立即同步',
  upload: '覆盖上传',
  download: '从云端下载',
};

async function updateSyncInfo() {
  const { lastSyncInfo } = await browser.storage.local.get('lastSyncInfo');
  const info = lastSyncInfo as LastSyncInfo | undefined;

  const resultEl = getEl('sync-result');
  const timeEl = getEl('last-time');
  const opEl = getEl('last-op');

  if (!info) {
    resultEl.textContent = '尚未同步';
    resultEl.className = 'result-line';
    timeEl.textContent = '-';
    opEl.textContent = '-';
    return;
  }

  if (info.success) {
    resultEl.textContent = '✓ 同步成功';
    resultEl.className = 'result-line ok';
  } else {
    resultEl.textContent = `✗ 同步失败：${info.error ?? '未知错误'}`;
    resultEl.className = 'result-line err';
  }

  timeEl.textContent = formatTime(info.time);
  opEl.textContent = OP_TEXT[info.operation] ?? info.operation;
}

// ========== UI 状态刷新 ==========

async function refreshUI() {
  const err = await checkBound();

  const btnIds = ['sync-now', 'force-upload', 'force-download'];
  if (err) {
    showNotice(err);
    btnIds.forEach(id => {
      (getEl(id) as HTMLButtonElement).disabled = true;
    });
  } else {
    hideNotice();
    btnIds.forEach(id => {
      (getEl(id) as HTMLButtonElement).disabled = false;
    });
  }

  await Promise.all([updateCounts(), updateSyncInfo()]);
}

// ========== 确认面板 ==========

interface ConfirmOptions {
  title: string;
  body: string;
  onConfirm: () => Promise<void>;
}

function showConfirm(opts: ConfirmOptions) {
  getEl('confirm-title').textContent = opts.title;
  getEl('confirm-body').innerHTML = opts.body;
  getEl('confirm-panel').classList.add('show');

  const okBtn = getEl('confirm-ok') as HTMLButtonElement;
  const cancelBtn = getEl('confirm-cancel') as HTMLButtonElement;

  const newOk = okBtn.cloneNode(true) as HTMLButtonElement;
  okBtn.replaceWith(newOk);
  const newCancel = cancelBtn.cloneNode(true) as HTMLButtonElement;
  cancelBtn.replaceWith(newCancel);

  newCancel.addEventListener('click', () => {
    getEl('confirm-panel').classList.remove('show');
  });

  newOk.addEventListener('click', async () => {
    newOk.disabled = true;
    try {
      await opts.onConfirm();
      getEl('confirm-panel').classList.remove('show');
      await refreshUI();
    } catch (e) {
      console.error(e);
    } finally {
      newOk.disabled = false;
    }
  });
}

// ========== 发送消息 ==========

async function sendMessage(
  msg: BackgroundMessage
): Promise<{ ok: boolean; error?: string }> {
  const res = (await browser.runtime.sendMessage(msg)) as {
    ok: boolean;
    error?: string;
  };
  return res ?? { ok: false, error: '无响应' };
}

// ========== 按钮事件 ==========

getEl('sync-now').addEventListener('click', async () => {
  const err = await checkBound();
  if (err) {
    showNotice(err);
    return;
  }

  const btn = getEl('sync-now') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = '同步中...';

  try {
    const res = await sendMessage({ type: 'SYNC_NOW' });
    if (!res.ok) {
      showNotice('同步失败：' + (res.error ?? '未知错误'));
      btn.textContent = '同步失败';
    } else {
      btn.textContent = '同步完成';
    }
  } finally {
    await refreshUI();
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '立即同步';
    }, 1500);
  }
});

getEl('force-upload').addEventListener('click', async () => {
  const local = await readBookmarkTree();
  const localCount = local.filter(b => b.url).length;

  let remoteCount = 0;
  try {
    const provider = await getProvider();
    const remote = await provider?.download();
    remoteCount = remote?.bookmarks.filter(b => b.url).length ?? 0;
  } catch {
    /* 忽略 */
  }

  showConfirm({
    title: '覆盖上传',
    body: `
      会用本地的 <b>${localCount}</b> 个书签，替换远程的 <b>${remoteCount}</b> 个书签。<br/>
      远程现有的内容会被覆盖，此操作不可撤销。
    `,
    onConfirm: async () => {
      const res = await sendMessage({ type: 'FORCE_UPLOAD' });
      if (!res.ok) {
        showNotice('覆盖上传失败：' + (res.error ?? '未知错误'));
      } else {
        hideNotice();
      }
    },
  });
});

getEl('force-download').addEventListener('click', async () => {
  const local = await readBookmarkTree();
  const localCount = local.filter(b => b.url).length;

  let remoteCount = 0;
  try {
    const provider = await getProvider();
    const remote = await provider?.download();
    remoteCount = remote?.bookmarks.filter(b => b.url).length ?? 0;
  } catch {
    /* 忽略 */
  }

  if (remoteCount === 0) {
    showNotice('远程没有数据，无法下载。');
    return;
  }

  showConfirm({
    title: '从云端下载',
    body: `
      会清空本地 <b>${localCount}</b> 个书签，用远程的 <b>${remoteCount}</b> 个书签替换。<br/>
      此操作不可撤销。
    `,
    onConfirm: async () => {
      const res = await sendMessage({ type: 'FORCE_DOWNLOAD' });
      if (!res.ok) {
        showNotice('下载失败：' + (res.error ?? '未知错误'));
      } else {
        hideNotice();
      }
    },
  });
});

// 去绑定设备
getEl('go-bind').addEventListener('click', () => {
  browser.tabs.create({
    url: browser.runtime.getURL('/options.html'),
  });
  browser.storage.local.set({ optionsHighlight: 'bind' });
});

// 打开设置页
getEl('open-options').addEventListener('click', () => {
  browser.tabs.create({
    url: browser.runtime.getURL('/options.html'),
  });
});

// ========== 初始化 ==========

refreshUI();

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.token || changes.gistId)) {
    refreshUI();
  }
  if (area === 'local' && changes.lastSyncInfo) {
    updateSyncInfo();
  }
});