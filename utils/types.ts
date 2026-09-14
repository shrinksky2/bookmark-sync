/**
 * 统一书签结构
 * id 使用逻辑路径（如 "书签栏/技术/React"），保证跨浏览器稳定
 */
export interface UnifiedBookmark {
  id: string;                // 逻辑 id（路径）
  parentId: string | null;   // 父级逻辑 id，null 表示根
  title: string;
  url?: string;              // 文件夹没有 url
  index: number;             // 顺序
}

export interface SerializedBookmarks {
  version: number;
  exportedAt: number;
  bookmarks: UnifiedBookmark[];
}

export interface SyncState {
  lastSyncTime: number;
  lastLocalHash: string;
  lastRemoteHash: string;
  syncInProgress: boolean;
}

export interface Snapshot {
  data: UnifiedBookmark[];
  createdAt: number;
}

export type ProviderType = 'gist' | 'webdav';

export interface ProviderConfig {
  type: ProviderType;
  token?: string;      // Gist 用
  gistId?: string;     // Gist 用
  url?: string;        // WebDAV 用
  username?: string;   // WebDAV 用
  password?: string;   // WebDAV 用
}
/**
 * 扩展内部消息协议
 */
export type BackgroundMessage =
  | { type: 'SYNC_NOW' }
  | { type: 'RECREATE_ALARM' }
  | { type: 'FORCE_UPLOAD' }
  | { type: 'FORCE_DOWNLOAD' };
export interface BackgroundResponse {
  ok: boolean;
  error?: string;
}