---
title: Zwaggen Desktop
description: 跨平台的 Electron 應用程式，用於編輯規格與執行不受 CORS 限制的請求 — 即將推出。
---

# Zwaggen Desktop

::: tip 即將推出
Zwaggen Desktop 正在積極開發中。本機開發測試的階段（slice 1–4）已於 2026-04-23 完成，但下載用的二進位檔尚未可用 — release 工作流程與程式碼簽署的階段尚未完成。**請關注 [GitHub 儲存庫](https://github.com/tubebigbig/Zwaggen) 以取得發布資訊。**
:::

原生桌面應用程式，可以編輯規格並對任何 API 執行請求，**完全不受 CORS 限制**。網頁版 [Zwaggen Web](https://play.zwaggen.com) 適合瀏覽規格建構介面與產生規格，但所有跨來源請求都會被瀏覽器 CORS 機制阻擋 — 多數 API 在沒有明確的允許清單規則時都會拒絕。Zwaggen Desktop 透過作業系統的網路層執行請求，與 curl 或 Postman 的運作方式相同。

## 即將推出的功能

- **無 CORS 限制的請求執行** — 所有 HTTP 請求都透過 Electron 主行程進行，完全繞過瀏覽器的 CORS。
- **原生檔案對話框** — 使用作業系統真正的開啟 / 儲存對話框。
- **`.zwag` 檔案關聯** — 在 Finder / 檔案總管中雙擊規格檔即可開啟。
- **最近開啟選單** — 檔案 → 最近開啟，以磁碟方式持久化，與作業系統的最近文件介面整合（macOS dock 右鍵選單、Windows jump list）。
- **嚴格的安全基準** — 渲染程序使用 context isolation 與 sandbox，UI 端無法存取 Node，渲染程序也不會發出對外網路請求。
- **跨平台** — macOS（Intel + Apple Silicon）、Windows、Linux。

## 試用開發中的版本（開發者）

如果你想今天就試用 Zwaggen Desktop，可以從原始碼建置。**這是給體驗中功能的開發者使用**，不適合一般使用者：

```bash
git clone https://github.com/tubebigbig/Zwaggen.git
cd Zwaggen
pnpm install
pnpm --filter @zwaggen/web build
pnpm --filter @zwaggen/desktop run release
```

產生的檔案會放在 `apps/desktop/release/`。這些是**未簽署**的，啟動時會觸發 Gatekeeper / SmartScreen 警告。當官方簽署版本完成後，一般使用者的安裝說明會放在此頁。

## 在桌面版推出之前

請使用 [Zwaggen Web](https://play.zwaggen.com) 編輯規格與執行示範請求，以及 [`@zwaggen/cli`](/zh-TW/installation) 進行無介面 / CI 執行。兩者今天都可使用。
