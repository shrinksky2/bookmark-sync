# Bookmark Sync

跨浏览器书签同步插件，支持 Chrome、Edge、Firefox。

通过 **GitHub Gist** 或 **WebDAV** 同步浏览器书签，无需自建服务器。

## 功能

- 支持 **GitHub Gist** 和 **WebDAV** 两种远程存储
- 一键上传 / 下载 / 覆盖上传 / 从云端下载
- 自动同步（可配置间隔）
- 跨电脑、跨浏览器同步
- 显示本地与远程书签数量
- 同步状态提示（成功 / 失败 / 上次同步时间）
- 导入 / 导出（规划中）

## 支持的浏览器

- Chrome / Edge（基于 Chromium）
- Firefox

## 安装

### 从源码构建

```bash
git clone https://github.com/shirnksky2/bookmark-sync.git
cd bookmark-sync
pnpm install
pnpm build
```

构建产物在 `.output/chrome-mv3`（Firefox 对应 `.output/firefox-mv2`）。

在 `chrome://extensions/` 中：

1. 开启右上角的"开发者模式"
2. 点击"加载已解压的扩展程序"
3. 选择构建产物目录

## 使用

### 方式一：GitHub Gist（推荐）

1. 打开 [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=gist&description=Bookmark%20Sync)，生成一个带 `gist` 权限的 Personal Access Token
2. 打开插件设置页，粘贴 Token
3. 点击"创建 Gist"，插件会自动创建或复用已有的 Gist
4. 点击"保存账号设置"
5. 在 popup 里点"立即同步"

其他设备：填入同一个 Token 和 Gist ID，保存后即可同步。

### 方式二：WebDAV

适用于自建 NAS（如群晖、威联通、Nextcloud、Seafile 等）或其他支持 WebDAV 的服务。

1. 在服务器上准备好一个目录，例如 `/dav/bookmark-sync/`
2. 打开插件设置页，切换"同步方式"为 **WebDAV**
3. 填入 Endpoint（目录地址）、用户名、密码
4. 点击"测试连接"，验证配置正确（目录不存在时会自动创建）
5. 点击"保存账号设置"

> **提示**：Endpoint 填到目录为止即可，末尾带或不带 `/` 均可，插件会自动拼接 `bookmarks.json`。  
> 若服务器开启了两步验证，请使用**应用专用密码**而非登录密码。

## 同步操作说明

插件提供三种同步入口：

| 操作 | 方向 | 说明 |
|---|---|---|
| **立即同步** | 双向 | 智能合并本地与远程 |
| **覆盖上传** | 本地 → 远程 | 用本地覆盖远程，远程原有内容会被替换 |
| **从云端下载** | 远程 → 本地 | 用远程覆盖本地，本地原有内容会被清空 |

"覆盖上传"和"从云端下载"属于强制操作，会先弹出确认框显示数量对比，执行前会自动保存快照。

## 开发

```bash
pnpm install
pnpm dev
```

基于 [WXT](https://wxt.dev/) 框架。`pnpm dev` 会自动打开浏览器并加载扩展。

### 目录结构

```
entrypoints/          # 扩展入口点
├── background.ts     # Service Worker：闹钟、消息处理
├── popup/            # 弹窗 UI
└── options/          # 设置页 UI
core/
├── bookmark/         # 书签读写
├── providers/        # 远程存储实现（Gist / WebDAV）
└── sync/             # 同步引擎、合并、快照
utils/                # 工具函数
```

## 技术栈

- [WXT](https://wxt.dev/) — 跨浏览器扩展开发框架
- TypeScript
- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) — 跨浏览器 API 兼容层
- GitHub Gist API
- WebDAV 协议

## 权限说明

| 权限 | 用途 |
|---|---|
| `bookmarks` | 读取和修改书签 |
| `storage` | 保存配置和同步状态 |
| `alarms` | 定时自动同步 |
| `notifications` | 同步异常时提醒用户 |
| `host_permissions` | 访问 GitHub API 及用户配置的 WebDAV 服务器 |

## 常见问题

**Q：Token 和密码安全吗？**

配置保存在浏览器自带的 `storage.sync` 中，由浏览器加密存储，不会发送到任何第三方。WebDAV 密码通过 Basic Auth 发送到你自己配置的服务器。建议使用 HTTPS 连接 WebDAV 服务器。

**Q：书签太多会怎样？**

Gist 单文件建议不超过 10 MB。若书签数量庞大，建议使用 WebDAV。

**Q：删除的书签为什么有时会"复活"？**

当前"立即同步"采用并集合并策略，删除操作需要通过"覆盖上传"强制执行。三路合并（能自动同步删除）正在开发中。

**Q：支持多设备同时同步吗？**

支持。但"立即同步"是并集合并，两台设备同时修改可能出现不可预期的结果。建议指定一台设备作为"主设备"，必要时用"覆盖上传"和"从云端下载"纠正。

## 许可证

MIT