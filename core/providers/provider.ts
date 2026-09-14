import type { SerializedBookmarks } from '@/utils/types';

export interface StorageProvider {
  upload(data: SerializedBookmarks): Promise<void>;
  download(): Promise<SerializedBookmarks | null>;
  testConnection(): Promise<boolean>;
}