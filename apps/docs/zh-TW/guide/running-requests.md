---
description: 對真實伺服器執行規格中的端點,即時看到型別化回應被驗證。
---

# 執行請求

選擇一個端點，右側會出現執行面板。本頁說明執行面板本身；相鄰的 Assertions 分頁請見[斷言與串接](/guide/assertions-and-chaining)。

## Request 分頁

![POST 端點的執行面板中顯示標頭與 JSON 內容](/screenshots/run-panel-request.png)

- **Method + URL 預覽** 在最上方：method 徽章與完整展開的 URL（根網址 + path，並以目前啟用環境解析過 `{{env.*}}` 佔位符）。
- **路徑參數** — 每個以 `:` 開頭的路徑片段都有一列。輸入值；它們會即時被代入 URL 預覽中。
- **查詢參數** — 以 `?key=value` 附加。每項都可以開關啟用，無需刪除。
- **標頭** — 可編輯清單。來自環境的認證標頭會以灰階顯示（衍生的，在這裡不可編輯）。
- **內容** — 只有會帶內容的 method 才會顯示。輸入框會以內容型別的 `example` 預填（見[型別建構器](/guide/type-builder)）。JSON 會即時驗證。

### 佔位符

- `{{env.foo}}` — 以目前啟用環境中的 `foo` 變數取代。適合用在 API key、tenant ID，以及由[擷取](/guide/assertions-and-chaining#擷取-capture)寫入的值（擷取值會直接存到環境變數）。

佔位符會在送出前解析；URL 預覽會顯示解析後的結果。

## 送出

點擊 **送出**（Send）。會套用目前啟用環境的認證預設，發出請求，並自動切到 Response 分頁。

## Response 分頁

![Run panel 顯示綠色 200、type ok 以及驗證過的內容](/screenshots/run-panel-response.png)

- **狀態徽章** — 以 class 上色（2xx 綠、4xx 琥珀色、5xx 紅）。
- **延遲** — 從送出到收到第一個 byte 的毫秒數。
- **驗證徽章** — 綠色「Validates」或紅色「Invalid」並顯示不符欄位的數量。點擊會跳到第一個不符處。
- **內容** — 預設以美化過的 JSON 顯示；若 Content-Type 不是 JSON，可切換成 raw 或 `text/*` 呈現方式。
- **標頭** — 完整的回應標頭清單。
- **複製為 cURL**（Copy as cURL）— 剛剛這次請求的一行指令（見[匯出與 cURL](/guide/export-and-curl)）。

## CORS proxy 開關

現代瀏覽器會擋下沒有寬鬆 CORS 標頭的回應。若你的 API 沒有開放 CORS，打開執行面板頂端的 **Use proxy** 開關並把它指向正在執行的 `zwaggen-proxy`（預設 `http://localhost:8787`）。請見 [CORS Proxy](/guide/cors-proxy)。

## 每一次執行都會被記錄

每次成功送出都會落到[歷史紀錄](/guide/batch-and-history)中。你可以重新打開一筆舊執行、檢視當時送了什麼以及回收了什麼，然後再送一次同樣的請求。
