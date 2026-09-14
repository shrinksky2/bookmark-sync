# Bookmark Sync

跨浏览器书签同步插件，支持 Chrome、Edge、Firefox。

## 功能

- 基于 GitHub Gist 同步书签，无需自建服务器
- 一键上传 / 下载 / 覆盖上传 / 从云端下载
- 自动同步（可配置间隔）
- 跨电脑、跨浏览器同步
- 支持 WebDAV（规划中）
- 导入 / 导出（规划中）

## 安装

### 从源码构建

```bash
git clone https://github.com/shirnksky/bookmark-sync.git
cd bookmark-sync
pnpm install
pnpm build
```

构建产物在 `.output/chrome-mv3`，在 `chrome://extensions/` 中开启开发者模式，点击"加载已解压的扩展程序"，选择该目录。

### 使用

1. 打开设置页，填入 GitHub Token（需要 `gist` 权限）
2. 点"创建 Gist"，插件会自动创建或复用已有的 Gist
3. 保存配置，点"立即同步"

## 开发

```bash
pnpm install
pnpm dev
```

基于 [WXT](https://wxt.dev/) 框架。

## 技术栈

- WXT
- TypeScript
- webextension-polyfill
- GitHub Gist API

## 许可证

MIT
