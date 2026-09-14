import type { SerializedBookmarks } from '@/utils/types';
import type { StorageProvider } from './provider';

const GIST_FILENAME = 'bookmarks.json';
const GIST_DESCRIPTION = 'Bookmark Sync Data';

export class GistProvider implements StorageProvider {
  constructor(
    private token: string,
    private gistId?: string
  ) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
  }

  /**
   * 查找或创建 Gist。
   * 优先复用已有的，找不到才创建新的，避免每次点击都新增。
   */
  async findOrCreateGist(): Promise<string> {
    // ① 如果输入框已有 gistId，验证它是否可访问
    if (this.gistId) {
      const ok = await this.checkGistExists(this.gistId);
      if (ok) return this.gistId;
      console.warn(
        `[Gist] 已配置的 gistId 无法访问：${this.gistId}，将查找其他 Gist`
      );
    }

    // ② 列出该 token 下的所有 gist，找描述匹配的
    const found = await this.findExistingGist();
    if (found) {
      this.gistId = found;
      return found;
    }

    // ③ 没有找到 → 创建新的
    return this.createGist();
  }

  /**
   * 检查某个 gistId 是否可访问
   */
  private async checkGistExists(gistId: string): Promise<boolean> {
    try {
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: this.headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * 在用户所有 Gist 中查找描述匹配的那个
   */
  private async findExistingGist(): Promise<string | null> {
    // 分页拉取，每页 100 个（一般用不到第二页）
    let page = 1;
    while (page <= 10) {
      const res = await fetch(
        `https://api.github.com/gists?per_page=100&page=${page}`,
        { headers: this.headers() }
      );
      if (!res.ok) {
        throw new Error(`获取 Gist 列表失败：${res.status}`);
      }
      const list = (await res.json()) as Array<{
        id: string;
        description: string | null;
        files: Record<string, unknown>;
      }>;

      if (list.length === 0) break;

      // 匹配描述 + 包含目标文件名
      const match = list.find(
        g =>
          g.description === GIST_DESCRIPTION &&
          GIST_FILENAME in g.files
      );
      if (match) return match.id;

      if (list.length < 100) break;
      page++;
    }
    return null;
  }

  /**
   * 创建一个新的空 Gist
   */
  async createGist(): Promise<string> {
    const body = {
      description: GIST_DESCRIPTION,
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(
            { version: 1, exportedAt: Date.now(), bookmarks: [] },
            null,
            2
          ),
        },
      },
    };

    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`创建 Gist 失败：${res.status}`);
    }

    const json = await res.json();
    this.gistId = json.id;
    return json.id;
  }

  async upload(data: SerializedBookmarks): Promise<void> {
    if (!this.gistId) {
      throw new Error('Gist ID 未配置，请先在设置页创建或填写');
    }

    const body = {
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(data, null, 2),
        },
      },
    };

    const res = await fetch(
      `https://api.github.com/gists/${this.gistId}`,
      {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) throw new Error(`Gist 上传失败：${res.status}`);
  }

  async download(): Promise<SerializedBookmarks | null> {
    if (!this.gistId) return null;

    const res = await fetch(
      `https://api.github.com/gists/${this.gistId}`,
      { headers: this.headers() }
    );

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Gist 下载失败：${res.status}`);

    const json = await res.json();
    const content = json.files?.[GIST_FILENAME]?.content;
    return content ? JSON.parse(content) : null;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: this.headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}