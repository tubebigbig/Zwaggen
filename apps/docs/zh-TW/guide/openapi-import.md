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
- **資料夾** — 帶有 `x-folder` vendor extension 的 schema 或 operation 會還原到對應路徑（例如 `components.schemas.auth_User` 加上 `x-folder: "auth"` 會變成 key 為 `auth/User` 的型別）。沒有 `x-folder` 的檔案會平鋪匯入；之後可以自己加資料夾。請見[資料夾](/zh-TW/guide/folders)。
- **繼承** — 帶一個以上 `$ref` 加上最多一個 inline object schema 的 `allOf` 會被還原成 `{ extends: [...refs], fields: inline.fields }`。只有多個 inline object、沒有 `$ref` 的 `allOf` 仍然會攤平（back-compat）。請見[型別繼承](/zh-TW/guide/type-inheritance)。
- **Operation 層級的 `x-*` extension** — operation 上的 `x-*` 鍵（如 `x-codeSamples`、`x-internal`）會存到端點上，匯出時原樣寫回。`x-folder` 仍照舊吃成 `endpoint.folder`，不會重複落到 extensions 裡。

## 目前會遺失的東西

- **info**、**schema**、**參數/回應** 層級的 `x-*` extension — 目前只有 operation 層級會保留。
- 第一個之外的 `servers[]` — 只有 `servers[0]` 會拿來當 base URL。每環境的 server 還在規畫中。
- bearer / basic / apiKey 以外的 `security` scheme — 能對應就對應，否則忽略。
- `callbacks`、`webhooks`、`links` — 不會呈現。
- union 上的 `discriminator` — union 會匯入，但 discriminator 的提示不會留下。
- `allOf` 裡含有多個 inline object 且沒有 `$ref` 的情況 — 會被扁平化成合併後的 object（為了相容歷史規格）。含 `$ref` 的 `allOf` 會改走型別繼承路徑，請見[型別繼承](/zh-TW/guide/type-inheritance)。
- 非 JSON 的請求 / 回應內容類型 — 不會匯入。

## 匯入之後

先過一遍端點清單。有幾個常見要手動補的地方：

- **缺回應型別** — 有些 OpenAPI 文件在 2xx 回應上沒給 schema；在端點編輯器裡補上即可。
- **`required` 旗標有誤** — OpenAPI 的 `required` 是放在 object 層級，不是欄位層級；匯入器在一般情況下會正確翻譯，但帶有巢狀 `required` 陣列的 schema 有時要再確認一次。
- **指向已刪除 schema 的 ref** — 如果原始文件有懸空的 `$ref`，你會在型別建構器裡看到刪除守門的錯誤，直到你清乾淨為止。

等端點看起來都對了，存檔規格（File → Save As），你就拿到一份可以進 git 的 Zwaggen 規範格式 `.zwag.json`。
