import type { UnifiedBookmark } from '@/utils/types';

/**
 * 转义 HTML 特殊字符（标题里可能包含 < > & " 等）
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 导出为 Netscape Bookmark HTML 格式
 * 兼容 Chrome / Edge / Firefox 的原生书签导入
 */
export function exportToHTML(bookmarks: UnifiedBookmark[]): string {
  // 按 parentId 分组
  const byParent = new Map<string | null, UnifiedBookmark[]>();
  for (const b of bookmarks) {
    const key = b.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(b);
  }
  // 每组的排序
  for (const list of byParent.values()) {
    list.sort((a, b) => a.index - b.index);
  }

  // 递归生成 DL 结构
  function renderChildren(parentId: string | null, indent: string): string {
    const items = byParent.get(parentId) ?? [];
    if (items.length === 0) return '';

    let html = '';
    for (const item of items) {
      if (item.url) {
        // 书签
        html += `${indent}<DT><A HREF="${escapeHtml(item.url)}">${escapeHtml(
          item.title
        )}</A>\n`;
      } else {
        // 文件夹
        html += `${indent}<DT><H3>${escapeHtml(item.title)}</H3>\n`;
        const inner = renderChildren(item.id, indent + '    ');
        if (inner) {
          html += `${indent}<DL><p>\n${inner}${indent}</DL><p>\n`;
        }
      }
    }
    return html;
  }

  const body = renderChildren(null, '    ');

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${body}</DL><p>
`;
}

/**
 * 导出为 JSON 格式（保留完整结构）
 */
export function exportToJSON(bookmarks: UnifiedBookmark[]): string {
  const data = {
    version: 1,
    exportedAt: Date.now(),
    source: 'bookmark-sync',
    bookmarks,
  };
  return JSON.stringify(data, null, 2);
}

/**
 * 生成带日期的文件名
 * 例：bookmark-sync-2025-09-14.html
 */
export function buildFilename(ext: 'html' | 'json'): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}`;
  return `bookmark-sync-${date}.${ext}`;
}

/**
 * 触发浏览器下载
 */
export function downloadFile(
  content: string,
  filename: string,
  mime: string
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 延迟释放，避免部分浏览器下载中断
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}