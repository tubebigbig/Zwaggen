# 匯出與複製為 cURL

兩種把請求或整份規格搬出 Zwaggen 的方式。

## 匯出規格

- **規格資訊 → 匯出**（Spec Info → Export）。
- 三種格式：
  - **Zwaggen（`.zwaggen.json`）** — 規範格式、可往返匯入。用它進 git 版控。
  - **OpenAPI 3.1（JSON）** — 盡力轉換；與 [OpenAPI 匯入](/guide/openapi-import) 同樣的限制反向成立。
  - **OpenAPI 3.1（YAML）** — 和 JSON 相同，只是格式不同。

規範 Zwaggen 格式才是事實來源。OpenAPI 匯出僅供互通 — 再次匯入時可能會遺失沒有 OpenAPI 對應的欄位。

## 複製為 cURL

![成功送出請求後執行面板的「複製為 cURL」按鈕，顯示「已複製」提示](/screenshots/copy-as-curl.png)

從執行面板：

- 送出之後，在 Response 內容上方點擊 **複製為 cURL**（Copy as cURL）。
- 剪貼簿會得到可直接貼到任何 shell 的一行指令。

從端點清單：

- 對端點按右鍵 → **複製為 cURL**。會使用執行面板目前的值（URL、標頭、內容）。

### 會被解析的內容

- 環境變數（`{{env.foo}}`）— 解析成目前啟用環境的值。
- chain 值（`{{chain.bar}}`）— 解析成最後一次擷取到的值。
- 認證預設 — 以對應的標頭烘進指令（`Authorization: Bearer …`、basic 認證，或 API key 標頭 / 查詢參數）。

### 關於安全

cURL 會包含每一個真實值 — token、密碼、API key。請把它當成憑證：

- 不要貼到公開 issue 或 Slack 頻道。
- 不要 commit 到 git。
- 如果 cURL 外洩了，請輪替該憑證。

### 典型用途

- **在 shell 中重現**。在瀏覽器之外再跑一次同一個請求。
- **和同事分享**，清除機密後再分享。
- **丟進 CI 腳本** 作為一次性的冒煙測試。（若要批量測試，請等 CI-mode CLI — 已在 repo TODO 中追蹤。）
