---
description: 用一行 npx 指令在本機跑 Zwaggen。
---

# 安裝與環境需求

::: tip 不想安裝？
[**直接到 play.zwaggen.com 玩玩看**](https://play.zwaggen.com) — 同一個 App，不用安裝，也不提供 proxy 伺服器。你的規格只存在自己的瀏覽器裡。如果你需要測試被 CORS 封鎖的 API，或是想完全離線使用，再回到這頁照著安裝就好。
:::

## 先決條件

- **Node.js ≥ 20。** 用 `node --version` 確認版本。可以從 [nodejs.org](https://nodejs.org) 下載，或透過 `nvm` 安裝。
- **現代瀏覽器。** 以 Chromium 為核心的瀏覽器（Chrome、Edge、Brave、Arc）或最新的 Firefox 都可以。Safari 不支援 — 它沒有規格版本流程會用到的 `showOpenFilePicker` / `showSaveFilePicker` API；走上傳／下載的備援路徑仍然可以用，但依賴檔案控制代碼（file handle）的流程就會失效。

## 跑起來

```bash
npx @zwaggen/web
```

就這樣。`npx` 會下載已發佈的套件，用 `sirv` 在 `http://127.0.0.1:4173` 提供預先建置好的 SPA，然後在你預設的瀏覽器裡打開它。

### 選項

```bash
npx @zwaggen/web --port 8080        # 自訂埠號
npx @zwaggen/web --host 0.0.0.0     # 綁定所有網路介面（允許 LAN 連線）
npx @zwaggen/web --no-open          # 不要自動開啟瀏覽器
npx @zwaggen/web --help             # 顯示所有選項
```

按 `Ctrl+C` 停止伺服器。

## 跑 CLI

```bash
npx @zwaggen/cli --help
```

`@zwaggen/cli` 是用來批次執行請求、比對規格的搭配工具。詳情請見 CLI 指南。

## 選配：CORS proxy

如果你要打的 API 沒有送寬鬆的 CORS 標頭，你會需要一個本機 proxy。`@zwaggen/proxy` 之後會以 npm 套件的形式發佈；目前你可以自己跑一個 CORS proxy，或 clone 這個 repo 後跑裡面附的 proxy（做法請見 repo `README.md` 的貢獻者章節）。把 Zwaggen 的 proxy 設定指到你的 proxy 網址就行。詳情請見 [CORS Proxy](/zh-TW/guide/cors-proxy)。

## 疑難排解

- **安裝時出現 `unsupported engine` 警告** — 用 `node --version` 確認 Node ≥ 20。
- **`EADDRINUSE`** — 4173 埠已被佔用。改用 `npx @zwaggen/web --port <n>` 挑一個別的。
- **`showOpenFilePicker is not a function`** — 你的瀏覽器不支援 File System Access API。Firefox 純粹在記憶體裡操作沒有問題；如果需要「存到磁碟」的檔案控制代碼流程，請改用 Chromium 系列的瀏覽器。
- **瀏覽器沒有自動開啟** — 檢查你的 shell 歷史是不是有用到 `--no-open`；如果沒有加這個旗標，CLI 預設會自己開。
