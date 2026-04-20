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

編輯器有四個區塊，每個都是一份 `ParamDef { name, required, type, description? }` 清單：

- **路徑參數** — 從 path 自動建立；可以把它們的型別改成 `string`、`integer` 等。
- **查詢參數** — 執行時以 `?key=value` 附在 URL 後面。
- **標頭參數** — 想納入合約、做成文件的一部分的請求標頭。
- **Cookie 參數** — 存起來的形式跟標頭一樣；送出時會拼進 `Cookie: …` 裡。

每個參數都可以 ref 到一個具名型別，或直接內聯定義（帶約束條件的 primitive）。

## 請求內容

選填。任何 `TypeDef` 都行 — 通常是對某個具名 object 的 `ref`。如果型別上帶有 `example`，執行面板會用這個 example 幫你預填內容（見[型別建構器](/zh-TW/guide/type-builder)）。

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
