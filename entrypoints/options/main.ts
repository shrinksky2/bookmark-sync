import browser from 'webextension-polyfill';
import { GistProvider } from '@/core/providers/gist';
import { WebDAVProvider } from '@/core/providers/webdav';

// ========== 工具函数 ==========

function setStatus(
  id: string,
  text: string,
  cls: '' | 'ok' | 'err' = ''
) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'status' + (cls ? ' ' + cls : '');
}

function getInput(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

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

// ========== Provider 配置块显隐 ==========

function getSelectedProvider(): 'gist' | 'webdav' {
  const checked = document.querySelector<HTMLInputElement>(
    'input[name="providerType"]:checked'
  );
  return (checked?.value as 'gist' | 'webdav') ?? 'gist';
}

function applyProviderVisibility(type: 'gist' | 'webdav') {
  document.getElementById('config-gist')!.style.display =
    type === 'gist' ? '' : 'none';
  document.getElementById('config-webdav')!.style.display =
    type === 'webdav' ? '' : 'none';
}

// ========== 外部链接绑定 ==========

function bindGistLinkClick() {
  const link = document.getElementById('gist-link') as HTMLAnchorElement;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    if (link.href) browser.tabs.create({ url: link.href });
  });
}

function bindTokenLinkClick() {
  const btn = document.getElementById('token-link') as HTMLButtonElement;
  btn.addEventListener('click', () => {
    browser.tabs.create({
      url: 'https://github.com/settings/tokens/new?scopes=gist&description=Bookmark%20Sync',
    });
  });
}

// ========== 加载已有配置 ==========

async function load() {
  const cfg = await browser.storage.sync.get([
    'providerType',
    'token',
    'gistId',
    'webdavUrl',
    'webdavUsername',
    'webdavPassword',
    'autoSync',
    'syncInterval',
  ]);

  // 同步方式
  const type = (cfg.providerType as string) ?? 'gist';
  const radio = document.querySelector<HTMLInputElement>(
    `input[name="providerType"][value="${type}"]`
  );
  if (radio) radio.checked = true;
  applyProviderVisibility(type as 'gist' | 'webdav');

  // Gist 配置
  getInput('token').value = (cfg.token as string) ?? '';
  const gistId = (cfg.gistId as string) ?? '';
  getInput('gistId').value = gistId;
  renderGistLink(gistId);

  // WebDAV 配置
  getInput('webdavUrl').value = (cfg.webdavUrl as string) ?? '';
  getInput('webdavUsername').value =
    (cfg.webdavUsername as string) ?? '';
  getInput('webdavPassword').value =
    (cfg.webdavPassword as string) ?? '';

  // 同步设置
  getInput('syncInterval').value = String(
    (cfg.syncInterval as number) ?? 30
  );
  getInput('autoSync').checked = cfg.autoSync !== false;

  // 从 popup 跳转来的高亮
  const { optionsHighlight } = await browser.storage.local.get(
    'optionsHighlight'
  );
  if (optionsHighlight === 'bind') {
    const tokenInput = getInput('token');
    tokenInput.focus();
    tokenInput.style.outline = '2px solid #ff9800';
    setTimeout(() => (tokenInput.style.outline = ''), 3000);
    await browser.storage.local.remove('optionsHighlight');
  }
}

// ========== 创建 Gist ==========

document.getElementById('create-gist')!.addEventListener('click', async () => {
  const token = getInput('token').value.trim();
  if (!token) {
    setStatus('gist-status', '请先填写 GitHub Token', 'err');
    return;
  }

  const btn = document.getElementById('create-gist') as HTMLButtonElement;
  btn.disabled = true;
  setStatus('gist-status', '正在查找或创建...');

  try {
    const currentGistId = getInput('gistId').value.trim();
    const provider = new GistProvider(token, currentGistId);
    const gistId = await provider.findOrCreateGist();

    const isReused = gistId === currentGistId && currentGistId !== '';
    getInput('gistId').value = gistId;
    setStatus(
      'gist-status',
      isReused ? `已复用现有 Gist：${gistId}` : `创建成功：${gistId}`,
      'ok'
    );

    renderGistLink(gistId);
    await browser.storage.sync.set({ token, gistId });
  } catch (e) {
    console.error(e);
    setStatus('gist-status', `操作失败：${(e as Error).message}`, 'err');
  } finally {
    btn.disabled = false;
  }
});

// ========== 测试 WebDAV 连接 ==========

document
  .getElementById('test-webdav')!
  .addEventListener('click', async () => {
    const url = getInput('webdavUrl').value.trim();
    const username = getInput('webdavUsername').value.trim();
    const password = getInput('webdavPassword').value;

    if (!url || !username || !password) {
      setStatus('webdav-status', '请先填写完整配置', 'err');
      return;
    }

    // 动态申请域名权限
    let granted = false;
    try {
      const u = new URL(url);
      const origin = `${u.protocol}//${u.host}/*`;
      granted = await browser.permissions.request({ origins: [origin] });
    } catch {
      setStatus('webdav-status', 'URL 格式无效', 'err');
      return;
    }

    if (!granted) {
      setStatus('webdav-status', '未授权访问该域名', 'err');
      return;
    }

    const btn = document.getElementById('test-webdav') as HTMLButtonElement;
    btn.disabled = true;
    setStatus('webdav-status', '正在测试连接...');

    try {
      const provider = new WebDAVProvider(url, username, password);
      const result = await provider.testAndPrepare();

      if (result.ok) {
        setStatus('webdav-status', `✓ ${result.message}`, 'ok');
      } else {
        setStatus('webdav-status', `✗ ${result.message}`, 'err');
      }
    } catch (e) {
      console.error(e);
      setStatus('webdav-status', `✗ ${(e as Error).message}`, 'err');
    } finally {
      btn.disabled = false;
    }
  });
// ========== 保存账号设置 ==========

document
  .getElementById('save-account')!
  .addEventListener('click', async () => {
    const type = getSelectedProvider();

    // 先读取原有同步设置，避免覆盖
    const old = await browser.storage.sync.get([
      'syncInterval',
      'autoSync',
    ]);

    if (type === 'gist') {
      const token = getInput('token').value.trim();
      const gistId = getInput('gistId').value.trim();

      if (!token) {
        setStatus('gist-status', '请填写 GitHub Token', 'err');
        return;
      }
      if (!gistId) {
        setStatus(
          'gist-status',
          '请点击"创建 Gist"，或粘贴已有的 Gist ID',
          'err'
        );
        return;
      }

      await browser.storage.sync.set({
        providerType: 'gist',
        token,
        gistId,
        syncInterval: (old.syncInterval as number) ?? 30,
        autoSync: old.autoSync !== false,
      });

      renderGistLink(gistId);
      setStatus('gist-status', '账号设置已保存', 'ok');
    } else {
      const webdavUrl = getInput('webdavUrl').value.trim();
      const webdavUsername = getInput('webdavUsername').value.trim();
      const webdavPassword = getInput('webdavPassword').value;

      if (!webdavUrl || !webdavUsername || !webdavPassword) {
        setStatus('webdav-status', '请填写完整 WebDAV 配置', 'err');
        return;
      }

      // 申请权限
      let granted = false;
      try {
        const u = new URL(webdavUrl);
        const origin = `${u.protocol}//${u.host}/*`;
        granted = await browser.permissions.request({
          origins: [origin],
        });
      } catch {
        setStatus('webdav-status', 'URL 格式无效', 'err');
        return;
      }

      if (!granted) {
        setStatus('webdav-status', '未授权访问该域名', 'err');
        return;
      }

      await browser.storage.sync.set({
        providerType: 'webdav',
        webdavUrl,
        webdavUsername,
        webdavPassword,
        syncInterval: (old.syncInterval as number) ?? 30,
        autoSync: old.autoSync !== false,
      });

      setStatus('webdav-status', '账号设置已保存', 'ok');
    }

    flashButton('save-account', '已保存');
  });

// ========== 保存同步设置 ==========

document.getElementById('save-sync')!.addEventListener('click', async () => {
  const syncInterval = Number(getInput('syncInterval').value) || 30;
  const autoSync = getInput('autoSync').checked;

  const old = await browser.storage.sync.get([
    'providerType',
    'token',
    'gistId',
    'webdavUrl',
    'webdavUsername',
    'webdavPassword',
  ]);

  await browser.storage.sync.set({
    ...old,
    syncInterval,
    autoSync,
  });

  await browser.runtime
    .sendMessage({ type: 'RECREATE_ALARM' })
    .catch(() => { });

  const statusEl = document.getElementById('sync-status');
  if (statusEl) {
    statusEl.textContent = '同步设置已保存';
    statusEl.className = 'status ok';
  }

  flashButton('save-sync', '已保存');
});

// ========== 事件绑定 ==========

// 同步方式切换：切换配置块显隐 + 清空对方状态
document
  .querySelectorAll<HTMLInputElement>('input[name="providerType"]')
  .forEach(radio => {
    radio.addEventListener('change', () => {
      const type = getSelectedProvider();
      applyProviderVisibility(type);

      // 清空对方的状态区，避免残留
      if (type === 'gist') {
        setStatus('webdav-status', '');
      } else {
        setStatus('gist-status', '');
      }
    });
  });

// Gist ID 输入框实时更新链接
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

      navItems.forEach(i => i.classList.toggle('active', i === item));
      panels.forEach(p => p.classList.toggle('active', p.id === target));
    });
  });
}

// ========== 启动 ==========

setupNav();
bindTokenLinkClick();
bindGistLinkClick();
load();