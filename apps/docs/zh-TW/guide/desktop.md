---
title: Zwaggen Desktop
description: 跨平台的 Electron 應用程式,用於編輯規格與執行不受 CORS 限制的請求 — 即將推出。
---

# Zwaggen Desktop

::: tip 即將推出
Zwaggen Desktop 正在積極開發中,即將推出。請關注 [GitHub 儲存庫](https://github.com/tubebigbig/Zwaggen) 以取得發布消息。
:::

原生桌面應用程式,可以編輯規格並對任何 API 執行請求,**完全不受 CORS 限制**。網頁版 [Zwaggen Web](https://play.zwaggen.com) 適合瀏覽規格建構介面與產生規格,但所有跨來源請求都會被瀏覽器的 CORS 機制阻擋 — 多數 API 在沒有明確的允許清單規則時都會拒絕。Zwaggen Desktop 透過作業系統的網路層執行請求,與 curl 或 Postman 的運作方式相同。

## 為什麼你會想要它

- **無 CORS 限制的 API 測試** — 端點指向任何 URL 直接執行。不需要 proxy、不需要瀏覽器擴充、不需要伺服器端的允許清單。請求送出方式與 `curl` 相同。
- **原生檔案對話框** — 用作業系統真正的開啟 / 儲存介面操作 `.zwag` 規格檔。
- **`.zwag` 檔案關聯** — 在 Finder / 檔案總管中雙擊規格檔即可在 Zwaggen 中開啟。
- **檔案選單中的最近開啟** — 與作業系統的最近文件介面整合(macOS dock 右鍵選單、Windows jump list)。
- **跨平台** — macOS(Intel + Apple Silicon)、Windows、Linux。
- **本機優先,無遙測** — 你的規格只存在本機,不會回傳任何資料。

## 在桌面版推出之前

請使用 [Zwaggen Web](https://play.zwaggen.com) 編輯規格與執行示範請求,以及 [`@zwaggen/cli`](/zh-TW/installation) 進行無介面 / CI 執行。兩者今天都可使用。
