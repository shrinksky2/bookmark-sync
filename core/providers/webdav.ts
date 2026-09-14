import type { SerializedBookmarks } from '@/utils/types';
import type { StorageProvider } from './provider';

const FILENAME = 'bookmarks.json';

export class WebDAVProvider implements StorageProvider {
  private dirUrl: string;
  private fileUrl: string;
  private authValue: string;

  constructor(
    rawUrl: string,
    private username: string,
    private password: string
  ) {
    this.dirUrl = this.normalizeDir(rawUrl);
    this.fileUrl = this.dirUrl + FILENAME;
    this.authValue = WebDAVProvider.buildAuthHeader(username, password);
  }

  /**
   * 保证目录 URL 以 / 结尾
   */
  private normalizeDir(url: string): string {
    const trimmed = url.trim();
    return trimmed.endsWith('/') ? trimmed : trimmed + '/';
  }

  /**
   * 生成 Basic Auth 头
   * 处理非 ASCII 字符（用户名/密码可能是中文）
   */
  private static buildAuthHeader(username: string, password: string): string {
    const raw = `${username}:${password}`;
    const encoded = btoa(unescape(encodeURIComponent(raw)));
    return `Basic ${encoded}`;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: this.authValue,
      ...(extra ?? {}),
    };
  }

  /**
   * 把 HTTP 状态码转成人类可读的错误信息（用于上传/下载）
   */
  private describeError(action: string, status: number): string {
    switch (status) {
      case 401:
        return `WebDAV ${action}失败：用户名或密码错误（401）`;
      case 403:
        return `WebDAV ${action}失败：无权限访问该路径（403）`;
      case 404:
        return `WebDAV ${action}失败：路径不存在（404）`;
      case 405:
        return `WebDAV ${action}失败：服务器不允许该操作（405）`;
      case 409:
        return `WebDAV ${action}失败：目录不存在或冲突（409）`;
      case 507:
        return `WebDAV ${action}失败：存储空间不足（507）`;
      default:
        return `WebDAV ${action}失败：HTTP ${status}`;
    }
  }

  // ========== 连接测试与目录准备 ==========

  /**
   * 接口方法：返回 boolean，保持 StorageProvider 兼容
   */
  async testConnection(): Promise<boolean> {
    const res = await this.testAndPrepare();
    return res.ok;
  }

  /**
   * 详细版连接测试：认证 + 目录准备
   * 返回 { ok, message }，UI 直接展示 message
   */
  async testAndPrepare(): Promise<{ ok: boolean; message: string }> {
    try {
      // 1) 对目录发 PROPFIND 判断状态
      const dirRes = await fetch(this.dirUrl, {
        method: 'PROPFIND',
        headers: this.headers({ Depth: '0' }),
      });

      // 207 / 200 = 目录已存在
      if (dirRes.status === 207 || dirRes.ok) {
        return { ok: true, message: '连接成功，目录已存在' };
      }

      // 401 = 认证失败
      if (dirRes.status === 401) {
        return { ok: false, message: '认证失败：用户名或密码错误' };
      }

      // 403 = 无权限
      if (dirRes.status === 403) {
        return { ok: false, message: '无权限访问该路径' };
      }

      // 404 = 目录不存在，尝试创建
      if (dirRes.status === 404) {
        return await this.tryCreateDir();
      }

      // 其他状态码：可能服务器不支持 PROPFIND，退回 GET 判断
      return await this.fallbackCheck();
    } catch (e) {
      return {
        ok: false,
        message: `无法连接到服务器：${(e as Error).message}`,
      };
    }
  }

  /**
   * 部分服务器不支持 PROPFIND，退回 GET 判断
   * - GET 文件返回 200 → 文件存在，说明目录通
   * - GET 文件返回 404 → 不能确定是目录不存在还是文件不存在
   *   尝试 MKCOL 建目录，成功或"已存在"都算通
   */
  private async fallbackCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const fileRes = await fetch(this.fileUrl, {
        method: 'GET',
        headers: this.headers(),
      });

      if (fileRes.ok) {
        return { ok: true, message: '连接成功，远程文件已存在' };
      }

      if (fileRes.status === 401) {
        return { ok: false, message: '认证失败：用户名或密码错误' };
      }

      if (fileRes.status === 403) {
        return { ok: false, message: '无权限访问该路径' };
      }

      if (fileRes.status === 404) {
        // 文件不存在，尝试建目录
        return await this.tryCreateDir();
      }

      return {
        ok: false,
        message: `服务器返回异常：HTTP ${fileRes.status}`,
      };
    } catch (e) {
      return {
        ok: false,
        message: `无法连接到服务器：${(e as Error).message}`,
      };
    }
  }

  /**
   * 尝试创建目录
   */
  private async tryCreateDir(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(this.dirUrl, {
        method: 'MKCOL',
        headers: this.headers(),
      });

      // 201 = 创建成功
      if (res.status === 201) {
        return { ok: true, message: '连接成功，已自动创建目录' };
      }
      // 405 = 已存在（并发场景），也算成功
      if (res.status === 405) {
        return { ok: true, message: '连接成功，目录已存在' };
      }
      // 409 = 父目录不存在
      if (res.status === 409) {
        return {
          ok: false,
          message: '父目录不存在，请先在服务器上手动创建上级目录',
        };
      }
      if (res.status === 401) {
        return { ok: false, message: '认证失败：用户名或密码错误' };
      }
      if (res.status === 403) {
        return { ok: false, message: '无权限创建目录' };
      }
      return {
        ok: false,
        message: `无法创建目录：HTTP ${res.status}`,
      };
    } catch (e) {
      return {
        ok: false,
        message: `创建目录失败：${(e as Error).message}`,
      };
    }
  }

  // ========== 上传 / 下载 ==========

  /**
   * 确保目录存在（在上传前调用）
   */
  private async ensureDir(): Promise<void> {
    const exists = await this.dirExists();
    if (exists) return;

    const res = await fetch(this.dirUrl, {
      method: 'MKCOL',
      headers: this.headers(),
    });

    // 201 创建成功；405 已存在，都算 OK
    if (res.status !== 201 && res.status !== 405) {
      throw new Error(
        `无法创建目录：HTTP ${res.status}，请先在服务器上手动创建该目录`
      );
    }
  }

  /**
   * 检查目录是否存在
   */
  private async dirExists(): Promise<boolean> {
    try {
      const res = await fetch(this.dirUrl, {
        method: 'PROPFIND',
        headers: this.headers({ Depth: '0' }),
      });
      if (res.status === 207 || res.ok) return true;
      // 404 明确表示不存在；其他情况保守认为"存在"，让 PUT 去报错
      return res.status !== 404;
    } catch {
      return false;
    }
  }

  async upload(data: SerializedBookmarks): Promise<void> {
    // 先确保目录存在
    await this.ensureDir();

    const res = await fetch(this.fileUrl, {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data, null, 2),
    });

    if (!res.ok) {
      throw new Error(this.describeError('上传', res.status));
    }
  }

  async download(): Promise<SerializedBookmarks | null> {
    const res = await fetch(this.fileUrl, {
      method: 'GET',
      headers: this.headers(),
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(this.describeError('下载', res.status));
    }

    const text = await res.text();
    if (!text.trim()) return null;

    try {
      return JSON.parse(text) as SerializedBookmarks;
    } catch {
      throw new Error('远程文件不是有效的 JSON，可能已损坏');
    }
  }
}