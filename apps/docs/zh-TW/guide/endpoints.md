# 端點

端點描述一個 HTTP 操作以及流經其中的型別。

![端點編輯器中設定查詢參數、標頭、Bearer 認證與 200、400 回應](/screenshots/endpoint-editor.png)

## Method 與 path

Method：`GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS`。

以 `:` 開頭的路徑片段會自動註冊為路徑參數。輸入 `/users/:id/posts/:postId` 會建立兩列路徑參數，預設型別都是 `string`。

## 參數

編輯器裡有四列，每一列都是一份 `ParamDef { name, required, type, description? }` 清單：

- **路徑參數** — 從 path 自動建立；你可以把它們的型別設為 `string`、`integer` 等。
- **查詢參數** — 執行時會以 `?key=value` 附加。
- **標頭參數** — 希望以合約一部分做文件化的請求標頭。
- **Cookie 參數** — 像標頭一樣儲存；送出時使用 `Cookie: …`。

每個參數都可以參照某個型別，或內聯定義型別（帶約束條件的原始型別）。

## 請求內容

選填。任何 `TypeDef` — 通常是對某個具名 object 的 `ref`。執行面板會在型別帶有 `example` 時以該範例預填內容（見[型別建構器](/guide/type-builder)）。

## 回應（Responses）

以狀態碼為 key。典型的 REST 端點會定義 `200`、`400`、`404`。每個回應都有一個 `type` — 伺服器對該狀態承諾的內容結構。執行時驗證器會挑選與實際狀態相符的回應型別來驗證內容。若該狀態碼沒有定義對應的回應，驗證會被略過（執行面板會顯示「unspecified status」警示）。

## 認證（Auth）

四種預設：

- **None** — 請求直接送出。
- **Bearer** — 夾帶 `Authorization: Bearer <token>` 標頭。
- **Basic** — 標準 HTTP Basic（`username:password` 以 base64 編碼）。
- **API key** — 以可設定名稱與值的標頭或查詢參數送出。

預設值以端點為單位設定，但會被環境覆蓋：每個環境帶有自己的認證，有設定時會勝出。請見[核心概念](/guide/core-concepts#environments)。

## 標籤（Tags）

標籤會把端點在側欄分群。一個端點可以帶多個標籤。若側欄有 `users`、`orders`、`auth` 這三個標籤，端點清單會被摺疊成三個可點擊區塊。輸入新標籤即可建立；標籤索引是計算出來的，不另外儲存。

## 為何以 method + path 比對，而非 id

每個端點都有內部 id，但 id 只是實作細節 — 兩次存檔之間可能會變。[規格差異](/guide/spec-diff)比較兩份規格檔案時，以 `(method, path)` 這對組合比對端點，這樣 id 被改掉也不會看起來像是一個端點被刪除又新增。
