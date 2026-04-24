---
description: 把規格裡的端點打到真實伺服器，即時看到帶型別的回應被驗證的過程。
---

# 執行請求

選一個端點，右側會出現執行面板。這頁講執行面板本身；旁邊的 Assertions 分頁請見[斷言與串接](/zh-TW/guide/assertions-and-chaining)。

## Request 分頁

![POST 端點的執行面板中顯示標頭與 JSON 內容](/screenshots/run-panel-request.png)

- **Method + URL 預覽** 在最上方：method 徽章加上完整展開的 URL（base URL + path，並以當前環境把 `{{env.*}}` 解開）。
- **路徑參數** — 每個 `:` 開頭的片段都有一列。輸入值後會即時代入 URL 預覽裡。
- **查詢參數** — 以 `?key=value` 附在 URL 後。每一項都可以單獨開關，不用刪掉。
- **標頭** — 可編輯清單。環境裡的認證標頭會以灰色顯示（衍生的，這裡不能改）。
- **內容** — 只有會帶內容的 method 才會顯示,編輯介面會依端點的[請求內容類型](/zh-TW/guide/endpoints#請求內容)切換:
  - **JSON**: 文字框會用內容型別的 `example` 預填(見[型別建構器](/zh-TW/guide/type-builder));JSON 會即時驗證。
  - **URL-encoded** / **Multipart**: key/value 列(每個宣告的 form 欄位一列)。不必輸入 JSON,直接填值即可。執行器會透過 `URLSearchParams` 或 `FormData` 序列化並自動設定正確的 `Content-Type`。

### 佔位符

- `{{env.foo}}` — 被當前環境的 `foo` 變數取代。適合放 API key、tenant ID，或由[擷取](/zh-TW/guide/assertions-and-chaining#擷取-capture)寫入的值（擷取出來的值會直接存到環境變數裡）。

佔位符會在送出前被解析；URL 預覽會顯示解析後的結果。

## 送出

點 **送出**（Send）。會套用當前環境的認證預設，送出請求，並自動切到 Response 分頁。

## Response 分頁

![Run panel 顯示綠色 200、type ok 以及驗證過的內容](/screenshots/run-panel-response.png)

- **狀態徽章** — 依 class 上色（2xx 綠、4xx 琥珀色、5xx 紅）。
- **延遲** — 從送出到第一個 byte 回來的毫秒數。
- **驗證徽章** — 綠色「Validates」或紅色「Invalid」並顯示不符欄位的數量。點下去會跳到第一個不符處。
- **內容** — 預設用美化過的 JSON 顯示；如果 Content-Type 不是 JSON，可以切成 raw 或 `text/*` 呈現。
- **標頭** — 完整的回應標頭清單。
- **複製為 cURL**（Copy as cURL）— 剛剛這次請求的一行指令（見[匯出與 cURL](/zh-TW/guide/export-and-curl)）。

## CORS proxy 開關

現代瀏覽器會擋掉沒送寬鬆 CORS 標頭的回應。如果你的 API 沒開放 CORS,打開執行面板頂端的 **Use proxy** 開關,請求就會走本機 proxy。自 v0.2.0 起,proxy 已經**內建在 `npx @zwaggen/web` 裡** — 跟 SPA 同一個 port,不用額外安裝或設定。(如果 proxy 要跑在不同機器,可以另外開 `npx zwaggen-proxy` 並把規格裡的 proxy URL 指過去。)完整說明請見 [CORS Proxy](/zh-TW/guide/cors-proxy)。

## 每一次執行都會被留下來

每次成功送出都會落到[歷史紀錄](/zh-TW/guide/batch-and-history)裡。你可以重新打開一筆舊執行、看當時送了什麼、收到什麼，然後再送一次同樣的請求。
