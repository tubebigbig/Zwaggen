# 安裝與環境需求

## 先決條件

- **Node.js ≥ 20。** 用 `node --version` 確認。可從 [nodejs.org](https://nodejs.org) 或透過 `nvm` 安裝。
- **pnpm ≥ 10。** Zwaggen 是 pnpm monorepo。請用 `npm install -g pnpm` 或從 [pnpm.io](https://pnpm.io/installation) 安裝。
- **現代瀏覽器。** 以 Chromium 為核心的瀏覽器（Chrome、Edge、Brave、Arc）或最新的 Firefox 皆可。Safari 不支援 — 它缺少規格版本流程所依賴的部分 `showOpenFilePicker` / `showSaveFilePicker` API；退回的上傳 / 下載路徑仍可使用，但檔案控制代碼（file handle）流程無法運作。
- **Git**，用於 clone 專案。

## Clone 與安裝

```bash
git clone https://github.com/tubebigbig/Zwaggen.git
cd Zwaggen
pnpm install
```

## 執行應用程式（開發模式）

```bash
pnpm dev
```

Vite 會印出一個本機網址（預設是 `http://localhost:5173`）。在支援的瀏覽器中開啟它。應用程式會載入一份空的規格；[快速上手](/quickstart)會帶你建立第一份規格。

## 建置產品版本

```bash
pnpm build
```

會在 `apps/web/dist/` 底下產出靜態 bundle。任何靜態主機都能伺服 — 不需要伺服器端邏輯。

## 本機執行文件網站

```bash
pnpm docs:dev     # 開啟帶 HMR 的開發伺服器
pnpm docs:build   # 產出靜態網站
pnpm docs:preview # 預覽建置後的網站
```

## 選配：CORS proxy

如果你要打的 API 沒有送寬鬆的 CORS 標頭，可執行內建的輔助 proxy：

```bash
npx zwaggen-proxy
```

預設埠號為 `8787`。在應用程式的 proxy 設定裡指向它。詳情請見 [CORS Proxy](/guide/cors-proxy)。

## 疑難排解

- **`pnpm: command not found`** — 請全域安裝 pnpm（`npm install -g pnpm`），或啟用 corepack（`corepack enable`）。
- **安裝時出現 `Unsupported engine` 警告** — 檢查 Node 版本。`pnpm` 需要 Node ≥ 18，Zwaggen 則需要 ≥ 20。
- **`showOpenFilePicker is not a function`** — 你所使用的瀏覽器不支援 File System Access API。Firefox 在記憶體內使用沒有問題；但若需要「存到磁碟」的檔案控制代碼流程，請改用 Chromium 系列瀏覽器。
- **安裝卡在 `postinstall`** — 某個 workspace 可能正在下載 Playwright 瀏覽器。若只需要執行應用程式、不跑 e2e 測試，可執行 `pnpm --filter web install --ignore-scripts`。
