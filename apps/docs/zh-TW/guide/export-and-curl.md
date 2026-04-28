---
description: 把請求匯出成 cURL 指令、OpenAPI 片段，或帶型別的 TypeScript 程式碼。
---

# 匯出與複製為 cURL

兩種把請求或整份規格搬出 Zwaggen 的方式。

## 匯出規格

- **規格資訊 → 匯出**（Spec Info → Export）。
- 三種格式：
  - **Zwaggen（`.zwag`）** — 規範格式，可以原封不動再匯入。進 git 就用這個。
  - **OpenAPI 3.1（JSON）** — 盡力轉換；跟 [OpenAPI 匯入](/zh-TW/guide/openapi-import) 同樣的限制反過來一樣適用。
  - **OpenAPI 3.1（YAML）** — 內容跟 JSON 一樣，只是格式不同。

規範 Zwaggen 格式才是真相來源。OpenAPI 匯出純粹是為了互通 — 再次匯入時，沒有 OpenAPI 對應的欄位可能會遺失。

### OpenAPI 輸出裡的資料夾與繼承

- **資料夾裡的型別**會以攤平的 schema key 匯出（例如 `auth/User` → `components.schemas.auth_User`），並加上 `x-folder: "auth"` vendor extension，讓 Zwaggen 在再次匯入時還原路徑。請見[資料夾](/zh-TW/guide/folders)。
- **有繼承的型別**會匯出成 `allOf`，每個父型別一個 `$ref`，加上一個包含子型別自己欄位的 inline object member（子型別沒加任何欄位時省略）。懂 `allOf` 的工具（Swagger UI、Redoc、大部分 codegen）都能正確渲染。請見[型別繼承](/zh-TW/guide/type-inheritance)。
- **資料夾裡的端點**會在 operation 上帶 `x-folder`。

不認得 `x-folder` 的第三方工具會把攤平後的 schema key 與 operation 上的註記當成不透明資料——不會影響渲染，只是它們的 UI 裡不會有資料夾分組。

### Bundle 結構 — markdown 永遠依資料夾分割，OpenAPI / JSON Schema 可以選擇

從 **Spec Info → Export** 下載的 bundle zip 結構如下：

- `spec.zwag` — 永遠放在根目錄。
- **Markdown** — 永遠用 `markdown/{folder}/{METHOD}_{path}.md` 的結構，每個端點一個檔案。沒有資料夾的端點直接放在 `markdown/` 底下。每個檔案的內容就跟你從彈窗 Markdown 分頁拿到的一樣（Info / Parameters / Success Response / Error Response）。
- **OpenAPI** — 預設是單一 `openapi.{json|yaml}`。在 Export 選單裡勾選 **依資料夾分割**，就會切成一個資料夾一個檔案：`openapi/{folder}.openapi.{json|yaml}`。每個檔案只包含這個資料夾底下的端點，加上它們遞迴引用到的型別。根層級的端點會落在 `openapi/_root.openapi.{json|yaml}`。
- **JSON Schema** — 一樣的結構：預設是單一 `schemas.json`。勾選 **依資料夾分割** 後，會變成 `schemas/{folder}.schemas.json` 一個資料夾一個檔。

「依資料夾分割」沒勾的時候，全規格單檔輸出維持不變——這個勾選只是附加選項。

## 個別端點、個別型別、整個資料夾匯出

上面那個「全規格 Export」很適合分享整份 API。如果只想分享單一端點、單一型別、或整個子系統（資料夾），每個列項旁的 **3 點選單** 都有一個專屬的 **Export** 彈窗，附格式分頁：

### 個別端點

把游標移到端點列 → 點 ⋯ → 選 Export。彈窗會出現 6 個分頁：

- **cURL** — 可以直接複製貼上的指令。Path / query / header 參數用 `{{name}}` 當佔位符，提醒接收者該填什麼。如果規格沒設 base URL，URL 部分會用 `{{base-url}}` 取代。
- **types.ts** — 這個端點所有引用到的型別（含遞迴的）對應的 TypeScript interface。
- **schemas.ts** — 同樣那組型別的 Zod schema。
- **client.ts** — 帶型別的 client 方法。會 import `./types` 跟 `./schemas`（前面兩個分頁），所以這三個檔案放一起就能編譯。
- **Markdown** — 人類可讀的端點簡介（Info / Parameters / Success Response / Error Response，附參數表格與 JSON 範例）。適合在聊天或 PR 審查時直接分享，對方不需要規格也不需要任何工具就能看懂。檔名格式為 `{METHOD}_{path-sanitized}.md`（例如 `GET_users_id.md`）。
- **openapi.json** — 一份合法的 OpenAPI 文件，只包含這個端點與它引用到的型別。

每個分頁都有 Copy + Download 按鈕。

### 個別型別

型別建構器列項的 3 點選單也是同一個。3 個分頁：TS interface / Zod schema / JSON Schema 片段。

### 資料夾

資料夾列的 3 點選單裡會看到 **Export folder**。4 個分頁：`types.ts` / `schemas.ts` / `client.ts` / `openapi.json`，涵蓋資料夾底下所有東西。適合分享 API 的某個子系統（「這是我們的 auth 資料夾」）。

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
