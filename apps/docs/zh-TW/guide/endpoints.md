---
description: 在規格中定義端點的 method、URL、參數、標頭、請求內容與回應型別。
---

# 端點

端點描述一個 HTTP 操作，以及流經其中的型別。

![端點編輯器中設定查詢參數、標頭、Bearer 認證與 200、400 回應](/screenshots/endpoint-editor.png)

## Method 與 path

Method：`GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS`。

以 `:` 開頭的路徑片段會自動登記成路徑參數。輸入 `/users/:id/posts/:postId`，編輯器就會自動建兩列路徑參數，型別預設都是 `string`。

## 參數

編輯器有三個區塊：

- **路徑參數** — 一份 `ParamDef { name, required, type, description? }` 清單，從 path 自動建立；可以把型別改成 `string`、`integer` 等。
- **查詢參數** — 一個 object（內聯，或 `ref` 到具名 object 型別），不需要時也可以省略。
- **標頭參數** — 與查詢參數結構相同：一個 object，內聯或以 ref 引用。

**查詢參數與標頭參數是一個物件。** 每個端點的 `queryParams` 與 `headers` 不是內聯 object（直接在編輯器裡定義欄位），就是 `ref` 到一個具名 object 型別（讓多個端點共用，例如 `PaginationQuery = { page; limit }`）。每個欄位會被序列化成獨立的 query key（`?page=1&limit=20`）或獨立的請求標頭，符合 OpenAPI 3 的預設 `style=form, explode=true`。在每個區塊頂端切換 **None / Inline fields / Use shared type** 即可。

路徑參數仍維持位置順序的清單 — 它們對應 URL template 中的 `{name}` 佔位符，所以順序與名稱都重要。

## 請求內容

選填。在編輯器的 **Body type** 下拉選單中選擇三種內容類型之一：

- **JSON**(`application/json`) — 內容為一個 `TypeDef`，通常是對某個具名 object 的 `ref`。執行面板顯示 JSON 文字框，若型別帶有 `example` 會自動預填（見[型別建構器](/zh-TW/guide/type-builder)）。
- **URL-encoded 表單**(`application/x-www-form-urlencoded`) — 內容為一組扁平欄位（名稱、型別、是否必填）。執行面板顯示 key/value 列。執行器透過 `URLSearchParams` 序列化並自動設定 `Content-Type: application/x-www-form-urlencoded`。
- **Multipart 表單**(`multipart/form-data`) — 結構與 URL-encoded 相同,執行器改用 `FormData` 並由 `fetch()` 自動設定含 boundary 的 `Content-Type`。**v1 僅支援文字欄位**;檔案上傳將在後續版本提供。

切換 body 類型時會清空未使用的欄位形狀(JSON `TypeDef` 與 form 欄位分開儲存,以避免有損轉換)。

## 回應（Responses）

以狀態碼為 key。典型的 REST 端點會定義 `200`、`400`、`404`。每個回應都有一個 `type` — 也就是伺服器對該狀態碼承諾的回應結構。執行時驗證器會挑實際狀態碼對應的回應型別去驗內容。如果該狀態碼沒有定義對應的回應，驗證會被跳過（執行面板會顯示「unspecified status」的提示）。

## 認證（Auth）

四種預設：

- **None** — 請求直接送出。
- **Bearer** — 加 `Authorization: Bearer <token>` 標頭。
- **Basic** — 標準 HTTP Basic（`username:password` 以 base64 編碼）。
- **API key** — 以可設定名稱與值的標頭或查詢參數送出。

預設值以端點為單位設定，但會被環境覆蓋：每個環境都有自己的認證設定，有設就以環境的為準。請見[核心概念](/zh-TW/guide/core-concepts#environments)。

## 標籤（Tags）

標籤用來把端點在側欄分群。一個端點可以帶多個 tag。如果有 `users`、`orders`、`auth` 這三個 tag，端點清單就會收成三個可點開的區塊。輸入新 tag 就會建立；tag 索引是自動算出來的，不會額外存一份。

## 資料夾

端點也可以放在巢狀資料夾路徑裡（跟 tags 是正交的）。編輯器的 metadata 卡片有一個 **Folder** 輸入框——輸入例如 `users/admin` 就能把端點搬過去。一旦任何端點設定了 `folder`，側欄就會從 tag 分組切換到資料夾樹狀檢視。詳情請見[資料夾](/zh-TW/guide/folders)。

## 為什麼用 method + path 比對，而不是用 id

每個端點都有內部 id，但 id 純粹是實作細節 — 兩次存檔之間就有可能變。[規格差異](/zh-TW/guide/spec-diff)在比較兩份規格檔時，是拿 `(method, path)` 這個 pair 去比對端點，這樣即使 id 被換掉，也不會看起來像是「某個端點被刪掉又新增」。
