import browser from 'webextension-polyfill';
import { GistProvider } from './gist';
import type { StorageProvider } from './provider';

export async function getProvider(): Promise<StorageProvider | null> {
  const config = await browser.storage.sync.get([
    'token',
    'gistId',
  ]);

  if (!config.token) return null;

  return new GistProvider(config.token as string, config.gistId as string);
}