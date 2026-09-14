import browser from 'webextension-polyfill';
import { GistProvider } from './gist';
import { WebDAVProvider } from './webdav';
import type { StorageProvider } from './provider';

export async function getProvider(): Promise<StorageProvider | null> {
  const cfg = await browser.storage.sync.get([
    'providerType',
    'token',
    'gistId',
    'webdavUrl',
    'webdavUsername',
    'webdavPassword',
  ]);

  const type = (cfg.providerType as string) ?? 'gist';

  if (type === 'gist') {
    if (!cfg.token || !cfg.gistId) return null;
    return new GistProvider(cfg.token as string, cfg.gistId as string);
  }

  if (type === 'webdav') {
    if (
      !cfg.webdavUrl ||
      !cfg.webdavUsername ||
      !cfg.webdavPassword
    ) {
      return null;
    }
    return new WebDAVProvider(
      cfg.webdavUrl as string,
      cfg.webdavUsername as string,
      cfg.webdavPassword as string
    );
  }

  return null;
}

/**
 * 检查当前 Provider 配置是否完整
 * 返回 null 表示配置 OK，否则返回人类可读的错误提示
 */
export async function checkProviderReady(): Promise<string | null> {
  const cfg = await browser.storage.sync.get([
    'providerType',
    'token',
    'gistId',
    'webdavUrl',
    'webdavUsername',
    'webdavPassword',
  ]);

  const type = (cfg.providerType as string) ?? 'gist';

  if (type === 'gist') {
    if (!cfg.token) return '尚未填写 GitHub Token，请先绑定设备。';
    if (!cfg.gistId) return '尚未创建或填写 Gist ID，请先绑定设备。';
    return null;
  }

  if (type === 'webdav') {
    if (!cfg.webdavUrl) return '尚未填写 WebDAV 地址，请先绑定设备。';
    if (!cfg.webdavUsername) return '尚未填写 WebDAV 用户名。';
    if (!cfg.webdavPassword) return '尚未填写 WebDAV 密码。';
    return null;
  }

  return '未识别的同步方式，请在设置页重新选择。';
}

/**
 * 获取当前 Provider 类型，供 UI 显示
 */
export async function getProviderType(): Promise<'gist' | 'webdav'> {
  const { providerType } = await browser.storage.sync.get('providerType');
  return ((providerType as string) ?? 'gist') as 'gist' | 'webdav';
}