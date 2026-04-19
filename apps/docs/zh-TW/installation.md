---
description: 在本機跑 Zwaggen 需要的環境、安裝步驟，以及如何啟動 Playground。
---

# 安裝與環境需求

::: tip 不想安裝？
[**直接到 play.zwaggen.com 玩玩看**](https://play.zwaggen.com) — 同一個 App，不用安裝，也不提供 proxy 伺服器。你的規格只存在自己的瀏覽器裡。如果你需要測試被 CORS 封鎖的 API，或是想完全離線使用，再回到這頁照著安裝就好。
:::

## 先決條件

- **Node.js ≥ 20。** 用 `node --version` 確認版本。可以從 [nodejs.org](https://nodejs.org) 下載，或透過 `nvm` 安裝。
- **pnpm ≥ 10。** Zwaggen 是 pnpm monorepo。用 `npm install -g pnpm`，或到 [pnpm.io](https://pnpm.io/installation) 照著裝。
- **現代瀏覽器。** 以 Chromium 為核心的瀏覽器（Chrome、Edge、Brave、Arc）或最新的 Firefox 都可以。Safari 不支援 — 它沒有規格版本流程會用到的 `showOpenFilePicker` / `showSaveFilePicker` API；走上傳／下載的備援路徑仍然可以用，但依賴檔案控制代碼（file handle）的流程就會失效。
- **Git**，用於 clone 這個專案。

## Clone 與安裝

```bash
git clone https://github.com/tubebigbig/Zwaggen.git
cd Zwaggen
pnpm install
```

## 跑起來（開發模式）

```bash
pnpm dev
```

Vite 會印出一個本機網址（預設是 `http://localhost:5173`）。用支援的瀏覽器打開它。App 會載入一份空的規格；[快速上手](/zh-TW/quickstart) 會帶你做出第一份。

## 建置產品版本

```bash
pnpm build
```

產物會輸出到 `apps/web/dist/`，純靜態的 bundle。任何靜態主機都能直接托管 — 不需要伺服器端邏輯。

## 在本機跑文件網站

```bash
pnpm docs:dev     # 開啟帶 HMR 的開發伺服器
pnpm docs:build   # 產出靜態網站
pnpm docs:preview # 預覽建置後的網站
```

## 選配：CORS proxy

如果你要打的 API 沒有送寬鬆的 CORS 標頭，可以跑內建的輔助 proxy：

```bash
npx zwaggen-proxy
```

預設埠號為 `8787`。在 App 的 proxy 設定裡指到它就行。詳情請見 [CORS Proxy](/zh-TW/guide/cors-proxy)。

## 疑難排解

- **`pnpm: command not found`** — 請全域安裝 pnpm（`npm install -g pnpm`），或啟用 corepack（`corepack enable`）。
- **安裝時出現 `Unsupported engine` 警告** — 檢查 Node 版本。`pnpm` 需要 Node ≥ 18，Zwaggen 則需要 ≥ 20。
- **`showOpenFilePicker is not a function`** — 你的瀏覽器不支援 File System Access API。Firefox 純粹在記憶體裡操作沒有問題；如果需要「存到磁碟」的檔案控制代碼流程，請改用 Chromium 系列的瀏覽器。
- **安裝卡在 `postinstall`** — 某個 workspace 可能正在下載 Playwright 瀏覽器。如果你只想跑 App、不跑 e2e 測試，可以改用 `pnpm --filter @zwaggen/web install --ignore-scripts`。
