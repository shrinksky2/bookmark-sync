import browser from 'webextension-polyfill';
import { GistProvider } from '@/core/providers/gist';

// ========== 工具函数 ==========

function setStatus(text: string, cls: '' | 'ok' | 'err' = '') {
  const el = document.getElementById('gist-status')!;
  el.textContent = text;
  el.className = 'status' + (cls ? ' ' + cls : '');
}

function getInput(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

/**
 * 按钮点击后短暂显示反馈文字
 */
function flashButton(id: string, text: string, duration = 1200) {
  const btn = document.getElementById(id) as HTMLButtonElement | null;
  if (!btn) return;

  const original = btn.textContent ?? '';
  btn.textContent = text;
  btn.disabled = true;

  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, duration);
}

// ========== Gist 链接渲染 ==========

/**
 * 根据 gistId 显示或隐藏 Gist 链接
 */
function renderGistLink(gistId: string) {
  const box = document.getElementById('gist-link-box')!;
  const link = document.getElementById('gist-link') as HTMLAnchorElement;

  if (!gistId) {
    box.style.display = 'none';
    return;
  }

  const url = `https://gist.github.com/${gistId}`;
  link.href = url;
  link.textContent = `gist.github.com/${gistId}`;
  box.style.display = 'block';
}

// ========== 外部链接绑定 ==========

/**
 * Gist 链接：用 browser.tabs.create 在新标签页打开
 * 避免扩展页面 CSP 拦截 target="_blank"
 */
function bindGistLinkClick() {
  const link = document.getElementById('gist-link') as HTMLAnchorElement;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const url = link.href;
    if (url) browser.tabs.create({ url });
  });
}

/**
 * "获取 Token"按钮：打开 GitHub Token 生成页
 * 预勾选 gist 权限，减少用户操作
 */
function bindTokenLinkClick() {
  const btn = document.getElementById('token-link') as HTMLButtonElement;
  btn.addEventListener('click', () => {
    browser.tabs.create({
      url: 'https://github.com/settings/tokens/new?scopes=gist&description=Bookmark%20Sync',
    });
  });
}

// ========== 页面初始化 ==========

async function load() {
  // ① 加载已有配置
  const cfg = await browser.storage.sync.get([
    'token',
    'gistId',
    'autoSync',
    'syncInterval',
  ]);

  getInput('token').value = (cfg.token as string) ?? '';

  const gistId = (cfg.gistId as string) ?? '';
  getInput('gistId').value = gistId;

  getInput('syncInterval').value = String(
    (cfg.syncInterval as number) ?? 30
  );
  getInput('autoSync').checked = cfg.autoSync !== false;

  // ② 根据已有 gistId 渲染链接
  renderGistLink(gistId);

  // ③ 检查是否需要高亮（从 popup"去绑定设备"跳转过来时）
  const { optionsHighlight } = await browser.storage.local.get(
    'optionsHighlight'
  );
  if (optionsHighlight === 'bind') {
    const tokenInput = getInput('token');
    tokenInput.focus();
    tokenInput.style.outline = '2px solid #ff9800';

    setTimeout(() => {
      tokenInput.style.outline = '';
    }, 3000);

    // 清掉标记，避免下次打开又高亮
    await browser.storage.local.remove('optionsHighlight');
  }
}

// ========== 事件绑定 ==========

// 创建/绑定 Gist
document.getElementById('create-gist')!.addEventListener('click', async () => {
  const token = getInput('token').value.trim();
  if (!token) {
    setStatus('请先填写 GitHub Token', 'err');
    return;
  }

  const btn = document.getElementById('create-gist') as HTMLButtonElement;
  btn.disabled = true;
  setStatus('正在查找或创建...');

  try {
    const currentGistId = getInput('gistId').value.trim();
    const provider = new GistProvider(token, currentGistId);
    const gistId = await provider.findOrCreateGist();

    const isReused = gistId === currentGistId && currentGistId !== '';
    getInput('gistId').value = gistId;
    setStatus(
      isReused ? `已复用现有 Gist：${gistId}` : `创建成功：${gistId}`,
      'ok'
    );

    renderGistLink(gistId);

    // 顺手把 token 和 gistId 一起保存
    await browser.storage.sync.set({ token, gistId });
  } catch (e) {
    console.error(e);
    setStatus(`操作失败：${(e as Error).message}`, 'err');
  } finally {
    btn.disabled = false;
  }
});

// 保存账号设置（Token + Gist ID）
document.getElementById('save-account')!.addEventListener('click', async () => {
  const token = getInput('token').value.trim();
  const gistId = getInput('gistId').value.trim();

  if (!token) {
    setStatus('请填写 GitHub Token', 'err');
    return;
  }
  if (!gistId) {
    setStatus('请点击"创建 Gist"，或粘贴已有的 Gist ID', 'err');
    return;
  }

  // 保留原有的同步设置
  const old = await browser.storage.sync.get(['syncInterval', 'autoSync']);
  await browser.storage.sync.set({
    token,
    gistId,
    syncInterval: (old.syncInterval as number) ?? 30,
    autoSync: old.autoSync !== false,
  });

  renderGistLink(gistId);
  setStatus('账号设置已保存', 'ok');

  // 更新按钮反馈
  flashButton('save-account', '已保存');
});

// 保存同步设置（间隔 + 自动同步开关）
document.getElementById('save-sync')!.addEventListener('click', async () => {
  const syncInterval = Number(getInput('syncInterval').value) || 30;
  const autoSync = getInput('autoSync').checked;

  // 保留原有的账号配置
  const old = await browser.storage.sync.get(['token', 'gistId']);
  await browser.storage.sync.set({
    token: old.token ?? '',
    gistId: old.gistId ?? '',
    syncInterval,
    autoSync,
  });

  // 通知 background 重建闹钟
  await browser.runtime
    .sendMessage({ type: 'RECREATE_ALARM' })
    .catch(() => { });

  // 在同步面板内显示提示
  const statusEl = document.getElementById('sync-status');
  if (statusEl) {
    statusEl.textContent = '同步设置已保存';
    statusEl.className = 'status ok';
  }

  flashButton('save-sync', '已保存');
});

// gistId 输入框实时更新链接
getInput('gistId').addEventListener('input', () => {
  renderGistLink(getInput('gistId').value.trim());
});

// gistId 输入框实时更新链接
getInput('gistId').addEventListener('input', () => {
  renderGistLink(getInput('gistId').value.trim());
});

// ========== 左侧导航切换 ==========

function setupNav() {
  const navItems = document.querySelectorAll<HTMLButtonElement>('.nav-item');
  const panels = document.querySelectorAll<HTMLElement>('.panel');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.target;
      if (!target) return;

      // 高亮：当前点击的 item 加 active，其余移除
      navItems.forEach(i => i.classList.toggle('active', i === item));

      // 切换面板：id 等于 target 的显示，其余隐藏
      panels.forEach(p => p.classList.toggle('active', p.id === target));
    });
  });
}

// ========== 启动 ==========

setupNav();
bindTokenLinkClick();
bindGistLinkClick();
load();