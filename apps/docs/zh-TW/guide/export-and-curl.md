---
description: 把請求匯出成 cURL 指令、OpenAPI 片段，或帶型別的 TypeScript 程式碼。
---

# 匯出與複製為 cURL

兩種把請求或整份規格搬出 Zwaggen 的方式。

## 匯出規格

- **規格資訊 → 匯出**（Spec Info → Export）。
- 三種格式：
  - **Zwaggen（`.zwaggen.json`）** — 規範格式，可以原封不動再匯入。進 git 就用這個。
  - **OpenAPI 3.1（JSON）** — 盡力轉換；跟 [OpenAPI 匯入](/zh-TW/guide/openapi-import) 同樣的限制反過來一樣適用。
  - **OpenAPI 3.1（YAML）** — 內容跟 JSON 一樣，只是格式不同。

規範 Zwaggen 格式才是真相來源。OpenAPI 匯出純粹是為了互通 — 再次匯入時，沒有 OpenAPI 對應的欄位可能會遺失。

### OpenAPI 輸出裡的資料夾與繼承

- **資料夾裡的型別**會以攤平的 schema key 匯出（例如 `auth/User` → `components.schemas.auth_User`），並加上 `x-folder: "auth"` vendor extension，讓 Zwaggen 在再次匯入時還原路徑。請見[資料夾](/zh-TW/guide/folders)。
- **有繼承的型別**會匯出成 `allOf`，每個父型別一個 `$ref`，加上一個包含子型別自己欄位的 inline object member（子型別沒加任何欄位時省略）。懂 `allOf` 的工具（Swagger UI、Redoc、大部分 codegen）都能正確渲染。請見[型別繼承](/zh-TW/guide/type-inheritance)。
- **資料夾裡的端點**會在 operation 上帶 `x-folder`。

不認得 `x-folder` 的第三方工具會把攤平後的 schema key 與 operation 上的註記當成不透明資料——不會影響渲染，只是它們的 UI 裡不會有資料夾分組。

## 複製為 cURL

![成功送出請求後執行面板的「複製為 cURL」按鈕，顯示「已複製」提示](/screenshots/copy-as-curl.png)

從執行面板：

- 送出之後，在 Response 內容上方點 **複製為 cURL**（Copy as cURL）。
- 剪貼簿會拿到一行可以直接貼到任何 shell 的指令。

從端點清單：

- 在端點上按右鍵 → **複製為 cURL**。會用執行面板目前的值（URL、標頭、內容）。

### 會被解析的東西

- 環境變數（`{{env.foo}}`）— 會解析成當前環境的值。擷取到的 token 也是存在環境變數裡，所以會一起被烘進指令。
- 認證預設 — 會以對應的標頭烘進指令（`Authorization: Bearer …`、basic 認證，或 API key 的標頭 / 查詢參數）。

### 關於安全

cURL 會包含每一個真實值 — token、密碼、API key。請把它當成憑證來對待：

- 不要貼進公開 issue 或 Slack 頻道。
- 不要 commit 進 git。
- 如果 cURL 外洩了，請輪替該憑證。

### 典型用途

- **在 shell 裡重現問題**。在瀏覽器以外再跑一次一樣的請求。
- **跟同事分享**，先把機密清掉再分享。
- **丟進 CI 腳本** 當成一次性的冒煙測試。（想要批量測試的話，請等 CI-mode CLI — repo TODO 已經追在清單上。）
