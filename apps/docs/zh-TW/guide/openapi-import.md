---
description: 從既有的 OpenAPI 文件匯入，產出一份 Zwaggen 規格，並了解哪些內容會被保留。
---

# OpenAPI 匯入

如果你已經有一份維護中的 OpenAPI 文件，可以拿它直接產一份 Zwaggen 規格作為起點。

## 如何匯入

![Zwaggen 頂列的「匯入 OpenAPI」按鈕](/screenshots/openapi-import.png)

- 打開 **規格資訊**（Spec Info）（點一下規格標題）。
- 點 **匯入 OpenAPI**（Import OpenAPI）。
- 選一個 `.json`、`.yaml` 或 `.yml` 檔。也可以直接拖檔案進來。

目前的規格會被取代。想保留既有規格的話，請先匯出（見[匯出與 cURL](/zh-TW/guide/export-and-curl)）。

## 會被保留的東西

- **規格標題** — 來自 `info.title`。
- **Base URL** — 來自 `servers[0].url`。只會讀第一個 server；詳見下方限制。
- **路徑與操作** — 每個 path + method 會變成一個 Zwaggen 端點。
- **參數** — 路徑 / 查詢 / 標頭 / cookie，帶必填旗標與型別。
- **請求內容** — 第一個 `application/json` 的內容結構會變成 Zwaggen 的內容型別。
- **回應** — 每一個有 JSON schema 的 `status` 會變成一個有型別的 Zwaggen 回應。
- **Schema** — `components.schemas.*` 會變成規格型別命名空間裡的具名型別。
- **Tag** — operation 的 `tags[]` 會沿用；側欄會照著分群。

## 目前會遺失的東西

- `x-*` extension — 匯入時會被丟掉（repo 裡已有後續 TODO 追蹤）。
- 第一個之外的 `servers[]` — 只有 `servers[0]` 會拿來當 base URL。每環境的 server 還在規畫中。
- bearer / basic / apiKey 以外的 `security` scheme — 能對應就對應，否則忽略。
- `callbacks`、`webhooks`、`links` — 不會呈現。
- union 上的 `discriminator` — union 會匯入，但 discriminator 的提示不會留下。
- `allOf` 組合 — 會被扁平化成合併後的 object（近似處理，請再檢查欄位）。
- 非 JSON 的請求 / 回應內容類型 — 不會匯入。

## 匯入之後

先過一遍端點清單。有幾個常見要手動補的地方：

- **缺回應型別** — 有些 OpenAPI 文件在 2xx 回應上沒給 schema；在端點編輯器裡補上即可。
- **`required` 旗標有誤** — OpenAPI 的 `required` 是放在 object 層級，不是欄位層級；匯入器在一般情況下會正確翻譯，但帶有巢狀 `required` 陣列的 schema 有時要再確認一次。
- **指向已刪除 schema 的 ref** — 如果原始文件有懸空的 `$ref`，你會在型別建構器裡看到刪除守門的錯誤，直到你清乾淨為止。

等端點看起來都對了，存檔規格（File → Save As），你就拿到一份可以進 git 的 Zwaggen 規範格式 `.zwaggen.json`。
