# OpenAPI 匯入

如果你已經有一份維護中的 OpenAPI 文件，可以用它來產生一份 Zwaggen 規格作為起點。

## 如何匯入

![Zwaggen 頂列的「匯入 OpenAPI」按鈕](/screenshots/openapi-import.png)

- 打開 **規格資訊**（Spec Info）（點擊規格標題）。
- 點擊 **匯入 OpenAPI**（Import OpenAPI）。
- 選擇 `.json`、`.yaml` 或 `.yml` 檔案。也支援拖拉上傳。

目前的規格會被取代。若想保留既有規格，請先匯出（見[匯出與 cURL](/guide/export-and-curl)）。

## 保留了什麼

- **規格標題** — 來自 `info.title`。
- **根網址** — 來自 `servers[0].url`。只會讀取第一個 server；詳見下方限制。
- **路徑與操作** — 每個 path + method 會成為一個 Zwaggen 端點。
- **參數** — 路徑 / 查詢 / 標頭 / cookie，帶必填旗標與型別。
- **請求內容** — 第一個 `application/json` 的內容結構會成為 Zwaggen 的內容型別。
- **回應** — 每一個有 JSON schema 的 `status` 會成為一個有型別的 Zwaggen 回應。
- **Schema** — `components.schemas.*` 會成為規格型別命名空間中的具名型別。
- **Tag** — operation 的 `tags[]` 會轉入；側欄據此分群。

## 目前會遺失的

- `x-*` 擴充 — 匯入時會被捨棄（在 repo 中追蹤為後續 TODO）。
- 第一個之外的 `servers[]` — 只有 `servers[0]` 會成為根網址。每環境 server 是規畫中的功能。
- bearer / basic / apiKey 以外的 `security` scheme — 可對應時就對應，否則忽略。
- `callbacks`、`webhooks`、`links` — 不會表示。
- union 上的 `discriminator` — union 會匯入，但 discriminator 提示不會儲存。
- `allOf` 組合 — 會被扁平化為合併後的 object（近似，請再驗證欄位）。
- 非 JSON 的請求 / 回應內容類型 — 不會匯入。

## 匯入之後

走一遍端點清單。有幾個常見要手動修補的地方：

- **缺回應型別** — 有些 OpenAPI 文件在 2xx 回應上省略 schema；請在端點編輯器中補上。
- **`required` 旗標有誤** — OpenAPI 的 `required` 是放在 object 層級，不是欄位層級；匯入器在一般情況下能正確翻譯，但帶有巢狀 `required` 陣列的 schema 有時需要再檢查一次。
- **指向已刪除 schema 的 ref** — 若原始文件有懸空的 `$ref`，你會看到型別建構器的刪除守門錯誤，直到你清除它們為止。

等端點看起來對了，存檔規格（File → Save As）就能得到一份可進 git 版本控制的 Zwaggen 規範格式 `.zwaggen.json`。
